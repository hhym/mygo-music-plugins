// 发版门槛：拿这次探测结果和仓库里的基线比，可播掉下来的插件要拦。
//
//   node scripts/gate.mjs             跑一遍，和 docs/基线.json 比
//   node scripts/gate.mjs --update    把这次结果写成新基线（确认退化可以接受后再用）
//
// 退出码：有插件从「可播」掉到「不可播」= 1；全部持平或变好 = 0。
// 出口 403/503 单独算一类：它多半是网络问题，不拦发版，但会在表里列出来。

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const baselinePath = join(root, "docs", "基线.json");
const update = process.argv.includes("--update");

function verdictOf(row) {
  const verify = row.verify || "";
  if (verify.startsWith("206") || verify.startsWith("200")) return "playable";
  if (verify.startsWith("403") || verify.startsWith("503")) return "blocked";
  if (verify.startsWith("404")) return "broken";
  if (row.stream === "失败" || row.stream === "空地址") return "broken";
  return "unknown";
}

function runProbe() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [join(here, "probe.mjs"), "--json"], { timeout: 20 * 60 * 1000, maxBuffer: 8 << 20 }, (error, stdout) => {
      const text = (stdout || "").trim();
      if (!text) {
        reject(new Error("probe 没有输出：" + (error && error.message)));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (parseError) {
        reject(new Error("probe 输出不是 JSON"));
      }
    });
  });
}

const now = await runProbe();

if (update || !existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify(now, null, 2) + "\n", "utf8");
  console.log((update ? "已更新" : "已建立") + "基线：docs/基线.json，共 " + now.rows.length + " 个插件");
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const before = new Map((baseline.rows || []).map((row) => [row.id, row]));

const regressions = [];
const blocked = [];
const improved = [];
const added = [];

for (const row of now.rows) {
  const old = before.get(row.id);
  const nowState = verdictOf(row);
  if (!old) {
    added.push(row.id + "（新插件，基线里没有）");
    continue;
  }
  const oldState = verdictOf(old);
  if (oldState === "playable" && nowState !== "playable") {
    if (nowState === "blocked") blocked.push(row.id + " → " + (row.verify || row.stream));
    else regressions.push(row.id + "：" + (old.verify || "可播") + " → " + (row.verify || row.stream || row.home));
  } else if (oldState !== "playable" && nowState === "playable") {
    improved.push(row.id);
  }
}

const count = (state) => now.rows.filter((row) => verdictOf(row) === state).length;
console.log("本次：可播 " + count("playable") + "，出口被拒 " + count("blocked") + "，坏 " + count("broken") + "，未知 " + count("unknown"));
console.log("基线：" + (baseline.at || "?") + " 时 可播 " + (baseline.rows || []).filter((row) => verdictOf(row) === "playable").length);

if (improved.length) console.log("\n变好 " + improved.length + " 个：" + improved.join("、"));
if (blocked.length) console.log("\n出口被拒（不拦发版）" + blocked.length + " 个：\n  " + blocked.join("\n  "));
if (added.length) console.log("\n" + added.join("\n"));
if (regressions.length) {
  console.log("\n退化 " + regressions.length + " 个：\n  " + regressions.join("\n  "));
  console.log("\n确认这些退化可以接受后，跑 node scripts/gate.mjs --update 收进基线。");
  process.exit(1);
}

console.log("\n没有退化，可以发版。");
