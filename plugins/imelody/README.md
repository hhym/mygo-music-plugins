# 米乐迪音乐 · MyGo Music 插件

把 [米乐迪音乐](https://imelody.top/)（MelodyTimeline 华语乐坛编年史）接进 [MyGo Music](https://github.com/egoist/mygo-music)：按年代浏览、热门经典、最新收录、搜索、歌词与 FLAC/MP3 播放。

## 安装

1. 打开 MyGo Music → 设置 → 插件 → `+` → Show Plugins Folder。
2. 把 `imelody-plugin` 文件夹放进该目录（或把 `imelody-plugin-1.0.0.zip` 解压进去），重启应用。
3. 在 设置 → 插件 里启用“米乐迪音乐”。

## 功能

- **首页**：最新收录、热门经典、随机漫游各 20 首，附年代入口。
- **年代**：1960 / 1970 / 1980 / 1990 / 2000 / 2010 / 2020 七个十年，按发行日期排序，可翻页。
- **榜单**：热门经典（按 popularity）、最新收录（按发行日期）、随机漫游（按歌曲 id 稳定散列）。
- **搜索**：调用站内 `searchSongsInDB`，按歌名或歌手搜索，每页 30 首。
- **歌词**：读取歌曲自带的 LRC；纯文本简介不当作歌词显示。
- **播放**：优先调用 `getPlayableUrl` 刷新直链，失败时退回歌曲自带的 `audio_url`；自动识别 FLAC / MP3。
- **我的喜欢 / 最近播放**：站点没有账号体系，由插件本地保存。

## 使用的 API

站点前端是 Vite SPA，数据走一个 JSON 接口：

```
POST https://melody-api.imelody.top
Content-Type: application/json

{"action":"getAllSongs","data":{}}
```

| action | data | 用途 |
| --- | --- | --- |
| `getAllSongs` | `{}` | 全量歌曲（约 1000 首） |
| `searchSongsInDB` | `{query, limit}` | 搜索 |
| `getRandomSongs` | `{limit}` | 随机歌曲 |
| `getPlayableUrl` | `{fileKey}` | 用 `file_id` 换新播放直链 |
| `fetchLyrics` | `{title, artist}` | 补取歌词（插件优先用歌曲自带 LRC） |

歌曲对象字段：`id`、`title`、`artist`、`release_date`、`popularity`、`cover_url`、`audio_url`、`file_id`、`lyrics`。

## 已知限制

- 站点只有歌曲维度，没有专辑、艺人、歌单接口，所以插件不提供这些页面。
- 全量数据约 1000 首，首次进入首页需要拉取约 1.3 MB JSON，之后缓存 5 分钟。
- 约一半歌曲没有带时间轴的歌词，这些歌不显示歌词。
- 封面来自 picsum.photos 的生成图，按 `300/300` 替换成 `{size}` 由应用按需取图。
- 音频直链有时效，插件每次播放都会用 `file_id` 重新换链；若接口临时失败会退回旧直链。
- 歌曲版权归原权利人所有，插件只做 API 聚合和跳转播放。

## 发布到插件目录

1. 新建公开 GitHub 仓库，把 `plugin.json`、`index.js`、`locales/` 放在仓库根目录。
2. 给仓库加 topic `mygo-music-plugin`。
3. 安装按钮链接：`mygo-music://install-plugin?repo=<owner>/<repo>`。

## 版本

- 1.0.0（2026-11-22）：首个版本，要求 MyGo Music 0.1.20 及以上（封面使用 `{size}` 占位）。
