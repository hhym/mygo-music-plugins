// MyGo Music plugin — 猫耳FM (www.missevan.com)
//
// A Chinese audio site (radio plays, drama episodes, music sheets) whose API is
// plain JSON and needs no account:
//   search sounds   GET /sound/getsearch?s=<kw>&p=<n>&type=3&page_size=30
//   sound sheets    GET /explore/tagalbum?order=0&tid=<tag>&p=<n>
//   sheet contents  GET /sound/soundalllist?albumid=<id>   sounds carry a CDN m4a
//   tags            GET /malbum/recommand                  groups of [id, name]
//   one sound       GET /sound/getsound?soundid=<id>       HLS only, see below
//
// The catch: newer sounds only come back from getsound as an HLS playlist
// encrypted with SAMPLE-AES and a Widevine key, which no third-party player can
// decode, so the plugin never hands one over. Sounds listed inside a sheet still
// carry their old plain .m4a on maoercdn, and those do play — the sheet is where
// the plugin listens from.

const BASE = "https://www.missevan.com";
const PAGE_SIZE = 30;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "application/json",
  referer: BASE + "/sound/search",
};

const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function request(url, options = {}) {
  const init = {
    method: "GET",
    headers: Object.assign({}, HEAD, options.headers || {}),
  };
  const ms = options.timeout || 15000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    const res = await fetch(url, init);
    if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function get(path, params) {
  const query = Object.keys(params || {})
    .filter((key) => params[key] != null && params[key] !== "")
    .map((key) => key + "=" + encodeURIComponent(params[key]))
    .join("&");
  return request(BASE + path + (query ? "?" + query : ""));
}

/* ------------------------------------------------------------------ mapping */

function seconds(ms) {
  const value = Number(ms);
  return value > 0 ? Math.round(value / 1000) : undefined;
}

function trackOf(sound) {
  if (!sound || !sound.id) return null;
  const track = {
    id: "s" + sound.id,
    name: sound.soundstr || sound.name || "",
  };
  if (sound.username) track.artists = [{ name: sound.username }];
  if (sound.front_cover) track.imageUrl = sound.front_cover;
  const length = seconds(sound.duration);
  if (length) track.duration = length;
  return track.name ? track : null;
}

function albumOf(sheet) {
  const album = { id: "m" + sheet.id, name: sheet.title || "" };
  if (sheet.front_cover) album.imageUrl = sheet.front_cover;
  if (sheet.username) album.artists = [{ name: sheet.username }];
  return album;
}

/* ------------------------------------------------------------------ search */

const searchCache = new Map();

async function searchSounds(keyword, pageNo) {
  const key = keyword + "#" + pageNo;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;

  const body = await get("/sound/getsearch", {
    s: keyword,
    p: pageNo,
    type: 3,
    page_size: PAGE_SIZE,
  });
  const info = body && body.info;
  const list = (info && info.Datas) || [];
  const pager = (info && info.pagination) || {};
  const data = {
    tracks: list
      .filter((sound) => sound && (sound.pay_type == null || String(sound.pay_type) === "0"))
      .map(trackOf)
      .filter(Boolean),
    total: Number(pager.maxpage) || 0,
  };
  searchCache.set(key, { at: Date.now(), data: data });
  return data;
}

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "tracks") {
    /* Drama search is closed to guests and sheets cannot be searched by word. */
    return { albums: [], more: false };
  }

  const start = Math.max(0, Number(offset) || 0);
  const pageNo = Math.floor(start / PAGE_SIZE) + 1;
  const data = await searchSounds(keyword, pageNo);
  const tracks = data.tracks.slice(start % PAGE_SIZE);
  remember(tracks);
  return { tracks: tracks, more: pageNo < data.total };
}

const COMMON_TAGS = [
  "广播剧",
  "古风",
  "翻唱",
  "电音",
  "治愈",
  "热血",
  "二次元",
  "同人音乐",
  "游戏原声",
  "作业向",
  "OP",
  "ED",
];

let warming = false;

