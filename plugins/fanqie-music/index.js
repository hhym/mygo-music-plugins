// 显示名：番茄音乐（fanqie-music）
// MyGo Music plugin — 番茄音乐 / novelfm.com
//
// 站点是番茄音乐的 PC 网页版，页面由 SSR 直出，数据在 window._ROUTER_DATA 里：
//   home     GET  /                 热门歌曲卡片（约 200 首）
//   song     GET  /music/<id>       页面数据：api_book_info + video_info.main_url + lyric_info
//   audio    https://v26-novelfm.novelfmvod.com/...  m4a（audio_mp4），Range 回 206
// 站点本身没有搜索接口，搜索在本地索引上做：首页 200 首按歌名 / 歌手 / 专辑匹配。

const BASE = "https://www.novelfm.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  referer: BASE + "/",
};

const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function decode(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
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
        return Number.isFinite(code) ? String.fromCharCode(code) : match;
      }
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

async function request(url, ms = 15000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller && controller.abort(), ms);
  try {
    const res = await fetch(url, { headers: HEAD, signal: controller ? controller.signal : undefined });
    if (res.status >= 400) throw fail("unavailable", res.status + " " + url);
    return await res.text();
  } catch (error) {
    if (error && error.name === "AbortError") throw fail("timeout", "请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function routerData(html) {
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!match) throw fail("unavailable", t("页面结构变了，取不到数据"));
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw fail("unavailable", t("页面数据解析失败"));
  }
}

function pageDataOf(html) {
  const data = routerData(html);
  const loader = (data && data.loaderData) || {};
  const page = loader["music_(id)/page"] || loader["music_(id)/layout"] || null;
  const payload = page && (page.pageData || page);
  if (!payload) throw fail("unavailable", t("这首歌暂时播放不了"));
  return payload;
}

/* ------------------------------------------------------------------ */
/* 首页与索引                                                          */
/* ------------------------------------------------------------------ */

const CARD_RE = /<a class="pc-music-card-grid-item" href="\/music\/(\d+)">([\s\S]*?)<\/a>/g;

