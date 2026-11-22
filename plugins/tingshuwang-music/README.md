# 听书网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的插件，数据来自 [www.tingshuwang.cc](https://www.tingshuwang.cc/)，一个有声小说站。插件把这站当「书 = 专辑、章节 = 曲目」。

## 能不能播：能

章节页里音频地址写在页面末尾的 `var chapter_data` 里，是明文直链：

```
videourl:'https://www.tingshuwang.cc/d/file/21691/0001.m4a'
videotype:'m4a'
```

- 不带 `User-Agent`、不带 `Referer` 也能取，`Range` 返回 **206**，能拖进度
- 文件头是正常的 `ISO Media (.M4A)`，或是 `.mp3`（有的书按五集合成一个 mp3）
- 站点没有登录墙、没有 Cookie、没有加密 HLS，所以 `playback` 直接给 `stream`

## 站点结构

| 用途 | 请求 |
| --- | --- |
| 首页 | `/` |
| 书籍列表 | `/book/`，第 2–35 页是 `/book/index_<n>.html`，每页 10 本，共 346 本 |
| 人气榜 | `/book/rank.html` |
| 分类 | `/book/<cat>/`，分页 `/book/<cat>/index_<n>.html` |
| 书籍页 | `/book/<Slug>/`，含封面、作者、主播、分类、状态、全部章节 |
| 章节页 | `/book/<Slug>/<cid>.html`，`chapter_data` 里有直链 |
| 全站目录 | `/sitemap.html`，289 本带书名 |
| 字母索引 | `/letter/<A-Z>/` |

十个分类：`xuanhuanwuxia` 玄幻武侠、`dushiyanqing` 都市言情、`kongbuxuanyi` 恐怖悬疑、`zongyiyule` 综艺娱乐、`wangyoujingji` 网游竞技、`junshilishi` 军事历史、`tuilixiaoshuo` 刑侦推理、`zhichangshangzhan` 职场商战、`lianzai` 连载、`wanjie` 完本。

字段解析对应：卡片 `<div class="book">` 里取 `book-img`、`author`、`anchor`（主播）、`category`、`status`、`updatetime`、`intro`；书籍页封面在 `book-cover`，主播字段拼写是 `auchor`，章节列表容器拼写是 `book-chpater-list`——照站点的错拼写来。

## 搜索：站内搜索是坏的，插件自己建索引

站点的 `/e/search` 对游客一律回「没有搜索到相关的内容」，换 `tbname=news|book|ecms`、`tempid=1|2|3`、GET 或 POST 都一样，试了「谍影」「凌霄」「绯闻」等词全是 1044 字节的空结果页，所以不能指望它。

插件改成：

1. 先用 `/sitemap.html` 建一份 289 本的轻索引（一次请求，快）
2. 搜不到时再抓 `/book/` 加 35 个分页（6 路并发，约 5 秒），拿到带主播、封面、简介的全量 346 本
3. 索引落在 `host.storage`，一小时有效；进首页时顺手在后台预热全量索引，所以第二次搜索不用等

搜索按书名、slug、作者、主播四个字段匹配，走「专辑」这一栏。

## 命令

| 命令 | 作用 |
| --- | --- |
| `home` | 人气榜 + 最新上架 |
| `browse` | `latest/<n>`、`rank`、`category/<cat>/<n>`、`book/<slug>`、`chapter/<slug>/<cid>` |
| `album` | `b:<slug>`，整本书的章节列表 |
| `search` | 书名 / 作者 / 主播，返回专辑 |
| `stream` | 读章节页的 `videourl`，按扩展名给 `m4a` 或 `mp3` |
| `artist` | `a:<主播名>`，走 `/announcer/<name>/` |
| `suggest` | 十个分类 |
| `liked` / `like` / `isLiked` / `played` / `recent` | 本机库，用 `host.storage` |

## 已知限制

- **章节会重复**：同一本书的页面里会有几次重发的章节（旧编号 `001` 和重制版 `第001章` 指同一章，但音频文件不同）。插件按章号去重，保留页面靠上（较新）的那一条。像《谍影凌云》页面上有 3024 条链接，去重后是 2697 章。
- 番外章节保留原词（`番外七:是你真好`），不强行改成「第 N 章」。
- 有的书把五集合成一个音频文件，章节名就是 `第001-005集（…）`，点开是整段，进度条能拖。
- 主播页 `/announcer/<name>/` 只给第一页 10 本，没有更多分页参数。
- 搜索首次在冷缓存下会多等几秒（要抓 35 页），之后走缓存。

## 文件

- `plugin.json` — id `tingshuwang-music`，`playback: "stream"`，只放行 `www.tingshuwang.cc`
- `index.js` — 纯 ESM，无依赖
