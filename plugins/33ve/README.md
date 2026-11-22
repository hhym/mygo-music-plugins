# 闪闪音乐 · MyGo Music 插件

把 [闪闪音乐网](https://www.33ve.com/)（33ve.com）接进 [MyGo Music](https://github.com/egoist/mygo-music)：榜单、歌单、歌手、搜索，在线播放 MP3 并显示 LRC 歌词。

插件只有一个 `plugin.json` 和一个 `index.js`，无需构建，macOS / Windows / Linux 通用。

## 安装

1. 打开 MyGo Music → 设置 → 插件 → `+` → Show Plugins Folder。
2. 把 `33ve-plugin` 文件夹放进该目录（或把 `33ve-plugin-1.0.0.zip` 解压进去），重启应用。
3. 在 设置 → 插件 里启用“闪闪音乐”。

## 功能

- **首页**：推荐音乐、网友在听、热门歌单、推荐歌手。
- **排行榜**：TOP、欧美、内地、恋爱的歌。
- **歌单**：歌单广场按主题分类，进入歌单详情播放整张列表。
- **歌手**：歌手列表与歌手最新歌曲。
- **搜索**：按歌名或“歌手 + 歌名”搜索，每页 30 首，可继续加载。
- **歌词**：读取站点播放接口返回的 LRC，并去掉站点水印行。
- **我的喜欢 / 最近播放**：站点没有账号体系，由插件本地保存。

## 站点的人机验证

站点给网页加了一道“我不是人机”的勾选验证，验证状态和会话 Cookie 绑定。插件会自动处理：

1. 请求页面时如果拿到验证页，取出其中的 `csrf_token`；
2. 向同一地址提交 `csrf_token` 与 `human_check`；
3. 带着返回的 `PHPSESSID`、`server_name_session` 重新请求。

插件的 `fetch` 不会自动保存 Cookie，因此 Cookie 由插件记录并在每次请求时手动带上。验证状态通常保持 1 小时。

如果验证反复失败，可以在插件设置里粘贴浏览器 Cookie 兜底：浏览器打开 www.33ve.com 通过验证 → 开发者工具 Network 里复制任意请求的 `Cookie` 请求头 → 粘贴到“会话 Cookie（可选）”。

## 音频与歌词的来源

站点歌曲页调用：

```
POST https://www.33ve.com/style/js/play.php
id=<歌曲 hash>&type=dance
```

返回 JSON：`title`、`name`、`singer`、`pic`、`url`（MP3 直链）、`lrc`。插件按 `dance` → `mp3` → `music` → `song` 的顺序尝试，取第一个带 `url` 的响应。直链带时效，用户点播时才获取。

## 已知限制

- 站点没有账号，所以没有登录、云同步、评论；“喜欢 / 历史”只存在本机。
- 歌单详情页的翻页链接在站点上始终返回第 1 页内容，插件只取首屏 10 首。
- 歌手页的“最新歌曲”之外还会混入推荐歌曲，插件只解析“最新歌曲”区块。
- 站点专辑页为空（“共有 0”），插件不提供专辑入口。
- 列表页多数不标时长，这些曲目显示 00:00。
- 站点内容版权归原权利人所有，插件只做页面解析和跳转播放。

## 发布到插件目录

1. 新建公开 GitHub 仓库，把 `plugin.json`、`index.js`、`locales/` 放在仓库根目录。
2. 给仓库加 topic `mygo-music-plugin`。
3. 安装按钮链接：`mygo-music://install-plugin?repo=<owner>/<repo>`。

## 版本

- 1.0.0（2026-11-22）：首个版本，要求 MyGo Music 0.1.20 及以上（封面使用 `{size}` 占位）。
