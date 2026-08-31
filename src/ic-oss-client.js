import { Actor, HttpAgent } from '@dfinity/agent'
import { IDL } from '@dfinity/candid'
import { Principal } from '@dfinity/principal'
import { sha3_256 } from '@noble/hashes/sha3'

const idlFactory = ({ IDL }) => {
  const result = (value) => IDL.Variant({ Ok: value, Err: IDL.Text })
  const status = IDL.Variant({ Draft: IDL.Null, Published: IDL.Null, Archived: IDL.Null })
  const kind = IDL.Variant({ Article: IDL.Null, Gallery: IDL.Null, Video: IDL.Null })
  const visibility = IDL.Variant({ Public: IDL.Null, PrivateLibrary: IDL.Null, OwnerOnly: IDL.Null })
  const bucketClass = IDL.Variant({ Public: IDL.Null, Protected: IDL.Null })
  const gallery = IDL.Record({
    id: IDL.Nat64, slug: IDL.Text, title: IDL.Text, status,
    asset_count: IDL.Nat64, updated_at_ms: IDL.Nat64
  })
  const asset = IDL.Record({
    id: IDL.Nat64, bucket: IDL.Principal, file_id: IDL.Nat32,
    class: bucketClass, content_type: IDL.Text, size: IDL.Nat64,
    hash: IDL.Opt(IDL.Vec(IDL.Nat8)), generation: IDL.Nat64
  })
  const content = IDL.Record({
    id: IDL.Nat64, slug: IDL.Text, title: IDL.Text, body: IDL.Text,
    summary: IDL.Text, kind, cover_asset_id: IDL.Opt(IDL.Nat64),
    tags: IDL.Vec(IDL.Text), curation_weight: IDL.Int16, visibility,
    status, contributors: IDL.Vec(IDL.Principal), assets: IDL.Vec(IDL.Nat64),
    published_at_ms: IDL.Opt(IDL.Nat64), updated_at_ms: IDL.Nat64
  })
  const uploadSession = IDL.Record({
    bucket: IDL.Principal, file_id: IDL.Nat32, session_id: IDL.Vec(IDL.Nat8),
    chunk_size: IDL.Nat32, total_chunks: IDL.Nat32, expires_at: IDL.Nat64
  })
  const chunkOutput = IDL.Record({
    uploaded_chunks: IDL.Nat32, filled: IDL.Nat64, expires_at: IDL.Nat64
  })
  const uploadInput = IDL.Record({
    request_id: IDL.Vec(IDL.Nat8), name: IDL.Text, content_type: IDL.Text,
    size: IDL.Nat64, hash: IDL.Opt(IDL.Vec(IDL.Nat8))
  })
  const finishInput = IDL.Record({
    request_id: IDL.Vec(IDL.Nat8), bucket: IDL.Principal,
    session_id: IDL.Vec(IDL.Nat8)
  })
  const chunkInput = IDL.Record({
    request_id: IDL.Vec(IDL.Nat8), bucket: IDL.Principal,
    session_id: IDL.Vec(IDL.Nat8), chunk_index: IDL.Nat32,
    content: IDL.Vec(IDL.Nat8)
  })
  const articleInput = IDL.Record({
    slug: IDL.Text, title: IDL.Text, body: IDL.Text, summary: IDL.Text,
    kind, cover_asset_id: IDL.Opt(IDL.Nat64), tags: IDL.Vec(IDL.Text),
    visibility, asset_ids: IDL.Vec(IDL.Nat64), publish: IDL.Bool
  })
  return IDL.Service({
    api_list_galleries: IDL.Func([IDL.Text], [result(IDL.Vec(gallery))], ['query']),
    api_begin_image_upload: IDL.Func([IDL.Text, uploadInput], [result(uploadSession)], []),
    api_begin_media_upload: IDL.Func([IDL.Text, uploadInput], [result(uploadSession)], []),
    api_upload_image_chunk: IDL.Func([IDL.Text, chunkInput], [result(chunkOutput)], []),
    api_upload_media_chunk: IDL.Func([IDL.Text, chunkInput], [result(chunkOutput)], []),
    api_abort_image_upload: IDL.Func([IDL.Text, finishInput], [result(IDL.Bool)], []),
    api_abort_media_upload: IDL.Func([IDL.Text, finishInput], [result(IDL.Bool)], []),
    api_finish_image_upload: IDL.Func([IDL.Text, finishInput], [result(asset)], []),
    api_finish_media_upload: IDL.Func([IDL.Text, finishInput], [result(asset)], []),
    api_create_content: IDL.Func([IDL.Text, articleInput], [result(content)], [])
  })
}

