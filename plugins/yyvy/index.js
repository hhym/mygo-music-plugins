// VY音乐网（yyvy.cn）— MyGo Music 插件
//
// 站点是原创音乐社区。歌曲列表有 `/api/songs?page=N&order=...` 接口，
// 单曲详情有 `/api/songs/<id>`，搜索与榜单则读网页。

const BASE = "https://www.yyvy.cn";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const REFERER = BASE + "/";
const PAGE_SIZE = 20;
const PAGE_TTL = 3 * 60 * 1000;

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

const htmlCache = new Map();
const jsonCache = new Map();

async function request(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": UA,
        referer: REFERER,
        accept: "application/json,text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
      },
    });
  } catch (error) {
    throw new Error(`连不上 VY 音乐网：${error && error.message ? error.message : error}`);
  }
  if (!response.ok) throw fail("unavailable", `VY 音乐网返回了 ${response.status}`);
  return response.text();
}

function cached(map, key, ttl) {
  const item = map.get(key);
  return item && Date.now() - item.at < ttl ? item.value : null;
}

function remember(map, key, value) {
  map.set(key, { value, at: Date.now() });
  if (map.size > 80) {
    const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) map.delete(oldest[0]);
  }
}

async function pageHtml(path) {
  const url = path.startsWith("http") ? path : BASE + path;
  const hit = cached(htmlCache, url, PAGE_TTL);
  if (hit) return hit;
  const html = await request(url);
  remember(htmlCache, url, html);
  return html;
}

async function apiSongs(page, order) {
  const key = `${page}:${order || "latest"}`;
  const hit = cached(jsonCache, key, PAGE_TTL);
  if (hit) return hit;
  const url = `${BASE}/api/songs?page=${page}${order ? `&order=${order}` : ""}`;
  const text = await request(url);
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw fail("unavailable", "VY 音乐网的歌曲接口返回了无法解析的内容");
  }
  const list = Array.isArray(data.result) ? data.result : [];
  remember(jsonCache, key, list);
  return list;
}

