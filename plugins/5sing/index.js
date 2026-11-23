// 显示名：5sing（5sing）
// 5sing 原创音乐基地（5sing.kugou.com）— MyGo Music 插件
//
// 站点没有公开文档的 API：列表页读服务端渲染的 HTML（首页推荐是一段内嵌 JSON），
// 歌曲详情、歌词与播放地址走 5sservice 接口。取地址前要按站点播放器的规则自己
// 算签名：把参数按名字升序拼成 k=v（不加分隔符），前后各接一次 appkey，取 MD5。
// 搜索只有 http 域名可用，且只给第一页 10 条，所以搜索的 more 永远是 false。

const BASE = "https://5sing.kugou.com";
const SEARCH_BASE = "http://search.5sing.kugou.com";
const SERVICE = "https://5sservice.kugou.com";
const APP_KEY = "5uytoxQewcvIc1gn1PlNF0T2jbbOzRl5";
const APP_ID = "2918";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const PAGE_TTL = 5 * 60 * 1000;

const KINDS = {
  yc: { songType: "1", label: "原创" },
  fc: { songType: "2", label: "翻唱" },
  bz: { songType: "3", label: "伴奏" },
};

const CHARTS = [
  { slug: "yc", title: "原创音乐榜", path: "/top/" },
  { slug: "fc", title: "翻唱流行榜", path: "/top/fc/" },
  { slug: "bz", title: "伴奏搜索榜", path: "/top/bz/" },
];

const HOME_GROUPS = [
  { key: "composite", title: "今日推荐", limit: 36 },
  { key: "ancientStyle", title: "古风", limit: 18 },
  { key: "pop", title: "流行", limit: 18 },
  { key: "rock", title: "摇滚", limit: 18 },
  { key: "ballad", title: "民谣", limit: 18 },
  { key: "animeGame", title: "二次元·游戏", limit: 18 },
  { key: "nation", title: "民族", limit: 18 },
];

const t = (text) => host.t(text);

// An error with one of the codes the app knows: signIn, setup, unavailable,
// unsupported. Anything else shows its message.
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

// ---------------------------------------------------------------------------
// Text and pictures

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

// 5sing picture servers take a size in the file name: hash.jpg_600x600.jpg.
function sizedImage(url) {
  if (!url) return "";
  let out = String(url).split("?")[0].trim();
  if (out.startsWith("//")) out = "https:" + out;
  const sized = /_(\d+)x(\d+)\.(jpg|jpeg|png|webp)$/i;
  if (sized.test(out)) return out.replace(sized, "_" + "{size}x{size}.$3");
  const plain = /\.(jpg|jpeg|png|webp)$/i.exec(out);
  if (!plain) return out;
  return out + "_{size}x{size}" + plain[0].toLowerCase();
}

// ---------------------------------------------------------------------------
// MD5, for the request signature. The plugin runtime has no crypto.

function utf8Bytes(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return out;
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15,
  21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from({ length: 64 }, (m, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296),
);

function md5(text) {
  const bytes = utf8Bytes(String(text));
  const len = bytes.length;
  const words = new Array((((len + 8) >> 6) + 1) * 16).fill(0);
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  const bitLength = len * 8;
  words[words.length - 2] = bitLength & 0xffffffff;
  words[words.length - 1] = Math.floor(bitLength / 4294967296);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let i = 0; i < words.length; i += 16) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let j = 0; j < 64; j++) {
      let f;
      let g;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }
      const sum = (a + f + MD5_K[j] + words[i + g]) | 0;
      const shift = MD5_S[j];
      const rotated = ((sum << shift) | (sum >>> (32 - shift))) | 0;
      const next = (b + rotated) | 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return [a0, b0, c0, d0]
    .map((word) =>
      [0, 1, 2, 3]
        .map((i) => ("0" + ((word >>> (i * 8)) & 0xff).toString(16)).slice(-2))
        .join(""),
    )
    .join("");
}

function randomHex(length) {
  const alphabet = "0123456789abcdef";
  const bytes = new Array(length);
  for (let i = 0; i < length; i++) bytes[i] = alphabet[Math.floor(Math.random() * 16)];
  return bytes.join("");
}

