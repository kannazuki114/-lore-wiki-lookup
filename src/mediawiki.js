// Shared, read-only MediaWiki wire contract for browser and anonymous bridge.
export const OPERATIONS = ["siteinfo", "search", "search-categories", "get-page", "get-categories", "get-category-members"];

export function encodeCursor(value) {
    return value ? btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
}
export function decodeCursor(token, operation) {
    if (!token) return {};
    if (typeof token !== "string" || token.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error("分页令牌无效");
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))));
    const key = { search: "sroffset", "search-categories": "sroffset", "get-category-members": "cmcontinue", "get-categories": "clcontinue" }[operation];
    if (!data || Array.isArray(data) || typeof data !== "object" || Object.keys(data).some(k => k !== "continue" && k !== key)) throw new Error("分页参数越界");
    if ("continue" in data && typeof data.continue !== "string") throw new Error("分页参数无效");
    if (key in data && (key === "sroffset" ? !Number.isInteger(data[key]) || data[key] < 0 : typeof data[key] !== "string")) throw new Error("分页参数无效");
    return data;
}
export function apiParameters(operation, args = {}) {
    const q = String(args.query || "").trim().normalize("NFC");
    if (!OPERATIONS.includes(operation)) throw new Error("不支持的 Wiki 操作");
    if (operation !== "siteinfo" && (!q || q.length > 500)) throw new Error("查询名称应为 1–500 字符");
    const limit = Number(args.limit ?? 5);
    if (!Number.isInteger(limit) || limit < 1 || limit > (operation === "get-categories" ? 500 : 8)) throw new Error("每批数量超出范围");
    const params = { format: "json", formatversion: 2, origin: "*", errorformat: "plaintext" };
    if (operation === "siteinfo") return { ...params, action: "query", meta: "siteinfo", siprop: "general" };
    const next = decodeCursor(args.continueToken, operation);
    if (operation === "search" || operation === "search-categories") return { ...params, action: "query", list: "search", srsearch: q, srnamespace: operation === "search-categories" ? 14 : 0, srlimit: limit, srprop: "snippet", ...next };
    if (operation === "get-page") return { ...params, action: "parse", page: q, redirects: 1, prop: "text|displaytitle|revid|sections|properties|links" };
    if (operation === "get-categories") return { ...params, action: "query", prop: "categories", titles: q, redirects: 1, cllimit: limit, clprop: "hidden", ...next };
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
    if (operation === "siteinfo") {
        if (!data.query?.general?.generator?.includes("MediaWiki")) throw new Error("该地址未返回 MediaWiki 站点信息");
        return { operation, general: data.query.general };
    }
    if (operation === "search" || operation === "search-categories") {
        if (!Array.isArray(data.query?.search)) throw new Error("搜索响应无效");
        return { operation, items: data.query.search.map(r => ({ title: r.title, pageId: r.pageid, snippetHtml: r.snippet })), pagination };
    }
    if (operation === "get-page") {
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
    if (!Array.isArray(data.query?.categorymembers)) throw new Error("分类响应无效");
    return { operation, members: data.query.categorymembers.map(m => ({ title: m.title, type: m.type, namespace: m.ns })), pagination };
}
