# 85听书网 插件

站点：https://www.85ting.com

按 MyGo Music 插件规范实现，支持首页、分类、搜索、专辑详情、播放、喜欢与历史。

- 首页 / 分类：解析 `/ting/<id>.html` 卡片；分类 `/list/85X.html`，分页 `/list/85X-N.html`
- 搜索：站内 `POST /search.php`，字段 `searchword`
- 专辑：读取 `/ting/<id>.html`，解析 `vlink` 下的全部章节 `/play/<vid>-<from>-<part>.html`
- 播放：播放页里 `var now="..."` 即当前集音频，源多为喜马拉雅 HE-AAC
- HE-AAC 兼容：默认用 ffmpeg 转成 AAC-LC 再播放，缓存 8 集到插件数据目录；葫芦音乐 3.0.94 起自带 ffmpeg（`host.ffmpegPath`），不用装系统版；可在设置里关闭转码
- 站点回源不稳定：单请求 3.5 秒超时，2 轮 × 2 并发，站点挂了约 7 秒给出人话提示

## 0.2.1

- 请求加超时（单次 3.5 s），重试从 6 轮 × 3 并发收敛到 2 轮 × 2 并发；站点 503 / 半开连接时约 7 秒给出「站点响应超时或连不上」，原来是 26 秒
- 播放地址做 HTML 反转义（`&amp;` 这类实体会还原，避免拼出坏 URL）
- 「喜欢」同时保存曲目本身，重启后不再整页空（原来只存 id，内存里的 known 一清就找不回）
- 卡片解析更稳：`title` 在 `<a>` 属性上、或里面只有 `span.title` / `i` 都能取到标题，原来带属性 title 的卡片会被整条丢掉

## 0.2.2

- 优先用播放器自带的 ffmpeg：`host.ffmpegPath` 有值就直接跑它，不再挨个试 `PATH`、`C:\ffmpeg\bin`、`C:\Program Files\ffmpeg\bin`
- 兜底再加一条：`<数据目录>/ffmpeg/ffmpeg.exe`（`host.dataDir` 往上找 `plugin-data`）
- 转码失败文案改成「转码失败（音频是 HE-AAC，要靠 ffmpeg 转成 AAC-LC）…」，不再误导成「需要本机安装 ffmpeg」
