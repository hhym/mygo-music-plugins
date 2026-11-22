// MyGo Music plugin — 世纪音乐网 (www.4c44.com)
//
// The site is a plain PHP music site:
//   search     GET  /so.php?wd=<keyword>
//   charts     GET  /list/{new,top,rise,original}[/<page>].html
//   song page  GET  /mp3/<id>.html
//   singer     GET  /singer/<id>[/<page>].html
//   albums     GET  /album/<id>.html
//   playlists  GET  /playlist/<id>[/<page>].html
//   audio      POST /js/play.php  id=<id>&type=music&key=YYYYMMDDHHmm+"4c44"
//              -> {msg:1, title, pic, url, lrc}
//
// Pages sit behind a one-checkbox "I'm not a robot" page that keeps a session
// cookie for about an hour; page() passes it once and keeps the cookie.

const BASE = "https://www.4c44.com";
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

/* ------------------------------------------------------------------ */
/* Session, cookies and the human-check page                           */
/* ------------------------------------------------------------------ */

const jar = Object.assign({}, host.storage.get("jar") || {});

function cookieHeader() {
  const merged = new Map();
  for (const name of Object.keys(jar)) merged.set(name, jar[name]);
  const manual = String(host.setting("cookie") || "").trim();
  if (manual) {
    for (const part of manual.split(";")) {
      const piece = part.trim();
      const eq = piece.indexOf("=");
      if (eq > 0) merged.set(piece.slice(0, eq).trim(), piece.slice(eq + 1).trim());
    }
  }
  const pairs = [];
  merged.forEach((value, name) => pairs.push(name + "=" + value));
  return pairs.join("; ");
}

function absorb(res) {
  let raw = "";
  try {
    raw = res.headers.get("set-cookie") || "";
  } catch (error) {
    return;
  }
  let changed = false;
  const re = /(PHPSESSID|server_name_session)=([^;,\s]+)/g;
  let match;
  while ((match = re.exec(raw))) {
    if (jar[match[1]] !== match[2]) {
      jar[match[1]] = match[2];
      changed = true;
    }
  }
  if (changed) host.storage.set("jar", jar);
}

async function request(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const headers = Object.assign({}, HEAD, options.headers || {});
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;
  const init = { method: options.method || "GET", headers };
  if (options.body != null) init.body = options.body;
  if (options.redirect) init.redirect = options.redirect;
  const res = await fetch(url, init);
  absorb(res);
  return res;
}

function gateToken(html) {
  if (!html || html.indexOf("人机验证") < 0) return null;
  const match = html.match(/name="csrf_token"\s+value="([^"]+)"/);
  return match ? match[1] : null;
}

async function passGate(url, token) {
  const options = {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: url,
      origin: BASE,
    },
    body: "csrf_token=" + encodeURIComponent(token) + "&human_check=on",
  };
  let res;
  try {
    // The 302 that follows the check must not be followed here: a redirect
    // could hand out a fresh, still-unverified session cookie.
    res = await request(url, Object.assign({ redirect: "manual" }, options));
  } catch (error) {
    res = await request(url, options);
  }
  try {
    await res.text();
  } catch (error) {
    /* the redirect's body is not needed */
  }
}

const pageCache = new Map();

async function page(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (!options.fresh && cached && Date.now() - cached.at < 60 * 1000) return cached.html;

  let res = await request(url);
  let html = await res.text();
  let token = gateToken(html);
  if (token) {
    await passGate(url, token);
    res = await request(url);
    html = await res.text();
    token = gateToken(html);
    if (token) {
      throw fail(
        "setup",
        "站点的人机校验没通过，请在插件设置里填入浏览器 Cookie。"
      );
    }
  }
  if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
  pageCache.set(url, { at: Date.now(), html });
  return html;
}

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
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

