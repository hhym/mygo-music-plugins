// GD 音乐台（music.gdstudio.org）— MyGo Music 插件
//
// 站点前端是 SPA，插件直接使用它公开的聚合 API：
// https://music-api.gdstudio.xyz/api.php
// 支持 netease / joox 等音源的搜索、歌词、歌单与播放地址。

const API = "https://music-api.gdstudio.xyz/api.php";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PAGE_SIZE = 30;
const CACHE_TTL = 5 * 60 * 1000;

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

async function api(params, attempt = 0) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  const url = `${API}?${query}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  let response;
  try {
    response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return api(params, attempt + 1);
    }
    throw new Error(`连不上 GD 音乐台 API：${error && error.message ? error.message : error}`);
  }
  if (!response.ok) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return api(params, attempt + 1);
    }
    throw fail("unavailable", `GD 音乐台 API 返回了 ${response.status}`);
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return api(params, attempt + 1);
    }
    throw fail("unavailable", "GD 音乐台 API 返回了无法解析的内容");
  }
  cache.set(url, { data, at: Date.now() });
  if (cache.size > 60) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return data;
}

function sizedImage(url) {
  if (!url) return "";
  let out = String(url).trim();
  if (out.startsWith("//")) out = "https:" + out;
  return out.replace(/param=\d+y\d+/i, "param={size}y{size}");
}

function artistsOf(names) {
  return (names || [])
    .filter((name) => name && String(name).trim())
    .map((name) => ({ id: "", name: String(name).trim() }));
}

// 歌曲 id 带上 API 需要的三个 id，避免搜索结果的 url_id / lyric_id 与歌曲 id 不同。
function trackId(source, songId, urlId, lyricId, picId) {
  return [source || "netease", songId, urlId || songId, lyricId || songId, picId || ""].join(":");
}

function idsOf(id) {
  const parts = String(id).split(":");
  return {
    source: parts[0] || "netease",
    song: parts[1] || "",
    url: parts[2] || parts[1] || "",
    lyric: parts[3] || parts[1] || "",
    pic: parts[4] || "",
  };
}

function fromSearch(item) {
  const source = item.source || "netease";
  const songId = String(item.id || "");
  const albumName = typeof item.album === "string" ? item.album : (item.album && item.album.name) || "";
  return {
    id: trackId(source, songId, item.url_id, item.lyric_id, item.pic_id),
    name: String(item.name || "").trim(),
    artists: artistsOf(item.artist || item.artists),
    album: { id: "", name: albumName, imageUrl: "" },
    duration: Number(item.duration || 0),
    url: "",
  };
}

function fromPlaylistTrack(track, source, cover) {
  const songId = String(track.id || "");
  const album = track.al || track.album || {};
  return {
    id: trackId(source, songId, songId, songId, album.pic || ""),
    name: String(track.name || "").trim(),
    artists: artistsOf((track.ar || track.artists || []).map((artist) => artist.name)),
    album: { id: String(album.id || ""), name: String(album.name || ""), imageUrl: sizedImage(cover) },
    duration: Number(track.dt || track.duration || 0),
    url: "",
  };
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

// 网易云公开榜单，API 的 types=playlist 可以直接取到每个榜单的曲目。
const CHARTS = [
  { id: "3778678", title: "热歌榜" },
  { id: "19723756", title: "飙升榜" },
  { id: "3779629", title: "新歌榜" },
  { id: "2884035", title: "原创榜" },
];

function chartOf(id) {
  const chart = CHARTS.find((item) => item.id === id);
  if (!chart) throw fail("unavailable", "没有这个榜单");
  return chart;
}

async function playlistData(source, id) {
  const data = await api({ types: "playlist", source, id });
  const playlist = data && data.playlist;
  if (!playlist) throw fail("unavailable", "这个歌单暂时无法读取");
  const cover = sizedImage(playlist.coverImgUrl || "");
  const tracks = (playlist.tracks || [])
    .filter((track) => track && track.id && track.name)
    .map((track) => fromPlaylistTrack(track, source, cover));
  rememberTracks(tracks);
  const record = {
    id: `${source}:${id}`,
    name: String(playlist.name || ""),
    imageUrl: cover,
    description: String(playlist.description || "").replace(/\s+/g, " ").trim(),
    trackCount: tracks.length,
  };
  return { record, tracks };
}

async function chartPage(id) {
  const chart = chartOf(id);
  const { record, tracks } = await playlistData("netease", id);
  return {
    title: chart.title,
    subtitle: `${tracks.length} 首`,
    sections: [{ title: chart.title, tracks }],
  };
}

export async function home() {
  const sections = [];
  for (const chart of CHARTS.slice(0, 3)) {
    try {
      const { tracks } = await playlistData("netease", chart.id);
      if (tracks.length) {
        sections.push({
          title: chart.title,
          tracks: tracks.slice(0, 12),
          morePage: `chart:${chart.id}`,
          pageTitle: chart.title,
          subtitle: "网易云音乐榜单",
        });
      }
    } catch (error) {
      // 单个榜单失败不影响首页
    }
  }
  sections.push({
    title: t("Charts"),
    links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.id}` })),
  });
  return { title: "GD 音乐台", subtitle: "聚合网易云、JOOX 等音源", sections };
}

