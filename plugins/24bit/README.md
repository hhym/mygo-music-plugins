# 24bit无损音乐 — MyGo Music 插件

站点：<https://www.24bit.net/>

版本：`1.0.2`  
插件 ID：`24bit`

## 功能

- 首页「本周歌曲榜」「本周歌手榜」：解析首页 RSC 里的 `weekData`，歌曲与歌手都带真实封面
- 榜单页：歌曲榜会并发解析成可直接播放的单曲（站点接口 503 时保留可点击链接），歌手榜点进去按歌手名搜索
- 封面：歌曲封面取同名歌曲的专辑图，歌手头像取网易云公开搜索接口的 `picUrl`；失败时回退站点占位图
- 搜索：同时请求 16bit 与 24bit 192kHz 两个接口，返回单曲「专辑」与歌曲条目
- 专辑页：把一首单曲当作一张一首曲目的专辑，解析封面、歌手、专辑名、格式与大小
- 播放：从单曲页内嵌的 `itemMusic.url` 取 FLAC 直链；十分钟内复用页面直链，识别站点偶尔返回的 12 秒 AAC 试听片段并重新抓页；返回 `size` 与 `quality: lossless`，按 CDN 域名设置 Referer
- 歌词：优先读 `itemMusic.lrc`，不可用时从同页 RSC 的 LRC 字符串提取

## 播放链路

```text
16bit 44.1kHz：https://www.24bit.net/music/b/<id>
24bit 96kHz ：https://www.24bit.net/music/c/<id>
24bit 192kHz：https://www.24bit.net/music/a/<id>

单曲页内嵌：
"itemMusic": { "url": "https://kw-er.kuwo.cn/...flac", "format": "flac", ... }
```

音频地址带时效票据。专辑页刚取到的直链在一分钟内可复用；超过一分钟，`stream()` 会重新请求单曲页，避免票据过期。

## 搜索接口

```text
POST https://www.24bit.net/api/player/searchOnlineMusicTwo?keyword=<关键词>&page=<页码>
POST https://www.24bit.net/api/player/searchOnlineMusicOne?keyword=<关键词>&page=<页码>

Content-Type: application/json
Body: {"keyword":"...","page":1}
```

每页 30 条，字段为 `id`、`cover`、`name`、`player`、`album`。`searchOnlineMusicTwo` 是 16bit 主链路，`searchOnlineMusicOne` 是 24bit 主链路；两者都会间歇性返回 `503`，插件做了多次退避重试。

## 已知限制

- 站点是单曲站，没有真正的专辑目录。插件用「单曲即单曲专辑」的模型展示。
- 首页的 8 张 `findListAlbumOfHome` 专辑是演示数据，音频全部指向 `pan.example.com`，插件不使用。
- 搜索结果的站点封面是统一占位图，插件会用同名歌曲的网易云专辑图补全；补图失败时保留占位图。
- 榜单解析需要逐首调用 24bit 搜索接口，接口 503 时会少展示几首；页面已缓存，二次打开更快。
- 24bit 96kHz 的 `searchOnlineMusicThree` 接口不稳定，当前主链路使用 24bit 192kHz 的 `searchOnlineMusicOne`。
- 单曲页的 `itemMusic.lrc` 在 16bit 页面里可能是 `"$c"` 占位，真实 LRC 由插件从同页另一段 RSC 字符串提取。
- 站点在请求过快时会把 `itemMusic.url` 换成 12 秒的 AAC 试听片段（扩展名 `.aac`，但仍标 `format: flac`）。插件会识别并退避重抓；仍失败时明确报「只返回了试听片段」，不会把片段当整首歌播放。

## 安装

把 `24bit-1.0.2.zip` 放进 MyGo 插件目录，或在应用内选择本地插件安装。

## 文件

```text
24bit-plugin/
├── plugin.json
├── index.js
├── README.md
└── locales/
    └── zh-CN.json
```
