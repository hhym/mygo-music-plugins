# 36DJ舞曲 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.36dj.com](https://www.36dj.com)（36DJ舞曲网，与 72DJ 同家族）。

## 站点结构

帝国CMS，UTF-8，游客可看，无需登录。列表页是朴素的 HTML 行，详情页的音频路径写在一段 JS 里。

| 用途 | 请求 |
| --- | --- |
| 首页（最新 10 条） | `/`，`ul.mulist` 行 |
| 最新上传 | `/html/new/`，分页 `index_2.html` … `index_12.html` |
| 推荐舞曲 | `/html/good/` |
| 人气榜（本月下载榜） | `/top/` |
| 串烧 | `/xc/`，共 411 页 |
| 慢摇串烧 / 中文 / 慢摇 / 英文 | `/myxc/`、`/zw/`、`/my/`、`/yw/` |
| 详情 | `/play/<id>.html` |
| 搜索 | `POST /e/search/index.php` |
| 搜索分页 | `/e/search/result/index.php?page=<n>&searchid=<id>` |
| 音频令牌 | `/js/lb/a.js` |

详情页里两行就够用：

```js
var music_name = "动感节奏《一场相遇》沉醉烟嗓女声嗨曲串烧";
var info = { "playurl": "2026/3611/16eva/36dj_17590.m4a" };
```

列表行两种写法：分类页是 `input[value=<id>]` + 标题链接 + 两个 `<em>`（人气、上传时间），搜索结果与榜单则是裸的标题链接；每首曲子还挂着「试听 / 收藏 / 下载」三个小锚点，解析时按出现顺序取第一个带真名的链接，跳过动作锚点。

## 播放：必须带 vsid

音频在 `https://tn2.72djapp.cn/36djwma7/<playurl>`，**裸地址一律 403**（回应来自 envoy，`content-length: 0`，很容易被误判成 IP 被封）。真正的要求是查询串上的令牌：

```js
// https://www.36dj.com/js/lb/a.js
var vsid = '3518df0e9da68b921796259382';
var vsidExpire = 1796259382;   // unix 秒，约十分钟
```

拼成 `…/36dj_17590.m4a?vsid=<vsid>` 之后立刻 206：

```
HTTP/1.1 206 Partial Content
content-type: audio/mp4
content-range: bytes 0-1023/32182215
```

`file` 认成 `ISO Media, MP4 v2`，能拖进度。所以插件用 `playback: "stream"`、`type: "m4a"`，不需要 Referer，也不需要 UA 特殊照顾（实测裸 curl 也过）。

令牌约十分钟一换，因此 `stream()` 每次都向 `a.js` 要新令牌，并在令牌刚生成 90 秒内直接交付；一旦探测返回 403 就强制重取一次再试，仍失败才报错。

实测样本（均 206）：

| 曲目 | 文件 | 体积 |
| --- | --- | --- |
| 17589 | `2026/3611/16eva/36dj_17590.m4a` | 32.1 MB |
| 17528 | `2026/3607/27A/17520.m4a` | 36.2 MB |
| 17148 | `2025/3601/13e/17149.m4a` | 35.6 MB |

## 功能

- 首页：最新上传 20 首、人气榜 10 首、分类入口
- 最新 / 推荐 / 人气榜 / 五个分类，都能按 `/页码` 翻页（分类页每页 40 余条）
- 搜索（帝国CMS 原生搜索，POST 提交，结果按 searchid 翻页）
- 单曲页（`track/<id>` → 详情页，一首一条）
- 歌手：站点没有作者字段，上传者常写在标题里（`DJ小启…`），`artist()` 就用名字去站内搜一遍
- 播放、本机库的喜欢与最近播放
- 歌词：DJ 舞曲没有歌词，`lyrics` 返回空

## 限制

- **下载页没有直链**：`/down/<id>.html` 只有 2.8 KB，是登录/积分引导页，不做。
- 搜索总量有限：站内搜索翻到第 60 页左右（约 1500 条）就空了，插件按真实返回判 `more`。
- 首页只有 10 条，且不带时间字段；要「更多」请走「最新上传」。
- 站点偶发 503/超时（尤其分类页首次访问），插件对页面做了 5 分钟缓存，翻页失败会让用户重试。

## 安装

1. 文件夹：把 `mygo-plugin-36dj-music` 放进应用的 `plugins` 目录。
2. zip：设置 → 插件 → `+` → 选 `36DJ舞曲-mygo插件.zip`。
3. GitHub：推到公开仓库，加 `mygo-music-plugin` topic。

`minAppVersion` 是 `0.1.20`，文案全中文写死，没有 `locales/en.json`。

## 目录

```
mygo-plugin-36dj-music/
├─ plugin.json   清单：id、权限（www.36dj.com / tn2.72djapp.cn）、导航
├─ index.js      全部逻辑，纯 ESM：列表解析、详情解析、vsid 令牌、搜索、本机库
└─ README.md
```
