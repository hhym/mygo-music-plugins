// 米乐迪音乐（imelody.top）— MyGo Music 插件
//
// 站点是 MelodyTimeline 华语乐坛编年史 SPA，数据由一个 JSON API 提供：
// POST https://melody-api.imelody.top  {action, data}
// 常用动作：getAllSongs / searchSongsInDB / getRandomSongs /
// getPlayableUrl / fetchLyrics。歌曲自带封面、发行年份和 LRC。

const SITE = "https://imelody.top";
const API = "https://melody-api.imelody.top";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PAGE_SIZE = 30;
const CACHE_TTL = 5 * 60 * 1000;
const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];

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

async function call(action, data = {}, attempt = 0) {
  let response;
  try {
    response = await fetch(API, {
      method: "POST",
      headers: {
        "user-agent": UA,
        "content-type": "application/json",
        accept: "application/json",
        origin: SITE,
        referer: SITE + "/",
      },
      body: JSON.stringify({ action, data }),
    });
  } catch (error) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return call(action, data, attempt + 1);
    }
    throw new Error(`连不上米乐迪音乐 API：${error && error.message ? error.message : error}`);
  }
  if (!response.ok) {
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return call(action, data, attempt + 1);
    }
    throw fail("unavailable", `米乐迪音乐 API 返回了 ${response.status}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw fail("unavailable", "米乐迪音乐 API 返回了无法解析的内容");
  }
}

function cached(key) {
  const item = cache.get(key);
  return item && Date.now() - item.at < CACHE_TTL ? item.value : null;
}

function remember(key, value) {
  cache.set(key, { value, at: Date.now() });
  if (cache.size > 30) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

async function allSongs() {
  const hit = cached("all");
  if (hit) return hit;
  const songs = await call("getAllSongs");
  const list = Array.isArray(songs) ? songs : [];
  remember("all", list);
  rememberTracks(list.map(toTrack));
  return list;
}

function sizedImage(url) {
  if (!url) return "";
  let out = String(url).trim();
  if (out.startsWith("//")) out = "https:" + out;
  out = out.replace(/\/300\/300(?:[/?#]|$)/, "/__SIZE__/__SIZE__");
  out = encodeURI(out).replace(/__SIZE__/g, "{size}");
  return out;
}

function yearOf(song) {
  const match = String(song.release_date || "").match(/(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function toTrack(song) {
  return {
    id: String(song.id),
    name: String(song.title || "").trim(),
    artists: song.artist ? [{ id: "", name: String(song.artist).trim() }] : [],
    album: {
      id: "",
      name: "MelodyTimeline",
      imageUrl: sizedImage(song.cover_url || ""),
      released: String(song.release_date || ""),
    },
    duration: 0,
    url: SITE + "/",
  };
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

function songBy(id) {
  const fromCache = cached("songsById");
  if (fromCache && fromCache[id]) return fromCache[id];
  return null;
}

function indexSongs(songs) {
  const byId = {};
  for (const song of songs || []) byId[String(song.id)] = song;
  remember("songsById", byId);
  rememberTracks(songs.map(toTrack));
  return byId;
}

function hash(text) {
  let value = 0;
  for (let i = 0; i < String(text).length; i++) value = (value * 31 + String(text).charCodeAt(i)) >>> 0;
  return value;
}

function paged(tracks, page, kind, title, subtitle) {
  const start = (page - 1) * PAGE_SIZE;
  const slice = tracks.slice(start, start + PAGE_SIZE);
  const sections = [{ title, tracks: slice }];
  const links = [];
  if (page > 1) links.push({ title: t("Previous"), subtitle: `第 ${page - 1} 页`, page: `${kind}:${page - 1}` });
  if (start + PAGE_SIZE < tracks.length) {
    links.push({ title: t("Next"), subtitle: `第 ${page + 1} 页`, page: `${kind}:${page + 1}` });
  }
  if (links.length) sections.push({ title: t("Pages"), links });
  return { title, subtitle: subtitle || `第 ${page} 页`, sections };
}

function sorted(kind, songs) {
  const list = songs.slice();
  if (kind === "popular") {
    list.sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
  } else if (kind === "latest") {
    list.sort((a, b) => String(b.release_date || "").localeCompare(String(a.release_date || "")));
  } else {
    list.sort((a, b) => hash(a.id) - hash(b.id));
  }
  return list;
}

export async function home() {
  let songs;
  try {
    songs = await allSongs();
  } catch (error) {
    // 全量接口失败时用随机 300 首兜底，首页仍能出来。
    songs = await call("getRandomSongs", { limit: 300 });
  }
  indexSongs(songs);
  const latest = sorted("latest", songs).slice(0, 20).map(toTrack);
  const popular = sorted("popular", songs).slice(0, 20).map(toTrack);
  const random = sorted("random", songs).slice(0, 20).map(toTrack);
  const sections = [];
  if (latest.length) {
    sections.push({
      title: "最新收录",
      tracks: latest,
      morePage: "chart:latest:1",
      pageTitle: "最新收录",
      subtitle: "按发行日期排序",
    });
  }
  if (popular.length) {
    sections.push({
      title: "热门经典",
      tracks: popular,
      morePage: "chart:popular:1",
      pageTitle: "热门经典",
      subtitle: "按站内热度排序",
    });
  }
  if (random.length) {
    sections.push({
      title: "随机漫游",
      tracks: random,
      morePage: "chart:random:1",
      pageTitle: "随机漫游",
      subtitle: "从编年史里随机挑选",
    });
  }
  sections.push({
    title: "年代",
    links: DECADES.map((year) => ({ title: `${year} 年代`, page: `decade:${year}:1` })).concat([
      { title: "全部年代", page: "years" },
    ]),
  });
  return { title: "米乐迪音乐", subtitle: "华语乐坛编年史", sections };
}

export async function browse({ page }) {
  if (page === "years") {
    const songs = await allSongs();
    const sections = DECADES.map((year) => {
      const count = songs.filter((song) => yearOf(song) >= year && yearOf(song) < year + 10).length;
      return { title: `${year} 年代`, subtitle: `${count} 首`, page: `decade:${year}:1` };
    });
    return { title: "年代", subtitle: "按十年划分的华语流行史", sections: [{ title: "全部年代", links: sections }] };
  }
  const decade = page.match(/^decade:(\d{4}):(\d+)$/);
  if (decade) {
    const startYear = Number(decade[1]);
    const index = Number(decade[2]);
    const songs = await allSongs();
    const list = songs
      .filter((song) => {
        const year = yearOf(song);
        return year >= startYear && year < startYear + 10;
      })
      .sort((a, b) => String(b.release_date || "").localeCompare(String(a.release_date || "")))
      .map(toTrack);
    return paged(list, index, `decade:${startYear}`, `${startYear} 年代`);
  }
  const chart = page.match(/^chart:(popular|latest|random):(\d+)$/);
  if (chart) {
    const kind = chart[1];
    const index = Number(chart[2]);
    const songs = index === 1 ? await allSongs() : await allSongs();
    const titles = { popular: "热门经典", latest: "最新收录", random: "随机漫游" };
    const list = sorted(kind, songs).map(toTrack);
    return paged(list, index, `chart:${kind}`, titles[kind]);
  }
  if (page === "charts") {
    const songs = await allSongs();
    const sections = [];
    for (const kind of ["popular", "latest", "random"]) {
      const titles = { popular: "热门经典", latest: "最新收录", random: "随机漫游" };
      sections.push({ title: titles[kind], tracks: sorted(kind, songs).slice(0, 10).map(toTrack), morePage: `chart:${kind}:1` });
    }
    sections.push({
      title: "全部榜单",
      links: ["popular", "latest", "random"].map((kind) => ({
        title: { popular: "热门经典", latest: "最新收录", random: "随机漫游" }[kind],
        page: `chart:${kind}:1`,
      })),
    });
    return { title: t("Charts"), subtitle: "热度、发行日期与随机漫游", sections };
  }
  throw fail("unavailable", "没有这个页面");
}

export async function search({ query, kind, offset = 0 }) {
  if ((kind || "tracks") !== "tracks") return { tracks: [], more: false };
  const term = String(query || "").trim();
  if (!term) return { tracks: [], more: false };
  const limit = Math.max(PAGE_SIZE, offset + PAGE_SIZE + 1);
  let songs;
  try {
    songs = await call("searchSongsInDB", { query: term, limit });
  } catch (error) {
    songs = [];
  }
  const list = Array.isArray(songs) ? songs : [];
  rememberTracks(list.map(toTrack));
  const tracks = list.slice(offset, offset + PAGE_SIZE).map(toTrack);
  return { tracks, more: list.length > offset + PAGE_SIZE };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const songs = await call("searchSongsInDB", { query: term, limit: 10 });
    return (Array.isArray(songs) ? songs : [])
      .map((song) => (song.artist ? `${song.artist} - ${song.title}` : song.title))
      .filter(Boolean)
      .slice(0, 10);
  } catch (error) {
    return [];
  }
}

export async function lyrics({ id }) {
  const songs = await allSongs();
  indexSongs(songs);
  const song = songBy(String(id));
  const lrc = String((song && song.lyrics) || "").trim();
  // 只有带时间轴的 LRC 才交给播放器；纯文本简介不冒充歌词。
  return /\[\d{1,2}:\d{2}/.test(lrc) ? { lrc } : {};
}

export async function stream({ id }) {
  const songs = await allSongs();
  indexSongs(songs);
  const song = songBy(String(id));
  if (!song) throw fail("unavailable", "这首歌暂时无法读取");

  let url = "";
  if (song.file_id) {
    try {
      const fresh = await call("getPlayableUrl", { fileKey: String(song.file_id) });
      if (typeof fresh === "string" && /^https?:/.test(fresh)) url = fresh;
    } catch (error) {
      url = "";
    }
  }
  if (!url) url = String(song.audio_url || "");
  if (!url) throw fail("unavailable", "这首歌暂时没有可用的音频");

  let type = "mp3";
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".flac")) type = "flac";
  else if (path.endsWith(".m4a")) type = "m4a";
  else if (path.endsWith(".ogg")) type = "ogg";
  return { url, type };
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
