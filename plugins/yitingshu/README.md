# 易听书网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的听书插件，数据来自 [www.yitingshu.com](https://www.yitingshu.com)（易听书网）。

无需账号，打开即用。

## 功能

- 首页最新推荐
- 分类：言情、武侠、悬疑、历史、军事、评书、相声小品、商业财经
- 搜索：`GET /search.php?searchword=<关键词>`
- 专辑：`/book/<id>.html`，含书名、封面、播讲与全部章节
- 章节播放：`/play/<id>-0-<集号>.html`
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
分类      GET  /yi/<N>.html
搜索      GET  /search.php?searchword=<关键词>
专辑      GET  /book/<id>.html
章节      GET  /play/<id>-0-<index>.html
音频      播放页里的 xmcdn m4a 地址
```

## 播放

音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 等）的 m4a，很多是 HE-AAC。插件默认用本机 `ffmpeg` 转成 AAC-LC 再播放，设置里把「转码播放」填 `0` 可关闭。

2026-11-23 在本机实测：首页、详情、播放页均通过，取到 xmcdn m4a 直链。2026-11-24 在云主机复核时，xmcdn 对当前出口回 `403 deny by rule engine`；这是 CDN 按出口 IP 拦截，不是解析失效。

## 权限

`yitingshu.com`、`www.yitingshu.com`，以及 `*.xmcdn.com`；插件声明了 `ffmpeg` 进程权限用于转码。
