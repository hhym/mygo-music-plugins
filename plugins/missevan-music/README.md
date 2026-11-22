# 猫耳FM · MyGo Music 插件

给 [MyGo Music](https://github.com/egoist/mygo-music)（葫芦音乐 / 千千静听同源内核）写的插件，数据来自 [www.missevan.com](https://www.missevan.com)。它是从 MusicFree 的「猫耳FM」插件（`猫头猫`，v0.1.4）搬过来的，接口一一对应。

## 先说清楚能不能播

**只有「音单」里的曲目能播**，这是这份插件最重要的边界。

- 音单接口 `/sound/soundalllist?albumid=` 返回的每个声音带 `soundurl`，是 `sound-ali*-cdn-cn.maoercdn.com` 上的**明文 `.m4a`**：不带参数、不要 Referer、`Range` 返回 206，所以能拖进度
- 单曲接口 `/sound/getsound?soundid=` 返回的却是 `hls.m3u8`，里面 `#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.apple.streamingkeydelivery"` 加一段 Widevine pssh——**DRM 加密**，第三方播放器解不了，插件也不去绕它

实测：`570763` 走音单是 11.1 MB 的 m4a（能放）；同一个 id 走 `getsound` 就是加密 HLS。搜索接口不给 `soundurl`，所以**从搜索结果点播放会提示「这条声音是 Widevine 加密的 HLS」**，而从音单点进去是能放的。推荐音单大多是 2017–2018 年的老音单（124 / 177 / 91 首，抽样全是 m4a），可播比例不低；2025 年之后的新内容基本都加密了。

## 接口

| 用途 | 请求 |
| --- | --- |
| 搜索声音 | `/sound/getsearch?s=<kw>&p=<n>&type=3&page_size=30` |
| 音单列表 | `/explore/tagalbum?order=0&tid=<标签>&p=<n>` |
| 音单曲目 | `/sound/soundalllist?albumid=<id>` |
| 标签分组 | `/malbum/recommand` → `{情感, 场景, 主题}`，每组 `[id, name]` |
| 单曲 | `/sound/getsound?soundid=<id>`（HLS/DRM） |

全部是 JSON，游客可访问，不用 Cookie。搜索返回 `info.Datas` 与 `info.pagination`（`p` / `maxpage`），付费声音用 `pay_type` 标出来，插件只留 `pay_type=0` 的。

数据映射：

- 声音 → Track：`id: "s"+id`，`soundstr` 当歌名，`username` 当歌手，`front_cover` 当封面，`duration` 是**毫秒**，换成秒再给播放器
- 音单 → Album：`id: "m"+id`，`title` / `front_cover` / `username` / `intro`
- 音单曲目一次全给（有的音单 177 首），不像搜索那样分页

## 功能

- 首页：推荐音单 18 张 + 古风音单 12 张
- 导航：推荐音单、古风（tag/5）、广播剧（tag/4）、二次元（tag/159），都能按 `…/页码` 翻
- 音单页：封面、作者、简介、曲目列表（124 首实测一次出完）
- 声音页：`sound/<id>`，单条详情
- 搜索：30 条一页，按 offset 翻页，结果过滤付费
- 歌手页：按用户名再搜一次声音，名字对得上的留前面
- 本机库：喜欢、最近播放；封面与时长都记住了
- 建议词：标签名（`/malbum/recommand` 缓存 30 分钟，首次用内置常见标签兜底）

## 不支持

- **剧集/广播剧搜索**：`/dramaapi/search` 对游客返回 `count: 0`（试过带 referer、换关键词都一样），所以搜索只做声音
- **付费内容**：`pay_type != 0` 直接过滤，不尝试付费接口
- **DRM 绕过**：加密 HLS 一律不返回，宁可不播
- 登录、关注、评论

## 安装

1. 文件夹：把 `mygo-plugin-missevan-music` 放进应用的 `plugins` 目录。
2. zip：设置 → 插件 → `+` → 选 `猫耳FM-mygo插件.zip`。
3. GitHub：推到公开仓库，加 `mygo-music-plugin` topic。

`minAppVersion` 是 `0.1.20`；文案全中文写死，没有 `locales/en.json`。

## 目录

```
mygo-plugin-missevan-music/
├─ plugin.json   清单：id、网络权限（www.missevan.com / *.maoercdn.com）、导航
├─ index.js      搜索、音单、标签、曲目映射、直链缓存、DRM 拒绝
└─ README.md
```
