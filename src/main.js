import { createClient } from './ic-oss-client.js'
import { loadQueue, saveQueue } from './queue-store.js'
import { CATEGORY_LABELS, classifyFile, detectUrlType, fileCategory, formatBytes, importRemoteMedia, LIMITS, saveLink, SUPPORTED_FORMAT_SUMMARY, UPLOAD_ACCEPT, uploadFile } from './upload.js'
import { isBound, loadSettings, saveSettings } from './settings.js'
import './style.css'

const app = document.querySelector('#app')
const pageMode = document.body.dataset.appMode === 'page'
let settings = await loadSettings()
let client
let queue = []
let currentAbort
let persistTimer
let destination = { id: 0, name: '根目录', path: ['根目录'] }
let folderPickerOpen = false
let folderPickerPath = [{ id: 0, name: '根目录' }]
let folderPickerFolders = []
let folderPickerLoading = false
let folderPickerError = ''

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
      <div><span class="eyebrow">MEDIA UPLOADER / 01</span><h1>把素材投递到<br><em>你的链上云。</em></h1><p>图片、视频、音乐、游戏 ROM 和电子书，直接进入你的 IC OSS。</p></div>
      <div class="hero-mark" aria-hidden="true">↗</div>
    </section>
    <section class="destination-card">
      <div class="destination-copy"><span class="eyebrow">UPLOAD DESTINATION</span><strong id="destination-label">根目录</strong><small id="destination-path">根目录 · 新加入的素材将上传到这里</small></div>
      <div class="destination-actions"><button id="choose-destination" class="quiet-button" type="button">选择目录</button><button id="create-destination" class="primary-button" type="button">新建目录</button><button id="choose-folder" class="quiet-button" type="button">选择文件夹</button></div>
      <div id="folder-picker" class="folder-picker" hidden>
        <div class="folder-picker-header"><button id="folder-picker-back" class="quiet-button" type="button">返回上级</button><strong id="folder-picker-path">根目录</strong><button id="folder-picker-use" class="primary-button" type="button">使用当前目录</button></div>
        <div id="folder-list" class="folder-list"></div>
        <form id="new-folder-form" class="new-folder-form"><input id="new-folder-name" type="text" maxlength="96" placeholder="新目录名称" autocomplete="off"><button class="quiet-button" type="submit">创建并使用</button></form>
        <p id="folder-picker-status" class="folder-picker-status"></p>
      </div>
    </section>
    <section class="drop-card" id="drop-zone">
      <input id="file-input" type="file" accept="${UPLOAD_ACCEPT}" multiple hidden>
      <input id="folder-input" type="file" webkitdirectory directory multiple hidden>
      <div class="drop-icon">＋</div><strong>拖拽文件或文件夹到这里</strong><span>或 <button id="choose-files" class="text-button">选择文件</button></span>
      <div class="format-pills" aria-label="支持的文件类别"><span>图片</span><span>视频</span><span>音乐</span><span>游戏</span><span>电子书</span></div>
      <small>支持保留文件夹层级 · ${SUPPORTED_FORMAT_SUMMARY}</small>
    </section>
    <section class="link-card">
      <div class="section-label"><span class="eyebrow">MEDIA UPLOADER / 02</span><span>REMOTE OR LINK FILE</span></div>
      <div class="link-row"><input id="url-input" type="url" placeholder="粘贴媒体、电子书或网页链接…"><button id="add-current" class="quiet-button" title="加入当前标签页">当前页</button><button id="add-link" class="primary-button">加入队列</button></div>
      <p class="hint">图片、视频、音乐和电子书链接会尝试抓取原文件；普通网页链接会保存为一个 .url.txt 文件。也可以直接粘贴截图。</p>
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
  connection: document.querySelector('#connection'), fileInput: document.querySelector('#file-input'), folderInput: document.querySelector('#folder-input'), dropZone: document.querySelector('#drop-zone'),
  urlInput: document.querySelector('#url-input'), queue: document.querySelector('#queue'), queueCount: document.querySelector('#queue-count'),
  queueSummary: document.querySelector('#queue-summary'), status: document.querySelector('#status'), start: document.querySelector('#start-upload'), cancel: document.querySelector('#cancel-upload'),
  destinationLabel: document.querySelector('#destination-label'), destinationPath: document.querySelector('#destination-path'), folderPicker: document.querySelector('#folder-picker'), folderPickerBack: document.querySelector('#folder-picker-back'), folderPickerPath: document.querySelector('#folder-picker-path'), folderList: document.querySelector('#folder-list'), folderPickerUse: document.querySelector('#folder-picker-use'), newFolderForm: document.querySelector('#new-folder-form'), newFolderName: document.querySelector('#new-folder-name'), folderPickerStatus: document.querySelector('#folder-picker-status')
}

