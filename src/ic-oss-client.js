import { Actor, HttpAgent } from '@dfinity/agent'
import { IDL } from '@dfinity/candid'
import { Principal } from '@dfinity/principal'
import { sha3_256 } from '@noble/hashes/sha3.js'

const CHUNK_SIZE = 256 * 1024
const MAX_FILE_SIZE_PER_CALL = 1024 * 2048

const idlFactory = ({ IDL }) => {
  const metadataValue = IDL.Variant({
    Int: IDL.Int,
    Nat: IDL.Nat,
    Blob: IDL.Vec(IDL.Nat8),
    Text: IDL.Text
  })
  const pluginState = IDL.Record({
    id: IDL.Text,
    permissions: IDL.Opt(IDL.Vec(IDL.Text)),
    api_version: IDL.Nat16,
    updated_at_ms: IDL.Nat64,
    source_url: IDL.Opt(IDL.Text),
    version: IDL.Opt(IDL.Text),
    enabled: IDL.Bool,
    config_revision: IDL.Nat64,
    manifest_sha256: IDL.Opt(IDL.Vec(IDL.Nat8)),
    package_sha256: IDL.Opt(IDL.Vec(IDL.Nat8))
  })
  const readerPolicy = IDL.Record({
    allow_by_hash: IDL.Bool,
    enabled: IDL.Bool,
    authority: IDL.Opt(IDL.Principal)
  })
  const websiteConfig = IDL.Record({
    root_name: IDL.Text,
    enabled: IDL.Bool,
    folder_id: IDL.Opt(IDL.Nat32)
  })
  const httpReadMode = IDL.Variant({
    TokenProtected: IDL.Null,
    Disabled: IDL.Null,
    Public: IDL.Null,
    Legacy: IDL.Null
  })
  const contentCipher = IDL.Variant({ XChaCha20Poly1305: IDL.Null })
  const fileKeyEnvelope = IDL.Record({
    cipher: contentCipher,
    aad_hash: IDL.Vec(IDL.Nat8),
    version: IDL.Nat16,
    nonce: IDL.Vec(IDL.Nat8),
    wrapped_dek: IDL.Vec(IDL.Nat8)
  })
  const encryptionInfo = IDL.Record({
    nonce_prefix: IDL.Vec(IDL.Nat8),
    plaintext_size: IDL.Nat64,
    envelope: fileKeyEnvelope,
    object_id: IDL.Vec(IDL.Nat8),
    cipher: contentCipher,
    version: IDL.Nat16,
    plaintext_chunk_size: IDL.Nat32,
    zone_id: IDL.Vec(IDL.Nat8)
  })
  const bucketInfo = IDL.Record({
    plugins: IDL.Opt(IDL.Vec(pluginState)),
    status: IDL.Int8,
    reader_policy: IDL.Opt(readerPolicy),
    total_chunks: IDL.Nat64,
    trusted_eddsa_pub_keys: IDL.Vec(IDL.Vec(IDL.Nat8)),
    managers: IDL.Vec(IDL.Principal),
    governance_canister: IDL.Opt(IDL.Principal),
    name: IDL.Text,
    max_custom_data_size: IDL.Nat16,
    auditors: IDL.Vec(IDL.Principal),
    website: IDL.Opt(websiteConfig),
    http_read_mode: IDL.Opt(httpReadMode),
    encryption_writes: IDL.Opt(IDL.Bool),
    total_files: IDL.Nat64,
    vetkd_derivation: IDL.Opt(IDL.Bool),
    max_children: IDL.Nat16,
    enable_hash_index: IDL.Bool,
    max_file_size: IDL.Nat64,
    folder_id: IDL.Nat32,
    visibility: IDL.Nat8,
    max_folder_depth: IDL.Nat8,
    trusted_ecdsa_pub_keys: IDL.Vec(IDL.Vec(IDL.Nat8)),
    total_folders: IDL.Nat64,
    file_id: IDL.Nat32
  })
  const result = (value, error = IDL.Text) => IDL.Variant({ Ok: value, Err: error })
  const createFileInput = IDL.Record({
    dek: IDL.Opt(IDL.Vec(IDL.Nat8)),
    status: IDL.Opt(IDL.Int8),
    content: IDL.Opt(IDL.Vec(IDL.Nat8)),
    custom: IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, metadataValue))),
    hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    name: IDL.Text,
    size: IDL.Opt(IDL.Nat64),
    encryption: IDL.Opt(encryptionInfo),
    content_type: IDL.Text,
    parent: IDL.Nat32
  })
  const createFileOutput = IDL.Record({ id: IDL.Nat32, created_at: IDL.Nat64 })
  const ensureFolderInput = IDL.Record({ request_id: IDL.Vec(IDL.Nat8), name: IDL.Text, parent: IDL.Nat32 })
  const ensureFolderOutput = IDL.Record({ id: IDL.Nat32, created: IDL.Bool, created_at: IDL.Nat64, revision: IDL.Nat64 })
  const folderInfo = IDL.Record({
    id: IDL.Nat32,
    files: IDL.Vec(IDL.Nat32),
    status: IDL.Int8,
    updated_at: IDL.Nat64,
    name: IDL.Text,
    folders: IDL.Vec(IDL.Nat32),
    created_at: IDL.Nat64,
    revision: IDL.Nat64,
    parent: IDL.Nat32
  })
  const syncError = IDL.Variant({
    Internal: IDL.Text,
    InvalidInput: IDL.Text,
    NotFound: IDL.Text,
    PermissionDenied: IDL.Text,
    Unauthorized: IDL.Text,
    LimitExceeded: IDL.Text,
    Conflict: IDL.Record({ entries: IDL.Vec(IDL.Record({ id: IDL.Nat32, kind: IDL.Variant({ Folder: IDL.Null, File: IDL.Null }) })), message: IDL.Text })
  })
  const updateFileChunkInput = IDL.Record({
    id: IDL.Nat32,
    chunk_index: IDL.Nat32,
    content: IDL.Vec(IDL.Nat8)
  })
  const updateFileChunkOutput = IDL.Record({ updated_at: IDL.Nat64, filled: IDL.Nat64 })
  const updateFileInput = IDL.Record({
    id: IDL.Nat32,
    status: IDL.Opt(IDL.Int8),
    custom: IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, metadataValue))),
    hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    name: IDL.Opt(IDL.Text),
    size: IDL.Opt(IDL.Nat64),
    content_type: IDL.Opt(IDL.Text)
  })
  const updateFileOutput = IDL.Record({ updated_at: IDL.Nat64 })
  return IDL.Service({
    get_bucket_info: IDL.Func([IDL.Opt(IDL.Vec(IDL.Nat8))], [result(bucketInfo)], ['query']),
    list_folders: IDL.Func([IDL.Nat32, IDL.Opt(IDL.Nat32), IDL.Opt(IDL.Nat32), IDL.Opt(IDL.Vec(IDL.Nat8))], [result(IDL.Vec(folderInfo))], ['query']),
    create_folder: IDL.Func([IDL.Record({ name: IDL.Text, parent: IDL.Nat32 }), IDL.Opt(IDL.Vec(IDL.Nat8))], [result(createFileOutput)], []),
    ensure_folder: IDL.Func([ensureFolderInput, IDL.Opt(IDL.Vec(IDL.Nat8))], [result(ensureFolderOutput, syncError)], []),
    create_file: IDL.Func([createFileInput, IDL.Opt(IDL.Vec(IDL.Nat8))], [result(createFileOutput)], []),
    update_file_chunk: IDL.Func([updateFileChunkInput, IDL.Opt(IDL.Vec(IDL.Nat8))], [result(updateFileChunkOutput)], []),
    update_file_info: IDL.Func([updateFileInput, IDL.Opt(IDL.Vec(IDL.Nat8))], [result(updateFileOutput)], [])
  })
}

