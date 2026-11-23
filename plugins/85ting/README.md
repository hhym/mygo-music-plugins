# 85听书网 插件

站点：https://www.85ting.com

按 MyGo Music 插件规范实现，支持首页、分类、搜索、专辑详情、播放、喜欢与历史。

- 首页 / 分类：解析 `/ting/<id>.html` 卡片；分类 `/list/85X.html`，分页 `/list/85X-N.html`
- 搜索：站内 `POST /search.php`，字段 `searchword`
- 专辑：读取 `/ting/<id>.html`，解析 `vlink` 下的全部章节 `/play/<vid>-<from>-<part>.html`
- 播放：播放页里 `var now="..."` 即当前集音频，通常为 `aod.cos.tx.xmcdn.com` 的 m4a
- 站点回源不稳定，插件对 5xx 会重试 6 次
