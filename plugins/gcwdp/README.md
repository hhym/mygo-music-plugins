# 广场舞地盘（gcwdp）

给 [MyGo Music](https://github.com/egoist/mygo-music) 写的音源插件，站点是 [www.gcwdp.com](https://www.gcwdp.com/)。

## 能干什么

- 最新舞曲、免费舞曲、交谊舞曲、轻音乐四个频道，按列表浏览并分页
- 舞曲库：一首歌一个文件夹，点进去是各个舞队翻的版本
- 标题搜索、搜索建议、按舞队名找歌
- 在线试听（MP3，可拖进度）

## 站点脾气

整站是 DedeCMS，GB2312 编码，没有一条 JSON 接口。所以插件里自带一张 GB2312 码表，两个用途：

- 解响应：`fetch` 回来的是字节，自己按码表拼字符串（不依赖运行时的 `TextDecoder("gbk")`）；
- 编请求：站内搜索是按 GBK 字节比对标题的，搜索词必须自己编回 GB2312，直接发 UTF-8 永远是 0 条。顺带一提，`广场舞` 这个词本身是站点的搜索停用词，搜它也是 0 条，别的词正常。

列表页有两套模板：最新舞曲是「封面 + `title-text`」，交谊舞曲/轻音乐/搜索是纯文字的 `doc-tit`。解析以标题元素为锚点往前找最近的文章链接和封面，两套都能吃。

## 试听地址怎么来的

详情页那个试听框其实是 iframe，指向 `/plus/shiting_new.php?id=<aid>`，里面的 `<audio src="https://3.gcwdp.com/shiting/st-<id>.mp3?auth_key=...">` 就是直链，裸请求 206、能 Range。

两个坑：

- 这个试听页**只认文章页本身作 Referer**（`https://www.gcwdp.com/zxgcw/<aid>.html`），Referer 不对或没有就返回 200 空文档；
- `auth_key` 是限时的，十来分钟就过期，所以插件现取现播，只缓存两分钟。

## 不碰的东西

下载是收费的（`/plus/hidden.php` 按订单号解锁），插件不碰这条链路，只做免费试听；站内也确认没有歌词，所以不提供歌词。

## 目录

```
plugin.json / index.js / README.md / locales/ / selftest.mjs
```

`selftest.mjs` 用 Node 跑真实网络，模拟宿主 `host` 的最小实现，覆盖首页、频道、分页、舞曲库专辑、搜索、按舞队找歌、直链试听：

```bash
node selftest.mjs
```
