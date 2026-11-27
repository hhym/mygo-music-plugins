# 清风DJ音乐网（vvdj-music）

给 [MyGo Music](https://github.com/egoist/mygo-music) 用的清风DJ音乐网音源插件，站点是 [www.vvdj.com](https://www.vvdj.com/)。

## 能做什么

- 首页：推荐舞曲、最新华语、最新慢歌、最新外语、DJ 歌单、分类与榜单入口
- 分类：串烧舞曲（`c1`）、慢歌连版（`c2`）、华语 Remix（`c3`）、外语 Remix（`c4`），支持翻页
- 榜单：串烧、慢歌连版、华语 Remix、外语 Remix 的 Top 100
- 热门主题：好听、重低音、车载、抖音、粤语等主题，支持翻页
- DJ 歌单：每个歌单 40 首，可进歌单详情
- 制作人：`/djshow/` 列表和制作人作品
- 搜索：站内搜索，20 条一页
- 播放：播放页 `audio#vvdj-audio` 的 m4a 直链，带 `sign` 和 `t` 签名，Range 实测 206，可拖动
- 本地：最近播放、收藏、喜欢状态

## 实现说明

播放地址是**签名地址**，会过期，所以 `stream()` 每次重新请求 `/play/<id>.html`，不缓存音频 URL。列表页缓存 60 秒，减少翻页时的重复请求。

音频在 `media.vvdj.com`，封面在 `img.vvdj.com`，页面静态资源在 `jsin.vvdj.com`，这三个域和 `www.vvdj.com` 都写进了 `plugin.json` 的 `permissions.network`。

## 安装

把 `plugin.json`、`index.js`、`README.md`、`locales/` 放进：

- Windows：`%USERPROFILE%\.hulu-music\plugins\vvdj-music\`
- macOS / Linux：`~/.hulu-music/plugins/vvdj-music/`

或解压 `vvdj-music-1.0.0.zip` 后重启 App。

## 已知限制

- 搜索只返回舞曲，不返回歌单或制作人。
- 歌单详情固定取前 40 首；站点一页就是 40 首。
- 播放页若被风控或签名过期，插件会重新取页面；仍失败时按站点真实错误返回，不伪造地址。
