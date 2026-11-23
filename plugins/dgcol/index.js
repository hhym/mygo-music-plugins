// 显示名：动感酷音乐（dgcol）
// 动感酷音乐（dgcol.com）— MyGo Music 插件
//
// 站点是 PHP 服务端页面：每日热歌列表 /choicemsc/，歌曲页
// /choicemscdet/<id> 内嵌 APlayer 的 music 对象（url / pic / title / author）
// 和 #songlrc 文本歌词。站点上游偶发 503，这里统一重试几次。

const BASE = "https://www.dgcol.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const PAGE_TTL = 3 * 60 * 1000;
const PAGE_SIZE = 10;

const t = (text) => host.t(text);

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
      await new Promise((resolve) => setTimeout(resolve, 500));
      return request(path, attempt + 1);
    }
    throw new Error(`连不上动感酷音乐：${error && error.message ? error.message : error}`);
  }
  if (!response.ok || response.status === 503) {
    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return request(path, attempt + 1);
    }
    throw fail("unavailable", `动感酷音乐返回了 ${response.status}，请稍后重试`);
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
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

function absolute(url) {
  if (!url) return "";
  const out = String(url).trim();
  if (out.startsWith("//")) return "https:" + out;
  if (out.startsWith("/")) return BASE + out;
  return out;
}

function splitTitle(text) {
  const value = textOf(text);
  const dash = value.indexOf(" - ");
  if (dash < 0) return { name: value, artist: "" };
  return { name: value.slice(0, dash).trim(), artist: value.slice(dash + 3).trim() };
}

