// MyGo Music plugin — 一起听歌吧 (happy.alang.run / Jusic-Serve-Houses)
//
// 这个站点不是曲库，是「一起听歌房」：前端只是房间界面，内容全部来自后端
// https://tx.alang.run/api 的 SockJS + STOMP（后端开源在
// github.com/JumpAlang/Jusic-Serve-Houses）。插件按「跟随房间」实现：
//
//   REST（公开，带 AccessToken: token）
//     POST /house/search   房间列表
//   STOMP（先进房间，匿名即可）
//     SEND /music/search           搜索，只回元数据（id/歌名/歌手/专辑封面/时长）
//
//   进房间的瞬间服务端就推：MUSIC（正在播放，带 mp3 直链和整首 LRC）、
//   PICK（待播队列，每条也带直链）、ONLINE、ANNOUNCEMENT。
//
// 关键结论（读后端源码确认过）：直链只在「点歌入队」那一刻由服务端签出来，
// 搜索接口、房间默认歌单（/music/defaultPlaylist，231 首）都只有元数据、
// 没有 url；站内也没有音频代理路径，/music/* 的 REST 一律 401。
// 所以本插件只读跟随：正在播放与队列里的歌能在 App 里直接播，
// 搜索结果能浏览但点播放会明确告诉你「要先在房间里点歌」。
// 不发送 /music/pick，不会往房间里投歌，不影响房间里其他人。

const BASE = "https://tx.alang.run/api";
const HOME = "https://happy.alang.run/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TOKEN = "token"; // 前端自己用的那个公开令牌

const t = (text) => host.t(text);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
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

/* ------------------------------------------------------------------ */
/* REST: the room list                                                 */
/* ------------------------------------------------------------------ */

async function rest(path, payload) {
  const res = await once(
    BASE + path,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": UA,
        AccessToken: TOKEN,
      },
      body: JSON.stringify(payload || {}),
    },
    12000
  );
  if (res.status >= 400) throw fail("unavailable", path + " " + res.status);
  const data = await res.json();
  if (String(data.code) !== "20000") throw fail("unavailable", data.message || path);
  return data.data;
}

async function roomList() {
  const list = await rest("/house/search", {});
  const sorted = (list || []).slice().sort((a, b) => (Number(b.population) || 0) - (Number(a.population) || 0));
  const out = sorted.slice(0, 80).map((room) => ({
    id: String(room.id),
    name: String(room.name || room.id),
    imageUrl: "",
    description: [
      room.desc ? String(room.desc) : "",
      room.needPwd ? t("需要密码") : t("公开房间"),
      room.population != null ? room.population + " " + t("人在线") : "",
    ]
      .filter(Boolean)
      .join(" · "),
    _room: room,
  }));
  return out;
}

/* ------------------------------------------------------------------ */
/* SockJS (xhr transport) + STOMP                                     */
/* ------------------------------------------------------------------ */

