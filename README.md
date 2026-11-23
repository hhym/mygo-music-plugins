# MyGo Music 插件合集

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的第三方音源插件，按 mygo 的插件规则写：纯 ESM、`plugin.json` 声明、`playback: "stream"`、只用 `fetch` 取数据。

一共 42 个，每个站点一个目录。42 个都带 `locales/zh-CN.json`，其中 14 个另有 `en.json`（6 个真翻译、8 个占位），详见下文「locales 现状」。

## 插件列表（42 个）

按类型分四组：音乐 21 个、DJ音乐 2 个、听书 18 个、评书 1 个。组内保持加入的先后（和 git 提交顺序一致）。版本号取自各插件 `plugin.json`，「能不能播」来自 2026-11-23 的全量探测，详见 [docs/探测基线-2026-11-23.md](docs/探测基线-2026-11-23.md)。

### 音乐（21 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [世纪音乐](plugins/4c44-music/) | [www.4c44.com](https://www.4c44.com/) | `4c44-music` | 1.1.0 | 能，MP3 直链 + 动态歌词（首页要过一次勾选校验，首次请求偏慢） |
| 2 | [5nd音乐](plugins/5nd-music/) | [www.5nd.com](https://www.5nd.com/) | `5nd-music` | 1.6.0 | 只认浏览器：UA、Cookie、http/https 都试过，音频域名一律 302 到 127.0.0.1，默认自动跳浏览器 |
| 3 | [凤梨音乐](plugins/flmp3-music/) | [www.flmp3.pro](https://www.flmp3.pro/) | `flmp3-music` | 1.0.0 | 能，站点自己不放流，地址指向酷我 CDN |
| 4 | [优折美音乐](plugins/uzz-music/) | [m.uzz.me](https://m.uzz.me/) | `uzz-music` | 1.0.0 | 能，走网易云同名直链（早先记录的「CloudFront 拦截」已不成立，2026-11-23 更正） |
| 5 | [汽车音乐网](plugins/carsmp3-music/) | [www.carsmp3.com](https://www.carsmp3.com/) | `carsmp3-music` | 1.0.0 | 目录能看，试听走网易云同名匹配 |
| 6 | [闪闪音乐](plugins/33ve/) | [www.33ve.com](https://www.33ve.com/) | `33ve` | 1.0.0 | 能，MP3 + LRC |
| 7 | [5sing](plugins/5sing/) | [5sing.kugou.com](https://5sing.kugou.com/) | `5sing` | 1.0.0 | 能，原创 / 翻唱 / 伴奏 |
| 8 | [动感酷音乐](plugins/dgcol/) | [www.dgcol.com](https://www.dgcol.com/) | `dgcol` | 1.0.0 | 能，但首页只有榜单、没有直挂曲目，自动探测取不到 id |
| 9 | [GD音乐台](plugins/gdstudio/) | [music.gdstudio.org](https://music.gdstudio.org/) | `gdstudio` | 1.0.0 | 能，公开聚合 API |
| 10 | [好听轻音乐](plugins/htqyy/) | [www.htqyy.com](http://www.htqyy.com/) | `htqyy` | 1.0.0 | 能，轻音乐 MP3 |
| 11 | [米乐迪音乐](plugins/imelody/) | [imelody.top](https://imelody.top/) | `imelody` | 1.0.0 | 能，FLAC / MP3 |
| 12 | [米粒音乐](plugins/milimusic/) | [www.milimusic.cn](http://www.milimusic.cn/) | `milimusic` | 1.0.0 | 播放走网易云同名匹配，首页串行抓页，自检约 40 秒 |
| 13 | [无名音乐](plugins/mvmp3/) | [www.mvmp3.com](https://www.mvmp3.com/) | `mvmp3` | 1.0.0 | 能，MP3 + LRC |
| 14 | [小蜜蜂音乐](plugins/xmfwav/) | [www.xmfwav.com](https://www.xmfwav.com/) | `xmfwav` | 1.0.1 | 能，优先网易云 MP3，首页是榜单式布局 |
| 15 | [VY音乐](plugins/yyvy/) | [www.yyvy.cn](https://www.yyvy.cn/) | `yyvy` | 1.0.0 | 能，原创与榜单 |
| 16 | [听听网](plugins/tingting/) | [www.ttw.cx](https://www.ttw.cx/) | `tingting` | 1.0.1 | 能，绕过 PHP session 校验，借酷我直链 |
| 17 | [九天音乐](plugins/nine-sky/) | [www.9sky.com](https://www.9sky.com/) | `nine-sky` | 1.0.1 | 能，MP3 + 批量封面 |
| 18 | [布谷音乐](plugins/buguyy-music/) | [www.buguyy.top](https://www.buguyy.top/) | `buguyy-music` | 1.0.0 | 能，320kbps MP3 直链 |
| 19 | [一起听歌吧](plugins/jusic-room/) | [happy.alang.run](https://happy.alang.run/) | `jusic-room` | 1.0.0 | 跟随房间，正在播放与队列能播，搜索只有元数据 |
| 20 | [糖豆音乐](plugins/tangdou/) | [www.tangdou.com/music](https://www.tangdou.com/music/) | `tangdou` | 0.1.0 | 能，MP3 直链；搜索为本地遍历匹配 |
| 21 | [广场舞地盘](plugins/gcwdp/) | [www.gcwdp.com](https://www.gcwdp.com/) | `gcwdp` | 1.0.0 | 能，试听地址现取（auth_key 十来分钟过期），站点 GB2312 无 JSON 接口 |

### DJ音乐（2 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [DJ024电音](plugins/dj024-music/) | [www.dj024.com](https://www.dj024.com/) | `dj024-music` | 1.0.0 | 能，非独家是完整版，独家只给片段 |
| 2 | [36DJ舞曲](plugins/36dj-music/) | [www.36dj.com](https://www.36dj.com/) | `36dj-music` | 1.0.0 | 能，m4a 直链带 vsid 令牌，可拖进度 |

### 听书（18 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [猫耳FM](plugins/missevan-music/) | [www.missevan.com](https://www.missevan.com/) | `missevan-music` | 1.0.0 | 音单能，单曲是 Widevine 加密 HLS |
| 2 | [听书网](plugins/tingshuwang-music/) | [www.tingshuwang.cc](https://www.tingshuwang.cc/) | `tingshuwang-music` | 1.0.0 | 能，章节明文直链 |
| 3 | [恋听网](plugins/ting55/) | [ting55.com](https://ting55.com/) | `ting55` | 1.0.0 | 能，章节 token 换 MP3；云主机出口偶尔回 503 |
| 4 | [飞卢听书](plugins/faloo/) | [ts.faloo.com](http://ts.faloo.com) | `faloo` | 0.1.1 | 能，源站 MP3 直链，解析失败回退蜻蜓 FM |
| 5 | [275听书](plugins/i275/) | [m.i275.com](https://m.i275.com) | `i275` | 0.1.1 | 能，播放页被服务端 302，走蜻蜓 FM 兜底 |
| 6 | [听FM电台](plugins/tingfm/) | [cn.tingfm.com](https://cn.tingfm.com) | `tingfm` | 0.1.1 | 能，m3u8 直播流，另带蜻蜓兜底 |
| 7 | [悦听吧](plugins/yuetingba/) | [www.yuetingba.cn](http://www.yuetingba.cn) | `yuetingba` | 0.1.4 | 能，全站 1002 本，单集直链，失败回退蜻蜓 |
| 8 | [85听书网](plugins/85ting/) | [www.85ting.com](https://www.85ting.com/) | `85ting` | 0.2.0 | 能，HE-AAC 用本机 ffmpeg 转 AAC-LC；站点回源 503 频繁，插件双域名并发重试 |
| 9 | [环球听书](plugins/hqkomics/) | [hqkomics.com](https://hqkomics.com/) | `hqkomics` | 0.1.0 | 能，喜马拉雅 CDN 的 m4a 直链，Range 206 |
| 10 | [更快听书](plugins/gkbasic/) | [gkbasic.com](https://gkbasic.com/) | `gkbasic` | 0.1.0 | 能，同上，详情在 `/basic/` |
| 11 | [爱上听书](plugins/kmbas/) | [kmbas.com](https://kmbas.com/) | `kmbas` | 0.1.0 | 能，同上，书号和集号前缀不同 |
| 12 | [59听书](plugins/ting59/) | [59ting.com](https://59ting.com/) | `ting59` | 0.1.0 | 能，详情 `/ting/`，m4a 206 |
| 13 | [三九听书](plugins/sanjiuwang/) | [sanjiuwang.com](https://sanjiuwang.com/) | `sanjiuwang` | 0.1.0 | 能，m4a 206 |
| 14 | [瓜播听书](plugins/guabo/) | [guabo.net](https://guabo.net/) | `guabo` | 0.1.0 | 206 可播（实测 m4a） |
| 15 | [伊薇听书](plugins/eweizhi/) | [www.eweizhi.com](https://www.eweizhi.com/) | `eweizhi` | 0.1.0 | 站点当前 520（Cloudflare 源站错误） |
| 16 | [一一听书](plugins/eyihu/) | [eyihu.com](https://eyihu.com/) | `eyihu` | 0.1.0 | 站点当前回 503 |
| 17 | [我爱听书](plugins/ipangxie/) | [ipangxie.com](https://ipangxie.com/) | `ipangxie` | 0.1.0 | 站点当前回 503，详情在 `/book/` |
| 18 | [幻听听书](plugins/q062/) | [2q06.com](https://2q06.com/) | `q062` | 0.1.0 | 站点当前 520，详情在 `/view/` |

### 评书（1 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [单田芳评书网](plugins/pingshu5/) | [www.pingshu5.net](http://www.pingshu5.net) | `pingshu5` | 0.1.1 | 能，源音频是微信语音、易失效，走蜻蜓 FM 兜底 |

## 安装

把某个插件目录里的 `plugin.json`、`index.js`、`README.md` 放进宿主插件目录，一个插件一个文件夹（文件夹名用 `plugin.json` 里的 `id`）：

- Windows：`%USERPROFILE%\.hulu-music\plugins\<id>\`
- macOS / Linux：`~/.hulu-music/plugins/<id>/`

或者直接解压压缩包，把整个文件夹丢进 `plugins` 再重启 App。压缩包按显示名命名，例如 `听书网-mygo插件.zip`。

两个下载入口，内容完全一样：

- [Releases](https://github.com/hhym/mygo-music-plugins/releases/latest)：每个插件一个 zip，文件名是 `id-版本.zip`，例如 `5nd-music-1.6.0.zip`（纯 ASCII，不会因中文名下载乱码）；
- 仓库内 `dist/` 目录：中文显示名命名的同名包，不带版本号，随 main 分支更新。

## 音乐

普通歌曲站：榜单、歌单、歌手、专辑、搜索与歌词。

### 世纪音乐（4c44-music）

歌曲、榜单、歌单、歌手、专辑，带动态歌词。站点首页有一道一次性的勾选人机校验，插件会自动过并缓存约一小时的会话 Cookie；万一过不去，可以在插件设置里贴一条浏览器 Cookie。

### 5nd音乐（5nd-music）

歌曲、榜单、歌手、专辑、电台，带歌词。音频在 `mpge.5nd.com`，部分曲目是分片容器（m4s / flac 分片），宿主的 `stream` 只认 `mp3/flac/ogg/wav/m4a/aac`，这类会报「这段流播不了」，换一首或换音源即可。个别曲目音频域名会拒绝 App，需要在设置里贴 Cookie。

### 凤梨音乐（flmp3-music）

歌曲、音乐合集、在线试听，带歌词。站点自己不放流，`play` 接口把地址指向酷我 CDN，App 内能正常出声。

### 优折美音乐（uzz-music）

页面、搜索、歌单结构都解析完了，但站点的 `api.php` 由 CloudFront 前置，对非浏览器来源直接 403，源站也不可达。插件如实返回「站点侧故障」，等站点恢复后不用改代码。

### 汽车音乐网（carsmp3-music）

Discuz! 论坛，GBK 编码，帖子当专辑、附件要回复才能下载，所以插件只做目录浏览，试听借 i-meto / injahow 的公开接口去网易云匹配同名曲。

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

## DJ音乐

舞曲、串烧、电音现场。

### DJ024电音（dj024-music）

沈阳 DJ024 电音传媒，DJ 舞曲、串烧、现场。`/api/tracks/media` 给 JSON，音频在 `dns.dj024.vip` 的 m4a，`Range` 回 206 能拖进度。非独家内容是完整版，独家只给片段。

### 36DJ舞曲（36dj-music）

帝国CMS 老站，DJ 舞曲、串烧与车载大碟，中文 / 英文 / 慢摇五类分类加人气榜。详情页 `var info = { "playurl": "2026/3611/16eva/36dj_17590.m4a" }` 给出路径，音频在 `tn2.72djapp.cn`；**裸地址一律 403，必须带 `?vsid=` 令牌**，令牌来自 `/js/lb/a.js`（`var vsid = '…'` + `var vsidExpire = <unix 秒>`），约十分钟一换。插件每次播放重新取令牌，令牌刚生成 90 秒内直接用，探测回 403 就强制重取；带令牌即 206 + `audio/mp4`，能拖进度。搜索是帝国CMS 原生 POST + `searchid` 翻页；下载页只有登录引导，不做。

## 听书

有声小说、广播剧、电台。

### 猫耳FM（missevan-music）

广播剧、音乐音单、声音搜索。音单接口 `/sound/soundalllist` 里的 `soundurl` 是明文 m4a，能播；单曲接口 `/sound/getsound` 给的是 Widevine 加密 HLS，插件不去绕 DRM，从搜索结果直接点会提示加密。

### 听书网（tingshuwang-music）

有声小说站，书 = 专辑、章节 = 曲目。章节页的 `chapter_data.videourl` 是明文直链（m4a，或五集合一的 mp3），不带 UA、不带 Referer 也能取，`Range` 回 206。站点自带的 `/e/search` 对游客一律返回「没有搜索到相关的内容」，所以插件用 `/sitemap.html` 和 35 页书籍列表自建搜索索引，落在 `host.storage` 里缓存一小时，进首页时后台预热。

### 恋听网（ting55）

有声小说站，书 = 专辑、集 = 曲目。章节页读取一次性 token 调 `POST /nlinka` 换 `pp.ting55.com` 的 MP3，失败时走移动版 `/glink` 兜底。

### 飞卢听书（faloo）

GBK 页面，书页 `/listen/<id>.html`，音频为 `tss.faloo.com` 的 MP3 直链；解析失败按书名回退蜻蜓 FM。

### 275听书（i275）

移动端书库，首页与搜索可用；播放页会被服务端 302 回首页，音频回退蜻蜓 FM。

### 听FM电台（tingfm）

电台页 `tingfm.net/radio/<id>` 可解析 `playlist.m3u8` 直播流，另带蜻蜓兜底。

### 悦听吧（yuetingba）

分类 `/book/<id>/1`、详情 `/book/detail/<uuid>/<page>`；搜索走站内 `/search?type=1&name=<q>&pageIndex=1`，「全部专辑」按 9 个分类合并去重、逐页翻完，全站 1002 本（快照见 `data/yuetingba-all-albums.json`）；支持 `album({id})` 读取整本专辑全部章节（每 200 集一页），例如《超品相师》2280 集、《庆余年》1865 集；单集播放调 `/api/app/docs-listen/<章节ID>/audio-url` 拿 MP3 直链，失败才回退蜻蜓。

### 85听书网（85ting）

首页与分类解析 `/ting/<id>.html` 卡片；分类 `/list/85X.html`，分页 `/list/85X-N.html`；搜索走 `POST /search.php` 的 `searchword`；专辑读取 `/ting/<id>.html` 的 `vlink` 全部章节；播放页 `var now="..."` 即当前集音频，源多为喜马拉雅 HE-AAC；插件默认调用本机 ffmpeg 转成 AAC-LC 再播放，缓存 8 集到插件数据目录，没有 ffmpeg 时会在设置里提示。站点回源经常 503，插件用 `www.85ting.com` 与 `85ting.com` 双域名、每轮 3 并发、最多 6 轮重试。

### 环球听书（hqkomics）

站点：https://hqkomics.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 更快听书（gkbasic）

站点：https://gkbasic.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 爱上听书（kmbas）

站点：https://kmbas.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 59听书（ting59）

站点：https://59ting.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 三九听书（sanjiuwang）

站点：https://sanjiuwang.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 瓜播听书（guabo）

站点：https://guabo.net。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 伊薇听书（eweizhi）

站点：https://www.eweizhi.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 一一听书（eyihu）

站点：https://eyihu.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 我爱听书（ipangxie）

站点：https://ipangxie.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

### 幻听听书（q062）

站点：https://2q06.com。有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。首页 / 分类卡片 `/mp3/<id>.html`（或站点自己的详情前缀）、分类页 `<前缀>/<tid>.html`、分页 `-<n>.html`；详情页给书名、封面、播讲与全部章节 `/play/<pid>-0-<i>.html`；播放页里 `var now="…"` 即当前集地址。站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引，缓存 30 分钟再匹配。

## 评书

传统评书，单一站点。

### 单田芳评书网（pingshu5）

`/pbook/<slug>.html` 书页与栏目页，源音频是微信语音直链，易失效，默认回退蜻蜓 FM。

## 目录

```
plugins/<id>/     plugin.json + index.js + README.md（可选 locales/）
dist/             打包好的 zip，按显示名命名（中文名，随 main 更新）
release/          打包好的 zip，id-版本 命名（ASCII，发 Releases 用）
```

## 说明

- 插件只读取站点公开页面与接口，不含任何破解、绕付费或绕 DRM 的逻辑。
- 音频版权归各站点与原作者，插件仅供个人学习与自用，不提供下载功能。
- 站点改版会让解析失效，改版后对应插件需要跟着调。

## 仓库维护

几个脚本加两个 GitHub Actions，维护这套插件不用再手工打包、手工翻页核对。

| 脚本 | 作用 |
| --- | --- |
| `./scripts/pack.sh` | 从 `plugin.json` 读 id / 显示名 / 版本，统一产出 `dist/<显示名>-mygo插件.zip` 与 `release/<id>-<版本>.zip`，`locales/` 有就一起打进去 |
| `./scripts/pack.sh <id>` | 只重打一个插件，例如 `./scripts/pack.sh 36dj-music` |
| `./scripts/pack.sh --check` | 只比对，不动文件：解压 `dist/` 里的包读 `plugin.json`，版本与源码不符就报「过期」，缺包报「缺失」 |
| `./scripts/locales.mjs` | 从 `index.js` 抓出所有 `t("…")` 原文，补 `locales/zh-CN.json`；`--check` 只报告谁还缺 |
| `./scripts/probe.mjs` | 逐个插件跑 `home` → `stream` → 1 KB `Range` 验证，出一张表；`./scripts/probe.mjs <id>` 只探一个，`--json` 便于两次结果比对 |
| `./scripts/gate.mjs` | 跑一遍探测并和 `docs/基线.json` 比：有插件从「可播」掉下来就退出码 1；`--update` 把这次结果收成新基线 |

`dist/` 之前出过一次包落后于插件目录的情况（包里还是旧版本），`--check` 就是为这个加的门：CI 里跑一次，不一致会亮红。

### locales 现状

42 个插件都有 `locales/zh-CN.json`（中文说法锁定，不受宿主语言影响）。其中 14 个带 `en.json`：

- 6 个是真英文翻译：5nd音乐、布谷音乐、一起听歌吧、九天音乐、听听网、广场舞地盘；
- 8 个是恒等映射（原文 → 原文）：36DJ舞曲、世纪音乐、汽车音乐网、DJ024电音、凤梨音乐、猫耳FM、听书网、优折美音乐——只做占位，挡住宿主自动机翻把术语翻乱，要真英文请逐条替换 `en.json` 的值。

剩下 28 个没有 `en.json`，英文界面显示中文原文，这是明确取舍，不是漏做。

### 定时探测

- `.github/workflows/probe.yml`：每周一 09:00（北京时间）跑一遍 `probe.mjs` 和 `pack.sh --check`，结果写进 Job Summary 并留 artifact。**注意 runner 在海外**，国内站点回 403 / 503 属预期，不能当插件失效的判据；真正的基线在自己的国内机器上跑同一脚本。
- `.github/workflows/scout.yml`：手动触发，填一个 URL，用海外出口抓回原始页面（附 Referer / UA），页面进 artifact。适合本机出口被站点拦住（403、503）时，先看清对方页面结构再改插件。

### 文档

- `docs/探测基线-2026-11-23.md`：国内出口的全量探测。当天上午首版（可播 15）留着，修订版（可播 24，解释了探测脚本截断 id 与蜻蜓接口变更两处更正）为准；
- `docs/受阻站点.md`：查了但验证不了的站（72DJ 被三个出口全拒、dju8 只有 wma），附本机复核命令。

### 发版门槛

`node scripts/gate.mjs` 是发版前的最后一步：它跑一遍全量探测，和 `docs/基线.json` 里记录的上一版对比。

- 插件从「可播」掉到「坏」→ 退出码 1，列出来拦你；
- 掉到「出口被拒」（403/503）→ 只提示、不拦，这是网络问题不是插件问题；
- 新插件不在基线里 → 单独列一行提醒；
- 确认退化可以接受（比如站点真下架了）再跑 `--update` 收进基线。

基线是 `probe.mjs --json` 的原始输出，带时间戳，所以「什么时候、谁的版本、什么状态」都留得住。


### 糖豆音乐（tangdou）

`api-h5.tangdou.com` 的 `/pc/music/list` 分「舞曲推荐 type=1」「新歌速递 type=2」，每页 30 首；`/pc/music/play?id=` 返回歌名、作者、封面、歌词和 `mp3qiniu.tangdou.com` 的 MP3 直链。站点没有公开搜索接口，搜索改为并发遍历两类前 7 页做本地匹配。

### 广场舞地盘（gcwdp）

整站 DedeCMS、GB2312 编码，一条 JSON 接口都没有，插件自带一张 GB2312 码表：既解响应字节，也把搜索词编回 GB2312 —— 站内搜索按 GBK 字节比对标题，直接发 UTF-8 永远是 0 条（`广场舞` 本身还是站点的搜索停用词，搜它固定 0 条，别的词正常）。列表页两套模板（`title-text` 和纯文字 `doc-tit`），解析以标题元素为锚点往前找链接和封面，两套都能吃。试听走详情页那个 iframe 的 `/plus/shiting_new.php?id=`，`<audio src="https://3.gcwdp.com/shiting/st-….mp3?auth_key=…">` 裸请求 206、能 Range；这条地址只认文章页本身作 Referer，且 auth_key 十来分钟过期，所以现取现播、只缓存两分钟。下载是收费的（`/plus/hidden.php` 按订单号解锁），插件不碰；站内也无歌词。
