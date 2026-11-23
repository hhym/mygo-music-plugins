// 单个插件的探测：在独立进程里加载插件，走一遍 home → 首曲 → stream，
// 再用一个 1 KB 的 Range 请求去验证返回的地址到底给不给内容。
// 由 probe.mjs 调用，输出一行 JSON。
//
// 用法：node scripts/probe-one.mjs plugins/<id>

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) {
  console.error("用法: node scripts/probe-one.mjs plugins/<id>");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(dir + "/plugin.json", "utf8"));
const store = new Map();

globalThis.host = {
  platform: process.platform,
  arch: process.arch,
  dir: process.cwd(),
  dataDir: "/tmp/probe-" + manifest.id,
  storage: {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    remove: (key) => store.delete(key),
  },
  setting: () => "",
  t: (text) => text,
  language: () => "zh-CN",
  openURL: () => {},
};

const result = {
  id: manifest.id,
  name: manifest.name,
  version: manifest.version,
  home: "",
  track: "",
  stream: "",
  verify: "",
  ms: 0,
  note: "",
};

const started = Date.now();
let trackId = "";
const note = (text) => {
  result.note = result.note ? result.note + "；" + text : text;
};

function describe(error) {
  const code = (error && error.code) || "error";
  const message = (error && error.message) || String(error);
  return code + ": " + message.replace(/https?:\/\/[^\s)]+/g, (url) => url.slice(0, 60)).slice(0, 120);
}

try {
  const plugin = await import(pathToFileURL(dir + "/index.js").href);

  if (typeof plugin.home !== "function") {
    result.home = "无 home";
  } else {
    try {
      const home = await plugin.home();
      const sections = (home && home.sections) || [];
      let first = null;
      let sheet = null;
      for (const section of sections) {
        const track = ((section && section.tracks) || []).find((item) => item && item.id);
        if (track) {
          first = track;
          break;
        }
      }

      /* 听书 / 电台类插件的首页常常只有专辑或歌单，没有直接可播的曲目，
         这里顺着第一个专辑取一首，避免把「首页没有曲目」误读成不能播。 */
      if (!first) {
        const sheets = [];
        for (const section of sections) {
          for (const item of (section && section.albums) || []) if (item && item.id) sheets.push(item.id);
        }
        if (sheets.length && typeof plugin.album === "function") {
          try {
            sheet = await plugin.album({ id: sheets[0] });
            first = ((sheet && sheet.tracks) || []).find((item) => item && item.id) || null;
            if (first) note("首页只有专辑，取第 1 本的第一首");
          } catch (error) {
            note("album " + describe(error));
          }
        }
      }

      result.home = "ok " + sections.length + " 块" + (sheet ? " +专辑" : "");
      if (first) {
        /* 显示用的 id 截断过，真正交给 stream 的必须是完整 id */
        trackId = String(first.id);
        result.track = trackId.slice(0, 24) + " " + String(first.name || "").slice(0, 40);
      } else {
        note("首页没有曲目");
      }
    } catch (error) {
      result.home = "失败";
      note("home " + describe(error));
    }
  }

  /* trackId 由 home 段填好，不再从展示字符串里猜 */
  if (trackId && typeof plugin.stream === "function") {
    try {
      const stream = await plugin.stream({ id: trackId });
      if (!stream || !stream.url) {
        result.stream = "空地址";
      } else {
        result.stream = (stream.type || "?") + " " + (stream.size ? Math.round(stream.size / 1048576) + "MB" : "无size");
        const headers = Object.assign({}, stream.headers || {}, { range: "bytes=0-1023" });
        try {
          const res = await fetch(stream.url, { headers, method: "GET" });
          const mime = (res.headers.get("content-type") || "").split(";")[0];
          const length = res.headers.get("content-length") || "";
          result.verify = res.status + " " + mime + (length ? " " + length + "B" : "");
          try {
            await res.arrayBuffer();
          } catch (error) {
            /* 探测体读不下来不影响状态码结论 */
          }
        } catch (error) {
          result.verify = "取不到: " + describe(error);
        }
      }
    } catch (error) {
      result.stream = "失败";
      note("stream " + describe(error));
    }
  } else if (!trackId) {
    result.stream = "跳过";
  }
} catch (error) {
  result.home = "加载失败";
  note(describe(error));
}

result.ms = Date.now() - started;
console.log(JSON.stringify(result));