function randomId(length) {
  let out = "";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < length; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// SockJS 的 xhr 帧：o 打开、h 心跳、c 关闭、a[...] 一组消息
function framesFrom(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (raw.charAt(0) === "o" || raw.charAt(0) === "h") return [];
  if (raw.charAt(0) === "c") throw fail("unavailable", t("房间连接被服务端关闭"));
  if (raw.charAt(0) !== "a") return [];
  try {
    const parsed = JSON.parse(raw.slice(1));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function stompFrame(text) {
  const index = text.indexOf("\n\n");
  if (index < 0) return null;
  return {
    type: text.slice(0, index).split("\n")[0],
    body: text.slice(index + 2).replace(/\u0000$/, ""),
  };
}

// 服务端把歌词里的换行原样塞进 JSON 字符串，严格 JSON.parse 会在这里失败
function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch (error) {
    try {
      return JSON.parse(body.replace(/\r/g, "").replace(/\n/g, "\\n"));
    } catch (second) {
      return null;
    }
  }
}

class Session {
  constructor(houseId, housePwd) {
    this.houseId = String(houseId || "DEFAULT");
    this.housePwd = String(housePwd || "");
    this.server = "000";
    this.sid = randomId(8);
    this.closed = false;
  }

  url(path, query) {
    return BASE + "/server/" + this.server + "/" + this.sid + "/" + path + (query ? "?" + query : "");
  }

  async open() {
    const query =
      "houseId=" + encodeURIComponent(this.houseId) +
      "&housePwd=" + encodeURIComponent(this.housePwd) +
      "&connectType=enter";
    const res = await once(
      this.url("xhr", query),
      { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": UA } },
      12000
    );
    if (res.status >= 400) throw fail("unavailable", t("房间连接失败") + " " + res.status);
    await res.text();
    await this.send(["CONNECT\naccept-version:1.0,1.1,1.2\nheart-beat:0,0\n\n\u0000"]);
    return this;
  }

  async send(frames) {
    const res = await once(
      this.url("xhr_send"),
      {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": UA },
        body: JSON.stringify(frames),
      },
      10000
    );
    if (res.status >= 400) throw fail("unavailable", t("房间连接失败") + " " + res.status);
    await res.text();
  }

  async poll() {
    if (this.closed) return [];
    try {
      const res = await once(
        this.url("xhr"),
        { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": UA } },
        8000
      );
      if (res.status >= 400) return [];
      return framesFrom(await res.text());
    } catch (error) {
      return [];
    }
  }

  // 收消息直到超时或 stop 说够了
  async collect(ms, stop) {
    const messages = [];
    const until = Date.now() + ms;
    let cold = true;
    while (Date.now() < until) {
      const frames = await this.poll();
      if (!frames.length) {
        if (!cold) break;
        cold = false;
        continue;
      }
      cold = false;
      for (const text of frames) {
        const frame = stompFrame(text);
        if (!frame) continue;
        messages.push(frame);
        if (stop && stop(frame, messages)) return messages;
      }
    }
    return messages;
  }

  stop() {
    this.closed = true;
    try {
      const res = once(
        this.url("xhr"),
        { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" } },
        4000
      );
      if (res && typeof res.catch === "function") res.catch(() => {});
    } catch (error) {
      /* the session times out on its own */
    }
  }
}

function roomOf() {
  return {
    houseId: String(host.setting("houseId") || "DEFAULT").trim() || "DEFAULT",
    housePwd: String(host.setting("housePwd") || "").trim(),
  };
}

function openSession() {
  const room = roomOf();
  return new Session(room.houseId, room.housePwd).open();
}

/* ------------------------------------------------------------------ */
/* Shape helpers                                                       */
/* ------------------------------------------------------------------ */

function decode(text) {
  if (!text) return "";
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
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

function clean(text) {
  return decode(String(text || "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function https(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  return raw.replace(/^http:\/\//i, "https://").replace(/^\/\//, "https://");
}

function toTrack(item, withState) {
  if (!item || !item.id) return null;
  const name = clean(item.name || item.title || "");
  if (!name) return null;
  const track = {
    id: String(item.id),
    name: name,
    album: {
      name: clean(item.album && item.album.name ? item.album.name : item.album || ""),
      imageUrl: https(item.pictureUrl || (item.album && item.album.pictureUrl) || ""),
    },
  };
  const artist = clean(item.artist || item.nickName || "");
  if (artist) track.artists = [{ name: artist }];
  if (item.duration) track.duration = Number(item.duration);
  const url = https(item.url);
  if (withState) {
    if (url) urlCache.set(String(item.id), url);
    else {
      track.unavailable = true;
      track.description = t("房间只给正在播放和队列里的歌签直链，这首要点进房间才能播");
    }
  }
  if (item.lyric) lrcCache.set(String(item.id), normalizeLrc(item.lyric));
  return track;
}

function normalizeLrc(text) {
  const lrc = decode(String(text || "").replace(/<br\s*\/?>/gi, "\n"));
  return /\[[\d]{1,2}:[\d]{1,2}/.test(lrc) ? lrc.trim() : "";
}

const urlCache = new Map();
const lrcCache = new Map();
const roomCache = new Map();

/* ------------------------------------------------------------------ */
/* Follow the room                                                     */
/* ------------------------------------------------------------------ */

async function snapshot(ms) {
  const room = roomOf();
  const key = room.houseId + "|" + room.housePwd;
  const cached = roomCache.get(key);
  if (cached && Date.now() - cached.at < 60 * 1000) return cached.value;

  const session = await openSession();
  let now = null;
  let queue = [];
  let online = 0;
  let announcement = "";
  try {
    await session.collect(ms || 6000, (frame) => {
      if (frame.type !== "MUSIC" && frame.type !== "PICK" && frame.type !== "ONLINE" && frame.type !== "ANNOUNCEMENT") return false;
      const data = parseJson(frame.body);
      const body = data && data.data;
      if (frame.type === "MUSIC" && body) now = body;
      if (frame.type === "PICK" && Array.isArray(body)) queue = body;
      if (frame.type === "ONLINE" && body && body.count != null) online = Number(body.count) || 0;
      if (frame.type === "ANNOUNCEMENT" && body && body.content) announcement = String(body.content);
      return Boolean(now && queue.length);
    });
  } catch (error) {
    if (!now && !queue.length) throw fail("unavailable", t("房间连不上，稍后重试"));
  } finally {
    session.stop();
  }

  const value = {
    houseId: room.houseId,
    now: now ? toTrack(now, true) : null,
    queue: queue.map((item) => toTrack(item, true)).filter(Boolean),
    online: online,
    announcement: announcement,
    at: Date.now(),
  };
  roomCache.set(key, { at: Date.now(), value: value });
  remember([value.now].concat(value.queue).filter(Boolean));
  return value;
}

export async function home() {
  let room;
  try {
    room = await snapshot(6500);
  } catch (error) {
    console.log("[jusic] home failed:", error && error.message);
    return {
      title: t("一起听歌吧"),
      subtitle: t("房间连不上，稍后刷新"),
      sections: [{ title: t("房间"), links: [{ title: t("打开房间列表"), page: "rooms" }] }],
    };
  }

  const sections = [];
  if (room.now) {
    sections.push({
      title: t("正在播放"),
      subtitle: room.now.artists && room.now.artists.length ? room.now.artists[0].name : "",
      tracks: [room.now],
      morePage: "now",
    });
  }
  if (room.queue.length) {
    const playable = room.queue.filter((track) => !track.unavailable);
    sections.push({
      title: t("待播队列"),
      subtitle: t("房间里排着的歌，每首都能在 App 里直接放"),
      tracks: playable.length ? playable : room.queue,
      morePage: "queue",
    });
  }
  sections.push({
    title: t("房间"),
    links: [
      { title: t("打开房间列表"), subtitle: t("换一个房间就是在设置里改房间 ID"), page: "rooms" },
    ],
  });

  return {
    title: t("一起听歌吧"),
    subtitle:
      t("房间") +
      " " +
      room.houseId +
      (room.online ? " · " + room.online + " " + t("人在线") : "") +
      (room.announcement ? " · " + room.announcement : ""),
    description: t("只读跟随房间：正在播放和队列里的歌在这里同步播放，不往房间投歌。"),
    sections: sections,
  };
}

export async function browse({ page: name }) {
  const key = String(name || "");
  if (key === "rooms") {
    const list = await roomList();
    return {
      title: t("房间列表"),
      subtitle: t("按在线人数排的前 80 个房间；把想要的 ID 填进设置里的「房间 ID」就能换过去"),
      sections: [
        {
          title: t("公开与密码房间"),
          links: list.map((room) => ({ title: room.name, subtitle: room.description, page: "rooms" })),
        },
      ],
    };
  }
  if (key === "now") {
    const room = await snapshot(5000);
    if (!room.now) throw fail("unavailable", t("房间里现在没有在放的歌"));
    return { title: t("正在播放"), sections: [{ title: t("正在播放"), tracks: [room.now] }] };
  }
  if (key === "queue") {
    const room = await snapshot(5000);
    const playable = room.queue.filter((track) => !track.unavailable);
    return {
      title: t("待播队列"),
      subtitle: room.queue.length ? room.queue.length + " " + t("首") : "",
      sections: [{ title: t("待播队列"), tracks: playable.length ? playable : room.queue }],
    };
  }
  throw fail("unavailable", t("没有这个页面"));
}

/* ------------------------------------------------------------------ */
/* Search (the room's own search: metadata only)                       */
/* ------------------------------------------------------------------ */

async function searchRoom(text) {
  const source = String(host.setting("source") || "wy").trim() || "wy";
  const session = await openSession();
  const tracks = [];
  try {
    let connected = false;
    await session.collect(1500, (frame) => {
      if (frame.type === "CONNECTED") connected = true;
      return connected;
    });
    const body = {
      name: text,
      source: source,
      pageIndex: 1,
      pageSize: 30,
      sendTime: Date.now(),
    };
    await session.send(["SEND\ndestination:/music/search\ncontent-type:application/json\n\n" + JSON.stringify(body) + "\u0000"]);
    const messages = await session.collect(8000, (frame) => frame.type === "SEARCH" || frame.type === "NOTICE");
    const search = messages.filter((frame) => frame.type === "SEARCH").pop();
    if (!search) throw fail("unavailable", t("房间里搜不到结果，稍后重试"));
    const data = parseJson(search.body);
    const page = data && data.data;
    const items = page && page.data;
    if (!Array.isArray(items)) return [];
    for (const item of items) {
      const track = toTrack(item, true);
      if (track) tracks.push(track);
    }
  } finally {
    session.stop();
  }
  remember(tracks);
  return tracks;
}

export async function search({ query, kind }) {
  const text = String(query || "").trim();
  const key = kind || "tracks";
  if (!text) {
    if (key === "albums") return { albums: [], more: false };
    if (key === "artists") return { artists: [], more: false };
    return { tracks: [], more: false };
  }
  if (key === "albums") return { albums: [], more: false };
  if (key === "artists") {
    const tracks = await searchRoom(text);
    const names = [];
    const seen = new Set();
    for (const track of tracks) {
      for (const artist of track.artists || []) {
        if (!artist.name || seen.has(artist.name)) continue;
        seen.add(artist.name);
        names.push({ id: "n:" + artist.name, name: artist.name, imageUrl: track.album.imageUrl });
      }
    }
    return { artists: names.slice(0, 20), more: false };
  }
  if (key !== "tracks") return { tracks: [], more: false };
  return { tracks: await searchRoom(text), more: false };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  try {
    const tracks = await searchRoom(text);
    return tracks
      .slice(0, 10)
      .map((track) => {
        const singer = track.artists && track.artists.length ? track.artists[0].name : "";
        return singer ? singer + " - " + track.name : track.name;
      });
  } catch (error) {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Audio and lyrics                                                   */
/* ------------------------------------------------------------------ */

export async function stream({ id }) {
  const key = String(id);
  let url = urlCache.get(key);
  if (!url) {
    try {
      await snapshot(5000);
    } catch (error) {
      /* fall through to the error below */
    }
    url = urlCache.get(key);
  }
  if (!url) throw fail("unavailable", t("房间只给正在播放和队列里的歌签直链，这首要点进房间才能播"));
  return { url: url, type: /\.flac/i.test(url) ? "flac" : "mp3" };
}

export async function lyrics({ id }) {
  const key = String(id);
  const lrc = lrcCache.get(key);
  if (lrc) return { lrc: lrc };
  try {
    await snapshot(5000);
  } catch (error) {
    /* ignore */
  }
  return { lrc: lrcCache.get(key) || "" };
}

/* ------------------------------------------------------------------ */
/* Library kept on this device                                         */
/* ------------------------------------------------------------------ */

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

function trackById(id) {
  if (index[id]) return index[id];
  const saved = load("likedTracks", {});
  return saved[id] || { id: String(id), name: String(id), album: { name: "" } };
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
  ids.unshift(String(id));
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
  for (const id of ids || []) out[id] = set.has(String(id));
  return out;
}

export function like({ id, on }) {
  const set = new Set(load("liked", []));
  if (on) {
    set.add(String(id));
    if (index[id]) {
      const saved = load("likedTracks", {});
      saved[id] = index[id];
      save("likedTracks", saved);
    }
  } else {
    set.delete(String(id));
  }
  save("liked", [...set]);
}