// The app keeps a device id (mid) of its own; any 32 hex characters will do.
function deviceId() {
  let mid = stored("mid", "");
  if (!/^[0-9a-f]{32}$/.test(String(mid))) {
    mid = randomHex(32);
    keep("mid", mid);
  }
  return mid;
}

function signedUrl(path, params) {
  const mid = deviceId();
  const fields = {
    appid: APP_ID,
    clientver: "1000",
    mid,
    uuid: mid,
    dfid: "-",
    clienttime: String(Date.now()),
    ...params,
  };
  const names = Object.keys(fields).sort();
  const raw = APP_KEY + names.map((name) => `${name}=${fields[name]}`).join("") + APP_KEY;
  fields.signature = md5(raw);
  const query = Object.keys(fields)
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(String(fields[name]))}`)
    .join("&");
  return `${SERVICE}/${path}?${query}`;
}

async function api(path, params) {
  let response;
  try {
    response = await fetch(signedUrl(path, params), {
      headers: { "user-agent": UA, referer: `${BASE}/index.html` },
    });
  } catch (error) {
    throw fail("unavailable", `连不上 5sing 的接口：${error && error.message ? error.message : error}`);
  }
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw fail("unavailable", "5sing 的接口返回了看不懂的内容。");
  }
  if (!data || data.code !== 0) {
    throw fail(
      "unavailable",
      (data && (data.error || data.msg)) || `5sing 的接口报错（${(data && data.code) || response.status}）`,
    );
  }
  return data.data;
}

// ---------------------------------------------------------------------------
// Pages

const pageCache = new Map();

async function pageHtml(path) {
  const url = path.startsWith("http") ? path : BASE + path;
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.at < PAGE_TTL) return cached.html;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "user-agent": UA,
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.6",
        referer: `${BASE}/index.html`,
      },
    });
  } catch (error) {
    throw fail("unavailable", `连不上 5sing：${error && error.message ? error.message : error}`);
  }
  if (!response.ok) throw fail("unavailable", `5sing 返回了 ${response.status}。`);
  const html = await response.text();
  pageCache.set(url, { html, at: Date.now() });
  if (pageCache.size > 60) {
    const oldest = [...pageCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) pageCache.delete(oldest[0]);
  }
  return html;
}

// A JSON object written into the page after a marker, read by counting braces
// so a brace inside a string can't end it early.
function jsonAfter(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch (error) {
          return null;
        }
      }
    }
  }
  return null;
}

// The search page embeds its results as a single-quoted JavaScript string of
// JSON, where Chinese arrives as \u escapes that mean something only after the
// string is unescaped once and parsed once.
function readQuoted(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return "";
  const begin = at + marker.length;
  const quote = text[begin];
  let raw = "";
  for (let i = begin + 1; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      raw += ch + (text[i + 1] || "");
      i++;
      continue;
    }
    if (ch === quote) break;
    raw += ch;
  }
  return raw;
}

function decodeEscapes(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    i++;
    if (next === "u" || next === "x") {
      const width = next === "u" ? 4 : 2;
      const hex = raw.slice(i + 1, i + 1 + width);
      const code = parseInt(hex, 16);
      out += Number.isFinite(code) ? String.fromCharCode(code) : "";
      i += width;
    } else if (next === "n") out += "\n";
    else if (next === "r") out += "\r";
    else if (next === "t") out += "\t";
    else if (next === "b") out += "\b";
    else if (next === "f") out += "\f";
    else out += next || "";
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tracks

const knownTracks = new Map();

function rememberTracks(tracks) {
  for (const track of tracks) {
    if (!track || !track.id) continue;
    knownTracks.delete(track.id);
    knownTracks.set(track.id, track);
  }
  while (knownTracks.size > 4000) {
    const first = knownTracks.keys().next().value;
    knownTracks.delete(first);
  }
}

function splitId(id) {
  const hit = /^(yc|fc|bz):(\d+)$/.exec(String(id));
  if (!hit) throw fail("unavailable", "这首歌的编号看不懂，可能来自别的插件。");
  return { kind: hit[1], sid: hit[2] };
}

function trackUrl(kind, sid) {
  return `${BASE}/${kind}/${sid}.html`;
}

function makeTrack({ kind, sid, name, artist, artistId, cover, albumName }) {
  const id = `${kind}:${sid}`;
  const track = {
    id,
    name: textOf(name || ""),
    artists: artist ? [{ id: String(artistId || ""), name: textOf(artist) }] : [],
    album: { id: "", name: textOf(albumName || ""), imageUrl: sizedImage(cover) },
    duration: 0,
    url: trackUrl(kind, sid),
  };
  return track;
}

function parseChart(html, fallbackKind) {
  const tracks = [];
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const block = row.split("</tr>")[0];
    const meta = block.match(/name="i_more" value="(\d+)\$(yc|fc|bz)"/);
    if (!meta) continue;
    const kind = meta[2] || fallbackKind;
    const sid = meta[1];
    const title =
      (block.match(
        /<a\b[^>]*?href="[^"]*\/(?:yc|fc|bz)\/\d+\.html"[^>]*?title="([^"]*)"/,
      ) || [])[1] ||
      (block.match(
        /<a\b[^>]*?title="([^"]*)"[^>]*?href="[^"]*\/(?:yc|fc|bz)\/\d+\.html"/,
      ) || [])[1];
    if (!title) continue;
    const uploaderBlock = (block.match(/<td class="r_td_4">([\s\S]*?)<\/td>/) || [])[1] || "";
    const uploader = (uploaderBlock.match(/<a\b[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "";
    const uploaderId =
      (uploaderBlock.match(/href="[^"]*5sing\.kugou\.com\/(\d+)"/) || [])[1] || "";
    const cover = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
    tracks.push(
      makeTrack({
        kind,
        sid,
        name: title,
        artist: textOf(uploader),
        artistId: uploaderId,
        cover,
      }),
    );
  }
  rememberTracks(tracks);
  return tracks;
}

function parseHomeGroup(group, limit) {
  const pool = [];
  const yc = Array.isArray(group && group.yc) ? group.yc : [];
  const fc = Array.isArray(group && group.fc) ? group.fc : [];
  const most = Math.max(yc.length, fc.length);
  for (let i = 0; i < most; i++) {
    if (yc[i]) pool.push(["yc", yc[i]]);
    if (fc[i]) pool.push(["fc", fc[i]]);
  }
  const tracks = [];
  const seen = new Set();
  for (const [kind, item] of pool) {
    if (!item || !item.songId || seen.has(`${kind}:${item.songId}`)) continue;
    if (tracks.length >= limit) break;
    seen.add(`${kind}:${item.songId}`);
    tracks.push(
      makeTrack({
        kind,
        sid: item.songId,
        name: item.songName,
        artist: item.singerName,
        artistId: item.singerId,
        cover: item.songImg || item.singerImg,
        albumName: item.songStyle,
      }),
    );
  }
  rememberTracks(tracks);
  return tracks;
}

function parseSearch(html) {
  const raw = readQuoted(html, "var dataList = ");
  if (!raw) return [];
  let items;
  try {
    items = JSON.parse(decodeEscapes(raw));
  } catch (error) {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const tracks = [];
  for (const item of items) {
    const kind = ["yc", "fc", "bz"].includes(item.typeEname)
      ? item.typeEname
      : { 1: "yc", 2: "fc", 3: "bz" }[item.type];
    if (!kind || !item.songId) continue;
    tracks.push(
      makeTrack({
        kind,
        sid: item.songId,
        name: item.songName,
        artist: item.singer,
        artistId: item.singerId,
        albumName: item.style,
      }),
    );
  }
  rememberTracks(tracks);
  return tracks;
}

function parseArtistSongs(html, artistName, artistId, cover) {
  const tracks = [];
  for (const tag of html.match(/<a\b[^>]*>/g) || []) {
    const href = (tag.match(/href="([^"]*)"/) || [])[1] || "";
    const title = (tag.match(/title="([^"]*)"/) || [])[1] || "";
    const hit = href.match(/\/(yc|fc|bz)\/(\d+)\.html/);
    if (!hit || !title) continue;
    tracks.push(
      makeTrack({
        kind: hit[1],
        sid: hit[2],
        name: title,
        artist: artistName,
        artistId,
        cover,
      }),
    );
  }
  const unique = [];
  const seen = new Set();
  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    unique.push(track);
  }
  rememberTracks(unique);
  return unique;
}

function parsePlaylistCards(html) {
  const playlists = [];
  const seen = new Set();
  for (const piece of html.split('<dl class="album">').slice(1)) {
    const block = piece.split("</dl>")[0];
    const hit = block.match(/href="http:\/\/5sing\.kugou\.com\/(\d+)\/dj\/([0-9a-f]+)\.html"/);
    if (!hit || seen.has(hit[1] + "-" + hit[2])) continue;
    const nameMatch =
      block.match(/<dd class="jx_name">[\s\S]*?<a\b[^>]*?title="([^"]*)"/) ||
      block.match(/<dd class="jx_name">[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/);
    const name = nameMatch ? textOf(nameMatch[1]) : "";
    if (!name) continue;
    const image = (block.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
    const authorBlock = (block.match(/<dd class="author">([\s\S]*?)<\/dd>/) || [])[1] || "";
    const ownerNames = [];
    const ownerPattern = /<a\b[^>]*>([\s\S]*?)<\/a>/g;
    let ownerMatch;
    while ((ownerMatch = ownerPattern.exec(authorBlock))) {
      const piece = textOf(ownerMatch[1]);
      if (piece) ownerNames.push(piece);
    }
    const plays = (block.match(/<span class="lcount">([\d,]+)<\/span>/) || [])[1] || "";
    const id = `${hit[1]}-${hit[2]}`;
    seen.add(id);
    playlists.push({
      id,
      name,
      imageUrl: sizedImage(image),
      owner: ownerNames.length ? ownerNames[ownerNames.length - 1] : "",
      description: plays ? `${plays} 次播放` : "",
    });
  }
  return playlists;
}

function parseArtistCards(html) {
  const artists = [];
  const seen = new Set();
  for (const tag of html.match(/<a\b[^>]*>/g) || []) {
    const href = (tag.match(/href="([^"]*)"/) || [])[1] || "";
    const hit = href.match(/^https?:\/\/5sing\.kugou\.com\/(\d+)$/);
    if (!hit || seen.has(hit[1])) continue;
    const id = hit[1];
    const at = html.indexOf(tag);
    const after = html.slice(at + tag.length, at + tag.length + 800);
    const name = (after.match(/<h3[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "";
    const image = (after.match(/<img[^>]+src="([^"]+)"/) || [])[1] || "";
    if (!name) continue;
    seen.add(id);
    artists.push({ id, name: textOf(name), imageUrl: sizedImage(image) });
  }
  return artists;
}

// ---------------------------------------------------------------------------
// Home

export async function home() {
  const sections = [];
  let data = null;
  try {
    data = jsonAfter(await pageHtml("/index.html"), "web_rec_data");
  } catch (error) {
    data = null;
  }

  if (data) {
    for (const group of HOME_GROUPS) {
      const value = data[group.key];
      if (!value) continue;
      const tracks = parseHomeGroup(value, group.limit);
      if (!tracks.length) continue;
      const section = { title: group.title, tracks };
      if (group.key === "composite") {
        section.pageTitle = "今日推荐";
        section.subtitle = "5sing 首页推荐，原创与翻唱";
      } else {
        section.morePage = `home:${group.key}`;
      }
      sections.push(section);
    }
  }

  sections.push({
    title: t("Charts"),
    links: CHARTS.map((chart) => ({ title: chart.title, page: `chart:${chart.slug}` })),
    morePage: "charts",
  });
  sections.push({
    title: t("Browse"),
    links: [
      { title: "歌单广场", subtitle: "网友做的 5sing 歌单", page: "playlists" },
      { title: "音乐人", subtitle: "5sing 原创音乐人", page: "artists" },
    ],
  });

  if (!sections.some((section) => section.tracks)) {
    sections.unshift({
      title: t("Charts"),
      tracks: parseChart(await pageHtml("/top/"), "yc").slice(0, 30),
    });
  }

  return {
    title: "5sing",
    subtitle: "原创 · 翻唱 · 伴奏",
    description: "5sing 原创音乐基地的原创、翻唱与伴奏。",
    sections,
  };
}

// ---------------------------------------------------------------------------
// Browse pages

export async function browse({ page }) {
  if (!page || page === "charts") {
    const lists = await Promise.all(
      CHARTS.map(async (chart) => ({
        chart,
        tracks: parseChart(await pageHtml(chart.path), chart.slug).slice(0, 12),
      })),
    );
    return {
      title: t("Charts"),
      subtitle: "每周更新的原创、翻唱与伴奏榜单",
      sections: lists.map(({ chart, tracks }) => ({
        title: chart.title,
        tracks,
        morePage: `chart:${chart.slug}`,
      })),
    };
  }

  if (page.startsWith("chart:")) {
    const chart = CHARTS.find((item) => item.slug === page.slice(6));
    if (!chart) throw fail("unsupported", "没有这个榜单。");
    return {
      title: chart.title,
      subtitle: "本周榜单",
      sections: [{ tracks: parseChart(await pageHtml(chart.path), chart.slug) }],
    };
  }

  if (page === "playlists") {
    const cards = parsePlaylistCards(await pageHtml("/gd/"));
    return {
      title: t("Playlists"),
      subtitle: "5sing 歌单广场",
      sections: [{ playlists: cards.slice(0, 60), empty: "歌单广场暂时没有歌单。" }],
    };
  }

  if (page === "artists") {
    const artists = parseArtistCards(await pageHtml("/artists/all"));
    return {
      title: t("Artists"),
      subtitle: "5sing 音乐人",
      sections: [{ artists, empty: "暂时没有音乐人。" }],
    };
  }

  if (page.startsWith("home:")) {
    const group = HOME_GROUPS.find((item) => item.key === page.slice(5));
    if (!group || group.key === "composite") throw fail("unsupported", "没有这一栏。");
    const data = jsonAfter(await pageHtml("/index.html"), "web_rec_data");
    const value = data && data[group.key];
    if (!value) throw fail("unavailable", "这一栏暂时没有歌。");
    return {
      title: group.title,
      sections: [{ tracks: parseHomeGroup(value, 200) }],
    };
  }

  if (page === "recent") {
    const tracks = recent();
    return {
      title: t("Recently Played"),
      sections: [{ tracks, empty: "还没有播放记录。" }],
    };
  }

  if (page.startsWith("playlist:")) {
    return playlist({ id: page.slice(9) });
  }

  throw fail("unsupported", "5sing 插件没有这一页。");
}

export async function playlist({ id }) {
  const hit = /^(\d+)-([0-9a-f]+)$/.exec(String(id));
  if (!hit) throw fail("unavailable", "这个歌单的编号看不懂。");
  const html = await pageHtml(`/${hit[1]}/dj/${hit[2]}.html`);

  const name =
    (html.match(/<h2 class="dj_title c_wap">[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/) || [])[1] ||
    (html.match(/<title>([^<]*)<\/title>/) || [])[1] ||
    "";
  const cover =
    (html.match(/<dl class="c_wap dj_infos">[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1] || "";
  const owner =
    (html.match(/<h2><a\b[^>]*>([\s\S]*?)<\/a><\/h2>/) || [])[1] ||
    (html.match(/<dd class="lt a_btn">[\s\S]*?<h2><a\b[^>]*>([\s\S]*?)<\/a>/) || [])[1] ||
    "";

  // Only the playlist's own list: the page also shows recommendations below it.
  const listStart = html.indexOf('<ul class="c_wap dj_songitems">');
  const listEnd = listStart < 0 ? -1 : html.indexOf("</ul>", listStart);
  const listHtml =
    listStart < 0 ? "" : html.slice(listStart, listEnd < 0 ? html.length : listEnd);

  const tracks = [];
  for (const piece of listHtml.split('<li class="p_rel">').slice(1)) {
    const block = piece.split("</li>")[0];
    const href = (block.match(/<a\b[^>]*href="[^"]*\/(yc|fc|bz)\/(\d+)\.html"/) || []);
    if (!href[1]) continue;
    let title = "";
    const shared = block.match(/\?sn=([^"&]+)/);
    if (shared) {
      try {
        title = decodeURIComponent(shared[1]);
      } catch (error) {
        title = "";
      }
    }
    if (!title) {
      title = textOf(
        (block.match(/<a\b[^>]*class="[^"]*songlist_hits[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "",
      );
    }
    const singer = textOf(
      (block.match(/<span class="s_soner lt">[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "",
    );
    const singerId =
      (block.match(/<span class="s_soner lt">[\s\S]*?\/(\d+)"/) || [])[1] || "";
    if (!title) continue;
    tracks.push(
      makeTrack({
        kind: href[1],
        sid: href[2],
        name: title,
        artist: singer,
        artistId: singerId,
        cover,
      }),
    );
  }
  rememberTracks(tracks);

  const total = tracks.length;
  return {
    id,
    name: textOf(name.split(" - ")[0] || name),
    imageUrl: sizedImage(cover),
    owner: textOf(owner),
    trackCount: total,
    tracks,
  };
}

export async function artist({ id }) {
  const list = [];
  let profileHtml = "";
  const paths = [`/${id}/yc/1.html`, `/${id}/fc/1.html`, `/${id}/bz/1.html`];
  const pages = await Promise.all(
    paths.map(async (path) => {
      try {
        return await pageHtml(path);
      } catch (error) {
        return "";
      }
    }),
  );
  profileHtml = pages.find((html) => html && html.includes("/uid/")) || pages.find(Boolean) || "";
  if (!profileHtml) throw fail("unavailable", "打不开这位音乐人的主页。");

  const name = textOf((profileHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "");
  const cover =
    (profileHtml.match(/<img[^>]+src="(https:\/\/wsingbssdl\.kugou\.com\/[^"]+)"/) || [])[1] || "";

  for (const html of pages) {
    if (!html) continue;
    list.push(...parseArtistSongs(html, name, id, cover));
  }
  const tracks = [];
  const seen = new Set();
  for (const track of list) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  rememberTracks(tracks);

  return {
    artist: { id: String(id), name: name || String(id), imageUrl: sizedImage(cover) },
    tracks: tracks.slice(0, 60),
    albums: [],
  };
}

// ---------------------------------------------------------------------------
// Search

export async function search({ query, kind = "tracks", offset = 0 }) {
  if (kind !== "tracks") return { [kind === "albums" ? "albums" : kind]: [], more: false };
  const term = String(query || "").trim();
  if (!term) return { tracks: [], more: false };
  const url = `${SEARCH_BASE}/?keyword=${encodeURIComponent(term)}`;
  const html = await pageHtml(url);
  // The site's search answers the first ten only: its paging and type filters
  // are dead ends, so there is never more.
  return { tracks: offset > 0 ? [] : parseSearch(html), more: false };
}

export async function suggest({ query }) {
  const term = String(query || "").trim();
  if (!term) return [];
  try {
    const tracks = parseSearch(await pageHtml(`${SEARCH_BASE}/?keyword=${encodeURIComponent(term)}`));
    return tracks.slice(0, 10).map((track) =>
      track.artists.length ? `${track.artists[0].name} - ${track.name}` : track.name,
    );
  } catch (error) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Playing

export async function lyrics({ id }) {
  const { kind, sid } = splitId(id);
  const data = await api("song/detail", { songId: sid, songType: KINDS[kind].songType });
  const lrc = String((data && data.lyrics) || "")
    .split(/\r?\n/)
    .filter((line) => line.replace(/\[[^\]]*\]/g, "").trim().length > 0)
    .join("\n")
    .trim();
  // "TA还没添加歌词。" and the like aren't lyrics; a timed LRC always has a
  // [mm:ss] stamp.
  return lrc.includes("[") ? { lrc } : {};
}

export async function stream({ id }) {
  const { kind, sid } = splitId(id);
  const data = await api("song/getsongurl", {
    songid: sid,
    songtype: kind,
    version: "6.6.72",
  });
  const url = data.hqurl || data.lqurl || data.squrl || data.lqurl_backup;
  if (!url) throw fail("unavailable", "这首歌暂时没有可用的音频。");
  // The audio servers answer https as well, which keeps the app on one scheme.
  return { url: String(url).replace(/^http:/, "https:"), type: "mp3" };
}

// ---------------------------------------------------------------------------
// The listener's own shelf: likes and history, kept by the plugin itself,
// as the site has no accounts for the plugin.

export function like({ id, on }) {
  const ids = new Set(stored("liked", []));
  const kept = stored("likedTracks", {});
  if (on) {
    ids.add(id);
    const track = knownTracks.get(id);
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
