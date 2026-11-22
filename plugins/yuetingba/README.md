# 悦听吧 插件

站点：http://www.yuetingba.cn

按 MyGo Music 插件规范实现，支持首页、分类、搜索、播放、喜欢与历史。

- 搜索：站内 `/search?type=1&name=<关键词>&pageIndex=1`
- 播放：书页取首章 `/book/ting/<uuid>`，调 `/api/app/docs-listen/<uuid>/audio-url` 拿 MP3 直链
- 直链带 token 与过期时间，过期后重新请求即可
- 源站失败才回退蜻蜓 FM 同名音频
