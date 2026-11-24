# 听FM电台 插件

站点：<https://cn.tingfm.com>

版本：`0.2.0`  
插件 ID：`tingfm`

## 这一版重新排版了什么

旧版首页只有一段「推荐收听」曲目列表，MyGo 会把它渲染成一张大横幅，14 首歌挤在右侧，页面大部分留空。0.2.0 改成按电台频道聚合的卡片式首页：

- 「推荐电台」「音乐电台」「资讯电台」「情感电台」四行频道封面卡片
- 单独一栏「热门节目」，用曲目列表补足下方内容
- 底部「按类型发现」分类入口
- 侧边栏增加「分类」「热门」两个页面

## 功能

- 首页频道聚合：蜻蜓 FM 搜索节目后按 `parent_id` 归并成频道，不再把 14 个节目塞进一条横幅
- 分类浏览：推荐、音乐、资讯、情感、故事、有声书、相声、脱口秀
- 电台专辑页：读取频道信息，列出最新 60 期节目；付费期标记为不可播放
- 搜索：支持 `albums` 频道卡片与 `tracks` 单集两种结果
- 播放：蜻蜓 FM 签名 m4a 直链，先解 302 的 `location`，再返回最终地址
- 喜欢、历史、最近播放沿用原逻辑

## 搜索与频道聚合

```text
搜索：https://search.qtfm.cn/v3/search?include=channel&k=<关键词>&page=<页>&pagesize=20
频道：https://webapi.qtfm.cn/api/mobile/channels/<chid>
节目：https://webapi.qtfm.cn/api/mobile/channels/<chid>/programs?version=<v>&page_index=<页>
单集：https://webapi.qtfm.cn/api/mobile/channels/<chid>/programs/<pid>
```

搜索结果里的 `program_ondemand` 带 `parent_id`，插件按频道归并成专辑卡片；点击卡片进入频道页，节目 ID 形如 `qtfm-prog:<chid>:<pid>`。

## 播放链路

```text
programInfo.audioUrl
  → https://audio.qtfm.cn/audiostream/redirect/<chid>/<pid>
  → 302
  → https://vohwod-client-sign.qtfm.cn/m4a/....m4a?auth_key=...
```

插件用 `redirect: "manual"` 解出 `location`；付费节目跳到签名地址后是 401，因此会先用 HEAD 校验最终文件，失败就尝试下一期免费节目。

## 已知限制

- 频道页显示最新 60 期；付费期保留在列表里并标记 `unavailable`。
- 部分频道只有前几期免费，播放时自动跳过付费期。
- 首页仍以蜻蜓 FM 为主数据源；`cn.tingfm.com/radio` 改版后没有稳定可解析的公开列表。

## 安装

把 `tingfm-0.2.0.zip` 放进 MyGo 插件目录，或在应用内选择本地插件安装。

## 文件

```text
tingfm-plugin/
├── plugin.json
├── index.js
├── README.md
└── locales/
    └── zh-CN.json
```
