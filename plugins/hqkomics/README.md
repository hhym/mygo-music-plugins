# 环球听书 插件

站点：https://hqkomics.com

有声小说站，书 = 专辑、集 = 曲目，音频直链在喜马拉雅 CDN（`aod.cos.tx.xmcdn.com` 的 m4a）。

- 首页 / 分类：卡片 `<a class="link" href="/mp3/<id>.html" title="书名">`，分类 `/hq/<tid>.html`，分页 `-<n>.html`
- 详情 `/mp3/<id>.html`：`<title>《书名》`、封面 `imagev2.xmcdn.com`、播讲 / 作者 / 类型、章节列表 `/play/<pid>-0-<i>.html`
- 播放 `/play/<pid>-0-<i>.html`：页面里 `var now="…"` 即当前集地址，`Range` 回 206 `audio/mp4`
- 搜索：站内 `search.php` 一律弹「系统安全验证」图形验证码，插件不去猜验证码，改为扫首页分类页（每类前 2 页）建本地书名索引，缓存 30 分钟再匹配

同类站（gkbasic、guabo、kmbas 等）用同一套模板，只换域名与详情路径前缀。
