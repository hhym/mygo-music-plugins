# 59听书 插件

站点：https://59ting.com

有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。

- 首页 / 分类：卡片 `/ting/<id>.html`，分类 `/list/<tid>.html`，分页 `-<n>.html`
- 详情 `/ting/<id>.html`：书名、封面、播讲 / 类型、章节列表 `/play/<pid>-0-<i>.html`
- 播放 `/play/<pid>-0-<i>.html`：页面 `var now="…"` 即当前集地址
- 搜索：站内 `search.php` 要图形验证码，插件改为扫分类页建本地书名索引（缓存 30 分钟）
