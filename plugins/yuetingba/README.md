# 悦听吧 插件

站点：http://www.yuetingba.cn

按 MyGo Music 插件规范实现，支持首页、分类、搜索、全部专辑、专辑详情、播放、喜欢与历史。

- 「全部专辑」：9 个分类合并去重，每页约 150 本，翻页覆盖全站
- 「专辑内容」：`album({id})` 读取书页全部章节分页（每 200 集一页），返回专辑名、封面、作者、主播、简介和完整章节列表
- 单集播放：`/book/ting/<章节ID>` → `/api/app/docs-listen/<章节ID>/audio-url` 拿 MP3 直链
- 搜索：站内 `/search?type=1&name=<关键词>&pageIndex=1`，返回 `tracks` 与 `albums`
- 源站失败才回退蜻蜓 FM 同名音频
