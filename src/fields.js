// Explicit aliases only: page prose is never silently promoted into structured facts.
export const FIELDS = [
    { id: "name", label: "名称", aliases: ["姓名", "本名", "名字", "中文名", "人物名", "译名", "name"] },
    { id: "aliases", label: "别名", aliases: ["别称", "別名", "其他名字", "昵称", "称号", "外号", "日文名", "英文名", "alias", "aliases", "nickname"] },
    { id: "work", label: "作品", aliases: ["所属作品", "登场作品", "出身作品", "初登场作品", "首次登场", "系列", "series", "franchise"] },
    { id: "version", label: "版本", aliases: ["世界线", "世界線", "路线"] },
    { id: "kind", label: "类型", aliases: ["条目类型"] },
    { id: "gender", label: "性别", aliases: ["性別", "gender", "sex"] },
    { id: "race", label: "种族", aliases: ["種族", "物种", "species", "race"] },
    { id: "affiliation", label: "阵营", aliases: ["陣營", "所属团体", "所属组织", "所属組織", "所属势力", "所属", "affiliation", "affiliations"] },
    { id: "occupation", label: "身份", aliases: ["职业", "職業", "职位", "occupation"] },
    { id: "appearance", label: "外貌", aliases: ["外观", "容貌", "外貌特征", "appearance"] },
    { id: "personality", label: "性格", aliases: ["性格特点", "性格特征", "个性", "personality"] },
    { id: "abilities", label: "能力", aliases: ["特殊能力", "技能", "能力设定", "战斗能力", "角色能力", "能力的详细说明", "powers", "powers and abilities"] },
    { id: "relationships", label: "关系", aliases: ["人际关系", "人際關係", "人物关系", "相关人物", "相关人士", "关系者", "亲属或相关人", "relatives", "relationships"] },
    { id: "history", label: "经历", aliases: ["經歷", "生平", "角色经历", "人物经历", "事迹", "history", "biography"] },
    { id: "plot", label: "剧情", aliases: ["劇情", "故事", "故事梗概", "剧情简介", "剧情梗概", "故事介绍", "登场剧情", "plot", "story", "synopsis"] },
    { id: "setting", label: "设定", aliases: ["設定", "背景设定", "世界观", "世界觀", "设定文档", "一设资料", "setting"] },
    { id: "chapter", label: "篇章", aliases: ["章节", "章節", "所属篇章"] },
    { id: "location", label: "地点", aliases: ["地點", "发生地点", "活动范围", "活动地区", "出身地区", "地区", "location", "residence"] },
    { id: "participants", label: "参与者", aliases: ["参与人物", "登场人物"] },
    { id: "time", label: "时间", aliases: ["时间线", "时间轴", "年表", "发生时间"] },
    { id: "summary", label: "简介", aliases: ["簡介", "介绍", "概述", "概要", "角色介绍", "overview", "introduction"] },
    { id: "tags", label: "萌属性", aliases: ["萌屬性", "标签", "属性", "萌点"] },
    { id: "categories", label: "分类", aliases: ["分類", "category"] }
];

export function normalize(value) {
    return String(value ?? "").normalize("NFKC").replace(/[\u200b-\u200f\ufeff]/g, "").trim().toLowerCase();
}

export function fieldId(value) {
    const key = normalize(value).replace(/[\s:：]/g, "");
    return FIELDS.find(f => [f.id, f.label, ...f.aliases].some(a => normalize(a).replace(/\s/g, "") === key))?.id || null;
}

export function selectFields(input) {
    const list = Array.isArray(input) ? input : String(input || "简介,作品,性格,能力,关系,经历,剧情").split(/[,，]/);
    return [...new Set(list.filter(s => String(s).trim()).map(s => {
        const id = fieldId(s);
        if (!id) throw new Error("未知字段：" + s);
        return id;
    }))];
}

// name=value: exact; name~value: contains. All constraints are AND, including duplicates.
export function parseQuery(input) {
    const text = String(input || "").trim().replace(/^(?:查字段|字段检索|字段)\s+/, "");
    const tokens = [];
    let current = "", quote = "", escaped = false;
    for (const c of text) {
        if (escaped) { current += c; escaped = false; continue; }
        if (c === "\\" && quote) { escaped = true; continue; }
        if (quote) { if (c === quote) quote = ""; else current += c; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (/\s/.test(c)) { if (current) tokens.push(current); current = ""; }
        else current += c;
    }
    if (quote || escaped) throw new Error("引号没有闭合");
    if (current) tokens.push(current);
    const filters = [], terms = [];
    for (const token of tokens) {
        const m = /^([^=~＝～]+)([=~＝～])(.*)$/.exec(token);
        if (!m) { terms.push(token); continue; }
        const id = fieldId(m[1]);
        if (!id) throw new Error("未知筛选字段：" + m[1]);
        if (!m[3].trim()) throw new Error("筛选值不能为空：" + m[1]);
        filters.push({ field: id, op: "=＝".includes(m[2]) ? "eq" : "contains", value: m[3].trim() });
    }
    return { text: terms.join(" "), filters };
}

export function matchFilters(record, filters) {
    const missing = [], mismatched = [];
    for (const f of filters) {
        const values = record.fields[f.field] || [];
        if (!values.length) { missing.push(f.field); continue; }
        const target = normalize(f.value);
        if (!values.some(v => f.op === "eq" ? normalize(v.value) === target : normalize(v.value).includes(target))) mismatched.push(f.field);
    }
    return { matches: !missing.length && !mismatched.length, missing, mismatched };
}

export function projectRecord(record, fields) {
    return { ...record, fields: Object.fromEntries(fields.map(id => [id, record.fields[id] || []])), missing: fields.filter(id => !record.fields[id]?.length) };
}
