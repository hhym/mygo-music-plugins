# 娓雅评书 插件

站点：https://www.wpingshu.com/

帝国 CMS + AMP 模板的评书站，目录按「评书者」分人：`/stfps/` 单田芳、`/ykcps/` 袁阔成、`/llrps/` 连丽如、`/llfps/` 刘兰芳、`/tlyps/` 田连元、`/tzyps/` 田战义、`/zszps/` 张少佐。

- 导航：`<nav class="nav">` 里是 `<a href="/stfps/">单田芳</a>` 这一串，张少佐、刘兰芳常不在导航上，插件用内置表补齐
- 书页 `/<分类>/<书名拼音>/`（成套的书是两段 `/llfps/llfps/plh75h/`）：`<h1>` 书名、封面 `/uploads/llr/*.jpg`、`评书者：xxx`、`状态：完结`、`<div class="info-main-intro">` 简介
- 章节：页面里有两块 `info-chapters` —— 先「最新章节」（倒序 6 条）、后「目录」（正序全量）。插件只取「目录」块，锚文本是「书名+集号」，如 `五龙捧圣01`
- 集页 `/<分类>/<书名拼音>/<集号>.html`：正文只有 `var articleId = "29027"`，音频地址靠站内脚本现算
- 搜索：站点没有可用搜索（`/search/` 一律 404，`public2.js` 里那个 `document.write` 的表单没被调用），插件改扫 7 个分类页建书名索引，缓存 30 分钟

音频怎么算：

```
q1 = articleId 首位数 + 1
q2 = articleId 末位数 + 3
q6 = articleId + 250011
GET /api/<q1><q6>3<q2>.html
```

返回 `[{"body":"<audio><source src=\"https://aod.cos.tx.xmcdn.com/...m4a\"/></audio>"}]`，取 `source` 的 `src`，脚本里还会把 `.flv` 换成 `.mp3`。以 `29027` 为例：`2+1=3`、`7+3=10`、`29027+250011=279038`，拼出来就是 `/api/3279038310.html`，和浏览器里真正发出的请求一致。

播放：拿到的多是喜马拉雅 xmcdn 的 **m4a**（`audio/x-m4a`），带 Chrome 桌面 UA + `Referer` 就能 206 分段取，直接交给宿主 `stream`。

踩过的坑：

- 站内 `templets/ps/js/public2.js` 只有导航和广告，**播放逻辑被塞进了 `templets/ps/js/jquery-1.3.2.min.js`**（其实是 jQuery 3.4 + jPlayer 2.9 + 那段拼 `/api/` 的代码），不翻这个文件根本看不出音频地址怎么来
- 集页 `var bt="336"` 是无关字段，别拿来拼地址
- 回源 503 非常频繁（约一半请求），页面和 `/api/` 都要重试；`/api/` 偶尔直接回 `upstream connect error`
- 部分老集在 xmcdn 上已被清掉，`/api/` 照样返回地址，但文件回 `404 NoSuchKey`，这种只能换一集听
- 分类页是单页，没有 `index_2.html`、`list_2.html` 这种分页，别去猜