function plain(html) {
  if (!html) return "";
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function pick(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : "";
}

function sized(url) {
  if (!url) return "";
  return url
    .replace(/^http:\/\//i, "https://")
    .replace(/\?param=\d+y\d+/, "?param={size}y{size}");
}

function splitLabel(label, artistLast) {
  const index = artistLast ? label.lastIndexOf(" - ") : label.indexOf(" - ");
  if (index <= 0) return { artist: "", name: label };
  if (artistLast) {
    return { artist: label.slice(index + 3).trim(), name: label.slice(0, index).trim() };
  }
  return { artist: label.slice(0, index).trim(), name: label.slice(index + 3).trim() };
}

function toTrack(id, label, artistLast) {
  const parts = splitLabel(label, artistLast);
  const track = { id, name: parts.name || label };
  if (parts.artist) track.artists = [{ id: "n:" + parts.artist, name: parts.artist }];
  return track;
}

function tracksIn(html, artistLast) {
  const list = [];
  const re = /<div class="name">\s*<a\s+href="\/mp3\/([a-z0-9]+)\.html"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const label = plain(match[2]);
    if (!match[1] || !label) continue;
    list.push(toTrack(match[1], label, artistLast));
  }
  return list;
}

function uniqueTracks(tracks) {
  const seen = new Set();
  const out = [];
  for (const track of tracks) {
    if (!track || !track.id || seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
  }
  return out;
}

// Cards of playlists, albums or singers: a picture, then a titled link.
function cardsIn(html, kind) {
  const re = new RegExp(
    '<li>\\s*<div class="pic">\\s*<a href="/' +
      kind +
      '/([a-z0-9]+)\\.html"[^>]*>\\s*<img[^>]+src="([^"]+)"[\\s\\S]{0,400}?<div class="name">\\s*<a [^>]*title="([^"]+)"',
    "gi"
  );
  const out = [];
  let match;
  while ((match = re.exec(html))) {
    const name = decode(match[3]);
    if (!match[1] || !name) continue;
    out.push({ id: match[1], name: name, imageUrl: sized(match[2]) });
  }
  return out;
}

function hasNextPage(html, current) {
  return new RegExp('href="[^"]*/' + (current + 1) + '\\.html"').test(html);
}

function headOfPage(html) {
  const block = html.split('<div class="singer_info')[1] || "";
  return {
    name: plain(pick(block, /<h1>([\s\S]*?)<\/h1>/)),
    imageUrl: sized(pick(block, /<div class="pic">\s*<img[^>]+src="([^"]+)"/)),
    description: plain(pick(block, /<div class="info">([\s\S]*?)<\/div>/)),
  };
}

/* Tracks the listener has seen, so liked songs and history can be rebuilt
   from their ids alone. */
const index = host.storage.get("trackIndex") || {};
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

/* ------------------------------------------------------------------ */
/* Audio: POST /js/play.php with a key made from the current minute     */
/* ------------------------------------------------------------------ */

function pad2(number) {
  return number < 10 ? "0" + number : String(number);
}

function minuteKey(offset) {
  const when = new Date(Date.now() + (offset || 0) * 60 * 1000);
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(when);
    const value = (type) => {
      const part = parts.find((item) => item.type === type);
      return part ? part.value : "";
    };
    return value("year") + value("month") + value("day") + value("hour") + value("minute");
  } catch (error) {
    const local = new Date(when.getTime() + 8 * 3600 * 1000);
    return (
      local.getUTCFullYear() +
      pad2(local.getUTCMonth() + 1) +
      pad2(local.getUTCDate()) +
      pad2(local.getUTCHours()) +
      pad2(local.getUTCMinutes())
    );
  }
}

const playCache = new Map();

async function playInfo(id) {
  const cached = playCache.get(id);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;

  for (const offset of [0, -1, 1, -2, 2]) {
    const key = minuteKey(offset) + "4c44";
    const res = await request("/js/play.php", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        referer: BASE + "/mp3/" + id + ".html",
        "x-requested-with": "XMLHttpRequest",
      },
      body: "id=" + encodeURIComponent(id) + "&type=music&key=" + key,
    });
    const body = await res.text();
    try {
      const data = JSON.parse(body);
      if (data && data.msg === 1 && data.url) {
        playCache.set(id, { at: Date.now(), data: data });
        return data;
      }
    } catch (error) {
      /* an empty body means the key was off by a minute; try the next one */
    }
  }
  throw fail("unavailable", "这首歌暂时播不了。");
}

