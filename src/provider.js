import { MOEGIRL, validateSource } from "./sources.js";
import { readMediaWiki } from "./mediawiki.js";

export const DEFAULTS = { mode: "bridge", bridgeUrl: "http://127.0.0.1:39765", timeoutMs: 20000, cacheMinutes: 30, activeSource: "moegirl", sources: [MOEGIRL], aliases: [] };
export const MOEGIRL_API = MOEGIRL.apiUrl;

export function createProvider({ settings = {}, source, token = "", storage, signal, fetchFn = globalThis.fetch } = {}) {
    const config = { ...DEFAULTS, ...settings };
    source = validateSource(source || config.sources.find(s => s.id === config.activeSource) || MOEGIRL);
    async function request(operation, args = {}) {
        if (signal?.aborted) throw new DOMException("查询已取消", "AbortError");
        if (config.mode === "offline") throw new Error("当前为离线模式");
        const key = JSON.stringify(["v4", source, config.bridgeUrl, operation, args]);
        const cache = await storage?.get("wiki-cache") || {};
        const old = cache[key];
        if (old && Date.now() - old.at < config.cacheMinutes * 60000) return { ...old.value, _cache: "fresh", _fetchedAt: old.at };
        const controller = new AbortController();
        const cancel = () => controller.abort();
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) controller.abort();
        const timer = setTimeout(() => controller.abort(), Math.max(1000, config.timeoutMs));
        try {
            let value;
            if (source.transport === "bridge") {
                const base = new URL(config.bridgeUrl);
                if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("桥接地址必须是 HTTP(S) 地址");
                if (!token) throw new Error("请填写桥接服务启动时显示的配对令牌（不是萌百密码）");
                const response = await fetchFn(new URL("/query", base), { method: "POST", headers: { "Content-Type": "application/json", "X-Lore-Token": token }, body: JSON.stringify({ operation, ...args, ...(source.id !== "moegirl" ? { source: { apiUrl: source.apiUrl } } : {}) }), signal: controller.signal, credentials: "omit" });
                if (!response.ok) throw new Error("Wiki 请求失败 HTTP " + response.status);
                value = await response.json();
            } else {
                value = await readMediaWiki(operation, args, async params => {
                    const url = new URL(source.apiUrl);
                    url.search = new URLSearchParams(params).toString();
                    const response = await fetchFn(url, { signal: controller.signal, credentials: "omit" });
                    if (!response.ok) throw new Error("Wiki 请求失败 HTTP " + response.status);
                    return response.json();
                }, source.id === "moegirl");
            }
            if (signal?.aborted) throw new DOMException("查询已取消", "AbortError");
            if (value.error || value.errors) throw new Error(String(value.error?.message || value.error?.info || value.error || "Wiki API 返回错误"));
            const at = Date.now();
            cache[key] = { at, value };
            const capped = Object.fromEntries(Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, 80));
            await storage?.set("wiki-cache", capped);
            return { ...value, _cache: "network", _fetchedAt: at };
        } catch (error) {
            if (signal?.aborted) throw new DOMException("查询已取消", "AbortError");
            const reason = error.name === "AbortError" ? "Wiki 请求超时" : error.message === "Failed to fetch" ? "无法连接 Wiki：可能是网络或浏览器跨域限制，可改用本地桥接" : error.message;
            if (old && operation !== "siteinfo") return { ...old.value, _cache: "stale", _fetchedAt: old.at, _warning: reason + "；使用过期缓存" };
            throw new Error(reason);
        } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
    }
    return { request, source };
}
