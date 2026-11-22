// 小蜜蜂音乐（xmfwav.com）— MyGo Music 插件
//
// 站点是 PHP 服务端页面：首页 /，最近更新 /newsong/，歌手列表 /hotsingers/，
// 歌手页 /singer/<slug>/，搜索 /srcj/?kwd=，单曲页 /song/<id> 内嵌 APlayer
// 的 music 对象与 #demo 文本歌词。站点上游偶发 503，这里统一重试。

const BASE = "https://www.xmfwav.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const PAGE_TTL = 3 * 60 * 1000;

const t = (text) => host.t(text);

const NETEASE_SEARCH = "https://music.163.com/api/search/get/web";
const NETEASE_REFERER = "https://music.163.com/";
const neteaseCache = new Map();
const neteaseUrlCache = new Map();

// 站点的音频只是 16kHz、约两分钟的 Ogg 试听，有些播放器直接报
// “no supported sources”。这里按歌名/歌手在网易云找同一首，优先返回 MP3；
// 找不到时再退回站点自己的 Ogg。
function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s'"“”‘’·・.,，。!！?？:：;；_\-—–()（）\[\]【】{}<>《》/\\|@#$%^&*+=~`]/g, "")
    .replace(/dj[^版]{0,12}版/g, "")
    .trim();
}

function baseName(value) {
  return normalizeName(String(value || "").replace(/[（(][^）)]*[）)]/g, "").replace(/dj[^版]{0,12}版/gi, ""));
}

function artistText(value) {
  return normalizeName(Array.isArray(value) ? value.join("") : value);
}

async function neteaseSearch(song) {
  const key = `${song.name}|${song.artists[0] ? song.artists[0].name : ""}`;
  const hit = neteaseCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.id;
  const query = `${song.name} ${song.artists[0] ? song.artists[0].name : ""}`.trim();
  const url = `${NETEASE_SEARCH}?s=${encodeURIComponent(query)}&type=1&limit=12&offset=0`;
  const response = await fetch(url, {
    headers: {
      "user-agent": UA,
      referer: NETEASE_REFERER,
      accept: "application/json,text/plain,*/*",
    },
  });
  if (!response.ok) return "";
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return "";
  }
  const songs = (data && data.result && data.result.songs) || [];
  const wantedFull = normalizeName(song.name);
  const wantedBase = baseName(song.name);
  const wantedArtist = artistText(song.artists.map((artist) => artist.name));
  let best = null;
  let bestScore = 99;
  for (const item of songs) {
    if (!item || !item.id || !item.name) continue;
    const full = normalizeName(item.name);
    const base = baseName(item.name);
    const artist = artistText(item.artists || item.artist);
    const sameArtist = wantedArtist && artist && (artist.includes(wantedArtist) || wantedArtist.includes(artist));
    let score = 99;
    if (full === wantedFull) score = sameArtist ? 0 : 1;
    else if (base === wantedBase) score = sameArtist ? 2 : 3;
    else if (wantedBase && (full.includes(wantedBase) || base.includes(wantedBase))) score = sameArtist ? 4 : 5;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  if (!best || bestScore > 3) {
    neteaseCache.set(key, { id: "", at: Date.now() });
    return "";
  }
  neteaseCache.set(key, { id: String(best.id), at: Date.now() });
  return String(best.id);
}

async function neteaseMp3(id) {
  const hit = neteaseUrlCache.get(id);
  if (hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.url;
  const outer = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  let response;
  try {
    response = await fetch(outer, {
      headers: {
        "user-agent": UA,
        referer: NETEASE_REFERER,
        range: "bytes=0-0",
        accept: "audio/mpeg,*/*",
      },
    });
  } catch (error) {
    return "";
  }
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok || !type.includes("audio")) return "";
  try {
    if (response.body && response.body.cancel) await response.body.cancel();
  } catch (error) {
    // 有些 fetch 实现没有可取消的 body
  }
  let url = response.url || outer;
  if (url.startsWith("http://")) url = "https://" + url.slice(7);
  neteaseUrlCache.set(id, { url, at: Date.now() });
  return url;
}

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function stored(key, fallback) {
  const value = host.storage.get(key);
  return value === undefined || value === null ? fallback : value;
}

function keep(key, value) {
  host.storage.set(key, value);
}

const cache = new Map();

