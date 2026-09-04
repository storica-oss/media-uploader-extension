import { createHasher } from './ic-oss-client.js'

export const LIMITS = Object.freeze({
  image: 64 * 1024 * 1024,
  video: 4 * 1024 * 1024 * 1024,
  audio: 2 * 1024 * 1024 * 1024,
  game: 8 * 1024 * 1024 * 1024,
  ebook: 1 * 1024 * 1024 * 1024,
  link: 2 * 1024 * 1024
})

export const CATEGORY_LABELS = Object.freeze({ image: '图片', video: '视频', audio: '音乐', game: '游戏文件', ebook: '电子书', link: '网页链接' })
export const SUPPORTED_FORMAT_SUMMARY = '图片 · 视频 · 音乐 · 游戏 ROM · PDF · EPUB · MOBI · FB2 · CBZ/CBR'

const CATEGORY_EXTENSIONS = Object.freeze({
  image: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'ico', 'jxl'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mpeg', 'mpg', 'ogv', '3gp', 'ts', 'm2ts', 'mts', 'wmv', 'flv'],
  audio: ['mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'weba', 'aiff', 'aif', 'alac', 'wma', 'mid', 'midi', 'amr'],
  game: ['nes', 'sfc', 'smc', 'gb', 'gbc', 'gba', 'nds', '3ds', 'cia', 'n64', 'z64', 'v64', 'gen', 'md', 'smd', 'sms', 'gg', 'pce', 'ws', 'wsc', 'iso', 'cso', 'chd', 'rvz', 'gcz', 'wad', 'nsp', 'xci', 'zar', 'zip', 'rar', '7z', 'bin', 'cue'],
  ebook: ['epub', 'mobi', 'azw', 'azw3', 'fb2', 'pdf', 'djvu', 'djv', 'cbz', 'cbr', 'cbt', 'cb7', 'txt', 'md', 'markdown', 'rtf', 'doc', 'docx']
})

const EXTENSION_TYPES = Object.freeze({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif', ico: 'image/x-icon', jxl: 'image/jxl',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', m4v: 'video/x-m4v', mpeg: 'video/mpeg', mpg: 'video/mpeg', ogv: 'video/ogg', '3gp': 'video/3gpp', ts: 'video/mp2t', m2ts: 'video/mp2t', mts: 'video/mp2t', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', weba: 'audio/webm', aiff: 'audio/aiff', aif: 'audio/aiff', alac: 'audio/alac', wma: 'audio/x-ms-wma', mid: 'audio/midi', midi: 'audio/midi', amr: 'audio/amr',
  nes: 'application/octet-stream', sfc: 'application/octet-stream', smc: 'application/octet-stream', gb: 'application/octet-stream', gbc: 'application/octet-stream', gba: 'application/octet-stream', nds: 'application/octet-stream', '3ds': 'application/octet-stream', cia: 'application/octet-stream', n64: 'application/octet-stream', z64: 'application/octet-stream', v64: 'application/octet-stream', gen: 'application/octet-stream', md: 'text/markdown', smd: 'application/octet-stream', sms: 'application/octet-stream', gg: 'application/octet-stream', pce: 'application/octet-stream', ws: 'application/octet-stream', wsc: 'application/octet-stream', iso: 'application/octet-stream', cso: 'application/octet-stream', chd: 'application/octet-stream', rvz: 'application/octet-stream', gcz: 'application/octet-stream', wad: 'application/octet-stream', nsp: 'application/octet-stream', xci: 'application/octet-stream', zar: 'application/octet-stream', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', bin: 'application/octet-stream', cue: 'application/octet-stream',
  epub: 'application/epub+zip', mobi: 'application/x-mobipocket-ebook', azw: 'application/vnd.amazon.ebook', azw3: 'application/vnd.amazon.ebook', fb2: 'application/x-fictionbook+xml', pdf: 'application/pdf', djvu: 'image/vnd.djvu', djv: 'image/vnd.djvu', cbz: 'application/vnd.comicbook+zip', cbr: 'application/vnd.comicbook-rar', cbt: 'application/x-tar', cb7: 'application/x-7z-compressed', txt: 'text/plain', markdown: 'text/markdown', rtf: 'application/rtf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
})

const MIME_CATEGORIES = new Map([
  ['application/pdf', 'ebook'], ['application/epub+zip', 'ebook'], ['application/x-mobipocket-ebook', 'ebook'], ['application/vnd.amazon.ebook', 'ebook'], ['application/x-fictionbook+xml', 'ebook'], ['image/vnd.djvu', 'ebook'], ['application/vnd.comicbook+zip', 'ebook'], ['application/vnd.comicbook-rar', 'ebook'], ['text/markdown', 'ebook'], ['application/rtf', 'ebook'], ['application/msword', 'ebook'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'ebook'],
  ['application/zip', 'game'], ['application/vnd.rar', 'game'], ['application/x-7z-compressed', 'game']
])
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])
const STREAMED_REMOTE_CATEGORIES = new Set(['video', 'audio', 'game', 'ebook'])
export const UPLOAD_ACCEPT = Object.keys(EXTENSION_TYPES).map((extension) => `.${extension}`).join(',')

