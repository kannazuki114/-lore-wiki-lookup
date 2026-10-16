import { createStorage } from "./src/storage.js";
import { createProvider, DEFAULTS } from "./src/provider.js";
import { createEngine, validateOffline } from "./src/engine.js";
import { createHost, context } from "./src/host.js";
import { mountPanel } from "./src/panel.js";
import { FIELDS } from "./src/fields.js";
import { MOEGIRL, apiCandidates, sourceFromInfo, validateSource } from "./src/sources.js";
import { validateAliases } from "./src/resolver.js";
import { createAutomatic, AUTOMATIC_DEFAULTS, validateAutomation } from "./src/automatic.js";
import { createLibrary } from "./src/library.js";
import { generateSummary } from "./src/summary.js";

export const VERSION = "0.5.0";
export const fields = FIELDS;
const storage = createStorage();
let settings = { ...DEFAULTS, ...AUTOMATIC_DEFAULTS }, token = "", offline = [], host, learned = [], automatic;
const library = createLibrary(storage, records => { offline = records; host?.clear(); });

export async function query(args, options = {}) {
    await ready;
    if (options.signal?.aborted) throw new Error("查询已取消");
    args = args || {};
    const binding = host.getBinding();
    const id = args.sourceId || binding.sourceId || settings.activeSource;
    const source = settings.sources.find(s => s.id === id);
    if (!source) throw new Error("绑定的 Wiki 已删除，请重新选择来源");
    const provider = createProvider({ settings, source, token, storage, signal: options.signal });
    const manualKeys = new Set(settings.aliases.map(e => JSON.stringify([e.sourceId, e.work, e.alias])));
    const aliases = [...settings.aliases, ...learned.filter(e => !manualKeys.has(JSON.stringify([e.sourceId, e.work, e.alias])))];
    const result = await createEngine({ provider, offline, aliases }).run({ ...args, work: args.work ?? binding.work });
    if (options.signal?.aborted) throw new Error("查询已取消");
    if (result.aliasHints?.length) {
        learned = [...new Map([...result.aliasHints, ...learned].map(e => [JSON.stringify(e), e])).values()].slice(0, 1000);
        await storage.set("learned-aliases", learned);
    }
    return result;
}

export async function configure(values, pairingToken) {
    const mode = values.mode ?? settings.mode;
    if (!["bridge", "offline"].includes(mode)) throw new Error("未知连接模式");
    const url = new URL(values.bridgeUrl ?? settings.bridgeUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("桥接地址无效");
    const autoValues = Object.fromEntries(Object.keys(AUTOMATIC_DEFAULTS).filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]));
    const next = validateAutomation({ ...settings, ...autoValues, mode, bridgeUrl: url.origin });
    if (values.activeSource !== undefined) {
        if (!settings.sources.some(s => s.id === values.activeSource)) throw new Error("Wiki 来源不存在");
        next.activeSource = values.activeSource;
    }
    if (values.aliases !== undefined) next.aliases = validateAliases(values.aliases);
    settings = next;
    if (Object.keys(autoValues).length) host?.clear();
    if (pairingToken !== undefined) token = String(pairingToken);
    await storage.set("settings", settings);
}

