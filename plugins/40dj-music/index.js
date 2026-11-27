// 显示名：水晶DJ网（40dj-music）
// MyGo Music plugin — 水晶DJ网 (www.40dj.com)
//
// 站点是 CSCMS 4.0，曲目页 /music/info-<id> 里带播放器配置，音频直链
// 藏在 JSON 的 "url" 字段（旧模板则直接给 <audio src>）。列表页与搜索页
// 都是服务端 HTML：
//
//   GET /sitemap.xml                  RSS 2.0，最近 100 首（标题 + /music/info-<id>）
//   GET /music/                       最近更新
//   GET /music/search?key=<kw>&page=N 搜索，20 条一页
//   GET /music/info-<id>              单曲，含编号/类型/格式/音质/大小/时长
//   GET /music/radio-<id>             DJ 歌单
//   GET /music/down/<id>.html         下载页，登录后才给正式下载
//
// 站点对云主机出口偶尔 503，插件按真实状态报错，不伪造地址。
// 分类页由 CSCMS 动态生成，路径不稳定；分类入口统一走站内搜索，
// 结果仍是站点真实的分类标签，避免写死会失效的列表地址。

const BASE = "https://www.40dj.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HEAD = {
  "user-agent": UA,
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.5",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const PAGE_SIZE = 20;
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
  const ms = options.timeout || 18000;
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  if (controller) init.signal = controller.signal;
  const timer = setTimeout(() => {
    if (controller) controller.abort();
  }, ms);
  try {
    const res = await fetch(url, init);
    if (res.status === 404) throw fail("not-found", t("站点没有这个页面"));
    if (res.status === 403) throw fail("blocked", t("站点拒绝了请求，请稍后再试"));
    if (res.status >= 500) throw fail("unavailable", t("站点暂时不可用（HTTP " + res.status + "）"));
    if (!res.ok) throw fail("unavailable", t("站点返回异常（HTTP " + res.status + "）"));
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const pageCache = new Map();

async function html(path, options = {}) {
  const url = path.indexOf("http") === 0 ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.html;
  const res = await request(url, options);
  const text = await res.text();
  pageCache.set(url, { at: Date.now(), html: text });
  return text;
}

/* ------------------------------------------------------------------- parsing */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(value) {
  return String(value == null ? "" : value).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, name) => {
    const key = String(name).toLowerCase();
    if (key[0] === "#") {
      const code = key[1] === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return Number.isFinite(code) ? String.fromCharCode(code) : whole;
    }
    return ENTITIES[key] || whole;
  });
}

function textOf(value) {
  return decode(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function imageUrl(value) {
  const raw = decode(value || "").trim();
  if (!raw) return undefined;
  if (raw.indexOf("//") === 0) return "https:" + raw;
  if (raw.indexOf("http") === 0) return raw;
  if (raw.indexOf("/") === 0) return BASE + raw;
  return raw;
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDuration(text) {
  const source = String(text || "");
  let match = /(?:TIME|时长|时间)\s*[:：]?\s*(\d{1,2}):(\d{2}):(\d{2})/i.exec(source);
  if (match) {
    return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
  }
  match = /(?:TIME|时长|时间)\s*[:：]?\s*(\d{1,3}):(\d{2})/i.exec(source);
  if (match) return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  match = /(\d{1,3})\s*分\s*(\d{1,2})\s*秒/.exec(source);
  if (match) return (Number(match[1]) * 60 + Number(match[2])) * 1000;
  return undefined;
}

function parseSize(text) {
  const match = /(?:SIZE|大小)\s*[:：]?\s*([\d.]+)\s*(KB|MB|GB)/i.exec(String(text || ""));
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (!Number.isFinite(value)) return undefined;
  return Math.round(value * (unit === "GB" ? 1073741824 : unit === "MB" ? 1048576 : 1024));
}

function artistsOf(name) {
  const clean = String(name || "").replace(/^\s*【[^】]*】\s*/, "").trim();
  const match = /^(.{1,28}?)\s*[-–—]\s*(.+)$/.exec(clean);
  if (!match) return [];
  return [{ name: match[1].trim() }];
}

function trackOf(id, name, extra = {}) {
  return Object.assign(
    {
      id: String(id),
      name: name,
      artists: artistsOf(name),
    },
    extra
  );
}

/* RSS sitemap:
   <item><title>...</title><link>https://www.40dj.com/music/info-147205</link>
   <pubDate>2026-11-27 15:05:24</pubDate></item> */
function parseRss(source) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = re.exec(String(source || "")))) {
    const chunk = match[1];
    const title = decode(textOf((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(chunk) || [])[1] || ""));
    const link = decode(textOf((/<link[^>]*>([\s\S]*?)<\/link>/i.exec(chunk) || [])[1] || ""));
    const id = (/\/music\/info-(\d+)/i.exec(link) || [])[1];
    if (!title || !id) continue;
    const date = textOf((/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i.exec(chunk) || [])[1] || "");
    items.push(trackOf(id, title, { description: date || undefined }));
  }
  return items;
}

