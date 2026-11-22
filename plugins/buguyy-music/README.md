# 布谷音乐 · MyGo Music 插件

把 [布谷音乐](https://www.buguyy.top) 接进 MyGo Music：热歌、新歌、搜索、歌词，320kbps mp3 直接由 App 播放，不用浏览器兜底。

- 插件 id：`buguyy-music`
- 版本：1.0.0（`minAppVersion` 0.1.20）
- 播放方式：`stream`（App 自己取流）

## 站点实际能用的接口

站点是个 Nuxt SPA，页面内容全部来自同域 JSON 接口，`robots.txt` 里也写着 `Disallow: /api/`，所以这里只用了浏览器里页面自己会发的那几条：

| 接口 | 说明 |
| --- | --- |
| `GET /api/hotlist` | 热歌，固定 50 首 |
| `GET /api/newlist` | 最新上架，固定 50 首 |
| `GET /api/search?keyword=…` | 搜索，最多 50 首 |
| `GET /api/geturl?id=<id>` | `{success, url, name, lrc}`，播放地址是酷我 CDN 直链 |

列表项的形状是 `{id, title, picurl, about, singer}`：

- `id` 是 base64 过的酷我 rid（`MTEyNTA5MDg=` → `11250908`），原样回传即可；
- `about` 通常就是整首 LRC，一行一个 `<br />`，所以歌词优先取它，`geturl` 返回的 `lrc` 反而经常是「歌词获取失败」；
- `picurl` 是酷我封面 `https://imgN.kuwo.cn/star/albumcover/500/…`，路径里的 `500` 就是尺寸，插件把它换成 `{size}`，让 App 按 40 / 600 像素自己取，省流量。

没有分页：`page`、`limit`、`size` 这些参数服务器都不认，永远回到同样的 50 条，所以 `search()` 一律 `more: false`。

站点也没有歌手、专辑、榜单接口（`/api/singer`、`/api/album`、`/api/hot` 之类全是 404），所以：

- 「歌手」只做名字搜索（`id` 用 `n:<名字>`），点歌手名进的是按名字搜到的歌；
- 不导出 `album` / `savedAlbums` / `playlists`，App 对应页面自动不显示。

`/api/allneturl?gid=…` 是站点的备用音源，但它要站点内部的 `musicRid`，列表接口不给这个字段，因此没用上。

## 播放

实测这条链路是通的，而且是原站的最好情况：

- `geturl` 给的是 `https://car-*.kuwo.cn/…/M800003CL1jU1Wgcit.mp3`，裸请求（不带 Referer、不带 Cookie）直接 `206 Partial Content`、`content-type: audio/mpeg`、320kbps；
- 因此 `stream()` 只回 `{url, type}`，不加任何 `headers`，也不做浏览器兜底；
- 地址带签名，会过期，插件按 id 缓存 3 分钟，过了重新向 `geturl` 要一次。

`plugin.json` 的 `permissions.network` 里同时声明了 `www.buguyy.top` 和封面/音频会用到的 `img*.kuwo.cn`、`car-*.kuwo.cn`。

## 目录

```
plugin.json        # 清单：id、version、权限、侧边栏（首页 / 热歌 / 新歌 / 喜欢）
index.js           # 全部逻辑
locales/zh-CN.json # 中文文案（原样）
locales/en.json    # 英文文案
selftest.mjs       # Node 22 真机自测（会真的访问站点并核对 206）
README.md
```

## 自测结果

```
node selftest.mjs
✓ home sections 热门推荐:50 | 最新上架:50 | 更多:2
✓ search 泡沫 19 | 泡沫 / G.E.M. 邓紫棋
✓ cover with {size} https://img1.kuwo.cn/star/albumcover/{size}/s4s42/14/2122179208.jpg
✓ artist page G.E.M. 邓紫棋 / 49 tracks
✓ stream mp3 https://car-er.kuwo.cn/…
✓ audio probe 206 audio/mpeg
✓ lyrics 39 lines | [00:00.00]泡沫 - G.E.M. 邓紫棋
✓ search 周杰伦 50
ALL PASS
```

## 安装

MyGo Music → 设置 → 插件 → `+` → 选这个 zip（或把解压出来的 `buguyy-music` 文件夹丢进插件目录）。
