// MyGo Music plugin — 5nd音乐 (www.5nd.com)
//
// The site is an ASP.NET music site. What the plugin uses:
//   home        GET  /
//   charts      GET  /paihang/            index of charts
//   chart       GET  /paihang/<slug>.htm  66 songs, one page
//   singers     GET  /singer/             recommended singers
//   albums      GET  /album/              recommended albums
//   search      GET  /so/kk_<kw>          songs + albums + singers
//               GET  /so/ss_<kw>[_<n>]    songs only, 20 a page
//               GET  /so/mm_<kw>          albums only
//               GET  /so/si_<kw>          singers only
//   song page   GET  /ting/<id>.html
//   all songs   GET  /all/<id>.htm        every song of a singer
//   singer      GET  /s/<id>.htm
//   singer alb. GET  /singerzj/<id>.htm
//   album       GET  /m/<id>.htm
//   lyrics      GET  /gecilrc/<id>.htm    (fallback)
//   api         GET  /gwapi/page/songs?t=100&_lrc=1&ids=<id>
//                    -> dsong.list[0] = {msongname, msingername, msongpath,
//                       msongpic, malbumvid, mpubdate, mtext (LRC), ...}
//   audio       https://mpge.5nd.com/<msongpath>
//
// Note on audio: mpge.5nd.com sits behind an anti-leech edge. A browser plays
// it, while plain HTTP clients (curl, Go) get 302 to 127.0.0.1:1234. stream()
// therefore hands the app the Referer and User-Agent a browser would send, and
// a cookie from the settings when one is given.

const BASE = "https://www.5nd.com";
const MEDIA = "https://mpge.5nd.com";
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

function manualCookie() {
  return String(host.setting("cookie") || "").trim();
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

async function request(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const headers = Object.assign({}, HEAD, options.headers || {});
  const cookie = manualCookie();
  if (cookie) headers.cookie = cookie;
  const init = { method: options.method || "GET", headers: headers };
  if (options.body != null) init.body = options.body;
  const ms = options.timeout || 10000;
  try {
    return await once(url, init, ms);
  } catch (first) {
    return await once(url, Object.assign({}, init), ms);
  }
}

const pageCache = new Map();

async function page(path) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const res = await request(url);
  const html = await res.text();
  if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
  pageCache.set(url, { at: Date.now(), html: html });
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
  return match ? plain(match[1]) : "";
}

function sized(url) {
  if (!url) return "";
  return decode(url).replace(/^\/\//, "https://").replace(/^http:\/\//i, "https://");
}

/* Every row of every list on the site is an <li> that links its song with
   /ting/<id>.html and, when the page knows it, its singer with /s/<id>.htm. */
function tracksFrom(html, artistName, artistId) {
  const out = [];
  const seen = new Set();
  const blockRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let block;
  while ((block = blockRe.exec(html))) {
    const row = block[1];
    const link = row.match(/href="\/ting\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const id = link[1];
    const name = plain(link[2]);
    if (!id || !name || seen.has(id)) continue;

    const singer = row.match(/href="\/s\/(\d+)\.htm"[^>]*>([\s\S]*?)<\/a>/i);
    let singerName = singer ? plain(singer[2]) : "";
    let title = name;
    // Many rows carry "Song - Artist" in one link instead of a singer link.
    if (!singerName) {
      const dash = name.lastIndexOf(" - ");
      if (dash > 0) {
        title = name.slice(0, dash).trim();
        singerName = name.slice(dash + 3).trim();
      }
    }

    const track = { id: id, name: title };
    if (singerName) {
      const artist = { name: singerName };
      if (singer && singer[1]) artist.id = singer[1];
      track.artists = [artist];
    } else if (artistName) {
      const artist = { name: artistName };
      if (artistId) artist.id = artistId;
      track.artists = [artist];
    }
    out.push(track);
    seen.add(id);
  }
  return out;
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

// Albums: <a href="/m/<id>.htm"><img src="..."></a> … <a href="/m/<id>.htm">Name</a>
function albumCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href="\/m\/(\d+)\.htm"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const id = match[1];
    if (seen.has(id)) continue;
    const tail = html.slice(match.index, match.index + 1400);
    const nameMatch = tail.match(new RegExp('<a[^>]*href="/m/' + id + '\\.htm"[^>]*>([^<]{1,120})</a>'));
    let name = nameMatch ? decode(nameMatch[1]).trim() : "";
    if (!name) {
      const titleMatch = tail.match(/title="([^"]{1,120})"/);
      if (titleMatch) name = decode(titleMatch[1]).replace(/^专辑[：:]/, "").trim();
    }
    name = name.replace(/^《([\s\S]+)》$/, "$1").trim();
    if (!name) continue;
    out.push({ id: id, name: name, imageUrl: sized(match[2]) });
    seen.add(id);
  }
  return out;
}