export function getSettings() { return structuredClone(settings); }
export async function discoverSource(input) {
    const errors = [];
    for (const apiUrl of apiCandidates(input.url, input.apiUrl)) {
        try {
            const source = validateSource({ name: input.name, url: input.url, apiUrl, transport: input.transport || "direct" });
            const p = createProvider({ settings: { ...settings, mode: "bridge", cacheMinutes: 0, timeoutMs: 7000 }, source, token });
            const info = await p.request("siteinfo");
            const discovered = sourceFromInfo(apiUrl, info.general, source.transport, input.name);
            let access = "站点已识别，搜索可用";
            try { await p.request("search", { query: info.general.mainpage || "Main Page", limit: 1 }); }
            catch (e) { access = "站点已识别，但搜索受限：" + e.message; }
            return { ...discovered, connection: access, verifiedAt: new Date().toISOString() };
        } catch (e) { errors.push(apiUrl + "：" + e.message); }
    }
    throw new Error("未识别到可访问的 MediaWiki API。可填写准确 API 地址或改用桥接。\n" + errors.join("\n"));
}
export async function saveSource(input) {
    const source = validateSource(input);
    if (source.id === "moegirl") throw new Error("内置萌娘百科不能被覆盖");
    settings.sources = [...settings.sources.filter(s => s.id !== source.id), { ...source, connection: input.connection || "未测试", verifiedAt: input.verifiedAt || null }];
    settings.activeSource = source.id;
    await storage.set("settings", settings);
    return source;
}
export async function removeSource(id) {
    if (id === "moegirl") throw new Error("不能删除默认萌娘百科");
    settings.sources = settings.sources.filter(s => s.id !== id);
    if (settings.activeSource === id) settings.activeSource = "moegirl";
    await storage.set("settings", settings);
}

export async function importData(data, mode = "replace", revision) {
    await ready;
    const saved = await library.import(data, mode, revision);
    return saved.entries.length;
}

export async function getLibrary() { await ready; return library.read(); }
export async function saveEntry(entry, originalId, revision) { await ready; return library.save(entry, originalId, revision); }
export async function deleteEntry(id, revision) { await ready; return library.remove(id, revision); }
export async function restoreLibrary(revision) { await ready; return library.restore(revision); }
export async function summarizeResult(result, topic = "", options = {}) {
    await ready;
    return generateSummary({ result, topic, settings, token, context: context(), signal: options.signal, auxiliary: host.withAuxiliary });
}
export async function prepareAutomatic(...args) { await ready; return automatic.prepare(...args); }
globalThis.LoreWikiLookup_Intercept = async (...args) => { try { return await prepareAutomatic(...args); } catch (e) { console.warn("[LoreWiki] 自动查询跳过", e.message); return ""; } };

async function boot() {
    // TauriTavern exposes its host ABI asynchronously, as in the reference plugin.
    if (globalThis.__TAURITAVERN__?.ready) await globalThis.__TAURITAVERN__.ready;
    settings = validateAutomation({ ...DEFAULTS, ...await storage.get("settings") });
    settings.sources = [MOEGIRL, ...(settings.sources || []).filter(s => s.id !== "moegirl").map(validateSource)];
    settings.aliases = validateAliases(settings.aliases || []);
    learned = validateAliases(await storage.get("learned-aliases") || []);
    const data = await storage.get("offline");
    if (data) { try { offline = validateOffline(data); } catch (e) { console.warn("[LoreWiki] 本地资料无效", e.message); } }
    host = createHost(query);
    automatic = createAutomatic({ query, host, getSettings, context, summarize: summarizeResult, knownNames: () => {
        const binding = host.getBinding(), id = binding.sourceId || settings.activeSource;
        const aliases = [...settings.aliases, ...learned].filter(e => e.sourceId === id && (!binding.work || !e.work || e.work === binding.work));
        return [...offline.flatMap(r => [r.title, ...(r.fields.aliases || []).map(v => v.value)]), ...aliases.flatMap(e => [e.alias, e.title]), context().name2].filter(Boolean);
    } });
    const mount = () => mountPanel({ run: query, settings, getSettings, discoverSource, saveSource, removeSource, save: configure, importData, exportData: getLibrary, getLibrary, saveEntry, deleteEntry, restoreLibrary, summarize: summarizeResult, automatic, storage, host });
    if (typeof document !== "undefined") {
        const mountWhenReady = () => {
            mount();
            if (!document.getElementById("lore-wiki-panel")) {
                const observer = new MutationObserver(() => { mount(); if (document.getElementById("lore-wiki-panel")) observer.disconnect(); });
                observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
            }
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountWhenReady, { once: true });
        else mountWhenReady();
    }
    return { version: VERSION, ...host.status };
}

export const ready = boot();
ready.catch(error => console.error("[LoreWiki] 初始化失败", error));
