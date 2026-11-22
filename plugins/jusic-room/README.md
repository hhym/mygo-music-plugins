# 一起听歌吧 · MyGo Music 插件

把 [happy.alang.run](https://happy.alang.run/)（Jusic「一起听歌吧」听歌房）接进 MyGo Music，做成**只读跟随**的音源：房间里正在播放的那首、以及待播队列里的歌，都会同步到 App 里，点开就能直接放。

- 插件 id：`jusic-room`
- 版本：1.0.0（`minAppVersion` 0.1.20）
- 播放方式：`stream`

## 这个站不是曲库

`happy.alang.run` 只是房间界面，内容全在 `https://tx.alang.run/api` 的 SockJS + STOMP 后端里（后端开源：`JumpAlang/Jusic-Serve-Houses`，`music.alang.run` 那套）。REST 只放行了 `/server/**`、`/house/**` 等少数路径（见 `SpringSecurityConfig`），`/music/*` 的 REST 一律 401，只有进了房间的 STOMP 会话能用。

进房间（`houseId` + `housePwd`，`connectType=enter`，匿名也可以）之后，服务端会主动推：

| 消息 | 内容 |
| --- | --- |
| `MUSIC` | 正在播放：完整元数据 + 已签名的 mp3 直链 + 整首 LRC |
| `PICK` | 待播队列，每条也带直链 |
| `ONLINE` | 房间在线人数 |
| `ANNOUNCEMENT` | 房间公告 |

## 为什么只读，不发点歌

读后端源码确认过三件事：

1. 直链只在**点歌入队**那一刻由 `MusicServiceImpl` 签出来（酷我 `kw-bj.kuwo.cn`、网易云 `m8xx.music.126.net`、QQ 歌走 `ktrack`），签名参数（`vuutv` / `bitrate$320` 之类）插件侧算不出来；
2. `/music/search` 与房间「默认歌单」（`/music/defaultPlaylist`，实测 231 首）**只有元数据**，没有 `url` 字段；
3. 站内没有音频代理路径，`/house/add`（自建房间）要「订单号」，`/music/pick` 是唯一的取流入口。

也就是说，想给任意一首搜索到的歌拿直链，只能把它 `SEND /music/pick` 点进一个**真实房间**的队列——那会出现在别人的听歌列表里、还会把房间的播放切过去。所以本插件**只发 `CONNECT` 和 `/music/search`**，一个 `pick` 都不发，不影响房间里任何人：

- 正在播放 / 待播队列 → 能在 App 里直接播（实测直链 `206 audio/mpeg`，整首歌 11.8MB，不是试听片段）；
- 搜索结果 → 真实结果，带封面、时长、歌手；点播放会明确报「房间只给正在播放和队列里的歌签直链，这首要点进房间才能播」，并标记为不可播；
- 免费站方封面用的 `api.injahow.cn/meting` 也试过，`type=url` 只给 30 秒 128kbps 试听（`duration=30.04`），不能当音源，所以没接。

## 协议实现

插件运行时没有 WebSocket（host 只给 `fetch`），所以走 SockJS 的 **xhr 轮询**通道，再在帧里跑 STOMP：

- 开连接：`POST /api/server/{server}/{session}/xhr?houseId=…&housePwd=…&connectType=enter` → 首帧 `o`；
- 发命令：`POST /api/server/{server}/{session}/xhr_send`，body 是 JSON 数组，元素是 STOMP 帧文本（`CONNECT` / `SEND`）；
- 收消息：反复 `POST .../xhr`，回 `h` 心跳或 `a[...]` 一组帧；
- 服务端把歌词里的换行原样塞进 JSON 字符串，严格 `JSON.parse` 会失败，所以解析失败时把裸换行转义再解一次。

一次 `home()` 大约 3–6 秒（要等 `MUSIC`/`PICK` 推下来），结果缓存 60 秒；`stream()` 用缓存里的直链，歌曲不在缓存时会重连一次房间再判定。

## 设置

| 设置 | 说明 |
| --- | --- |
| 房间 ID | 默认 `DEFAULT`（公开的「一起听歌吧」）；首页的「打开房间列表」列出按在线人数排的前 80 个房间 |
| 房间密码 | 只对密码房间有用 |
| 搜索音源 | `wy` / `qq` / `mg` / `kw` / `kg`，只决定搜索打哪个曲库 |

## 目录

```
plugin.json        # id、版本、权限（tx.alang.run、*.music.126.net、*.kuwo.cn 等）、侧边栏
index.js           # SockJS 轮询 + STOMP + 跟随房间的逻辑
locales/zh-CN.json # 中文文案
locales/en.json    # 英文文案
selftest.mjs       # Node 22 真机自测（匿名进 DEFAULT 房，只读）
README.md
```

## 自测结果

```
node selftest.mjs
✓ home subtitle 房间 DEFAULT · 5 人在线 · 你可以选择自己想要的未來，不要放弃這個权利
✓ home sections 正在播放:1 | 待播队列:5 | 房间:1
✓ rooms 按在线人数排的前 80 个
✓ search 泡沫 30 | 泡沫 (G.E.M.重生版) / G.E.M.邓紫棋
✓ search marked unplayable 30/30
✓ stream now mp3 https://m701.music.126.net/…
✓ audio probe 206 audio/mpeg
✓ lyrics 75 lines | [00:00.000] 作词 : 林达浪/h3R3
✓ search result refuses to stream unavailable
ALL PASS
```

## 安装

MyGo Music → 设置 → 插件 → `+` → 选这个 zip，或把 `jusic-room` 文件夹丢进插件目录。
