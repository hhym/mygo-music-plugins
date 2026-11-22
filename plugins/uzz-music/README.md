# 优折美音乐 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [m.uzz.me](https://m.uzz.me)（优折美在线音乐播放器）。

## 先看这里：站点当前的状态

写这个插件时（2026-11-22）实测，站点自己的数据桥 `api.php` 在 CloudFront 层返回 **403**：

```
GET https://m.uzz.me/api.php?types=search&count=10&source=netease&pages=1&name=周杰伦&callback=cb
→ 403  Request blocked. We can't connect to the server for this app or website...
```

首页那张静态壳子页还能拿到（`/` 返回 200，2.9 KB 的播放器页面），但凡是带参数的 `api.php` 请求都拿不到数据 —— 浏览器里打开站点、点「歌曲搜索」同样拿不到结果。也就是说这是**站点侧的故障**（云分发连不上源站 / 源站限流），不是插件的问题：插件已经按站点自己的接口契约写好，`host` 桩 + 模拟接口跑通了全部导出；等站点恢复，装进 App 就能直接用。

插件遇到这种拒绝会重试三次、每次退避，最后给一句中文提示「站点正在限流或拒绝访问，请过几分钟再试」，不会装作播放成功。

## 站点结构

优折美是 **MKOnlineMusicPlayer** 那套模板：一个静态壳子页 + 一个 PHP 数据桥，前端全部靠 JSONP 取数。

| 用途 | 请求 |
| --- | --- |
| 搜索 | `/api.php?types=search&count=10&source=netease&pages=<n>&name=<kw>` |
| 歌曲地址 | `/api.php?types=url&id=<url_id>&source=netease` → `{ url }` |
| 封面 | `/api.php?types=pic&id=<pic_id>&source=netease` → `{ url }` |
| 歌词 | `/api.php?types=lyric&id=<lyric_id>&source=netease` → `{ lyric, tlyric }` |
| 歌单 | `/api.php?types=playlist&id=<网易云歌单 id>` → `{ playlist: { name, coverImgUrl, tracks } }` |

后端是 [Meting](https://github.com/metowolf/Meting) 包着的网易云曲库，所以曲目 id 分四种：`id`、`url_id`、`pic_id`、`lyric_id`。插件把这四个数打包成 `netease|id|url_id|pic_id|lyric_id` 作为 track id，播放/歌词时再拆开取对应的那一个。

## 两个站点脾气

**CloudFront 的「验一下你是不是浏览器」。** 第一次 GET 会收到 503 和一张 `安全验证` 小页，页面脚本等 5 秒、发一个带 `?_callback=<毫秒>` 的 HEAD，然后才给 `waf_token` Cookie。插件照做：HEAD → 等 5.3 秒 → 重发原请求，Cookie 存在内存并镜像到 storage，45 分钟内不再重复验证。

**限流很紧。** 连着发几个请求就会批量 403。插件把所有请求塞进一条队列，两次之间至少隔 1.8 秒，遇到 403 再退避 6 秒 / 12 秒重试。首页因此只取一张「热歌榜」，不铺三张榜。

## 功能

- 首页：热歌榜（歌单卡 + 前 10 首）+ 热门搜索词
- 热门搜索页 / 搜索结果页（`search/<关键词>`），10 条一页，能翻页
- 歌单页（`playlist/<网易云歌单 id>`）
- 播放：`types=url` 拿直链，mp3 / m4a / flac 按扩展名分类型
- 歌词：`types=lyric`，带时间轴的 LRC 原样给播放器
- 本机库：喜欢、最近播放

不支持：登录、用户歌单同步（`types=userlist` 要网易云 uid，模板本身也是匿名）、歌手页（接口没有歌手实体）、下载。

## 安装

1. 文件夹：把 `mygo-plugin-uzz-music` 放进应用的 `plugins` 目录。
2. zip：设置 → 插件 → `+` → 选 `优折美音乐-mygo插件.zip`。
3. GitHub：推到公开仓库，加 `mygo-music-plugin` topic。

`minAppVersion` 是 `0.1.20`。插件文案全中文写死，没有 `locales/en.json`。

## 目录

```
mygo-plugin-uzz-music/
├─ plugin.json   清单：id、权限（m.uzz.me / *.163.com / *.126.net / *.kuwo.cn / *.qq.com）、导航
├─ index.js      全部逻辑，纯 ESM：CloudFront 验证、限流队列、JSONP 解析、曲目映射
└─ README.md
```
