// 显示名：大米饭（damifan-music）
// MyGo Music plugin — 大米饭 (https://api.damifan.top)
//
// 大米饭是个 Flutter 应用（lib/arm64-v8a/libapp.so 里的字符串能还原全部接口），
// 解析出的路径分两处：
//
//   api.damifan.top    只承接统计类：
//     /ibaba.php?web=app&title=…   播放上报
//     /userlog.php                 设备日志
//   api.buguyy.cc/newapi/…         真正的曲库（damifan.top 上这些路径全 404）
//
// 用到的曲库接口（都是 GET，参数可拼在 query 上）：
//   getrand.php                    随机一批
//   apppush.php?tags=流行:0.52,…   个性化推荐，一次 20 首
//   appmlist.php?tag=&page=&limit= 按标签，主流标签各有上万首
//   getgedan.php?page=&size=       歌单列表，total 9000+
//   gedandetail.php?id=            歌单详情，带 songs
//   search2.php?keyword=&page=     搜索，单页 10 条
//   getdetail.php?id=              单曲详情（playurl 恒空，kuakedownurl 是夸克网盘）
//   geturl4.php?rid=&type=json&level=exhigh&lrc=true   设计上取流，实测恒 200 + 0 字节
//
// 播放：geturl4 这条现在是空的，getdetail 的 playurl 也是空的（曲库只挂了夸克网盘分享），
// 所以 stream() 先按原路径试 geturl4，不成就拿曲名去同一家的 www.buguyy.top/api/search
// 匹配（它的 geturl 直接吐酷我 car-*.kuwo.cn 直链），实测命中率很高。
//
// 封面是酷我 imgN.kuwo.cn/star/albumcover/500/…，把 500 换成 {size} 交给 App。

const DATA = "https://api.buguyy.cc/newapi";
const SITE = "https://www.buguyy.top/api";
const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "application/json, text/plain, */*",
};

const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function deadline(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail("timeout", "timed out " + (label || ms + "ms"))), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function once(url, ms) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const init = { headers: HEAD };
  if (controller) init.signal = controller.signal;
  const request = fetch(url, init);
  try {
    return await deadline(request, ms, url);
  } catch (error) {
    if (controller) controller.abort();
    throw error;
  }
}

async function request(url, ms) {
  let last = null;
  for (let i = 0; i < 2; i++) {
    try {
      const response = await once(url, ms || 8000);
      if (!response.ok) throw fail("http", "HTTP " + response.status);
      const text = await response.text();
      if (!text) throw fail("empty", "空响应");
      return JSON.parse(text);
    } catch (error) {
      last = error;
    }
  }
  throw last || fail("unavailable", t("大米饭的接口暂时连不上"));
}

function qs(params) {
  const parts = [];
  for (const key of Object.keys(params || {})) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
  }
  return parts.length ? "?" + parts.join("&") : "";
}