document.querySelector('#settings').addEventListener('click', () => chrome.runtime.openOptionsPage())
document.querySelector('#choose-files').addEventListener('click', () => els.fileInput.click())
document.querySelector('#choose-folder').addEventListener('click', () => els.folderInput.click())
els.fileInput.addEventListener('change', () => {
  addFiles([...els.fileInput.files])
  els.fileInput.value = ''
})
els.folderInput.addEventListener('change', () => {
  const files = [...els.folderInput.files]
  if (files.length) addFiles(files, true)
  els.folderInput.value = ''
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
document.querySelector('#choose-destination').addEventListener('click', () => openFolderPicker())
document.querySelector('#create-destination').addEventListener('click', () => openFolderPicker(true))
els.folderPickerBack.addEventListener('click', () => {
  if (folderPickerPath.length <= 1) return closeFolderPicker()
  folderPickerPath.pop()
  loadFolderPickerFolders()
})
els.folderPickerUse.addEventListener('click', () => useFolder(folderPickerPath.at(-1)))
els.newFolderForm.addEventListener('submit', (event) => {
  event.preventDefault()
  createFolder()
})
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
  void handleDrop(event.dataTransfer)
})

document.querySelector('#open-dashboard').hidden = pageMode
if (pageMode) document.title = 'IC OSS Uploader'
const params = new URLSearchParams(location.search)
queue = await restoreQueue()
setDestinationFromSettings(settings)
if (params.get('url')) {
  els.urlInput.value = params.get('url')
  addUrl(params.get('url'), params.get('kind'), params.get('title'))
  history.replaceState({}, '', location.pathname)
}
await refreshConnection()
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== 'local' || !changes['media-uploader-settings']) return
  await refreshConnection()
  if (!currentAbort) setStatus(isBound(settings) ? '连接配置已更新' : '连接已解除，请重新绑定')
})

function addFiles(files, preserveTree = false) {
  const rejected = []
  for (const input of files) {
    const file = input?.file || input
    const info = classifyFile(file)
    if (!info) {
      rejected.push(`${file.name}（格式不支持）`)
      continue
    }
    const { category } = info
    if (!file.size || file.size > LIMITS[category]) {
      rejected.push(`${file.name}（超过 ${formatBytes(LIMITS[category])}）`)
      continue
    }
    const preview = isImageFile(file) ? URL.createObjectURL(file) : ''
    const relativePath = preserveTree ? String(input?.relativePath || file.webkitRelativePath || '') : ''
    const segments = relativePath.split('/').map((segment) => segment.trim()).filter((segment) => segment && segment !== '.' && segment !== '..')
    const folderSegments = segments.slice(0, -1)
    queue.push({
      id: crypto.randomUUID(), kind: 'file', category, formatLabel: info.label, contentType: info.contentType, label: file.name, detail: `${info.label} · ${formatBytes(file.size)}`, file, preview,
      ...itemDestination(), relativePath, folderSegments, folderBaseParent: destination.id, folderBasePath: [...destination.path],
      folderPath: [...destination.path, ...folderSegments], status: 'ready', progress: 0
    })
  }
  if (rejected.length) setStatus(`${rejected.slice(0, 2).join('、')}${rejected.length > 2 ? ` 等 ${rejected.length} 个文件未加入` : '未加入'}`)
  else if (preserveTree && files.length) setStatus(`已加入文件夹中的 ${files.length} 个文件，将保留目录层级`)
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
  queue.push({ id: crypto.randomUUID(), kind, label: forcedTitle || parsed.hostname, detail: url, url, title: forcedTitle, ...itemDestination(), status: 'ready', progress: 0 })
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

async function handleDrop(dataTransfer) {
  let files
  try {
    files = await readDroppedFiles(dataTransfer)
  } catch (error) {
    return setStatus(`读取拖入文件夹失败：${error.message || String(error)}`)
  }
  if (files.length) {
    addFiles(files, files.some((item) => item.relativePath))
    return
  }
  const droppedText = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain')
  const droppedUrl = droppedText.split(/\r?\n/).map((item) => item.trim()).find((item) => /^https?:\/\//i.test(item))
  if (droppedUrl) addUrl(droppedUrl)
}

async function readDroppedFiles(dataTransfer) {
  const entries = [...(dataTransfer.items || [])]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean)
  if (!entries.some((entry) => entry.isDirectory)) return [...dataTransfer.files]
  const files = []
  for (const entry of entries) await collectDroppedEntry(entry, '', files)
  return files
}

async function collectDroppedEntry(entry, parentPath, files) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject))
    files.push({ file, relativePath: parentPath ? `${parentPath}/${file.name}` : '' })
    return
  }
  if (!entry.isDirectory) return
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
  const children = await readDroppedDirectory(entry)
  for (const child of children) await collectDroppedEntry(child, path, files)
}