export function suggest({ query }) {
  const words = String(query || "").trim().toLowerCase();
  let names = COMMON_TAGS;

  if (tagCache) {
    const all = [];
    for (const key of Object.keys(tagCache.groups)) {
      for (const tag of tagCache.groups[key]) {
        if (all.indexOf(tag.name) < 0) all.push(tag.name);
      }
    }
    if (all.length) names = all;
  } else if (!warming) {
    /* Fill the cache in the background; the list below answers this call. */
    warming = true;
    tagGroups()
      .catch(() => {})
      .then(() => {
        warming = false;
      });
  }

  return words ? names.filter((name) => name.toLowerCase().indexOf(words) >= 0).slice(0, 10) : names.slice(0, 10);
}

/* ------------------------------------------------------------------ sheets */

const sheetCache = new Map();

async function sheets(pageNo, tagId) {
  const key = (tagId || "0") + "#" + pageNo;
  const cached = sheetCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;

  const body = await get("/explore/tagalbum", { order: 0, tid: tagId || 0, p: pageNo });
  const list = (body && body.albums) || [];
  const pager = (body && body.pagination) || {};
  const data = {
    albums: list.filter((sheet) => sheet && sheet.id && sheet.title).map(albumOf),
    total: Number(pager.maxpage) || 0,
  };
  sheetCache.set(key, { at: Date.now(), data: data });
  return data;
}

async function sheet(id) {
  const cached = sheetDetail.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;

  const body = await get("/sound/soundalllist", { albumid: id });
  const info = body && body.info;
  if (!info || !info.album) throw fail("unavailable", t("没有这个音单"));

  const sounds = (info.sounds || []).filter((sound) => sound && sound.id);
  const tracks = [];
  for (const sound of sounds) {
    const track = trackOf(sound);
    if (!track) continue;
    track.album = { id: "m" + id, name: info.album.title || "" };
    if (sound.soundurl) saveMedia(sound.id, sound.soundurl);
    tracks.push(track);
  }

  const data = {
    album: {
      id: "m" + id,
      name: info.album.title || "",
      imageUrl: info.album.front_cover || undefined,
      artists: info.album.username ? [{ name: info.album.username }] : undefined,
      description: [stripTags(info.album.intro || ""), t("共 %d 首").replace("%d", tracks.length)]
        .filter(Boolean)
        .join("\n"),
    },
    tracks: tracks,
  };
  sheetDetail.set(id, { at: Date.now(), data: data });
  remember(tracks);
  return data;
}

const sheetDetail = new Map();

/* ------------------------------------------------------------------ tags */

let tagCache = null;

async function tagGroups() {
  if (tagCache && Date.now() - tagCache.at < 30 * 60 * 1000) return tagCache.groups;
  const body = await get("/malbum/recommand", {});
  const info = (body && body.info) || {};
  const groups = {};
  for (const key of Object.keys(info)) {
    const list = info[key];
    if (!Array.isArray(list)) continue;
    groups[key] = list
      .filter((item) => Array.isArray(item) && item.length >= 2)
      .map((item) => ({ id: String(item[0]), name: String(item[1]) }));
  }
  tagCache = { at: Date.now(), groups: groups };
  return groups;
}

async function tagNames() {
  try {
    const groups = await tagGroups();
    const names = [];
    for (const key of Object.keys(groups)) {
      for (const tag of groups[key]) {
        if (names.indexOf(tag.name) < 0) names.push(tag.name);
      }
    }
    return names;
  } catch (error) {
    return [];
  }
}

async function tagName(id) {
  try {
    const groups = await tagGroups();
    for (const key of Object.keys(groups)) {
      const found = groups[key].find((tag) => tag.id === String(id));
      if (found) return found.name;
    }
  } catch (error) {
    /* a tag page still works without its name */
  }
  return "";
}

/* ------------------------------------------------------------------ pages */

export async function home() {
  const [recommended, tagPage] = await Promise.all([
    sheets(1, 0).catch(() => ({ albums: [], total: 0 })),
    sheets(1, 5).catch(() => ({ albums: [], total: 0 })),
  ]);

  const sections = [];
  if (recommended.albums.length) {
    sections.push({
      title: t("推荐音单"),
      albums: recommended.albums.slice(0, 18),
      morePage: recommended.total > 1 ? "sheets/2" : undefined,
    });
  }
  if (tagPage.albums.length) {
    sections.push({
      title: t("古风音单"),
      albums: tagPage.albums.slice(0, 12),
      morePage: "tag/5/2",
    });
  }
  if (!sections.length) throw fail("unavailable", t("站点没有返回内容"));
  return { title: t("猫耳FM"), sections: sections };
}