async function api(path, params) {
  const body = await request(DATA + "/" + path + qs(params), 9000);
  // 曲库接口用 200，getdetail 用的是 0
  if (!body || !(body.code === 200 || body.code === 0)) {
    throw fail("unavailable", (body && body.msg) || t("大米饭的接口暂时连不上"));
  }
  return body;
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                       */
/* ------------------------------------------------------------------ */

function decode(text) {
  if (!text) return "";
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    const name = entity.toLowerCase();
    if (name === "amp") return "&";
    if (name === "lt") return "<";
    if (name === "gt") return ">";
    if (name === "quot") return '"';
    if (name === "apos") return "'";
    if (name === "nbsp") return " ";
    if (name.charAt(0) === "#") {
      const code = name.charAt(1) === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code === code ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function clean(text) {
  return decode(String(text || "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function sized(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const https = raw.replace(/^\/\//, "https://").replace(/^http:\/\//i, "https://");
  return https.replace(/(\/(?:albumcover|userpl2015)\/)\d{2,4}(\/)/, "$1{size}$2");
}

function toTrack(item) {
  if (!item || !item.id) return null;
  const title = clean(item.title || item.name || "");
  if (!title) return null;
  const track = {
    id: String(item.id),
    name: title,
    album: { name: "", imageUrl: sized(item.picurl || item.pic || item.img) },
  };
  const singer = clean(item.singer || item.artist || "");
  if (singer) track.artists = [{ name: singer }];
  return track;
}

function toTracks(items, lyricsFrom) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const track = toTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
    const lrc = cleanLrc(item && (item.about || item.lrc));
    if (lrc) lyricsById.set(track.id, lrc);
    if (lyricsFrom) lyricsFrom.set(track.id, item);
  }
  remember(out);
  return out;
}

function cleanLrc(about) {
  const raw = String(about || "");
  if (!raw || /歌词获取失败/.test(raw)) return "";
  const text = decode(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
  return /\[[\d]{1,2}:[\d]{1,2}/.test(text) ? text : "";
}

/* Track index, so likes and history can be rebuilt from ids alone. */
const index = host.storage.get("trackIndex") || {};
const lyricsById = new Map();
const metaById = new Map();

function remember(tracks) {
  let added = false;
  for (const track of tracks) {
    if (track && track.id && !index[track.id]) {
      index[track.id] = track;
      added = true;
    }
  }
  if (!added) return;
  const keys = Object.keys(index);
  if (keys.length > 3000) {
    for (const key of keys.slice(0, keys.length - 3000)) delete index[key];
  }
  host.storage.set("trackIndex", index);
}

function load(key, fallback) {
  const value = host.storage.get(key);
  return value === null || value === undefined ? fallback : value;
}

function save(key, value) {
  host.storage.set(key, value);
}

function trackById(id) {
  if (index[id]) return index[id];
  const saved = load("likedTracks", {});
  return saved[id] || { id: String(id), name: String(id), album: { name: "" } };
}

/* ------------------------------------------------------------------ */
/* Lists                                                              */
/* ------------------------------------------------------------------ */

const TAGS = [
  "流行",
  "抒情",
  "伤感",
  "治愈",
  "民谣",
  "摇滚",
  "古风",
  "电子",
  "怀旧",
  "轻音乐",
  "纯音乐",
  "说唱",
  "爵士",
  "影视",
  "儿歌",
];

const TAGS_WEIGHT = "流行:0.52,伤感:0.31,治愈:0.17";
const PAGE_SIZE = 20;

async function randTracks() {
  const body = await api("getrand.php");
  const data = body.data || {};
  const items = Array.isArray(data) ? data : data.list || [];
  return toTracks(items);
}

async function pushTracks() {
  const body = await api("apppush.php", { tags: TAGS_WEIGHT });
  const data = body.data || {};
  return toTracks(data.list || []);
}

async function tagTracks(tag, page) {
  const body = await api("appmlist.php", { tag: tag, page: page || 1, limit: PAGE_SIZE });
  const data = body.data || {};
  return {
    tracks: toTracks(data.list || []),
    total: Number(data.total || 0),
    totalPage: Number(data.totalPage || 0),
    page: Number(data.page || page || 1),
  };
}

async function gedanList(page, size) {
  const body = await api("getgedan.php", { page: page || 1, size: size || 12 });
  const data = body.data || {};
  return {
    list: data.list || [],
    page: Number(data.page || 1),
    total: Number(data.total || 0),
    totalPage: Number(data.totalPage || 0),
  };
}

async function gedanDetail(id) {
  const body = await api("gedandetail.php", { id: id });
  const data = body.data || {};
  return data;
}

function gedanLinks(list) {
  const out = [];
  for (const item of list || []) {
    if (!item || !item.id) continue;
    const count = Number(item.total || 0);
    const favor = Number(item.favorcnt || 0);
    const bits = [];
    if (count) bits.push(count + " 首");
    if (favor) bits.push("收藏 " + favor);
    out.push({
      title: clean(item.title) || "歌单 " + item.id,
      subtitle: bits.join(" · "),
      page: "gd:" + item.id,
      imageUrl: sized(item.img),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Home and pages                                                      */
/* ------------------------------------------------------------------ */

export async function home() {
  const results = await Promise.all([
    pushTracks().catch((error) => {
      console.log("[damifan] apppush failed:", error && error.message);
      return null;
    }),
    randTracks().catch((error) => {
      console.log("[damifan] getrand failed:", error && error.message);
      return null;
    }),
    gedanList(1, 6).catch((error) => {
      console.log("[damifan] getgedan failed:", error && error.message);
      return null;
    }),
  ]);
  const push = results[0] || [];
  const rand = results[1] || [];
  const gedan = results[2];

  const sections = [];
  if (push.length) sections.push({ title: t("猜你喜欢"), tracks: push, morePage: "push" });
  if (rand.length) sections.push({ title: t("随机精选"), tracks: rand, morePage: "rand" });

  const links = [
    { title: t("标签"), subtitle: t("按风格挑歌"), page: "tags" },
    { title: t("歌单广场"), subtitle: gedan ? gedan.total + " 个歌单" : t("网友整理的主题歌单"), page: "gedan:1" },
  ];
  sections.push({ title: t("分类"), links: links });

  if (gedan && gedan.list.length) {
    sections.push({ title: t("热门歌单"), links: gedanLinks(gedan.list.slice(0, 6)) });
  }

  if (!push.length && !rand.length) {
    return {
      title: t("大米饭"),
      subtitle: t("接口暂时连不上，稍后刷新"),
      sections: [{ title: t("分类"), links: links }],
    };
  }

  return {
    title: t("大米饭"),
    subtitle: t("推荐、随机、标签与歌单"),
    sections: sections,
  };
}

export async function browse({ page }) {
  const key = String(page || "");

  if (key === "push") {
    const tracks = await pushTracks();
    return { title: t("猜你喜欢"), subtitle: t("按口味推的一批"), sections: [{ title: t("猜你喜欢"), tracks: tracks }] };
  }

  if (key === "rand") {
    const tracks = await randTracks();
    return { title: t("随机精选"), subtitle: t("每次刷新都不一样"), sections: [{ title: t("随机精选"), tracks: tracks }] };
  }

  if (key === "tags" || key === "") {
    return {
      title: t("标签"),
      subtitle: t("按风格挑歌"),
      sections: [
        {
          title: t("全部标签"),
          links: TAGS.map((tag) => ({ title: tag, page: "tag:" + tag + ":1" })),
        },
      ],
    };
  }

  if (key.indexOf("tag:") === 0) {
    const parts = key.split(":");
    const tag = parts[1] || "";
    const pageNo = Math.max(1, parseInt(parts[2] || "1", 10) || 1);
    const result = await tagTracks(tag, pageNo);
    const sections = [];
    if (result.tracks.length) sections.push({ title: tag, tracks: result.tracks });
    if (result.totalPage > pageNo) {
      sections.push({
        title: t("更多"),
        links: [
          {
            title: t("下一页"),
            subtitle: pageNo + " / " + result.totalPage + " 页，共 " + result.total + " 首",
            page: "tag:" + tag + ":" + (pageNo + 1),
          },
        ],
      });
    }
    return {
      title: tag,
      subtitle: result.total ? result.total + " 首" : t("接口暂时连不上，稍后刷新"),
      sections: sections,
    };
  }

  if (key.indexOf("gedan:") === 0) {
    const pageNo = Math.max(1, parseInt(key.slice(6) || "1", 10) || 1);
    const result = await gedanList(pageNo, 12);
    const sections = [{ title: t("歌单广场"), links: gedanLinks(result.list) }];
    if (result.totalPage > pageNo) {
      sections.push({
        title: t("更多"),
        links: [
          {
            title: t("下一页"),
            subtitle: pageNo + " / " + result.totalPage + " 页，共 " + result.total + " 个",
            page: "gedan:" + (pageNo + 1),
          },
        ],
      });
    }
    return {
      title: t("歌单广场"),
      subtitle: result.total ? result.total + " 个歌单" : t("接口暂时连不上，稍后刷新"),
      sections: sections,
    };
  }

  if (key.indexOf("gd:") === 0) {
    const id = key.slice(3);
    const data = await gedanDetail(id);
    const tracks = toTracks(data.songs || []);
    const sections = [];
    if (tracks.length) sections.push({ title: t("歌曲"), tracks: tracks });
    const bits = [];
    if (data.total) bits.push(data.total + " 首");
    if (data.favorcnt) bits.push("收藏 " + data.favorcnt);
    return {
      title: clean(data.title) || t("歌单"),
      subtitle: bits.join(" · "),
      sections: sections,
    };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

async function searchTracks(text, page) {
  const body = await api("search2.php", { keyword: text, page: page || 1 });
  const data = body.data || {};
  return {
    tracks: toTracks(data.list || []),
    total: Number(data.total || 0),
    totalPage: Number(data.total_pages || 0),
    page: Number(data.current_page || 1),
  };
}

export async function search({ query, kind, offset }) {
  const text = String(query || "").trim();
  const key = kind || "tracks";
  if (!text) {
    if (key === "albums") return { albums: [], more: false };
    if (key === "artists") return { artists: [], more: false };
    return { tracks: [], more: false };
  }
  if (key === "albums") return { albums: [], more: false };
  if (key === "artists") {
    const result = await searchTracks(text, 1);
    const names = [];
    const seen = new Set();
    for (const track of result.tracks) {
      for (const artist of track.artists || []) {
        if (!artist.name || seen.has(artist.name)) continue;
        seen.add(artist.name);
        names.push({ id: "n:" + artist.name, name: artist.name, imageUrl: track.album.imageUrl });
      }
    }
    return { artists: names.slice(0, 20), more: false };
  }
  if (key !== "tracks") return { tracks: [], more: false };

  const limit = 10;
  const page = Math.floor(Number(offset || 0) / limit) + 1;
  const result = await searchTracks(text, page);
  return { tracks: result.tracks, more: result.page < result.totalPage };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const result = await searchTracks(text, 1);
    return result.tracks
      .slice(0, 10)
      .map((track) => {
        const singer = track.artists && track.artists.length ? track.artists[0].name : "";
        return singer ? singer + " - " + track.name : track.name;
      });
  } catch (error) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Song detail                                                        */
/* ------------------------------------------------------------------ */

const detailCache = new Map();

async function detail(id) {
  const key = String(id);
  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value;

  let value = null;
  try {
    const body = await api("getdetail.php", { id: key });
    const data = body.data || {};
    value = {
      id: key,
      title: clean(data.title),
      singer: clean(data.singer),
      picurl: sized(data.picurl),
      about: cleanLrc(data.about),
      playurl: String(data.playurl || ""),
      downurl: String(data.kuakedownurl || data.downurl || ""),
    };
  } catch (error) {
    console.log("[damifan] getdetail failed:", error && error.message);
  }
  if (!value) value = { id: key, title: "", singer: "", picurl: "", about: "", playurl: "", downurl: "" };

  detailCache.set(key, { at: Date.now(), value: value });
  return value;
}

/* ------------------------------------------------------------------ */
/* Audio                                                              */
/* ------------------------------------------------------------------ */

function audioType(url) {
  const path = String(url).split("?")[0].toLowerCase();
  if (path.endsWith(".flac")) return "flac";
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "m4a";
  if (path.endsWith(".ogg") || path.endsWith(".opus")) return "ogg";
  if (path.endsWith(".wav")) return "wav";
  return "mp3";
}

// 原路径：geturl4.php 设计上就是吐流地址，现在恒回 0 字节，留着当第一优先
async function fromSite(rid) {
  try {
    const body = await request(DATA + "/geturl4.php" + qs({ rid: rid, type: "json", level: "exhigh", lrc: "true" }), 9000);
    const url = body && (body.url || (body.data && body.data.url));
    if (url && /^https:\/\//i.test(url)) return String(url);
  } catch (error) {
    // 空响应会走到这里，正常
  }
  return "";
}

// 兜底：同一家的曲库（布谷音乐）按曲名匹配，直接吐酷我直链
async function fromSibling(title, singer) {
  const name = String(title || "").trim();
  if (!name) return "";
  let body = null;
  try {
    body = await request(SITE + "/search" + qs({ keyword: name }), 9000);
  } catch (error) {
    console.log("[damifan] sibling search failed:", error && error.message);
    return "";
  }
  const list = (body && (body.data || body.list)) || [];
  if (!Array.isArray(list) || !list.length) return "";

  let best = null;
  let bestScore = -1;
  for (const item of list) {
    if (!item || !item.id) continue;
    const itemTitle = clean(item.title || item.name);
    let score = 0;
    if (itemTitle === name) score = 60;
    else if (itemTitle.indexOf(name) === 0 || name.indexOf(itemTitle) === 0) score = 40;
    else if (itemTitle.indexOf(name) >= 0 || name.indexOf(itemTitle) >= 0) score = 25;
    else continue;
    const itemSinger = clean(item.singer || item.artist);
    if (singer && itemSinger) {
      const a = singer.split(/[&、,，/]/).map((part) => part.trim()).filter(Boolean);
      for (const part of a) {
        if (part && itemSinger.indexOf(part) >= 0) score += 8;
      }
    }
    if (/^(伴奏|纯享|片段|live)/i.test(itemTitle) && !/^(伴奏|纯享|片段|live)/i.test(name)) score -= 10;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  if (!best) return "";

  try {
    const got = await request(SITE + "/geturl" + qs({ id: best.id }), 9000);
    if (got && got.success && got.url && /^https:\/\//i.test(got.url)) return String(got.url);
  } catch (error) {
    console.log("[damifan] sibling geturl failed:", error && error.message);
  }
  return "";
}

const urlCache = new Map();

async function resolveUrl(id) {
  const key = String(id);
  const cached = urlCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached;

  const meta = metaById.get(key) || (await detail(key));

  let url = await fromSite(key);
  if (!url && meta) url = await fromSibling(meta.title, meta.singer);
  if (!url) throw fail("unavailable", t("这首歌暂时取不到播放地址"));

  const value = { url: url, at: Date.now() };
  urlCache.set(key, value);
  if (urlCache.size > 200) urlCache.delete(urlCache.keys().next().value);
  return value;
}

/* 播放器要靠音频总大小算时长，否则进度条永远是 0:00 / 0:00。
   拿一个 2 字节的 Range 请求，总长度在 content-range 里。 */
const sizeCache = new Map();

async function audioSize(url) {
  const cached = sizeCache.get(url);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.size;

  let size = 0;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  try {
    const headers = Object.assign({}, HEAD, { range: "bytes=0-1" });
    const init = { headers: headers };
    if (controller) init.signal = controller.signal;
    const res = await deadline(fetch(url, init), 6000, url);
    const range = res.headers.get("content-range") || "";
    const total = Number((range.match(/\/\s*(\d+)/) || [])[1]);
    const length = Number(res.headers.get("content-length")) || 0;
    // Range 命中时 content-length 只有 2 字节，总大小看 content-range
    size = total > 0 ? total : res.status === 200 ? length : 0;
    if (res.body && typeof res.body.cancel === "function") {
      try {
        res.body.cancel();
      } catch (error) {
        // 忽略
      }
    }
  } catch (error) {
    if (controller) controller.abort();
    size = 0;
  }

  sizeCache.set(url, { at: Date.now(), size: size });
  if (sizeCache.size > 200) sizeCache.delete(sizeCache.keys().next().value);
  return size;
}

export async function stream({ id }) {
  const info = await resolveUrl(String(id));
  const size = await audioSize(info.url);
  return { url: info.url, type: audioType(info.url), size: size > 0 ? size : undefined };
}

export async function lyrics({ id }) {
  const key = String(id);
  const fromList = lyricsById.get(key) || "";
  if (fromList) return { lrc: fromList };
  try {
    const meta = await detail(key);
    if (meta.about) return { lrc: meta.about };
  } catch (error) {
    console.log("[damifan] lyrics failed:", error && error.message);
  }
  return { lrc: "" };
}

/* ------------------------------------------------------------------ */
/* Library kept on this device                                         */
/* ------------------------------------------------------------------ */

export function recent() {
  return load("recent", [])
    .map(trackById)
    .filter(Boolean)
    .slice(0, 10);
}

export function played({ id }) {
  if (!id) return;
  const ids = load("recent", []).filter((item) => item !== id);
  ids.unshift(String(id));
  save("recent", ids.slice(0, 20));
}

export function liked() {
  const ids = load("liked", []);
  const tracks = ids.map(trackById).filter(Boolean);
  remember(tracks);
  return { tracks: tracks, more: false };
}

export function isLiked({ ids }) {
  const set = new Set(load("liked", []));
  const out = {};
  for (const id of ids || []) out[id] = set.has(String(id));
  return out;
}

export function like({ id, on }) {
  const set = new Set(load("liked", []));
  if (on) {
    set.add(String(id));
    if (index[id]) {
      const saved = load("likedTracks", {});
      saved[id] = index[id];
      save("likedTracks", saved);
    }
  } else {
    set.delete(String(id));
  }
  save("liked", [...set]);
}
