# 听友听书 插件

站点：https://www.tingyou.fm/listening

Nuxt 前端的白牌听书站，书 = 专辑、集 = 曲目。前端只做渲染，所有数据来自站内网关的明文通道 `/listening-api/*`（同一份数据浏览器走的是加密的 `api/h5/listening/*`，插件不走那条）。

- 榜单 `rank?section=latest|hot&page=N`（`items` 里有 id、书名、作者、播讲、封面、集数）
- 分类 `category?category=2&sort=popular|new|updated&page=N`（`2` 有声小说、`1` 评书，每页 20 条、100 页；`type` 细分参数实测不生效，只用大类）
- 详情 `album/<id>`：书名、作者、播讲、类型、简介、集数
- 章节 `chapters/<id>`：一次给全，`index` 从 1 开始
- 播放 `POST play` body `{album_id: "<字符串 id>", chapter_idx: <1 起的整数>}` → `play_url`（`fmfm.fdhtbz.cn/stream/...&ts=&sign=` 签名直链，`Range` 回 206 `audio/mpeg`）
- 搜索 `POST search` body `{keyword, page}` → `results`，站内没有验证码

踩过的坑：

- `album_id` 必须传**字符串**，传数字会 400「听书分类参数无效」；`chapter_idx` 从 **1** 开始，传 0 回 404。
- 网关频繁回 503（`upstream connect error`），插件对每个接口重试 3 次、间隔 600ms 起。
- 播放地址带 `ts`/`sign`，有效期短，每次播放都重新取，不缓存。