/* ------------------------------------------------------------------ */
/* Home and pages of the site's own                                    */
/* ------------------------------------------------------------------ */

const CHARTS = {
  new: { path: "/list/new", title: "New songs" },
  top: { path: "/list/top", title: "Top chart" },
  rise: { path: "/list/rise", title: "Rising" },
  original: { path: "/list/original", title: "Original" },
};

export async function home() {
  const html = await page("/");
  const rows = html.split('<div class="layui-row lkbj">').slice(1);
  const rowWith = (word) => {
    for (const row of rows) {
      if (plain(pick(row, /<h1>([\s\S]*?)<\/h1>/)).indexOf(word) >= 0) return row;
    }
    return "";
  };

  const fresh = tracksIn(rowWith("新歌抢先试听") || html);
  const playlists = cardsIn(rowWith("热门歌单") || "", "playlist");
  const artists = cardsIn(rowWith("热门歌手") || "", "singer");

  remember(fresh);

  const sections = [];
  if (fresh.length) {
    sections.push({
      title: "新歌速递",
      subtitle: plain(pick(html, /更新时间：\s*<span>([^<]+)<\/span>/)),
      tracks: fresh,
      morePage: "chart/new",
    });
  }
  if (playlists.length) sections.push({ title: "热门歌单", playlists: playlists });
  if (artists.length) sections.push({ title: "热门歌手", artists: artists });
  sections.push({
    title: "榜单",
    links: [
      { title: "新歌", page: "chart/new" },
      { title: "总榜", page: "chart/top" },
      { title: "飙升榜", page: "chart/rise" },
      { title: "原创榜", page: "chart/original" },
      { title: "全部歌单", page: "playlists" },
      { title: "新专辑", page: "albums" },
      { title: "歌手", page: "singers" },
    ],
  });

  return { title: "世纪音乐", subtitle: "免费 MP3 与歌词，榜单每日更新", sections: sections };
}

async function chartPage(key, number) {
  const chart = CHARTS[key];
  if (!chart) throw fail("unavailable", "没有这个榜单。");
  const path = number > 1 ? chart.path + "/" + number + ".html" : chart.path + ".html";
  const html = await page(path);
  const tracks = uniqueTracks(tracksIn(html));
  remember(tracks);

  const sections = [{ title: t(chart.title), tracks: tracks }];
  const links = [];
  if (number > 1) links.push({ title: "上一页", page: "chart/" + key + "/" + (number - 1) });
  if (hasNextPage(html, number)) links.push({ title: "下一页", page: "chart/" + key + "/" + (number + 1) });
  if (links.length) sections.push({ title: "", links: links });

  return {
    title: t(chart.title),
    subtitle: plain(pick(html, /更新时间：\s*<span>([^<]+)<\/span>/)),
    sections: sections,
  };
}

function indexPage(path, kind, titleKey, unitKey, pageId, number) {
  return page(path).then((html) => {
    const items = cardsIn(html, kind);
    const total = Number(pick(html, /共有：?\s*<span>(\d+)<\/span>/) || 0);
    const sections = [{ title: t(titleKey), [kind === "album" ? "albums" : kind === "singer" ? "artists" : "playlists"]: items }];
    const links = [];
    if (number > 1) links.push({ title: "上一页", page: pageId + "/" + (number - 1) });
    if (hasNextPage(html, number)) links.push({ title: "下一页", page: pageId + "/" + (number + 1) });
    if (links.length) sections.push({ title: "", links: links });
    return {
      title: t(titleKey),
      subtitle: total ? total + " " + t(unitKey) : "",
      sections: sections,
    };
  });
}