async function songData(id) {
  const key = `song:${id}`;
  const hit = cached(jsonCache, key, PAGE_TTL);
  if (hit) return hit;
  const text = await request(`${BASE}/api/songs/${encodeURIComponent(id)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw fail("unavailable", "VY 音乐网的歌曲接口返回了无法解析的内容");
  }
  if (!data || data.code !== 0 || !data.result) throw fail("unavailable", "这首歌暂时无法读取");
  remember(jsonCache, key, data.result);
  return data.result;
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

function sizedImage(url) {
  if (!url) return "";
  let out = String(url).trim();
  if (out.startsWith("//")) out = "https:" + out;
  return out;
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

function songToTrack(song) {
  const sub = song.sub || {};
  return {
    id: String(song.id),
    name: String(song.name || "").trim(),
    artists: song.artist_name ? [{ id: String(song.artist_id || ""), name: String(song.artist_name) }] : [],
    album: {
      id: song.album_id ? String(song.album_id) : "",
      name: String(song.album_name || ""),
      imageUrl: sizedImage(song.cover_url || ""),
    },
    duration: Number(sub.play_time || 0),
    url: `${BASE}${song.url || `/music/${song.id}.html`}`,
  };
}

function parseSongRows(html) {
  const list = [];
  const seen = new Set();
  const pieces = String(html).split(/<div[^>]*class=["'][^"']*song_list[^"']*["'][^>]*>/i).slice(1);
  for (const piece of pieces) {
    // 行内有嵌套 div，取到分隔线之前，避免在歌手列之前被截断。
    const block = piece.split(/<hr/i)[0].slice(0, 1800);
    const idMatch = block.match(/\/music\/(\d+)\.html/);
    if (!idMatch || seen.has(idMatch[1])) continue;
    const titleBlock =
      block.match(/<a[^>]*target=["']_play["'][^>]*>([\s\S]*?)<\/a>/i) ||
      block.match(/<a[^>]*href=["']\/music\/\d+\.html["'][^>]*>([\s\S]*?)<\/a>/i);
    const name = titleBlock ? textOf(titleBlock[1]) : "";
    if (!name) continue;
    const singerBlock = block.match(/<a[^>]*class=["'][^"']*singer[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const artist = singerBlock ? textOf(singerBlock[1]) : "";
    const artistIdMatch = singerBlock ? (singerBlock[0].match(/\/artist\/(\d+)\.html/) || [])[1] || "" : "";
    const genreBlock = block.match(/<a[^>]*href=["']\/genre\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
    const genre = genreBlock ? textOf(genreBlock[1]) : "";
    const image = (block.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "";
    list.push({
      id: idMatch[1],
      name,
      artists: artist ? [{ id: artistIdMatch, name: artist }] : [],
      album: { id: "", name: genre, imageUrl: sizedImage(image) },
      duration: 0,
      url: `${BASE}/music/${idMatch[1]}.html`,
    });
    seen.add(idMatch[1]);
  }
  rememberTracks(list);
  return list;
}

const CHARTS = [
  { slug: "fire", title: "人气排行", path: "/ranks/fire.html" },
  { slug: "hot", title: "最新推荐", path: "/ranks/hot.html" },
  { slug: "down", title: "下载排行", path: "/ranks/down.html" },
  { slug: "fav", title: "收藏排行", path: "/ranks/fav.html" },
  { slug: "latest", title: "最新上传", path: "/ranks/latest.html" },
];

function chartOf(slug) {
  const chart = CHARTS.find((item) => item.slug === slug);
  if (!chart) throw fail("unavailable", "没有这个榜单");
  return chart;
}

function parseGenres(html) {
  const list = [];
  const seen = new Set();
  const pattern = /<a[^>]*href=["']\/genre\/([a-z0-9_-]+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const slug = match[1];
    const name = textOf(match[2]);
    if (!name || slug === "all" || seen.has(slug)) continue;
    seen.add(slug);
    list.push({ slug, name });
  }
  return list;
}

async function chartBrowse(slug) {
  const chart = chartOf(slug);
  const html = await pageHtml(chart.path);
  const heading = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const tracks = parseSongRows(html);
  return {
    title: chart.title,
    subtitle: heading ? textOf(heading[1]) : "",
    sections: [{ title: chart.title, tracks }],
  };
}

async function genreBrowse(slug) {
  const html = await pageHtml(`/genre/${slug}.html`);
  const titleMatch = html.match(/<title>([^<]*)</i);
  const heading = titleMatch ? textOf(titleMatch[1]).split("_")[0].trim() : "分类";
  return { title: heading, sections: [{ title: heading, tracks: parseSongRows(html) }] };
}

export async function home() {
  const sections = [];
  const shelves = [
    { title: "最新添加", order: "", page: "latest:1", subtitle: "刚刚上传的原创音乐" },
    { title: "热门试听", order: "listens", page: "hot:1", subtitle: "按试听次数排序" },
    { title: "高分推荐", order: "score", page: "score:1", subtitle: "按站内评分排序" },
  ];
  for (const shelf of shelves) {
    try {
      const songs = await apiSongs(1, shelf.order);
      const tracks = songs.slice(0, 20).map(songToTrack);
      rememberTracks(tracks);
      if (tracks.length) {
        sections.push({
          title: shelf.title,
          tracks,
          morePage: shelf.page,
          pageTitle: shelf.title,
          subtitle: shelf.subtitle,
        });
      }
    } catch (error) {
      // 单个栏目失败不影响首页
    }
  }
  sections.push({
    title: t("Charts"),
    links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.slug}` })),
  });
  try {
    const genres = parseGenres(await pageHtml("/genre.html")).slice(0, 12);
    if (genres.length) {
      sections.push({
        title: t("Categories"),
        links: genres.map((genre) => ({ title: genre.name, page: `genre:${genre.slug}` })),
      });
    }
  } catch (error) {
    // 分类读取失败时忽略
  }
  return { title: "VY音乐", subtitle: "原创音乐试听与下载", sections };
}

