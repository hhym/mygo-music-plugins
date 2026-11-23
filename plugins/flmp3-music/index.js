// 显示名：凤梨音乐（flmp3-music）
// MyGo Music plugin — 凤梨音乐 (www.flmp3.pro)
//
// A small Chinese music site: every page is plain HTML, no account, no cookie.
// What the plugin uses:
//   home        GET  /index.html              22 latest cards
//   collections GET  /heji.html?page=<n>      12 collection cards a page
//   songs       GET  /song.html?page=<n>      12 song cards a page
//   search      GET  /search.html?keyword=<k>&page=<n>
//   song page   GET  /song/<id>.html          name, singer, cover, date, lyrics
//                                             and a "热门推荐" list
//   audio       GET  /api/playurl.php?id=<id> a plain text URL on *.kuwo.cn
//                                             (mp3 or aac, no hotlink check)
//   download    needs /api/captcha.php, so the plugin leaves it out.
//
// A page either holds one track (the player element <audio id="audioTag">) or a
// collection, which has no player and instead lists the songs it gathers; both
// live under /song/<id>.html, so the page itself tells which one it is.

const BASE = "https://www.flmp3.pro";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

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
  if (options.body != null) init.body = options.body;
  const ms = options.timeout || 12000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    return await fetch(url, init);
  } finally {
    clearTimeout(timer);
  }
}

const pageCache = new Map();

