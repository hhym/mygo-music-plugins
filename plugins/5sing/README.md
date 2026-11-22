# 5sing — MyGo Music 插件

把 [5sing 原创音乐基地](https://5sing.kugou.com/) 接进 MyGo Music：首页推荐、原创 / 翻唱 / 伴奏榜单、歌单广场、音乐人主页、搜索、播放与歌词。

## 安装

把 `5sing-plugin` 文件夹放进 MyGo Music 的插件目录（设置 → 插件 → + → 显示插件文件夹），或在设置 → 插件里选这个文件夹 / 它的 zip 安装。没有构建步骤，`index.js` 直接运行。

插件只读站点公开内容，不需要登录。

## 功能

- **首页**：站点 `web_rec_data` 里的七个栏目（今日推荐、古风、流行、摇滚、民谣、二次元·游戏、民族），首个栏目会作为首页顶部的今日歌曲卡片。
- **榜单**：原创音乐榜、翻唱流行榜、伴奏搜索榜，各取当页 100 首。
- **歌单**：歌单广场 ` /gd/` 的全部卡片；打开后是该歌单的曲目（` /<uid>/dj/<hash>.html`）。
- **音乐人**：`/artists/all` 的音乐人卡片；主页合并其原创、翻唱、伴奏三类歌曲。
- **搜索**：站内搜索，返回第一页 10 条。
- **播放与歌词**：播放地址与 LRC 来自 `5sservice.kugou.com` 的 `song/getsongurl` 与 `song/detail`。
- **喜欢 / 最近播放**：由插件自己记录（站点没有可供插件使用的账号体系）。

## 站点接口说明

站点页面是服务端渲染的 HTML：榜单每行有 `name="i_more" value="<songId>$<yc|fc|bz>"`，音乐人歌曲在 `<a href="/yc/<id>.html" title="歌名">` 里，歌单曲目在 `<ul class="c_wap dj_songitems">` 内。

取播放地址前要签名：参数集合为 `appid=2918`、`clientver=1000`、`mid`/`uuid`（32 位十六进制）、`dfid=-`、`clienttime`（毫秒）加上 `songid`、`songtype`、`version`；按参数名升序拼成 `k=v`（**不加 `&`**），前后各接一次 `defaultSignOptions.appkey`，取小写 MD5 作 `signature`。`song/detail` 用驼峰 `songId` 和数字 `songType`（原创 1、翻唱 2、伴奏 3）。

## 已知限制

- **搜索只有 10 条**：站点的分页参数和类型过滤都失效（任何页都返回同样的第一页），所以 `more` 恒为 `false`。搜索接口只走 `http://search.5sing.kugou.com`，它的 https 域名会 503。
- **没有数字专辑**：`/<uid>/zj/<hash>.html` 的曲目由前端异步加载，服务端 HTML 里没有，故不提供。
- **榜单曲目没有时长**：榜单与列表页不给时长，插件填 0，由播放器读出实际时长。
- **封面尺寸**：图片地址用 `{size}` 占位（`hash.jpg_{size}x{size}.jpg`），因此要求 MyGo Music 0.1.20 或更新。

## 发布

放到公开的 GitHub 仓库，`plugin.json` 在仓库根目录；给仓库加 `mygo-music-plugin` 话题即可出现在插件列表。也可以打一个 zip 作为 release 附件（不带平台名），或直接让用户安装本地 zip。