function cardsFrom(html) {
  const out = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html))) {
    const body = match[2];
    const name = decode((body.match(/pc-music-card-grid-name">([\s\S]*?)<\/div>/) || [])[1]);
    if (!name) continue;
    const subtitle = decode((body.match(/pc-music-card-grid-subtitle-text">([\s\S]*?)<\/span>/) || [])[1]);
    const cover = decode((body.match(/data-src="([^"]+)"/) || [])[1] || "").replace(/^http:/, "https:");
    const listeners = decode((body.match(/pc-music-card-grid-listeners-num">([\s\S]*?)<\/span>/) || [])[1]);
    let artist = "";
    let album = "";
    if (subtitle) {
      const sep = subtitle.indexOf(" · ");
      artist = (sep >= 0 ? subtitle.slice(0, sep) : subtitle).trim();
      album = sep >= 0 ? subtitle.slice(sep + 3).trim() : "";
    }
    out.push({
      id: match[1],
      name: name,
      artists: artist ? [{ id: "n:" + artist, name: artist }] : [],
      album: album ? { id: match[1], name: album } : undefined,
      imageUrl: cover,
      listeners: listeners || undefined,
    });
  }
  return out;
}

function trackOf(card) {
  return {
    id: card.id,
    name: card.name,
    artists: card.artists,
    album: card.album,
    imageUrl: card.imageUrl || undefined,
  };
}

function homeCache() {
  const raw = host.storage.get("home");
  if (raw && Date.now() - raw.at < 30 * 60 * 1000 && raw.tracks && raw.tracks.length) return raw.tracks;
  return null;
}

async function homeTracks() {
  const cached = homeCache();
  if (cached) return cached;
  const html = await request(BASE + "/");
  const cards = cardsFrom(html);
  if (!cards.length) throw fail("unavailable", t("首页没有解析到歌曲"));
  host.storage.set("home", { at: Date.now(), tracks: cards });
  return cards;
}

export async function home() {
  const cards = await homeTracks();
  const tracks = cards.map(trackOf);
  return {
    sections: [
      { title: t("热门歌曲"), more: false, tracks: tracks.slice(0, 100) },
      { title: t("更多热门"), more: false, tracks: tracks.slice(100) },
    ],
  };
}

export async function charts() {
  const cards = await homeTracks();
  return {
    sections: [{ title: t("热门歌曲"), tracks: cards.map(trackOf) }],
    title: t("热门歌曲"),
  };
}

export async function search({ keyword, page = 1 }) {
  const query = String(keyword || "").trim().toLowerCase();
  if (!query) return { tracks: [], albums: [], artists: [], more: false };
  const cards = homeCache() || (await homeTracks());
  if (!cards.length) throw fail("unavailable", t("首页没有解析到歌曲"));
  const matched = cards.filter((card) => {
    const title = card.name.toLowerCase();
    const artist = (card.artists[0] && card.artists[0].name ? card.artists[0].name : "").toLowerCase();
    const album = (card.album && card.album.name ? card.album.name : "").toLowerCase();
    return title.indexOf(query) >= 0 || artist.indexOf(query) >= 0 || album.indexOf(query) >= 0;
  });
  return {
    tracks: page === 1 ? matched.slice(0, 50) : [],
    albums: [],
    artists: [],
    more: false,
    note: t("番茄网页版没有搜索接口，结果来自首页热门歌曲索引"),
  };
}

export async function album({ id }) {
  const songId = String(id).replace(/^al:/, "");
  const payload = await songDetail(songId);
  const info = payload.api_book_info || {};
  const track = trackFromPayload(songId, payload);
  return {
    album: {
      id: songId,
      name: info.album_title || info.book_name || track.name,
      imageUrl: info.thumb_url || undefined,
      description: info.abstract || undefined,
    },
    tracks: [track],
  };
}

export async function artist({ id }) {
  const name = String(id).replace(/^n:/, "");
  const cards = homeCache() || (await homeTracks());
  const matched = cards.filter((card) => {
    const artist = card.artists[0] && card.artists[0].name ? card.artists[0].name : "";
    return artist.indexOf(name) >= 0 || name.indexOf(artist) >= 0;
  });
  return {
    artist: { id: "n:" + name, name: name },
    tracks: matched.map(trackOf),
  };
}

/* ------------------------------------------------------------------ */
/* 歌曲详情 / 歌词 / 播放                                               */
/* ------------------------------------------------------------------ */

const detailCache = new Map();

async function songDetail(id) {
  const key = String(id);
  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
  const html = await request(BASE + "/music/" + encodeURIComponent(key));
  const payload = pageDataOf(html);
  detailCache.set(key, { at: Date.now(), data: payload });
  return payload;
}

function trackFromPayload(id, payload) {
  const info = payload.api_book_info || {};
  return {
    id: String(id),
    name: info.book_name || info.album_title || String(id),
    artists: info.author ? [{ id: "n:" + info.author, name: info.author }] : [],
    album: {
      id: String(id),
      name: info.album_title || info.book_name || "",
      imageUrl: info.thumb_url || undefined,
    },
    imageUrl: info.thumb_url || undefined,
  };
}

export async function song({ id }) {
  const payload = await songDetail(id);
  return { track: trackFromPayload(id, payload) };
}

export async function lyrics({ id }) {
  const payload = await songDetail(id);
  const raw = String(payload.lyric_info || "");
  if (!raw) return { lrc: "" };
  const lines = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!match) continue;
    const start = Number(match[1]);
    const text = match[3].replace(/<\d+,\d+,\d+>/g, "").trim();
    if (!text) continue;
    lines.push({ at: start, text: text });
  }
  lines.sort((a, b) => a.at - b.at);
  const lrc = lines
    .map((line) => {
      const seconds = line.at / 1000;
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(Math.floor(seconds % 60)).padStart(2, "0");
      const cs = String(Math.floor((seconds % 1) * 100)).padStart(2, "0");
      return "[" + mm + ":" + ss + "." + cs + "]" + line.text;
    })
    .join("\n");
  return { lrc: lrc };
}

async function audioSize(url) {
  try {
    const res = await fetch(url, {
      headers: Object.assign({}, HEAD, { range: "bytes=0-1" }),
    });
    if (!res.ok && res.status !== 206) return 0;
    const range = res.headers.get("content-range") || "";
    const total = Number((range.match(/\/\s*(\d+)/) || [])[1]);
    if (total > 0) return total;
    return Number(res.headers.get("content-length")) || 0;
  } catch (error) {
    return 0;
  }
}

export async function stream({ id }) {
  const payload = await songDetail(id);
  const video = payload.video_info || {};
  const url = video.main_url || video.back_url || "";
  if (!url) throw fail("unavailable", t("这首歌没有可播放的地址"));
  const size = await audioSize(url);
  return {
    url: url,
    type: "m4a",
    size: size || undefined,
    headers: { referer: BASE + "/", "user-agent": UA },
  };
}