export async function uploadFile({ client, file, signal, onProgress, parent = 0 }) {
  const info = classifyFile(file)
  if (!info) throw new Error(`不支持的文件格式：${file.name || '未命名文件'}`)
  const { category, contentType } = info
  if (!file.size || file.size > LIMITS[category]) throw new Error(`${CATEGORY_LABELS[category]}超过 ${formatBytes(LIMITS[category])} 大小限制`)
  const fallback = category === 'video' ? 'video.mp4' : category === 'image' ? 'image.jpg' : category === 'audio' ? 'audio.mp3' : category === 'game' ? 'game.bin' : category === 'ebook' ? 'book.epub' : 'link.url.txt'
  const name = safeName(file.name, fallback)
  const asset = await client.uploadFile(file, { signal, onProgress, contentType, name, parent })
  return { type: category, asset, contentType, size: file.size }
}

export async function importRemoteMedia({ client, url, signal, onProgress, parent = 0 }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入完整的 http(s) 链接')
  onProgress?.({ phase: 'fetching', percent: 0, message: '正在读取远程文件…' })
  const response = await fetchRemote(url, signal)
  const info = classifyFile({ type: response.headers.get('content-type') || '', name: url })
  if (!info || info.category === 'link') throw new Error('这个链接不是支持的媒体或电子书文件；将保存为链接文件')
  const { category, contentType } = info
  if (STREAMED_REMOTE_CATEGORIES.has(category) && response.body?.getReader) {
    const checked = await hashResponse(response, LIMITS[category], signal, onProgress, CATEGORY_LABELS[category])
    const uploadResponse = await fetchRemote(url, signal)
    if (!uploadResponse.body?.getReader) {
      const blob = await uploadResponse.blob()
      return uploadFile({ client, file: new File([blob], remoteName(url, contentType, category), { type: contentType }), signal, onProgress, parent })
    }
    return uploadStream({ client, reader: uploadResponse.body.getReader(), name: remoteName(url, contentType, category), contentType, size: checked.size, hash: checked.hash, signal, onProgress, parent, category })
  }
  const blob = await response.blob()
  const file = new File([blob], remoteName(url, contentType, category), { type: contentType })
  return uploadFile({ client, file, signal, onProgress, parent })
}

