# 石头听书 插件

站点：https://www.shitou.club/list/cls/10042.html

WordPress（Ripro 主题）的影视/有声书站群，**站点自己不放音频**：一本书是一篇文章 `/p/<id>.html`，正文里嵌一个 B 站播放器 iframe，音频得从 B 站的 dash 流里取。

- 列表 / 分类：卡片 `<a href="/p/<id>.html" title="书名">`，封面 `data-original`（`i*.hdslb.com`），分类 `/list/cls/<tid>.html`，分页 `?page=N`（`/list/cls/<tid>_2.html` 是 404）
- 详情 `/p/<id>.html`：`<title>《书名》…（作者：…） - 【分类】`、`<meta name="description">` 是简介、iframe 里带 `bvid`
- 搜索：`/?s=<关键词>`（WordPress 原生，无验证码），分页 `&paged=N`
- 章节：靠 B 站 `x/web-interface/view?bvid=` 的 `pages`，一个 P 就是一集
- 播放：`x/player/playurl?bvid=&cid=&fnval=16` 取 `dash.audio`（AAC-LC，`m4s`），再用本机 ffmpeg `-c:a copy` 重封装成 `.m4a` 放插件数据目录，交给宿主播 `file://`

踩过的坑：

- B 站接口必须带 `buvid3`（先打 `x/frontend/finger/spi` 匿名取，缓存起来复用）和 `Referer: https://www.bilibili.com/`，否则 412。
- `dash.audio` 的 `baseUrl` 后缀是 `.m4s`，宿主对 m4s 有黑名单，所以一定要重封装成 `.m4a`，不能直给。
- ffmpeg 读远程地址也得带 UA 和 Referer，否则 CDN 回 403（`-user_agent` + `-headers` 两个都要）。
- 站点回源经常 503，页面请求重试 3 次、间隔 1.5s。
