# 我听评书网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的评书插件，数据来自 [www.qmtsw.com](https://www.qmtsw.com)（我听评书网）。

无需账号，打开即用。

## 功能

- 首页最新推荐
- 分类：`/book/<N>.html`
- 搜索
- 专辑：`/show/<id>.html`，含书名、封面、播讲与全部章节
- 章节播放：`/play/<id>-...html`，音频地址从 `FonHen_JieMa` 解码或明文 `var now` 读取
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
分类      GET  /book/<N>.html
专辑      GET  /show/<id>.html
章节      GET  /play/<id>-<...>.html
音频      播放页 var now = FonHen_JieMa("...") 解码，
          或 var now = "https://...m4a"
```

## 播放

站点音频多为喜马拉雅 HE-AAC，应用自身解不了，插件默认用本机 `ffmpeg` 转成 AAC-LC 再播放；设置里把「转码播放」填 `0` 可关闭。`ffmpeg` 支持 PATH、常见安装目录和 `/snap/bin/ffmpeg`，设置里也可填绝对路径。

2026-11-23 实测可解析 217 集专辑的完整章节列表。2026-11-24 在云主机复核时，源站首页和详情都回 `520`，属于站点侧故障；插件已做 4 次退避重试，恢复后无需改代码。

## 权限

`www.qmtsw.com`、`qmtsw.com`、`*.xmcdn.com`、`img.21lizhi.com`；插件声明了 `ffmpeg` 进程权限用于转码。