function readDroppedDirectory(directory) {
  return new Promise((resolve, reject) => {
    const reader = directory.createReader()
    const entries = []
    const readBatch = () => reader.readEntries((batch) => {
      if (!batch.length) return resolve(entries)
      entries.push(...batch)
      readBatch()
    }, reject)
    readBatch()
  })
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
  setDestinationFromSettings(settings)
  const bound = isBound(settings)
  els.connection.textContent = bound ? `● ${settings.bucketLabel || settings.bucket}` : '未连接'
  els.connection.dataset.state = bound ? 'connected' : 'idle'
  client = null
  renderDestination()
}

function setDestinationFromSettings(value) {
  const id = Number(value.uploadFolderId)
  destination = {
    id: Number.isSafeInteger(id) && id >= 0 ? id : 0,
    name: value.uploadFolderName || '根目录',
    path: Array.isArray(value.uploadFolderPath) && value.uploadFolderPath.length ? value.uploadFolderPath : ['根目录']
  }
}

async function persistDestination() {
  settings = await saveSettings({
    ...settings,
    uploadFolderId: destination.id,
    uploadFolderName: destination.name,
    uploadFolderPath: destination.path
  })
}

function renderDestination() {
  els.destinationLabel.textContent = destination.name
  els.destinationPath.textContent = `${destination.path.join(' / ')} · 新加入的素材将上传到这里`
  els.folderPicker.hidden = !folderPickerOpen
  els.folderPickerPath.textContent = folderPickerPath.map((item) => item.name).join(' / ')
  els.folderPickerBack.disabled = folderPickerLoading || folderPickerPath.length <= 1
  els.folderPickerUse.disabled = folderPickerLoading
  els.newFolderName.disabled = folderPickerLoading
  els.folderPickerStatus.textContent = folderPickerError || (folderPickerLoading ? '正在读取目录…' : '')
  els.folderList.innerHTML = folderPickerLoading
    ? '<div class="folder-list-empty">正在读取子目录…</div>'
    : folderPickerFolders.length
      ? folderPickerFolders.map((folder) => `<button type="button" class="folder-row" data-folder-id="${folder.id}"><span>⌁</span><strong>${escapeHtml(folder.name)}</strong><small>进入目录</small></button>`).join('')
      : '<div class="folder-list-empty">当前目录还没有子目录</div>'
  els.folderList.querySelectorAll('[data-folder-id]').forEach((button) => button.addEventListener('click', () => {
    const folder = folderPickerFolders.find((item) => String(item.id) === button.dataset.folderId)
    if (!folder) return
    folderPickerPath.push({ id: folder.id, name: folder.name })
    loadFolderPickerFolders()
  }))
}

