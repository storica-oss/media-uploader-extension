import { createClient } from './ic-oss-client.js'
import { clearSettings, isBound, loadSettings, saveSettings } from './settings.js'
import './style.css'

document.querySelector('#settings-app').innerHTML = `
  <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
  <header class="topbar"><a class="brand" href="https://storica.my" target="_blank" rel="noreferrer"><img src="./storica-mark.svg" alt="Storica"/><span>STORICA</span><small>IC OSS</small></a><span class="eyebrow">EXTENSION SETTINGS</span></header>
  <main class="settings-shell"><section class="settings-hero"><span class="eyebrow">MEDIA UPLOADER / CONFIG</span><h1>绑定你的<br><em>链上 Bucket。</em></h1><p>扩展直接使用 IC OSS 的委托 access token 写入 Bucket，不经过 Personal Hub。Token 只会保存在浏览器扩展的本地存储中。</p></section>
  <form id="settings-form" class="settings-card">
    <label><span>IC OSS Bucket Canister ID</span><small>填写 Bucket 的 Canister ID，也支持包含 canisterId 参数的自定义域名</small><input id="bucket" required placeholder="aaaaa-aa 或 https://…?canisterId=…"></label>
    <label><span>IC OSS access token</span><small>粘贴 COSE 委托 token；也可以直接把 OSS Admin 的绑定 JSON 粘贴到任意字段</small><div class="token-field"><textarea id="access-token" class="is-hidden" rows="4" required placeholder="base64:…" spellcheck="false"></textarea><button id="toggle-token" type="button" class="token-toggle">显示</button></div></label>
    <div class="settings-actions"><button id="import-binding" type="button" class="quiet-button">从剪贴板导入</button><button id="test" type="button" class="quiet-button">测试连接</button><button type="submit" class="primary-button">保存连接 ↗</button></div>
    <div id="settings-status" class="settings-status">尚未保存连接</div>
  </form>
  <section class="security-note"><span>◎</span><div><strong>安全提醒</strong><p>Token 不会注入网页，也不会上传到第三方服务。请给 token 设置精确的 Bucket audience、最小权限和较短有效期；失效或撤销后可随时在这里替换。</p></div></section>
  <button id="clear" class="danger-button">清除本机连接信息</button></main>
`

const bucket = document.querySelector('#bucket')
const accessToken = document.querySelector('#access-token')
const status = document.querySelector('#settings-status')
const form = document.querySelector('#settings-form')
const toggleToken = document.querySelector('#toggle-token')
const initial = await loadSettings()
bucket.value = initial.bucket
accessToken.value = initial.accessToken
if (isBound(initial)) showStatus(`已保存 · ${initial.bucketLabel || initial.bucket}`, 'success')

toggleToken.addEventListener('click', () => {
  const hidden = accessToken.classList.toggle('is-hidden')
  toggleToken.textContent = hidden ? '显示' : '隐藏'
})

document.querySelector('#import-binding').addEventListener('click', async () => {
  setBusy(true); showStatus('正在读取 Admin 复制的绑定配置…', 'loading')
  try {
    applyBinding(parseBinding(await navigator.clipboard.readText()))
    showStatus('绑定配置已导入 · 点击测试连接或保存连接', 'success')
  } catch (error) {
    showStatus(error.message || '导入失败，请先在 OSS Admin 复制绑定配置', 'error')
  } finally { setBusy(false) }
})

for (const field of [bucket, accessToken]) {
  field.addEventListener('paste', (event) => {
    const raw = event.clipboardData?.getData('text') || ''
    if (!raw.trimStart().startsWith('{')) return
    try {
      applyBinding(parseBinding(raw))
      event.preventDefault()
      showStatus('绑定配置已粘贴 · 点击测试连接或保存连接', 'success')
    } catch (error) {
      event.preventDefault()
      showStatus(error.message || '绑定配置格式不正确', 'error')
    }
  })
}

document.querySelector('#test').addEventListener('click', async () => {
  setBusy(true); showStatus('正在验证 Bucket 与 access token…', 'loading')
  try {
    const client = await createClient(bucket.value, accessToken.value)
    const info = await client.getBucketInfo()
    showStatus(`连接成功 · ${info.name || client.resolved.label}`, 'success')
  } catch (error) { showStatus(error.message || '连接失败', 'error') }
  finally { setBusy(false) }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault(); setBusy(true); showStatus('正在验证并保存…', 'loading')
  try {
    const client = await createClient(bucket.value, accessToken.value)
    const info = await client.getBucketInfo()
    await saveSettings({ bucket: bucket.value, accessToken: accessToken.value, bucketLabel: info.name || client.resolved.label, connectedAt: new Date().toISOString() })
    showStatus(`已连接 · ${info.name || client.resolved.label}`, 'success')
  } catch (error) { showStatus(error.message || '保存失败', 'error') }
  finally { setBusy(false) }
})

document.querySelector('#clear').addEventListener('click', async () => {
  await clearSettings(); bucket.value = ''; accessToken.value = ''; showStatus('本机连接信息已清除', 'success')
})

function showStatus(message, state = '') { status.textContent = message; status.dataset.state = state }
function setBusy(busy) { document.querySelectorAll('button').forEach((button) => { button.disabled = busy }) }

function parseBinding(raw) {
  const binding = JSON.parse(raw)
  if (binding?.type !== 'storica-media-uploader-binding' || binding?.version !== 1) {
    throw new Error('不是有效的 Media Uploader 绑定配置')
  }
  if (typeof binding.bucket !== 'string' || !binding.bucket.trim() || typeof binding.accessToken !== 'string' || !binding.accessToken.trim()) {
    throw new Error('绑定配置缺少 Bucket 或 access token')
  }
  return binding
}

function applyBinding(binding) {
  bucket.value = binding.bucket.trim()
  accessToken.value = binding.accessToken.trim()
}