function splitPage(value) {
  const clean = String(value || "").replace(/^\/+|\/+$/g, "");
  const numbered = /^(.*?)\/(\d+)$/.exec(clean);
  if (numbered) {
    if (numbered[1] === "sheets") return { base: "sheets", page: parseInt(numbered[2], 10) || 1 };
    if (/^tag\/\d+$/.test(numbered[1])) return { base: numbered[1], page: parseInt(numbered[2], 10) || 1 };
  }
  return { base: clean, page: 1 };
}

export async function browse({ page }) {
  const split = splitPage(page);
  const pageNo = split.page || 1;

  if (split.base === "sheets") {
    const data = await sheets(pageNo, 0);
    return {
      title: t("推荐音单"),
      sections: [
        {
          title: t("推荐音单"),
          albums: data.albums,
          morePage: pageNo < data.total ? "sheets/" + (pageNo + 1) : undefined,
        },
      ],
    };
  }

  const tag = /^tag\/(\d+)$/.exec(split.base);
  if (tag) {
    const data = await sheets(pageNo, tag[1]);
    const name = (await tagName(tag[1])) || t("标签");
    return {
      title: name,
      sections: [
        {
          title: name,
          albums: data.albums,
          morePage: pageNo < data.total ? "tag/" + tag[1] + "/" + (pageNo + 1) : undefined,
        },
      ],
    };
  }

  const sheetPath = /^sheet\/(\d+)$/.exec(split.base);
  if (sheetPath) {
    const detail = await sheet(sheetPath[1]);
    return {
      title: detail.album.name,
      description: detail.album.description,
      sections: [{ title: t("音单曲目"), tracks: detail.tracks }],
    };
  }

  const soundPath = /^sound\/(\d+)$/.exec(split.base);
  if (soundPath) {
    const sound = await soundInfo(soundPath[1]);
    const track = trackOf(sound);
    if (!track) throw fail("unavailable", t("没有这个声音"));
    remember([track]);
    return {
      title: track.name,
      sections: [{ title: t("声音"), tracks: [track] }],
    };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* ---------------------------------------------------------------- album */

export async function album({ id }) {
  const key = String(id || "");
  const sheetMatch = /^m(\d+)$/.exec(key);
  if (sheetMatch) {
    const detail = await sheet(sheetMatch[1]);
    return { album: detail.album, tracks: detail.tracks };
  }

  const soundMatch = /^s(\d+)$/.exec(key);
  if (soundMatch) {
    const sound = await soundInfo(soundMatch[1]);
    const track = trackOf(sound);
    if (!track) throw fail("unavailable", t("没有这个声音"));
    remember([track]);
    return {
      album: {
        id: key,
        name: track.name,
        imageUrl: track.imageUrl,
        artists: track.artists,
        description: stripTags(sound.intro || ""),
      },
      tracks: [track],
    };
  }

  throw fail("unavailable", t("没有这个条目"));
}

export async function artist({ id }) {
  const raw = String(id || "");
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch (error) {
    /* keep the raw name */
  }
  const data = await searchSounds(name, 1);
  const keeps = data.tracks.filter((track) => {
    const author = (track.artists && track.artists[0] && track.artists[0].name) || "";
    return author === name || author.indexOf(name) >= 0;
  });
  const tracks = keeps.length ? keeps : data.tracks.slice(0, 10);
  remember(tracks);
  return {
    artist: {
      id: raw,
      name: name,
      imageUrl: tracks.length ? tracks[0].imageUrl : undefined,
    },
    tracks: tracks.slice(0, 30),
    albums: [],
  };
}

/* ------------------------------------------------------------------ sound */

const soundCache = new Map();

async function soundInfo(id) {
  const cached = soundCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const body = await get("/sound/getsound", { soundid: id });
  const sound = body && body.info && body.info.sound;
  if (!sound) throw fail("unavailable", t("没有这个声音"));
  soundCache.set(id, { at: Date.now(), data: sound });
  return sound;
}

/* The sheet pages hand out plain .m4a links; they are kept so that a played
   track can be resolved again later without asking the API. */
const media = host.storage.get("mediaIndex") || {};

function saveMedia(id, url) {
  if (!id || !url) return;
  if (!/^https?:\/\//.test(url)) return;
  if (!/\.(m4a|mp3|aac)(\?|$)/i.test(url)) return;
  if (media[id] === url) return;
  media[id] = url;
  host.storage.set("mediaIndex", media);
}

function directLink(url) {
  const clean = String(url || "");
  if (!/^https?:\/\//.test(clean)) return "";
  if (!/\.(m4a|mp3|aac)(\?|$)/i.test(clean)) return "";
  return clean;
}

const TYPE_OF = { m4a: "m4a", mp3: "mp3", aac: "aac" };

async function probe(url) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller && controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, range: "bytes=0-1023", accept: "*/*" },
      signal: controller ? controller.signal : undefined,
    });
    return { status: res.status, type: res.headers.get("content-type") || "", size: res.headers.get("content-length") };
  } finally {
    clearTimeout(timer);
  }
}

