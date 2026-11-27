// 把 plugins/ 下的所有单站插件聚合成一个「单插件」，
// 结构照 mygo-music-hulumusic-plugin 的模式：一个 plugin.json + 一个 index.js。
//
//   node tools/build-allinone.mjs [--out allinone] [--only 4c44-music,33ve]
//
// 每个源被包进一个 IIFE，内部的 storage / setting 自动加前缀，互不干扰；
// 对外统一用 `<源 id>:<源内 id>` 编码 track / page，聚合层负责拆包分发。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGINS = path.join(ROOT, "plugins");

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const OUT = path.resolve(ROOT, opt("out", "allinone"));
const ONLY = opt("only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const EXPORTS = [
  "home",
  "browse",
  "album",
  "artist",
  "playlist",
  "playlists",
  "charts",
  "song",
  "search",
  "suggest",
  "lyrics",
  "stream",
  "like",
  "isLiked",
  "liked",
  "played",
  "recent",
  "savedAlbums",
  "saveAlbum",
  "stations",
  "stationNext",
  "setSetting",
];

/* ------------------------------------------------------------------ */
/* 分类：从 README 的四个分组表里读                                   */
/* ------------------------------------------------------------------ */

function readCategories() {
  const text = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const heads = [...text.matchAll(/\n### (音乐|DJ音乐|听书|评书)（\d+ 个）/g)].map((m) => ({
    at: m.index + 1,
    end: m.index + m[0].length,
    name: m[1],
  }));
  const out = [];
  for (let i = 0; i < heads.length; i++) {
    const head = heads[i];
    const stop = i + 1 < heads.length ? heads[i + 1].at : text.length;
    const body = text.slice(head.end, stop);
    const ids = [];
    for (const line of body.split("\n")) {
      if (!line.startsWith("|")) continue;
      const m = line.match(/`([^`]+)`/);
      if (m) ids.push(m[1]);
    }
    out.push({ name: head.name, ids });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 读源                                                               */
/* ------------------------------------------------------------------ */

function loadSources() {
  const cats = readCategories();
  const meta = new Map();
  for (const dir of fs.readdirSync(PLUGINS)) {
    const manifest = path.join(PLUGINS, dir, "plugin.json");
    if (!fs.existsSync(manifest)) continue;
    const json = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const code = fs.readFileSync(path.join(PLUGINS, dir, "index.js"), "utf8");
    meta.set(json.id, {
      id: json.id,
      name: json.name || json.id,
      description: json.description || "",
      version: json.version || "0.0.0",
      json: json,
      code: code,
      exports: [...new Set([...code.matchAll(/^export (?:async )?function ([A-Za-z0-9_$]+)/gm)].map((m) => m[1]))],
      locales: fs.existsSync(path.join(PLUGINS, dir, "locales", "zh-CN.json"))
        ? JSON.parse(fs.readFileSync(path.join(PLUGINS, dir, "locales", "zh-CN.json"), "utf8"))
        : {},
    });
  }

  const ordered = [];
  const used = new Set();
  for (const cat of cats) {
    for (const id of cat.ids) {
      const item = meta.get(id);
      if (!item || used.has(id)) continue;
      used.add(id);
      ordered.push(Object.assign(item, { cat: cat.name }));
    }
  }
  for (const [id, item] of meta) {
    if (!used.has(id)) ordered.push(Object.assign(item, { cat: "音乐" }));
  }
  return ONLY.length ? ordered.filter((s) => ONLY.includes(s.id)) : ordered;
}

/* ------------------------------------------------------------------ */
/* 生成 index.js                                                      */
/* ------------------------------------------------------------------ */

const VAR = (id) => "SRC_" + id.replace(/[^A-Za-z0-9_]/g, "_");

function moduleCode(src) {
  // 只把行首的 export 去掉，async 关键字原样保留
  const body = src.code.replace(/^export /gm, "");
  const returns = EXPORTS.map((name) => {
    const has = src.exports.includes(name);
    return has ? `  ${name}: ${name},` : `  ${name}: null,`;
  }).join("\n");

  return `/* ===== ${src.name}（${src.id}）===== */
const ${VAR(src.id)} = (function () {
  const host = subHost(${JSON.stringify(src.id)});
${body
  .split("\n")
  .map((line) => (line.trim() ? "  " + line : line))
  .join("\n")}
  return {
${returns}
  };
})();
`;
}

const HEAD = `// 聚合音源：把 plugins/ 里每个单站插件包成一个模块，对外只暴露一套接口。
// 自动生成，请改源插件后重跑 \`node tools/build-allinone.mjs\`，别手改这个文件。
//
// 编码约定：track / page / album 的 id 一律是 "<源 id>:<源内 id>"，
// 聚合层拆出前缀分发给对应源的函数；每个源的 storage / setting 自动加前缀隔离。

/* ------------------------------------------------------------------ */
/* 子宿主：storage 与 setting 按源隔离，其余直通                      */
/* ------------------------------------------------------------------ */

const __setting = (key) => {
  try {
    return host.setting ? host.setting(key) : "";
  } catch (error) {
    return "";
  }
};

function subHost(id) {
  const prefix = "__" + id + ".";
  return {
    t: (text) => host.t(text),
    storage: {
      get: (key) => host.storage.get(prefix + key),
      set: (key, value) => host.storage.set(prefix + key, value),
    },
    setting: (key) => __setting(prefix + key),
    platform: host.platform,
    spawn: (...rest) => host.spawn(...rest),
    dataDir: host.dataDir,
    ffmpegPath: host.ffmpegPath,
    openURL: (...rest) => (host.openURL ? host.openURL(...rest) : null),
  };
}

`;

const TAIL = fs.readFileSync(path.join(ROOT, "tools", "allinone-router.js"), "utf8");

function buildIndex(sources) {
  const parts = [HEAD];
  for (const src of sources) parts.push(moduleCode(src));
  parts.push("\n/* ------------------------------------------------------------------ */\n/* 源清单                                                             */\n/* ------------------------------------------------------------------ */\n");
  parts.push("const SRC_LIST = [\n");
  for (const src of sources) {
    parts.push(
      `  { id: ${JSON.stringify(src.id)}, name: ${JSON.stringify(src.name)}, cat: ${JSON.stringify(
        src.cat
      )}, description: ${JSON.stringify(src.description)}, mod: ${VAR(src.id)} },\n`
    );
  }
  parts.push("];\n");
  parts.push(TAIL);
  return parts.join("");
}

/* ------------------------------------------------------------------ */
/* 生成 plugin.json                                                   */
/* ------------------------------------------------------------------ */

function buildManifest(sources, meta) {
  const network = new Set();
  const processes = new Set();
  const settings = [];
  const seen = new Set();

  network.add("cdn.jsdelivr.net");
  for (const src of sources) {
    const perms = src.json.permissions || {};
    for (const host of perms.network || []) network.add(host);
    for (const bin of perms.process || []) processes.add(bin);
    for (const item of src.json.settings || []) {
      const key = src.id + "." + item.key;
      if (seen.has(key)) continue;
      seen.add(key);
      settings.push({
        key: key,
        label: src.name + " · " + (item.label || item.key),
        help: item.help || "",
        type: item.type || "text",
        options: item.options,
      });
    }
  }

  const manifest = {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    minAppVersion: "0.1.20",
    main: "index.js",
    ...(meta.icon ? { icon: "icon.png" } : {}),
    playback: "stream",
    description:
      "把 " + sources.length + " 个单站插件合进一个：音乐 / DJ / 听书 / 评书四类，收藏与最近播放在一处。",
    permissions: {
      network: [...network].sort(),
    },
    settings: [],
    navigation: [
      { builtin: "home" },
      { title: "音乐", page: "cat:音乐", icon: "music" },
      { title: "DJ 音乐", page: "cat:DJ音乐", icon: "chart" },
      { title: "听书", page: "cat:听书", icon: "album" },
      { title: "评书", page: "cat:评书", icon: "artist" },
      { builtin: "liked", title: "我喜欢" },
    ],
  };
  if (processes.size) manifest.permissions.process = [...processes];
  if (settings.length) {
    manifest.settings = settings.map((item) => {
      const clean = { key: item.key, label: item.label, help: item.help };
      if (item.type) clean.type = item.type;
      if (Array.isArray(item.options)) clean.options = item.options;
      return clean;
    });
  }
  return manifest;
}

/* ------------------------------------------------------------------ */
/* 合并 locales 与 README                                             */
/* ------------------------------------------------------------------ */

function buildLocales(sources) {
  const out = {};
  out[META.name] = META.name;
  const base = {
    音乐: "音乐",
    "DJ 音乐": "DJ 音乐",
    听书: "听书",
    评书: "评书",
    我喜欢: "我喜欢",
    分类: "分类",
    源列表: "源列表",
    首页: "首页",
    聚合音源: "聚合音源",
    "换个源试试": "换个源试试",
    搜索: "搜索",
    "暂无结果": "暂无结果",
  };
  Object.assign(out, base);
  for (const src of sources) Object.assign(out, src.locales || {});
  return out;
}

function buildReadme(sources, manifest) {
  const byCat = new Map();
  for (const src of sources) {
    if (!byCat.has(src.cat)) byCat.set(src.cat, []);
    byCat.get(src.cat).push(src);
  }
  const lines = [];
  lines.push("# MyGo 聚合音源 · 一个插件装完所有源");
  lines.push("");
  lines.push(
    "把 [mygo-music-plugins](https://github.com/hhym/mygo-music-plugins) 里的 " +
      sources.length +
      " 个单站插件合成一个插件，结构照 `mygo-music-hulumusic-plugin`：一份 `plugin.json`、一个 `index.js`、没有构建。"
  );
  lines.push("");
  lines.push("- 插件 id：`" + manifest.id + "`");
  lines.push("- 版本：" + manifest.version + "（`minAppVersion` " + manifest.minAppVersion + "）");
  lines.push("- 播放方式：`stream`");
  lines.push("");
  lines.push("## 怎么用");
  lines.push("");
  lines.push("侧栏四项就是四个分类，点进去是该分类下的源；进某个源就是它原来的首页，曲目、歌单、专辑、搜索全按源自己的逻辑走。");
  lines.push("");
  lines.push("track / 页面的 id 统一编成 `<源 id>:<源内 id>`，聚合层拆前缀分发；每个源的 `host.storage`、`host.setting` 都加了前缀，收藏与历史互不串味。");
  lines.push("");
  lines.push("## 源清单（" + sources.length + " 个）");
  for (const [cat, list] of byCat) {
    lines.push("");
    lines.push("### " + cat + "（" + list.length + " 个）");
    lines.push("");
    for (const src of list) lines.push("- **" + src.name + "** `" + src.id + "` — " + (src.description || ""));
  }
  lines.push("");
  lines.push("## 已知取舍");
  lines.push("");
  lines.push("- 首页只取 4 个代表源各一段，其余源都在分类页里，不再逐个拉首页，免得一进来就发几十个请求。");
  lines.push("- 搜索按并发池同时打多个源（限并发，单源超时即放弃），结果是各源命中的合并，`album.name` 里标了来源。");
  lines.push("- 只有部分源带专辑 / 歌手 / 歌单接口，对应页面按源能力显示，缺的源点了会提示没有。");
  lines.push("- 需要 ffmpeg 转码的那几个源（HE-AAC、Layer II、HLS）依赖 `permissions.process`，聚合后统一在插件设置里配置。");
  lines.push("");
  lines.push("## 重新生成");
  lines.push("");
  lines.push("```bash");
  lines.push("node tools/build-allinone.mjs");
  lines.push("```");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */

const sources = loadSources();
if (!sources.length) throw new Error("没有可用的源");

const index = buildIndex(sources);
const META = {
  id: opt("id", "allinone-music"),
  name: opt("name", "MyGo 聚合音源"),
  version: opt("version", "1.0.0"),
  icon: opt("icon", ""),
};
const manifest = buildManifest(sources, META);
const locales = buildLocales(sources);
const readme = buildReadme(sources, manifest);

fs.mkdirSync(path.join(OUT, "locales"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index.js"), index);
fs.writeFileSync(path.join(OUT, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "locales", "zh-CN.json"), JSON.stringify(locales, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, "README.md"), readme + "\n");
if (META.icon) fs.copyFileSync(path.resolve(ROOT, META.icon), path.join(OUT, "icon.png"));

console.log(
  `聚合 ${sources.length} 个源 → ${path.relative(ROOT, OUT)}/  index.js ${(index.length / 1024).toFixed(
    0
  )}KB  设置 ${(manifest.settings || []).length} 项  域名 ${manifest.permissions.network.length} 个`
);
