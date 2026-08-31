# Media Uploader for IC OSS

Standalone repository: <https://github.com/storica-oss/media-uploader-extension>

一个 Manifest V3 浏览器扩展，把 `media_bot` 的媒体处理思路重构成一个轻量的 IC OSS 投递箱：

- 拖拽或选择本地 JPEG、PNG、WebP、AVIF、GIF 和 MP4，使用 Personal Hub API Key 分片上传。
- 粘贴远程图片或 MP4 地址，扩展会抓取原文件后上传。
- 粘贴普通网页链接，保存为一篇公开的 Markdown Article，方便在 IC OSS 中继续整理。
- 支持右键菜单：在图片、视频、链接或页面上选择 `Save to IC OSS`，直接打开完整上传器。
- 支持点击投递区选文件、粘贴剪贴板截图/文件、粘贴未知后缀的媒体地址，以及将当前标签页一键加入队列。
- 队列中的图片显示缩略图；`Ctrl/Cmd + Enter` 可直接开始上传。
- 队列会保存在扩展本地 IndexedDB；关闭弹窗或重开上传页后，本地文件、链接和失败任务仍可继续处理。
- 可以把浏览器里的链接直接拖进投递区；不支持的文件类型或超出大小限制的文件会在入队时立即被拦截。
- 远程 MP4 使用流式校验和分片上传，不需要先把整个视频加载成内存 Blob；批量上传支持停止和单项重试。
- 上传前使用 SHA3-256 校验，单块失败自动重试，失败后会终止 IC OSS 临时上传会话。

## Build

```sh
npm install
npm run build
```

然后在 Chrome / Chromium 的 `chrome://extensions` 打开开发者模式，选择 `dist` 加载未打包的扩展。

## Connection

在扩展设置中填入 Personal Hub 的 Canister ID（或带 `?canisterId=` 的 URL）以及以 `phk_` 开头的 API Key。API Key 只写入当前浏览器的 extension local storage，不会注入网页。

## API boundaries

Personal Hub 当前的浏览器媒体接口只允许图片类型和 MP4；因此普通链接不会伪装成文件，而是使用 `api_create_content` 创建 Article。这保持了服务端的 MIME 校验和 Public Bucket 约束。
