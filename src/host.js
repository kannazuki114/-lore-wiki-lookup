import { FIELDS } from "./fields.js";
import { formatResult } from "./engine.js";

export function context() { return globalThis.SillyTavern?.getContext?.() || {}; }

export function createHost(run) {
    const status = { tools: 0, commands: 0, injection: false, warnings: [] };
    const promptId = "lore-wiki-lookup:manual";
    const ctx = context();
    let revision = 0;
    let previewBinding = {};
    const listeners = new Set();
    const clearListeners = new Set();
    let auxiliaryDepth = 0;
    const getBinding = () => ({ ...(context().chatMetadata?.loreWikiLookup || previewBinding) });
    const saveBinding = async binding => {
        const c = context();
        const clean = { work: String(binding.work || "").trim().slice(0, 200), sourceId: String(binding.sourceId || "") };
        if (c.chatMetadata) {
            c.chatMetadata.loreWikiLookup = clean;
            await c.saveMetadata?.();
        } else previewBinding = clean;
        clear();
        return clean;
    };
    const identity = () => {
        const c = context();
        return c.getCurrentChatId?.() ?? c.chatMetadata ?? null;
    };
    const stamp = () => ({ revision, identity: identity() });
    const current = mark => mark && mark.revision === revision && mark.identity === identity();
    const clear = () => {
        revision++;
        const c = context();
        c.setExtensionPrompt?.(promptId, "", 1, 0);
        c.setExtensionPrompt?.("lore-wiki-lookup:auto", "", 1, 0);
        for (const fn of clearListeners) fn();
    };
    const writeAutomatic = (text, mark) => {
        if (!current(mark)) return false;
        const c = context();
        if (!c.setExtensionPrompt || !status.injection) return false;
        c.setExtensionPrompt("lore-wiki-lookup:auto", text, c.extension_prompt_types?.IN_CHAT ?? 1, 0);
        return true;
    };
    const withAuxiliary = async fn => { auxiliaryDepth++; try { return await fn(); } finally { auxiliaryDepth--; } };
    const inject = (result, mark, textOverride) => {
        if (!current(mark)) throw new Error("聊天已切换，请重新查询后再注入");
        if (!result.results.length) throw new Error("没有可注入条目");
        const c = context();
        if (!c.setExtensionPrompt || !status.injection) throw new Error("当前宿主缺少注入或自动清理所需的事件接口");
        const text = textOverride || formatResult(result);
        if (text.length > 6000) throw new Error("整理内容超出 6000 字符，请减少资料后重试");
        c.setExtensionPrompt(promptId, text, c.extension_prompt_types?.IN_CHAT ?? 1, 0);
        return text;
    };
    const parameters = { type: "object", properties: {
        query: { type: "string", description: "名称或条件，例如 原神 阵营~西风骑士团；=精确，~包含；带空格的值用双引号" },
        mode: { type: "string", enum: ["search", "series", "page", "category", "categories", "subcategories"], description: "search名称检索；series字段/分类成员检索；page指定页面；category分类页面；categories搜索分类；subcategories子分类" },
        work: { type: "string", description: "作品范围，省略时使用当前聊天绑定；空串表示不限定" },
        resolveExact: { type: "boolean", description: "用户已从消歧候选中明确选定完整标题时设为 true" },
        entryId: { type: "string", description: "本地同名候选返回的条目 ID，用户选定后原样传回" },
        fields: { type: "string", description: "逗号分隔字段：" + FIELDS.map(f => f.label).join("、") },
        limit: { type: "integer", minimum: 1, maximum: 8 },
        cursor: { type: "string", description: "原样传回上次游标；其他参数保持不变" }
    }, required: ["query"] };
    if (typeof ctx.registerFunctionTool === "function") {
        try {
            ctx.registerFunctionTool({ name: "search_lore_fields", displayName: "查询人物与剧情字段", description: "查询萌娘百科人物、设定与剧情字段，离线资料补充。先搜索再按完整标题取字段。缺失字段不推断；可能含剧透。", parameters,
                action: async args => JSON.stringify(await run(args)), formatMessage: () => "正在查询 Wiki 资料" });
            status.tools++;
        } catch (e) { status.warnings.push("工具注册失败：" + e.message); }
    }
    if (ctx.SlashCommandParser?.addCommandObject && ctx.SlashCommand?.fromProps) {
        for (const [name, mode] of [["lorefields", "search"], ["lorepage", "page"], ["lorecategory", "category"], ["lorecategories", "categories"], ["loresubcategories", "subcategories"]]) {
            try {
                const named = ["fields", "limit", "cursor", "work"].map(key => ctx.SlashCommandNamedArgument?.fromProps({ name: key, description: key, typeList: [ctx.ARGUMENT_TYPE?.STRING || "string"], isRequired: false })).filter(Boolean);
                ctx.SlashCommandParser.addCommandObject(ctx.SlashCommand.fromProps({ name, helpString: "Wiki 字段查询；例 /" + name + " fields=性格,经历 博丽灵梦", namedArgumentList: named,
                    callback: async (args, input) => JSON.stringify(await run({ query: String(input || ""), mode, fields: args?.fields, limit: args?.limit, cursor: args?.cursor, work: args?.work })) }));
                status.commands++;
            } catch (e) { status.warnings.push("命令注册失败：" + e.message); }
        }
    }
    if (ctx.eventSource?.on) {
        ctx.eventSource.on(ctx.event_types?.CHAT_CHANGED || "CHAT_CHANGED", () => { clear(); for (const fn of listeners) fn(getBinding()); });
        ctx.eventSource.on(ctx.event_types?.GENERATION_ENDED || "GENERATION_ENDED", () => { if (!auxiliaryDepth) clear(); });
        ctx.eventSource.on(ctx.event_types?.GENERATION_STOPPED || "GENERATION_STOPPED", () => { if (!auxiliaryDepth) clear(); });
    }
    status.injection = !!ctx.setExtensionPrompt && !!ctx.eventSource?.on;
    return { status, stamp, current, inject, clear, writeAutomatic, withAuxiliary, isAuxiliary: () => auxiliaryDepth > 0, onClear: fn => clearListeners.add(fn), getBinding, saveBinding, onChatChanged: fn => listeners.add(fn) };
}
