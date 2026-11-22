# VY音乐 · MyGo Music 插件

把 [VY音乐网](https://www.yyvy.cn/) 接进 [MyGo Music](https://github.com/egoist/mygo-music)：最新原创音乐、热门试听、高分推荐、榜单、分类、搜索与在线播放。

## 安装

1. 打开 MyGo Music → 设置 → 插件 → `+` → Show Plugins Folder。
2. 把 `yyvy-plugin` 文件夹放进该目录（或把 `yyvy-plugin-1.0.0.zip` 解压进去），重启应用。
3. 在 设置 → 插件 里启用“VY音乐”。

## 功能

- **首页**：最新添加、热门试听、高分推荐各 20 首，附榜单与分类入口。
- **榜单**：人气排行、最新推荐、下载排行、收藏排行、最新上传。
- **分类**：流行、古风、民谣、摇滚、说唱等站内分类。
- **搜索**：按歌名/歌手搜索，每页 20 首，可继续加载。
- **播放**：读取 `/api/songs/<id>` 返回的 `listen_url`。
- **我的喜欢 / 最近播放**：站点无账号体系，由插件本地保存。

## 使用的站点接口

| 地址 | 用途 |
| --- | --- |
| `GET /api/songs?page=N` | 最新歌曲，每页 20 首 |
| `GET /api/songs?page=N&order=listens` | 按试听次数排序 |
| `GET /api/songs?page=N&order=score` | 按评分排序 |
| `GET /api/songs/<id>` | 单曲详情、封面、音频地址、LRC |
| `GET /search.html?keys=` | 搜索第一页 |
| `GET /search/page/N.html?keys=` | 搜索后续页 |
| `GET /ranks/<slug>.html` | 榜单 |
| `GET /genre/<slug>.html` | 分类歌曲 |

歌曲封面和音频都在 `www.yyvy.cn/uploads/` 下，无需额外请求头。

## 已知限制

- 站点没有公开歌词接口，`sub.lrc` 目前为空，插件不显示歌词。
- 站点专辑页、音乐人页基本是空模板（艺人页没有歌曲、专辑页无有效详情），插件不提供专辑/艺人入口。
- 榜单与分类页只显示歌名，不显示歌手；从这些页面点进去的歌曲歌手列为空。
- 网站内容版权归原权利人所有，插件只做页面/API 解析和跳转播放。

## 发布到插件目录

1. 新建公开 GitHub 仓库，把 `plugin.json`、`index.js`、`locales/` 放在仓库根目录。
2. 给仓库加 topic `mygo-music-plugin`。
3. 安装按钮链接：`mygo-music://install-plugin?repo=<owner>/<repo>`。

## 版本

- 1.0.0（2026-11-22）：首个版本，要求 MyGo Music 0.1.20 及以上。
