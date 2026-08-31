import { createClient } from './ic-oss-client.js'
import { clearSettings, isBound, loadSettings, saveSettings } from './settings.js'
import './style.css'

document.querySelector('#settings-app').innerHTML = `
  <div class="ambient ambient-a"></div><div class="ambient ambient-b"></div>
  <header class="topbar"><a class="brand" href="https://storica.my" target="_blank" rel="noreferrer"><img src="./storica-mark.svg" alt="Storica"/><span>STORICA</span><small>IC OSS</small></a><span class="eyebrow">EXTENSION SETTINGS</span></header>
  <main class="settings-shell"><section class="settings-hero"><span class="eyebrow">MEDIA UPLOADER / CONFIG</span><h1>连接你的<br><em>个人云。</em></h1><p>扩展通过 Personal Hub API Key 写入你的 Public Bucket。Key 只会保存在浏览器扩展的本地存储中。</p></section>
  <form id="settings-form" class="settings-card">
    <label><span>Personal Hub 地址或 Canister ID</span><small>支持 aaaaa-aa，或包含 canisterId 参数的自定义域名</small><input id="hub" required placeholder="aaaaa-aa 或 https://…?canisterId=…"></label>
    <label><span>API Key</span><small>建议使用可撤销、有限期的 <code>phk_…</code> Key</small><input id="api-key" type="password" required placeholder="phk_…"></label>
    <div class="settings-actions"><button id="test" type="button" class="quiet-button">测试连接</button><button type="submit" class="primary-button">保存连接 ↗</button></div>
    <div id="settings-status" class="settings-status">尚未保存连接</div>
  </form>
  <section class="security-note"><span>◎</span><div><strong>安全提醒</strong><p>API Key 不会注入网页，也不会上传到第三方服务。拥有此 Key 的人可以代表你创建 Public 内容，请在 Personal Hub 管理中心为它设置合适的有效期。</p></div></section>
  <button id="clear" class="danger-button">清除本机连接信息</button></main>
`

const hub = document.querySelector('#hub')
const key = document.querySelector('#api-key')
const status = document.querySelector('#settings-status')
const form = document.querySelector('#settings-form')
const initial = await loadSettings()
hub.value = initial.hub
key.value = initial.apiKey
if (isBound(initial)) showStatus(`已保存 · ${initial.hubLabel || initial.hub}`, 'success')

document.querySelector('#test').addEventListener('click', async () => {
  setBusy(true); showStatus('正在验证 API Key…', 'loading')
  try {
    const client = await createClient(hub.value)
    const galleries = await client.listGalleries(key.value)
    showStatus(`连接成功 · 已发现 ${galleries.length} 个相册`, 'success')
  } catch (error) { showStatus(error.message || '连接失败', 'error') }
  finally { setBusy(false) }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault(); setBusy(true); showStatus('正在验证并保存…', 'loading')
  try {
    const client = await createClient(hub.value)
    const galleries = await client.listGalleries(key.value)
    await saveSettings({ hub: hub.value, apiKey: key.value, hubLabel: client.resolved.label, connectedAt: new Date().toISOString() })
    showStatus(`已连接 · ${galleries.length} 个相册可用`, 'success')
  } catch (error) { showStatus(error.message || '保存失败', 'error') }
  finally { setBusy(false) }
})

document.querySelector('#clear').addEventListener('click', async () => {
  await clearSettings(); hub.value = ''; key.value = ''; showStatus('本机连接信息已清除', 'success')
})

function showStatus(message, state = '') { status.textContent = message; status.dataset.state = state }
function setBusy(busy) { document.querySelectorAll('button').forEach((button) => { button.disabled = busy }) }
