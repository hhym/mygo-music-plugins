// MyGo Music plugin — 布谷音乐 (https://www.buguyy.top)
//
// 站点是个 Nuxt SPA，页面内容全部来自同域的 JSON 接口：
//   GET /api/hotlist              热门 50 首
//   GET /api/newlist              最新上架 50 首
//   GET /api/search?keyword=…     搜索，最多 50 首，没有分页参数
//   GET /api/geturl?id=<id>       {url, name, lrc}，播放地址是酷我 CDN 直链
//   GET /api/allneturl?gid=…      备用音源，要站点内部的 musicRid，列表里不给，用不上
//
// 列表项是 {id, title, picurl, about, singer}：
//   - id 是 base64 过的酷我 rid，原样回传即可；
//   - about 通常就是整首 LRC（一行一个 <br />），而 geturl 返回的 lrc 经常是
//     「歌词获取失败」，所以歌词优先取 about；
//   - picurl 是酷我封面 https://imgN.kuwo.cn/star/albumcover/500/…，路径里的
//     500 就是尺寸，换成 {size} 让 App 自己挑，封面比整张图省流量。
//
// 音频实测可直接播：酷我 car-*.kuwo.cn 的直链裸请求就 206 audio/mpeg，
// 不需要 Referer 或 Cookie，320kbps mp3。

const BASE = "https://www.buguyy.top";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "application/json, text/plain, */*",
  referer: BASE + "/",
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

async function once(url, init, ms) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const request = fetch(url, init);
  try {
    return await deadline(request, ms, url);
  } catch (error) {
    if (controller) controller.abort();
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* The site's JSON endpoints                                           */
/* ------------------------------------------------------------------ */

async function api(name, params) {
  const url = new URL(BASE + "/api/" + name);
  for (const key of Object.keys(params || {})) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const target = url.toString();
  const cached = apiCache.get(target);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.data;

  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await once(target, { headers: HEAD }, 12000);
      if (res.status >= 400) throw fail("unavailable", name + " " + res.status);
      const data = await res.json();
      apiCache.set(target, { at: Date.now(), data: data });
      return data;
    } catch (error) {
      last = error;
    }
  }
  throw fail("unavailable", t("布谷音乐的接口暂时连不上") + " (" + name + ")");
}

const apiCache = new Map();

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

