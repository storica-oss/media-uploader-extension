# Media Uploader for IC OSS

Standalone repository: <https://github.com/storica-oss/media-uploader-extension>

一个 Manifest V3 浏览器扩展，把 `media_bot` 的媒体处理思路重构成一个轻量的 IC OSS 投递箱：

- 拖拽或选择本地图片、视频、音乐、游戏 ROM 和电子书，使用 IC OSS access token 直接上传到 Bucket。
- 图片支持 JPEG、PNG、WebP、AVIF、GIF、SVG、BMP、TIFF、HEIC/HEIF、ICO、JXL；视频支持 MP4、WebM、MOV、MKV、AVI、M4V、MPEG、OGV、3GP、TS 等常见格式。
- 音乐支持 MP3、M4A/M4B、AAC、WAV、FLAC、OGG/OGA、OPUS、WebM Audio、AIFF、ALAC、WMA、MIDI、AMR；游戏支持 NES、GB/GBC/GBA、NDS、3DS/CIA、SFC/SMC、N64、MD/GEN、PS/光盘镜像、CHD、RVZ、NSP/XCI 及常见归档文件。
- 电子书支持 EPUB、MOBI、AZW/AZW3、FB2、PDF、DJVU、CBZ/CBR/CBT/CB7、TXT、Markdown、RTF、DOC/DOCX。
- 粘贴远程图片、视频、音乐或电子书地址，扩展会抓取原文件后上传。
- 粘贴普通网页链接，保存为一个 `.url.txt` 文件，和其他素材一样进入 IC OSS。
- 支持右键菜单：在图片、视频、链接或页面上选择 `Save to IC OSS`，直接打开完整上传器。
- 支持点击投递区选文件、粘贴剪贴板截图/文件、粘贴未知后缀的媒体地址，以及将当前标签页一键加入队列。
- 队列中的图片显示缩略图；`Ctrl/Cmd + Enter` 可直接开始上传。
- 上传前可选择 Bucket 根目录或任意可见子目录，也可以在扩展内创建目录；每个队列项会记住加入时的目标目录。
- 支持选择整个本地文件夹，上传前会自动在目标目录下补齐同名子目录并保留相对路径；同一批次会复用已创建的目录，减少重复请求。
- 也可以直接把文件夹拖入投递区；扩展会递归读取嵌套文件夹，并与“选择文件夹”使用相同的目录映射规则。
- 队列会保存在扩展本地 IndexedDB；关闭弹窗或重开上传页后，本地文件、链接和失败任务仍可继续处理。
- 可以把浏览器里的链接直接拖进投递区；不支持的文件类型或超出大小限制的文件会在入队时立即被拦截。
- 远程视频、音乐、游戏文件和电子书使用流式校验和分片上传，不需要先把整个文件加载成内存 Blob；批量上传支持停止和单项重试。
- 大文件优先使用 IC OSS 原子上传会话：先校验 SHA3-256，再分片上传、提交；取消或失败会自动中止会话，上传过程会自动续期。缺少 `Folder.Read` 的旧 Token 会兼容回退到旧分片接口。

## Build

```sh
npm install
npm run build
```

然后在 Chrome / Chromium 的 `chrome://extensions` 打开开发者模式，选择 `dist` 加载未打包的扩展。

## Connection

在扩展设置中填入 IC OSS Bucket 的 Canister ID（或带 `?canisterId=` 的 URL）以及委托 access token。也可以在 OSS Admin 的“安全与访问 → 上传 Token 管理”中生成或升级 Token，点击“复制扩展绑定配置”，再回到扩展设置点击“从剪贴板导入”，或直接将绑定 JSON 粘贴到任意字段，即可自动填入两项配置。Token 支持 `base64:…`、base64url 和 `hex:…` 格式，只写入当前浏览器的 extension local storage，不会注入网页。

根目录上传至少需要 `Bucket.Write:File`；大文件分片上传建议同时包含 `File.Write`。如果上传到指定目录，可使用 `Folder.Write.File:<目录ID>`（作用于目标目录或其父级）替代 Bucket 级文件写权限。需要浏览或创建上传目录时，请额外使用 `Folder.Read`、`Folder.List` 和 `Bucket.Write:Folder`；选择本地文件夹时还需要 `Bucket.Write:Folder` 来自动创建缺失的子目录。权限不足时，更新扩展设置中的 Token 后，直接点击队列项“重试”即可。

## API boundaries

扩展内置 IC OSS Bucket 的最小 Candid 客户端。小文件直接调用 `create_file`；大文件优先调用 `get_folder_info`、`begin_upload`、`upload_chunk`、`commit_upload`，并在失败时调用 `abort_upload`。Token 会作为每次 Bucket 调用的 delegated access token 传入；请使用精确 audience、最小权限和较短有效期的 token。原子上传需要 `Folder.Read`，否则会自动兼容旧的 `create_file`、`update_file_chunk`、`update_file_info` 链路。
