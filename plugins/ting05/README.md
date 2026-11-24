# 无忧音乐网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [ting05.com](https://ting05.com)（无忧音乐网）。

站点名虽然带「ting」，实际是音乐站，不是听书站。无需账号，打开即用。

## 功能

- 首页最新推荐（实测 30 首）
- 分类：最近更新、华语、日韩、欧美、DJ 舞曲、精选合集，支持 `_2.html` 翻页
- 搜索：`/search.php?q=<关键词>`，实测「周杰伦」返回 30 条
- 歌曲详情：`/song/<id>.html`
- 在线播放：读详情页 APlayer 的 `url:`，多为 m4a
- 喜欢、最近播放

## 站点路径

```
首页      GET  /
分类      GET  /category-<N>.html
翻页      GET  /category-<N>_<page>.html
搜索      GET  /search.php?q=<关键词>
详情      GET  /song/<id>.html
音频      详情页 APlayer 配置里的 url: "https://...m4a"
```

## 播放

站点音频 CDN 对中文路径较敏感，播放器直接把远程地址交给内核时，部分中文文件名会被重新编码成 404。插件默认先用本机 `ffmpeg` 拉取并缓存成本地 m4a，再把本地文件交给播放器；设置里把「本地缓存播放」填 `0` 可改为直接返回远程地址。

`ffmpeg` 会自动在 PATH 和常见安装目录里找；也可以在设置里填绝对路径。找不到 ffmpeg、而音频本身是 m4a / mp3 / aac 时，插件回退到远程地址，不会整首播不了。

## 权限

`ting05.com`、`www.ting05.com`、`*.ting05.com`，以及音频所在的 `*.guoguo.org.cn`。插件声明了 `ffmpeg` 进程权限，用于本地缓存。

## 说明

2026-11-24 实测：首页、分类、搜索、详情均可用；仓库探测脚本对首曲直接取远程地址也拿到 `206 audio/x-m4a`。若本机没有 ffmpeg，中文路径曲目可能回退失败，装一个 ffmpeg 即可。
