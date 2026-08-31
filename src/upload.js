import { createHasher, requestId } from './ic-oss-client.js'

export const LIMITS = Object.freeze({
  image: 64 * 1024 * 1024,
  video: 4 * 1024 * 1024 * 1024
})

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])

export async function uploadFile({ client, token, file, signal, onProgress }) {
  const contentType = mediaType(file)
  const family = contentType.startsWith('image/') ? 'image' : contentType === 'video/mp4' ? 'video' : ''
  if (!family) throw new Error('仅支持 JPEG、PNG、WebP、AVIF、GIF 和 MP4')
  if (!file.size || file.size > LIMITS[family]) throw new Error(`${family === 'image' ? '图片' : '视频'}超过大小限制`)

  const hash = await hashFile(file, signal, onProgress)
  const request = {
    requestId: requestId(), name: safeName(file.name, family === 'video' ? 'video.mp4' : 'image.jpg'),
    contentType, size: file.size, hash
  }
  const session = family === 'image'
    ? await retry(() => client.beginImageUpload(token, request), signal)
    : await retry(() => client.beginMediaUpload(token, request), signal)

  let uploaded = 0
  try {
    onProgress?.({ phase: 'uploading', percent: 0, uploadedBytes: 0, totalBytes: file.size })
    for (let index = 0; index < session.totalChunks; index += 1) {
      throwIfAborted(signal)
      const start = index * session.chunkSize
      const end = Math.min(file.size, start + session.chunkSize)
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer())
      await retry(
        () => family === 'image'
          ? client.uploadImageChunk(token, session, index, bytes)
          : client.uploadMediaChunk(token, session, index, bytes),
        signal
      )
      uploaded = end
      onProgress?.({ phase: 'uploading', percent: Math.round(uploaded / file.size * 100), uploadedBytes: uploaded, totalBytes: file.size })
    }
    onProgress?.({ phase: 'committing', percent: 100, uploadedBytes: file.size, totalBytes: file.size })
    const asset = await retry(
      () => family === 'image' ? client.finishImageUpload(token, session) : client.finishMediaUpload(token, session),
      signal
    )
    return { type: family, asset, contentType, size: file.size }
  } catch (error) {
    await (family === 'image' ? client.abortImageUpload(token, session) : client.abortMediaUpload(token, session)).catch(() => {})
    throw error
  }
}

export async function importRemoteMedia({ client, token, url, signal, onProgress }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入完整的 http(s) 链接')
  onProgress?.({ phase: 'fetching', percent: 0, message: '正在读取远程媒体…' })
  const response = await fetchRemote(url, signal)
  const type = mediaType({ type: response.headers.get('content-type') || '', name: url })
  if (!IMAGE_TYPES.has(type) && type !== 'video/mp4') throw new Error('这个链接不是支持的图片或 MP4；可改为保存为链接文章')
  if (type === 'video/mp4' && response.body?.getReader) {
    const checked = await hashResponse(response, LIMITS.video, signal, onProgress)
    const uploadResponse = await fetchRemote(url, signal)
    if (!uploadResponse.body?.getReader) {
      const blob = await uploadResponse.blob()
      return uploadFile({ client, token, file: new File([blob], remoteName(url, type), { type }), signal, onProgress })
    }
    return uploadStream({
      client, token, reader: uploadResponse.body.getReader(), name: remoteName(url, type),
      contentType: type, size: checked.size, hash: checked.hash, signal, onProgress
    })
  }
  const blob = await response.blob()
  const file = new File([blob], remoteName(url, type), { type })
  return uploadFile({ client, token, file, signal, onProgress })
}

export async function saveLink({ client, token, url, title, signal }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入完整的 http(s) 链接')
  const cleanTitle = String(title || '').trim() || new URL(url).hostname
  return client.createArticle(token, {
    slug: `link-${Date.now().toString(36)}`,
    title: cleanTitle.slice(0, 300),
    summary: url.slice(0, 1000),
    body: `[${cleanTitle.replace(/[\[\]]/g, '')}](${url})`,
    tags: ['browser-link'],
    publish: true
  })
}

async function hashFile(file, signal, onProgress) {
  const hasher = createHasher()
  const reader = file.stream?.().getReader?.()
  if (!reader) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    hasher.update(bytes)
    onProgress?.({ phase: 'hashing', percent: 100, hashedBytes: bytes.byteLength, totalBytes: file.size })
    return hasher.digest()
  }
  let hashed = 0
  try {
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      hasher.update(value)
      hashed += value.byteLength
      onProgress?.({ phase: 'hashing', percent: Math.round(hashed / file.size * 100), hashedBytes: hashed, totalBytes: file.size })
    }
    return hasher.digest()
  } catch (error) {
    await reader.cancel().catch(() => {})
    hasher.destroy?.()
    throw error
  }
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

async function uploadStream({ client, token, reader, name, contentType, size, hash, signal, onProgress }) {
  const session = await retry(() => client.beginMediaUpload(token, {
    requestId: requestId(), name: safeName(name, 'video.mp4'), contentType, size, hash
  }), signal)
  if (!session.chunkSize || !session.totalChunks) throw new Error('服务器返回了无效的上传分片配置')
  let pending = new Uint8Array()
  let uploaded = 0
  let index = 0
  try {
    onProgress?.({ phase: 'uploading', percent: 0, uploadedBytes: 0, totalBytes: size })
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      pending = concatBytes(pending, value)
      while (pending.byteLength >= session.chunkSize) {
        const chunk = pending.slice(0, session.chunkSize)
        pending = pending.slice(session.chunkSize)
        await retry(() => client.uploadMediaChunk(token, session, index, chunk), signal)
        index += 1
        uploaded += chunk.byteLength
        onProgress?.({ phase: 'uploading', percent: Math.round(uploaded / size * 100), uploadedBytes: uploaded, totalBytes: size })
      }
      if (uploaded + pending.byteLength > size) throw new Error('远程视频内容超过首次校验结果')
    }
    if (pending.byteLength) {
      await retry(() => client.uploadMediaChunk(token, session, index, pending), signal)
      index += 1
      uploaded += pending.byteLength
      onProgress?.({ phase: 'uploading', percent: 100, uploadedBytes: uploaded, totalBytes: size })
    }
    if (uploaded !== size || index !== session.totalChunks) throw new Error(`远程视频内容已变化：预期 ${size} 字节，实际 ${uploaded} 字节`)
    onProgress?.({ phase: 'committing', percent: 100, uploadedBytes: size, totalBytes: size })
    const asset = await retry(() => client.finishMediaUpload(token, session), signal)
    return { type: 'video', asset, contentType, size }
  } catch (error) {
    await reader.cancel().catch(() => {})
    await client.abortMediaUpload(token, session).catch(() => {})
    throw error
  }
}

async function fetchRemote(url, signal) {
  const response = await fetch(url, { credentials: 'include', redirect: 'follow', cache: 'no-store', signal })
  if (!response.ok) throw new Error(`远程地址返回 HTTP ${response.status}`)
  return response
}

function concatBytes(left, right) {
  const result = new Uint8Array(left.byteLength + right.byteLength)
  result.set(left)
  result.set(right, left.byteLength)
  return result
}

async function retry(operation, signal, attempts = 3) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfAborted(signal)
    try { return await operation() } catch (error) {
      lastError = error
      if (attempt === attempts - 1) throw error
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 400 * 2 ** attempt)
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason || new Error('上传已取消')) }, { once: true })
      })
    }
  }
  throw lastError
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
