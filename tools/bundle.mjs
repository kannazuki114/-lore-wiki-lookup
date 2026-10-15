/**
 * 极简打包器：把 src/** + index.js 打成一个【经典脚本】dist/index.js。
 * 为什么需要：目标客户端里能正常加载的三方扩展都是单文件产物；多文件 ES 模块路径不可靠。
 * 支持的语法（本项目已全量扫描确认只有这些）：
 *   import { a, b } from "./x.js";
 *   export function f() {} / export async function f() {} / export const c = ...;
 *   export { a, b };
 * 任何不匹配的写法都会立刻抛错（绝不产出"看起来对"的坏包）。
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"));
const ENTRY = "index.js";

const NS_IMPORT_RE = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["'];?\s*$/;
const IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?[^\n]*$/;
const EXPORT_ASYNC_RE = /^export\s+async\s+function\s+([A-Za-z0-9_$]+)/;
const EXPORT_FN_RE = /^export\s+function\s+([A-Za-z0-9_$]+)/;
const EXPORT_CONST_RE = /^export\s+const\s+([A-Za-z0-9_$]+)/;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[^\n]*$/;

const toPosix = (p) => p.split(path.sep).join("/");
const rel = (abs) => toPosix(path.relative(ROOT, abs));

async function collect(dir, out) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { const relName = toPosix(path.relative(ROOT, p)); const isTopData = ["dist", "test", "docs", "data", "tools"].indexOf(relName) >= 0; if (!isTopData) await collect(p, out); }
        else if (e.name.endsWith(".js")) out.push(p);
    }
    return out;
}

export async function build() {
    const files = (await collect(path.join(ROOT, "src"), [])).concat([path.join(ROOT, ENTRY)]);
    const defs = [];
    let importCount = 0, exportCount = 0;
    for (const abs of files) {
        const id = rel(abs);
        const dir = path.posix.dirname(id);
        const text = await fs.readFile(abs, "utf8");
        // 硬拦：经典脚本产物里动态 import() 会抛 "A dynamic import callback was not specified"
        const dynMatch = /await\s+import\(/.exec(text);
        if (dynMatch) {
            const lineNo = text.slice(0, dynMatch.index).split("\n").length;
            throw new Error(id + " 第 " + lineNo + " 行用了动态 import(，打包成经典脚本会失败；请改为静态 import");
        }
        const names = new Set();
        // 别名展开：import { a as b } → 解构 { a: b }（"as" 在解构里是语法错误，曾经因此把坏产物发出去过）
        const aliasRe = /\bas\s+([A-Za-z_$][\w$]*)/g;
        const body = [];
        for (const line of text.split("\n")) {
            const s = line.trim();
const ns = NS_IMPORT_RE.exec(s);
            if (ns) {
                const nsSpec = ns[2];
                if (nsSpec[0] !== ".") throw new Error(id + " 里出现了非相对 import：" + nsSpec);
                const nsResolved = path.posix.normalize(path.posix.join(dir, nsSpec));
                body.push("var " + ns[1] + ' = __req("' + nsResolved + '");');
                importCount++;
                continue;
            }
            const im = IMPORT_RE.exec(s);
            if (im) {
                const deps = im[1].split(",").map((x) => x.trim()).filter(Boolean);
                const spec = im[2];
                if (spec[0] !== ".") throw new Error(id + " 里出现了非相对 import：" + spec);
                const resolved = path.posix.normalize(path.posix.join(dir, spec));
                // 别名展开：{ a as b } → { a: b }（解构里的 "as" 是语法错误；产物校验会拦下）
                const mappedDeps = deps.map(function (n) {
                    const am = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(n);
                    return am ? (am[1] + ": " + am[2]) : n;
                });
                const leftover = mappedDeps.filter(function (n) { return /\bas\b/.test(n); });
                if (leftover.length) throw new Error(id + " 的 import 有未处理的写法：" + leftover.join(", "));
                body.push("const { " + mappedDeps.join(", ") + ' } = __req("' + resolved + '");');
                importCount++;
                continue;
            }
            let m = EXPORT_ASYNC_RE.exec(s);
            if (m) { names.add(m[1]); body.push(line.replace(/^export\s+/, "")); exportCount++; continue; }
            m = EXPORT_FN_RE.exec(s);
            if (m) { names.add(m[1]); body.push(line.replace(/^export\s+/, "")); exportCount++; continue; }
            m = EXPORT_CONST_RE.exec(s);
            if (m) { names.add(m[1]); body.push(line.replace(/^export\s+/, "")); exportCount++; continue; }
            m = EXPORT_LIST_RE.exec(s);
            if (m) { for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) names.add(n); exportCount++; continue; }
            if (/^export\s/.test(s)) throw new Error(id + " 里有打包器不支持的 export 写法：" + s.slice(0, 80));
            body.push(line);
        }
        defs.push({ id: id, code: body.join("\n"), names: [...names] });
    }
    const header = [
        "/*! 人物与剧情 Wiki 查询 —— 单文件打包产物（经典脚本，无 import/export）。",
        " *  由 tools/bundle.mjs 生成；请勿直接修改本文件，改 src/ 后重新打包。",
        " *  模块数：" + defs.length + "，import：" + importCount + " 处，export：" + exportCount + " 处。",
        " */",
        "(function () {",
        "'use strict';",
        "var __cache = {}, __defs = {};",
        "function __def(p, f) { __defs[p] = f; }",
        "function __req(p) {",
        "    if (Object.prototype.hasOwnProperty.call(__cache, p)) return __cache[p];",
        "    if (!Object.prototype.hasOwnProperty.call(__defs, p)) throw new Error('[LoreWiki] 模块缺失: ' + p);",
        "    var m = __defs[p](__req);",
        "    __cache[p] = m;",
        "    return m;",
        "}",
        "",
    ].join("\n");
    const parts = [header];
    for (const d of defs) {
        parts.push("__def(" + JSON.stringify(d.id) + ", function (__req) {");
        parts.push(d.code);
        parts.push("return { " + d.names.join(", ") + " };");
        parts.push("});");
        parts.push("");
    }
    let hash = 2166136261;
    for (const d of defs) { const s = d.id + "|" + d.code; for (let i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 16777619); } }
    const stamp = { at: new Date().toISOString().slice(0, 19), hash: (hash >>> 0).toString(16), modules: defs.length };
    parts.push("try { globalThis.LoreWikiLookupBuild = " + JSON.stringify(stamp) + "; } catch (e) { /* 忽略 */ }");
    parts.push("var __entry = __req(" + JSON.stringify(ENTRY) + ");");
    parts.push("try { globalThis.LoreWikiLookup = __entry; } catch (e) { /* 忽略 */ }");
    parts.push("})();");
    parts.push("");
    const bundle = parts.join("\n");
    // 产物校验：经典脚本里不该出现 import/export 语句，也不该出现解构里的 as
    const badLines = bundle.split("\n").filter(function (l, i) { return /^(import|export)\s/.test(l.trim()) || /const \{[^}]*\bas\b[^}]*\} = __req\(/.test(l); });
    if (badLines.length) throw new Error("产物校验失败，以下行不是合法经典脚本：\n" + badLines.slice(0, 3).join("\n"));
    return { bundle: bundle, modules: defs.length, imports: importCount, exports: exportCount };
}

if (process.argv[1] && process.argv[1].endsWith("bundle.mjs")) {
    const r = await build();
    const outDir = path.join(ROOT, "dist");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "index.js"), r.bundle, "utf8");
    console.log("打包完成：dist/index.js，" + (r.bundle.length / 1024).toFixed(0) + " KB，模块 " + r.modules + " 个（import " + r.imports + " / export " + r.exports + "）");
}