export async function saveLink({ client, url, title, signal, onProgress, parent = 0 }) {
  if (!/^https?:\/\//i.test(url)) throw new Error('请输入完整的 http(s) 链接')
  const cleanTitle = String(title || '').trim() || new URL(url).hostname
  const linkFile = new File([`Title: ${cleanTitle.slice(0, 300)}\nURL: ${url}\nSaved from: Storica Media Uploader\n`], `${safeName(cleanTitle, 'link')}.url.txt`, { type: 'text/plain' })
  return uploadFile({ client, file: linkFile, signal, onProgress, parent })
}

async function hashResponse(response, maxBytes, signal, onProgress, label) {
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > maxBytes) throw new Error(`${label}超过 ${formatBytes(maxBytes)} 大小限制`)
  const reader = response.body.getReader()
  const hasher = createHasher()
  let size = 0
  try {
    while (true) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error(`${label}超过 ${formatBytes(maxBytes)} 大小限制`)
      hasher.update(value)
      onProgress?.({ phase: 'hashing', percent: declaredSize ? Math.round(size / declaredSize * 100) : 0, hashedBytes: size, totalBytes: declaredSize })
    }
    if (!size) throw new Error(`远程${label}为空`)
    onProgress?.({ phase: 'hashing', percent: 100, hashedBytes: size, totalBytes: size })
    return { size, hash: hasher.digest() }
  } catch (error) {
    await reader.cancel().catch(() => {})
    hasher.destroy?.()
    throw error
  }
}

async function uploadStream({ client, reader, name, contentType, size, hash, signal, onProgress, parent = 0, category }) {
  const asset = await client.uploadStream({ reader, name: safeName(name, 'remote-file.bin'), contentType, size, hash, signal, onProgress, parent })
  return { type: category, asset, contentType, size }
}

async function fetchRemote(url, signal) {
  const response = await fetch(url, { credentials: 'omit', redirect: 'follow', cache: 'no-store', signal })
  if (!response.ok) throw new Error(`远程地址返回 HTTP ${response.status}`)
  return response
}

export function classifyFile(file) {
  const name = String(file?.name || '')
  const contentType = mediaType(file)
  const extension = fileExtension(name)
  // `.md` is ambiguous with Mega Drive ROMs. In an extension-selected file
  // with no reliable MIME, Markdown is the safer and more useful default;
  // ROM users can use `.smd` or an explicit application/octet-stream MIME.
  const declaredType = String(file?.type || '').split(';')[0].trim().toLowerCase()
  let category = /\.url\.txt$/i.test(name)
    ? 'link'
    : ['md', 'markdown'].includes(extension) && (declaredType === '' || declaredType === 'text/markdown')
      ? 'ebook'
      : categoryForExtension(extension)
  if (category === 'link') return { category, contentType, extension, label: CATEGORY_LABELS[category] }
  if (!category) category = categoryForMime(contentType)
  if (!category) return null
  return { category, contentType, extension, label: CATEGORY_LABELS[category] }
}

export function fileCategory(file) { return classifyFile(file)?.category || '' }

export function mediaType(file) {
  const declared = String(file?.type || '').split(';')[0].trim().toLowerCase()
  const extension = fileExtension(file?.name)
  const extensionType = EXTENSION_TYPES[extension]
  const extensionCategory = categoryForExtension(extension)
  const declaredCategory = categoryForMime(declared)
  if (extension === 'md' && declared === 'application/octet-stream') return declared
  if (extensionType && (GENERIC_TYPES.has(declared) || !declaredCategory || declaredCategory === extensionCategory)) return extensionType
  if (declared) return declared
  return extensionType || 'application/octet-stream'
}

function categoryForExtension(extension) {
  for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) if (extensions.includes(extension)) return category
  return ''
}

function categoryForMime(type) {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return MIME_CATEGORIES.get(type) || ''
}

function fileExtension(name) {
  const value = String(name || '').toLowerCase().split(/[?#]/)[0]
  return value.match(/\.([a-z0-9]{1,12})$/)?.[1] || ''
}

function remoteName(url, type, category) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    if (name && /\.[a-z0-9]{1,12}$/i.test(name)) return name.slice(-160)
  } catch {}
  const fallbackExtension = Object.entries(EXTENSION_TYPES).find(([, value]) => value === type)?.[0]
  return `remote-${category}.${fallbackExtension || 'bin'}`
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
  const category = classifyFile({ name: String(url || ''), type: '' })?.category
  return category && category !== 'link' ? category : 'auto'
}
