# 汽车音乐网 · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的插件，数据来自 [www.carsmp3.com](https://www.carsmp3.com)（汽车音乐网）。

## 这个站是什么

Discuz! 论坛，整站 **GBK** 编码，主题就是「无损车载音乐」：一个帖子=一张专辑或一个合集，正文写介绍、贴封面，下载地址藏在「回复本帖可见」里。站点**自己没有音频文件**，帖子里的试听是 APlayer + Meting，也就是网易云。

所以插件做成两级：

1. **目录** —— 首页、板块、帖子标题/封面/正文/帖内专辑清单，都是站点真数据；
2. **试听** —— 拿帖子标题去网易云匹配，能播的交给播放器（和站长挂 Meting 是同一套思路）。

站点整站是 GBK，插件优先用运行时的 `TextDecoder("gbk")`；如果宿主没带 GBK 支持（界面标题变成 `���`），自动切到内置的 24066 字 GBK 映射表，标题与栏目名照常显示。封面挂在同一域名上，打开热链保护，所以 `plugin.json` 里给图片请求补了 `Referer`。

页面结构（全部实测）：

| 用途 | 请求 |
| --- | --- |
| 首页 | `/`，portal block，每块一个板块 + 封面帖 |
| 板块 | `/forum-<fid>-<page>.html`，20 帖/页 |
| 帖子 | `/thread-<tid>-1-1.html`，`span#thread_subject`、`div.authi`、`div#postmessage_` |
| 搜索 | `/search.php` **要登录**，插件改用网易云搜索 |
| 试听元数据 | `api.i-meto.com/meting/api?server=netease&type=search&id=<kw>` |
| 音频 | `api.injahow.cn/meting/?server=netease&type=url&id=<sid>`，302 到 `music.126.net` 的 mp3 |
| 歌词 | 同上 `type=lrc`，纯 LRC 文本 |

板块 id：40 华语、41 外语、42 纯音乐、43 DJ摇滚、44 车载MV、46 抖音歌曲、49 无损单曲、51 Hi-Res。

## 播放链路

`type=url&id=<sid>` 返回 302，`Location` 是网易 CDN 的 mp3，`Range` 实测 206，所以 `playback` 用 `stream`、类型 `mp3`。1.0.2 起权限里补上跳转目标 `*.music.126.net`（否则宿主会报 `fetch failed`），并从 `content-range` 读出音频总大小交给播放器，底栏和曲目时长不再固定 0:00。

有些歌（VIP / 地区限制）会返回 200 空体、没有 `Location`，这时插件抛 `unavailable`，播放器显示「这首在网易云没有公开试听，换一首或回站点下载」——不会假装能播。

网易直链有效期约 20 分钟，插件缓存 2 分钟，够一次播放。

## 试听是怎么匹配的

帖子标题 → 关键词：

- 有《》：「经典回忆 李宗盛《理性与感性作品音乐会》…」→ 歌手 `李宗盛`，优先用歌手去搜
- 没《》：去掉「无损 / FLAC / 专辑 / 合集 / 全部 / 下载 / 网盘 / 年份区间」等词，剩下的第一个词当歌手
- 搜出来再做一次相关性过滤：作者或歌名里带歌手的留下；全被滤掉就退回原始结果

结果会在专辑页写明「试听为按标题匹配的网易云曲目，不一定是帖内那张专辑」。这不是装饰性提示：帖子可能是一张 40 碟的合集，匹配到的只能是同歌手的几首。

## 功能

- 首页：6 个板块块，华语/DJ 两块带 10 条列表，其余板块带封面帖
- 板块页翻页（`forum/40` → `forum/40/2`，总页数从「共 N 页」读）
- 帖子页：标题、发帖人、日期、封面、正文摘要、帖内《》专辑清单（最多 40 条）
- 专辑页（帖子）：封面 + 说明 + 12 首匹配试听
- 搜索：网易云搜索，30 条（Meting 的搜索接口不吃 `page`，所以 `more` 恒为 false）
- 歌词、单曲播放、本机库的喜欢与最近播放

## 不支持

- **下载**：附件和网盘链接要登录 + 回复，插件不代下，也不绕权限
- 站点站内搜索：游客访问 `search.php` 被要求登录
- 用户歌单、收藏夹：都要登录

## 安装

1. 文件夹：把 `mygo-plugin-carsmp3-music` 放进应用的 `plugins` 目录。
2. zip：设置 → 插件 → `+` → 选 `汽车音乐网-mygo插件.zip`。
3. GitHub：推到公开仓库，加 `mygo-music-plugin` topic。

`minAppVersion` 是 `0.1.20`；文案全中文写死，没有 `locales/en.json`。

## 目录

```
mygo-plugin-carsmp3-music/
├─ plugin.json   清单：id、三个域名权限、导航
├─ index.js      GBK 解码、portal/板块/帖子解析、Meting 搜索、302 取音频
└─ README.md
```
