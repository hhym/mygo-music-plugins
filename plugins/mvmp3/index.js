// 无名音乐网（mvmp3.com）— MyGo Music 插件
//
// 站点本身没有公开 API，插件的做法是读它的网页列表（搜索页 /so.php、榜单页、
// 专辑页、歌手页、歌单页），音频和歌词则来自播放接口 /style/js/play.php。
//
// 站点的网页有一道人机验证（勾选“我不是人机”），验证状态跟会话 Cookie 绑定。
// 插件的 fetch 不会自动保存 Cookie，所以这里自己记 PHPSESSID 和
// server_name_session：遇到验证页就取出 csrf_token 提交一次，再带着同一组
// Cookie 重新请求。验证状态站点声称保持 1 小时。

const BASE = "https://www.mvmp3.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PAGE_TTL = 2 * 60 * 1000; // 网页缓存的存活时间
const SEARCH_PAGE_SIZE = 30; // 搜索结果每页 30 首
const PLAYLIST_PAGE_SIZE = 10; // 歌单每页 10 首

const t = (text) => host.t(text);
const CHECK_FAILED =
  "无名音乐网的人机验证没通过。请先在浏览器打开 www.mvmp3.com 勾选“我不是人机”，或在插件设置里粘贴浏览器的 Cookie。";

// An error with one of the codes the app knows: signIn, setup, unavailable,
// unsupported. Anything else shows its message.
function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

// ---------------------------------------------------------------------------
// Storage

function stored(key, fallback) {
  const value = host.storage.get(key);
  return value === undefined || value === null ? fallback : value;
}

function keep(key, value) {
  host.storage.set(key, value);
}

// The site's HTML pages and the audio API, with the session cookie the robot
// check leaves behind.

let cookie = stored("cookie", "");

function manualCookie() {
  try {
    return ((host.setting && host.setting("cookie")) || "").trim();
  } catch (error) {
    return "";
  }
}

function mergeSetCookie(header) {
  if (!header) return;
  const jar = {};
  for (const piece of cookie.split("; ")) {
    const i = piece.indexOf("=");
    if (i > 0) jar[piece.slice(0, i)] = piece.slice(i + 1);
  }
  // "PHPSESSID=a; path=/, server_name_session=b; Max-Age=..." — split only
  // before a name, so a date's comma stays where it is.
  for (const piece of header.split(/,\s*(?=[^;,=\s]+=)/)) {
    const pair = piece.split(";")[0].trim();
    const i = pair.indexOf("=");
    if (i > 0) jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  cookie = Object.entries(jar)
    .filter(([name, value]) => name && value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  keep("cookie", cookie);
}

async function send(url, { method = "GET", body, headers = {} } = {}) {
  const outgoing = {
    "user-agent": UA,
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
    ...headers,
  };
  const session = manualCookie() || cookie;
  if (session) outgoing.cookie = session;
  const response = await fetch(url, { method, body, headers: outgoing });
  if (!manualCookie()) {
    let header = "";
    try {
      header = response.headers.get("set-cookie") || "";
    } catch (error) {
      header = "";
    }
    mergeSetCookie(header);
  }
  return response;
}

function isCheck(html) {
  return html.includes("human_check") || html.includes("安全验证");
}

async function read(url, options) {
  let response;
  try {
    response = await send(url, options);
  } catch (error) {
    throw new Error(`连不上无名音乐网：${error && error.message ? error.message : error}`);
  }
  return response.text();
}

async function passCheck(url, html) {
  const match = html.match(/name="csrf_token" value="([^"]+)"/);
  if (!match) return false;
  // No Referer here: the site's check refuses a form post that carries one.
  await read(url, {
    method: "POST",
    body: `csrf_token=${encodeURIComponent(match[1])}&human_check=on`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  return true;
}

const pageCache = new Map();

async function pageHtml(path) {
  const url = path.startsWith("http") ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.html;

  let html = await read(url);
  for (let attempt = 0; attempt < 2 && isCheck(html); attempt++) {
    if (!(await passCheck(url, html))) break;
    html = await read(url);
  }
  if (isCheck(html)) throw fail("setup", CHECK_FAILED);

  pageCache.set(url, { html, at: Date.now() });
  if (pageCache.size > 80) {
    const oldest = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) pageCache.delete(oldest[0]);
  }
  return html;
}

// ---------------------------------------------------------------------------
// Reading HTML without a DOM

function unescapeHtml(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, name) => {
      switch (name) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default:
          return " ";
      }
    });
}