export function resolveBucket(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('请输入 IC OSS Bucket Canister ID')
  try {
    const canisterId = Principal.fromText(raw).toText()
    return { canisterId, host: 'https://icp-api.io', label: canisterId }
  } catch {}

  let url
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new Error('Bucket Canister 地址格式无效')
  }
  const candidates = [url.searchParams.get('canisterId'), url.hostname.split('.')[0]]
  let canisterId = ''
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      canisterId = Principal.fromText(candidate).toText()
      break
    } catch {}
  }
  if (!canisterId) throw new Error('自定义域名请附带 ?canisterId=<Canister ID>')
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) || url.hostname.endsWith('.localhost')
  return { canisterId, host: local ? url.origin : 'https://icp-api.io', label: url.hostname }
}

export async function createClient(bucketValue, accessTokenValue) {
  const resolved = resolveBucket(bucketValue)
  const accessToken = decodeAccessToken(accessTokenValue)
  const agent = await HttpAgent.create({ host: resolved.host })
  if (/localhost|127\.0\.0\.1/.test(resolved.host)) await agent.fetchRootKey()
  const actor = Actor.createActor(idlFactory, {
    agent,
    canisterId: resolved.canisterId
  })
  const token = [accessToken]

  return {
    resolved,
    async getBucketInfo() {
      return unwrap(await actor.get_bucket_info(token))
    },
    async listFolders(parent = 0) {
      return unwrap(await actor.list_folders(parent, [], [100], token))
    },
    async createFolder(name, parent = 0) {
      return unwrap(await actor.create_folder({ name, parent }, token))
    },
    async ensureFolder(name, parent = 0) {
      const requestId = new Uint8Array(16)
      crypto.getRandomValues(requestId)
      return unwrap(await actor.ensure_folder({ request_id: requestId, name, parent }, token))
    },
    async uploadFile(file, { signal, onProgress, contentType = file.type || 'application/octet-stream', name = file.name, parent = 0 } = {}) {
      throwIfAborted(signal)
      const size = file.size
      if (size <= MAX_FILE_SIZE_PER_CALL) {
        const content = new Uint8Array(await file.arrayBuffer())
        const hash = sha3_256(content)
        const result = unwrap(await actor.create_file(createInput({ file, name, contentType, size, content, hash, parent }), token))
        onProgress?.({ phase: 'uploading', percent: 100, uploadedBytes: size, totalBytes: size })
        return asset(result.id, contentType, size)
      }

      const created = unwrap(await actor.create_file(createInput({ file, name, contentType, size, parent }), token))
      const reader = file.stream().getReader()
      const result = await uploadReader({
        actor, token, reader, id: created.id, size, hash: null, signal, onProgress
      })
      return asset(result.id, contentType, size)
    },
    async uploadStream({ reader, name, contentType, size, hash, signal, onProgress, parent = 0 }) {
      throwIfAborted(signal)
      const created = unwrap(await actor.create_file({
        dek: [], status: [], content: [], custom: [], hash: [], name,
        size: [BigInt(size)], encryption: [], content_type: contentType, parent
      }, token))
      const result = await uploadReader({
        actor, token, reader, id: created.id, size, hash, signal, onProgress
      })
      return asset(result.id, contentType, size)
    }
  }
}

