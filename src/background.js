const MENU_ROOT = 'media-uploader-root'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT,
      title: 'Save to IC OSS',
      contexts: ['all']
    })
    chrome.contextMenus.create({
      id: 'upload-image',
      parentId: MENU_ROOT,
      title: 'Upload image',
      contexts: ['image']
    })
    chrome.contextMenus.create({
      id: 'upload-video',
      parentId: MENU_ROOT,
      title: 'Upload video',
      contexts: ['video']
    })
    chrome.contextMenus.create({
      id: 'save-link',
      parentId: MENU_ROOT,
      title: 'Save link as article',
      contexts: ['link', 'page']
    })
  }).catch(() => {})
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-uploader') openUploader()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const kind = info.menuItemId === 'upload-image'
    ? 'image'
    : info.menuItemId === 'upload-video'
      ? 'video'
      : info.menuItemId === 'save-link'
        ? 'link'
        : ''
  if (!kind) return
  const url = info.srcUrl || info.linkUrl || info.pageUrl || tab?.url || ''
  const title = info.selectionText || tab?.title || ''
  openUploader(url, kind, title)
})

function openUploader(url = '', kind = '', title = '') {
  const query = new URLSearchParams()
  if (url) query.set('url', url)
  if (kind) query.set('kind', kind)
  if (title) query.set('title', title.slice(0, 240))
  chrome.tabs.create({
    url: `${chrome.runtime.getURL('uploader.html')}?${query}`
  }).catch(() => {})
}
