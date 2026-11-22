// MyGo Music plugin — DJ024电音 (www.dj024.com)
//
// A Shenyang DJ site built on Laravel: list pages are plain HTML, and one
// JSON endpoint supplies what a player actually needs:
//
//   GET  /                          latest tracks (274 "track-line" rows)
//   GET  /cate/exclusive            the exclusive shelf
//   GET  /forum/category-<id>?page=<n>
//   GET  /albums/<id>?page=<n>      a themed collection (1385 tracks for 红番区)
//   GET  /authors/<id>?page=<n>     an uploader's shelf
//   GET  /searches?q=<kw>&page=<n>
//   GET  /api/tracks/media?ac=song&id=<id>
//        -> { data: { name, cover, user, category, isSole, low: { url, size } } }
//
// The `low` URL is an m4a on dns.dj024.vip with no hotlink check and Range
// support, so playback is plain `stream`. Non-exclusive tracks are served in
// full there; exclusive ones only carry a preview clip, which is the site's
// own rule ("独家舞曲只提供片段试听").

const BASE = "https://www.dj024.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const PAGE_SIZE = 28; // the number of rows a list page carries
const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function request(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const headers = Object.assign({}, HEAD, options.headers || {});
  const init = { method: options.method || "GET", headers: headers };
  const ms = options.timeout || 15000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    const res = await fetch(url, init);
    if (res.status === 404) throw fail("unavailable", t("站点没有这个页面"));
    if (res.status >= 500) throw fail("unavailable", t("站点暂时不可用（HTTP " + res.status + "）"));
    if (res.status === 403) throw fail("unavailable", t("站点拒绝了请求，请稍后再试"));
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const pageCache = new Map();

async function html(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const res = await request(url, { headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
  const text = await res.text();
  pageCache.set(url, { at: Date.now(), html: text });
  return text;
}

const jsonCache = new Map();

async function trackData(id) {
  const key = String(id);
  const cached = jsonCache.get(key);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;
  const res = await request("/api/tracks/media?ac=song&id=" + encodeURIComponent(key), {
    headers: { accept: "application/json", "x-requested-with": "XMLHttpRequest", referer: BASE + "/" },
  });
  let body;
  try {
    body = await res.json();
  } catch (error) {
    throw fail("unavailable", t("站点接口返回异常，请稍后再试"));
  }
  if (!body || !body.data) throw fail("unavailable", t("这首取不到播放信息"));
  jsonCache.set(key, { at: Date.now(), data: body.data });
  return body.data;
}

/* ------------------------------------------------------------------- parsing */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text) {
  return String(text || "").replace(/&(#\d+|amp|lt|gt|quot|apos|nbsp);/g, (whole, name) => {
    if (name[0] === "#") {
      const code = Number(name.slice(1));
      return String.fromCharCode(code);
    }
    return ENTITIES[name] || whole;
  });
}

function secondsOf(text) {
  const found = /TIME\s*(\d+)\u5206(\d+)\u79d2|(\d+)\u5206(\d+)\u79d2/.exec(text || "");
  if (!found) return undefined;
  const minutes = Number(found[1] || found[3] || 0);
  const seconds = Number(found[2] || found[4] || 0);
  return (minutes * 60 + seconds) * 1000;
}

/* Titles look like "【独家发布】歌手 - 曲名（Mix）" or just "DJ杰森2026 圣诞".
   The singer before the dash is what the app shows as the artist. */
function artistsOf(name) {
  const clean = String(name || "").replace(/^\s*【[^】]*】\s*/, "").trim();
  const parts = clean.split(/\s+-\s+/);
  if (parts.length < 2) return [];
  const singer = parts[0].trim();
  return singer ? [{ name: singer }] : [];
}

function parseItems(page) {
  const pieces = String(page).split(/class="[^"]*track-list-item[^"]*"/).slice(1);
  const tracks = [];
  for (const chunk of pieces) {
    const id = (/select-input[^>]*value="(\d+)"/.exec(chunk) || [])[1];
    if (!id) continue;
    const name = decode((/track-list-name-text[^>]*title="([^"]*)"/.exec(chunk) || [])[1] || "");
    if (!name) continue;
    const cover = (/track-list-cover-img[^>]*data-src="([^"]+)"/.exec(chunk) || [])[1];
    const category = decode((/<a[^>]*target="_cat"[^>]*>([^<]*)</.exec(chunk) || [])[1] || "");
    const duration = secondsOf(chunk);
    tracks.push({
      id: id,
      name: name,
      artists: artistsOf(name),
      album: category ? { name: category } : undefined,
      duration: duration,
      imageUrl: cover && !/assets\/images\/cover\.png/.test(cover) ? cover : undefined,
    });
  }
  return tracks;
}

/* The home page carries its newest rows in a slimmer "track-line" shape. */
function parseLines(page) {
  const re = /track-line-name[^"]*"[^>]*href="[^"]*\/topics\/(\d+)"[^>]*title="([^"]*)"/g;
  const tracks = [];
  let match;
  while ((match = re.exec(page))) {
    const name = decode(match[2]);
    if (!name) continue;
    tracks.push({ id: match[1], name: name, artists: artistsOf(name) });
  }
  return tracks;
}

/* A browse page may carry its page number as a trailing segment:
   "category/37/2". The middle segment is the id, never the page. */
function splitPage(path) {
  const clean = String(path || "").replace(/\s+$/, "");
  const found = /^(.*)\/(\d+)$/.exec(clean);
  if (!found) return { base: clean, page: 0 };
  if (/^(category|album|author|song|search|latest|exclusive|albums)$/.test(found[1])) {
    return { base: clean, page: 0 };
  }
  return { base: found[1], page: Number(found[2]) };
}

function hasNext(page, pageNo) {
  const next = pageNo + 1;
  return new RegExp("page=" + next + "(?!\\d)").test(page);
}

/* ------------------------------------------------------------------ browsing */

const HOT = ["中文舞曲", "现场串烧", "HOUSE", "慢摇", "英文舞曲", "抖音"];

export async function home() {
  const sections = [];

  const front = await html("/");
  const latest = parseLines(front).slice(0, 20);
  if (latest.length) {
    remember(latest);
    sections.push({ title: t("最新发布"), tracks: latest, morePage: "latest" });
  }

  try {
    const shelf = await html("/cate/exclusive");
    const exclusive = parseItems(shelf).slice(0, 20);
    if (exclusive.length) {
      remember(exclusive);
      sections.push({ title: t("独家舞曲"), tracks: exclusive, morePage: "exclusive" });
    }
  } catch (error) {
    /* The shelf is a secondary row; its failure must not empty Home. */
  }

  sections.push({
    title: t("分类"),
    links: [
      { title: t("最新发布"), page: "latest" },
      { title: t("独家舞曲"), page: "exclusive" },
      { title: t("中文舞曲"), page: "category/3" },
      { title: t("现场串烧"), page: "category/37" },
      { title: t("HOUSE中文"), page: "category/51" },
      { title: t("经典怀旧"), page: "category/33" },
      { title: t("专辑"), page: "albums" },
    ],
  });

  return {
    title: t("DJ024电音"),
    subtitle: t("沈阳DJ024电音传媒 · 舞曲串烧"),
    sections: sections,
  };
}

export async function browse({ page }) {
  const path = String(page || "");
  const parts = splitPage(path);
  const pageNo = parts.page;
  const base = parts.base;

  if (base === "latest" || base === "") {
    const front = await html("/");
    const tracks = parseLines(front);
    const chunk = tracks.slice(0, 60);
    remember(chunk);
    return { title: t("最新发布"), sections: [{ title: t("最新发布"), tracks: chunk }] };
  }

  if (base === "exclusive") {
    const shelf = await html("/cate/exclusive");
    const tracks = parseItems(shelf);
    remember(tracks);
    return {
      title: t("独家舞曲"),
      description: t("独家舞曲只提供片段试听，下载为完整版。"),
      sections: [{ title: t("独家舞曲"), tracks: tracks }],
    };
  }

  const cat = /^category\/(\d+)$/.exec(base);
  if (cat) {
    const url = "/forum/category-" + cat[1] + (pageNo > 1 ? "?page=" + pageNo : "");
    const data = await html(url);
    const tracks = parseItems(data);
    remember(tracks);
    const title =
      decode((/breadcrumb-item active[^>]*>([^<]*)</.exec(data) || [])[1] || "") || t("分类");
    return {
      title: title,
      sections: [
        {
          title: title,
          tracks: tracks,
          morePage: hasNext(data, pageNo || 1) ? "category/" + cat[1] + "/" + ((pageNo || 1) + 1) : undefined,
        },
      ],
    };
  }

  const al = /^album\/(\d+)$/.exec(base);
  if (al) {
    const sheet = await album({ id: al[1], page: pageNo });
    return {
      title: sheet.album.name,
      imageUrl: sheet.album.imageUrl,
      description: sheet.album.description,
      sections: [
        {
          title: t("歌曲"),
          tracks: sheet.tracks,
          morePage: sheet.more ? "album/" + al[1] + "/" + ((pageNo || 1) + 1) : undefined,
        },
      ],
    };
  }

  const au = /^author\/(\d+)$/.exec(base);
  if (au) {
    const info = await artist({ id: au[1], page: pageNo });
    return {
      title: info.artist.name,
      description: info.artist.description,
      sections: [
        {
          title: t("歌曲"),
          tracks: info.tracks,
          morePage: info.more ? "author/" + au[1] + "/" + ((pageNo || 1) + 1) : undefined,
        },
      ],
    };
  }

  if (base === "albums") {
    const data = await html("/albums");
    const chunks = String(data).split(/class="[^"]*album-list-item[^"]*"/).slice(1);
    const albums = [];
    for (const chunk of chunks) {
      const id = (/\/albums\/(\d+)/.exec(chunk) || [])[1];
      const name = decode((/<p[^>]*>([^<]+)</.exec(chunk) || [])[1] || "");
      const cover = (/data-src="([^"]+)"/.exec(chunk) || [])[1];
      if (!id || !name) continue;
      albums.push({
        id: id,
        name: name,
        imageUrl: cover && !/assets\/images\/cover\.png/.test(cover) ? cover : undefined,
      });
    }
    return { title: t("专辑"), sections: [{ title: t("专辑"), albums: albums }] };
  }

  const song = /^song\/(\d+)$/.exec(base);
  if (song) {
    const info = await trackData(song[1]);
    const track = trackOf(info);
    remember([track]);
    return { title: track.name, sections: [{ title: t("歌曲"), tracks: [track] }] };
  }

  const searchPath = /^search\/(.+)$/.exec(base);
  if (searchPath) {
    const keyword = decodeURIComponent(searchPath[1]);
    const result = await search({ query: keyword, offset: 0 });
    return { title: keyword, sections: [{ title: t("歌曲"), tracks: result.tracks }] };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------- search */

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "tracks") return { albums: [], more: false };

  const start = Math.max(0, Number(offset) || 0);
  const pageNo = Math.floor(start / PAGE_SIZE) + 1;
  const skip = start % PAGE_SIZE;

  const data = await html("/searches?q=" + encodeURIComponent(keyword) + (pageNo > 1 ? "&page=" + pageNo : ""));
  const tracks = parseItems(data).slice(skip, skip + PAGE_SIZE);
  remember(tracks);
  return { tracks: tracks, more: tracks.length > 0 && hasNext(data, pageNo) };
}

export function suggest({ query }) {
  const word = String(query || "").trim();
  if (!word) return HOT.slice(0, 6);
  return HOT.filter((item) => item.indexOf(word) >= 0 || word.indexOf(item) >= 0).slice(0, 6);
}

/* -------------------------------------------------------------- album/artist */

function albumMeta(data) {
  const name = decode((/album-detail-name[^"]*"[^>]*>([^<]*)</.exec(data) || [])[1] || "");
  const cover = (/album-detail-cover[^>]*data-src="([^"]+)"/.exec(data) || [])[1];
  const intro = /(?:专辑简介|简介)：([^<]{0,600})/.exec(data);
  return {
    name: name || t("专辑"),
    imageUrl: cover && !/assets\/images\/cover\.png/.test(cover) ? cover : undefined,
    description: intro ? decode(intro[1]).trim() : undefined,
  };
}

export async function album({ id, page }) {
  const pageNo = Number(page) || 1;
  const data = await html("/albums/" + encodeURIComponent(String(id)) + (pageNo > 1 ? "?page=" + pageNo : ""));
  const meta = albumMeta(data);
  const tracks = parseItems(data);
  remember(tracks);
  return {
    album: { id: String(id), name: meta.name, imageUrl: meta.imageUrl, description: meta.description },
    tracks: tracks,
    more: hasNext(data, pageNo),
  };
}

export async function artist({ id, page }) {
  const pageNo = Number(page) || 1;
  const data = await html("/authors/" + encodeURIComponent(String(id)) + (pageNo > 1 ? "?page=" + pageNo : ""));
  const name = decode((/album-detail-name[^"]*"[^>]*>([^<]*)</.exec(data) || [])[1] || "");
  const tracks = parseItems(data);
  remember(tracks);
  return {
    artist: { id: String(id), name: name || t("作者") },
    tracks: tracks,
    more: hasNext(data, pageNo),
  };
}

/* ------------------------------------------------------------------- playing */

function trackOf(info) {
  const uploader = (info.user && info.user.name) || "";
  const artists = artistsOf(info.name);
  if (!artists.length && uploader) artists.push({ name: uploader });
  return {
    id: String(info.id),
    name: info.name || t("舞曲"),
    artists: artists,
    album: info.category && info.category.title ? { name: info.category.title } : undefined,
    imageUrl: info.cover || undefined,
    duration: info.low && info.low.duration ? info.low.duration * 1000 : undefined,
  };
}

export async function stream({ id }) {
  const info = await trackData(id);
  const url = info.low && info.low.url;
  if (!url) throw fail("unavailable", t("这首没有可播放的地址"));
  return {
    url: url,
    type: "m4a",
    size: info.low.size,
  };
}

export function lyrics() {
  return { lrc: "" };
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
  return liked[id] || { id: id, name: t("舞曲") };
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
