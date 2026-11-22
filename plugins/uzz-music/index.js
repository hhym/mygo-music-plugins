// MyGo Music plugin — 优折美音乐 (m.uzz.me)
//
// The site is an MKOnlineMusicPlayer front end: one static shell page plus a
// PHP data bridge. Everything — search, song URL, cover, lyric, playlist —
// comes from that bridge as JSONP:
//
//   GET  /api.php?types=search&count=10&source=netease&pages=<n>&name=<kw>
//   GET  /api.php?types=url&id=<url_id>&source=<source>       -> { url }
//   GET  /api.php?types=pic&id=<pic_id>&source=<source>       -> { url }
//   GET  /api.php?types=lyric&id=<lyric_id>&source=<source>   -> { lyric, tlyric }
//   GET  /api.php?types=playlist&id=<netease playlist id>     -> { playlist: {...} }
//
// Two quirks shape the code below:
//
//   1. The host sits behind a CloudFront "verify you are a browser" gate. A
//      plain GET answers 503 with a tiny page that, after five seconds and a
//      HEAD probe carrying ?_callback=<ts>, hands out a waf_token cookie. We
//      replay that dance once and keep the cookie for later requests.
//   2. A song is not addressable by one number: the search hit carries
//      id/url_id/pic_id/lyric_id, and the bridge wants the matching one for
//      each call. Track ids therefore pack all four, joined by |.

const BASE = "https://m.uzz.me";
const API = BASE + "/api.php";
const SOURCE = "netease";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PAGE = 10;
const CACHE_TTL = 5 * 60 * 1000;
const TOKEN_TTL = 45 * 60 * 1000;

const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

/* ---------------------------------------------------------------- transport */

/* Cookies live in memory for the life of the plugin process; the waf_token is
   also mirrored into storage so a restart inside the token window skips the
   five second gate. */
const jar = new Map();

function loadJar() {
  if (jar.size) return;
  const saved = host.storage.get("waf");
  if (!saved || !saved.cookies) return;
  for (const pair of saved.cookies) jar.set(pair[0], pair[1]);
}

function saveJar() {
  host.storage.set("waf", {
    at: Date.now(),
    cookies: Array.from(jar.entries()),
  });
}

function cookieHeader() {
  if (!jar.size) return "";
  return Array.from(jar.entries())
    .map((pair) => pair[0] + "=" + pair[1])
    .join("; ");
}

