import { fieldId, normalize } from "./fields.js";
import { MOEGIRL, pageUrl } from "./sources.js";

export function extractPage(page, categories = [], parser = new DOMParser()) {
    if (page.format !== "html" || typeof page.content !== "string") throw new Error("正文必须是 get-page --format html 的结果");
    const doc = parser.parseFromString(page.content, "text/html");
    // MoeSkin stores the server-rendered article in an inert template. Read it without running skin JS.
    const container = doc.querySelector("template#MOE_SKIN_TEMPLATE_BODYCONTENT")?.content || doc;
    container.querySelectorAll("script,style,iframe,object,embed,form,nav,.navbox,.vertical-navbox,.toc,#toc,.mw-editsection,.reference,.references,.reflist,.printfooter,.noprint,rt,rp,.template-ruby-hidden,del,s").forEach(n => n.remove());
    const root = container.querySelector(".mw-parser-output") || doc.body;
    const clean = node => String(node?.textContent || "").replace(/\s+/g, " ").trim();
    const title = String(page.title || "未命名");
    const site = page.source || MOEGIRL;
    const url = pageUrl(site, title);
    const fields = {};
    const add = (id, value, section = "信息栏", anchor = "") => {
        value = String(value).trim();
        if (!value || value === "暂无" || value === "未知") return;
        fields[id] ||= [];
        if (!fields[id].some(v => v.value === value)) fields[id].push({ value, section, url: url + (anchor ? "#" + encodeURIComponent(anchor) : "") });
    };
    add("name", title, "页面标题");
    const readable = root.cloneNode(true);
    readable.querySelectorAll("p,li,tr,h1,h2,h3,h4,h5,h6,br,dt,dd").forEach(node => { node.before("\n"); node.after("\n"); });
    for (const line of readable.textContent.split(/\n+/)) add("content", line.replace(/\s+/g, " ").trim(), "页面原文（未归类）");
    const addCell = (id, node, label) => {
        const valueCell = node.cloneNode(true);
        valueCell.querySelectorAll("br").forEach(n => n.replaceWith("\n"));
        valueCell.querySelectorAll("li").forEach(n => n.append("\n"));
        const separator = id === "aliases" ? /[\n、；;]+/ : /\n+/;
        for (const raw of valueCell.textContent.split(separator)) add(id, raw.replace(/\s+/g, " ").trim(), "信息栏 · " + label);
    };
    // Labelled rows and one explicit heading followed by its colspan content.
    for (const row of root.querySelectorAll("tr")) {
        const cells = [...row.children].filter(n => /^(TH|TD)$/.test(n.tagName));
        if (cells.length === 1) {
            const id = fieldId(clean(cells[0]));
            const next = row.nextElementSibling;
            if (id && next?.children.length === 1 && !next.querySelector("table") && !fieldId(clean(next.children[0]))) addCell(id, next.children[0], clean(cells[0]));
            continue;
        }
        if (cells.length !== 2 || cells[0].querySelector("table") || cells[1].querySelector("table")) continue;
        const id = fieldId(clean(cells[0]));
        if (!id) continue;
        addCell(id, cells[1], clean(cells[0]));
    }
    // Fandom PortableInfobox and definition-list information boxes.
    for (const item of root.querySelectorAll(".pi-data")) {
        const label = clean(item.querySelector(".pi-data-label"));
        const id = fieldId(label), value = item.querySelector(".pi-data-value");
        if (id && value) addCell(id, value, label);
    }
    for (const term of root.querySelectorAll("dt")) {
        const id = fieldId(clean(term)), next = term.nextElementSibling;
        if (id && next?.tagName === "DD") addCell(id, next, clean(term));
    }
    // TextExtracts keeps explicit labelled paragraphs even when tables are omitted.
    // Only a short, recognized label before a colon establishes a field.
    let paragraphField = null;
    for (const node of root.querySelectorAll("h2,h3,h4,h5,h6,p")) {
        if (/^H/.test(node.tagName)) { paragraphField = null; continue; }
        const text = clean(node), match = /^([^：:]{1,20})[：:]\s*(.*)$/.exec(text);
        const id = match && fieldId(match[1]);
        if (id) {
            paragraphField = match[2] ? null : { id, label: match[1] };
            if (match[2]) for (const value of id === "aliases" ? match[2].split(/[、，；;]/) : [match[2]]) add(id, value, "正文标注 · " + match[1]);
        } else if (match && node.querySelector("b,strong")) paragraphField = null;
        else if (paragraphField && text) add(paragraphField.id, text, "正文标注 · " + paragraphField.label);
    }
    const stack = [];
    const sections = [];
    for (const node of root.querySelectorAll("h2,h3,h4,h5,h6,p,li,dt,dd")) {
        if (node.closest("table,.infobox,.moe-infobox,.portable-infobox,.NavFrame")) continue;
        if (/^H[2-6]$/.test(node.tagName)) {
            const level = Number(node.tagName[1]);
            while (stack.length && stack.at(-1).level >= level) stack.pop();
            const heading = clean(node), id = fieldId(heading);
            const entry = { level, heading, id, anchor: node.id || node.querySelector("[id]")?.id || "" };
            stack.push(entry);
            sections.push({ title: heading, field: id, anchor: entry.anchor });
            continue;
        }
        if (node.parentElement?.closest("p,li,dt,dd")) continue;
        const text = clean(node);
        if (!text) continue;
        const nearest = [...stack].reverse().find(h => h.id);
        if (nearest) add(nearest.id, text, stack.map(h => h.heading).join(" / "), nearest.anchor);
        else if (!stack.length && node.tagName === "P") add("summary", text, "引言");
    }
    for (const c of categories) {
        const title = typeof c === "string" ? c : c.title;
        if (title && !c.hidden) add("categories", title.replace(/^(Category|分类|分類):/i, ""), "页面分类");
    }
    return { id: site.id + ":" + normalize(title), title, fields, sections, source: { kind: "wiki", site: site.name, siteId: site.id, url, revid: page.revid ?? null, contentMethod: page.contentMethod || "parse", fetchedAt: new Date().toISOString() } };
}
