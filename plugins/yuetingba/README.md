# 悦听吧 插件

站点：http://www.yuetingba.cn

按 MyGo Music 插件规范实现，支持首页、分类、搜索、全部专辑、专辑详情、播放、喜欢与历史。

- 「全部专辑」：9 个分类合并去重，每页约 150 本，翻页覆盖全站
- 「专辑内容」：`album({id})` 读取书页全部章节分页（每 200 集一页），返回专辑名、封面、作者、主播、简介和完整章节列表
- 单集播放：`/book/ting/<章节ID>` → `/api/app/docs-listen/<章节ID>/audio-url` 拿 MP3 直链
- 搜索：站内 `/search?type=1&name=<关键词>&pageIndex=1`，返回 `tracks` 与 `albums`
- 源站失败才回退蜻蜓 FM 同名音频
- 2026-11 接口变更：`m.qtfm.cn/vchannels/<chid>/programs/<pid>/` 已变成 SPA 空壳，页面里没有 `audioUrl`。兜底改走 `webapi.qtfm.cn/api/mobile/channels/<chid>/programs/<pid>` 的 `programInfo.audioUrl`，它先回 302 再跳到带 `auth_key` 的签名 m4a；插件解出 `location` 后把最终地址交给播放器，避免宿主不跟 302。
