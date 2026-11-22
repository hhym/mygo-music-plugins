# MyGo Music 插件合集

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的第三方音源插件，按 mygo 的插件规则写：纯 ESM、`plugin.json` 声明、`playback: "stream"`、只用 `fetch` 取数据。

一共 8 个，每个站点一个目录，界面文案全部中文写死（不提供 `locales/en.json`，宿主把语言报成 `en` 时也不会翻成英文）。

## 插件列表

| 插件 | 站点 | 版本 | 能不能播 |
| --- | --- | --- | --- |
| [世纪音乐](plugins/4c44-music/) | [www.4c44.com](https://www.4c44.com/) | 1.1.0 | 能，MP3 直链 + 动态歌词 |
| [5nd音乐](plugins/5nd-music/) | [www.5nd.com](https://www.5nd.com/) | 1.5.0 | 大部分能，电台类分片流播不了 |
| [凤梨音乐](plugins/flmp3-music/) | [www.flmp3.pro](https://www.flmp3.pro/) | 1.0.0 | 能，音频走酷我 CDN |
| [优折美音乐](plugins/uzz-music/) | [m.uzz.me](https://m.uzz.me/) | 1.0.0 | 播不了，站点接口被 CloudFront 拦了 |
| [DJ024电音](plugins/dj024-music/) | [www.dj024.com](https://www.dj024.com/) | 1.0.0 | 能，非独家完整版、独家片段 |
| [汽车音乐网](plugins/carsmp3-music/) | [www.carsmp3.com](https://www.carsmp3.com/) | 1.0.0 | 目录能看，试听走网易云匹配 |
| [猫耳FM](plugins/missevan-music/) | [www.missevan.com](https://www.missevan.com/) | 1.0.0 | 音单能，单曲是 DRM 加密 HLS |
| [听书网](plugins/tingshuwang-music/) | [www.tingshuwang.cc](https://www.tingshuwang.cc/) | 1.0.0 | 能，有声小说章节直链 |

## 安装

把某个插件目录里的 `plugin.json`、`index.js`、`README.md` 放进宿主插件目录，一个插件一个文件夹（文件夹名用 `plugin.json` 里的 `id`）：

- Windows：`%USERPROFILE%\.hulu-music\plugins\<id>\`
- macOS / Linux：`~/.hulu-music/plugins/<id>/`

或者直接解压 `dist/` 里的压缩包，把整个文件夹丢进 `plugins` 再重启 App。压缩包按显示名命名，例如 `听书网-mygo插件.zip`。

## 各插件说明

### 世纪音乐（4c44-music）

歌曲、榜单、歌单、歌手、专辑，带动态歌词。站点首页有一道一次性的勾选人机校验，插件会自动过并缓存约一小时的会话 Cookie；万一过不去，可以在插件设置里贴一条浏览器 Cookie。

### 5nd音乐（5nd-music）

歌曲、榜单、歌手、专辑、电台，带歌词。音频在 `mpge.5nd.com`，部分曲目是分片容器（m4s / flac 分片），宿主的 `stream` 只认 `mp3/flac/ogg/wav/m4a/aac`，这类会报「这段流播不了」，换一首或换音源即可。个别曲目音频域名会拒绝 App，需要在设置里贴 Cookie。

### 凤梨音乐（flmp3-music）

歌曲、音乐合集、在线试听，带歌词。站点自己不放流，`play` 接口把地址指向酷我 CDN，App 内能正常出声。

### 优折美音乐（uzz-music）

页面、搜索、歌单结构都解析完了，但站点的 `api.php` 由 CloudFront 前置，对非浏览器来源直接 403，源站也不可达。插件如实返回「站点侧故障」，等站点恢复后不用改代码。

### DJ024电音（dj024-music）

沈阳 DJ024 电音传媒，DJ 舞曲、串烧、现场。`/api/tracks/media` 给 JSON，音频在 `dns.dj024.vip` 的 m4a，`Range` 回 206 能拖进度。非独家内容是完整版，独家只给片段。

### 汽车音乐网（carsmp3-music）

Discuz! 论坛，GBK 编码，帖子当专辑、附件要回复才能下载，所以插件只做目录浏览，试听借 i-meto / injahow 的公开接口去网易云匹配同名曲。

### 猫耳FM（missevan-music）

广播剧、音乐音单、声音搜索。音单接口 `/sound/soundalllist` 里的 `soundurl` 是明文 m4a，能播；单曲接口 `/sound/getsound` 给的是 Widevine 加密 HLS，插件不去绕 DRM，从搜索结果直接点会提示加密。

### 听书网（tingshuwang-music）

有声小说站，书 = 专辑、章节 = 曲目。章节页的 `chapter_data.videourl` 是明文直链（m4a，或五集合一的 mp3），不带 UA、不带 Referer 也能取，`Range` 回 206。站点自带的 `/e/search` 对游客一律返回「没有搜索到相关的内容」，所以插件用 `/sitemap.html` 和 35 页书籍列表自建搜索索引，落在 `host.storage` 里缓存一小时，进首页时后台预热。

## 目录

```
plugins/<id>/     plugin.json + index.js + README.md
dist/             打包好的 zip，按显示名命名
```

## 说明

- 插件只读取站点公开页面与接口，不含任何破解、绕付费或绕 DRM 的逻辑。
- 音频版权归各站点与原作者，插件仅供个人学习与自用，不提供下载功能。
- 站点改版会让解析失效，改版后对应插件需要跟着调。
