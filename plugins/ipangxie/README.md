# 我爱听书 插件

站点：https://ipangxie.com

有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a，`Range` 回 206）。

- 首页 / 分类：卡片 `<a href="/book/<id>.html" title="书名">`，分类页 `/<分类前缀>/<tid>.html`，分页 `-<n>.html`
- 详情 `/book/<id>.html`：`<title>《书名》`、封面、播讲 / 作者 / 类型、章节列表 `/play/<pid>-0-<i>.html`
- 播放 `/play/<pid>-0-<i>.html`：页面里的 `var now="…"` 就是当前集地址
- 搜索：站内 `search.php` 弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫分类页前几页建本地书名索引（缓存 30 分钟）再匹配

与 环球听书 / 更快听书 / 瓜播听书 / 爱上听书 等站同一套模板，只换域名与详情路径前缀。
