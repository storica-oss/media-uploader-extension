import { createClient } from './ic-oss-client.js'
import { loadQueue, saveQueue } from './queue-store.js'
import { detectUrlType, formatBytes, importRemoteMedia, LIMITS, saveLink, uploadFile } from './upload.js'
import { isBound, loadSettings } from './settings.js'
import './style.css'

const app = document.querySelector('#app')
const pageMode = document.body.dataset.appMode === 'page'
let settings = await loadSettings()
let client
let queue = []
let currentAbort
let persistTimer

app.innerHTML = `
  <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
  <header class="topbar">
    <a class="brand" href="https://storica.my" target="_blank" rel="noreferrer">
      <img src="./storica-mark.svg" alt="Storica"/><span>STORICA</span><small>IC OSS</small>
    </a>
    <div class="header-actions"><span id="connection" class="connection">未连接</span><button id="settings" class="icon-button" title="设置">⚙</button></div>
  </header>
  <main class="shell">
    <section class="hero">
      <div><span class="eyebrow">MEDIA UPLOADER / 01</span><h1>把素材投递到<br><em>你的链上云。</em></h1><p>图片、MP4 视频和网页链接，直接进入你的 IC OSS。</p></div>
      <div class="hero-mark" aria-hidden="true">↗</div>
    </section>
    <section class="drop-card" id="drop-zone">
      <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4" multiple hidden>
      <div class="drop-icon">＋</div><strong>拖拽文件到这里</strong><span>或 <button id="choose-files" class="text-button">选择文件</button></span>
      <small>JPEG · PNG · WebP · GIF · MP4</small>
    </section>
    <section class="link-card">
      <div class="section-label"><span class="eyebrow">MEDIA UPLOADER / 02</span><span>REMOTE OR LINK FILE</span></div>
      <div class="link-row"><input id="url-input" type="url" placeholder="粘贴图片、MP4 或网页链接…"><button id="add-current" class="quiet-button" title="加入当前标签页">当前页</button><button id="add-link" class="primary-button">加入队列</button></div>
      <p class="hint">媒体链接会自动抓取原文件；普通链接会保存为一个 .url.txt 文件。也可以直接粘贴截图。</p>
    </section>
    <section class="queue-section">
      <div class="section-heading"><div><span class="eyebrow">MEDIA UPLOADER / 03</span><h2>上传队列 <span id="queue-count">0</span></h2></div><button id="clear-queue" class="quiet-button">清空</button></div>
      <div id="queue" class="queue"><div class="empty-queue"><span>○</span><p>队列是空的</p><small>添加一些内容，开始你的第一批上链素材</small></div></div>
    </section>
    <section class="action-bar"><div><strong id="queue-summary">准备就绪</strong><small id="status">尚未开始上传</small></div><div class="action-buttons"><button id="cancel-upload" class="quiet-button" hidden>停止</button><button id="start-upload" class="primary-button large">开始上传 <span>↗</span></button></div></section>
  </main>
  <footer><span>直连 IC OSS Bucket · access token 仅保存在本机</span><a id="open-dashboard" href="./uploader.html">打开完整上传器 ↗</a></footer>
`

const els = {
  connection: document.querySelector('#connection'), fileInput: document.querySelector('#file-input'), dropZone: document.querySelector('#drop-zone'),
  urlInput: document.querySelector('#url-input'), queue: document.querySelector('#queue'), queueCount: document.querySelector('#queue-count'),
  queueSummary: document.querySelector('#queue-summary'), status: document.querySelector('#status'), start: document.querySelector('#start-upload'), cancel: document.querySelector('#cancel-upload')
}

document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage())
document.querySelector('#choose-files').addEventListener('click', () => els.fileInput.click())
els.fileInput.addEventListener('change', () => {
  addFiles([...els.fileInput.files])
  els.fileInput.value = ''
})
els.dropZone.addEventListener('click', (event) => {
  if (event.target.closest('button')) return
  els.fileInput.click()
})
document.querySelector('#add-link').addEventListener('click', addUrl)
document.querySelector('#add-current').addEventListener('click', addCurrentPage)
document.querySelector('#open-dashboard').addEventListener('click', (event) => {
  if (pageMode) return
  event.preventDefault()
  chrome.tabs.create({ url: chrome.runtime.getURL('uploader.html') }).catch(() => {})
})
els.urlInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') addUrl() })
document.querySelector('#clear-queue').addEventListener('click', clearQueue)
els.start.addEventListener('click', processQueue)
els.cancel.addEventListener('click', () => currentAbort?.abort(new Error('上传已停止')))
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') processQueue()
})
document.addEventListener('paste', handlePaste)
els.dropZone.addEventListener('dragover', (event) => { event.preventDefault(); els.dropZone.dataset.dragging = 'true' })
els.dropZone.addEventListener('dragleave', () => { delete els.dropZone.dataset.dragging })
els.dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  delete els.dropZone.dataset.dragging
  const files = [...event.dataTransfer.files]
  if (files.length) {
    addFiles(files)
    return
  }
  const droppedText = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')
  const droppedUrl = droppedText.split(/\r?\n/).map((item) => item.trim()).find((item) => /^https?:\/\//i.test(item))
  if (droppedUrl) addUrl(droppedUrl)
})

