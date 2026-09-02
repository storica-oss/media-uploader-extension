import { createHasher } from './ic-oss-client.js'

export const LIMITS = Object.freeze({
  image: 64 * 1024 * 1024,
  video: 4 * 1024 * 1024 * 1024
})

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])

export async function uploadFile({ client, file, signal, onProgress, parent = 0 }) {
  const contentType = mediaType(file)
  const family = contentType.startsWith('image/') ? 'image' : contentType === 'video/mp4' ? 'video' : ''
  if (!family && contentType !== 'text/plain') throw new Error('仅支持 JPEG、PNG、WebP、AVIF、GIF、MP4 或链接文件')
  if (family && (!file.size || file.size > LIMITS[family])) throw new Error(`${family === 'image' ? '图片' : '视频'}超过大小限制`)
  if (!file.size || file.size > 2 * 1024 * 1024) {
    if (!family) throw new Error('链接文件超过大小限制')
  }
  const name = safeName(file.name, family === 'video' ? 'video.mp4' : family === 'image' ? 'image.jpg' : 'link.url.txt')
  const asset = await client.uploadFile(file, { signal, onProgress, contentType, name, parent })
  return { type: family || 'link', asset, contentType, size: file.size }
}

export async function importRemoteMedia({ client, url, signal, onProgress, parent = 0 }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入完整的 http(s) 链接')
  onProgress?.({ phase: 'fetching', percent: 0, message: '正在读取远程媒体…' })
  const response = await fetchRemote(url, signal)
  const type = mediaType({ type: response.headers.get('content-type') || '', name: url })
  if (!IMAGE_TYPES.has(type) && type !== 'video/mp4') throw new Error('这个链接不是支持的图片或 MP4；将保存为链接文件')
  if (type === 'video/mp4' && response.body?.getReader) {
    const checked = await hashResponse(response, LIMITS.video, signal, onProgress)
    const uploadResponse = await fetchRemote(url, signal)
    if (!uploadResponse.body?.getReader) {
      const blob = await uploadResponse.blob()
      return uploadFile({ client, file: new File([blob], remoteName(url, type), { type }), signal, onProgress, parent })
    }
    return uploadStream({
      client, reader: uploadResponse.body.getReader(), name: remoteName(url, type),
      contentType: type, size: checked.size, hash: checked.hash, signal, onProgress, parent
    })
  }
  const blob = await response.blob()
  const file = new File([blob], remoteName(url, type), { type })
  return uploadFile({ client, file, signal, onProgress, parent })
}

export async function saveLink({ client, url, title, signal, onProgress, parent = 0 }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入完整的 http(s) 链接')
  const cleanTitle = String(title || '').trim() || new URL(url).hostname
  const linkFile = new File([
    `Title: ${cleanTitle.slice(0, 300)}\nURL: ${url}\nSaved from: Storica Media Uploader\n`
  ], `${safeName(cleanTitle, 'link')}.url.txt`, { type: 'text/plain' })
  return uploadFile({ client, file: linkFile, signal, onProgress, parent })
}

async function hashResponse(response, maxBytes, signal, onProgress) {
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > maxBytes) throw new Error(`视频超过 ${formatBytes(maxBytes)}`)
  const reader = response.body.getReader()
  const hasher = createHasher()
  let size = 0
  try {
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error(`视频超过 ${formatBytes(maxBytes)}`)
      hasher.update(value)
      onProgress?.({ phase: 'hashing', percent: declaredSize ? Math.round(size / declaredSize * 100) : 0, hashedBytes: size, totalBytes: declaredSize })
    }
    if (!size) throw new Error('远程视频为空')
    onProgress?.({ phase: 'hashing', percent: 100, hashedBytes: size, totalBytes: size })
    return { size, hash: hasher.digest() }
  } catch (error) {
    await reader.cancel().catch(() => {})
    hasher.destroy?.()
    throw error
  }
}

async function uploadStream({ client, reader, name, contentType, size, hash, signal, onProgress, parent = 0 }) {
  const asset = await client.uploadStream({
    reader, name: safeName(name, 'video.mp4'), contentType, size, hash, signal, onProgress, parent
  })
  return { type: 'video', asset, contentType, size }
}

async function fetchRemote(url, signal) {
  const response = await fetch(url, { credentials: 'include', redirect: 'follow', cache: 'no-store', signal })
  if (!response.ok) throw new Error(`远程地址返回 HTTP ${response.status}`)
  return response
}

function mediaType(file) {
  const declared = String(file.type || '').split(';')[0].trim().toLowerCase()
  if (IMAGE_TYPES.has(declared) || declared === 'video/mp4') return declared
  const name = String(file.name || '').toLowerCase().split('?')[0]
  if (/\.jpe?g$/.test(name)) return 'image/jpeg'
  if (/\.png$/.test(name)) return 'image/png'
  if (/\.webp$/.test(name)) return 'image/webp'
  if (/\.avif$/.test(name)) return 'image/avif'
  if (/\.gif$/.test(name)) return 'image/gif'
  if (/\.mp4$/.test(name)) return 'video/mp4'
  return declared
}

function remoteName(url, type) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    if (name && /\.[a-z0-9]{2,5}$/i.test(name)) return name.slice(-160)
  } catch {}
  return type === 'video/mp4' ? 'remote-video.mp4' : `remote-image.${type.split('/')[1] || 'jpg'}`
}

function safeName(name, fallback) {
  const value = String(name || '').replace(/[\u0000-\u001f\\/:*?"<>|]/g, '-').trim()
  return value.slice(0, 180) || fallback
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new Error('上传已取消')
}

export function formatBytes(value) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function detectUrlType(url) {
  const path = String(url || '').toLowerCase().split('?')[0]
  if (/\.(?:jpe?g|png|webp|avif|gif)$/.test(path)) return 'image'
  if (/\.mp4$/.test(path)) return 'video'
  return 'auto'
}