export async function browse({ page: name }) {
  const parts = String(name || "").split("/");
  let number = 1;
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) number = Math.max(1, Number(last));
  if (parts[0] === "chart") return chartPage(parts[1], number);
  if (parts[0] === "playlists") {
    return indexPage(
      number > 1 ? "/playlists/index/" + number + ".html" : "/playlists/index.html",
      "playlist",
      "Playlists",
      "playlists",
      "playlists",
      number
    );
  }
  if (parts[0] === "albums") {
    return indexPage(
      number > 1 ? "/albumlist/index/" + number + ".html" : "/albumlist/index.html",
      "album",
      "New albums",
      "albums",
      "albums",
      number
    );
  }
  if (parts[0] === "singers") {
    return indexPage(
      number > 1 ? "/singerlist/huayu/girl/index/" + number + ".html" : "/singerlist/huayu/girl/index.html",
      "singer",
      "Singers",
      "singers",
      "singers",
      number
    );
  }
  throw fail("unavailable", "没有这个页面。");
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const searchCache = new Map();

async function searchPage(query) {
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const html = await page("/so.php?wd=" + encodeURIComponent(query));
  searchCache.set(query, { at: Date.now(), html: html });
  return html;
}

export async function search({ query, kind, offset }) {
  const key = kind || "tracks";
  const text = String(query || "").trim();
  if (!text) return { [key]: [], more: false };
  if (key !== "tracks") return { [key]: [], more: false };
  if (offset > 0) return { tracks: [], more: false };

  const html = await searchPage(text);
  const tracks = uniqueTracks(tracksIn(html));
  remember(tracks);
  return { tracks: tracks, more: false };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const html = await searchPage(text);
    const names = [];
    for (const track of uniqueTracks(tracksIn(html))) {
      const label = track.artists && track.artists.length ? track.artists[0].name + " - " + track.name : track.name;
      if (label.toLowerCase().indexOf(text.toLowerCase()) >= 0) names.push(label);
    }
    return names.slice(0, 10);
  } catch (error) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Songs: albums, artists, playlists, lyrics, audio                    */
/* ------------------------------------------------------------------ */

export async function album({ id }) {
  const html = await page("/album/" + id + ".html");
  const head = headOfPage(html);
  const tracks = uniqueTracks(tracksIn(html, true));
  remember(tracks);

  const album = {
    id: id,
    name: head.name || id,
    imageUrl: head.imageUrl,
    description: head.description,
  };
  const person = tracks[0] && tracks[0].artists && tracks[0].artists[0];
  if (person) album.artists = [person];
  const released = pick(html, /发行时间：\s*<span>\s*([\d-]+)/);
  if (released) album.released = released;
  album.saved = load("savedAlbums", []).indexOf(id) >= 0;

  const objects = load("albumObjects", {});
  objects[id] = album;
  save("albumObjects", objects);

  return { album: album, tracks: tracks };
}

export async function artist({ id }) {
  if (String(id).indexOf("n:") === 0) {
    const name = String(id).slice(2);
    const html = await searchPage(name);
    const tracks = uniqueTracks(tracksIn(html)).filter((track) => {
      const people = track.artists || [];
      return people.some((person) => person.name === name);
    });
    remember(tracks);
    return { artist: { id: id, name: name }, tracks: tracks, albums: [] };
  }

  const first = await page("/singer/" + id + ".html");
  const head = headOfPage(first);
  const all = tracksIn(first);
  const seen = new Set(all.map((track) => track.id));
  let last = first;
  for (let number = 2; number <= 12; number++) {
    last = await page("/singer/" + id + "/" + number + ".html");
    const more = tracksIn(last);
    const fresh = more.filter((track) => !seen.has(track.id));
    // Some of the site's paging links serve page 1 again; stop when nothing is new.
    if (!fresh.length) break;
    for (const track of fresh) {
      seen.add(track.id);
      all.push(track);
    }
  }
  const tracks = uniqueTracks(all);
  remember(tracks);

  const albums = [];
  for (let number = 1; number <= 4; number++) {
    const html = await page(number === 1 ? "/singer/album/" + id + ".html" : "/singer/album/" + id + "/" + number + ".html");
    const cards = cardsIn(html, "album");
    for (const card of cards) albums.push(card);
    if (!hasNextPage(html, number)) break;
  }

  return {
    artist: { id: id, name: head.name || id, imageUrl: head.imageUrl, description: head.description },
    tracks: tracks,
    albums: albums,
  };
}