document.querySelector('#open-dashboard').hidden = pageMode
if (pageMode) document.title = 'IC OSS Uploader'
const params = new URLSearchParams(location.search)
queue = await restoreQueue()
if (params.get('url')) {
  els.urlInput.value = params.get('url')
  addUrl(params.get('url'), params.get('kind'), params.get('title'))
  history.replaceState({}, '', location.pathname)
}
await refreshConnection()

function addFiles(files) {
  const rejected = []
  for (const file of files) {
    const category = fileCategory(file)
    if (!category) {
      rejected.push(`${file.name}（格式不支持）`)
      continue
    }
    if (!file.size || file.size > LIMITS[category]) {
      rejected.push(`${file.name}（超过 ${formatBytes(LIMITS[category])}）`)
      continue
    }
    const preview = isImageFile(file) ? URL.createObjectURL(file) : ''
    queue.push({ id: crypto.randomUUID(), kind: 'file', label: file.name, detail: formatBytes(file.size), file, preview, status: 'ready', progress: 0 })
  }
  if (rejected.length) setStatus(`${rejected.slice(0, 2).join('、')}${rejected.length > 2 ? ` 等 ${rejected.length} 个文件未加入` : '未加入'}`)
  schedulePersist()
  render()
}

function addUrl(value = els.urlInput.value, forcedKind = '', forcedTitle = '') {
  const url = String(value || '').trim()
  if (!url) return setStatus('先粘贴一个链接')
  const values = url.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  if (values.length > 1) {
    values.forEach((item) => addUrl(item, forcedKind, forcedTitle))
    if (value === els.urlInput.value) els.urlInput.value = ''
    setStatus(`已加入 ${values.length} 条链接`)
    return
  }
  let parsed
  try { parsed = new URL(url) } catch { return setStatus('链接格式不正确') }
  if (!/^https?:$/.test(parsed.protocol)) return setStatus('只支持 http(s) 链接')
  const kind = forcedKind || detectUrlType(url)
  queue.push({ id: crypto.randomUUID(), kind, label: forcedTitle || parsed.hostname, detail: url, url, title: forcedTitle, status: 'ready', progress: 0 })
  if (value === els.urlInput.value) els.urlInput.value = ''
  schedulePersist()
  render()
}

async function addCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url || !/^https?:$/.test(new URL(tab.url).protocol)) return setStatus('当前页面不是可保存的 http(s) 页面')
  addUrl(tab.url, 'link', tab.title || '')
}

function handlePaste(event) {
  const files = [...(event.clipboardData?.files || [])]
  if (files.length) {
    event.preventDefault()
    addFiles(files)
    setStatus(`已从剪贴板加入 ${files.length} 个文件`)
    return
  }
  const text = event.clipboardData?.getData('text/plain')?.trim() || ''
  if (/^https?:\/\//i.test(text) && !event.target.closest('input, textarea')) {
    event.preventDefault()
    addUrl(text)
    setStatus('已从剪贴板加入链接')
  }
}

function clearQueue() {
  if (queue.some((item) => item.status === 'uploading')) return
  queue.forEach((item) => { if (item.preview) URL.revokeObjectURL(item.preview) })
  queue = []
  schedulePersist()
  render()
}

async function refreshConnection() {
  settings = await loadSettings()
  const bound = isBound(settings)
  els.connection.textContent = bound ? `● ${settings.bucketLabel || settings.bucket}` : '未连接'
  els.connection.dataset.state = bound ? 'connected' : 'idle'
  client = null
}