async function request(path, attempt = 0) {
  const url = path.startsWith("http") ? path : BASE + path;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": UA,
        referer: REFERER,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
      },
    });
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return request(path, attempt + 1);
    }
    throw new Error(`连不上小蜜蜂音乐：${error && error.message ? error.message : error}`);
  }
  if (!response.ok || response.status === 503) {
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return request(path, attempt + 1);
    }
    throw fail("unavailable", `小蜜蜂音乐返回了 ${response.status}，请稍后重试`);
  }
  return response.text();
}

async function pageHtml(path) {
  const url = path.startsWith("http") ? path : BASE + path;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < PAGE_TTL) return hit.html;
  const html = await request(url);
  cache.set(url, { html, at: Date.now() });
  if (cache.size > 60) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return html;
}

function unescapeHtml(text) {
  return String(text)
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
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

function inlineText(html) {
  return unescapeHtml(String(html).replace(/<[^>]+>/g, ""))
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? unescapeHtml(match[1]).trim() : "";
}

function absolute(url) {
  if (!url) return "";
  const out = String(url).trim();
  if (out.startsWith("//")) return "https:" + out;
  if (out.startsWith("/")) return BASE + out;
  return out;
}

// 站点列表文字是「歌名-歌手」，歌名里也可能有连字符，所以取最后一个连字符。
function splitNameArtist(text, titleAttr) {
  const value = textOf(text).replace(/^\uFEFF/, "").trim();
  const idx = Math.max(value.lastIndexOf(" - "), value.lastIndexOf("-"));
  if (idx > 0) {
    return {
      name: value.slice(0, idx).trim(),
      artist: value.slice(idx + (value.slice(idx, idx + 3) === " - " ? 3 : 1)).trim(),
    };
  }
  const title = textOf(titleAttr);
  const first = title.indexOf("-");
  if (first > 0) return { name: title.slice(first + 1).trim(), artist: title.slice(0, first).trim() };
  return { name: value, artist: "" };
}

const knownTracks = new Map();

function rememberTracks(tracks) {
  for (const track of tracks || []) {
    if (track && track.id) knownTracks.set(track.id, track);
  }
}

function trackBy(id) {
  return knownTracks.get(id) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null;
}

function makeTrack(id, name, artist, image, extra = {}) {
  return {
    id: String(id),
    name: name || "",
    artists: artist ? [{ id: "", name: artist }] : [],
    album: { id: "", name: "", imageUrl: absolute(image) },
    duration: 0,
    url: `${BASE}/song/${id}`,
    ...extra,
  };
}

function parseSongItems(html) {
  const list = [];
  const seen = new Set();
  const pattern = /<a[^>]*class=["'][^"']*song-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const tag = match[0];
    const idMatch = tag.match(/\/song\/(\d+)/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const parsed = splitNameArtist(match[1], attr(tag, "title"));
    if (!parsed.name) continue;
    list.push(makeTrack(idMatch[1], parsed.name, parsed.artist));
    seen.add(idMatch[1]);
  }
  rememberTracks(list);
  return list;
}

function parseSearchTracks(html) {
  const list = [];
  const seen = new Set();
  const pattern =
    /<a[^>]*class=["'][^"']*srcsong-item[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const tag = match[0];
    const block = match[1];
    const idMatch = tag.match(/\/song\/(\d+)/) || block.match(/\/song\/(\d+)/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const nameBlock = block.match(/<span[^>]*class=["'][^"']*srcsong-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const artistBlock = block.match(
      /<span[^>]*class=["'][^"']*srcsinger-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    );
    const name = inlineText(nameBlock ? nameBlock[1] : "");
    if (!name) continue;
    const artist = inlineText(artistBlock ? artistBlock[1] : "");
    list.push(makeTrack(idMatch[1], name, artist));
    seen.add(idMatch[1]);
  }
  rememberTracks(list);
  return list;
}

function parseChartTracks(html) {
  const list = [];
  const seen = new Set();
  const pattern =
    /<a[^>]*class=["'][^"']*music-chart-row-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const tag = match[0];
    const block = match[1];
    const idMatch = tag.match(/\/song\/(\d+)/) || block.match(/\/song\/(\d+)/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const nameBlock = block.match(
      /<strong[^>]*class=["'][^"']*music-chart-song-name[^"']*["'][^>]*>([\s\S]*?)<\/strong\s*>/i,
    );
    const artistBlock = block.match(
      /<span[^>]*class=["'][^"']*music-chart-song-artist[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    );
    const name = inlineText(nameBlock ? nameBlock[1] : "");
    if (!name) continue;
    const artist = inlineText(artistBlock ? artistBlock[1] : "").replace(/^\s*-\s*/, "");
    list.push(makeTrack(idMatch[1], name, artist));
    seen.add(idMatch[1]);
  }
  rememberTracks(list);
  return list;
}

function parseRankTracks(html) {
  const start = html.indexOf("热门歌曲排行");
  if (start < 0) return [];
  const end = html.indexOf("热门歌手排行", start);
  const block = html.slice(start, end > start ? end : start + 3000);
  const list = [];
  const seen = new Set();
  const pattern = /<a[^>]*href=["']\/song\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(block))) {
    if (seen.has(match[1])) continue;
    const nameBlock = match[2].match(/class=["'][^"']*rank-songname[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const parsed = splitNameArtist(nameBlock ? nameBlock[1] : "", "");
    if (!parsed.name) continue;
    list.push(makeTrack(match[1], parsed.name, parsed.artist));
    seen.add(match[1]);
  }
  rememberTracks(list);
  return list;
}

function parseRankArtists(html) {
  const start = html.indexOf("热门歌手排行");
  if (start < 0) return [];
  const block = html.slice(start, start + 2500);
  const links = [];
  const pattern = /<a[^>]*href=["']\/src\/([^"'/]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(block))) {
    const nameBlock = match[2].match(/class=["'][^"']*rank-songname[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const name = textOf(nameBlock ? nameBlock[1] : "");
    if (!name) continue;
    links.push({ title: name, subtitle: "热门歌手", page: `search:${name}` });
  }
  return links;
}

function parseSingerCards(html) {
  const list = [];
  const seen = new Set();
  const pattern =
    /<a[^>]*class=["'][^"']*singerlist-item[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const tag = match[0];
    const block = match[1];
    const idMatch = tag.match(/\/singer\/([a-zA-Z0-9_-]+)/) || block.match(/\/singer\/([a-zA-Z0-9_-]+)/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const nameBlock = block.match(
      /<div[^>]*class=["'][^"']*singerlist-name[^"']*["'][^>]*>([^<]*)</i,
    );
    const name = textOf(nameBlock ? nameBlock[1] : "");
    if (!name) continue;
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    list.push({ id: idMatch[1], name, imageUrl: absolute(image) });
    seen.add(idMatch[1]);
    if (list.length >= 60) break;
  }
  return list;
}

function parsePageNumbers(html) {
  const pages = new Set();
  const pattern = /(?:[?&]|&amp;)page=(\d+)/gi;
  let match;
  while ((match = pattern.exec(html))) pages.add(Number(match[1]));
  return pages;
}

function parseDuration(html) {
  const explicit = html.match(/歌曲时长[\s\S]{0,240}?(\d+)\s*分\s*(\d+)\s*秒/);
  if (explicit) return (Number(explicit[1]) * 60 + Number(explicit[2])) * 1000;
  // 没有时长字段时，按站点的 MP3 文件大小估算：320 kbps ≈ 每秒 40 KB。
  const size = html.match(/格式\s*[:：]\s*MP3[\s\S]{0,180}?大小\s*[:：]\s*([\d.]+)\s*M/i);
  if (size) {
    const seconds = Math.round((Number(size[1]) * 1024) / 40);
    if (seconds >= 30 && seconds <= 900) return seconds * 1000;
  }
  return 0;
}

function parseSong(html, id) {
  const pageTitle = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "";
  const parsed = splitNameArtist(pageTitle, "");
  const music = html.match(/music\s*:\s*\{([\s\S]*?)\}/i);
  const block = music ? music[1] : "";
  const title = (block.match(/title\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || parsed.name;
  const author = (block.match(/author\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || parsed.artist;
  const audio = unescapeHtml((block.match(/url\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || "").replace(/\\\//g, "/");
  const pic = unescapeHtml((block.match(/pic\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || "").replace(/\\\//g, "/");
  return {
    id: String(id),
    name: textOf(title || parsed.name),
    artists: author ? [{ id: "", name: textOf(author) }] : [],
    album: { id: "", name: "", imageUrl: absolute(pic) },
    duration: parseDuration(html),
    url: `${BASE}/song/${id}`,
    audio,
  };
}

function linesToLrc(html, duration, name) {
  const section = html.match(/<section[^>]*id=["'](?:songlrc|demo)["'][^>]*>([\s\S]*?)<\/section>/i);
  if (!section) return "";
  const lines = [];
  const pattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(section[1]))) {
    const text = textOf(match[1]).replace(/^\uFEFF/, "").trim();
    if (text) lines.push(text);
  }
  if (!lines.length) return "";
  const normalized = (value) => value.replace(/\s+/g, "").toLowerCase();
  if (name && lines.length && normalized(lines[0]) === normalized(name)) lines.shift();
  if (!lines.length) return "";
  const total = duration > 0 ? duration : lines.length * 4000;
  const step = Math.max(2000, Math.floor(total / lines.length));
  const stamp = (ms) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `[${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.00]`;
  };
  return lines.map((line, index) => `${stamp(index * step)}${line}`).join("\n");
}

function artistPage(id, index) {
  if (index <= 1) return `/singer/${encodeURIComponent(id)}/`;
  return `/singer/${encodeURIComponent(id)}/?sgrtag=${encodeURIComponent(id)}&page=${index}`;
}

function singerListPage(index) {
  return index <= 1 ? "/hotsingers/" : `/hotsingers?page=${index}`;
}

export async function home() {
  let html = "";
  try {
    html = await pageHtml("/");
  } catch (error) {
    html = "";
  }
  const recent = parseSongItems(html).slice(0, 10);
  const hot = parseRankTracks(html).slice(0, 6);
  const singerLinks = parseRankArtists(html).slice(0, 6);
  const sections = [];
  if (recent.length) {
    sections.push({
      title: "最近更新歌曲",
      tracks: recent,
      morePage: "newsong",
      pageTitle: "最近更新",
      subtitle: "每天收录的新歌",
    });
  }
  if (hot.length) sections.push({ title: "热门歌曲排行", tracks: hot });
  if (singerLinks.length) sections.push({ title: "热门歌手排行", links: singerLinks });
  if (!sections.length) {
    sections.push({
      title: "栏目",
      empty: "站点暂时没有响应，请稍后刷新",
      links: [
        { title: "最近更新", subtitle: "最新歌曲", page: "newsong" },
        { title: "热门歌手", subtitle: "歌手与作品", page: "singers:1" },
      ],
    });
  }
  return { title: "小蜜蜂音乐", subtitle: "MP3 歌曲试听与歌单推荐", sections };
}

export async function browse({ page }) {
  const value = String(page || "");
  if (value === "newsong") {
    const tracks = parseChartTracks(await pageHtml("/newsong/"));
    return {
      title: "最近更新",
      subtitle: "最近更新的歌曲排行榜",
      sections: [{ title: "最近更新歌曲", tracks, empty: tracks.length ? "" : "暂时没有歌曲" }],
    };
  }
  const singers = value.match(/^singers:(\d+)$/);
  if (singers) {
    const index = Number(singers[1]);
    const html = await pageHtml(singerListPage(index));
    const artists = parseSingerCards(html);
    const sections = [{ title: "热门歌手", artists, empty: artists.length ? "" : "暂时没有歌手" }];
    const pages = parsePageNumbers(html);
    const links = [];
    if (index > 1) links.push({ title: t("Previous"), subtitle: `第 ${index - 1} 页`, page: `singers:${index - 1}` });
    if (pages.has(index + 1) || (pages.size && Math.max(...pages) > index)) {
      links.push({ title: t("Next"), subtitle: `第 ${index + 1} 页`, page: `singers:${index + 1}` });
    }
    if (links.length) sections.push({ title: t("Pages"), links });
    return { title: "热门歌手", subtitle: `第 ${index} 页`, sections };
  }
  const artist = value.match(/^artist:([^:]+):(\d+)$/);
  if (artist) {
    const id = decodeURIComponent(artist[1]);
    const index = Number(artist[2]);
    const html = await pageHtml(artistPage(id, index));
    const pageName = textOf((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").split("歌曲")[0];
    const cover = (html.match(/class=["'][^"']*singer-cover["'][^"']*[\s\S]{0,240}?<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    const descBlock = html.match(/<div[^>]*class=["'][^"']*singer-desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const description = textOf(descBlock ? descBlock[1] : "");
    const tracks = parseSearchTracks(html);
    const sections = [{ title: `${pageName}的歌曲`, tracks, empty: tracks.length ? "" : "暂时没有歌曲" }];
    const pages = parsePageNumbers(html);
    const links = [];
    if (index > 1) links.push({ title: t("Previous"), subtitle: `第 ${index - 1} 页`, page: `artist:${encodeURIComponent(id)}:${index - 1}` });
    if (pages.has(index + 1) || (pages.size && Math.max(...pages) > index)) {
      links.push({ title: t("Next"), subtitle: `第 ${index + 1} 页`, page: `artist:${encodeURIComponent(id)}:${index + 1}` });
    }
    if (links.length) sections.push({ title: t("Pages"), links });
    return {
      title: pageName || "歌手",
      subtitle: `第 ${index} 页`,
      imageUrl: absolute(cover),
      description,
      sections,
    };
  }
  if (value.startsWith("search:")) {
    const term = value.slice(7);
    const result = await search({ query: term, kind: "tracks", offset: 0 });
    return {
      title: `搜索：${term}`,
      sections: [{ title: "歌曲", tracks: result.tracks, empty: result.tracks.length ? "" : "没有找到歌曲" }],
    };
  }
  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind, offset = 0 }) {
  if ((kind || "tracks") !== "tracks") return { tracks: [], more: false };
  const term = String(query || "").trim();
  if (!term || offset > 0) return { tracks: [], more: false };
  const html = await pageHtml(`/srcj/?kwd=${encodeURIComponent(term)}`);
  return { tracks: parseSearchTracks(html), more: false };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const tracks = parseSearchTracks(await pageHtml(`/srcj/?kwd=${encodeURIComponent(term)}`));
    return tracks
      .slice(0, 10)
      .map((track) => (track.artists.length ? `${track.artists[0].name} - ${track.name}` : track.name));
  } catch (error) {
    return [];
  }
}

export async function artist({ id }) {
  return browse({ page: `artist:${encodeURIComponent(String(id))}:1` });
}

export async function lyrics({ id }) {
  try {
    const html = await pageHtml(`/song/${id}`);
    const song = parseSong(html, id);
    const lrc = linesToLrc(html, song.duration, song.name);
    return lrc ? { lrc } : {};
  } catch (error) {
    return {};
  }
}

export async function stream({ id }) {
  const html = await pageHtml(`/song/${id}`);
  const song = parseSong(html, id);
  try {
    const neteaseId = await neteaseSearch(song);
    const mp3 = neteaseId ? await neteaseMp3(neteaseId) : "";
    if (mp3) return { url: mp3, type: "mp3", headers: { referer: NETEASE_REFERER } };
  } catch (error) {
    // 找不到网易云版本时继续用站点 Ogg
  }
  if (!song.audio) throw fail("unavailable", "这首歌暂时没有可用的音频");
  const path = song.audio.split("?")[0].toLowerCase();
  let type = "mp3";
  if (path.endsWith(".flac")) type = "flac";
  else if (path.endsWith(".ogg")) type = "ogg";
  else if (path.endsWith(".m4a")) type = "m4a";
  else if (path.endsWith(".wav")) type = "wav";
  return { url: song.audio, type, headers: { referer: `${BASE}/song/${id}` } };
}

export function like({ id, on = true }) {
  const ids = new Set(stored("liked", []));
  const kept = stored("likedTracks", {});
  if (on) {
    ids.add(id);
    const track = trackBy(id);
    if (track) {
      kept[id] = track;
      keep("likedTracks", kept);
    }
  } else {
    ids.delete(id);
    delete kept[id];
    keep("likedTracks", kept);
  }
  keep("liked", [...ids]);
}

export function isLiked({ ids }) {
  const liked = new Set(stored("liked", []));
  return Object.fromEntries((ids || []).map((id) => [id, liked.has(String(id))]));
}

export function liked({ offset = 0 }) {
  const ids = stored("liked", []).slice().reverse();
  const data = stored("likedTracks", {});
  const tracks = ids.map((id) => data[id]).filter(Boolean).slice(offset, offset + 60);
  return { tracks, more: ids.length > offset + 60 };
}

export function played({ id }) {
  const history = stored("history", []).filter((entry) => entry !== id);
  history.push(id);
  keep("history", history.slice(-40));
  const track = knownTracks.get(id);
  if (track) {
    const data = stored("historyTracks", {});
    data[id] = track;
    const ids = new Set(history.slice(-40));
    for (const key of Object.keys(data)) if (!ids.has(key)) delete data[key];
    keep("historyTracks", data);
  }
}

export function recent() {
  const ids = stored("history", []).slice().reverse();
  const data = stored("historyTracks", {});
  return ids.map((id) => data[id] || knownTracks.get(id)).filter(Boolean).slice(0, 20);
}
