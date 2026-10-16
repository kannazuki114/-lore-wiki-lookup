// Shared, read-only MediaWiki wire contract for browser and anonymous bridge.
export const OPERATIONS = ["siteinfo", "search", "search-categories", "get-page", "get-categories", "get-category-members", "get-links"];

export function encodeCursor(value) {
    return value ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
}
export function decodeCursor(token, operation) {
    if (!token) return {};
    if (typeof token !== "string" || token.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("分页令牌无效");
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    const keys = { search: ["sroffset", "gsroffset"], "search-categories": ["sroffset", "gsroffset"], "get-category-members": ["cmcontinue", "gsroffset"], "get-categories": ["clcontinue"], "get-links": ["plcontinue"] }[operation] || [];
    if (!data || Array.isArray(data) || typeof data !== "object" || Object.keys(data).some(k => k !== "continue" && !keys.includes(k))) throw new Error("分页参数越界");
    if ("continue" in data && typeof data.continue !== "string") throw new Error("分页参数无效");
    for (const key of keys) if (key in data && (key.endsWith("offset") ? !Number.isInteger(data[key]) || data[key] < 0 : typeof data[key] !== "string")) throw new Error("分页参数无效");
    if (keys.filter(key => key in data).length > 1) throw new Error("分页参数冲突");
    return data;
}

// The public Moegirl API permits query generators and TextExtracts even when
// list=search / action=parse require authentication. No model or credentials.
export function publicParameters(operation, args = {}) {
    const standard = apiParameters(operation, args);
    if (["search", "search-categories", "get-category-members"].includes(operation)) {
        const next = decodeCursor(args.continueToken, operation);
        if (next.cmcontinue !== undefined) throw new Error("分类接口已改变，请重新查询第一页");
        const category = String(args.query).replace(/^(Category|分类|分類):/i, "").replace(/["\\]/g, "\\$&");
        return { format: "json", formatversion: 2, origin: "*", action: "query", generator: "search",
            gsrsearch: operation === "get-category-members" ? 'incategory:"' + category + '"' : String(args.query).trim(),
            gsrnamespace: operation === "search-categories" || operation === "get-category-members" && args.memberType === "subcat" ? 14 : 0,
            gsrlimit: Number(args.limit ?? 5), prop: "info", inprop: "url",
            ...(next.gsroffset !== undefined || next.sroffset !== undefined ? { gsroffset: next.gsroffset ?? next.sroffset } : {}) };
    }
    if (operation === "get-page") return { format: "json", formatversion: 2, origin: "*", action: "query", prop: "extracts|info|pageprops", titles: String(args.query).trim(), redirects: 1, exlimit: 1, inprop: "url" };
    return standard;
}

export async function readMediaWiki(operation, args, read, publicProfile = false) {
    // A generator continuation must stay on the generator path on the next page.
    const generatorCursor = decodeCursor(args.continueToken, operation).gsroffset !== undefined;
    if (publicProfile || generatorCursor) return normalizeResponse(operation, await read(publicParameters(operation, args)), args);
    try { return normalizeResponse(operation, await read(apiParameters(operation, args)), args); }
    catch (error) {
        if (error.name === "AbortError" || !["search", "search-categories", "get-page", "get-category-members"].includes(operation)) throw error;
        return normalizeResponse(operation, await read(publicParameters(operation, args)), args);
    }
}
export function apiParameters(operation, args = {}) {
    const q = String(args.query || "").trim().normalize("NFC");
    if (!OPERATIONS.includes(operation)) throw new Error("不支持的 Wiki 操作");
    if (operation !== "siteinfo" && (!q || q.length > 500)) throw new Error("查询名称应为 1–500 字符");
    const limit = Number(args.limit ?? 5);
    if (!Number.isInteger(limit) || limit < 1 || limit > (["get-categories", "get-links"].includes(operation) ? 500 : 8)) throw new Error("每批数量超出范围");
    const params = { format: "json", formatversion: 2, origin: "*", errorformat: "plaintext" };
    if (operation === "siteinfo") return { ...params, action: "query", meta: "siteinfo", siprop: "general" };
    const next = decodeCursor(args.continueToken, operation);
    if (operation === "search" || operation === "search-categories") return { ...params, action: "query", list: "search", srsearch: q, srnamespace: operation === "search-categories" ? 14 : 0, srlimit: limit, srprop: "snippet", ...next };
    if (operation === "get-page") return { ...params, action: "parse", page: q, redirects: 1, prop: "text|displaytitle|revid|sections|properties|links" };
    if (operation === "get-categories") return { ...params, action: "query", prop: "categories", titles: q, redirects: 1, cllimit: limit, clprop: "hidden", ...next };
    if (operation === "get-links") return { ...params, action: "query", prop: "links", titles: q, redirects: 1, plnamespace: 0, pllimit: limit, ...next };
    const type = args.memberType || "page";
    if (!["page", "subcat"].includes(type)) throw new Error("未知分类成员类型");
    return { ...params, action: "query", list: "categorymembers", cmtitle: /^(Category|分类|分類):/i.test(q) ? q : "Category:" + q, cmtype: type, cmlimit: limit, cmprop: "ids|title|type", ...next };
}
export function normalizeResponse(operation, data, args = {}) {
    if (data.error || data.errors) {
        const err = data.error || data.errors[0];
        throw new Error("Wiki " + (err.code || "error") + "：" + (err.info || err.text || "请求被拒绝"));
    }
    const pagination = { hasMore: !!data.continue, continueToken: encodeCursor(data.continue) };
    if (operation === "get-links") {
        const page = Object.values(data.query?.pages || {})[0];
        if (!page || page.missing !== undefined && page.missing !== false) throw new Error("页面链接不可用");
        return { operation, links: (page.links || []).filter(link => link.ns === 0).map(link => ({ title: link.title })), pagination };
    }
    if (operation === "siteinfo") {
        if (!data.query?.general?.generator?.includes("MediaWiki")) throw new Error("该地址未返回 MediaWiki 站点信息");
        return { operation, general: data.query.general };
    }
    if (operation === "search" || operation === "search-categories") {
        if (data.query?.pages || data.batchcomplete !== undefined && !data.query?.search) {
            const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
            return { operation, items: pages.map(p => ({ title: p.title, pageId: p.pageid, snippetHtml: "" })), pagination };
        }
        if (!Array.isArray(data.query?.search)) throw new Error("搜索响应无效");
        return { operation, items: data.query.search.map(r => ({ title: r.title, pageId: r.pageid, snippetHtml: r.snippet })), pagination };
    }
    if (operation === "get-page") {
        if (data.query?.pages) {
            const p = Object.values(data.query.pages)[0];
            if (!p || p.missing !== undefined && p.missing !== false) throw new Error("页面不存在");
            if (typeof p.extract !== "string" || !p.extract.trim()) throw new Error("页面正文摘要不可用，可打开来源页面查看");
            return { operation, title: p.title, format: "html", content: p.extract, revid: p.lastrevid, sections: [],
                disambiguation: Object.hasOwn(p.pageprops || {}, "disambiguation"), links: [], contentMethod: "extracts",
                _warning: "公开正文摘要可能省略信息栏、图片或部分段落；缺失字段请以来源页面为准。" };
        }
        const p = data.parse;
        const content = typeof p?.text === "string" ? p.text : p?.text?.["*"];
        if (typeof content !== "string") throw new Error("页面正文不可用");
        const disambiguation = Array.isArray(p.properties) ? p.properties.some(v => v.name === "disambiguation") : Object.hasOwn(p.properties || {}, "disambiguation");
        return { operation, title: p.title || args.query, format: "html", content, revid: p.revid, sections: p.sections || [], disambiguation, links: (p.links || []).filter(l => l.ns === 0).map(l => ({ title: l.title || l["*"] })) };
    }
    if (operation === "get-categories") {
        const pages = data.query?.pages;
        const p = Array.isArray(pages) ? pages[0] : Object.values(pages || {})[0];
        if (!p || p.missing !== undefined && p.missing !== false) throw new Error("分类所属页面不存在");
        return { operation, pageTitle: p.title, categories: (p.categories || []).map(c => ({ title: c.title, hidden: c.hidden === true || c.hidden === "" })), pagination };
    }
    if (data.query?.pages || data.batchcomplete !== undefined && !data.query?.categorymembers) {
        const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
        return { operation, members: pages.map(p => ({ title: p.title, namespace: p.ns, type: p.ns === 14 ? "subcat" : "page" })), pagination,
            _warning: "分类成员来自 Wiki 搜索索引，更新可能有延迟；仅列出直接成员，不递归子分类。" };
    }
    if (!Array.isArray(data.query?.categorymembers)) throw new Error("分类响应无效");
    return { operation, members: data.query.categorymembers.map(m => ({ title: m.title, type: m.type, namespace: m.ns })), pagination };
}