// Singers: <a href="/s|/all/<id>.htm"><img …><em>Name</em></a>, or a card with
// the name under the picture.
function artistCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href="\/(?:s|all)\/(\d+)\.htm"[^>]*>\s*<img[^>]*src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = re.exec(html))) {
    const id = match[1];
    if (seen.has(id)) continue;
    const tail = html.slice(match.index, match.index + 900);
    let name = "";
    const em = tail.match(/<em>([^<]{1,60})<\/em>/);
    if (em) name = em[1];
    if (!name) {
      const h4 = tail.match(/<h4>\s*<a[^>]*>([^<]{1,60})<\/a>/);
      if (h4) name = h4[1];
    }
    if (!name) {
      const btn = tail.match(/<div class="albumBtn">\s*<a[^>]*>([^<]{1,60})<\/a>/);
      if (btn) name = btn[1];
    }
    if (!name) {
      const title = tail.match(/title="歌手[：:]\s*([^"<]{1,40}?)\s*(?:歌手信息|全部歌曲|的图片)?/);
      if (title) name = title[1];
    }
    name = plain(name);
    name = name.replace(/^《([\s\S]+)》$/, "$1").trim();
    if (!name) continue;
    out.push({ id: id, name: name, imageUrl: sized(match[2]) });
    seen.add(id);
  }
  return out;
}

