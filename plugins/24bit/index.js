// 24bit无损音乐（www.24bit.net）— MyGo Music 插件
//
// 站点结构：
//   首页                /                          本周歌曲榜 / 本周歌手榜
//   16bit 44.1kHz 单曲   /music/b/<id>               页面内嵌 itemMusic 与 FLAC 直链
//   24bit 96kHz 单曲     /music/c/<id>
//   24bit 192kHz 单曲    /music/a/<id>
//   搜索                 POST /api/player/searchOnlineMusicTwo  16bit，每页 30 条
//                        POST /api/player/searchOnlineMusicOne  24bit，每页 30 条
//
// 站点是单曲站：一个搜索结果就是一首歌，没有真正的专辑目录。插件把每首
// 单曲当作一张只有一首曲目的专辑，专辑名后附带音质，避免 16bit 与 24bit
// 同名结果混淆。播放地址带时效票据，stream() 会优先复用一分钟内的直链，
// 超过一分钟就重新读取单曲页。

const BASE = "https://www.24bit.net";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const PAGE_TTL = 3 * 60 * 1000;
const API_TTL = 90 * 1000;
const PAGE_SIZE = 30;

const TIERS = {
  b: {
    path: "b",
    endpoint: "searchOnlineMusicTwo",
    label: "16bit 44.1kHz",
    badge: "16bit",
  },
  a: {
    path: "a",
    endpoint: "searchOnlineMusicOne",
    label: "24bit 192kHz",
    badge: "24bit 192kHz",
  },
  c: {
    path: "c",
    endpoint: "searchOnlineMusicThree",
    label: "24bit 96kHz",
    badge: "24bit 96kHz",
  },
};

const DEFAULT_TIER = "b";

let pageCache = new Map();
let apiCache = new Map();
let weeklyCache = null;

