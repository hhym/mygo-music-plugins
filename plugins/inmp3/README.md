# IN音乐网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [inmp3.com](https://inmp3.com)（IN音乐网）。

无需账号，打开即用。

## 功能

- 首页热门搜索、新歌榜
- 分类：飙升榜、新歌榜、热歌榜、粤语歌曲、经典老歌
- 搜索：`/so/<关键词>/1/`
- 歌曲详情：`/song/<id>/`，封面、歌手、专辑信息
- 在线播放：详情页里的 base64 `encodedUrl` 解码后得到酷我 CDN 的 MP3 直链
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
分类      GET  /xinge/、/rege/、/biaosheng/、/yueyu/、/jdhj/
搜索      GET  /so/<关键词>/1/
详情      GET  /song/<id>/
音频      详情页 const encodedUrl = "<base64>"
          atob 后得到 https://kw-er.kuwo.cn/...mp3
```

## 播放

音频地址在详情页底部以 base64 给出，插件解码后直接交给播放器，`Range` 实测 206，2026-11-24 实测 4.3MB MP3 可播。

## 权限

`inmp3.com`、`www.inmp3.com`、`*.inmp3.com`，以及封面与音频所在的 `*.kuwo.cn` 等 CDN。

## 说明

站点结构和 Hi歌曲（higequ.com）基本一致，只是详情、搜索路径和首页函数名不同。当前 Hi歌曲源站 503，本插件使用 inmp3.com，不受影响。
