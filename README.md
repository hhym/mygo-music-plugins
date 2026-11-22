# MyGo Music 插件合集

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的第三方音源插件，按 mygo 的插件规则写：纯 ESM、`plugin.json` 声明、`playback: "stream"`、只用 `fetch` 取数据。

一共 23 个，每个站点一个目录。早期插件界面文案中文写死；新加的四个带 `locales/`（`zh-CN.json` + `en.json`），宿主语言是 `en` 时显示英文。

## 插件列表

| 插件 | 站点 | 版本 | 能不能播 |
| --- | --- | --- | --- |
| [世纪音乐](plugins/4c44-music/) | [www.4c44.com](https://www.4c44.com/) | 1.1.0 | 能，MP3 直链 + 动态歌词 |
| [5nd音乐](plugins/5nd-music/) | [www.5nd.com](https://www.5nd.com/) | 1.6.0 | 音频域名只认浏览器，默认自动跳浏览器 |
| [凤梨音乐](plugins/flmp3-music/) | [www.flmp3.pro](https://www.flmp3.pro/) | 1.0.0 | 能，音频走酷我 CDN |
| [优折美音乐](plugins/uzz-music/) | [m.uzz.me](https://m.uzz.me/) | 1.0.0 | 播不了，站点接口被 CloudFront 拦了 |
| [DJ024电音](plugins/dj024-music/) | [www.dj024.com](https://www.dj024.com/) | 1.0.0 | 能，非独家完整版、独家片段 |
| [汽车音乐网](plugins/carsmp3-music/) | [www.carsmp3.com](https://www.carsmp3.com/) | 1.0.0 | 目录能看，试听走网易云匹配 |
| [猫耳FM](plugins/missevan-music/) | [www.missevan.com](https://www.missevan.com/) | 1.0.0 | 音单能，单曲是 DRM 加密 HLS |
| [听书网](plugins/tingshuwang-music/) | [www.tingshuwang.cc](https://www.tingshuwang.cc/) | 1.0.0 | 能，有声小说章节直链 |

## 新增插件（11 个）

| 插件 | 站点 | 版本 | 能不能播 |
| --- | --- | --- | --- |
| [闪闪音乐](plugins/33ve/) | [www.33ve.com](https://www.33ve.com/) | 1.0.0 | 能，MP3 直链 + LRC |
| [5sing](plugins/5sing/) | [5sing.kugou.com](https://5sing.kugou.com/) | 1.0.0 | 能，原创 / 翻唱 / 伴奏 |
| [动感酷音乐](plugins/dgcol/) | [www.dgcol.com](https://www.dgcol.com/) | 1.0.0 | 能，每日热歌与歌词 |
| [GD音乐台](plugins/gdstudio/) | [music.gdstudio.org](https://music.gdstudio.org/) | 1.0.0 | 能，公开聚合 API |
| [好听轻音乐](plugins/htqyy/) | [www.htqyy.com](http://www.htqyy.com/) | 1.0.0 | 能，轻音乐 MP3 |
| [米乐迪音乐](plugins/imelody/) | [imelody.top](https://imelody.top/) | 1.0.0 | 能，FLAC / MP3 |
| [米粒音乐](plugins/milimusic/) | [www.milimusic.cn](http://www.milimusic.cn/) | 1.0.0 | 播放走网易云同名匹配 |
| [无名音乐](plugins/mvmp3/) | [www.mvmp3.com](https://www.mvmp3.com/) | 1.0.0 | 能，MP3 + LRC |
| [恋听网](plugins/ting55/) | [ting55.com](https://ting55.com/) | 1.0.0 | 能，章节 token 换 MP3 |
| [小蜜蜂音乐](plugins/xmfwav/) | [www.xmfwav.com](https://www.xmfwav.com/) | 1.0.1 | 能，优先网易云 MP3 |
| [VY音乐](plugins/yyvy/) | [www.yyvy.cn](https://www.yyvy.cn/) | 1.0.0 | 能，原创与榜单 |

## 新增插件（4 个）

| 插件 | 站点 | 版本 | 能不能播 |
| --- | --- | --- | --- |
| [听听网](plugins/tingting/) | [www.ttw.cx](https://www.ttw.cx/) | 1.0.1 | 能，歌词页借酷我直链 |
| [九天音乐](plugins/nine-sky/) | [www.9sky.com](https://www.9sky.com/) | 1.0.1 | 能，MP3 + 批量封面 |
| [布谷音乐](plugins/buguyy-music/) | [www.buguyy.top](https://www.buguyy.top/) | 1.0.0 | 能，320kbps MP3 直链 |
| [一起听歌吧](plugins/jusic-room/) | [happy.alang.run](https://happy.alang.run/) | 1.0.0 | 跟随房间，正在播放/队列能播，搜索只读 |

## 安装

把某个插件目录里的 `plugin.json`、`index.js`、`README.md` 放进宿主插件目录，一个插件一个文件夹（文件夹名用 `plugin.json` 里的 `id`）：

- Windows：`%USERPROFILE%\.hulu-music\plugins\<id>\`
- macOS / Linux：`~/.hulu-music/plugins/<id>/`

或者直接解压压缩包，把整个文件夹丢进 `plugins` 再重启 App。压缩包按显示名命名，例如 `听书网-mygo插件.zip`。

两个下载入口，内容完全一样：

- 单个插件带版本号：[Releases](https://github.com/hhym/mygo-music-plugins/releases/latest) 里每个插件一个 zip，例如 `5nd音乐-1.6.0-mygo插件.zip`；
- 仓库内 `dist/` 目录：不带版本号的同名 zip，随 main 分支更新。

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

### 闪闪音乐（33ve）

榜单、歌单、歌手、搜索，在线 MP3 与 LRC 歌词。

### 5sing（5sing）

原创、翻唱、伴奏榜单，歌单广场、音乐人主页、搜索、播放与歌词。

### 动感酷音乐（dgcol）

每日热歌、近期更新、搜索、在线播放和歌词。

### GD音乐台（gdstudio）

站点是 SPA，插件直接调用公开聚合 API，提供榜单、歌单、搜索、歌词与在线播放。

### 好听轻音乐（htqyy）

轻音乐精选、分类、榜单、搜索与 MP3 播放。

### 米乐迪音乐（imelody）

按年代浏览华语乐坛编年史，热门经典、最新收录、搜索、歌词与 FLAC / MP3 播放。

### 米粒音乐（milimusic）

站点是 GB2312 页面，插件内置 GBK 解码表；站点本身只有 Flash 播放器，播放与歌词按歌名、歌手匹配网易云。

### 无名音乐（mvmp3）

榜单、歌单、歌手、专辑、搜索，在线试听 MP3 并显示 LRC 歌词。

### 恋听网（ting55）

有声小说站，书 = 专辑、集 = 曲目。章节页读取一次性 token 调 `POST /nlinka` 换 `pp.ting55.com` 的 MP3，失败时走移动版 `/glink` 兜底。

### 小蜜蜂音乐（xmfwav）

新歌、热门排行、歌手作品、搜索、歌词；播放优先匹配网易云 MP3，避免站内 Ogg 试听在部分播放器上无法出声。

### VY音乐（yyvy）

最新原创音乐、热门试听、高分推荐、榜单、分类、搜索与在线播放。

### 听听网（tingting）

页面先过一道 PHP session 的「安全验证」再弹 Cookie，插件用随机 Cookie + 重载绕过去；音频不解 `playen.js` 的加密，改从 `/js/play.php` 拿 `lkid`（酷我 rid）走酷我直链，实测 206。

### 九天音乐（nine-sky）

歌手、专辑、榜单、搜索与 MP3 播放；专辑与歌手页会批量补封面，`requestHeaders` 里带了站点的 Referer。

### 布谷音乐（buguyy-music）

Nuxt SPA，只有 `hotlist` / `newlist` / `search` / `geturl` 四条公开接口，搜索固定 50 条无分页；音频是酷我 `car-*.kuwo.cn` 的 320kbps MP3，裸请求 206，封面路径里的尺寸换成了 `{size}`。

### 一起听歌吧（jusic-room）

Jusic 听歌房（未开源前端 + `Jusic-Serve-Houses` 后端），内容全走 SockJS + STOMP，插件用 xhr 轮询实现匿名进房。只读跟随：正在播放与待播队列带服务端签好的直链，能播；搜索只有元数据（直链只在点歌入队那一刻签出来），所以搜索条目标为不可播，插件从不发 `/music/pick`，不往房间投歌。

## 目录

```
plugins/<id>/     plugin.json + index.js + README.md（可选 locales/）
dist/             打包好的 zip，按显示名命名
```

## 说明

- 插件只读取站点公开页面与接口，不含任何破解、绕付费或绕 DRM 的逻辑。
- 音频版权归各站点与原作者，插件仅供个人学习与自用，不提供下载功能。
- 站点改版会让解析失效，改版后对应插件需要跟着调。
