# GD音乐台 · MyGo Music 插件

把 [GD 音乐台](https://music.gdstudio.org/) 接进 [MyGo Music](https://github.com/egoist/mygo-music)。站点前端是 SPA，插件直接调用它的公开聚合 API，提供网易云榜单、歌单、搜索、歌词与在线播放。

## 安装

1. 打开 MyGo Music → 设置 → 插件 → `+` → Show Plugins Folder。
2. 把 `gdstudio-plugin` 文件夹放进该目录（或把 `gdstudio-plugin-1.0.0.zip` 解压进去），重启应用。
3. 在 设置 → 插件 里启用“GD音乐台”。

## 功能

- **首页**：热歌榜、飙升榜、新歌榜各 12 首。
- **排行榜页**：热歌榜、飙升榜、新歌榜、原创榜，完整曲目。
- **搜索**：调用网易云音源搜索，每页 30 首，可继续加载。
- **歌词**：读取聚合 API 返回的标准 LRC。
- **播放**：按 `quality` 请求 128 / 320 / 999 kbps，返回 MP3 或 FLAC。
- **我的喜欢 / 最近播放**：站点无账号，由插件本地保存。

## 使用的 API

```
GET https://music-api.gdstudio.xyz/api.php
```

| types | 参数 | 用途 |
| --- | --- | --- |
| `search` | `source=netease&name=&count=&pages=` | 搜索 |
| `playlist` | `source=netease&id=` | 歌单/榜单 |
| `lyric` | `source=netease&id=` | 歌词 |
| `url` | `source=netease&id=&br=128\|320\|999` | 播放地址 |
| `pic` | `source=netease&id=&size=` | 封面 |

歌曲 id 在插件里编码为 `source:歌曲id:url_id:lyric_id:pic_id`，因此搜索结果的 `url_id` 与 `lyric_id` 不同也能正确播放和取词。

## 已知限制

- API 不支持 `types=album`、`types=artist`，因此插件没有专辑页和艺人页。
- 搜索只支持单曲，不支持专辑、艺人、歌单搜索。
- 网易云以外，`joox` 可用；`kuwo`、`qq`、`kugou`、`migu` 等音源在 API 上返回不支持。
- 站点前端（.org/.xyz）在部分网络环境会 503，但 API 独立可用，插件不依赖网页。
- 网易云曲目的封面 id 需要再调一次 `types=pic`，为避免列表页逐首请求，列表封面留空；歌单页使用歌单封面。
- 站点内容版权归原权利人所有，插件只做 API 聚合与跳转播放。

## 发布到插件目录

1. 新建公开 GitHub 仓库，把 `plugin.json`、`index.js`、`locales/` 放在仓库根目录。
2. 给仓库加 topic `mygo-music-plugin`。
3. 安装按钮链接：`mygo-music://install-plugin?repo=<owner>/<repo>`。

## 版本

- 1.0.0（2026-11-22）：首个版本，要求 MyGo Music 0.1.20 及以上。
