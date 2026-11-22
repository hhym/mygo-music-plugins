# DJ024电音 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.dj024.com](https://www.dj024.com)（沈阳DJ024电音传媒）。

## 站点结构

Laravel 站点，列表页是普通 HTML，播放信息有一个干净的 JSON 接口。

| 用途 | 请求 |
| --- | --- |
| 首页（最新 274 条） | `/`，`track-line` 行 |
| 独家专区 | `/cate/exclusive` |
| 分类 | `/forum/category-<id>?page=<n>`，每页 28 条 |
| 专辑 | `/albums/<id>?page=<n>`，如 `红番区` 有 1385 首 |
| 作者 | `/authors/<id>?page=<n>` |
| 搜索 | `/searches?q=<kw>&page=<n>` |
| 播放信息 | `/api/tracks/media?ac=song&id=<id>` |

`/api/tracks/media` 返回：

```json
{ "code": 0, "data": {
  "id": 141110, "name": "…", "cover": "https://dns.dj024.vip/…jpg",
  "user": { "name": "DJ.Eivin一文" },
  "category": { "title": "沈阳现场" }, "isSole": 0,
  "low": { "url": "https://dns.dj024.vip/low/…m4a", "size": 28049409, "duration": 3661 }
}}
```

列表项统一是 `div.track-list-item`：`input.select-input` 带编号、`a.track-list-name-text` 带标题、`img.track-list-cover-img` 带 `data-src` 封面、`target="_cat"` 给分类、`TIME` 给时长。

## 播放

音频是 `dns.dj024.vip` 上的 **m4a**：

- 不需要 Referer，`curl` 直接 200
- 支持 `Range`（206），可拖动
- 非独家曲目给的是**完整版**（实测 28 MB / 61 分钟）
- 独家曲目（`isSole: 1`）只给片段试听（实测 2.3 MB），站点自己在页面上也写明「独家舞曲只提供片段试听（下载为完整版）」

所以插件用 `playback: "stream"`，曲子直接出声，不需要开浏览器。封装的 m4a 头 `ftypM4A`，符合播放器的 m4a 类型。

## 功能

- 首页：最新发布 20 首、独家舞曲 20 首、分类入口
- 最新发布页（拉全站 274 条的前 60）
- 独家舞曲页
- 分类页（`category/<id>`）、专辑页（`album/<id>`）、作者页（`author/<id>`），都能按 `/页码` 翻页
- 专辑索引页（`albums`）
- 搜索（`/searches`），28 条一页，按 offset 分页
- 单曲页（`song/<id>`），播放入口
- 播放、歌名/歌手/封面/时长、本机库的喜欢与最近播放

歌手是从标题里拆的：`【独家发布】周杰伦 - 一路向北（Dj柠檬喜 LakHouse Mix）` 的歌手取 `周杰伦`；没有「 - 」的标题（`DJ杰森2026 圣诞节`）就取上传者。歌词：DJ 串烧没有歌词，`lyrics` 返回空。

不支持：下载（要登录、金币/VIP）、登录、用户歌单。

## 安装

1. 文件夹：把 `mygo-plugin-dj024-music` 放进应用的 `plugins` 目录。
2. zip：设置 → 插件 → `+` → 选 `DJ024电音-mygo插件.zip`。
3. GitHub：推到公开仓库，加 `mygo-music-plugin` topic。

`minAppVersion` 是 `0.1.20`，文案全中文写死，没有 `locales/en.json`。

## 目录

```
mygo-plugin-dj024-music/
├─ plugin.json   清单：id、权限（www.dj024.com / dns.dj024.vip）、导航
├─ index.js      全部逻辑，纯 ESM：HTML 列表解析、JSON 播放信息、翻页、本机库
└─ README.md
```