export async function playlist({ id }) {
  const all = [];
  const seen = new Set();
  let last = "";
  for (let number = 1; number <= 8; number++) {
    last = await page(number === 1 ? "/playlist/" + id + ".html" : "/playlist/" + id + "/" + number + ".html");
    const tracks = tracksIn(last);
    const fresh = tracks.filter((track) => !seen.has(track.id));
    for (const track of fresh) {
      seen.add(track.id);
      all.push(track);
    }
    if (!hasNextPage(last, number) || !fresh.length) break;
  }
  const tracks = uniqueTracks(all);
  remember(tracks);

  const head = headOfPage(last);
  const playlist = {
    id: id,
    name: head.name || id,
    description: head.description,
    imageUrl: head.imageUrl,
    trackCount: Number(pick(last, /共有<span>(\d+)<\/span>/) || tracks.length) || tracks.length,
    saved: load("savedPlaylists", []).indexOf(id) >= 0,
    tracks: tracks,
  };

  const objects = load("playlistObjects", {});
  objects[id] = { id: playlist.id, name: playlist.name, imageUrl: playlist.imageUrl, trackCount: playlist.trackCount };
  save("playlistObjects", objects);

  return playlist;
}

export async function playlists() {
  const html = await page("/playlists/index.html");
  const cards = cardsIn(html, "playlist");
  const objects = load("playlistObjects", {});
  for (const card of cards) {
    if (!objects[card.id]) objects[card.id] = card;
  }
  save("playlistObjects", objects);

  const savedIds = load("savedPlaylists", []);
  return savedIds.map((id) => {
    const item = objects[id] || { id: id, name: id };
    return { id: item.id, name: item.name, imageUrl: item.imageUrl, trackCount: item.trackCount };
  });
}

export function savePlaylist({ id, on }) {
  const saved = new Set(load("savedPlaylists", []));
  if (on) saved.add(id);
  else saved.delete(id);
  save("savedPlaylists", [...saved]);
}

export async function lyrics({ id }) {
  try {
    const data = await playInfo(id);
    return { lrc: data.lrc || "" };
  } catch (error) {
    return { lrc: "" };
  }
}

export async function stream({ id }) {
  const data = await playInfo(id);
  return { url: data.url.replace(/^http:\/\//i, "https://"), type: "m4a" };
}

/* ------------------------------------------------------------------ */
/* Library kept on this device                                         */
/* ------------------------------------------------------------------ */

function trackById(id) {
  if (index[id]) return index[id];
  const saved = load("likedTracks", {});
  return saved[id] || { id: id, name: id };
}

export function recent() {
  return load("recent", [])
    .map(trackById)
    .filter(Boolean)
    .slice(0, 10);
}

export function played({ id }) {
  if (!id) return;
  const ids = load("recent", []).filter((item) => item !== id);
  ids.unshift(id);
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
  for (const id of ids || []) out[id] = set.has(id);
  return out;
}

export function like({ id, on }) {
  const set = new Set(load("liked", []));
  if (on) {
    set.add(id);
    if (index[id]) {
      const saved = load("likedTracks", {});
      saved[id] = index[id];
      save("likedTracks", saved);
    }
  } else {
    set.delete(id);
  }
  save("liked", [...set]);
}

export function savedAlbums() {
  const ids = load("savedAlbums", []);
  const objects = load("albumObjects", {});
  const out = [];
  for (const id of ids) {
    const album = objects[id] || { id: id, name: id };
    out.push({ id: album.id, name: album.name, imageUrl: album.imageUrl, artists: album.artists, saved: true });
  }
  return { albums: out, more: false };
}

export function saveAlbum({ id, on }) {
  const saved = new Set(load("savedAlbums", []));
  if (on) saved.add(id);
  else saved.delete(id);
  save("savedAlbums", [...saved]);
}

export function setSetting({ key, value }) {
  if (key === "cookie") {
    for (const name of Object.keys(jar)) delete jar[name];
    host.storage.set("jar", jar);
    console.log(value ? "cookie set by hand" : "cookie cleared");
  }
}
