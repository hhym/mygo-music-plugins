# 九天音乐（9sky.com）MyGo Music 插件

按 [mygo-music](https://github.com/egoist/mygo-music) 插件规范写的源，`plugin.json` + `index.js`，无需构建。

## 安装

- 把整个 `mygo-plugin-9sky` 文件夹放进 MyGo Music 的 `plugins` 目录（设置 → 插件 → ＋ → 显示插件文件夹）；
- 或把本仓库打成 zip，在设置里「从压缩包安装」；
- 装好后侧栏出现「九天音乐 / 排行榜」，首页是它的推荐。

## 提供的接口

| 导出 | 做什么 |
|---|---|
| `home` | 正在热听（站点 5 首随机热听）、推荐唱片、排行榜入口 |
| `browse` | `charts` 三个榜单总览；`chart:1/2/3` 单个榜单 |
| `search` | 歌曲 / 唱片 / 音乐人（站点搜索接口单页返回，不支持翻页） |
| `album` | 唱片详情（`/disc/detail?id=`，曲目 + 封面 + 音乐人） |
| `artist` | 音乐人页（头像、流派、名下唱片） |
| `stations` / `stationNext` | 三个榜单做成电台卡，每次给 10 首 |
| `lyrics` | `/main/musician/song/lyric?id=` 的 LRC |
| `stream` | `/music?ids=` 里的 `songUrl`，直接是 `sp.9sky.com` 的 mp3 |

## 实现要点

- 站点是老的同步渲染页面，没有 JSON 单曲接口：单曲信息、音频地址、封面都藏在内联的
  `var lists = formatSong([{...}])`（单曲页）和 `var list = [{...}]`（唱片页）里，插件用一个小解析器把这些 JS 字面量读成对象（键带引号、值带 `\uXXXX` 转义都能处理）。
- 音频是 `http://sp.9sky.com/convert/song/music/<uid>/<ts>.mp3`，直链无签名，实测 `206 audio/mpeg` 可直接拖动进度。
- 歌词先走接口，接口空就直接报 `unavailable`（不硬塞空 LRC）。

## 1.0.1 补封面

- 首页「正在热听」、搜索结果、榜单电台的曲目都用 `/music?ids=a,b,c` 批量补 `discCoverUrl` 与真实时长（一次请求拿一批，不逐首打）；
- `plugin.json` 加了 `requestHeaders`：`sp.9sky.com` 的 `image` / `audio` 请求带 `referer: http://www.9sky.com/`，防它哪天开防盗链。

## 已知限制

- **曲库是九天的原创/独立音乐**：`千千阙歌` 这类主流版权歌搜不到（不是插件 bug，站点本身没有）；搜 `民谣`、`夏天`、`爱你` 这类能出结果。
- 搜索接口不支持分页、不分类型过滤，插件按 `type` 字段自己分到 tracks/albums/artists，`offset > 0` 直接返回空。
- 榜单固定 10 首，没有更多页；`stationNext` 给完一轮就返回空（榜单不是无限流）。
- 音乐人页站点只列唱片、不列单曲，所以 `artist().tracks` 是空数组，曲目从唱片进。
- 单曲页偶尔 `lyricUrl` 是 `http://sp.9sky.com/null`，这种就是真没歌词。

## 权限

`network`: `www.9sky.com`（页面与 JSON）、`new.9sky.com`（搜索接口）、`sp.9sky.com`（音频与图片）。