export async function stream({ id }) {
  const key = String(id || "");
  const sid = key.indexOf("s") === 0 ? key.slice(1) : key;
  if (!/^\d+$/.test(sid)) throw fail("invalid", t("没有这个声音"));

  const known = directLink(media[sid]);
  if (known) {
    const ext = (known.split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || "m4a";
    return { url: known, type: TYPE_OF[ext.toLowerCase()] || "m4a" };
  }

  /* Not seen in any sheet yet: ask the API. A plain file can be played, but a
     hls.m3u8 means the Widevine copy, and that one stays unplayed. */
  const sound = await soundInfo(sid);
  const url = directLink(sound.soundurl) || directLink(sound.soundurl_128);
  if (url) {
    saveMedia(sid, url);
    const ext = (url.split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || "m4a";
    return { url: url, type: TYPE_OF[ext.toLowerCase()] || "m4a" };
  }

  throw fail(
    "unavailable",
    t("这条声音在站点里是 Widevine 加密的 HLS，第三方播放器解不了；请在猫耳FM 客户端收听，或换音单里的曲目"),
  );
}

export function lyrics() {
  return { lrc: "" };
}

/* ------------------------------------------------------------------ library */

const index = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks) {
    if (!track || !track.id) continue;
    const entry = {
      id: track.id,
      name: track.name,
      artists: track.artists,
      imageUrl: track.imageUrl,
      duration: track.duration,
    };
    const old = index[track.id];
    if (!old || old.name !== entry.name) {
      index[track.id] = entry;
      changed = true;
    }
  }
  if (changed) host.storage.set("trackIndex", index);
}

function load(key, fallback) {
  const value = host.storage.get(key);
  return value == null ? fallback : value;
}

function trackById(id) {
  if (index[id]) return index[id];
  const liked = load("likedTracks", {});
  return liked[id] || { id: id, name: id };
}

export function played({ id }) {
  if (!id) return;
  const ids = load("recent", []).filter((item) => item !== id);
  ids.unshift(id);
  host.storage.set("recent", ids.slice(0, 20));
}

export function recent() {
  return load("recent", []).map(trackById).filter(Boolean).slice(0, 10);
}

export function like({ id, on }) {
  const ids = load("liked", []).filter((item) => item !== id);
  if (on) ids.unshift(id);
  host.storage.set("liked", ids);

  const set = load("likedSet", {});
  if (on) set[id] = true;
  else delete set[id];
  host.storage.set("likedSet", set);

  const tracks = load("likedTracks", {});
  if (on) tracks[id] = trackById(id);
  else delete tracks[id];
  host.storage.set("likedTracks", tracks);
}

export function liked() {
  const ids = load("liked", []);
  return { tracks: ids.map(trackById), more: false };
}

export function isLiked({ ids }) {
  const set = load("likedSet", {});
  const answer = {};
  for (const id of ids || []) answer[id] = !!set[id];
  return answer;
}

/* ------------------------------------------------------------------ helpers */

function stripTags(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