async function page(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const res = await request(url);
  if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
  const html = await res.text();
  pageCache.set(url, { at: Date.now(), html: html });
  return html;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function decode(text) {
  return String(text)
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
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

function plain(text) {
  return decode(String(text).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function absolute(url) {
  if (!url) return "";
  const text = decode(url).trim();
  if (text.indexOf("//") === 0) return "https:" + text;
  if (text.indexOf("/") === 0) return BASE + text;
  return text.replace(/^http:\/\//i, "https://");
}

/* Cards are <li><a href="/song/<id>.html"> cover, h3 name, p singer, date. */
function cards(html) {
  const items = [];
  const itemRe = /<li>\s*<a href="\/song\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
  let match;
  while ((match = itemRe.exec(html))) {
    const id = match[1];
    const body = match[2];
    const title = plain((/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(body) || [])[1] || "");
    const singer = plain((/<p[^>]*>([\s\S]*?)<\/p>/i.exec(body) || [])[1] || "");
    if (!title) continue;
    const cover = absolute(((/<img[^>]+src="([^"]+)"/i.exec(body) || [])[1] || "").replace(/&amp;/g, "&"));
    const date = plain((/<div class="date">([\s\S]*?)<\/div>/i.exec(body) || [])[1] || "");
    const item = { id: id, name: title, imageUrl: cover, subtitle: singer, date: date };
    if (singer) item.artists = [{ name: singer }];
    items.push(item);
  }
  return items;
}

function toTrack(item) {
  const track = { id: item.id, name: item.name };
  if (item.artists) track.artists = item.artists;
  if (item.imageUrl) track.imageUrl = item.imageUrl;
  return track;
}

function toAlbum(item) {
  return { id: item.id, name: item.name, imageUrl: item.imageUrl, artists: item.artists };
}

function hotWords(html) {
  const words = [];
  const re = /<li>\s*<a href="\/search\.html\?keyword=[^"]*"><i>\d+<\/i>([^<]+)<\/a>/g;
  let match;
  while ((match = re.exec(html))) words.push(plain(match[1]));
  return words;
}

/* ------------------------------------------------------------------ */
/* Song page                                                           */
/* ------------------------------------------------------------------ */

function songPage(html, id) {
  const title = plain((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1] || "");
  if (!title) return null;

  const singerMatch = /歌手[：:]\s*<a[^>]*>([^<]+)<\/a>/i.exec(html);
  const singer = singerMatch ? plain(singerMatch[1]) : "";
  const cover = absolute(((/<div class="pic"><img[^>]+src="([^"]+)"/i.exec(html) || [])[1] || ""));
  const dateMatch = /<div class="c flex">[\s\S]*?<p>\s*(\d{4}-\d{1,2}-\d{1,2})\s*<\/p>/i.exec(html);
  const date = dateMatch ? dateMatch[1] : "";
  const hasPlayer = /<audio id="audioTag"/i.test(html);

  let lyrics = "";
  const lyricsBox = /<div class="lyrics">([\s\S]*?)<\/div>/i.exec(html);
  if (lyricsBox) {
    const lines = [];
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = re.exec(lyricsBox[1]))) {
      const line = plain(match[1]);
      if (line) lines.push(line);
    }
    lyrics = lines.join("\n");
  }

  const related = cards((/<div class="list">[\s\S]*$/i.exec(html) || [""])[0]);

  return {
    id: id,
    title: title,
    singer: singer,
    cover: cover,
    date: date,
    hasPlayer: hasPlayer,
    lyrics: lyrics,
    related: related.filter((item) => item.id !== id),
  };
}

const songCache = new Map();

async function song(id) {
  const cached = songCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const html = await page("/song/" + id + ".html");
  const data = songPage(html, id);
  if (!data) throw fail("unavailable", t("没有这个页面"));
  songCache.set(id, { at: Date.now(), data: data });
  return data;
}

function trackOf(info) {
  const track = { id: info.id, name: info.title, album: { id: info.id, name: info.title } };
  if (info.singer) track.artists = [{ name: info.singer }];
  if (info.cover) track.imageUrl = info.cover;
  return track;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

export async function home() {
  let html = "";
  try {
    html = await page("/index.html");
  } catch (error) {
    console.log("[flmp3] home failed: " + (error && error.message));
  }

  const sections = [];
  const latest = cards(html);
  if (latest.length) {
    remember(latest.map(toTrack));
    sections.push({
      title: "最新音乐",
      subtitle: "刚上传的歌",
      tracks: latest.map(toTrack).slice(0, 20),
    });
  }

  try {
    const collections = cards(await page("/heji.html"));
    if (collections.length) {
      sections.push({
        title: "音乐合集",
        subtitle: "整张专辑与精选集",
        albums: collections.map(toAlbum).slice(0, 12),
        morePage: "collections",
      });
    }
  } catch (error) {
    console.log("[flmp3] collections failed: " + (error && error.message));
  }

  const links = [
    { title: "全部歌曲", page: "songs" },
    { title: "音乐合集", page: "collections" },
  ];
  const hot = hotWords(html);
  if (hot.length) {
    for (const word of hot.slice(0, 8)) links.push({ title: "热搜 · " + word, page: "search/" + word });
  }
  sections.push({ title: "更多", links: links });

  return { title: "凤梨音乐", subtitle: "无损音乐 · 在线试听", sections: sections };
}

/* ------------------------------------------------------------------ */
/* Browse pages                                                        */
/* ------------------------------------------------------------------ */

function pageNumber(parts, index) {
  const n = parseInt(parts[index] || "1", 10);
  return n > 0 ? n : 1;
}

export async function browse({ page: pageId }) {
  const parts = String(pageId || "").split("/");
  const head = parts[0];

  if (head === "songs") {
    const n = pageNumber(parts, 1);
    const html = await page("/song.html?page=" + n);
    const items = cards(html);
    remember(items.map(toTrack));
    let more = false;
    try {
      more = cards(await page("/song.html?page=" + (n + 1))).length > 0;
    } catch (error) {
      more = false;
    }
    return {
      title: "全部歌曲",
      subtitle: "第 " + n + " 页",
      sections: [{ title: "全部歌曲", tracks: items.map(toTrack), morePage: more ? "songs/" + (n + 1) : "" }],
    };
  }

  if (head === "collections") {
    const n = pageNumber(parts, 1);
    const html = await page("/heji.html?page=" + n);
    const items = cards(html);
    return {
      title: "音乐合集",
      subtitle: "第 " + n + " 页",
      sections: [{ title: "音乐合集", albums: items.map(toAlbum) }],
    };
  }

  if (head === "search") {
    const keyword = parts.slice(1).join("/");
    const html = await page("/search.html?keyword=" + encodeURIComponent(keyword));
    const items = cards(html);
    return {
      title: "搜索 · " + keyword,
      sections: items.length
        ? [{ title: "找到 " + items.length + " 首", tracks: items.map(toTrack) }]
        : [{ title: "搜索 · " + keyword, empty: "没有找到相关歌曲" }],
    };
  }

  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 12;

export async function search({ query, kind, offset }) {
  const keyword = String(query || "").trim();
  if (!keyword) return { tracks: [], more: false };

  const start = Math.max(0, parseInt(offset || 0, 10) || 0);
  const first = Math.floor(start / PAGE_SIZE) + 1;
  const skip = start % PAGE_SIZE;

  const items = [];
  let pageNo = first;
  let guard = 0;
  while (items.length < PAGE_SIZE && guard < 3) {
    let html = "";
    try {
      html = await page("/search.html?keyword=" + encodeURIComponent(keyword) + "&page=" + pageNo);
    } catch (error) {
      break;
    }
    const found = cards(html);
    if (!found.length) {
      guard = 3;
      break;
    }
    for (const item of found.slice(skip)) items.push(item);
    pageNo += 1;
    guard += 1;
  }

  const sliced = items.slice(0, PAGE_SIZE);
  remember(sliced.map(toTrack));
  let more = items.length > sliced.length;
  if (!more && sliced.length === PAGE_SIZE) {
    try {
      more = cards(await page("/search.html?keyword=" + encodeURIComponent(keyword) + "&page=" + pageNo)).length > 0;
    } catch (error) {
      more = false;
    }
  }
  if (kind === "albums") {
    return { albums: sliced.map(toAlbum), more: more };
  }
  if (kind === "artists") {
    const map = new Map();
    for (const item of sliced) {
      const name = (item.artists && item.artists[0] && item.artists[0].name) || "";
      if (!name) continue;
      const key = "n:" + name;
      if (!map.has(key)) map.set(key, { id: key, name: name, imageUrl: item.imageUrl });
    }
    return { artists: Array.from(map.values()), more: false };
  }
  return { tracks: sliced.map(toTrack), more: more };
}

export async function suggest({ query }) {
  const keyword = String(query || "").trim();
  let html = "";
  try {
    html = await page("/index.html");
  } catch (error) {
    return [];
  }
  const hot = hotWords(html);
  if (!keyword) return hot.slice(0, 8);
  const lower = keyword.toLowerCase();
  const hits = hot.filter((word) => word.toLowerCase().indexOf(lower) >= 0);
  if (hits.length) return hits.slice(0, 8);
  try {
    const items = cards(await page("/search.html?keyword=" + encodeURIComponent(keyword)));
    return items.slice(0, 8).map((item) => item.name);
  } catch (error) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Album (a collection page) and artist                                */
/* ------------------------------------------------------------------ */

export async function album({ id }) {
  const info = await song(String(id));

  if (info.hasPlayer) {
    return {
      album: {
        id: info.id,
        name: info.title,
        imageUrl: info.cover,
        artists: info.singer ? [{ name: info.singer }] : undefined,
        description: info.singer || "",
      },
      tracks: [trackOf(info)],
    };
  }

  /* A collection gathers songs into an archive on a net disk: the page lists
     the titles it holds but has no player of its own, so there is nothing to
     hand the queue. Its description says so instead of leaving an empty page. */
  const names = [];
  for (const line of String(info.lyrics || "").split("\n")) {
    const found = /^\s*\d{1,3}\s*[.、]?\s*(\S.*)$/.exec(line);
    if (found) names.push(found[1].trim());
  }
  const note = names.length
    ? "合集 · 共 " + names.length + " 首，站点只提供打包下载，没有单曲播放\n" + names.slice(0, 20).join("、")
    : "合集，站点只提供打包下载，没有单曲播放";

  return {
    album: {
      id: info.id,
      name: info.title,
      imageUrl: info.cover,
      artists: info.singer ? [{ name: info.singer }] : undefined,
      description: note,
    },
    tracks: [],
  };
}

export async function artist({ id }) {
  const key = String(id || "");
  const name = key.indexOf("n:") === 0 ? key.slice(2) : key;
  const items = cards(await page("/search.html?keyword=" + encodeURIComponent(name)));
  const tracks = items
    .filter((item) => {
      const singer = (item.artists && item.artists[0] && item.artists[0].name) || "";
      return !name || singer.indexOf(name) >= 0 || item.name.indexOf(name) >= 0;
    })
    .map(toTrack);
  return {
    artist: { id: key, name: name, imageUrl: items.length ? items[0].imageUrl : "" },
    tracks: tracks.slice(0, 30),
    albums: [],
  };
}

/* ------------------------------------------------------------------ */
/* Play, lyric and the library kept on this device                     */
/* ------------------------------------------------------------------ */

const TYPES = {
  mp3: "mp3",
  m4a: "m4a",
  aac: "aac",
  flac: "flac",
  ogg: "ogg",
  wav: "wav",
};

const urlCache = new Map();

async function playUrl(id) {
  const cached = urlCache.get(id);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.url;
  const res = await request("/api/playurl.php?id=" + encodeURIComponent(id), {
    timeout: 15000,
    headers: { referer: BASE + "/song/" + id + ".html", accept: "*/*" },
  });
  const body = (await res.text()).trim();
  if (!/^https?:\/\/\S+$/i.test(body)) {
    throw fail("unavailable", t("这首是合集，没有可以单独播放的音频"));
  }
  urlCache.set(id, { at: Date.now(), url: body });
  return body;
}

export async function stream({ id }) {
  const url = await playUrl(String(id));
  const ext = (url.split("?")[0].match(/\.([a-z0-9]+)$/i) || [])[1] || "mp3";
  const type = TYPES[ext.toLowerCase()] || "mp3";
  return { url: url, type: type };
}

export async function lyrics({ id }) {
  const info = await song(String(id));
  if (!info.lyrics) return { lrc: "" };
  return { lrc: info.lyrics };
}

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