// 封面地址里 /albumcover/500/ 的 500 是尺寸，换 {size} 交给 App
function sized(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const https = raw.replace(/^\/\//, "https://").replace(/^http:\/\//i, "https://");
  return https.replace(/(\/albumcover\/)\d{2,4}(\/)/, "$1{size}$2");
}

function toTrack(item) {
  const title = clean(item.title || item.name || "");
  if (!title || !item.id) return null;
  const track = {
    id: String(item.id),
    name: title,
    album: { name: "", imageUrl: sized(item.picurl || item.pic || item.cover) },
  };
  const singer = clean(item.singer || item.artist || "");
  if (singer) track.artists = [{ name: singer }];
  return track;
}

function toTracks(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const track = toTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
    lyricsById.set(track.id, cleanLrc(item.about));
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

/* Tracks the listener has seen, so likes and history can be rebuilt from
   their ids alone, plus the lyrics those lists carried. */
const index = host.storage.get("trackIndex") || {};
const lyricsById = new Map();

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

async function list(name) {
  const data = await api(name);
  return toTracks(data && data.data);
}

export async function home() {
  const results = await Promise.all([
    list("hotlist").catch((error) => {
      console.log("[buguyy] hotlist failed:", error && error.message);
      return null;
    }),
    list("newlist").catch((error) => {
      console.log("[buguyy] newlist failed:", error && error.message);
      return null;
    }),
  ]);
  const hot = results[0] || [];
  const fresh = results[1] || [];

  const sections = [];
  if (hot.length) sections.push({ title: t("热门推荐"), tracks: hot, morePage: "hot" });
  if (fresh.length) sections.push({ title: t("最新上架"), tracks: fresh, morePage: "new" });
  sections.push({
    title: t("更多"),
    links: [
      { title: t("热歌 50 首"), subtitle: t("布谷音乐当下最多人听"), page: "hot" },
      { title: t("新歌 50 首"), subtitle: t("刚上架的一批"), page: "new" },
    ],
  });

  if (!hot.length && !fresh.length) {
    return {
      title: t("布谷音乐"),
      subtitle: t("接口暂时连不上，稍后刷新"),
      sections: sections.slice(-1),
    };
  }

  return {
    title: t("布谷音乐"),
    subtitle: t("热歌与新歌，一次 50 首"),
    sections: sections,
  };
}

export async function browse({ page: name }) {
  const key = String(name || "");
  if (key === "hot") {
    const tracks = await list("hotlist");
    return { title: t("热歌 50 首"), subtitle: t("布谷音乐当下最多人听"), sections: [{ title: t("热门推荐"), tracks: tracks }] };
  }
  if (key === "new") {
    const tracks = await list("newlist");
    return { title: t("新歌 50 首"), subtitle: t("刚上架的一批"), sections: [{ title: t("最新上架"), tracks: tracks }] };
  }
  if (key.indexOf("artist/") === 0) {
    const name = decodeURIComponent(key.slice(7));
    const artist = await artistPage(name);
    return artist;
  }
  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------ */
/* Search                                                             */
/* ------------------------------------------------------------------ */

export async function search({ query, kind }) {
  const text = String(query || "").trim();
  const key = kind || "tracks";
  if (!text) {
    if (key === "albums") return { albums: [], more: false };
    if (key === "artists") return { artists: [], more: false };
    return { tracks: [], more: false };
  }
  if (key === "albums") return { albums: [], more: false };
  if (key === "artists") {
    const tracks = await searchTracks(text);
    const names = [];
    const seen = new Set();
    for (const track of tracks) {
      for (const artist of track.artists || []) {
        if (!artist.name || seen.has(artist.name)) continue;
        seen.add(artist.name);
        names.push({ id: "n:" + artist.name, name: artist.name, imageUrl: track.album.imageUrl });
      }
    }
    return { artists: names.slice(0, 20), more: false };
  }
  if (key !== "tracks") return { tracks: [], more: false };
  return { tracks: await searchTracks(text), more: false };
}

async function searchTracks(text) {
  const data = await api("search", { keyword: text });
  return toTracks(data && data.data);
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const tracks = await searchTracks(text);
    return tracks
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
/* Artist (the site has no artist endpoint, so it is a name search)    */
/* ------------------------------------------------------------------ */

async function artistPage(name) {
  const tracks = await searchTracks(name);
  const artist = { id: "n:" + name, name: name, imageUrl: "" };
  const matched = tracks.filter((track) => (track.artists || []).some((item) => item.name === name));
  const list = matched.length ? matched : tracks;
  if (list.length && list[0].album.imageUrl) artist.imageUrl = list[0].album.imageUrl;
  return {
    title: name,
    subtitle: t("按歌手名搜到的歌"),
    sections: list.length ? [{ title: t("歌曲"), tracks: list }] : [],
  };
}

export async function artist({ id }) {
  const raw = String(id || "");
  const name = raw.indexOf("n:") === 0 ? raw.slice(2) : raw;
  const page = await artistPage(name);
  return {
    artist: { id: "n:" + name, name: name, imageUrl: page.sections.length ? page.sections[0].tracks[0].album.imageUrl : "" },
    tracks: page.sections.length ? page.sections[0].tracks : [],
    albums: [],
  };
}

/* ------------------------------------------------------------------ */
/* Song detail, lyrics, audio                                         */
/* ------------------------------------------------------------------ */

const songCache = new Map();

async function song(id) {
  const key = String(id);
  const cached = songCache.get(key);
  if (cached && Date.now() - cached.at < 3 * 60 * 1000) return cached.song;

  const data = await api("geturl", { id: key });
  if (!data || !data.success || !data.url) {
    throw fail("unavailable", t("这首歌暂时取不到播放地址"));
  }
  const value = {
    url: String(data.url),
    name: clean(data.name),
    lrc: cleanLrc(data.lrc),
    at: Date.now(),
  };
  songCache.set(key, { at: Date.now(), song: value });
  return value;
}

function audioType(url) {
  const path = String(url).split("?")[0].toLowerCase();
  if (path.endsWith(".flac")) return "flac";
  if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "m4a";
  if (path.endsWith(".ogg") || path.endsWith(".opus")) return "ogg";
  if (path.endsWith(".wav")) return "wav";
  return "mp3";
}

export async function stream({ id }) {
  const info = await song(String(id));
  if (!/^https:\/\//i.test(info.url)) throw fail("unavailable", t("这首歌暂时取不到播放地址"));
  return { url: info.url, type: audioType(info.url) };
}

export async function lyrics({ id }) {
  const key = String(id);
  const fromList = lyricsById.get(key) || "";
  if (fromList) return { lrc: fromList };
  try {
    const info = await song(key);
    if (info.lrc) return { lrc: info.lrc };
  } catch (error) {
    console.log("[buguyy] lyrics failed:", error && error.message);
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