function parseCards(html) {
  const list = [];
  const seen = new Set();
  const pattern = /<a[^>]*class=["'][^"']*song-list-item[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const block = match[1];
    const tag = match[0];
    const idMatch = tag.match(/\/choicemscdet\/(\d+)/) || block.match(/\/choicemscdet\/(\d+)/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const titleBlock = block.match(/<div[^>]*class=["'][^"']*song-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const parsed = splitTitle(titleBlock ? titleBlock[1] : "");
    if (!parsed.name) continue;
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    list.push({
      id: idMatch[1],
      name: parsed.name,
      artists: parsed.artist ? [{ id: "", name: parsed.artist }] : [],
      album: { id: "", name: "", imageUrl: absolute(image) },
      duration: 0,
      url: `${BASE}/choicemscdet/${idMatch[1]}`,
    });
    seen.add(idMatch[1]);
  }
  rememberTracks(list);
  return list;
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

function parseDuration(html) {
  const match = html.match(/歌曲时长[\s\S]{0,200}?(\d+)\s*分\s*(\d+)\s*秒/);
  if (match) return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  const plain = html.match(/(\d{1,2}):(\d{2})/);
  return plain ? (Number(plain[1]) * 60 + Number(plain[2])) * 1000 : 0;
}

function parseSong(html, id) {
  const pageTitle = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "";
  const parsed = splitTitle(pageTitle);
  const music = html.match(/music\s*:\s*\{([\s\S]*?)\}/i);
  const block = music ? music[1] : "";
  const title = (block.match(/title\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || parsed.name;
  const author = (block.match(/author\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || parsed.artist;
  const url = (block.match(/url\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || "";
  const pic = (block.match(/pic\s*:\s*['"]([^'"]*)['"]/i) || [])[1] || "";
  const cover =
    absolute(pic) ||
    absolute((html.match(/dgmusic-detail-tag-cover[\s\S]{0,200}?src=["']([^"']+)["']/i) || [])[1] || "");
  return {
    id: String(id),
    name: String(title || parsed.name || "").trim(),
    artists: author ? [{ id: "", name: String(author) }] : [],
    album: { id: "", name: "", imageUrl: cover },
    duration: parseDuration(html),
    url: `${BASE}/choicemscdet/${id}`,
    audio: url,
  };
}

function linesToLrc(html, duration) {
  const section = html.match(/<section[^>]*id=["']songlrc["'][^>]*>([\s\S]*?)<\/section>/i);
  if (!section) return "";
  const lines = [];
  const pattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pattern.exec(section[1]))) {
    const text = textOf(match[1]).replace(/^\uFEFF/, "").trim();
    if (text) lines.push(text);
  }
  if (!lines.length) return "";
  const total = duration > 0 ? duration : lines.length * 4000;
  const step = Math.max(1800, Math.floor(total / lines.length));
  const stamp = (ms) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return `[${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.00]`;
  };
  return lines.map((line, index) => `${stamp(index * step)}${line}`).join("\n");
}

export async function home() {
  let tracks = [];
  try {
    tracks = parseCards(await pageHtml("/choicemsc/"));
  } catch (error) {
    tracks = [];
  }
  const sections = [];
  if (tracks.length) {
    sections.push({
      title: "每日热歌精选",
      tracks,
      morePage: "daily:1",
      pageTitle: "每日热歌精选",
      subtitle: "动感酷音乐每日更新",
    });
  }
  sections.push({
    title: "栏目",
    links: [
      { title: "每日热歌精选", subtitle: "每天更新的热歌赏析", page: "daily:1" },
      { title: "近期更新", subtitle: "最新发行歌曲", page: "newsong" },
    ],
  });
  return { title: "动感酷音乐", subtitle: "高品质 MP3 试听与下载", sections };
}

export async function browse({ page }) {
  const daily = page.match(/^daily:(\d+)$/);
  if (daily) {
    const index = Number(daily[1]);
    const html = await pageHtml(index === 1 ? "/choicemsc/" : `/choicemsc/?page=${index}`);
    const tracks = parseCards(html);
    const sections = [{ title: "每日热歌精选", tracks }];
    const links = [];
    if (index > 1) links.push({ title: t("Previous"), subtitle: `第 ${index - 1} 页`, page: `daily:${index - 1}` });
    if (new RegExp(`/choicemsc/?page=${index + 1}`).test(html)) {
      links.push({ title: t("Next"), subtitle: `第 ${index + 1} 页`, page: `daily:${index + 1}` });
    }
    if (links.length) sections.push({ title: t("Pages"), links });
    return { title: "每日热歌精选", subtitle: `第 ${index} 页`, sections };
  }
  if (page === "newsong") {
    const html = await pageHtml("/newsong/");
    return {
      title: "近期更新",
      subtitle: "最新发行歌曲",
      sections: [{ title: "近期更新", tracks: parseCards(html) }],
    };
  }
  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind, offset = 0 }) {
  if ((kind || "tracks") !== "tracks") return { tracks: [], more: false };
  const term = String(query || "").trim();
  if (!term || offset > 0) return { tracks: [], more: false };
  const html = await pageHtml(`/srct/?kwd=${encodeURIComponent(term)}`);
  return { tracks: parseCards(html), more: false };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const tracks = parseCards(await pageHtml(`/srct/?kwd=${encodeURIComponent(term)}`));
    return tracks
      .slice(0, 10)
      .map((track) => (track.artists.length ? `${track.artists[0].name} - ${track.name}` : track.name));
  } catch (error) {
    return [];
  }
}

export async function lyrics({ id }) {
  try {
    const html = await pageHtml(`/choicemscdet/${id}`);
    const duration = parseDuration(html);
    const lrc = linesToLrc(html, duration);
    return lrc ? { lrc } : {};
  } catch (error) {
    return {};
  }
}

export async function stream({ id }) {
  const html = await pageHtml(`/choicemscdet/${id}`);
  const song = parseSong(html, id);
  if (!song.audio) throw fail("unavailable", "这首歌暂时没有可用的音频");
  const path = song.audio.split("?")[0].toLowerCase();
  let type = "mp3";
  if (path.endsWith(".flac")) type = "flac";
  else if (path.endsWith(".ogg")) type = "ogg";
  else if (path.endsWith(".m4a")) type = "m4a";
  return { url: song.audio, type, headers: { referer: `${BASE}/choicemscdet/${id}` } };
}

export function like({ id, on }) {
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
  }
  keep("liked", [...ids]);
}

export function isLiked({ ids }) {
  const liked = new Set(stored("liked", []));
  return Object.fromEntries(ids.map((id) => [id, liked.has(id)]));
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