function fail(message, code) {
  const error = new Error(message);
  error.code = code || "unavailable";
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timed(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(fail(message, "unavailable")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function trimCache(cache, max) {
  if (cache.size <= max) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
  if (oldest) cache.delete(oldest[0]);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·・\-—_（）()\[\]【】"'“”‘’]/g, "")
    .trim();
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/\\\//g, "/")
    .trim();
}

function artistsOf(player) {
  const names = String(player || "")
    .split(/\s*(?:&|,|，|、|\/|;|；)\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
  return (names.length ? names : [String(player || "").trim()].filter(Boolean)).map(
    (name) => ({ id: "artist:" + name, name }),
  );
}

// Next.js 的 RSC 数据分成若干 self.__next_f.push([1,"..."])。先解出每段
// JSON 字符串，再在拼接后的文本里按大括号配对取对象。配对时会跳过字符串
// 内部的括号，歌词和标题里的符号不会打乱层级。
const RSC_PUSH =
  /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;

function rscStrings(html) {
  const out = [];
  for (const match of String(html).matchAll(RSC_PUSH)) {
    try {
      out.push(JSON.parse(match[1]));
    } catch (_) {
      // 忽略无法解析的片段
    }
  }
  return out;
}

function rscText(html) {
  return rscStrings(html).join("\n");
}

function objectAfter(text, key) {
  const marker = '"' + key + '":';
  const at = String(text).indexOf(marker);
  if (at < 0) return null;
  const start = String(text).indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function weeklyFromHtml(html) {
  const text = rscText(html);
  let data = objectAfter(text, "weekData");
  if (!data) {
    // 少数情况下 JSON 没有落在 RSC 字符串里，直接在原文中找转义对象。
    const unescaped = String(html).replace(/\\"/g, '"');
    data = objectAfter(unescaped, "weekData");
  }
  const musics =
    data && Array.isArray(data.musics)
      ? data.musics
          .map((item) => ({
            name: stripTags(item && (item._id || item.name)),
            count: Number((item && item.sumCount) || 0),
          }))
          .filter((item) => item.name)
      : [];
  const players =
    data && Array.isArray(data.players)
      ? data.players
          .map((item) => ({
            name: stripTags(item && (item._id || item.name)),
            count: Number((item && item.sumCount) || 0),
          }))
          .filter((item) => item.name)
      : [];
  return { musics, players };
}

async function weekly() {
  if (weeklyCache && Date.now() - weeklyCache.at < PAGE_TTL) return weeklyCache.data;
  const html = await fetchText("/");
  const data = weeklyFromHtml(html);
  if (!data.musics.length && !data.players.length) throw fail("没有从首页解析到本周榜单");
  weeklyCache = { data, at: Date.now() };
  return data;
}

async function fetchText(path, options) {
  const url = path.startsWith("http") ? path : BASE + path;
  if (!(options && options.fresh)) {
    const hit = pageCache.get(url);
    const maxAge = options && options.maxAge ? options.maxAge : PAGE_TTL;
    if (hit && Date.now() - hit.at < maxAge) return hit.html;
  }

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await timed(
        fetch(url, {
          headers: {
            "user-agent": UA,
            referer: REFERER,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
          },
          redirect: "follow",
        }),
        options && options.timeout ? options.timeout : 8000,
        "24bit 页面请求超时",
      );
      if (!response.ok) {
        if ([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 524].includes(response.status) && attempt < 2) {
          await sleep(400 + attempt * 500);
          continue;
        }
        throw fail("24bit 返回 HTTP " + response.status + "：" + url);
      }
      const html = await response.text();
      if (!html || html.length < 500) {
        if (attempt < 2) {
          await sleep(400 + attempt * 500);
          continue;
        }
        throw fail("24bit 页面内容为空：" + url);
      }
      pageCache.set(url, { html, at: Date.now() });
      trimCache(pageCache, 80);
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await sleep(500 + attempt * 600);
        continue;
      }
    }
  }
  throw lastError || fail("24bit 页面请求失败");
}

async function apiSearch(tier, keyword, page) {
  const meta = TIERS[tier] || TIERS[DEFAULT_TIER];
  const term = String(keyword || "").trim();
  if (!term) throw fail("搜索关键词不能为空");
  const p = Math.max(1, Math.floor(Number(page || 1)));
  const cacheKey = meta.endpoint + "|" + p + "|" + term;
  const hit = apiCache.get(cacheKey);
  if (hit && Date.now() - hit.at < API_TTL) return hit.items;

  const url =
    BASE +
    "/api/player/" +
    meta.endpoint +
    "?keyword=" +
    encodeURIComponent(term) +
    "&page=" +
    p;

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await timed(
        fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/plain, */*",
            origin: BASE,
            referer: REFERER,
            "user-agent": UA,
          },
          body: JSON.stringify({ keyword: term, page: p }),
          redirect: "follow",
        }),
        8000,
        "24bit 搜索接口超时",
      );
      if (!response.ok) {
        if ([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 524].includes(response.status) && attempt < 2) {
          await sleep(400 + attempt * 500);
          continue;
        }
        throw fail("24bit 搜索接口返回 HTTP " + response.status);
      }
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (_) {
        if (attempt < 2) {
          await sleep(400 + attempt * 500);
          continue;
        }
        throw fail("24bit 搜索接口返回的不是 JSON");
      }
      if (data.status === false || data.status === "false") {
        throw fail(String(data.message || data.msg || "24bit 搜索没有返回结果"));
      }
      const list = Array.isArray(data.result)
        ? data.result
        : data.result && Array.isArray(data.result.list)
          ? data.result.list
          : Array.isArray(data.data)
            ? data.data
            : [];
      const items = list
        .map((item) => ({
          id: String((item && item.id) || ""),
          name: stripTags(item && item.name),
          player: stripTags(item && item.player),
          album: stripTags(item && item.album),
          cover: decodeEntities(item && item.cover),
        }))
        .filter((item) => item.id && item.name);
      apiCache.set(cacheKey, { items, at: Date.now() });
      trimCache(apiCache, 120);
      return items;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await sleep(600 + attempt * 900);
        continue;
      }
    }
  }
  throw lastError || fail("24bit 搜索接口请求失败");
}

async function searchBoth(keyword, page) {
  const results = await Promise.allSettled([
    apiSearch("a", keyword, page),
    apiSearch("b", keyword, page),
  ]);
  const groups = [];
  const errors = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") groups.push({ tier: index === 0 ? "a" : "b", items: result.value });
    else errors.push(result.reason);
  });
  if (!groups.length) throw errors[0] || fail("24bit 搜索失败");
  return groups;
}

function albumOf(item, tier) {
  const meta = TIERS[tier] || TIERS[DEFAULT_TIER];
  return {
    id: "song:" + meta.path + ":" + item.id,
    name: item.name + " · " + meta.label,
    imageUrl: item.cover || "",
    artists: artistsOf(item.player),
    released: "",
  };
}

function trackOf(item, tier) {
  const meta = TIERS[tier] || TIERS[DEFAULT_TIER];
  const album = albumOf(item, tier);
  return {
    id: "track:" + meta.path + ":" + item.id,
    name: item.name,
    artists: album.artists,
    album: {
      id: album.id,
      name: item.album || item.name,
      imageUrl: album.imageUrl,
      artists: album.artists,
    },
    duration: 0,
    url: BASE + "/music/" + meta.path + "/" + item.id,
  };
}

function dedupeAlbums(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function chartLinks(musics) {
  return musics.map((item) => ({
    title: item.name,
    subtitle: item.count ? item.count + " 次播放" : "本周上榜",
    page: "chart:" + item.name,
  }));
}

function artistList(players) {
  return players.map((item) => ({
    id: "artist:" + item.name,
    name: item.name,
    imageUrl: "",
  }));
}

async function songPage(path, id, options) {
  const html = await fetchText("/music/" + path + "/" + id, options);
  const text = rscText(html);
  let item = objectAfter(text, "itemMusic");

  if (!item) {
    // 页面数据可能被拆成多段，退一步从原文里找转义后的 itemMusic。
    item = objectAfter(String(html).replace(/\\"/g, '"'), "itemMusic");
  }

  const ogTitle = stripTags(
    (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || [])[1] ||
      (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1],
  ).replace(/《.*?》.*$/, "");
  const ogImage = decodeEntities(
    (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i) || [])[1],
  );
  const fallbackAudio = decodeEntities(
    (html.match(/https:\/\/[^"'\\\s<>]+?\.(?:flac|mp3|m4a|aac|ogg)(?:\?[^"'\\\s<>]*)?/i) || [])[0],
  );

  if (!item && !fallbackAudio) throw fail("没有从单曲页解析到播放数据");
  item = item || {};

  const lyrics = item.lrc && String(item.lrc).includes("[00:") ? String(item.lrc) : lyricsOf(html);

  return {
    id: String(item.id || id),
    name: stripTags(item.name) || ogTitle || "未命名单曲",
    player: stripTags(item.player) || "",
    album: stripTags(item.album) || "",
    cover: decodeEntities(item.cover) || ogImage || "",
    format: String(item.format || extensionOf(fallbackAudio) || "flac").toLowerCase(),
    quality: stripTags(item.quality) || "",
    size: stripTags(item.size) || "",
    url: decodeEntities(item.url) || fallbackAudio || "",
    lyrics: lyrics || "",
    pageUrl: BASE + "/music/" + path + "/" + id,
  };
}

function lyricsOf(html) {
  let best = "";
  for (const text of rscStrings(html)) {
    if (!text.includes("[00:")) continue;
    const lines = text.split(/\r?\n/);
    const timed = lines.filter((line) => /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(line.trim())).length;
    if (timed >= 3 && text.length > best.length) best = text;
  }
  return best.trim();
}

function extensionOf(url) {
  const path = String(url || "").split("?")[0].toLowerCase();
  const match = path.match(/\.(flac|mp3|m4a|aac|ogg|wav)$/);
  return match ? match[1] : "";
}

function parseAlbumId(id) {
  const value = String(id || "").trim();
  let match = value.match(/^song:([abc]):([0-9a-f]{32})$/i);
  if (match) return { path: match[1].toLowerCase(), id: match[2] };
  match = value.match(/^song:([0-9a-f]{32})$/i);
  if (match) return { path: DEFAULT_TIER, id: match[1] };
  match = value.match(/^([0-9a-f]{32})$/i);
  if (match) return { path: DEFAULT_TIER, id: match[1] };
  throw fail("专辑编号不正确：" + value);
}

function parseTrackId(id) {
  const value = String(id || "").trim();
  if (value.startsWith("song:")) {
    const album = parseAlbumId(value);
    return album;
  }
  let match = value.match(/^track:([abc]):([0-9a-f]{32})$/i);
  if (match) return { path: match[1].toLowerCase(), id: match[2] };
  match = value.match(/^track:([0-9a-f]{32})$/i);
  if (match) return { path: DEFAULT_TIER, id: match[1] };
  match = value.match(/^([0-9a-f]{32})$/i);
  if (match) return { path: DEFAULT_TIER, id: match[1] };
  throw fail("歌曲编号不正确：" + value);
}

function decodePageName(value) {
  const text = String(value || "");
  try {
    return text.includes("%") ? decodeURIComponent(text) : text;
  } catch (_) {
    return text;
  }
}

function albumsFromItems(items, tier) {
  return dedupeAlbums(items.map((item) => albumOf(item, tier)));
}

function tracksFromItems(items, tier) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const track = trackOf(item, tier);
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

export async function home() {
  const data = await weekly();
  return {
    title: "24bit无损音乐",
    subtitle: "16bit 44.1kHz · 24bit 192kHz 母带直链",
    description: "24bit.net 单曲站。榜单里的歌名点进去会搜索同名单曲；搜索结果可切换 16bit 与 24bit 192kHz。",
    sections: [
      { title: "本周歌曲榜", links: chartLinks(data.musics), morePage: "charts", empty: "本周歌曲榜暂时为空" },
      { title: "本周歌手榜", artists: artistList(data.players), morePage: "artists", empty: "本周歌手榜暂时为空" },
      {
        title: "浏览",
        links: [
          { title: "全部榜单", subtitle: "本周歌曲与歌手", page: "charts" },
          { title: "全部歌手", subtitle: "按本周热度排序", page: "artists" },
          { title: "音质与说明", subtitle: "16bit / 24bit 直链", page: "about" },
        ],
      },
    ],
  };
}

export async function browse({ page } = {}) {
  const raw = String(page || "charts");

  if (raw === "home") return home();

  if (raw === "charts") {
    const data = await weekly();
    return {
      title: "本周榜单",
      subtitle: "24bit.net 首页实时榜单",
      sections: [
        { title: "本周歌曲榜", links: chartLinks(data.musics), empty: "本周歌曲榜暂时为空" },
        { title: "本周歌手榜", artists: artistList(data.players), empty: "本周歌手榜暂时为空" },
        { title: "返回", links: [{ title: "返回首页", page: "home" }] },
      ],
    };
  }

  if (raw === "artists") {
    const data = await weekly();
    return {
      title: "本周歌手榜",
      subtitle: data.players.length + " 位歌手",
      sections: [
        { title: "歌手", artists: artistList(data.players), empty: "本周歌手榜暂时为空" },
        { title: "返回", links: [{ title: "全部榜单", page: "charts" }] },
      ],
    };
  }

  if (raw === "about") {
    return {
      title: "24bit无损音乐",
      subtitle: "16bit 44.1kHz · 24bit 192kHz",
      description: [
        "24bit.net 是单曲站：一个搜索结果就是一首歌，没有真正的专辑目录。插件把每首单曲当作一张只有一首曲目的专辑。",
        "搜索结果同时列出 24bit 192kHz 与 16bit 44.1kHz；专辑名后的音质标记用于区分同名歌曲。",
        "播放地址来自单曲页内嵌的无损 FLAC 直链，带有时效票据；每次播放都会重新读取单曲页，不长期缓存旧地址。",
      ].join("\n"),
      sections: [
        {
          title: "入口",
          links: [
            { title: "本周榜单", page: "charts" },
            { title: "本周歌手", page: "artists" },
            { title: "返回首页", page: "home" },
          ],
        },
      ],
    };
  }

  if (raw.startsWith("chart:")) {
    const keyword = decodePageName(raw.slice(6)).trim();
    if (!keyword) throw fail("榜单歌曲名称为空");
    const groups = await searchBoth(keyword, 1);
    const all = groups.flatMap((group) => group.items.map((item) => ({ item, tier: group.tier })));
    const wanted = normalize(keyword);
    const exact = all.filter((entry) => normalize(entry.item.name) === wanted);
    // 首页歌曲榜来自 16bit 主链路，同名结果里先排 16bit，避免 24bit 翻唱
    // 或现场版排到榜首歌曲前面。
    const ranked = (exact.length ? exact : all).slice();
    ranked.sort((a, b) => {
      if (a.tier === b.tier) return 0;
      if (a.tier === "b") return -1;
      if (b.tier === "b") return 1;
      return 0;
    });
    const picks = ranked.slice(0, 24);
    const albums = [];
    const seen = new Set();
    for (const entry of picks) {
      const album = albumOf(entry.item, entry.tier);
      if (seen.has(album.id)) continue;
      seen.add(album.id);
      albums.push(album);
    }
    return {
      title: "本周歌曲 · " + keyword,
      subtitle: albums.length + " 个同名单曲",
      sections: [
        { title: "同名单曲", albums, empty: "没有找到同名单曲" },
        { title: "返回", links: [{ title: "返回榜单", page: "charts" }] },
      ],
    };
  }

  if (raw.startsWith("artist:")) {
    const name = decodePageName(raw.slice(7)).trim();
    if (!name) throw fail("歌手名称为空");
    const groups = await searchBoth(name, 1);
    const wanted = normalize(name);
    const filtered = groups.flatMap((group) => {
      const matched = group.items.filter(
        (item) => normalize(item.player).includes(wanted) || normalize(item.name).includes(wanted),
      );
      return (matched.length ? matched : group.items).map((item) => ({ item, tier: group.tier }));
    });
    const albums = [];
    const seen = new Set();
    for (const entry of filtered.slice(0, 40)) {
      const album = albumOf(entry.item, entry.tier);
      if (seen.has(album.id)) continue;
      seen.add(album.id);
      albums.push(album);
    }
    const bGroup = groups.find((group) => group.tier === "b");
    const tracks = bGroup
      ? tracksFromItems(
          bGroup.items.filter(
            (item) => normalize(item.player).includes(wanted) || normalize(item.name).includes(wanted),
          ),
          "b",
        ).slice(0, 10)
      : [];
    return {
      title: name,
      subtitle: albums.length + " 首单曲",
      imageUrl: albums[0] ? albums[0].imageUrl : "",
      description: "按歌手名站内搜索；同一首歌可能同时有 16bit 与 24bit 版本。",
      sections: [
        { title: "单曲", albums, empty: "没有找到这位歌手的单曲" },
        { title: "热门歌曲", tracks, empty: "没有可展示的歌曲" },
        { title: "返回", links: [{ title: "本周歌手榜", page: "artists" }] },
      ],
    };
  }

  throw fail("未知页面：" + raw);
}

export async function search({ query, kind, offset } = {}) {
  const term = String(query || "").trim();
  if (!term) throw fail("搜索关键词不能为空");
  const page = Math.max(1, Math.floor(Number(offset || 0) / PAGE_SIZE) + 1);
  const groups = await searchBoth(term, page);
  const entries = groups.flatMap((group) => group.items.map((item) => ({ item, tier: group.tier })));
  const more = groups.some((group) => group.items.length >= PAGE_SIZE);

  if (kind === "tracks") {
    const tracks = [];
    const seen = new Set();
    for (const entry of entries) {
      const track = trackOf(entry.item, entry.tier);
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      tracks.push(track);
    }
    return { tracks, more };
  }

  if (kind === "albums") {
    const albums = [];
    const seen = new Set();
    for (const entry of entries) {
      const album = albumOf(entry.item, entry.tier);
      if (seen.has(album.id)) continue;
      seen.add(album.id);
      albums.push(album);
    }
    return { albums, more };
  }

  if (kind === "artists") {
    const names = [];
    const seen = new Set();
    for (const entry of entries) {
      for (const artist of artistsOf(entry.item.player)) {
        if (seen.has(artist.id)) continue;
        seen.add(artist.id);
        names.push(artist);
      }
    }
    return { artists: names.slice(0, 30), more };
  }

  return { [kind || "albums"]: [], more: false };
}

export async function suggest({ query } = {}) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const groups = await searchBoth(term, 1);
    const names = [];
    const seen = new Set();
    for (const group of groups) {
      for (const item of group.items) {
        if (seen.has(item.name)) continue;
        seen.add(item.name);
        names.push(item.name);
      }
    }
    return names.slice(0, 10);
  } catch (_) {
    return [];
  }
}

export async function album({ id } = {}) {
  const album = parseAlbumId(id);
  const item = await songPage(album.path, album.id);
  const meta = TIERS[album.path] || TIERS[DEFAULT_TIER];
  const artists = artistsOf(item.player);
  const albumId = "song:" + album.path + ":" + (item.id || album.id);
  const albumMeta = {
    id: albumId,
    name: item.name + " · " + meta.label,
    imageUrl: item.cover || "",
    artists,
    released: "",
  };
  const trackAlbum = {
    id: albumId,
    name: item.album || item.name,
    imageUrl: item.cover || "",
    artists,
  };
  return {
    album: albumMeta,
    tracks: [
      {
        id: "track:" + album.path + ":" + (item.id || album.id),
        name: item.name,
        artists,
        album: trackAlbum,
        duration: 0,
        url: item.pageUrl,
      },
    ],
  };
}

export async function artist({ id } = {}) {
  const raw = String(id || "");
  if (!raw.startsWith("artist:")) throw fail("歌手编号不正确：" + raw);
  const name = decodePageName(raw.slice(7)).trim();
  if (!name) throw fail("歌手名称为空");
  return browse({ page: "artist:" + name });
}

export async function lyrics({ id } = {}) {
  const track = parseTrackId(id);
  const item = await songPage(track.path, track.id);
  if (!item.lyrics) throw fail("这首歌暂时没有歌词", "unsupported");
  return { lrc: item.lyrics };
}

export async function stream({ id } = {}) {
  const track = parseTrackId(id);
  // 专辑页刚取到的直链可以直接用；超过一分钟再重新请求单曲页，避免票据过期。
  const item = await songPage(track.path, track.id, { maxAge: 60 * 1000 });
  if (!item.url) throw fail("这首歌没有可用的播放地址");
  let url = item.url;
  if (url.startsWith("//")) url = "https:" + url;
  if (!/^https?:\/\//i.test(url)) throw fail("播放地址格式不正确");
  let type = item.format;
  if (!["mp3", "flac", "ogg", "wav", "m4a", "aac"].includes(type)) {
    type = extensionOf(url) || "flac";
  }
  return {
    url,
    type,
    headers: {
      referer: item.pageUrl,
      "user-agent": UA,
    },
  };
}