function textOf(html) {
  return unescapeHtml(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

// A cover at the size the app shows it: its image servers make 120, 400 and
// 600 pixels across from the same path.
function sizedImage(url) {
  if (!url) return "";
  let out = String(url).split("?")[0].trim();
  if (out.startsWith("//")) out = "https:" + out;
  return out.replace(/\/(100|120|200|400|600)\//, "/{size}/");
}

function parseDuration(block) {
  const match = block.match(/class=["'](?:stime|playtime)["'][^>]*>\s*(\d{1,2}):(\d{2})/i);
  if (!match) return 0;
  return (Number(match[1]) * 60 + Number(match[2])) * 1000;
}

function blockList(html) {
  return String(html).split(/<li[\s>]/i).slice(1);
}

function blockOf(piece) {
  return piece.split(/<\/li>/i)[0];
}

// Each row of a song list: its /mp3/<hash>.html link, the cover in it, the
// time it runs, and "歌手 - 歌名" or the two apart.
function parseTracks(html, options = {}) {
  const list = [];
  const seen = new Set();
  for (const piece of blockList(html)) {
    const block = blockOf(piece);
    const hit = block.match(/\/mp3\/([0-9a-f]{32})\.html/i);
    if (!hit) continue;
    const id = hit[1].toLowerCase();
    if (seen.has(id)) continue;

    // The "mv" link nested in the title anchor would read as part of the title.
    const clean = block.replace(/<a[^>]*class=["']mv["'][^>]*>[\s\S]*?<\/a>/gi, "");
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    const singerMatch = clean.match(/<a[^>]*class=["']singer["'][^>]*>([\s\S]*?)<\/a>/i);
    const singer = singerMatch ? textOf(singerMatch[1]) : "";
    const singerId = singerMatch
      ? (singerMatch[0].match(/\/singer\/(\d+)\//) || [])[1] || ""
      : "";
    const titleMatch =
      clean.match(/<a[^>]*class=["']url["'][^>]*>([\s\S]*?)<\/a>/i) ||
      clean.match(/<a[^>]*href=["']\/mp3\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
    let title = titleMatch ? textOf(titleMatch[1]) : "";
    let artist = singer;
    if (artist && title.startsWith(artist + " - ")) title = title.slice(artist.length + 3).trim();
    if (!artist) {
      const dash = title.indexOf(" - ");
      if (dash > 0) {
        artist = title.slice(0, dash).trim();
        title = title.slice(dash + 3).trim();
      }
    }
    if (!title) continue;

    const track = {
      id,
      name: title,
      artists: artist ? [{ id: singerId, name: artist }] : [],
      album: options.album || { id: "", name: "", imageUrl: sizedImage(image) },
      duration: parseDuration(block),
      url: `${BASE}/mp3/${id}.html`,
    };
    list.push(track);
    seen.add(id);
  }
  rememberTracks(list);
  return list;
}

function parsePlaylistCards(html) {
  const list = [];
  const seen = new Set();
  for (const piece of blockList(html)) {
    const block = blockOf(piece);
    const hit = block.match(/\/playlist\/(\d+)\.html/);
    if (!hit || seen.has(hit[1])) continue;
    const nameAnchor =
      block.match(/<div[^>]*class=["']name["'][^>]*>[\s\S]*?<a[^>]*title=["']([^"']*)["']/i) ||
      block.match(/<div[^>]*class=["']name["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const name = nameAnchor ? textOf(nameAnchor[1]) : "";
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    if (!name) continue;
    list.push({ id: hit[1], name, imageUrl: sizedImage(image) });
    seen.add(hit[1]);
  }
  return list;
}

function parseSingerCards(html) {
  const list = [];
  const seen = new Set();
  for (const piece of blockList(html)) {
    const block = blockOf(piece);
    const hit = block.match(/\/singer\/(\d+)\/1\.html/);
    if (!hit || seen.has(hit[1])) continue;
    const anchor =
      block.match(/<div[^>]*class=["']name["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<a[^>]*title=["']([^"']*)["'][^>]*>[\s\S]*?<\/a>/i);
    const name = anchor ? textOf(anchor[1]) : "";
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    if (!name) continue;
    list.push({ id: hit[1], name, imageUrl: sizedImage(image) });
    seen.add(hit[1]);
  }
  return list;
}

function parseAlbumCards(html) {
  const list = [];
  const seen = new Set();
  for (const piece of blockList(html)) {
    const block = blockOf(piece);
    const hit = block.match(/\/album\/(\d+)\.html/);
    if (!hit || seen.has(hit[1])) continue;
    const anchor =
      block.match(/<a[^>]*title=["']([^"']*)["'][^>]*>[\s\S]*?<\/a>/i) ||
      block.match(/<div[^>]*class=["']name["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const name = anchor ? textOf(anchor[1]) : "";
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    if (!name) continue;
    list.push({ id: hit[1], name, imageUrl: sizedImage(image) });
    seen.add(hit[1]);
  }
  return list;
}

// The heading of an album, artist or playlist page: its name, picture and
// description, from the block above its songs.
function parseProfile(html) {
  const start = html.indexOf('class="singer_info"');
  const block = start < 0 ? html : html.slice(start, start + 1200);
  const heading = block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const image = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  let description = "";
  const info = block.match(/<div[^>]*class=["']info["'][^>]*>([\s\S]*?)<\/div>/i);
  if (info) description = textOf(info[1]);
  return {
    name: heading ? textOf(heading[1]) : "",
    imageUrl: sizedImage(image ? image[1] : ""),
    description,
  };
}

function parseTotal(html) {
  const match = html.match(/共有\s*<span>\s*(\d+)\s*<\/span>\s*(?:首|个)/);
  return match ? Number(match[1]) : 0;
}

// The part of a page under an <h1> such as 推荐音乐, up to its </ul>.
function sectionHtml(html, title) {
  const pattern = new RegExp("<h1[^>]*>[^<]*" + title + "[^<]*</h1>", "i");
  const heading = pattern.exec(html);
  if (!heading) return "";
  const start = html.indexOf("<ul", heading.index + heading[0].length);
  if (start < 0) return "";
  const end = html.indexOf("</ul>", start);
  return end < 0 ? "" : html.slice(start, end);
}

// ---------------------------------------------------------------------------
// What was parsed lately, so a song liked now can be listed later without
// asking the site again. Only likes, saved albums and history are written to
// storage; the rest stays in memory for the session.

const knownTracks = new Map();
const knownAlbums = new Map();

function rememberTracks(tracks) {
  for (const track of tracks || []) {
    if (track && track.id) knownTracks.set(track.id, track);
  }
}

function rememberAlbum(album) {
  if (album && album.id) knownAlbums.set(album.id, album);
}

function trackById(id) {
  return knownTracks.get(id) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null;
}

function albumById(id) {
  return knownAlbums.get(id) || stored("albumData", {})[id] || null;
}

// ---------------------------------------------------------------------------
// The site's shelves

const CHARTS = [
  { slug: "top", title: "TOP排行榜", path: (page) => (page === 1 ? "/list/top.html" : `/list/top/${page}.html`) },
  { slug: "ustop", title: "欧美榜单", path: (page) => (page === 1 ? "/list/ustop.html" : `/list/ustop/${page}.html`) },
  { slug: "ndtop", title: "内地榜单", path: (page) => (page === 1 ? "/list/ndtop.html" : `/list/ndtop/${page}.html`) },
  { slug: "love", title: "恋爱的歌", path: (page) => (page === 1 ? "/list/love.html" : `/list/love/${page}.html`) },
];

function chartOf(slug) {
  const chart = CHARTS.find((item) => item.slug === slug);
  if (!chart) throw fail("unavailable", "没有这个榜单");
  return chart;
}

function hasNextPage(html, page) {
  const next = page + 1;
  return new RegExp(`href=["'][^"']*\\/${next}\\.html["']`).test(html) || html.includes(`/${next}.html`);
}

function pageLinks(page, kind, slug) {
  const links = [];
  if (page > 1) {
    links.push({ title: t("Previous"), subtitle: `第 ${page - 1} 页`, page: `${kind}:${slug}:${page - 1}` });
  }
  return links;
}

async function chartBrowse(slug, page) {
  const chart = chartOf(slug);
  const html = await pageHtml(chart.path(page));
  const heading = html.match(/<div[^>]*class=["']play_list[^"']*["'][^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const tracks = parseTracks(html);
  const sections = [{ title: heading ? textOf(heading[1]) : chart.title, tracks }];
  const links = pageLinks(page, "chart", slug);
  if (hasNextPage(html, page)) {
    links.push({ title: t("Next"), subtitle: `第 ${page + 1} 页`, page: `chart:${slug}:${page + 1}` });
  }
  if (links.length) sections.push({ title: t("Pages"), links });
  return {
    title: heading ? textOf(heading[1]) : chart.title,
    subtitle: `第 ${page} 页`,
    sections,
  };
}

async function playlistBrowse(slug, page) {
  const path =
    slug === "index"
      ? page === 1
        ? "/gdlist/index.html"
        : `/gdlist/index/${page}.html`
      : page === 1
        ? `/gdlist/${slug}.html`
        : `/gdlist/${slug}/${page}.html`;
  const html = await pageHtml(path);
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const playlists = parsePlaylistCards(html);
  const sections = [{ title: heading ? textOf(heading[1]) : t("Playlists"), playlists }];
  const links = pageLinks(page, "gdlist", slug);
  if (hasNextPage(html, page)) {
    links.push({ title: t("Next"), subtitle: `第 ${page + 1} 页`, page: `gdlist:${slug}:${page + 1}` });
  }
  if (links.length) sections.push({ title: t("Pages"), links });
  return { title: heading ? textOf(heading[1]) : t("Playlists"), subtitle: `第 ${page} 页`, sections };
}

function gdlistCategories(html) {
  const list = [];
  const seen = new Set();
  const pattern = /<a[^>]*href=["']\/gdlist\/([a-z0-9]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const slug = match[1];
    const name = textOf(match[2]);
    if (!name || slug === "index" || seen.has(slug)) continue;
    seen.add(slug);
    list.push({ title: name, page: `gdlist:${slug}:1` });
  }
  return list;
}

// ---------------------------------------------------------------------------
// Exports

export async function home() {
  const html = await pageHtml("/");
  const recommended = parseTracks(sectionHtml(html, "推荐音乐"));
  const listening = parseTracks(sectionHtml(html, "他们在听"));
  const playlists = parsePlaylistCards(sectionHtml(html, "热门歌单")).slice(0, 18);
  const artists = parseSingerCards(sectionHtml(html, "推荐歌手")).slice(0, 18);

  const sections = [];
  if (recommended.length) {
    sections.push({
      title: "推荐音乐",
      tracks: recommended.slice(0, 30),
      morePage: "recommend",
      pageTitle: "每日推荐",
      subtitle: "无名音乐网推荐，每天更新",
    });
  }
  if (listening.length) {
    sections.push({ title: "他们在听", tracks: listening.slice(0, 20), morePage: "listening" });
  }
  if (playlists.length) {
    sections.push({ title: "热门歌单", playlists, morePage: "playlists" });
  }
  if (artists.length) {
    sections.push({ title: "推荐歌手", artists, morePage: "singers:1" });
  }
  sections.push({
    title: t("Charts"),
    links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.slug}:1` })),
  });

  return { title: "无名音乐", subtitle: "免费 MP3 歌曲试听", sections };
}

export async function browse({ page }) {
  const chart = page.match(/^chart:([a-z]+):(\d+)$/);
  if (chart) return chartBrowse(chart[1], Number(chart[2]));
  const gdlist = page.match(/^gdlist:([a-z0-9]+):(\d+)$/);
  if (gdlist) return playlistBrowse(gdlist[1], Number(gdlist[2]));
  const singers = page.match(/^singers:(\d+)$/);
  if (singers) return singersBrowse(Number(singers[1]));
  if (page === "charts") return chartsOverview();
  if (page === "playlists") return playlistsOverview();
  if (page === "recommend" || page === "listening") return shelfPage(page);
  throw fail("unavailable", "没有这个页面");
}

async function chartsOverview() {
  const sections = [];
  for (const chart of CHARTS.slice(0, 3)) {
    try {
      const html = await pageHtml(chart.path(1));
      sections.push({
        title: chart.title,
        tracks: parseTracks(html).slice(0, 12),
        morePage: `chart:${chart.slug}:1`,
      });
    } catch (error) {
      // A chart that can't be read now shouldn't take the page with it.
    }
  }
  sections.push({
    title: "全部榜单",
    links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.slug}:1` })),
  });
  return { title: t("Charts"), subtitle: "本站热门、欧美、内地等榜单", sections };
}

async function playlistsOverview() {
  const html = await pageHtml("/gdlist/index.html");
  const categories = gdlistCategories(html);
  const playlists = parsePlaylistCards(html).slice(0, 24);
  const sections = [];
  if (categories.length) sections.push({ title: t("Categories"), links: categories });
  sections.push({ title: "推荐歌单", playlists, morePage: "gdlist:index:1" });
  return { title: t("Playlists"), subtitle: "按主题整理的音乐歌单", sections };
}

async function singersBrowse(page) {
  const html = await pageHtml(page === 1 ? "/singers/index/index.html" : `/singers/index/index/${page}.html`);
  const artists = parseSingerCards(html);
  const sections = [{ title: "全部 歌手列表", artists }];
  const links = page > 1 ? [{ title: t("Previous"), subtitle: `第 ${page - 1} 页`, page: `singers:${page - 1}` }] : [];
  if (hasNextPage(html, page)) {
    links.push({ title: t("Next"), subtitle: `第 ${page + 1} 页`, page: `singers:${page + 1}` });
  }
  if (links.length) sections.push({ title: t("Pages"), links });
  return { title: t("Singers"), subtitle: `第 ${page} 页`, sections };
}

async function shelfPage(page) {
  const html = await pageHtml("/");
  if (page === "recommend") {
    return {
      title: "每日推荐",
      subtitle: "无名音乐网推荐，每天更新",
      sections: [{ title: "推荐音乐", tracks: parseTracks(sectionHtml(html, "推荐音乐")) }],
    };
  }
  return {
    title: "他们在听",
    sections: [{ title: "他们在听", tracks: parseTracks(sectionHtml(html, "他们在听")) }],
  };
}

export async function search({ query, kind, offset = 0 }) {
  const wanted = kind || "tracks";
  if (wanted !== "tracks") return { [wanted]: [], more: false };
  const term = String(query || "").trim();
  if (!term) return { tracks: [], more: false };

  const page = Math.floor(offset / SEARCH_PAGE_SIZE) + 1;
  const html = await pageHtml(`/so.php?wd=${encodeURIComponent(term)}&page=${page}`);
  if (html.includes("没有找到该关键词")) return { tracks: [], more: false };

  const tracks = parseTracks(html);
  const total = parseTotal(html);
  const got = offset + tracks.length;
  return { tracks, more: total > 0 ? got < total : tracks.length >= SEARCH_PAGE_SIZE };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  const html = await pageHtml(`/so.php?wd=${encodeURIComponent(term)}&page=1`);
  if (html.includes("没有找到该关键词")) return [];
  const tracks = parseTracks(html);
  const out = [];
  for (const track of tracks) {
    const label = track.artists.length ? `${track.artists[0].name} - ${track.name}` : track.name;
    if (!out.includes(label)) out.push(label);
    if (out.length >= 10) break;
  }
  return out;
}

export async function album({ id }) {
  const html = await pageHtml(`/album/${id}.html`);
  const profile = parseProfile(html);
  const saved = stored("savedAlbums", []).includes(id);
  const record = {
    id,
    name: profile.name,
    imageUrl: profile.imageUrl,
    released: "",
    saved,
  };
  const tracks = parseTracks(html, { album: record });
  rememberAlbum(record);
  return { album: record, tracks };
}

export async function artist({ id }) {
  const html = await pageHtml(`/singer/${id}/1.html`);
  const profile = parseProfile(html);
  const tracks = parseTracks(html);
  let albums = [];
  try {
    albums = parseAlbumCards(await pageHtml(`/singer/album/${id}.html`)).slice(0, 24);
  } catch (error) {
    albums = [];
  }
  const record = { id, name: profile.name || id, imageUrl: profile.imageUrl };
  return { artist: record, tracks, albums };
}

export async function playlist({ id }) {
  const first = await pageHtml(`/playlist/${id}.html`);
  const profile = parseProfile(first);
  const total = parseTotal(first);
  const tracks = parseTracks(first);
  const pages = Math.min(6, Math.max(1, Math.ceil(total / PLAYLIST_PAGE_SIZE)));
  for (let page = 2; page <= pages; page++) {
    try {
      tracks.push(...parseTracks(await pageHtml(`/playlist/${id}/${page}.html`)));
    } catch (error) {
      break;
    }
  }
  const unique = [];
  const seen = new Set();
  for (const track of tracks) {
    if (!seen.has(track.id)) {
      seen.add(track.id);
      unique.push(track);
    }
  }
  return {
    id,
    name: profile.name,
    imageUrl: profile.imageUrl,
    description: profile.description,
    trackCount: unique.length,
    tracks: unique,
  };
}

export async function lyrics({ id }) {
  const data = await playData(id);
  let lrc = String(data.lrc || "");
  lrc = lrc
    .split("\n")
    .filter((line) => {
      const text = line.replace(/\[[^\]]*\]/g, "").trim();
      return text && !text.includes("无名音乐网") && !text.includes("mvmp3.com");
    })
    .join("\n")
    .trim();
  return lrc ? { lrc } : {};
}

export async function stream({ id }) {
  const data = await playData(id);
  return { url: data.url, type: "mp3" };
}

// The site's own play API: POST id and type, answering the title, cover, audio
// URL and LRC. "dance" is what its song pages ask for; some tracks only answer
// another type, so try them in turn.
async function playData(id) {
  const types = ["dance", "mp3", "music", "song"];
  for (const type of types) {
    const body = `id=${encodeURIComponent(id)}&type=${type}`;
    let text = "";
    try {
      text = await read(`${BASE}/style/js/play.php`, {
        method: "POST",
        body,
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
          referer: `${BASE}/mp3/${id}.html`,
        },
      });
    } catch (error) {
      continue;
    }
    try {
      const data = JSON.parse(text);
      if (data && data.url) return data;
    } catch (error) {
      // not JSON: the next type may be.
    }
  }
  throw fail("unavailable", "这首歌暂时没有可用的音频");
}

// ---------------------------------------------------------------------------
// The listener's own shelf: likes, saved albums and history, kept by the plugin
// itself, as the site has no accounts.

export function like({ id, on }) {
  const ids = new Set(stored("liked", []));
  const kept = stored("likedTracks", {});
  if (on) {
    ids.add(id);
    const track = trackById(id);
    if (track) {
      kept[id] = track;
      keep("likedTracks", kept);
    }
  } else {
    ids.delete(id);
  }
  keep("liked", [...ids]);
  const objects = Object.keys(kept);
  if (objects.length > 300) {
    for (const key of objects) if (!ids.has(key)) delete kept[key];
    keep("likedTracks", kept);
  }
}

export function isLiked({ ids }) {
  const liked = new Set(stored("liked", []));
  return Object.fromEntries(ids.map((id) => [id, liked.has(id)]));
}

export function liked({ offset = 0 }) {
  const ids = stored("liked", []).slice().reverse();
  const objects = stored("likedTracks", {});
  const tracks = ids
    .map((id) => objects[id])
    .filter(Boolean)
    .slice(offset, offset + 60);
  return { tracks, more: ids.length > offset + 60 };
}

export function saveAlbum({ id, on }) {
  const ids = new Set(stored("savedAlbums", []));
  const data = stored("albumData", {});
  if (on) {
    ids.add(id);
    const album = albumById(id);
    if (album) {
      data[id] = album;
      keep("albumData", data);
    }
  } else {
    ids.delete(id);
  }
  keep("savedAlbums", [...ids]);
}

export function savedAlbums({ offset = 0 }) {
  const ids = stored("savedAlbums", []).slice().reverse();
  const data = stored("albumData", {});
  const albums = ids
    .map((id) => {
      const saved = data[id];
      return saved ? { ...saved, saved: true } : { id, name: id, imageUrl: "" };
    })
    .slice(offset, offset + 60);
  return { albums, more: ids.length > offset + 60 };
}

export function played({ id }) {
  const history = stored("history", []).filter((entry) => entry !== id);
  history.push(id);
  keep("history", history.slice(-40));
  const track = knownTracks.get(id);
  if (track) {
    const data = stored("historyTracks", {});
    data[id] = track;
    const keepIds = new Set(history.slice(-40));
    for (const key of Object.keys(data)) if (!keepIds.has(key)) delete data[key];
    keep("historyTracks", data);
  }
}

export function recent() {
  const ids = stored("history", []).slice().reverse();
  const data = stored("historyTracks", {});
  return ids
    .map((id) => data[id] || knownTracks.get(id))
    .filter(Boolean)
    .slice(0, 20);
}
