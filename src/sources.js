export const MOEGIRL = { id: "moegirl", name: "萌娘百科", url: "https://zh.moegirl.org.cn/", apiUrl: "https://mzh.moegirl.org.cn/api.php", articlePath: "https://zh.moegirl.org.cn/$1", transport: "bridge" };

export function wikiUrl(value) {
    let url;
    try { url = new URL(String(value).trim()); } catch { throw new Error("请输入完整的 Wiki 网址（含 https://）"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Wiki 地址必须是无账号信息的 HTTP(S) 网址");
    url.hash = "";
    return url;
}
export function apiCandidates(input, explicit) {
    if (explicit) { const u = wikiUrl(explicit); u.search = ""; return [u.href]; }
    const u = wikiUrl(input);
    if (u.pathname.endsWith("/api.php")) { u.search = ""; return [u.href]; }
    const directory = u.pathname.endsWith("/") ? u.pathname : u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1);
    const bareSubdirectory = /^\/[^/.]+$/.test(u.pathname) ? [new URL(u.pathname + "/api.php", u).href] : [];
    return [...new Set([...bareSubdirectory, new URL(directory + "api.php", u).href, new URL("/api.php", u).href, new URL("/w/api.php", u).href, new URL("/wiki/api.php", u).href])];
}
export function validateSource(source) {
    if (source.id === "moegirl") return { ...MOEGIRL };
    const api = wikiUrl(source.apiUrl); api.search = "";
    const home = wikiUrl(source.url || api.origin);
    const article = String(source.articlePath || new URL("index.php?title=$1", api).href);
    if (!article.includes("$1")) throw new Error("条目地址模板必须含 $1");
    wikiUrl(article.replace("$1", "Example"));
    if (!["direct", "bridge"].includes(source.transport || "direct")) throw new Error("未知访问方式");
    return { id: "wiki:" + api.href, name: String(source.name || home.hostname).slice(0, 80), url: home.href, apiUrl: api.href, articlePath: article, transport: source.transport || "direct" };
}
export function pageUrl(source, title) {
    return wikiUrl((source?.articlePath || MOEGIRL.articlePath).replace("$1", encodeURIComponent(title))).href;
}
export function sourceFromInfo(apiUrl, general, transport = "direct", name = "") {
    const base = wikiUrl(new URL(general.server || general.base || apiUrl, apiUrl).href);
    const articlePath = new URL(general.articlepath || "/w/index.php?title=$1", base).href.replace(/%241/g, "$1");
    return validateSource({ name: name || general.sitename, url: general.base || base.origin, apiUrl, articlePath, transport });
}