function absorb(res) {
  let lines = [];
  if (typeof res.headers.getSetCookie === "function") {
    lines = res.headers.getSetCookie();
  } else {
    const raw = res.headers.get("set-cookie");
    if (raw) lines = raw.split(/,(?=[^;]+=)/);
  }
  for (const line of lines || []) {
    const pair = String(line).split(";")[0];
    const at = pair.indexOf("=");
    if (at < 1) continue;
    jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  if (lines.length) saveJar();
}

function headers(extra) {
  const base = {
    "user-agent": UA,
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
    accept: "*/*",
    referer: BASE + "/",
  };
  const cookie = cookieHeader();
  if (cookie) base.cookie = cookie;
  return Object.assign(base, extra || {});
}

async function send(url, method, extra, ms) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const init = { method: method || "GET", headers: headers(extra), redirect: "manual" };
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms || 25000);
  try {
    return await fetch(url, init);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isChallenge(status, body) {
  return status === 503 && body.indexOf("安全验证") >= 0;
}

function isBlocked(status, body) {
  if (status !== 403) return false;
  const lower = String(body).toLowerCase();
  return lower.indexOf("403") >= 0 && lower.indexOf("<html") >= 0;
}

let verifiedAt = 0;

/* Pass the CloudFront gate: one HEAD with ?_callback, five seconds, then the
   original request again. Runs at most once per token window. */
async function verify(url) {
  if (Date.now() - verifiedAt < TOKEN_TTL && jar.has("waf_token")) return;
  const stamp = String(Date.now());
  try {
    const head = await send(BASE + "/?_callback=" + stamp, "HEAD", null, 15000);
    absorb(head);
  } catch (error) {
    /* The probe often reports its own 503; the cookie is what matters. */
  }
  await sleep(5300);
  verifiedAt = Date.now();
}

/* The host answers bursts with a blanket 403, so every request goes through
   one queue that keeps a gap between calls and lets a refused one cool down
   before trying again. */
let queue = Promise.resolve();
let lastCall = 0;
const GAP = 1800;

function paced(task) {
  const run = queue.then(async () => {
    const wait = lastCall + GAP - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCall = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

async function fetchText(url, options = {}) {
  loadJar();
  return paced(async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await send(url, options.method || "GET", options.headers, options.timeout);
      } catch (error) {
        if (attempt === 2) throw fail("unavailable", t("连接站点失败，请稍后再试"));
        await sleep(2000 * (attempt + 1));
        continue;
      }
      absorb(res);
      const body = await res.text();
      lastStatus = res.status;

      if (isChallenge(res.status, body)) {
        await verify(url);
        continue;
      }
      if (isBlocked(res.status, body)) {
        if (attempt === 2) throw fail("unavailable", t("站点正在限流或拒绝访问，请过几分钟再试"));
        await sleep(6000 * (attempt + 1));
        continue;
      }
      if (res.status >= 500) {
        if (attempt === 2) throw fail("unavailable", t("站点接口暂时不可用（HTTP " + res.status + "）"));
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (res.status === 404) throw fail("unavailable", t("站点没有这个接口"));
      return body;
    }
    throw fail("unavailable", t("站点接口暂时不可用（HTTP " + lastStatus + "）"));
  });
}

/* --------------------------------------------------------------- json bridge */

function unwrap(text) {
  const trimmed = String(text || "").trim();
  const at = trimmed.indexOf("(");
  const end = trimmed.lastIndexOf(")");
  if (at > 0 && end > at) return trimmed.slice(at + 1, end);
  return trimmed;
}

const apiCache = new Map();

async function api(params, ttl) {
  const query = Object.keys(params)
    .filter((key) => params[key] != null && params[key] !== "")
    .map((key) => key + "=" + encodeURIComponent(String(params[key])))
    .join("&");
  const url = API + "?" + query + "&callback=mygo_" + Date.now();
  const cached = apiCache.get(query);
  if (cached && Date.now() - cached.at < (ttl || CACHE_TTL)) return cached.data;

  const body = await fetchText(url, { timeout: 25000 });
  let data;
  try {
    data = JSON.parse(unwrap(body));
  } catch (error) {
    throw fail("unavailable", t("站点接口返回异常，请稍后再试"));
  }
  apiCache.set(query, { at: Date.now(), data: data });
  return data;
}

/* --------------------------------------------------------------------- tracks */

function pack(item) {
  return [item.source || SOURCE, item.id, item.url_id || item.id, item.pic_id, item.lyric_id].join("|");
}

function unpack(id) {
  const parts = String(id).split("|");
  return {
    source: parts[0] || SOURCE,
    id: parts[1] || "",
    urlId: parts[2] || parts[1] || "",
    picId: parts[3] || "",
    lyricId: parts[4] || parts[1] || "",
  };
}

function toTrack(item) {
  if (!item || !item.id) return null;
  const artists = Array.isArray(item.artist) ? item.artist : item.artist ? [item.artist] : [];
  return {
    id: pack(item),
    name: item.name || "未知歌曲",
    artists: artists.map((name) => ({ name: String(name) })),
    album: item.album ? { name: String(item.album) } : undefined,
    imageUrl: item.pic || undefined,
  };
}

function listOf(items) {
  return (items || []).map(toTrack).filter(Boolean);
}

/* ---------------------------------------------------------------- navigation */

export async function home() {
  const sections = [];

  /* One chart is enough for the landing page: the site throttles bursts, so
     the plugin spends its first request on the heat list and nothing else. */
  try {
    const sheet = await playlist("3778678");
    remember(sheet.tracks);
    if (sheet.tracks.length) {
      sections.push({
        title: t("热歌榜"),
        albums: [
          {
            id: "p:3778678",
            name: sheet.album.name,
            imageUrl: sheet.album.imageUrl,
            description: sheet.album.description,
          },
        ],
      });
      sections.push({ title: t("热歌榜 · 歌曲"), tracks: sheet.tracks.slice(0, 10) });
    }
  } catch (error) {
    sections.push({
      title: t("榜单暂时取不到"),
      links: [{ title: t("重试热歌榜"), page: "playlist/3778678" }],
    });
  }

  sections.push({
    title: "搜索",
    links: HOT.map((word) => ({ title: word, page: "search/" + word })),
  });

  return {
    title: t("优折美音乐"),
    subtitle: t("在线播放 · 网易云曲库"),
    sections: sections,
  };
}

const HOT = ["周杰伦", "林俊杰", "陈奕迅", "邓紫棋", "薛之谦", "毛不易", "五月天", "告五人"];

async function playlist(id) {
  const data = await api({ types: "playlist", id: id, source: SOURCE });
  const sheet = data && data.playlist ? data.playlist : {};
  const tracks = [];
  for (const item of sheet.tracks || []) {
    const artist = (item.ar && item.ar[0] && item.ar[0].name) || (item.artists && item.artists[0] && item.artists[0].name);
    const album = (item.al && item.al.name) || (item.album && item.album.name);
    const pic = (item.al && item.al.picUrl) || (item.album && item.album.picture);
    const mapped = toTrack({
      id: item.id,
      name: item.name,
      artist: artist ? [artist] : [],
      album: album,
      source: SOURCE,
      url_id: item.id,
      pic_id: null,
      lyric_id: item.id,
      pic: pic ? pic + "?param=300y300" : null,
    });
    if (mapped) tracks.push(mapped);
  }
  return {
    album: {
      id: "p:" + id,
      name: sheet.name || t("歌单"),
      imageUrl: sheet.coverImgUrl ? sheet.coverImgUrl + "?param=300y300" : undefined,
      description: sheet.creator && sheet.creator.nickname ? t("歌单 · ") + sheet.creator.nickname : t("歌单"),
    },
    tracks: tracks,
  };
}

export async function browse({ page }) {
  const path = String(page || "");

  if (path === "hot") {
    return {
      title: t("热门搜索"),
      sections: [
        { title: t("热门搜索"), links: HOT.map((word) => ({ title: word, page: "search/" + word })) },
      ],
    };
  }

  const searchMatch = /^search\/(.+)$/.exec(path);
  if (searchMatch) {
    const keyword = decodeURIComponent(searchMatch[1]);
    const result = await search({ query: keyword, offset: 0 });
    return {
      title: keyword,
      sections: [{ title: t("歌曲"), tracks: result.tracks, more: result.more }],
    };
  }

  const listMatch = /^playlist\/(\d+)$/.exec(path);
  if (listMatch) {
    const sheet = await playlist(listMatch[1]);
    remember(sheet.tracks);
    return {
      title: sheet.album.name,
      sections: [{ title: t("歌曲"), tracks: sheet.tracks }],
    };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------- search */

export async function search({ query, offset }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));

  const start = Math.max(0, Number(offset) || 0);
  const first = Math.floor(start / PAGE) + 1;
  const skip = start % PAGE;

  const items = [];
  let more = false;
  for (let pageNo = first; ; pageNo++) {
    const data = await api(
      { types: "search", count: PAGE, source: SOURCE, pages: pageNo, name: keyword },
      CACHE_TTL,
    );
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      more = false;
      break;
    }
    items.push.apply(items, rows);
    if (items.length > skip + PAGE) {
      more = true;
      break;
    }
    if (rows.length < PAGE) {
      more = false;
      break;
    }
  }

  const tracks = listOf(items.slice(skip, skip + PAGE));
  remember(tracks);
  return { tracks: tracks, more: tracks.length === PAGE && more };
}

export function suggest({ query }) {
  const word = String(query || "").trim();
  if (!word) return [];
  return HOT.filter((item) => item === word || item.indexOf(word) === 0 || item.indexOf(word) > 0).slice(0, 6);
}

/* -------------------------------------------------------------------- albums */

export async function album({ id }) {
  const raw = String(id);
  if (raw.indexOf("p:") === 0) {
    const sheet = await playlist(raw.slice(2));
    return { album: sheet.album, tracks: sheet.tracks };
  }
  const item = unpack(raw);
  const track = toTrack({
    id: item.id,
    name: t("歌曲"),
    artist: [],
    source: item.source,
    url_id: item.urlId,
    pic_id: item.picId,
    lyric_id: item.lyricId,
  });
  return {
    album: { id: raw, name: t("单曲") },
    tracks: track ? [track] : [],
  };
}

/* -------------------------------------------------------------------- stream */

const TYPES = { mp3: "mp3", m4a: "m4a", aac: "aac", flac: "flac" };

export async function stream({ id }) {
  const item = unpack(id);
  const data = await api({ types: "url", id: item.urlId, source: item.source }, 30 * 60 * 1000);
  const url = data && data.url ? String(data.url) : "";
  if (!url || url === "err") throw fail("unavailable", t("这首暂时没有可播放的地址"));
  const ext = (url.split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || "mp3";
  return { url: url, type: TYPES[ext.toLowerCase()] || "mp3" };
}

export async function lyrics({ id }) {
  const item = unpack(id);
  const data = await api({ types: "lyric", id: item.lyricId, source: item.source }, 30 * 60 * 1000);
  const main = (data && data.lyric) || "";
  if (!main) return { lrc: "" };
  return { lrc: main };
}

/* ------------------------------------------------------------- local library */

const index = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks) {
    if (!track || !track.id) continue;
    const entry = { id: track.id, name: track.name, artists: track.artists, imageUrl: track.imageUrl };
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
  return liked[id] || { id: id, name: t("歌曲") };
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
