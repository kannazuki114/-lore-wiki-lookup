import { normalize } from "./fields.js";

export function validateAliases(entries) {
    if (!Array.isArray(entries) || entries.length > 1000) throw new Error("别名表必须是数组，最多 1000 条");
    return entries.map(e => {
        if (!e || typeof e.alias !== "string" || typeof e.title !== "string" || !e.alias.trim() || !e.title.trim() || e.alias.length > 200 || e.title.length > 500) throw new Error("别名和完整标题不能为空且不能过长");
        return { alias: e.alias.trim(), title: e.title.trim(), work: String(e.work || "").trim(), sourceId: String(e.sourceId || "moegirl") };
    });
}
export function resolveAlias(text, entries, sourceId, work) {
    const matches = entries.filter(e => e.sourceId === sourceId && normalize(e.alias) === normalize(text) && (!work || !e.work || normalize(e.work) === normalize(work)));
    const scoped = work && matches.some(e => normalize(e.work) === normalize(work)) ? matches.filter(e => normalize(e.work) === normalize(work)) : matches;
    return [...new Map(scoped.map(e => [e.title, e])).values()];
}
export function workMatch(record, work) {
    if (!work) return "unbound";
    const key = value => normalize(value).replace(/[《》〈〉\s]/g, "");
    const target = key(work);
    const evidence = [...(record.fields.work || []), ...(record.fields.categories || [])].map(v => key(v.value));
    if (evidence.some(v => v.includes(target)) || key(record.title).startsWith(target + ":")) return "matched";
    return record.fields.work?.length ? "different" : "unknown";
}
