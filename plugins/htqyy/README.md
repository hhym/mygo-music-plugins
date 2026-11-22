# 好听轻音乐 · MyGo Music 插件

把 [好听轻音乐网](http://www.htqyy.com/)（htqyy.com）接进 [MyGo Music](https://github.com/egoist/mygo-music)：轻音乐精选、分类、榜单、搜索，在线播放 MP3。

## 安装

1. 打开 MyGo Music → 设置 → 插件 → `+` → Show Plugins Folder。
2. 把 `htqyy-plugin` 文件夹放进该目录（或把 `htqyy-plugin-1.0.0.zip` 解压进去），重启应用。
3. 在 设置 → 插件 里启用“好听轻音乐”。

## 功能

- **首页**：轻音乐精选 30 首、排行榜入口、分类入口。
- **排行**：热播榜、最新榜、总榜。
- **分类**：纯音乐、新世纪、钢琴曲、减压放松、中国音乐、天籁之音、影视原声、电子乐、背景音乐、佛乐。
- **搜索**：按歌名搜索，站点一次返回最多 30 个结果，不翻页。
- **我的喜欢 / 最近播放**：站点无账号，由插件本地保存。

## 站点结构

- 精选列表：`/choice/6` 是服务端页面；插件优先请求它的 AJAX 接口  
  `/choice/musicList?pageIndex=<从 0 开始>&pageSize=30&order=choice`，必须带 `Referer: http://www.htqyy.com/`。
- 榜单：`/top/hot`、`/top/latest`、`/top`。
- 分类：`/genre/<id>`。
- 搜索：`/home/search?wd=<UTF-8 编码的关键词>`，返回 30 条。
- 播放页：`/play/<id>`，内嵌 `fileHost` 与 `var mp3="<id>/mp3/1"`，拼出音频地址；音频服务器要求带 `Referer`，插件在 `stream` 里返回这个请求头。

列表卡片没有歌手字段，因此列表与榜单中的曲目不显示歌手；搜索结果会显示歌手与专辑。

## 已知限制

- 站点无账号、无评论；“喜欢 / 历史”只在本机。
- 列表卡片没有时长，显示 00:00。
- 播放页没有提供 LRC 歌词，插件不返回歌词。
- 站点内容版权归原权利人所有，插件只做页面解析和跳转播放。

## 发布到插件目录

1. 新建公开 GitHub 仓库，把 `plugin.json`、`index.js`、`locales/` 放在仓库根目录。
2. 给仓库加 topic `mygo-music-plugin`。
3. 安装按钮链接：`mygo-music://install-plugin?repo=<owner>/<repo>`。

## 版本

- 1.0.0（2026-11-22）：首个版本，要求 MyGo Music 0.1.20 及以上。
