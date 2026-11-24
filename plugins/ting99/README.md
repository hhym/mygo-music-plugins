# 99听书网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的听书插件，数据来自 [www.ting99.com](https://www.ting99.com)（99听书网）。

无需账号，打开即用。

## 功能

- 首页最新推荐
- 分类 24 个：玄幻、言情、都市、恐怖、惊悚、推理、武侠、历史、军事、穿越、科幻、网游、评书、戏曲、笑话、儿童、财经、广播、诗歌、文学、粤语、经典、相声小品、百家讲坛
- 搜索：`POST /search.php`，`searchword=<关键词>`
- 专辑：`/book/<id>.html`，含书名、封面、播讲与全部章节
- 章节播放：`/play/<id>-0-<集号>.html`
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
分类      GET  /fenlei/<N>.html
搜索      POST /search.php
          searchword=<关键词>
专辑      GET  /book/<id>.html
章节      GET  /play/<id>-0-<index>.html
音频      播放页里的 xmcdn m4a 地址
```

## 播放

音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 等）的 m4a，部分为 HE-AAC。插件默认用本机 `ffmpeg` 转成 AAC-LC 再播放，设置里把「转码播放」填 `0` 可关闭。

2026-11-23 实测播放页能取到 m4a 直链。2026-11-24 在云主机复核时，首页可用，但专辑页和播放页被 Cloudflare 回 `520`，分类页也间歇 520；插件按 5 次退避重试，源站恢复后无需改代码。

## 权限

`ting99.com`、`www.ting99.com`，以及 `*.xmcdn.com`；插件声明了 `ffmpeg` 进程权限用于转码。
