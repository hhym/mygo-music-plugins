# 水晶DJ网（40dj-music）

给 [MyGo Music](https://github.com/egoist/mygo-music) 用的水晶DJ网音源插件，站点是 [www.40dj.com](https://www.40dj.com/)。

## 能做什么

- 首页：RSS 最新 40 首，分「最新上传」「刚刚更新」两块
- 分类：串烧、中文、慢歌、车载、外文、交谊，走站内搜索，结果带站点自己的分类标签
- DJ 歌单：`/music/radio-<id>`，例如 341、6、3、4、317
- 搜索：`/music/search?key=<关键词>`，20 条一页
- 播放：曲目页 `/music/info-<id>` 的播放器配置，取 `"url"` 字段；旧模板回退 `<audio src>`
- 本地：最近播放、收藏、喜欢状态

## 实现说明

站点是 CSCMS 4.0。列表页的曲目链接统一是 `/music/info-<id>`，插件从链接所在的 `<li>` 里取标题、封面、分类、日期和码率；曲目页再取播放地址、大小和时长。

`stream()` 每次重新取曲目页，因为 CSCMS 的播放地址可能带时效签名；下载页 `/music/down/<id>.html` 只在曲目页没有地址时兜底尝试一次，登录墙或 404 会按真实错误返回。

分类页由 CSCMS 动态生成，不同皮肤路径会变；插件不写死会失效的列表地址，而是用站点搜索做分类入口，结果仍是站点真实数据。

`permissions.network` 除主域外还列了 `img.40dj.com`、`media.40dj.com`、`file.40dj.com`、`static.40dj.com`，因为 CSCMS 皮肤常把封面和音频放到独立域。

## 安装

把 `plugin.json`、`index.js`、`README.md`、`locales/` 放进：

- Windows：`%USERPROFILE%\.hulu-music\plugins\40dj-music\`
- macOS / Linux：`~/.hulu-music/plugins/40dj-music/`

或解压 `40dj-music-1.0.0.zip` 后重启 App。

## 已知限制

- 开发环境（云主机出口）访问 `www.40dj.com` 会回 503，插件已按真实状态报「站点暂时不可用」；用户网络可访问时直接工作，不需要改代码。
- RSS 只给最近 100 首，`latest` 最多翻 5 页；更早的曲目用搜索或歌单。
- 分类是站内搜索入口，不是固定分类页；站点改版后仍可用。
- 没有歌词，`lyrics()` 返回空 LRC。
