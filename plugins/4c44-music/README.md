# 世纪音乐 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.4c44.com](https://www.4c44.com)（世纪音乐）。

没有账号体系，打开即用；播放直连站点返回的 m4a 地址，不经过任何中转。

## 安装

三种方式任选：

1. 文件夹：把整个 `mygo-plugin-4c44-music` 目录放进应用的 `plugins` 目录（设置 → 插件 → `+` → 显示插件文件夹）。
2. zip：设置 → 插件 → `+` → 从本机选择 `世纪音乐-mygo插件.zip`。
3. GitHub：把本目录推到公开仓库，给仓库加 `mygo-music-plugin` topic，就能用「从 GitHub 安装」。应用取最新 Release，没有 Release 时取默认分支最新提交。

`minAppVersion` 为 `0.1.20`（封面用了 `{size}` 占位）。

## 功能

| 入口 | 说明 |
| --- | --- |
| 首页 | 新歌抢先试听（48 首）、热门歌单、热门歌手、榜单入口 |
| 新歌榜 / Top 榜单 / 飙升榜 / 原创榜 | `/list/*.html`，支持翻页 |
| 歌单 | 站点 670+ 个歌单，支持翻页、详情、收藏到本机 |
| 新碟 / 歌手 | 专辑墙、歌手墙，点开即歌手页或专辑页 |
| 搜索 | `/so.php?wd=`，返回 66 首（站点单页上限） |
| 歌词 | 动态 LRC（带时间轴），来自 `play.php` 的 `lrc` 字段 |
| 播放 | m4a（AAC-LC），`stream()` 现取现签，不缓存过期地址 |
| 本机库 | 喜欢、最近播放、收藏的专辑/歌单存在插件自己的 storage 里 |

不支持：登录、评论、电台、MV、无损/网盘下载（站点下载需要口令，未做）。

## 站点接口速查

插件按下面的真实接口实现，站点改版时按这张表改：

```
搜索      GET  /so.php?wd=<关键词>
榜单      GET  /list/{new,top,rise,original}[/<page>].html
歌曲页    GET  /mp3/<id>.html
歌手      GET  /singer/<id>[/<page>].html
歌手专辑  GET  /singer/album/<id>.html
专辑      GET  /album/<id>.html
歌单      GET  /playlist/<id>[/<page>].html
歌单列表  GET  /playlists/index[/<page>].html
歌手列表  GET  /singerlist/huayu/girl/index[/<page>].html
新碟列表  GET  /albumlist/index[/<page>].html
播放      POST /js/play.php
          id=<id>&type=music&key=<YYYYMMDDHHmm>+"4c44"
          -> {"msg":1,"wyid":…,"title":…,"pic":…,"url":…,"lrc":…}
```

`key` 是**中国时区的当前分钟**（`202611221602` + `4c44`），错一分钟就返回 `{"msg":-1}` 或空。插件按 `Asia/Shanghai` 算，并在当前分钟前后各试一次，避免系统时钟偏差。

音频地址形如 `https://mNNN.music.126.net/<时间戳>/<hash>/…/xxx.m4a?vuutv=<签名>`，带时效签名，所以 `stream()` 每次播放都重新请求，不写死。

## 人机验证

站点对 HTML 页面有一层「我不是人机」勾选页（约 1 小时一次），会话存在 `PHPSESSID` 里。插件首次遇到时会：

1. 读出页面里的 `csrf_token`；
2. POST 同一地址（`csrf_token=…&human_check=on`）；
3. 保存 `Set-Cookie`，重新请求原页面。

Cookie 存在插件 storage，重启应用还在。如果站点以后换成图形/滑块验证，自动流程会失败，此时在插件设置里填 `Cookie`（可选）即可：浏览器打开站点通过验证 → F12 → Network → 任意请求 → 复制整条 Cookie。

## 已知限制

- 搜索只返回站点单页的 66 条，`more` 恒为 `false`（站点的 `&page=2` 实际仍返回第一页）。
- 歌手页最多 60 首：`/singer/<id>/2.html` 链接存在但内容仍是第一页，插件检测到无新增曲目就停止翻页，避免重复请求。
- 歌曲列表不含封面和时长；封面在歌曲详情/专辑页才有，时长由播放器读取音频得到。
- 歌曲 id 是站点 slug（如 `hhnknynk`），不是网易云 id；`wyid` 只在 `play.php` 响应里出现。

## 目录

```
mygo-plugin-4c44-music/
├─ plugin.json          清单：id、权限（只放行 www.4c44.com）、导航、设置
├─ index.js             全部逻辑，纯 ESM，无构建
├─ locales/zh-CN.json   界面中文
└─ README.md
```
