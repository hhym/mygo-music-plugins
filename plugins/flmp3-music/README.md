# 凤梨音乐 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的音源插件，数据来自 [www.flmp3.pro](https://www.flmp3.pro)（凤梨音乐网）。

站点是纯 HTML 的资源站，不用登录、没有 Cookie，普通请求就能拿到全部页面。音频走站点的 `/api/playurl.php` 拿到一个酷我 CDN 的直链，没有防盗链，App 里能直接播。

## 安装

1. 文件夹：把整个 `mygo-plugin-flmp3-music` 目录放进应用的 `plugins` 目录（设置 → 插件 → `+` → 显示插件文件夹）。
2. zip：设置 → 插件 → `+` → 从本机选择 `凤梨音乐-mygo插件.zip`。
3. GitHub：把本目录推到公开仓库，加 `mygo-music-plugin` topic，即可「从 GitHub 安装」。

`minAppVersion` 是 `0.1.20`。

## 功能

| 入口 | 说明 |
| --- | --- |
| 首页 | 最新音乐 20 首、音乐合集 12 张，加「全部歌曲 / 音乐合集 / 热搜词」入口 |
| 全部歌曲 | `/song.html?page=<n>`，每页 12 首，可翻页 |
| 音乐合集 | `/heji.html?page=<n>`，每页 12 张合集 |
| 搜索 | `/search.html?keyword=<kw>&page=<n>`，12 条/页，按 offset 翻页 |
| 单曲页 | 歌名、歌手、封面、日期、歌词、热门推荐 |
| 播放 | `/api/playurl.php?id=<id>` 返回酷我直链，mp3 / aac 都认 |
| 本机库 | 喜欢、最近播放存在插件自己的 storage 里 |

不支持：下载（站点要过 `/api/captcha.php` 的图形验证码，再跳网盘）、歌手页与专辑页（站点没有这两类实体页）、歌单。

## 站点接口速查

```
首页        GET  /index.html
全部歌曲    GET  /song.html?page=<n>       一页 12 首
音乐合集    GET  /heji.html?page=<n>       一页 12 张
搜索        GET  /search.html?keyword=<kw>&page=<n>
单曲/合集   GET  /song/<id>.html
播放地址    GET  /api/playurl.php?id=<id>  纯文本，形如 https://car-lv.kuwo.cn/....mp3
验证码      GET  /api/captcha.php?act=image
```

列表项统一是 `<li><a href="/song/<id>.html">`，里面 `img` 封面、`h3` 名称、`p` 歌手、`.date` 日期。

单曲页有 `<audio id="audioTag">`，合集页没有播放器；两种页面共用 `/song/<id>.html`，插件按有没有播放器元素区分。

## 合集为什么不能播

「音乐合集」是打包资源页：正文是简介和曲目清单（`1 万物生(国语)`、`2 左手指月`……），下载按钮走网盘，页面本身没有音频，也没有对应的单曲 id。所以插件把合集按专辑展示，曲目数为 0，描述里写明「站点只提供打包下载，没有单曲播放」，不会出现点了播放却没声音的情况。搜索结果里混进来的合集同样会提示这句。

## 目录

```
mygo-plugin-flmp3-music/
├─ plugin.json   清单：id、权限（www.flmp3.pro / img.flmp3.pro / *.kuwo.cn）、导航
├─ index.js      全部逻辑，纯 ESM，无构建
└─ README.md
```
