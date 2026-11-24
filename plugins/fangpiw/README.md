# 放屁网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.fangpiw.com](https://www.fangpiw.com)（放屁网）。

无需账号，打开即用。

## 功能

- 首页热门音乐、最新上传、分类入口
- 搜索：`/s/<关键词>`
- 歌曲详情：`/music/<id>`，歌名、歌手、封面
- 在线播放：详情页 `window.appData` 取 `play_id`，POST `/member/common-play-url` 换 MP3 地址
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
热门      GET  /hot-music
搜索      GET  /s/<关键词>
详情      GET  /music/<id>
播放      POST /member/common-play-url
          body: id=<play_id>&purpose=play
音频      https://fp20250213.oss-cn-guangzhou.aliyuncs.com/audition/music_<id>.mp3
```

## 播放

`/member/common-play-url` 返回的地址落在 `audition/` 目录，是站点的**试听片段**，不是整曲。2026-11-24 实测返回 243–729KB MP3、`Range` 206，可以正常出声，但时长只有几十秒。完整音频需要站点账号或相应权限，插件不绕过。

音频所在的阿里云 OSS 对带 `https://www.fangpiw.com/...` Referer 的请求直接回 403；插件播放时只带 UA，不带 Referer。

## 权限

`www.fangpiw.com`、`fangpiw.com`、`*.fangpiw.com`，以及 `fp20250213.oss-cn-guangzhou.aliyuncs.com`。

## 说明

源站偶发 503，插件对首页、详情和播放接口做了重试。若连续失败，通常是站点在当前出口被限流，不是解析失效。
