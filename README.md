# MyGo Music 插件合集

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的第三方音源插件，按 mygo 的插件规则写：纯 ESM、`plugin.json` 声明、`playback: "stream"`、只用 `fetch` 取数据。

一共 54 个，每个站点一个目录。54 个都带 `locales/zh-CN.json`，其中 14 个另有 `en.json`（6 个真翻译、8 个占位），详见下文「locales 现状」。

## 插件列表（54 个）

按类型分四组：音乐 28 个、DJ音乐 2 个、听书 21 个、评书 3 个。组内保持加入的先后（和 git 提交顺序一致）。版本号取自各插件 `plugin.json`；原有 44 个的「能不能播」来自 2026-11-23 的全量探测（详见 [docs/探测基线-2026-11-23.md](docs/探测基线-2026-11-23.md)），后加入的九个为 2026-11-24/25 单独实测。

### 音乐（28 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [世纪音乐](plugins/4c44-music/) | [www.4c44.com](https://www.4c44.com/) | `4c44-music` | 1.1.0 | 能，MP3 直链 + 动态歌词（首页要过一次勾选校验，首次请求偏慢） |
| 2 | [5nd音乐](plugins/5nd-music/) | [www.5nd.com](https://www.5nd.com/) | `5nd-music` | 1.6.2 | 能，内置 `Hm_lpvt_*` 统计 Cookie 后 App 内 206 直链，并把音频总大小交给播放器（时长可显示）；个别曲目仍被 302 时自动跳浏览器 |
| 3 | [凤梨音乐](plugins/flmp3-music/) | [www.flmp3.pro](https://www.flmp3.pro/) | `flmp3-music` | 1.0.0 | 能，站点自己不放流，地址指向酷我 CDN |
| 4 | [优折美音乐](plugins/uzz-music/) | [m.uzz.me](https://m.uzz.me/) | `uzz-music` | 1.0.0 | 能，走网易云同名直链（早先记录的「CloudFront 拦截」已不成立，2026-11-23 更正） |
| 5 | [汽车音乐网](plugins/carsmp3-music/) | [www.carsmp3.com](https://www.carsmp3.com/) | `carsmp3-music` | 1.0.2 | 目录能看，试听走网易云同名匹配；内置 GBK 兜底解码、封面带 Referer、返回音频大小 |
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
| 22 | [IN音乐网](plugins/inmp3/) | [inmp3.com](https://inmp3.com/) | `inmp3` | 0.1.0 | 能，详情页 base64 解出酷我 MP3 直链，实测 4.3MB、Range 206 |
| 23 | [放屁网](plugins/fangpiw/) | [www.fangpiw.com](https://www.fangpiw.com/) | `fangpiw` | 0.1.0 | 能出声，但播放接口给的是 `audition/` 试听片段（实测不足 1MB），不是整曲 |
| 24 | [7082音乐网](plugins/music7082/) | [www.7082.cn](https://www.7082.cn/) | `music7082` | 0.1.0 | 能，`POST /skin/xle_dj197/play.php` 返回 MP3 直链，实测 6MB、Range 206 |
| 25 | [无忧音乐网](plugins/ting05/) | [ting05.com](https://ting05.com/) | `ting05` | 0.1.0 | 能，详情页 APlayer m4a；默认 ffmpeg 本地缓存，仓库探测远程地址 206 |
| 26 | [番茄音乐](plugins/fanqie-music/) | [www.novelfm.com](https://www.novelfm.com/) | `fanqie-music` | 1.0.0 | 能，SSR 歌曲页取 m4a 直链（206），返回音频大小；网页版无搜索接口，搜索为首页 200 首本地匹配 |
| 27 | [大米饭](plugins/damifan-music/) | [api.damifan.top](https://api.damifan.top/) | `damifan-music` | 0.1.0 | 能，APK 里的曲库在 `api.buguyy.cc`；站内 `geturl4` 恒空、`playurl` 全空（只挂夸克网盘），播放改走同源布谷按曲名匹配取酷我直链，随机 10 首 10/10 命中 |
| 28 | [24bit无损音乐](plugins/24bit/) | [www.24bit.net](https://www.24bit.net/) | `24bit` | 1.0.3 | 能，首页榜单实时解析并补全歌曲/歌手封面；榜单页可直接播放解析出的单曲，搜索同时列 16bit 44.1kHz 与 24bit 192kHz，单曲页取 FLAC 直链；24bit 96kHz 接口不稳定，未作主链路 |

### DJ音乐（2 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [DJ024电音](plugins/dj024-music/) | [www.dj024.com](https://www.dj024.com/) | `dj024-music` | 1.0.0 | 能，非独家是完整版，独家只给片段 |
| 2 | [36DJ舞曲](plugins/36dj-music/) | [www.36dj.com](https://www.36dj.com/) | `36dj-music` | 1.0.0 | 能，m4a 直链带 vsid 令牌，可拖进度 |

### 听书（21 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [猫耳FM](plugins/missevan-music/) | [www.missevan.com](https://www.missevan.com/) | `missevan-music` | 1.0.0 | 音单能，单曲是 Widevine 加密 HLS |
| 2 | [听书网](plugins/tingshuwang-music/) | [www.tingshuwang.cc](https://www.tingshuwang.cc/) | `tingshuwang-music` | 1.0.0 | 能，章节明文直链 |
| 3 | [恋听网](plugins/ting55/) | [ting55.com](https://ting55.com/) | `ting55` | 1.0.0 | 能，章节 token 换 MP3；云主机出口偶尔回 503 |
| 4 | [275听书](plugins/i275/) | [m.i275.com](https://m.i275.com) | `i275` | 0.1.1 | 能，播放页被服务端 302，走蜻蜓 FM 兜底 |
| 5 | [听FM电台](plugins/tingfm/) | [cn.tingfm.com](https://cn.tingfm.com) | `tingfm` | 0.2.0 | 能，蜻蜓 FM 频道聚合首页，频道页 60 期，签名 m4a 可播 |
| 6 | [悦听吧](plugins/yuetingba/) | [www.yuetingba.cn](http://www.yuetingba.cn) | `yuetingba` | 0.1.4 | 能，全站 1002 本，单集直链，失败回退蜻蜓 |
| 7 | [85听书网](plugins/85ting/) | [www.85ting.com](https://www.85ting.com/) | `85ting` | 0.2.2 | 能，HE-AAC 用 ffmpeg 转 AAC-LC；优先用播放器自带的那份（`host.ffmpegPath`），站点 503 时约 7 秒报人话 |
| 8 | [环球听书](plugins/hqkomics/) | [hqkomics.com](https://hqkomics.com/) | `hqkomics` | 0.1.0 | 能，喜马拉雅 CDN 的 m4a 直链，Range 206 |
| 9 | [更快听书](plugins/gkbasic/) | [gkbasic.com](https://gkbasic.com/) | `gkbasic` | 0.1.0 | 能，同上，详情在 `/basic/` |
| 10 | [爱上听书](plugins/kmbas/) | [kmbas.com](https://kmbas.com/) | `kmbas` | 0.1.0 | 能，同上，书号和集号前缀不同 |
| 11 | [59听书](plugins/ting59/) | [59ting.com](https://59ting.com/) | `ting59` | 0.1.0 | 能，详情 `/ting/`，m4a 206 |
| 12 | [三九听书](plugins/sanjiuwang/) | [sanjiuwang.com](https://sanjiuwang.com/) | `sanjiuwang` | 0.1.0 | 能，m4a 206 |
| 13 | [瓜播听书](plugins/guabo/) | [guabo.net](https://guabo.net/) | `guabo` | 0.1.0 | 206 可播（实测 m4a） |
| 14 | [伊薇听书](plugins/eweizhi/) | [www.eweizhi.com](https://www.eweizhi.com/) | `eweizhi` | 0.1.0 | 站点当前 520（Cloudflare 源站错误） |
| 15 | [一一听书](plugins/eyihu/) | [eyihu.com](https://eyihu.com/) | `eyihu` | 0.1.0 | 站点当前回 503 |
| 16 | [我爱听书](plugins/ipangxie/) | [ipangxie.com](https://ipangxie.com/) | `ipangxie` | 0.1.0 | 站点当前回 503，详情在 `/book/` |
| 17 | [幻听听书](plugins/q062/) | [2q06.com](https://2q06.com/) | `q062` | 0.1.0 | 站点当前 520，详情在 `/view/` |
| 18 | [听友听书](plugins/tingyou/) | [www.tingyou.fm](https://www.tingyou.fm/listening) | `tingyou` | 0.1.0 | 206 可播（实测 mp3） |
| 19 | [石头听书](plugins/shitou/) | [www.shitou.club](https://www.shitou.club/list/cls/10042.html) | `shitou` | 0.2.0 | 能，B 站 m4s 直连、边下边播（应用自己能解 fMP4 里的 AAC-LC）；本机有 ffmpeg 时先重封装到本地，拖动更顺 |
| 20 | [易听书网](plugins/yitingshu/) | [www.yitingshu.com](https://www.yitingshu.com/) | `yitingshu` | 0.1.0 | 首页/专辑可用，xmcdn m4a 直链已取得；当前云主机出口被 CDN 403 |
| 21 | [99听书网](plugins/ting99/) | [www.ting99.com](https://www.ting99.com/) | `ting99` | 0.1.0 | 首页可用；专辑/播放页当前 520，源站恢复后可播 |

### 评书（3 个）

| # | 插件 | 站点 | 目录 | 版本 | 目前能不能播 |
| --- | --- | --- | --- | --- | --- |
| 1 | [单田芳评书网](plugins/pingshu5/) | [www.pingshu5.net](http://www.pingshu5.net) | `pingshu5` | 0.1.1 | 能，源音频是微信语音、易失效，走蜻蜓 FM 兜底 |
| 2 | [我听评书网](plugins/qmtsw/) | [www.qmtsw.com](https://www.qmtsw.com/) | `qmtsw` | 0.1.0 | 当前源站 520；此前可解析 217 集专辑章节 |
| 3 | [娓雅评书](plugins/wpingshu/) | [www.wpingshu.com](https://www.wpingshu.com/) | `wpingshu` | 0.1.0 | 能，xmcdn 的 m4a 回 206；个别老集文件已被清，换一集听 |

## 安装

把某个插件目录里的 `plugin.json`、`index.js`、`README.md` 放进宿主插件目录，一个插件一个文件夹（文件夹名用 `plugin.json` 里的 `id`）：

- Windows：`%USERPROFILE%\.hulu-music\plugins\<id>\`
- macOS / Linux：`~/.hulu-music/plugins/<id>/`

或者直接解压压缩包，把整个文件夹丢进 `plugins` 再重启 App。压缩包一律按 `id-版本` 命名（纯 ASCII，例如 `hqkomics-0.1.0.zip`），中文显示名写在各插件 `plugin.json` 的 `name`、`index.js` 首行注释和上表的「插件」列里，不进文件名——避免中文名在 Windows/macOS 解压时乱码。

两个下载入口，内容完全一样：

- [Releases](https://github.com/hhym/mygo-music-plugins/releases/latest)：每个插件一个 zip，文件名是 `id-版本.zip`，例如 `5nd-music-1.6.1.zip`（纯 ASCII，不会因中文名下载乱码）；
- 仓库内 `dist/` 目录：`<id>-<版本>.zip`，同样纯 ASCII 并带版本号，随 main 分支更新（中文对照见上方插件列表）。

## 音乐

普通歌曲站：榜单、歌单、歌手、专辑、搜索与歌词。

### 世纪音乐（4c44-music）

歌曲、榜单、歌单、歌手、专辑，带动态歌词。站点首页有一道一次性的勾选人机校验，插件会自动过并缓存约一小时的会话 Cookie；万一过不去，可以在插件设置里贴一条浏览器 Cookie。

### 5nd音乐（5nd-music）

歌曲、榜单、歌手、专辑、电台，带歌词。音频在 `mpge.5nd.com`，部分曲目是分片容器（m4s / flac 分片），宿主的 `stream` 只认 `mp3/flac/ogg/wav/m4a/aac`，这类会报「这段流播不了」，换一首或换音源即可。1.6.1 起插件内置一枚 `Hm_lpvt_*` 统计 Cookie（该边缘只校验 Cookie 名，不校验值），`playable()` 与 `stream()` 都带上，App 内能直接 206 播放；仍被 302 时按设置自动跳浏览器，也可粘贴自己的 Cookie 覆盖内置值。

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

### 24bit无损音乐（24bit）

站点：https://www.24bit.net/。单曲站，一个搜索结果就是一首歌，没有真正的专辑目录；插件把一首单曲当作一张一首曲目的专辑，专辑名后附带音质。首页解析 RSC 里的 `weekData` 做「本周歌曲榜」「本周歌手榜」；歌曲与歌手封面通过网易云公开搜索接口按同名歌曲/歌手补全，失败时回退站点占位图。榜单页会把本周歌曲并发解析成可直接播放的单曲，站点搜索接口 503 时少展示几首；歌手页与歌曲页都直接返回可播放曲目，不再放没有内容的「返回」卡片。搜索并行请求 `searchOnlineMusicTwo`（16bit，每页 30 条）与 `searchOnlineMusicOne`（24bit 192kHz，每页 30 条），两接口偶发 503，插件做退避重试。单曲页 `/music/b|a|c/<id>` 内嵌 `itemMusic`，`stream()` 取其中的 FLAC 直链；十分钟内复用直链，站点偶尔返回 12 秒 AAC 试听片段时会识别并退避重抓；返回 `size` 与 `quality: lossless`，按酷我/网易 CDN 域名设置 Referer。歌词优先读 `itemMusic.lrc`，16bit 的 `$c` 占位则从同页另一段 RSC 字符串提取。24bit 96kHz 的 `searchOnlineMusicThree` 不稳定，当前主链路只用 192kHz。

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

### 275听书（i275）

移动端书库，首页与搜索可用；播放页会被服务端 302 回首页，音频回退蜻蜓 FM。

### 听FM电台（tingfm）

首页不再只有一条「推荐收听」大横幅，而是把蜻蜓 FM 搜索结果按 `parent_id` 聚合成频道卡片：推荐电台 14 个、音乐 / 资讯 / 情感各 8 个，下面接「热门节目」12 条和 8 个分类入口；侧边栏新增「分类」「热门」。频道页读取 `webapi.qtfm.cn` 的频道与节目列表，列出最新 60 期，付费期标记不可播；单集播放解析 `programInfo.audioUrl` 的 302 签名 m4a，并先用 HEAD 校验最终文件，失败自动尝试下一期免费节目。

### 悦听吧（yuetingba）

分类 `/book/<id>/1`、详情 `/book/detail/<uuid>/<page>`；搜索走站内 `/search?type=1&name=<q>&pageIndex=1`，「全部专辑」按 9 个分类合并去重、逐页翻完，全站 1002 本（快照见 `data/yuetingba-all-albums.json`）；支持 `album({id})` 读取整本专辑全部章节（每 200 集一页），例如《超品相师》2280 集、《庆余年》1865 集；单集播放调 `/api/app/docs-listen/<章节ID>/audio-url` 拿 MP3 直链，失败才回退蜻蜓。

### 85听书网（85ting）

首页与分类解析 `/ting/<id>.html` 卡片；分类 `/list/85X.html`，分页 `/list/85X-N.html`；搜索走 `POST /search.php` 的 `searchword`；专辑读取 `/ting/<id>.html` 的 `vlink` 全部章节；播放页 `var now="..."` 即当前集音频，源多为喜马拉雅 HE-AAC；插件用 ffmpeg 转成 AAC-LC 再播放，缓存 8 集到插件数据目录。0.2.2 起优先取 `host.ffmpegPath`（葫芦音乐 3.0.94 自带 ffmpeg），拿不到再试 PATH / 常见安装目录 / `<数据目录>/ffmpeg/ffmpeg.exe`。站点回源经常 503，插件用 `www.85ting.com` 与 `85ting.com` 双域名、2 轮 × 2 并发、单请求 3.5 秒超时，挂了约 7 秒报「站点响应超时或连不上」。

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


### 听友听书（tingyou）

站点：https://www.tingyou.fm/listening。Nuxt 前端的白牌听书站，书 = 专辑、集 = 曲目，前端只做渲染，数据全在站内网关的明文通道 `/listening-api/*`（浏览器走的是同一份数据的加密通道 `api/h5/listening/*`，插件不碰那条）。榜单 `rank?section=latest|hot&page=N`、分类 `category?category=2&sort=popular|new|updated&page=N`（`2` 有声小说、`1` 评书，每类 20 条 × 100 页，`type` 细分参数实测不生效）、详情 `album/<id>`、章节 `chapters/<id>`（一次给全，`index` 从 1 起）。播放是 `POST play`，body `{album_id:"<字符串 id>", chapter_idx:<1 起的整数>}` 换回带 `ts`/`sign` 的签名直链（`fmfm.fdhtbz.cn/stream/…`，`Range` 回 206 `audio/mpeg`）；`album_id` 传数字会 400「听书分类参数无效」，`chapter_idx` 传 0 回 404，这两个坑写进了代码注释。站内搜索 `POST search` 没有验证码，直接可用；网关偶发 503，插件对每个接口重试 3 次。


### 石头听书（shitou）

站点：https://www.shitou.club/list/cls/10042.html。WordPress（Ripro 主题）的影视/有声书站群，**站点自己不放音频**：一本书是文章 `/p/<id>.html`，正文嵌 B 站播放器 iframe。列表 `/list/cls/<tid>.html`（分页 `?page=N`，`_2.html` 是 404）、卡片 `<a href="/p/<id>.html" title="书名">`、封面在 `i*.hdslb.com`、搜索走 WordPress 原生 `/?s=`。章节从 B 站 `x/web-interface/view?bvid=` 的 `pages` 来，一个 P 一集；播放取 `x/player/playurl?...&fnval=16` 的 `dash.audio`（AAC-LC `m4s`），播放把这条 `m4s` 原样交给应用（fMP4 分片里的 AAC-LC 应用自己能解，边下边播、不用本机装 ffmpeg）；本机有 ffmpeg 时先 `-c:a copy` 重封装成 `.m4a` 放插件数据目录，换到可随手拖动的本地文件。插件为此申请了 `process` 权限（`ffmpeg`/`ffmpeg.exe` 及常见安装路径），没有 ffmpeg 也不影响播放。B 站接口要带 `buvid3`（`x/frontend/finger/spi` 匿名取）和 `Referer: https://www.bilibili.com/`，否则 412；ffmpeg 读远程地址也得带 UA 与 Referer，否则 CDN 403。单集常常是几小时的合集，首次播放要先把整段落到本地，会等一两分钟。

## 评书

传统评书。

### 单田芳评书网（pingshu5）

`/pbook/<slug>.html` 书页与栏目页，源音频是微信语音直链，易失效，默认回退蜻蜓 FM。

### 娓雅评书（wpingshu）

站点：https://www.wpingshu.com/。帝国 CMS + AMP 模板的评书站，按「评书者」分人：`/stfps/` 单田芳、`/ykcps/` 袁阔成、`/llrps/` 连丽如、`/llfps/` 刘兰芳、`/tlyps/` 田连元、`/tzyps/` 田战义、`/zszps/` 张少佐（后两位常不在导航上，插件用内置表补齐）。书页 `/<分类>/<书名拼音>/`（成套的书是两段 `/llfps/llfps/plh75h/`），`<h1>` 书名、`/uploads/llr/` 封面、`评书者：`、`状态：`、`info-main-intro` 简介；章节取「目录」块（页面里另有一块「最新章节」是倒序 6 条，不能混用）。集页只有 `var articleId = "29027"`，音频号由站内脚本现算：`首位数+1` + `(articleId+250011)` + `"3"` + `末位数+3`，拼成 `/api/<号>.html` 取回 JSON 里的 `source src`（喜马拉雅 xmcdn 的 m4a，`.flv` 会被换成 `.mp3`）。站内没有可用搜索（`/search/` 一律 404），插件扫 7 个分类页建书名索引。回源 503 很频繁，页面与 `/api/` 都重试；少量老集在 xmcdn 上已回 404，只能换一集。

## 目录

```
plugins/<id>/     plugin.json + index.js + README.md（可选 locales/）
dist/             打包好的 zip，<id>-<版本>.zip（ASCII，带版本号，随 main 更新）
release/          打包好的 zip，<id>-<版本>.zip（ASCII，发 Releases 用）
```

## 说明

- 插件只读取站点公开页面与接口，不含任何破解、绕付费或绕 DRM 的逻辑。
- 音频版权归各站点与原作者，插件仅供个人学习与自用，不提供下载功能。
- 站点改版会让解析失效，改版后对应插件需要跟着调。

## 仓库维护

几个脚本加两个 GitHub Actions，维护这套插件不用再手工打包、手工翻页核对。

| 脚本 | 作用 |
| --- | --- |
| `./scripts/pack.sh` | 从 `plugin.json` 读 id / 显示名 / 版本，统一产出 `dist/<id>-<版本>.zip` 与 `release/<id>-<版本>.zip`（都是 ASCII 名，都带版本号），`locales/` 有就一起打进去 |
| `./scripts/pack.sh <id>` | 只重打一个插件，例如 `./scripts/pack.sh 36dj-music` |
| `./scripts/pack.sh --check` | 只比对，不动文件：解压 `dist/` 里的包读 `plugin.json`，版本与源码不符就报「过期」，缺包报「缺失」 |
| `./scripts/locales.mjs` | 从 `index.js` 抓出所有 `t("…")` 原文，补 `locales/zh-CN.json`；`--check` 只报告谁还缺 |
| `./scripts/probe.mjs` | 逐个插件跑 `home` → `stream` → 1 KB `Range` 验证，出一张表；`./scripts/probe.mjs <id>` 只探一个，`--json` 便于两次结果比对 |
| `./scripts/gate.mjs` | 跑一遍探测并和 `docs/基线.json` 比：有插件从「可播」掉下来就退出码 1；`--update` 把这次结果收成新基线 |

`dist/` 之前出过一次包落后于插件目录的情况（包里还是旧版本），`--check` 就是为这个加的门：CI 里跑一次，不一致会亮红。

### locales 现状

54 个插件都有 `locales/zh-CN.json`（中文说法锁定，不受宿主语言影响）。其中 14 个带 `en.json`：

- 6 个是真英文翻译：5nd音乐、布谷音乐、一起听歌吧、九天音乐、听听网、广场舞地盘；
- 8 个是恒等映射（原文 → 原文）：36DJ舞曲、世纪音乐、汽车音乐网、DJ024电音、凤梨音乐、猫耳FM、听书网、优折美音乐——只做占位，挡住宿主自动机翻把术语翻乱，要真英文请逐条替换 `en.json` 的值。

剩下 40 个没有 `en.json`，英文界面显示中文原文，这是明确取舍，不是漏做。

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

### IN音乐网（inmp3）

站点：https://inmp3.com。页面结构和 Hi歌曲（higequ.com）同源，首页热门搜索、新歌榜，分类为飙升榜 / 新歌榜 / 热歌榜 / 粤语 / 经典老歌；搜索 `/so/<关键词>/1/`，详情 `/song/<id>/`。音频地址在详情页底部以 base64 的 `encodedUrl` 给出，插件解码后得到 `kw-er.kuwo.cn` 的 MP3 直链，实测 4.3MB、`Range` 206。无需账号，站点当前可用。

### 放屁网（fangpiw）

站点：https://www.fangpiw.com。首页 `/hot-music`，搜索 `/s/<关键词>`，详情 `/music/<id>`；详情页 `window.appData = JSON.parse('…')` 里有 `play_id`，插件再 `POST /member/common-play-url`（body `id=<play_id>&purpose=play`）换播放地址。**这个接口给的是 `fp20250213.oss-cn-guangzhou.aliyuncs.com/audition/music_<id>.mp3` 试听片段**，2026-11-24 实测 243–729KB、`Range` 206，能出声但只有几十秒；整曲需要站点账号或相应权限，插件不绕过。音频 OSS 对带 `fangpiw` Referer 的请求回 403，插件播放时只带 UA。源站偶发 503，插件对首页、详情和播放接口做了重试。

### 7082音乐网（music7082）

站点：https://www.7082.cn。首页最新上传 / 热门歌曲，分类 `/play/<slug>/1.html`，搜索 `/include/search.php?ac=play&key=<关键词>`，详情 `/play/<id>.html`。播放走 `POST /skin/xle_dj197/play.php`，body `id=<id>&type=<type>`，`type` 从详情页 `lei_play("id","type")` 提取；接口直接返回 `www.7082.cn/dance/…mp3`，实测 6MB、`Range` 206，不带 Referer 也能取。站点是传统 PHP 模板，没有 JSON 搜索接口，插件按 `play/<id>.html` 链接抓取。

### 无忧音乐网（ting05）

站点：https://ting05.com。站名带「ting」，实际是音乐站。首页最新推荐 30 首，分类 `/category-<N>.html`、翻页 `/category-<N>_<page>.html`（最近更新 / 华语 / 日韩 / 欧美 / DJ / 合集），搜索 `/search.php?q=<关键词>`，详情 `/song/<id>.html`。音频地址在详情页 APlayer 的 `url:`，多为 m4a，仓库探测脚本直接取远程地址得到 `206 audio/x-m4a`。站点 CDN 对中文路径敏感，插件默认用本机 ffmpeg 拉取并缓存成本地 m4a 再交给播放器，设置里填 `0` 可关闭缓存；找不到 ffmpeg、且音频本身是 m4a / mp3 / aac 时回退远程地址。

### 易听书网（yitingshu）

站点：https://www.yitingshu.com。首页最新推荐，分类 `/yi/<N>.html`（言情、武侠、悬疑、历史、军事、评书、相声小品、商业财经），搜索 `GET /search.php?searchword=<关键词>`，专辑 `/book/<id>.html`，章节 `/play/<id>-0-<index>.html`。音频是喜马拉雅 CDN 的 xmcdn m4a，多为 HE-AAC，插件默认用本机 ffmpeg 转 AAC-LC，设置 `transcode=0` 可关闭。2026-11-23 本机实测首页、详情、播放页均通过；2026-11-24 云主机复核时，xmcdn 对出口 IP 返回 `403 deny by rule engine`，属于 CDN 拦截。

### 99听书网（ting99）

站点：https://www.ting99.com。首页最新推荐，24 个分类 `/fenlei/<N>.html`，搜索 `POST /search.php` 的 `searchword`，专辑 `/book/<id>.html`，章节 `/play/<id>-0-<index>.html`。音频是 xmcdn m4a，部分 HE-AAC，默认 ffmpeg 转 AAC-LC。2026-11-23 实测播放页能取到 m4a 直链；2026-11-24 云主机复核时首页可用，专辑页与播放页被 Cloudflare 回 `520`，插件按 5 次退避重试。

### 我听评书网（qmtsw）

站点：https://www.qmtsw.com。首页最新推荐，分类 `/book/<N>.html`，专辑 `/show/<id>.html`，章节 `/play/<id>-...html`；播放页的 `var now = FonHen_JieMa("...")` 解码后得到音频，个别页直接是明文 `var now = "https://...m4a"`。站点音频多为喜马拉雅 HE-AAC，默认 ffmpeg 转 AAC-LC（含 `/snap/bin/ffmpeg`）。2026-11-23 实测可解析 217 集专辑的完整章节列表；2026-11-24 云主机复核时源站首页和详情都回 `520`，插件按 4 次退避重试。