/* CSCMS list markup is loose between skins. Read every /music/info-<id>
   anchor, then take the enclosing <li> (or a nearby window) for cover and
   category/date/bitrate. Duplicate cover + title anchors collapse by id. */
function parseList(source) {
  const page = String(source || "");
  const rows = [];
  const seen = new Set();
  const anchor = /<a[^>]+href=["']([^"']*\/music\/info-(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(page))) {
    const id = match[2];
    if (seen.has(id)) continue;
    const start = page.lastIndexOf("<li", match.index);
    const end = page.indexOf("</li>", match.index);
    const chunk =
      start >= 0 && end > match.index ? page.slice(start, end + 5) : page.slice(Math.max(0, match.index - 500), match.index + 1200);
    const attrs = match[0];
    const titleAttr = decode((/title=["']([^"']*)["']/i.exec(attrs) || [])[1] || "");
    const inner = textOf(match[3]);
    const name = titleAttr || inner;
    if (!name || /^[\d\s.]+$/.test(name)) continue;

    const plain = textOf(chunk);
    const spans = [];
    const spanRe = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let span;
    while ((span = spanRe.exec(chunk))) {
      const value = textOf(span[1]);
      if (value) spans.push(value);
    }
    const category =
      spans.find((value) => /^[\u4e00-\u9fa5A-Za-z]{1,8}(?:\/[A-Za-z/]{1,16}){1,3}$/.test(value)) ||
      (/^(?:\s*)([\u4e00-\u9fa5]{1,8}(?:\/[A-Za-z]+){1,3})(?=\s*(?:\||20\d{2}))/m.exec(plain) || [])[1] ||
      "";
    const date = (/20\d{2}-\d{2}-\d{2}/.exec(plain) || [])[0] || "";
    const cover = imageUrl((/<img[^>]+src=["']([^"']+)["']/i.exec(chunk) || [])[1]);

    rows.push(
      trackOf(id, name, {
        imageUrl: cover,
        duration: parseDuration(plain),
        album: category ? { name: category } : undefined,
        description: date || undefined,
      })
    );
    seen.add(id);
  }
  return rows;
}

