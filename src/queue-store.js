const DATABASE_NAME = 'media-uploader-queue'
const DATABASE_VERSION = 1
const STORE_NAME = 'items'

export async function loadQueue() {
  try {
    const db = await openDatabase()
    const items = await request(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll())
    return items.map((item) => ({
      ...item,
      status: item.status === 'done' || item.status === 'error' ? item.status : 'ready',
      progress: item.status === 'done' ? 100 : 0,
      phase: '',
      preview: ''
    }))
  } catch {
    return []
  }
}

export async function saveQueue(items) {
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.clear()
    for (const item of items) {
      store.put({
        id: item.id,
        kind: item.kind,
        label: item.label,
        detail: item.detail,
        url: item.url || '',
        title: item.title || '',
        parent: Number.isSafeInteger(item.parent) && item.parent >= 0 ? item.parent : 0,
        folderPath: Array.isArray(item.folderPath) && item.folderPath.length ? item.folderPath.slice(0, 64) : ['根目录'],
        status: item.status === 'done' || item.status === 'error' ? item.status : 'ready',
        error: item.error || '',
        result: item.result || null,
        file: item.file || null
      })
    }
    await transactionComplete(transaction)
  } catch {
    // Queue persistence is an enhancement; an unavailable private browsing
    // database must not block a normal in-memory upload.
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function request(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error || new Error('Queue transaction aborted'))
  })
}
