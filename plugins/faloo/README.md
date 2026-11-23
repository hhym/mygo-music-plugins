# 飞卢听书 插件

站点：http://ts.faloo.com

按 MyGo Music 插件规范实现，支持首页、分类、搜索、播放、喜欢与历史。
源站不可达或音频解析失败时，会按书名/节目名回退到蜻蜓 FM 同名音频，专辑名标记为“蜻蜓FM 兜底”。

> 2026-11 接口变更：`m.qtfm.cn/vchannels/<chid>/programs/<pid>/` 已变成 SPA 空壳，页面里没有 `audioUrl`。兜底改走 `webapi.qtfm.cn/api/mobile/channels/<chid>/programs/<pid>` 的 `programInfo.audioUrl`，它先回 302 再跳到带 `auth_key` 的签名 m4a；插件解出 `location` 后把最终地址交给播放器，避免宿主不跟 302。