export async function browse({ page }) {
  const chart = page.match(/^chart:([a-z]+)$/);
  if (chart) return chartBrowse(chart[1]);
  const genre = page.match(/^genre:([a-z0-9_-]+)$/);
  if (genre) return genreBrowse(genre[1]);
  const list = page.match(/^(latest|hot|score):(\d+)$/);
  if (list) {
    const kind = list[1];
    const index = Number(list[2]);
    const order = kind === "hot" ? "listens" : kind === "score" ? "score" : "";
    const title = kind === "hot" ? "热门试听" : kind === "score" ? "高分推荐" : "最新添加";
    const songs = await apiSongs(index, order);
    const tracks = songs.map(songToTrack);
    rememberTracks(tracks);
    const sections = [{ title, tracks }];
    const links = [];
    if (index > 1) links.push({ title: t("Previous"), subtitle: `第 ${index - 1} 页`, page: `${kind}:${index - 1}` });
    if (tracks.length >= PAGE_SIZE) {
      links.push({ title: t("Next"), subtitle: `第 ${index + 1} 页`, page: `${kind}:${index + 1}` });
    }
    if (links.length) sections.push({ title: t("Pages"), links });
    return { title, subtitle: `第 ${index} 页`, sections };
  }
  if (page === "charts") {
    const sections = [];
    for (const chart of CHARTS.slice(0, 4)) {
      try {
        const tracks = parseSongRows(await pageHtml(chart.path)).slice(0, 10);
        sections.push({ title: chart.title, tracks, morePage: `chart:${chart.slug}` });
      } catch (error) {
        // 单个榜单失败不影响整页
      }
    }
    sections.push({ title: "全部榜单", links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.slug}` })) });
    return { title: t("Charts"), subtitle: "人气、推荐、下载与收藏", sections };
  }
  if (page === "genres") {
    const genres = parseGenres(await pageHtml("/genre.html"));
    return {
      title: t("Categories"),
      sections: [{ title: "全部分类", links: genres.map((genre) => ({ title: genre.name, page: `genre:${genre.slug}` })) }],
    };
  }
  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind, offset = 0 }) {
  if ((kind || "tracks") !== "tracks") return { tracks: [], more: false };
  const term = String(query || "").trim();
  if (!term) return { tracks: [], more: false };
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const path =
    page === 1
      ? `/search.html?keys=${encodeURIComponent(term)}&type=1`
      : `/search/page/${page}.html?keys=${encodeURIComponent(term)}&type=1`;
  const html = await pageHtml(path);
  const tracks = parseSongRows(html);
  const totalMatch = html.match(/共查询相关歌曲【(\d+)】/);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const more = total > 0 ? offset + tracks.length < total : tracks.length >= PAGE_SIZE;
  return { tracks, more };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const tracks = parseSongRows(await pageHtml(`/search.html?keys=${encodeURIComponent(term)}&type=1`));
    return tracks
      .slice(0, 10)
      .map((track) => (track.artists.length ? `${track.artists[0].name} - ${track.name}` : track.name));
  } catch (error) {
    return [];
  }
}

export async function lyrics() {
  return {};
}

export async function stream({ id }) {
  const song = await songData(id);
  const url = song && song.sub && song.sub.listen_url;
  if (!url) throw fail("unavailable", "这首歌暂时没有可用的音频");
  let type = "mp3";
  const path = String(url).split("?")[0].toLowerCase();
  if (path.endsWith(".flac")) type = "flac";
  else if (path.endsWith(".m4a")) type = "m4a";
  else if (path.endsWith(".ogg")) type = "ogg";
  return { url, type, headers: { referer: `${BASE}/music/${id}.html` } };
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