export async function browse({ page }) {
  const chart = page.match(/^chart:(\d+)$/);
  if (chart) return chartPage(chart[1]);
  if (page === "charts") {
    const sections = [];
    for (const item of CHARTS) {
      try {
        const { tracks } = await playlistData("netease", item.id);
        sections.push({ title: item.title, tracks: tracks.slice(0, 10), morePage: `chart:${item.id}` });
      } catch (error) {
        // 单个榜单失败不影响整页
      }
    }
    sections.push({ title: "全部榜单", links: CHARTS.map((item) => ({ title: item.title, page: `chart:${item.id}` })) });
    return { title: t("Charts"), subtitle: "网易云热歌、飙升、新歌与原创榜", sections };
  }
  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind, offset = 0 }) {
  if ((kind || "tracks") !== "tracks") return { tracks: [], more: false };
  const term = String(query || "").trim();
  if (!term) return { tracks: [], more: false };
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const items = await api({ types: "search", source: "netease", name: term, count: PAGE_SIZE, pages: page });
  if (!Array.isArray(items)) return { tracks: [], more: false };
  const tracks = items.map(fromSearch).filter((track) => track.name);
  rememberTracks(tracks);
  return { tracks, more: tracks.length >= PAGE_SIZE };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const items = await api({ types: "search", source: "netease", name: term, count: 8, pages: 1 });
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        const artist = (item.artist || [])[0] || "";
        return artist ? `${artist} - ${item.name}` : item.name;
      })
      .filter(Boolean)
      .slice(0, 10);
  } catch (error) {
    return [];
  }
}

export async function playlist({ id }) {
  const source = String(id).includes(":") ? String(id).split(":")[0] : "netease";
  const pid = String(id).includes(":") ? String(id).split(":")[1] : String(id);
  const chart = CHARTS.find((item) => item.id === pid);
  const { record, tracks } = await playlistData(source, pid);
  return {
    id,
    name: record.name || (chart ? chart.title : ""),
    imageUrl: record.imageUrl,
    description: record.description,
    trackCount: tracks.length,
    tracks,
  };
}

export async function lyrics({ id }) {
  const { source, lyric } = idsOf(id);
  if (!lyric) return {};
  try {
    const data = await api({ types: "lyric", source, id: lyric });
    const lrc = String((data && data.lyric) || "").trim();
    return lrc ? { lrc } : {};
  } catch (error) {
    return {};
  }
}

export async function stream({ id, quality }) {
  const { source, url } = idsOf(id);
  if (!url) throw fail("unavailable", "这首歌没有可用的播放地址");
  const wanted = quality === "lossless" || quality === "flac" ? 999 : quality === "high" ? 320 : 128;
  for (const br of wanted === 999 ? [999, 320, 128] : wanted === 320 ? [320, 128] : [128]) {
    try {
      const data = await api({ types: "url", source, id: url, br });
      if (data && data.url) {
        let type = "mp3";
        const path = String(data.url).split("?")[0].toLowerCase();
        if (path.endsWith(".flac")) type = "flac";
        else if (path.endsWith(".m4a")) type = "m4a";
        else if (path.endsWith(".ogg")) type = "ogg";
        return { url: data.url, type, headers: { referer: "https://music.gdstudio.xyz/" } };
      }
    } catch (error) {
      // 换一个码率再试
    }
  }
  throw fail("unavailable", "这首歌暂时没有可用的音频");
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