function unwrap(value) {
  if (value && 'Ok' in value) return value.Ok
  throw new Error(value?.Err || 'IC OSS returned an unknown error')
}

function variantName(value) {
  return value && typeof value === 'object' ? Object.keys(value)[0] || '' : ''
}

export function resolveHub(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('请输入 Personal Hub 地址或 Canister ID')
  try {
    const canisterId = Principal.fromText(raw).toText()
    return { canisterId, host: 'https://icp-api.io', label: canisterId }
  } catch {}
  let url
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new Error('Personal Hub 地址格式无效')
  }
  const candidates = [url.searchParams.get('canisterId'), url.hostname.split('.')[0]]
  let canisterId = ''
  for (const candidate of candidates) {
    if (!candidate) continue
    try { canisterId = Principal.fromText(candidate).toText(); break } catch {}
  }
  if (!canisterId) throw new Error('自定义域名请附带 ?canisterId=<Canister ID>')
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) || url.hostname.endsWith('.localhost')
  return { canisterId, host: local ? url.origin : 'https://icp-api.io', label: url.hostname }
}

export async function createClient(hub) {
  const resolved = resolveHub(hub)
  const agent = await HttpAgent.create({ host: resolved.host })
  if (/localhost|127\.0\.0\.1/.test(resolved.host)) await agent.fetchRootKey()
  const actor = Actor.createActor(idlFactory, { agent, canisterId: resolved.canisterId })
  const session = (value) => ({
    bucket: value.bucket, fileId: value.file_id, sessionId: value.session_id,
    chunkSize: Number(value.chunk_size), totalChunks: Number(value.total_chunks)
  })
  const finish = (value) => ({
    id: value.id.toString(), contentType: value.content_type, size: Number(value.size)
  })
  return {
    resolved,
    async listGalleries(token) {
      return unwrap(await actor.api_list_galleries(token)).map((item) => ({
        id: item.id.toString(), title: item.title, status: variantName(item.status),
        assetCount: Number(item.asset_count)
      }))
    },
    async beginImageUpload(token, input) {
      return session(unwrap(await actor.api_begin_image_upload(token, {
        request_id: input.requestId, name: input.name, content_type: input.contentType,
        size: BigInt(input.size), hash: input.hash ? [input.hash] : []
      })))
    },
    async beginMediaUpload(token, input) {
      return session(unwrap(await actor.api_begin_media_upload(token, {
        request_id: input.requestId, name: input.name, content_type: input.contentType,
        size: BigInt(input.size), hash: input.hash ? [input.hash] : []
      })))
    },
    async uploadImageChunk(token, item, index, content) {
      return unwrap(await actor.api_upload_image_chunk(token, {
        request_id: requestId(), bucket: item.bucket, session_id: item.sessionId,
        chunk_index: index, content
      }))
    },
    async uploadMediaChunk(token, item, index, content) {
      return unwrap(await actor.api_upload_media_chunk(token, {
        request_id: requestId(), bucket: item.bucket, session_id: item.sessionId,
        chunk_index: index, content
      }))
    },
    async abortImageUpload(token, item) {
      return unwrap(await actor.api_abort_image_upload(token, {
        request_id: requestId(), bucket: item.bucket, session_id: item.sessionId
      }))
    },
    async abortMediaUpload(token, item) {
      return unwrap(await actor.api_abort_media_upload(token, {
        request_id: requestId(), bucket: item.bucket, session_id: item.sessionId
      }))
    },
    async finishImageUpload(token, item) {
      return finish(unwrap(await actor.api_finish_image_upload(token, {
        request_id: requestId(), bucket: item.bucket, session_id: item.sessionId
      })))
    },
    async finishMediaUpload(token, item) {
      return finish(unwrap(await actor.api_finish_media_upload(token, {
        request_id: requestId(), bucket: item.bucket, session_id: item.sessionId
      })))
    },
    async createArticle(token, input) {
      const value = unwrap(await actor.api_create_content(token, {
        slug: input.slug, title: input.title, body: input.body, summary: input.summary,
        kind: { Article: null }, cover_asset_id: [], tags: input.tags || [],
        visibility: { Public: null }, asset_ids: [], publish: input.publish !== false
      }))
      return { id: value.id.toString(), title: value.title, slug: value.slug }
    }
  }
}

export function requestId() {
  return crypto.getRandomValues(new Uint8Array(16))
}

export function createHasher() {
  return sha3_256.create()
}

export function hashBytes(bytes) {
  return sha3_256(bytes)
}
