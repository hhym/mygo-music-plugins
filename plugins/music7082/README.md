# 7082音乐网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.7082.cn](https://www.7082.cn)（7082音乐网）。

无需账号，打开即用。

## 功能

- 首页最新上传、热门歌曲
- 分类：原创、翻唱、DJ、伴奏、铃声、纯音乐、英文、MV
- 搜索：`/include/search.php?ac=play&key=<关键词>`
- 歌曲详情：`/play/<id>.html`，歌名、歌手、封面、播放数
- 在线播放：`POST /skin/xle_dj197/play.php` 返回 MP3 直链
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
分类      GET  /play/<slug>/1.html
搜索      GET  /include/search.php?ac=play&key=<关键词>
详情      GET  /play/<id>.html
播放      POST /skin/xle_dj197/play.php
          body: id=<id>&type=<type>
音频      接口返回 https://www.7082.cn/dance/...mp3
```

`type` 从详情页的 `lei_play("id","type")` 里取；个别页面没有 `type` 时按 `1` 处理。

## 播放

`play.php` 直接返回 MP3 地址，`Range` 实测 206，2026-11-24 实测 6MB MP3 可播。站点本身不防盗链，播放器直取即可。

## 权限

`www.7082.cn`、`7082.cn`、`*.7082.cn`。

## 说明

站点是传统 PHP 模板，分类页和搜索页都是 HTML；插件按 `play/<id>.html` 的链接抓取，不依赖站内 JSON 接口。
