export const STORAGE_KEY = 'media-uploader-settings'

export const DEFAULTS = Object.freeze({
  hub: '',
  apiKey: '',
  hubLabel: '',
  connectedAt: ''
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
    hub: String(input.hub || '').trim(),
    apiKey: String(input.apiKey || '').trim(),
    hubLabel: String(input.hubLabel || '').trim(),
    connectedAt: String(input.connectedAt || '').trim()
  }
}

export function isBound(value) {
  const settings = normalize(value)
  return Boolean(settings.hub && settings.apiKey)
}