async function openFolderPicker(focusCreate = false) {
  if (!isBound(settings)) return setStatus('请先在设置中绑定 IC OSS Bucket 与 access token')
  folderPickerOpen = true
  folderPickerPath = [{ id: 0, name: '根目录' }]
  folderPickerFolders = []
  folderPickerError = ''
  renderDestination()
  await loadFolderPickerFolders()
  if (focusCreate) els.newFolderName.focus()
}

function closeFolderPicker() {
  folderPickerOpen = false
  folderPickerError = ''
  renderDestination()
}

async function loadFolderPickerFolders() {
  if (!folderPickerOpen || !isBound(settings)) return
  folderPickerLoading = true
  folderPickerError = ''
  renderDestination()
  try {
    const activeClient = client ||= await createClient(settings.bucket, settings.accessToken)
    folderPickerFolders = (await activeClient.listFolders(folderPickerPath.at(-1).id)).filter((folder) => folder.status >= 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  } catch (error) {
    folderPickerFolders = []
    folderPickerError = `目录读取失败：${error.message || String(error)}；当前仍可上传到已选目录。`
  } finally {
    folderPickerLoading = false
    renderDestination()
  }
}

function useFolder(folder) {
  if (!folder) return
  destination = { id: folder.id, name: folder.name, path: folderPickerPath.map((item) => item.name) }
  void persistDestination()
  closeFolderPicker()
  setStatus(`已切换上传目录：${destination.path.join(' / ')}`)
}

async function createFolder() {
  const name = els.newFolderName.value.trim()
  if (!name || folderPickerLoading) return setStatus('请输入新目录名称')
  if (!isBound(settings)) return setStatus('请先绑定 IC OSS')
  folderPickerLoading = true
  folderPickerError = ''
  renderDestination()
  try {
    const activeClient = client ||= await createClient(settings.bucket, settings.accessToken)
    const result = await activeClient.createFolder(name, folderPickerPath.at(-1).id)
    const created = { id: result.id, name, path: [...folderPickerPath.map((item) => item.name), name] }
    destination = created
    await persistDestination()
    folderPickerPath.push({ id: created.id, name: created.name })
    folderPickerFolders = []
    els.newFolderName.value = ''
    setStatus(`目录已创建并设为上传目标：${created.path.join(' / ')}`)
    await loadFolderPickerFolders()
  } catch (error) {
    folderPickerError = `目录创建失败：${error.message || String(error)}`
  } finally {
    folderPickerLoading = false
    renderDestination()
  }
}

function itemDestination() {
  return { parent: destination.id, folderPath: [...destination.path] }
}

async function resolveItemParent(item, activeClient, folderCache) {
  const segments = Array.isArray(item.folderSegments) && item.folderSegments.length
    ? item.folderSegments
    : String(item.relativePath || '').split('/').map((segment) => segment.trim()).filter(Boolean).slice(0, -1)
  if (!segments.length) return Number(item.parent) || 0
  let parent = Number.isSafeInteger(item.folderBaseParent) && item.folderBaseParent >= 0 ? item.folderBaseParent : Number(item.parent) || 0
  for (const name of segments) {
    const key = `${parent}/${name}`
    let folderId = folderCache.get(key)
    if (folderId === undefined) {
      const folder = await activeClient.ensureFolder(name, parent)
      folderId = Number(folder.id)
      if (!Number.isSafeInteger(folderId) || folderId < 0) throw new Error(`目录创建失败：${name}`)
      folderCache.set(key, folderId)
    }
    parent = folderId
  }
  return parent
}

async function processQueue() {
  if (currentAbort) return
  if (!queue.length || queue.every((item) => item.status === 'done')) return setStatus('队列中没有待上传内容')
  if (!isBound(settings)) return setStatus('请先在设置中绑定 IC OSS Bucket 与 access token')
  els.start.disabled = true
  els.cancel.hidden = false
  currentAbort = new AbortController()
  try {
    const activeClient = client ||= await createClient(settings.bucket, settings.accessToken)
    const folderCache = new Map()
    for (const item of queue) {
      if (item.status === 'done') continue
      item.status = 'uploading'; item.progress = 0; schedulePersist(); render()
      try {
        const parent = await resolveItemParent(item, activeClient, folderCache)
        let result
        if (item.kind === 'file') result = await uploadFile({ client: activeClient, file: item.file, parent, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
        else if (['image', 'video', 'audio', 'game', 'ebook'].includes(item.kind)) result = await importRemoteMedia({ client: activeClient, url: item.url, parent, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
        else if (item.kind === 'auto') {
          try {
            result = await importRemoteMedia({ client: activeClient, url: item.url, parent, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
          } catch (error) {
            if (!/不是支持的媒体或电子书文件/.test(error.message || '')) throw error
            result = await saveLink({ client: activeClient, url: item.url, title: item.title || item.label, parent, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
          }
        } else result = await saveLink({ client: activeClient, url: item.url, title: item.title || item.label, parent, signal: currentAbort.signal, onProgress: (p) => updateProgress(item, p) })
        item.status = 'done'; item.progress = 100; item.result = result
      } catch (error) {
        if (currentAbort.signal.aborted) {
          item.status = 'ready'; item.error = ''
          schedulePersist()
          render()
          break
        }
        item.status = 'error'; item.error = explainUploadError(error, item)
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
  const category = item.category || (item.kind === 'file' ? fileCategory(item.file) : item.kind)
  const icon = category === 'video' ? '▶' : category === 'audio' ? '♫' : category === 'game' ? '⌘' : category === 'ebook' ? '▤' : category === 'image' ? '▧' : '↗'
  const resultId = item.result?.asset?.id ? `File #${item.result.asset.id}` : ''
  const targetPath = Array.isArray(item.folderPath) && item.folderPath.length ? ` · ${item.folderPath.join(' / ')}` : ''
  const status = item.status === 'done' ? `已完成${resultId ? ` · ${resultId}` : ''}${targetPath}` : item.status === 'error' ? `${item.error}${targetPath}` : item.status === 'uploading' ? `${item.phase || '上传中'} ${item.progress}% · ${item.folderPath?.at(-1) || '根目录'}` : `${item.detail}${targetPath}`
  const visual = item.preview ? `<img class="item-preview" src="${escapeHtml(item.preview)}" alt="">` : `<div class="item-icon item-${category}">${icon}</div>`
  const retryButton = item.status === 'error' ? `<button class="retry-button" data-retry="${item.id}">重试</button>` : ''
  return `<article class="queue-item" data-state="${item.status}">${visual}<div class="item-copy"><strong title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</strong><small title="${escapeHtml(status)}">${escapeHtml(status)}</small>${item.status === 'uploading' ? `<div class="progress"><i style="width:${item.progress}%"></i></div>` : ''}</div>${retryButton}<button class="remove-button" data-remove="${item.id}" aria-label="移除">×</button></article>`
}

function setStatus(message) { els.status.textContent = message }
function explainUploadError(error, item) {
  const message = error?.message || String(error)
  if (!/permission denied/i.test(message)) return message
  const target = Number(item?.parent) === 0 ? '根目录' : '当前目录'
  const policy = Number(item?.parent) === 0 ? 'Bucket.Write:File File.Write' : 'Bucket.Write:File File.Write（或目标目录及其父级的 Folder.Write.File:<目录ID>）'
  return `权限不足：${target}不可写。请重新生成包含 ${policy} 的 IC OSS access token，然后点击“重试”。`
}
function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]) }
function isImageFile(file) { return fileCategory(file) === 'image' }
async function restoreQueue() {
  const saved = await loadQueue()
  return saved.map((item) => ({
    ...item,
    category: item.category || (item.kind === 'file' ? fileCategory(item.file) : item.kind),
    formatLabel: item.formatLabel || CATEGORY_LABELS[item.category || item.kind] || '',
    preview: item.file && isImageFile(item.file) ? URL.createObjectURL(item.file) : ''
  }))
}
function schedulePersist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => saveQueue(queue), 80)
}

render()
