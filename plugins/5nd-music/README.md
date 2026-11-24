# 5nd音乐 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.5nd.com](https://www.5nd.com)（5nd音乐网）。

站点没有账号体系，打开即用；歌曲、榜单、歌手、专辑、搜索、动态歌词都已接通。

## 安装

1. 文件夹：把整个 `mygo-plugin-5nd-music` 目录放进应用的 `plugins` 目录（设置 → 插件 → `+` → 显示插件文件夹）。
2. zip：设置 → 插件 → `+` → 从本机选择 `5nd音乐-mygo插件.zip`。
3. GitHub：把本目录推到公开仓库，加 `mygo-music-plugin` topic，即可「从 GitHub 安装」。

`minAppVersion` 是 `0.1.20`，当前版本 1.6.0。

## 功能

| 入口 | 说明 |
| --- | --- |
| 首页 | 歌曲首发、最新歌曲推荐、推荐流行歌曲、好听的歌曲、网络歌曲、伤感、影视、DJ 舞曲、专辑推荐、热门歌手、榜单入口 |
| 榜单 | `/paihang/` 的 26 个榜（最热、最新、好听、经典、伤感、日韩、欧美、儿歌…），单页 66 首 |
| 歌手 | `/singer/` 推荐歌手墙；歌手页含全部歌曲与专辑 |
| 专辑 | `/album/` 新碟墙；专辑页含封面、艺人、发行时间、曲目 |
| 搜索 | 歌曲（`/so/ss_`，20 条/页，可翻页）、专辑（`/so/mm_`）、歌手（`/so/si_`） |
| 歌词 | `/gwapi/page/songs` 的 `mtext` 字段，自带时间轴；缺失时回退 `/gecilrc/<id>.htm` |
| 本机库 | 喜欢、最近播放、收藏的专辑存在插件自己的 storage 里 |

不支持：登录、评论、歌单（站点没有歌单体系）、站内下载（要微信小程序/口令）。

## 站点接口速查

```
首页      GET  /
榜单索引  GET  /paihang/
榜单      GET  /paihang/<slug>.htm
歌手墙    GET  /singer/
专辑墙    GET  /album/
搜索      GET  /so/kk_<kw>  |  /so/ss_<kw>[_<n>]  |  /so/mm_<kw>  |  /so/si_<kw>
歌曲页    GET  /ting/<id>.html
歌手页    GET  /s/<id>.htm
全部歌曲  GET  /all/<id>.htm
歌手专辑  GET  /singerzj/<id>.htm
专辑页    GET  /m/<id>.htm
歌词页    GET  /gecilrc/<id>.htm
单曲接口  GET  /gwapi/page/songs?t=100&_lrc=1&ids=<id>
          -> dsong.list[0] = { msongname, msingername, msingervid,
                               msongpath, msongpic, malbumvid, mpubdate, mtext }
音频      GET  https://mpge.5nd.com/<msongpath>
```

列表项统一是 `<li>` 里链 `/ting/<id>.html`；有的页面把「歌名 - 歌手」写在一个链接里，有的另给 `/s/<id>.htm`，插件两种都认，前者按最右的 ` - ` 拆开。

## 文案

插件自己说的话（错误提示、榜单/歌手/专辑入口名、设置项）直接用中文写在 `index.js` 和 `plugin.json` 里，不依赖 `locales` 是否被宿主加载；`locales/zh-CN.json` 和 `locales/en.json` 只是给能读 `host.t` 的宿主做补充。之前出现英文提示，就是因为那份 `zh-CN.json` 在当前宿主里没被应用。

## 排查

- 权限里放了三个域名：`www.5nd.com`（页面、接口）、`img.5nd.com`（封面，必须带 Referer，否则 403）、`mpge.5nd.com`（音频试探）。少了后者，首页和列表的图会一直取不到，页面像是卡住。
- 每个请求 10 秒超时、失败重试一次；歌曲信息接口 12 秒超时。首页取不到时退回「榜单入口」页，不会留一个空白首页。
- 歌曲信息有两条路：先走 `/gwapi/page/songs`（带 LRC），失败就退回抓歌曲页上的 `<div id="kuPlayer" data-play="…mp3">`，只要 HTML 能打开，播放地址就取得到。
- 页面还空着时，插件日志里会有一行 `[5nd] home failed: ...`，把那一行发我，能定位是超时还是站点改版。

## 关于播放（重要）

`stream()` 会先用一次 `Range: bytes=0-1` 的试探请求确认音频能不能取：能取（200/206）才把地址交给播放器；取不到（302/403/502）就直接抛 `unavailable`，给一句人话，而不是让播放器报「HTTP 502」。

1.6.1 起，插件内置一枚 `Hm_lpvt_b0886cdce91635b40ead075af50a1bdf=1` 统计 Cookie，`playable()` 的试探和 `stream()` 交给播放器的请求都带上它，App 内可以直接拿到 `206` 播放，不用再跳浏览器。

1.6.2 起，`playable()` 的 `Range: bytes=0-1` 试探会从 `content-range` 里取出音频总大小，随 `stream()` 的 `size` 交给播放器，进度条和总时长才能算出来；之前只给地址不给大小，播放器就一直是 `0:00`。

「音频被拒时用浏览器打开」保留为兜底：只有当前网络仍被 302 到 `127.0.0.1:1234`（例如站点换了 Cookie 名）时才触发，点播放会把这首歌的 5nd 页面交给系统浏览器打开，同一首歌 45 秒内只开一个标签页。

想彻底不在浏览器里跳，可以在设置里把这一项改成「只在 App 里播（5nd 播不了）」；那之后点击播放会得到一条错误提示，说明 App 内播不了。

音频在 `mpge.5nd.com`，这个域名有防盗链，2026-11-24 实测的规律是：

- 不带 Cookie 直接取，`302` 到 `http://127.0.0.1:1234`，补 Chrome UA、Referer、sec-fetch-* 也一样；
- 只要请求里带任一 `Hm_lpvt_*` 统计 Cookie 就回 `206`，值写成 `1` 也认，说明边缘只校验 Cookie 名在不在，不校验值；
- 两首歌（`3278804`、`23724`）分别复现，不是单曲缓存。

所以插件自己合成这枚 Cookie（`EDGE_COOKIE`），并把浏览器那套请求头一起交给 App：`stream()` 返回 `headers`（Referer 指向该歌曲页 + Chrome UA），`plugin.json` 里对 `audio` 也加了同样的 `requestHeaders`。设置里的 Cookie 项只在站点改 Cookie 名后用来覆盖内置值。

## 目录

```
mygo-plugin-5nd-music/
├─ plugin.json          清单：id、权限（只放行 www.5nd.com）、导航、音频请求头、设置
├─ index.js             全部逻辑，纯 ESM，无构建
├─ locales/zh-CN.json   中文界面（插件文案本身就是中文，这里做兜底）
├─ locales/en.json      英文界面
└─ README.md
```