async function processQueue() {
  if (currentAbort) return
  if (!queue.length || queue.every((item) => item.status === 'done')) return setStatus('队列中没有待上传内容')
  if (!isBound(settings)) return setStatus('请先在设置中绑定 IC OSS Bucket 与 access token')
  els.start.disabled = true
  els.cancel.hidden = false
  currentAbort = new AbortController()
  try {
    client ||= await createClient(settings.bucket, settings.accessToken)
    for (const item of queue) {
      if (item.status === 'done') continue
      item.status = 'uploading'; item.progress = 0; schedulePersist(); render()
      try {
        let result
        if (item.kind === 'file') result = await uploadFile({ client, file: item.file, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
        else if (item.kind === 'image' || item.kind === 'video') result = await importRemoteMedia({ client, url: item.url, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
        else if (item.kind === 'auto') {
          try {
            result = await importRemoteMedia({ client, url: item.url, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
          } catch (error) {
            if (!/不是支持的图片或 MP4/.test(error.message || '')) throw error
            result = await saveLink({ client, url: item.url, title: item.title || item.label, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
          }
        } else result = await saveLink({ client, url: item.url, title: item.title || item.label, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
        item.status = 'done'; item.progress = 100; item.result = result
      } catch (error) {
        if (currentAbort.signal.aborted) {
          item.status = 'ready'; item.error = ''
          schedulePersist()
          render()
          break
        }
        item.status = 'error'; item.error = error.message || String(error)
      }
      schedulePersist()
      render()
    }
    setStatus(currentAbort.signal.aborted ? '上传已停止，队列内容仍保留' : queue.some((item) => item.status === 'error') ? '部分任务需要重试' : '全部素材已写入 IC OSS')
  } catch (error) { setStatus(error.message || '上传失败') }
  finally { els.start.disabled = false; els.cancel.hidden = true; currentAbort = null; render() }
}

function updateProgress(item, progress) {
  item.progress = Number(progress.percent) || 0
  item.phase = progress.phase === 'hashing' ? '校验中' : progress.phase === 'fetching' ? '读取中' : progress.phase === 'committing' ? '提交中' : '上传中'
  render()
}

function render() {
  els.queueCount.textContent = String(queue.length)
  const done = queue.filter((item) => item.status === 'done').length
  els.queueSummary.textContent = queue.length ? `${done} / ${queue.length} 已完成` : '准备就绪'
  els.queue.innerHTML = queue.length ? queue.map(renderItem).join('') : '<div class="empty-queue"><span>○</span><p>队列是空的</p><small>添加一些内容，开始你的第一批上链素材</small></div>'
  els.queue.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    const removed = queue.find((item) => item.id === button.dataset.remove)
    if (removed?.preview) URL.revokeObjectURL(removed.preview)
    queue = queue.filter((item) => item.id !== button.dataset.remove)
    schedulePersist()
    render()
  }))
  els.queue.querySelectorAll('[data-retry]').forEach((button) => button.addEventListener('click', () => {
    if (currentAbort) return
    const item = queue.find((candidate) => candidate.id === button.dataset.retry)
    if (!item) return
    item.status = 'ready'
    item.error = ''
    schedulePersist()
    render()
    processQueue()
  }))
}

function renderItem(item) {
  const icon = item.kind === 'video' ? '▶' : item.kind === 'image' || item.kind === 'file' ? '▧' : '↗'
  const resultId = item.result?.asset?.id ? `File #${item.result.asset.id}` : ''
  const status = item.status === 'done' ? `已完成${resultId ? ` · ${resultId}` : ''}` : item.status === 'error' ? item.error : item.status === 'uploading' ? `${item.phase || '上传中'} ${item.progress}%` : item.detail
  const visual = item.preview ? `<img class="item-preview" src="${escapeHtml(item.preview)}" alt="">` : `<div class="item-icon item-${item.kind}">${icon}</div>`
  const retryButton = item.status === 'error' ? `<button class="retry-button" data-retry="${item.id}">重试</button>` : ''
  return `<article class="queue-item" data-state="${item.status}">${visual}<div class="item-copy"><strong title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</strong><small title="${escapeHtml(status)}">${escapeHtml(status)}</small>${item.status === 'uploading' ? `<div class="progress"><i style="width:${item.progress}%"></i></div>` : ''}</div>${retryButton}<button class="remove-button" data-remove="${item.id}" aria-label="移除">×</button></article>`
}

function setStatus(message) { els.status.textContent = message }
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) }
function isImageFile(file) { return fileCategory(file) === 'image' }
function fileCategory(file) {
  const type = String(file.type || '').split(';')[0].trim().toLowerCase()
  if (['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(type)) return 'image'
  if (type === 'video/mp4') return 'video'
  const name = String(file.name || '')
  if (/\.(?:jpe?g|png|webp|avif|gif)$/i.test(name)) return 'image'
  if (/\.mp4$/i.test(name)) return 'video'
  return ''
}
async function restoreQueue() {
  const saved = await loadQueue()
  return saved.map((item) => ({
    ...item,
    preview: item.file && isImageFile(item.file) ? URL.createObjectURL(item.file) : ''
  }))
}
function schedulePersist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => saveQueue(queue), 80)
}

render()
