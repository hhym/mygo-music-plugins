# 听听网（ttw.cx）· MyGo Music 插件

给 [mygo-music](https://github.com/egoist/mygo-music) 用的「听听网」音源插件，`playback: stream`，装进宿主就能直接搜歌、听歌、拉 LRC 歌词。

## 安装

把整个 `mygo-plugin-ttw` 文件夹放进宿主的插件目录（或直接安装打好的 zip）：

```
mygo-plugin-ttw/
├── plugin.json
├── index.js
├── README.md
└── locales/en.json
```

Windows 下千千静听（葫芦音乐）的插件目录是 `C:\Users\<你>\.hulu-music\plugins\`。

## 实现要点

**人机验证（两层）**：站点先用一层「cookie 弹跳」拦人 —— 没会话时 `/so/…` 之类的地址回 `403` + 一个 `<script>window.location=…</script>` 的小页面，顺手 `set-cookie` 一个随机名 cookie，浏览器自动重载后放行；`fetch` 不会跑 JS，所以要自己抄 cookie 再重试一次。之后才是「安全验证」页。放行要两步：先 `GET /` 拿 `csrf_token` 与 `PHPSESSID`，再 `POST /` 带 `csrf_token=…&human_check=on`，服务端把「已验证」写进 PHP session（靠 `PHPSESSID` 认人，约 1 小时有效）。宿主插件的 `fetch` 不会自己存 cookie，所以 `index.js` 自己从 `set-cookie` 抄下 cookie 再带回请求头，撞到验证页就自动重走一遍，cookie 也用 `host.storage` 存着，下次启动先试旧的。

**音频**：`POST /js/play.php`（`id=<单曲 id>&type=music`）返回 `{ msg, pic, lkid, url }`，其中 `url` 是加密串，不用解 —— `lkid` 就是酷我的 rid，拿它去酷我 `antiserver` 换直链 mp3（实测 `206` + `audio/mpeg`，支持 Range）。`pic` 顺带就是封面。这条路不需要验证 cookie，所以就算会话过期，播放也不受影响。

**歌词**：`GET /plug/down.php?ac=music&lk=lrc&id=<单曲 id>` 直接返回 LRC 文本（同样不需要会话）。

**页面**：全部同步渲染，按 `<li>` 块正则解析，字段来自列表行的 `title="歌手 - 歌名"`、`class="playtime"`、`<img src>`、`class="singer"`。

## 支持的接口

| 接口 | 说明 |
| --- | --- |
| `home()` | 新歌排行 / 推荐歌单 / 经典怀旧 / 推荐歌手 / 排行榜入口 |
| `browse({page})` | `list/<榜>.html`、`singer/<id>/<n>.html`、`playlist/<id>.html`、`playtype/…`、`singerlist/…`、`albumlist/…`、`charts` |
| `search({query,kind,offset})` | `/so/<关键词>.html`，50 首/页，`offset` 换算页码；`kind` 支持 tracks / artists |
| `artist({id})` | `/singer/<id>.html`，60 首/页 |
| `album({id})` | `/album/<id>.html`；`id` 传 `playlist:<id>` 时读歌单页 |
| `lyrics({id})` | LRC 文本 |
| `stream({id})` | 酷我直链 mp3 |
| `stations()` / `stationNext()` | 8 个榜单当电台连续播 |
| `suggest({query})` | 搜索前 8 首的歌名 |

## 已知限制

- 曲库来自搜索引擎聚合（站点自己不存音频），冷门歌、版权下线歌会搜不到或播放失败；播放失败会抛 `unavailable`。
- 站点搜索为中文站内匹配，拼音/英文关键词命中率看站点；每页 50 条，`search` 只翻到站点给的页数。
- 榜单/歌单页每页 45–65 首不等，`morePage` 会指到下一页。
- 歌手页的专辑区没有做（站点歌手页不列专辑），`artist().albums` 恒为空。
- 音频走酷我 CDN，直链带时效签名，所以每次 `stream()` 都现取；缓存过的地址过期后重新播一次即可。
- 站点对人机验证有频率限制与偶发 30s 级别的慢响应，短时间反复重验证可能被连着吐验证页，插件会重试 3 次（中间退避 0.4s / 1.2s / 2s）。
