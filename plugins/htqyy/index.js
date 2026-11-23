// 显示名：好听轻音乐（htqyy）
// 好听轻音乐网（htqyy.com）— MyGo Music 插件
//
// 站点是 ASP.NET 老站，列表是服务端渲染或 AJAX 返回的 /play/<id> 卡片，
// 播放页内嵌 fileHost 与 mp3 路径，音频服务器要求带 Referer。

const BASE = "http://www.htqyy.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const PAGE_TTL = 2 * 60 * 1000;
const PAGE_SIZE = 30;

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

const pageCache = new Map();

async function read(path) {
  const url = path.startsWith("http") ? path : BASE + path;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": UA,
        referer: REFERER,
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
      },
    });
  } catch (error) {
    throw new Error(`连不上好听轻音乐网：${error && error.message ? error.message : error}`);
  }
  if (!response.ok) throw fail("unavailable", `好听轻音乐网返回了 ${response.status}`);
  return response.text();
}

async function pageHtml(path) {
  const url = path.startsWith("http") ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.html;
  const html = await read(url);
  pageCache.set(url, { html, at: Date.now() });
  if (pageCache.size > 80) {
    const oldest = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) pageCache.delete(oldest[0]);
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
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\s\u00a0]+/g, " ")
    .trim();
}

function sizedImage(url) {
  if (!url) return "";
  let out = String(url).split("?")[0].trim();
  if (out.startsWith("//")) out = "http:" + out;
  return out;
}

function blockList(html, marker) {
  return String(html).split(new RegExp(`<li[^>]*class=["'][^"']*(?:${marker})[^"']*["'][^>]*>`, "i")).slice(1);
}

function blockOf(piece) {
  return piece.split(/<\/li>/i)[0];
}

function rememberTracks(tracks) {
  for (const track of tracks || []) {
    if (track && track.id) knownTracks.set(track.id, track);
  }
}

const knownTracks = new Map();

function trackBy(id) {
  return knownTracks.get(id) || stored("likedTracks", {})[id] || stored("historyTracks", {})[id] || null;
}