function hasNextPage(html, current) {
  return new RegExp('href="[^"]*_' + (current + 1) + '"').test(html) || new RegExp('href="[^"]*/' + (current + 1) + '"').test(html);
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
/* The song API: name, singer, mp3 path and LRC in one request          */
/* ------------------------------------------------------------------ */

const infoCache = new Map();

async function infoFromApi(id) {
  const res = await request("/gwapi/page/songs?t=100&_lrc=1&ids=" + encodeURIComponent(id), {
    timeout: 12000,
    headers: {
      referer: BASE + "/ting/" + id + ".html",
      "x-requested-with": "XMLHttpRequest",
      accept: "application/json, text/plain, */*",
    },
  });
  const body = await res.text();
  const data = JSON.parse(body);
  const list = data && data.dsong && data.dsong.list;
  if (!list || !list.length || !list[0].msongpath) throw fail("unavailable", "no song in api");
  return list[0];
}

/* Every song page carries the mp3 path on the player element:
     <div id="kuPlayer" data-play="2014/2014-12-29/65396/1.mp3">
   so when the API is out of reach the page still answers, without the LRC
   header that only the API has. */
async function infoFromPage(id) {
  const html = await page("/ting/" + id + ".html");
  const play =
    html.match(/id="kuPlayer"[^>]*data-play="([^"]+)"/i) || html.match(/data-play="([^"]+\.mp3)"/i);
  if (!play) throw fail("unavailable", t("这首歌暂时播放不了"));
  const info = { msongvid: id, msongpath: decode(play[1]) };
  const singer = html.match(/歌手[：:]\s*<a[^>]*href="\/s\/(\d+)[^"]*"[^>]*>([^<]+)</i);
  if (singer) {
    info.msingervid = singer[1];
    info.msingername = plain(singer[2]);
  }
  const album = html.match(/所属专辑[：:]\s*<a[^>]*href="\/m\/(\d+)[^"]*"[^>]*>([^<]+)</i);
  if (album) {
    info.malbumvid = album[1];
    info.malbumname = plain(album[2]);
  }
  return info;
}

async function songInfo(id) {
  const cached = infoCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;

  let data = null;
  try {
    data = await infoFromApi(id);
  } catch (error) {
    console.log("[5nd] api failed for " + id + ": " + (error && error.message));
  }
  if (!data) data = await infoFromPage(id);

  infoCache.set(id, { at: Date.now(), data: data });
  return data;
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

const TRACK_SECTIONS = {
  "最新歌曲推荐": 20,
  "推荐流行歌曲": 20,
  "好听的歌曲": 20,
  "最新网络歌曲": 20,
  "伤感歌曲": 20,
  "影视歌曲": 20,
  "DJ舞曲": 20,
  "最新歌曲": 20,
};

const ALBUM_SECTIONS = { "歌曲首发": true, "专辑推荐": true };

function chartLinks() {
  return [
    { title: "最热歌曲排行榜", page: "chart/liuxinggequ" },
    { title: "最新歌曲", page: "chart/xinge" },
    { title: "好听的歌", page: "chart/tuijiangequ" },
    { title: "经典老歌", page: "chart/jingdian" },
    { title: "伤感歌曲", page: "chart/107" },
    { title: "全部榜单", page: "charts" },
    { title: t("歌手"), page: "singers" },
    { title: t("专辑"), page: "albums" },
  ];
}

export async function home() {
  let html;
  try {
    html = await page("/");
  } catch (error) {
    console.log("[5nd] home failed:", error && error.message);
    return {
      title: "5nd音乐",
      sections: [{ title: t("榜单"), links: chartLinks() }],
    };
  }

  const heads = [];
  const headRe = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let head;
  while ((head = headRe.exec(html))) {
    heads.push({ title: plain(head[1]), start: headRe.lastIndex, tag: head.index });
  }

  const sections = [];
  const seen = new Set();
  for (let i = 0; i < heads.length; i++) {
    const title = heads[i].title;
    if (!title) continue;
    const end = i + 1 < heads.length ? heads[i + 1].tag : Math.min(html.length, heads[i].start + 40000);
    const body = html.slice(heads[i].start, end);

    if (TRACK_SECTIONS[title]) {
      const fresh = tracksFrom(body).filter((track) => !seen.has(track.id));
      for (const track of fresh) seen.add(track.id);
      if (!fresh.length) continue;
      remember(fresh);
      sections.push({ title: title, tracks: fresh.slice(0, TRACK_SECTIONS[title]) });
      continue;
    }
    if (ALBUM_SECTIONS[title]) {
      const albums = albumCards(body);
      if (albums.length) sections.push({ title: title, albums: albums });
      continue;
    }
    if (title === "热门歌手") {
      const artists = artistCards(body);
      if (artists.length) sections.push({ title: title, artists: artists });
    }
  }

  sections.push({ title: t("榜单"), links: chartLinks() });

  return {
    title: "5nd音乐",
    subtitle: pick(html, /歌曲更新：\s*([\d-]+)/),
    sections: sections,
  };
}

/* ------------------------------------------------------------------ */
/* Pages of the site's own                                             */
/* ------------------------------------------------------------------ */

async function chartPage(slug) {
  const html = await page("/paihang/" + slug + ".htm");
  const indexHtml = await page("/paihang/").catch(() => "");
  const known = new RegExp('href="/paihang/' + slug + '\\.htm"[^>]*>([^<]{1,40})<', "i").exec(indexHtml);
  const title = known ? plain(known[1]) : pick(html, /<h1>([\s\S]*?)<\/h1>/);
  const tracks = uniqueTracks(tracksFrom(html));
  remember(tracks);
  return {
    title: title || slug,
    subtitle: "",
    sections: tracks.length ? [{ title: title || slug, tracks: tracks }] : [],
  };
}

async function chartsPage() {
  const html = await page("/paihang/");
  const links = [];
  const seen = new Set();
  const re = /href="\/paihang\/([a-z0-9]+)\.htm"[^>]*>([^<]{1,40})</gi;
  let match;
  while ((match = re.exec(html))) {
    if (seen.has(match[1])) continue;
    const title = plain(match[2]);
    if (!title) continue;
    seen.add(match[1]);
    links.push({ title: title, page: "chart/" + match[1] });
  }
  return { title: t("榜单"), subtitle: "", sections: [{ title: t("榜单"), links: links }] };
}

async function singIndexPage() {
  const html = await page("/singer/");
  const artists = artistCards(html);
  return {
    title: t("歌手"),
    subtitle: pick(html, /共\s*(\d+)\s*位歌手/),
    sections: artists.length ? [{ title: t("歌手"), artists: artists }] : [],
  };
}

async function albumIndexPage() {
  const html = await page("/album/");
  const albums = albumCards(html);
  return {
    title: t("专辑"),
    subtitle: "",
    sections: albums.length ? [{ title: t("专辑"), albums: albums }] : [],
  };
}

export async function browse({ page: name }) {
  const parts = String(name || "").split("/");
  if (parts[0] === "chart" && parts[1]) return chartPage(parts[1]);
  if (parts[0] === "charts") return chartsPage();
  if (parts[0] === "singers") return singIndexPage();
  if (parts[0] === "albums") return albumIndexPage();
  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

function searchPath(kind, query, number) {
  const prefix = kind === "albums" ? "mm" : kind === "artists" ? "si" : kind === "all" ? "kk" : "ss";
  const base = "/so/" + prefix + "_" + encodeURIComponent(query);
  return number > 1 ? base + "_" + number : base;
}

export async function search({ query, kind, offset }) {
  const text = String(query || "").trim();
  const key = kind || "tracks";
  if (!text) {
    if (key === "albums") return { albums: [], more: false };
    if (key === "artists") return { artists: [], more: false };
    return { tracks: [], more: false };
  }

  if (key === "albums") {
    const html = await page(searchPath("albums", text, 1));
    return { albums: albumCards(html), more: false };
  }
  if (key === "artists") {
    const html = await page(searchPath("artists", text, 1));
    return { artists: artistCards(html), more: false };
  }
  if (key !== "tracks") return { tracks: [], more: false };

  const number = offset > 0 ? Math.floor(Number(offset) / 20) + 1 : 1;
  const html = await page(searchPath("tracks", text, number));
  const tracks = uniqueTracks(tracksFrom(html));
  remember(tracks);
  const more = html.indexOf('class="pages"') >= 0 && hasNextPage(html, number);
  return { tracks: tracks, more: more };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const html = await page(searchPath("tracks", text, 1));
    const names = [];
    for (const track of uniqueTracks(tracksFrom(html))) {
      const label = track.artists && track.artists.length ? track.artists[0].name + " - " + track.name : track.name;
      names.push(label);
    }
    return names.slice(0, 10);
  } catch (error) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Albums, artists, lyrics, audio                                      */
/* ------------------------------------------------------------------ */

export async function album({ id }) {
  const html = await page("/m/" + id + ".htm");
  let name = pick(html, /<h1>([\s\S]*?)<\/h1>/) || id;
  name = name.replace(/^《([\s\S]+)》$/, "$1").trim();

  const artistMatch = html.match(/艺人：<\/span>\s*<span>\s*<a[^>]*href="\/s\/(\d+)\.htm"[^>]*>([\s\S]*?)<\/a>/);
  const artist = artistMatch ? { id: artistMatch[1], name: plain(artistMatch[2]) } : null;

  const tracks = uniqueTracks(tracksFrom(html, artist ? artist.name : "", artist ? artist.id : ""));
  remember(tracks);

  const album = {
    id: id,
    name: name,
    imageUrl: sized(pick(html, /<div class="songAboutPic[^"]*"[\s\S]{0,400}?<img[^>]*src="([^"]+)"/)),
    description: plain(pick(html, /<div class="albumAbout[\s\S]{0,800}?<p>([\s\S]*?)<\/p>/)),
  };
  if (artist) album.artists = [artist];
  const released = pick(html, /发行时间：<\/span>\s*<span>([\d-]+)/);
  if (released) album.released = released;
  album.trackCount = tracks.length;
  album.saved = load("savedAlbums", []).indexOf(id) >= 0;

  const objects = load("albumObjects", {});
  objects[id] = album;
  save("albumObjects", objects);

  return { album: album, tracks: tracks };
}

async function artistByName(name) {
  const html = await page(searchPath("tracks", name, 1));
  const tracks = uniqueTracks(tracksFrom(html)).filter((track) => {
    const people = track.artists || [];
    return people.some((person) => person.name === name);
  });
  remember(tracks);
  return {
    artist: { id: "n:" + name, name: name },
    tracks: tracks,
    albums: [],
  };
}

export async function artist({ id }) {
  if (String(id).indexOf("n:") === 0) return artistByName(String(id).slice(2));

  const profile = await page("/s/" + id + ".htm");
  const name = pick(profile, /<h1>([\s\S]*?)<\/h1>/) || String(id);
  const imageUrl = sized(pick(profile, /<div class="singerAboutPic">\s*<img[^>]*src="([^"]+)"/));

  const all = await page("/all/" + id + ".htm").catch(() => profile);
  const tracks = uniqueTracks(tracksFrom(all, name, String(id)));
  remember(tracks);

  const albumsHtml = await page("/singerzj/" + id + ".htm").catch(() => "");
  let albums = albumCards(albumsHtml);
  if (!albums.length) albums = albumCards(profile);

  return {
    artist: { id: String(id), name: name, imageUrl: imageUrl },
    tracks: tracks,
    albums: albums,
  };
}

export async function lyrics({ id }) {
  try {
    const info = await deadline(songInfo(id), 8000, "song " + id).catch(() => null);
    if (info && info.mtext) return { lrc: String(info.mtext).replace(/\r\n/g, "\n").trim() };
  } catch (error) {
    /* fall through to the lyric page */
  }
  try {
    const html = await page("/gecilrc/" + id + ".htm");
    const block = html.match(/<li>([\s\S]*?\[00:[\s\S]*?)<\/li>/);
    if (!block) return { lrc: "" };
    const lrc = plainLines(block[1].replace(/<br\s*\/?>/gi, "\n"));
    const from = lrc.search(/\[\d{1,2}:\d{1,2}/);
    return { lrc: from > 0 ? lrc.slice(from) : lrc };
  } catch (error) {
    return { lrc: "" };
  }
}

function plainLines(text) {
  return decode(text.replace(/<[^>]*>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.length > 0)
    .join("\n");
}

const playableCache = new Map();

/* mpge.5nd.com sits behind an edge that lets a browser in and turns most
   other clients away (302 to 127.0.0.1:1234, sometimes a 502). Asking for
   one byte first tells us which of the two we are on this machine, so the
   listener gets a sentence instead of the app's "HTTP 502" line. */
async function playable(url) {
  const cached = playableCache.get(url);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.ok;
  let ok = false;
  try {
    const res = await once(
      url,
      {
        headers: Object.assign({}, HEAD, {
          referer: BASE + "/",
          range: "bytes=0-1",
        }),
      },
      6000
    );
    ok = res.status === 206 || res.status === 200;
    if (ok && res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {});
  } catch (error) {
    ok = false;
  }
  playableCache.set(url, { at: Date.now(), ok: ok });
  return ok;
}

const openedTabs = new Map();

// 整张专辑连播时，一首歌一个标签页会刷屏，所以 45 秒内同一首歌只开一次
function openInBrowser(id, page) {
  const key = String(id);
  const last = openedTabs.get(key);
  if (last && Date.now() - last < 45000) return true;
  try {
    if (typeof host.openURL !== "function") return false;
    host.openURL(page);
    openedTabs.set(key, Date.now());
    return true;
  } catch (error) {
    console.log("[5nd] openURL failed: " + (error && error.message));
    return false;
  }
}

export async function stream({ id }) {
  const info = await songInfo(id);
  const headers = {
    referer: BASE + "/ting/" + id + ".html",
    "user-agent": UA,
  };
  const cookie = manualCookie();
  if (cookie) headers.cookie = cookie;
  const url = MEDIA + "/" + String(info.msongpath).replace(/^\/+/, "");

  if (!(await playable(url))) {
    const page = BASE + "/ting/" + id + ".html";
    // 默认就走浏览器兜底：5nd 的音频域名只认浏览器的 TLS 指纹，Go 客户端怎么带
    // Referer / Cookie 都会被 302 到 127.0.0.1:1234，所以不在设置里动开关也能播。
    const preference = String(host.setting("browser") || "").trim();
    if (preference !== "off") {
      const opened = openInBrowser(id, page);
      if (opened) {
        throw fail("unavailable", t("5nd 只放行浏览器，已在浏览器打开这首歌"));
      }
      throw fail("unavailable", t("5nd 只放行浏览器，App 内播不了，这台机器也没法打开浏览器"));
    }
    throw fail("unavailable", t("5nd 只放行浏览器，App 内播不了。插件设置里把「音频被拒时用浏览器打开」调回默认即可自动开浏览器"));
  }

  return { url: url, type: "mp3", headers: headers };
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
    out.push({
      id: album.id,
      name: album.name,
      imageUrl: album.imageUrl,
      artists: album.artists,
      trackCount: album.trackCount,
      saved: true,
    });
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
  if (key === "cookie") console.log(value ? "cookie set by hand" : "cookie cleared");
}