async function uploadReader({ actor, token, reader, id, size, hash, signal, onProgress }) {
  const hasher = sha3_256.create()
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
      while (pending.byteLength >= CHUNK_SIZE) {
        const chunk = pending.slice(0, CHUNK_SIZE)
        pending = pending.slice(CHUNK_SIZE)
        hasher.update(chunk)
        await retry(() => actor.update_file_chunk({ id, chunk_index: index, content: chunk }, token), signal)
        index += 1
        uploaded += chunk.byteLength
        onProgress?.({ phase: 'uploading', percent: Math.round(uploaded / size * 100), uploadedBytes: uploaded, totalBytes: size })
      }
      if (uploaded + pending.byteLength > size) throw new Error('远程内容超过首次校验结果')
    }
    if (pending.byteLength) {
      hasher.update(pending)
      await retry(() => actor.update_file_chunk({ id, chunk_index: index, content: pending }, token), signal)
      uploaded += pending.byteLength
      onProgress?.({ phase: 'uploading', percent: 100, uploadedBytes: uploaded, totalBytes: size })
    }
    if (uploaded !== size) throw new Error(`内容已变化：预期 ${size} 字节，实际 ${uploaded} 字节`)
    const finalHash = hasher.digest()
    if (hash && !sameBytes(hash, finalHash)) throw new Error('远程内容在两次读取之间发生变化，请重试')
    unwrap(await actor.update_file_info({
      id, status: [], custom: [], hash: [finalHash], name: [], size: [BigInt(size)], content_type: []
    }, token))
    return { id }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function createInput({ file, name = file.name, contentType, size, content = null, hash = null, parent = 0 }) {
  return {
    dek: [],
    status: [],
    content: content ? [content] : [],
    custom: [],
    hash: hash ? [hash] : [],
    name,
    size: [BigInt(size)],
    encryption: [],
    content_type: contentType,
    parent
  }
}

function asset(id, contentType, size) {
  return { id: String(id), contentType, size }
}

function unwrap(value) {
  if (value && 'Ok' in value) return value.Ok
  throw new Error(formatError(value?.Err))
}

function formatError(error) {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const key = Object.keys(error)[0]
    const value = error[key]
    return typeof value === 'string' ? value : value?.message || key || 'IC OSS 请求失败'
  }
  return 'IC OSS 请求失败'
}

function concatBytes(left, right) {
  const result = new Uint8Array(left.byteLength + right.byteLength)
  result.set(left)
  result.set(right, left.byteLength)
  return result
}

function sameBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false
  return left.every((byte, index) => byte === right[index])
}

async function retry(operation, signal, attempts = 3) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfAborted(signal)
    try {
      const result = await operation()
      if (result && 'Err' in result) throw new Error(formatError(result.Err))
      return result
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1) throw error
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 400 * 2 ** attempt)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(signal.reason || new Error('上传已取消'))
        }, { once: true })
      })
    }
  }
  throw lastError
}

export function decodeAccessToken(value) {
  let raw = String(value || '').trim()
  if (!raw) throw new Error('请输入 IC OSS access token')
  const separator = raw.indexOf(':')
  const prefix = separator > 0 ? raw.slice(0, separator).toLowerCase() : ''
  if (prefix === 'base64' || prefix === 'base64url') raw = raw.slice(separator + 1)
  if (raw.toLowerCase().startsWith('hex:')) return decodeHex(raw.slice(4))

  const compact = raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[a-z0-9+/]*={0,2}$/i.test(compact)) throw new Error('access token 必须是 base64 或 base64url 编码')
  const padded = compact.padEnd(Math.ceil(compact.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (bytes.length < 16) throw new Error('token 太短')
    return bytes
  } catch {
    throw new Error('access token 不是有效的 base64 编码')
  }
}

function decodeHex(value) {
  const compact = value.replace(/\s+/g, '')
  if (!/^(?:[0-9a-f]{2})+$/i.test(compact)) throw new Error('hex access token 格式无效')
  const bytes = Uint8Array.from(compact.match(/../g), (pair) => Number.parseInt(pair, 16))
  if (bytes.length < 16) throw new Error('token 太短')
  return bytes
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || new Error('上传已取消')
}

export function createHasher() {
  return sha3_256.create()
}
