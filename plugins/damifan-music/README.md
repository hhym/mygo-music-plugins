# 大米饭 · MyGo Music 插件

把「大米饭」App（`damifan.apk`）接进 MyGo Music：个性化推荐、随机精选、标签分类、歌单广场、搜索，320kbps mp3 由 App 直接播放。

- 插件 id：`damifan-music`
- 版本：0.1.1（`minAppVersion` 0.1.20）
- 播放方式：`stream`（App 自己取流）

## 路径是怎么解析出来的

`damifan.apk` 是 Flutter 应用，Dart 代码编进了 `lib/arm64-v8a/libapp.so`。翻这个二进制里的字符串，能直接读到全部接口常量和源文件名（`services/api_service.dart`、`pages/playlist_page.dart`、`widgets/filter_drawer.dart` 等），没有加壳，也没有签名算法。

接口落在两个域名上：

| 域名 | 用途 |
| --- | --- |
| `api.damifan.top` | 只承接统计：`/ibaba.php?web=app&title=…`（播放上报）、`/userlog.php`（设备日志） |
| `api.buguyy.cc` | 真正的曲库，全部挂在 `/newapi/` 下 |

`api.damifan.top/newapi/…` 全 404 —— App 里的曲库请求其实打向 `api.buguyy.cc`（同一家运营方的另一个产品「布谷音乐」）。`getdetail.php` 出错时暴露的后端目录 `/www/wwwroot/a.buguyy.top/newapi/DbMysql.php` 也印证了这一点。

## 曲库接口

全部 GET，参数拼在 query 上：

| 接口 | 参数 | 说明 |
| --- | --- | --- |
| `getrand.php` | — | 随机一批 |
| `apppush.php` | `tags=流行:0.52,伤感:0.31,治愈:0.17` | 个性化推荐，一次 20 首，`hasMore` |
| `appmlist.php` | `tag`、`page`、`limit` | 按标签。流行 77,791 首、抒情 26,567、民谣 16,056、电子 17,616、摇滚 12,724 |
| `getgedan.php` | `page`、`size` | 歌单列表，total 9,077、757 页 |
| `gedandetail.php` | `id` | 歌单详情，带 `songs` |
| `search2.php` | `keyword`、`page` | 搜索，单页 10 条，返回 `total_pages` |
| `getdetail.php` | `id` | 单曲详情 |
| `geturl4.php` | `rid`、`type=json`、`level=exhigh`、`lrc=true` | 设计上的取流接口 |

列表项形状 `{id, title, singer, picurl, releaseDate, tags}`，`id` 就是酷我 rid（明文数字，不用 base64）。封面是 `https://imgN.kuwo.cn/star/albumcover/500/…`，路径里的 `500` 换成 `{size}` 交给 App 自取。

标签抽屉里的 15 个主流标签都实测有货，直接写进插件当入口，省一次请求。

## 播放

`geturl4.php` 现在恒返回 `HTTP 200 + 0 字节`（响应头是 `content-type: application/json`、`transfer-encoding: chunked`，body 是空的）。做过这些尝试全部一样：

- `rid` 换 6 个，`type` 取 `json/mp3/pic`，`level` 取 `standard/exhigh/high/lossless/aac/wma/ape/flac`，`lrc` 取 true/false；
- GET 加 `Origin`、`X-Requested-With`、`Referer`、`deviceid`；POST form / POST JSON 则回「为加请求参数」，说明它只认 query。

`getdetail.php` 也说明了原因：所有歌的 `playurl` 都是空串，音频只挂在 `kuakedownurl` 上，形如 `FLAC#https://pan.quark.cn/s/…###MP3#https://pan.quark.cn/s/…`，是**夸克网盘分享**，不是直链。抽查 14 首，`playurl` 有值的 0 首、带网盘链接的 14 首 —— 这个 App 本身就是「元数据 + 网盘」的路子，站内没有在线流。

所以 `stream()` 是两段式：

1. 先按原路径打 `geturl4.php`，接口哪天恢复就自动用上；
2. 不成就拿曲名 + 歌手去**同一家**的 `www.buguyy.top/api/search?keyword=` 匹配，取它的 `geturl`。那边的 `id` 是 base64 的自家 rid，`geturl` 直接吐 `car-*.kuwo.cn` 直链，裸请求 `206 audio/mpeg`。实测 10 首随机曲目 **10/10 命中且能播**，唱片库是同一批。

匹配规则：曲名完全相同 +60，前后缀包含 +40 / +25，歌手任一段命中 +8；如果候选是「伴奏 / 纯享 / 片段 / live」而原曲不是，扣 10 分。

取到地址后再打一个 `range: bytes=0-1` 的探测，从 `content-range` 里读音频总大小，随 `stream()` 一起返回给应用 —— 这样播放器的进度条才有总时长，不然只会停在 `0:00 / 0:00`。大小缓存 30 分钟，同一首歌重复点播不多打一次请求。

`api/geturl` 之外还试过 `www.buguyy.top/api/geturl?id=<明文 rid 的 base64>`，返回「无法获取播放地址 / 外部API返回错误」—— 两边的 id 空间不通用，只能靠曲名匹配。

## 能力边界

- 没有专辑、歌手、榜单接口（APK 里也只有 `getgedan` / `appmlist` / `search2` 这几条），所以不导出 `album` / `savedAlbums` / `playlists`，搜索的 `artists` 页用名字反查曲目里的歌手。
- 歌词取 `getdetail` 的 `about`，但库里大量条目本身就是「歌词获取失败」，这时 `lyrics()` 返回空串，App 会自己显示无歌词。
- 搜索要 `keyword`，传 `key` / `name` 会报「搜索关键词不能为空」。
- 播放地址变化快，插件缓存 5 分钟；命中失败的曲子换一首或稍后重试。

## 和布谷音乐插件的关系

`plugins/buguyy-music` 走的是 `www.buguyy.top/api/*`，只有热歌 50、新歌 50、搜索 50 首；这个插件走 `api.buguyy.cc/newapi/*`，有推荐、随机、15 个标签、9000+ 歌单、分页搜索。两者同源不同维，可以并存。
