export const STORAGE_KEY = 'media-uploader-settings'

export const DEFAULTS = Object.freeze({
  bucket: '',
  accessToken: '',
  bucketLabel: '',
  connectedAt: '',
  uploadFolderId: 0,
  uploadFolderName: '根目录',
  uploadFolderPath: ['根目录']
})

export async function loadSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return normalize(result[STORAGE_KEY])
}

export async function saveSettings(value) {
  const settings = normalize(value)
  await chrome.storage.local.set({ [STORAGE_KEY]: settings })
  return settings
}

export async function clearSettings() {
  await chrome.storage.local.remove(STORAGE_KEY)
  return { ...DEFAULTS }
}

export function normalize(value) {
  const input = value && typeof value === 'object' ? value : {}
  return {
    bucket: String(input.bucket || '').trim(),
    accessToken: String(input.accessToken || '').trim(),
    bucketLabel: String(input.bucketLabel || '').trim(),
    connectedAt: String(input.connectedAt || '').trim(),
    uploadFolderId: Number.isSafeInteger(Number(input.uploadFolderId)) && Number(input.uploadFolderId) >= 0
      ? Number(input.uploadFolderId)
      : 0,
    uploadFolderName: String(input.uploadFolderName || '根目录').trim() || '根目录',
    uploadFolderPath: Array.isArray(input.uploadFolderPath) && input.uploadFolderPath.length
      ? input.uploadFolderPath.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 64)
      : ['根目录']
  }
}

export function isBound(value) {
  const settings = normalize(value)
  return Boolean(settings.bucket && settings.accessToken)
}