// 列表卡片：<li class="...post...">，里面有 /play/<id>、标题和封面。
function parseCards(html) {
  const list = [];
  const seen = new Set();
  for (const piece of blockList(html, "post")) {
    const block = blockOf(piece);
    const hit = block.match(/\/play\/(\d+)/);
    if (!hit || seen.has(hit[1])) continue;
    const anchor =
      block.match(/<h2[\s\S]*?<a[^>]*title=["']([^"']*)["']/i) ||
      block.match(/<a[^>]*class=["']zoom["'][^>]*title=["']([^"']*)["']/i) ||
      block.match(/<h2[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const name = anchor ? textOf(anchor[1]) : "";
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    const category = (block.match(/href=["']\/genre\/\d+["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "";
    if (!name) continue;
    list.push({
      id: hit[1],
      name,
      artists: [],
      album: { id: "", name: textOf(category), imageUrl: sizedImage(image) },
      duration: 0,
      url: `${BASE}/play/${hit[1]}`,
    });
    seen.add(hit[1]);
  }
  rememberTracks(list);
  return list;
}

// 搜索/榜单行：<li class="musicItem"> 或 <li class="songItem">，带歌手与专辑。
function parseRows(html) {
  const list = [];
  const seen = new Set();
  for (const piece of blockList(html, "musicItem|songItem|mItem")) {
    const block = blockOf(piece);
    const hit = block.match(/\/play\/(\d+)/);
    if (!hit || seen.has(hit[1])) continue;
    const titleAnchor =
      block.match(/<a[^>]*class=["']song["'][^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<span[^>]*class=["']title["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const name = titleAnchor ? textOf(titleAnchor[1]) : "";
    const artistAnchor = block.match(/<span[^>]*class=["']artistName["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const artist = artistAnchor ? textOf(artistAnchor[1]) : "";
    const albumAnchor = block.match(/<span[^>]*class=["']albumName["'][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const album = albumAnchor ? textOf(albumAnchor[1]) : "";
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    if (!name) continue;
    list.push({
      id: hit[1],
      name,
      artists: artist ? [{ id: "", name: artist }] : [],
      album: { id: "", name: album, imageUrl: sizedImage(image) },
      duration: 0,
      url: `${BASE}/play/${hit[1]}`,
    });
    seen.add(hit[1]);
  }
  rememberTracks(list);
  return list;
}

const GENRES = [
  { id: "1", name: "纯音乐" },
  { id: "2", name: "新世纪" },
  { id: "3", name: "钢琴曲" },
  { id: "4", name: "减压放松" },
  { id: "5", name: "中国音乐" },
  { id: "6", name: "天籁之音" },
  { id: "7", name: "影视原声" },
  { id: "8", name: "电子乐" },
  { id: "9", name: "背景音乐" },
  { id: "13", name: "佛乐" },
];

const CHARTS = [
  { slug: "hot", title: "热播榜", path: "/top/hot" },
  { slug: "latest", title: "最新榜", path: "/top/latest" },
  { slug: "top", title: "总榜", path: "/top" },
];

function chartOf(slug) {
  const chart = CHARTS.find((item) => item.slug === slug);
  if (!chart) throw fail("unavailable", "没有这个榜单");
  return chart;
}

async function choicePage(page) {
  const index = Math.max(0, page - 1);
  const html = await read(`/choice/musicList?pageIndex=${index}&pageSize=${PAGE_SIZE}&order=choice`);
  const tracks = parseCards(html);
  const totalMatch = html.match(/totalCount\s*=\s*(\d+)/i) || html.match(/共\s*(\d+)\s*首/);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const sections = [{ title: "轻音乐精选", tracks }];
  const links = [];
  if (page > 1) links.push({ title: t("Previous"), subtitle: `第 ${page - 1} 页`, page: `choice:${page - 1}` });
  if (tracks.length >= PAGE_SIZE && (!total || page * PAGE_SIZE < total)) {
    links.push({ title: t("Next"), subtitle: `第 ${page + 1} 页`, page: `choice:${page + 1}` });
  }
  if (links.length) sections.push({ title: t("Pages"), links });
  return { title: "轻音乐精选", subtitle: `第 ${page} 页`, sections };
}

async function chartBrowse(slug) {
  const chart = chartOf(slug);
  const html = await pageHtml(chart.path);
  const tracks = parseRows(html);
  return {
    title: chart.title,
    subtitle: "好听轻音乐网",
    sections: [{ title: chart.title, tracks }],
  };
}

async function genreBrowse(id) {
  const genre = GENRES.find((item) => item.id === id);
  const html = await pageHtml(`/genre/${id}`);
  const tracks = parseRows(html);
  return { title: genre ? genre.name : "分类", sections: [{ title: genre ? genre.name : "分类", tracks }] };
}

export async function home() {
  let tracks = [];
  try {
    tracks = parseCards(await read(`/choice/musicList?pageIndex=0&pageSize=${PAGE_SIZE}&order=choice`));
  } catch (error) {
    tracks = parseCards(await pageHtml("/choice/6"));
  }
  const sections = [];
  if (tracks.length) {
    sections.push({ title: "轻音乐精选", tracks: tracks.slice(0, 30), morePage: "choice:1", pageTitle: "轻音乐精选", subtitle: "好听轻音乐网每日推荐" });
  }
  sections.push({
    title: t("Charts"),
    links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.slug}` })),
  });
  sections.push({
    title: t("Categories"),
    links: GENRES.map((genre) => ({ title: genre.name, page: `genre:${genre.id}` })),
  });
  return { title: "好听轻音乐", subtitle: "轻音乐、纯音乐在线试听", sections };
}

export async function browse({ page }) {
  const choice = page.match(/^choice:(\d+)$/);
  if (choice) return choicePage(Number(choice[1]));
  const chart = page.match(/^chart:([a-z]+)$/);
  if (chart) return chartBrowse(chart[1]);
  const genre = page.match(/^genre:(\d+)$/);
  if (genre) return genreBrowse(genre[1]);
  if (page === "charts") {
    const sections = [];
    for (const item of CHARTS) {
      try {
        sections.push({ title: item.title, tracks: parseRows(await pageHtml(item.path)).slice(0, 12), morePage: `chart:${item.slug}` });
      } catch (error) {
        // 单个榜单失败不影响整页
      }
    }
    sections.push({ title: "全部榜单", links: CHARTS.map((item) => ({ title: item.title, page: `chart:${item.slug}` })) });
    return { title: t("Charts"), subtitle: "热播、最新与总榜", sections };
  }
  if (page === "categories") {
    return { title: t("Categories"), sections: [{ title: "轻音乐分类", links: GENRES.map((genre) => ({ title: genre.name, page: `genre:${genre.id}` })) }] };
  }
  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind, offset = 0 }) {
  if ((kind || "tracks") !== "tracks") return { tracks: [], more: false };
  const term = String(query || "").trim();
  if (!term || offset > 0) return { tracks: [], more: false };
  const html = await pageHtml(`/home/search?wd=${encodeURIComponent(term)}`);
  return { tracks: parseRows(html), more: false };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const tracks = parseRows(await pageHtml(`/home/search?wd=${encodeURIComponent(term)}`));
    return tracks.slice(0, 10).map((track) => (track.artists.length ? `${track.artists[0].name} - ${track.name}` : track.name));
  } catch (error) {
    return [];
  }
}

export async function lyrics() {
  return {};
}

export async function stream({ id }) {
  const html = await pageHtml(`/play/${id}`);
  const hostMatch = html.match(/fileHost\s*=\s*["']([^"']+)["']/i);
  const pathMatch = html.match(/var\s+mp3\s*=\s*["']([^"']+)["']/i);
  if (!pathMatch) throw fail("unavailable", "这首歌暂时没有可用的音频");
  const host = hostMatch ? hostMatch[1] : "http://s1.htqyy.com/play9/";
  const url = host.replace(/\/?$/, "/") + pathMatch[1].replace(/^\/+/, "");
  return { url, type: "mp3", headers: { referer: REFERER } };
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