function parseInfo(source, id) {
  const page = String(source || "");
  const body = textOf(page);
  const name =
    textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page) || [])[1] || "") ||
    textOf((/<title>([\s\S]*?)<\/title>/i.exec(page) || [])[1] || "").replace(/\s*-\s*水晶DJ网.*$/, "");

  const urls = [];
  const push = (value) => {
    let raw = decode(value || "")
      .replace(/\\\//g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=")
      .trim();
    if (!raw || raw.indexOf("javascript") === 0 || raw.indexOf("data:") === 0) return;
    if (raw.indexOf("//") === 0) raw = "https:" + raw;
    else if (raw.indexOf("/") === 0) raw = BASE + raw;
    else if (raw.indexOf("http") !== 0) return;
    if (urls.indexOf(raw) < 0) urls.push(raw);
  };

  let found;
  const jsonUrl = /["']url["']\s*:\s*["']([^"']+)["']/gi;
  while ((found = jsonUrl.exec(page))) push(found[1]);
  const escapedUrl = /url\s*:\s*\\?["']([^"']+)["']/gi;
  while ((found = escapedUrl.exec(page))) push(found[1]);
  const audio = /<audio[^>]+src=["']([^"']+)["']/gi;
  while ((found = audio.exec(page))) push(found[1]);
  const sourceTag = /<source[^>]+src=["']([^"']+)["']/gi;
  while ((found = sourceTag.exec(page))) push(found[1]);

  const score = (url) => {
    if (/\.(mp3|m4a|aac|flac|ogg|wav)(?:[?#]|$)/i.test(url)) return 100;
    if (/\.(mp3|m4a|aac|flac|ogg|wav)/i.test(url)) return 80;
    if (/\/upload|\/uploads|\/media|\/data|\/mp3|\/music\/file/i.test(url)) return 50;
    return 0;
  };
  urls.sort((a, b) => score(b) - score(a));
  const audioUrl = urls[0] || "";

  const category = (/类型[:：]\s*([^\s/]+(?:\/[^\s]+)*)/.exec(body) || [])[1] || "";
  const sizeText = (/大小[:：]\s*([\d.]+\s*(?:MB|GB|KB))/i.exec(body) || [])[1] || "";
  const cover = imageUrl(
    (/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(page) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(page) ||
      [])[1]
  );
  const duration = parseDuration(body) || lastClock(body);
  const date = (/发布时间[:：]\s*(20\d{2}-\d{2}-\d{2})/.exec(body) || [])[1] || (/\b20\d{2}-\d{2}-\d{2}\b/.exec(body) || [])[0];
  return { name: name || t("舞曲"), audioUrl: audioUrl, category: category, sizeText: sizeText, cover: cover, duration: duration, date: date };
}

/* 曲目页只把「00:00」「05:26」这样的播放器时间摆在正文里，没有 TIME 前缀。
   取最后一个时钟值，前面那个 00:00 是播放进度起点。 */
function lastClock(source) {
  const times = [];
  const re = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;
  let match;
  while ((match = re.exec(String(source || "")))) {
    const first = match[1] == null ? 0 : Number(match[1]);
    const second = Number(match[2]);
    const third = Number(match[3]);
    if (second > 59 || third > 59) continue;
    times.push(match[1] == null ? (first * 60 + second) * 1000 : (first * 3600 + second * 60 + third) * 1000);
  }
  return times.length ? times[times.length - 1] : undefined;
}

/* ------------------------------------------------------------------ browsing */

const CATEGORY_QUERIES = {
  串烧舞曲: "串烧",
  中文舞曲: "中文",
  慢歌连版: "慢歌",
  纯音乐车载: "车载",
  外文舞曲: "外文",
  交谊舞曲: "交谊",
};

const HOT = ["串烧", "中文", "慢歌", "车载", "外文", "交谊", "抖音", "Electro"];

async function rss() {
  const res = await request("/sitemap.xml", {
    headers: { accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8" },
  });
  return parseRss(await res.text());
}

export async function home() {
  const sections = [];
  const items = await rss();
  const latest = items.slice(0, 20);
  if (latest.length) {
    remember(latest);
    sections.push({ title: t("最新上传"), tracks: latest, morePage: "latest/1" });
  }
  const more = items.slice(20, 40);
  if (more.length) {
    remember(more);
    sections.push({ title: t("刚刚更新"), tracks: more, morePage: "latest/2" });
  }

  sections.push({
    title: t("分类"),
    links: Object.keys(CATEGORY_QUERIES).map((name) => ({
      title: t(name),
      page: "category/" + name,
    })),
  });
  sections.push({
    title: t("DJ歌单"),
    links: [
      { title: t("斯堪尼亚战歌"), page: "radio/341" },
      { title: t("DJ歌单 6"), page: "radio/6" },
      { title: t("DJ歌单 3"), page: "radio/3" },
      { title: t("DJ歌单 4"), page: "radio/4" },
      { title: t("DJ歌单 317"), page: "radio/317" },
      { title: t("DJ歌单 9"), page: "radio/9" },
    ],
  });

  return {
    title: t("水晶DJ网"),
    subtitle: t("抖音DJ · 高品质正版DJ免费下载"),
    sections: sections,
  };
}

export async function browse({ page }) {
  const path = String(page || "").trim();
  const parts = path.split("/").filter(Boolean);
  const head = parts[0] || "";
  const pageNo = Number(parts[parts.length - 1]) || 1;

  if (head === "" || head === "latest") {
    const items = await rss();
    const start = (pageNo - 1) * PAGE_SIZE;
    const chunk = items.slice(start, start + PAGE_SIZE);
    remember(chunk);
    return {
      title: t("最近更新舞曲"),
      sections: [
        {
          title: t("最近更新舞曲"),
          tracks: chunk,
          morePage: chunk.length && start + PAGE_SIZE < items.length ? "latest/" + (pageNo + 1) : undefined,
        },
      ],
    };
  }

  if (head === "category") {
    const name = decodeURIComponent(parts.slice(1).join("/"));
    const keyword = CATEGORY_QUERIES[name] || name;
    const result = await search({ query: keyword, offset: 0 });
    return { title: name, sections: [{ title: name, tracks: result.tracks }] };
  }

  if (head === "radio") {
    if (parts.length === 1) {
      return {
        title: t("DJ歌单"),
        sections: [
          {
            title: t("DJ歌单"),
            links: [
              { title: t("斯堪尼亚战歌"), page: "radio/341" },
              { title: t("DJ歌单 6"), page: "radio/6" },
              { title: t("DJ歌单 3"), page: "radio/3" },
              { title: t("DJ歌单 4"), page: "radio/4" },
              { title: t("DJ歌单 317"), page: "radio/317" },
              { title: t("DJ歌单 9"), page: "radio/9" },
            ],
          },
        ],
      };
    }
    const sheet = await album({ id: parts.slice(1).join("/") });
    return {
      title: sheet.album.name,
      imageUrl: sheet.album.imageUrl,
      description: sheet.album.description,
      sections: [{ title: t("歌单曲目"), tracks: sheet.tracks }],
    };
  }

  if (head === "info") {
    const info = await infoOf(parts[1]);
    const track = trackOf(parts[1], info.name, {
      imageUrl: info.cover,
      album: info.category ? { name: info.category } : undefined,
      duration: info.duration,
      description: info.date,
    });
    remember([track]);
    return { title: track.name, sections: [{ title: t("舞曲"), tracks: [track] }] };
  }

  if (head === "search") {
    const keyword = decodeURIComponent(parts.slice(1).join("/"));
    const result = await search({ query: keyword, offset: 0 });
    return { title: keyword, sections: [{ title: t("搜索结果"), tracks: result.tracks }] };
  }

  throw fail("not-found", t("没有这个页面"));
}

function hasNext(source, pageNo) {
  const next = Number(pageNo || 1) + 1;
  return new RegExp("(?:page=" + next + "\\b|\\/" + next + "\\b)", "i").test(String(source || ""));
}

/* ------------------------------------------------------------------- search */

export async function search({ query, offset, kind }) {
  const keyword = String(query || "").trim();
  if (!keyword) throw fail("invalid", t("请输入搜索内容"));
  if (kind && kind !== "tracks") return { albums: [], more: false };

  const start = Math.max(0, Number(offset) || 0);
  const pageNo = Math.floor(start / PAGE_SIZE) + 1;
  const skip = start % PAGE_SIZE;
  const url = "/music/search?key=" + encodeURIComponent(keyword) + (pageNo > 1 ? "&page=" + pageNo : "");
  const data = await html(url);
  const all = parseList(data);
  const tracks = all.slice(skip, skip + PAGE_SIZE);
  remember(tracks);
  return { tracks: tracks, more: tracks.length > 0 && (all.length >= PAGE_SIZE || hasNext(data, pageNo)) };
}

export function suggest({ query }) {
  const word = String(query || "").trim();
  if (!word) return HOT.slice(0, 6);
  const hits = HOT.filter((item) => item.indexOf(word) >= 0 || word.indexOf(item) >= 0);
  return (hits.length ? hits : HOT).slice(0, 6);
}

/* -------------------------------------------------------------- album/artist */

async function infoOf(id) {
  const data = await html("/music/info-" + encodeURIComponent(String(id)));
  const info = parseInfo(data, id);
  if (!info.name) throw fail("not-found", t("这首取不到信息"));
  return info;
}

export async function album({ id }) {
  const key = String(id || "").replace(/^radio-/, "");
  const data = await html("/music/radio-" + encodeURIComponent(key));
  const tracks = parseList(data);
  const name =
    textOf((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(data) || [])[1] || "") ||
    textOf((/<title>([\s\S]*?)<\/title>/i.exec(data) || [])[1] || "").replace(/\s*-\s*水晶DJ网.*$/, "") ||
    t("DJ歌单");
  const cover = imageUrl(
    (/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(data) || [])[1]
  );
  remember(tracks);
  return {
    album: { id: key, name: name, imageUrl: cover, description: t("共 {count} 首").replace("{count}", String(tracks.length)) },
    tracks: tracks,
    more: false,
  };
}

export async function artist({ id }) {
  return { artist: { id: String(id), name: t("制作人") }, tracks: [], more: false };
}

/* ------------------------------------------------------------------- playing */

export async function stream({ id }) {
  const info = await infoOf(id);
  let audio = info.audioUrl;
  if (!audio) {
    /* 下载页在部分模板里才是最终 302 地址；登录墙外先试一次，失败就如实报错。 */
    try {
      const down = await html("/music/down/" + encodeURIComponent(String(id)) + ".html", { timeout: 15000 });
      audio = parseInfo(down, id).audioUrl;
    } catch (error) {
      /* 保留原始«没有地址»错误 */
    }
  }
  if (!audio) throw fail("unavailable", t("这首没有可播放的地址"));
  const ext = (/\.(mp3|m4a|aac|flac|ogg|wav)(?:[?#]|$)/i.exec(audio) || [])[1] || "mp3";
  return {
    url: audio,
    type: ext.toLowerCase(),
    size: parseSize("大小 " + (info.sizeText || "")),
    headers: { referer: BASE + "/music/info-" + String(id), "user-agent": UA },
  };
}

export function lyrics() {
  return { lrc: "" };
}

/* ------------------------------------------------------------- local library */

const index = host.storage.get("trackIndex") || {};

function remember(tracks) {
  let changed = false;
  for (const track of tracks || []) {
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
