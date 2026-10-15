import { fieldId } from "./fields.js";
import { validateOffline } from "./engine.js";

function stableId(value) {
    let h = 2166136261;
    for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0).toString(36);
}
function chunks(text, size = 12000) {
    const out = [];
    for (let start = 0; start < text.length;) {
        let end = Math.min(start + size, text.length);
        if (end < text.length) { const at = text.lastIndexOf("\n", end); if (at > start + size / 2) end = at + 1; }
        out.push(text.slice(start, end)); start = end;
    }
    return out;
}
function textEntries(text, name, work) {
    const entries = [], occurrences = new Map(); let current, active = "summary";
    const start = (title, line) => {
        const number = (occurrences.get(title) || 0) + 1; occurrences.set(title, number);
        current = { id: "text:" + stableId(name + "|" + title + "|" + number), title, fields: {}, source: name + " · 第 " + line + " 行" };
        if (work) current.fields.work = [work];
        entries.push(current); active = "summary";
    };
    const add = (field, value) => { if (value.trim()) (current.fields[field] ||= []).push(value.trim()); };
    start(name.replace(/\.[^.]+$/, ""), 1);
    let fenced = false;
    for (const [i, raw] of text.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n").entries()) {
        if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; add(active, raw); continue; }
        const heading = !fenced && /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(raw);
        const txtHeading = !fenced && /^【([^】]{1,100})】\s*$/.exec(raw);
        if (heading || txtHeading) {
            const title = (heading?.[2] || txtHeading[1]).trim();
            const field = fieldId(title);
            if (field) active = field;
            else if (txtHeading || heading[1].length <= 2) start(title, i + 1);
            else { active = "summary"; add(active, raw); }
            continue;
        }
        const labelled = !fenced && /^\s*(?:[-*]\s+)?(?:\*\*)?([^:：\n]{1,20}?)(?:\*\*)?\s*[:：]\s*(.*)$/.exec(raw);
        const field = labelled && fieldId(labelled[1]);
        if (field) { active = field; add(field, labelled[2]); }
        else add(active, raw);
    }
    return entries.filter(e => Object.entries(e.fields).some(([key, values]) => key !== "work" && values.length)).flatMap(entry => {
        // Long source text remains intact, divided into bounded segments for retrieval.
        const fields = Object.fromEntries(Object.entries(entry.fields).map(([key, values]) => [key, values.flatMap(v => chunks(v, 12000))]));
        if (fields.aliases) fields.aliases = fields.aliases.flatMap(v => v.split(/[、,，;；]/).map(s => s.trim()).filter(Boolean));
        return [{ ...entry, fields }];
    });
}
export function parseImport({ name, text, work = "", includeDisabled = false }) {
    if (typeof text !== "string" || text.length > 10 * 1024 * 1024) throw new Error("文件须为文本且不超过 10 MB");
    const warnings = [];
    let pack, skipped = 0;
    if (/\.json$/i.test(name)) {
        const data = JSON.parse(text.replace(/^\ufeff/, ""));
        if (data.schemaVersion === 1 && Array.isArray(data.entries)) pack = data;
        else {
            const book = data.data?.character_book || data.character_book || data;
            if (!book.entries || typeof book.entries !== "object") throw new Error("未识别为本插件资料包或 SillyTavern／角色卡世界书");
            const entries = [];
            for (const [key, raw] of Object.entries(book.entries)) {
                if (!raw || typeof raw.content !== "string") throw new Error("世界书条目缺少文本 content");
                const disabled = raw.disable === true || raw.enabled === false;
                if (disabled && !includeDisabled) { skipped++; continue; }
                const keys = Array.isArray(raw.key) ? raw.key : Array.isArray(raw.keys) ? raw.keys : [];
                const title = String(raw.comment || raw.name || keys[0] || "条目 " + key).trim();
                const fields = { summary: chunks(raw.content) };
                if (work) fields.work = [work];
                if (keys.length) fields.aliases = keys.filter(v => typeof v === "string" && v.trim());
                entries.push({ id: "worldbook:" + stableId(name + "|" + (raw.uid ?? raw.id ?? key)), title, fields, source: name + " · 世界书条目 " + (raw.uid ?? raw.id ?? key), importMeta: { format: "worldbook", disabled, primaryKeys: keys, secondaryKeys: raw.keysecondary || raw.secondary_keys || [], selective: !!raw.selective, constant: !!raw.constant } });
            }
            pack = { schemaVersion: 1, name: book.name || name, entries };
            warnings.push("世界书内容作为本地资料保存；宏、正则关键词和世界书激活规则不执行，次级关键词不会当成人物别名。");
        }
    } else if (/\.(txt|md|markdown)$/i.test(name)) {
        pack = { schemaVersion: 1, name, entries: textEntries(text, name, work) };
        warnings.push("按标题和明确字段拆分；其余原文保留为简介，不自动推断人物事实。");
    } else throw new Error("支持 JSON、TXT、MD 和 Markdown 文件");
    validateOffline(pack);
    return { pack, warnings, skipped, count: pack.entries.length };
}

export function createLibrary(storage, onChange = () => {}) {
    let queue = Promise.resolve();
    const empty = () => ({ schemaVersion: 1, name: "本地资料库", entries: [], revision: 0 });
    const read = async () => structuredClone(await storage.get("offline") || empty());
    const mutate = (fn, expectedRevision) => {
        const task = queue.then(async () => {
            const old = await read();
            if (expectedRevision !== undefined && expectedRevision !== (old.revision || 0)) throw new Error("资料库已更新，请刷新编辑器或重新预览后再保存");
            const next = fn(structuredClone(old));
            validateOffline(next);
            next.revision = (old.revision || 0) + 1;
            await storage.set("offline-backup", old);
            await storage.set("offline", next);
            onChange(validateOffline(next));
            return structuredClone(next);
        });
        queue = task.catch(() => {});
        return task;
    };
    return {
        read,
        import: (pack, mode = "merge", revision) => mutate(old => {
            validateOffline(pack);
            if (mode === "replace") return structuredClone(pack);
            if (mode !== "merge") throw new Error("未知导入方式");
            const entries = new Map(old.entries.map(e => [String(e.id || e.title), e]));
            for (const e of pack.entries) entries.set(String(e.id || e.title), e);
            return { ...old, entries: [...entries.values()] };
        }, revision),
        save: (entry, originalId, revision) => mutate(old => {
            if (!entry.id) entry = { ...entry, id: "entry:" + stableId(entry.title + "|" + Date.now() + "|" + Math.random()) };
            const at = originalId == null ? -1 : old.entries.findIndex(e => String(e.id || e.title) === String(originalId));
            if (originalId && at < 0) throw new Error("条目已被删除");
            if (old.entries.some((e, i) => i !== at && String(e.id || e.title) === String(entry.id))) throw new Error("条目 ID 重复");
            if (at >= 0) old.entries[at] = entry; else old.entries.push(entry);
            return old;
        }, revision),
        remove: (id, revision) => mutate(old => ({ ...old, entries: old.entries.filter(e => String(e.id || e.title) !== String(id)) }), revision),
        restore: async revision => {
            const backup = await storage.get("offline-backup");
            if (!backup) throw new Error("没有可恢复的上次版本");
            return mutate(() => structuredClone(backup), revision);
        }
    };
}
