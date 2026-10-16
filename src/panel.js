import { FIELDS } from "./fields.js";
import { wikiUrl } from "./sources.js";
import { mountWorkflows } from "./workflow-ui.js";

export function mountPanel({ run, settings, getSettings, discoverSource, saveSource, removeSource, save, importData, exportData, getLibrary, saveEntry, deleteEntry, restoreLibrary, summarize, automatic, storage, host }) {
    if (document.getElementById("lore-wiki-panel")) return;
    const target = document.querySelector("#extensions_settings2, #extensions_settings, #lore-demo");
    if (!target) return;
    const root = document.createElement("section");
    root.id = "lore-wiki-panel";
    root.className = "lore-wiki-panel";
    root.innerHTML = `<header><h2>人物与剧情查询</h2><p class="lore-muted">输入角色、作品或设定，查阅 Wiki 原文。</p><p class="lore-muted" data-control="scope"></p></header>
      <label>查询内容<div class="lore-search-input"><input data-control="query" aria-describedby="lore-query-help lore-query-error" placeholder="角色名、作品名或 Wiki 页面网址" enterkeyhint="search"><button data-action="clearQuery" aria-label="清空查询" title="清空查询" hidden>×</button></div></label>
      <p id="lore-query-help" class="lore-muted">例如：明罗、天野远子。按回车查询；按作品找成员可选“字段检索”。</p>
      <p id="lore-query-error" class="lore-error" hidden></p>
      <div class="lore-row lore-query-options"><label>查询方式<select data-control="mode"><option value="search">搜索人物、作品或设定</option><option value="series">字段检索：按作品找成员</option><option value="page">读取指定页面</option><option value="categories">查找分类</option><option value="category">查看分类成员</option><option value="subcategories">查看下级分类</option></select></label><label>资料类型<select data-control="preset"><option value="character">人物设定</option><option value="basic">基本资料</option><option value="story">剧情经历</option><option value="content">页面原文</option><option value="all">全部字段</option><option value="custom">自定义</option></select></label></div>
      <details class="lore-field-options"><summary>自定义字段与筛选 <span class="lore-muted" data-control="fieldCount"></span></summary>
        <div class="lore-fields" data-control="fields"></div>
        <div class="lore-row"><label>Wiki 来源<select data-control="wiki"></select></label><label>每批数量<select data-control="limit"><option>3</option><option selected>5</option><option>8</option></select></label></div>
        <p class="lore-muted">可加筛选：种族=人类（精确）、阵营~骑士（包含）。多个条件同时满足；缺失字段不算命中。</p>
      </details>
      <div class="lore-actions lore-query-actions"><button class="lore-primary" data-action="search">查询资料</button><button data-action="cancel" hidden>取消查询</button><button data-action="next" disabled hidden>下一批</button><button data-action="inject" disabled>用于下一轮回复</button></div>
      <p data-control="injectionHint" class="lore-muted">资料可能含剧透。查询后可选择用于下一轮回复。</p>
      <p role="status" aria-live="polite" data-control="status">输入名称开始查询。</p><div class="lore-actions" data-control="trail"></div><div data-control="results"></div>
      <details class="lore-settings"><summary>更多设置与本地资料</summary>
      <button data-action="clear">清除已注入资料</button>
      <details class="lore-connection"><summary>连接与离线资料</summary>
        <p class="lore-muted">默认直接查询萌娘百科，无需账号、令牌或模型。下面的桥接设置仅供自定义站点或可选模型整理使用。</p>
        <label>查询方式<select data-control="source"><option value="bridge">联网优先，离线补充</option><option value="offline">仅离线资料</option></select></label>
        <label>桥接地址<input data-control="bridge" placeholder="http://127.0.0.1:39765"></label>
        <label>配对令牌<input data-control="token" type="password" autocomplete="off" placeholder="仅保留在本页内存"></label><button data-action="showToken" aria-pressed="false">显示令牌</button>
        <p class="lore-muted">桥接地址和令牌仅供选择“本地桥接”的自定义 Wiki 使用。查询过程不调用 AI。</p>
        <div class="lore-actions"><button data-action="save">保存连接</button><button data-action="import">导入资料</button><button data-action="export">导出离线 JSON</button><button data-action="cache">清空查询缓存</button></div>
        <input data-control="file" type="file" accept=".json,application/json" hidden>
      </details>
      <details class="lore-sites"><summary>添加与管理 Wiki</summary>
        <label>站点名称（可选）<input data-control="siteName" placeholder="例如 THBWiki"></label>
        <label>Wiki 网址<input data-control="siteUrl" placeholder="https://thwiki.cc/"></label>
        <label>API 地址（自动探测失败时填写）<input data-control="siteApi" placeholder="https://example.org/w/api.php"></label>
        <label>条目网址模板（手动配置时可选，$1 代表标题）<input data-control="articlePath" placeholder="https://example.org/wiki/$1"></label>
        <label>访问方式<select data-control="transport"><option value="direct">浏览器直连（站点需允许跨域）</option><option value="bridge">本地桥接（公开 HTTPS Wiki）</option></select></label>
        <div class="lore-actions"><button data-action="probe">探测并测试</button><button data-action="addSite" disabled>保存站点</button><button data-action="manualSite">按 API 地址手动保存</button><button data-action="deleteSite">删除所选自定义站点</button></div>
        <p data-control="probeStatus" class="lore-muted">支持 MediaWiki；其他类型的 Wiki 暂不支持。测试不会发送萌百账号凭据。</p>
      </details>
      <div class="lore-row"><label>当前作品<input data-control="work" placeholder="可选，例如 东方Project"></label><button data-action="bind">绑定当前聊天</button></div>
      <details class="lore-aliases"><summary>当前作品的别名映射</summary><p class="lore-muted">每行：别名=完整页面标题。按当前来源与作品保存；同名多义时会显示候选。</p><textarea style="resize:none" data-control="aliases" rows="3" placeholder="灵梦=博丽灵梦"></textarea><button data-action="saveAliases">保存别名</button></details>
      </details>`;
    target.append(root);
    root.addEventListener("input", event => { if (event.target.tagName === "TEXTAREA") { event.target.style.height = "auto"; event.target.style.height = Math.min(event.target.scrollHeight + 2, 440) + "px"; } });
    const control = name => root.querySelector('[data-control="' + name + '"]');
    const button = name => root.querySelector('[data-action="' + name + '"]');
    control("source").value = settings.mode;
    control("bridge").value = settings.bridgeUrl;
    const refreshSources = (id = getSettings().activeSource) => {
        control("wiki").replaceChildren();
        for (const source of getSettings().sources) { const option = document.createElement("option"); option.value = source.id; option.textContent = source.name; control("wiki").append(option); }
        if (getSettings().sources.some(s => s.id === id)) control("wiki").value = id;
        updateScope();
    };
    const refreshAliases = () => {
        control("aliases").value = getSettings().aliases.filter(e => e.sourceId === control("wiki").value && e.work === control("work").value.trim()).map(e => e.alias + "=" + e.title).join("\n");
    };
    function updateScope() { control("scope").textContent = (getSettings().sources.find(s => s.id === control("wiki").value)?.name || "请选择来源") + " · " + (control("source").value === "offline" ? "仅离线" : "联网优先") + (control("work").value.trim() ? " · 作品：" + control("work").value.trim() : ""); }
    const applyBinding = () => { const binding = host.getBinding(); refreshSources(binding.sourceId || getSettings().activeSource); control("work").value = binding.work || ""; refreshAliases(); updateScope(); };
    applyBinding();
    const presets = { character: ["summary", "work", "personality", "abilities", "relationships"], basic: ["name", "aliases", "work", "gender", "race", "occupation", "affiliation", "summary"], story: ["summary", "history", "plot", "setting"], content: ["content"], all: FIELDS.map(f => f.id) };
    const defaults = new Set(presets.character);
    for (const field of FIELDS) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox"; input.value = field.id; input.checked = defaults.has(field.id);
        label.append(input, field.label);
        control("fields").append(label);
    }
    let latest, cursor, mark, lastArgs, busy = false, inputRevision = 0, discovered = null, trail = [], controller;
    const status = text => control("status").textContent = text;
    const persist = async () => { await save({ mode: control("source").value, bridgeUrl: control("bridge").value.trim(), activeSource: control("wiki").value }, control("token").value); };
    const invalidate = () => { inputRevision++; cursor = null; latest = null; button("next").disabled = true; button("next").hidden = true; button("inject").disabled = true; root.dispatchEvent(new Event("lore-invalidated")); };
    const updateFields = () => { control("fieldCount").textContent = "已选 " + control("fields").querySelectorAll("input:checked").length + " 项"; };
    updateFields();
    control("preset").onchange = () => {
        const selected = presets[control("preset").value];
        if (!selected) { root.querySelector(".lore-field-options").open = true; return; }
        for (const input of control("fields").querySelectorAll("input")) input.checked = selected.includes(input.value);
        invalidate(); updateFields();
    };
    control("fields").addEventListener("change", () => { control("preset").value = "custom"; updateFields(); });
    control("query").addEventListener("input", () => { button("clearQuery").hidden = !control("query").value; control("query").removeAttribute("aria-invalid"); root.querySelector("#lore-query-error").hidden = true; });
    control("query").addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); search(false); } });
    button("clearQuery").onclick = () => { controller?.abort(); invalidate(); control("query").value = ""; button("clearQuery").hidden = true; control("results").replaceChildren(); control("trail").replaceChildren(); trail = []; status("输入名称开始查询。"); control("query").focus(); };
    button("cancel").onclick = () => { controller?.abort(); invalidate(); status("已取消查询，可修改条件后重试。"); };
    button("showToken").onclick = () => { const show = control("token").type === "password"; control("token").type = show ? "text" : "password"; button("showToken").textContent = show ? "隐藏令牌" : "显示令牌"; button("showToken").setAttribute("aria-pressed", String(show)); };
    root.addEventListener("input", event => { if (["query", "mode", "preset", "limit", "wiki", "work", "source", "bridge", "token"].some(name => event.target === control(name)) || control("fields").contains(event.target)) { if (busy) { controller?.abort(); status("条件已修改，请重新查询。"); } invalidate(); } });
    control("wiki").onchange = () => { refreshAliases(); updateScope(); trail = []; control("trail").replaceChildren(); };
    control("source").addEventListener("change", updateScope);
    control("work").onchange = () => { refreshAliases(); updateScope(); };
    host.onChatChanged(() => { controller?.abort(); invalidate(); applyBinding(); trail = []; control("trail").replaceChildren(); control("results").replaceChildren(); status("聊天已切换，已读取此聊天的作品和来源绑定。"); });
    function navigate(title, mode, exact = false, entryId, preset) {
        trail.push({ title: control("query").value, mode: control("mode").value, preset: control("preset").value, fields: [...control("fields").querySelectorAll("input:checked")].map(n => n.value) });
        if (preset) { control("preset").value = preset; control("preset").dispatchEvent(new Event("change")); }
        control("query").value = title; control("mode").value = mode; invalidate();
        button("clearQuery").hidden = !title;
        renderTrail(); search(false, { resolveExact: exact, entryId });
    }
    function renderTrail() {
        control("trail").replaceChildren();
        if (!trail.length) return;
        const back = document.createElement("button"); back.textContent = "← 返回上级浏览";
        back.onclick = () => { const prev = trail.pop(); control("query").value = prev.title; control("mode").value = prev.mode; control("preset").value = prev.preset; for (const input of control("fields").querySelectorAll("input")) input.checked = prev.fields.includes(input.value); updateFields(); button("clearQuery").hidden = !prev.title; invalidate(); renderTrail(); search(false); };
        control("trail").append(back);
    }
    function render(result) {
        const container = control("results");
        container.replaceChildren();
        const intro = document.createElement("p");
        intro.className = "lore-muted"; intro.textContent = result.notice;
        container.append(intro);
        for (const warning of result.warnings) { const p = document.createElement("p"); p.className = "lore-warning"; p.textContent = warning; container.append(p); }
        for (const item of result.navigation || []) {
            const row = document.createElement("article"); row.className = "lore-result";
            const title = document.createElement("h3"); title.textContent = item.title; row.append(title);
            const actions = document.createElement("div"); actions.className = "lore-actions";
            for (const [label, mode] of [["查看页面成员", "category"], ["展开子分类", "subcategories"]]) { const b = document.createElement("button"); b.textContent = label; b.onclick = () => navigate(item.title, mode); actions.append(b); }
            row.append(actions); container.append(row);
        }
        const extraChoices = document.createElement("details"), extraSummary = document.createElement("summary");
        extraSummary.textContent = "其他候选（" + Math.max(0, (result.choices?.length || 0) - 8) + "）"; extraChoices.append(extraSummary);
        for (const [index, choice] of (result.choices || []).entries()) {
            const row = document.createElement("article"); row.className = "lore-result lore-choice";
            const title = document.createElement("strong"); title.textContent = choice.title;
            const why = document.createElement("p"); why.textContent = choice.reason + (choice.work ? " · " + choice.work : "");
            const b = document.createElement("button"); b.textContent = "选择此条目"; b.onclick = () => navigate(choice.title, "page", true, choice.entryId);
            row.append(title, why, b); (index < 8 ? container : extraChoices).append(row);
        }
        if (result.choices?.length > 8) container.append(extraChoices);
        for (const record of result.results) {
            const card = document.createElement("article"); card.className = "lore-result";
            const title = document.createElement("h3"); title.textContent = record.title;
            const source = document.createElement("p"); source.className = "lore-muted";
            const cacheNames = { network: "刚刚联网读取", fresh: "本地缓存", stale: "过期缓存" };
            source.textContent = record.source.kind === "wiki" ? record.source.site + " · " + (cacheNames[record.source.cache] || "联网资料") : "离线补充 · " + record.source.site;
            if (["different", "unknown"].includes(record.workMatch)) source.textContent += " · 作品归属未匹配（已手动选择）";
            card.append(title, source);
            if (record.source.url) {
                const link = document.createElement("a"); link.href = record.source.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "打开来源页面 ↗"; card.append(link);
            }
            const list = document.createElement("dl");
            for (const [id, values] of Object.entries(record.fields)) {
                if (!values.length) continue;
                const dt = document.createElement("dt"), dd = document.createElement("dd");
                dt.textContent = FIELDS.find(f => f.id === id)?.label || id;
                const text = values.map(v => v.value).join("\n\n");
                if (text.length > 380) {
                    const preview = document.createElement("p"); preview.textContent = text.slice(0, 280) + "…";
                    const more = document.createElement("details"), summary = document.createElement("summary"), full = document.createElement("div");
                    more.className = "lore-full-text"; summary.textContent = "展开完整资料（" + text.length.toLocaleString("zh-CN") + " 字）";
                    full.textContent = text; more.append(summary, full); dd.append(preview, more);
                } else dd.textContent = text;
                list.append(dt, dd);
            }
            card.append(list);
            const missing = Object.entries(record.fields).filter(([, values]) => !values.length).map(([id]) => FIELDS.find(f => f.id === id)?.label || id);
            if (missing.length) { const note = document.createElement("p"); note.className = "lore-muted"; note.textContent = "未找到明确资料：" + missing.join("、"); card.append(note); }
            if (!record.fields.content?.length && record.source.kind === "wiki") {
                const read = document.createElement("button"); read.textContent = "阅读页面原文";
                read.onclick = () => navigate(record.title, "page", true, undefined, "content");
                card.append(read);
            }
            container.append(card);
        }
        if (result.rejected.length) {
            const detail = document.createElement("details"), summary = document.createElement("summary");
            summary.textContent = "未通过字段核验的候选（" + result.rejected.length + "）"; detail.append(summary);
            const labels = ids => ids.map(id => FIELDS.find(f => f.id === id)?.label || id).join("、") || "无";
            for (const r of result.rejected) { const p = document.createElement("p"); p.textContent = r.title + "：缺失 " + labels(r.missing) + "；不匹配 " + labels(r.mismatched); detail.append(p); }
            container.append(detail);
        }
        if (!result.results.length && !result.navigation?.length && !result.choices?.length) {
            const empty = document.createElement("p"); empty.className = "lore-empty";
            empty.textContent = result.onlineState === "unavailable" ? "联网读取失败。请检查网络与来源后重试；也可导入本地资料补充。" : result.rejected.length ? "候选没有满足全部条件。可减少筛选条件，或读取指定页面查看原文。" : "没有找到匹配资料。试试角色全名、别名，或直接粘贴 Wiki 页面网址。";
            container.append(empty);
        }
    }
    async function search(next, overrides = {}) {
        if (busy) return;
        if (!control("query").value.trim()) {
            const error = root.querySelector("#lore-query-error"); error.textContent = "请输入角色名、作品名或页面网址。"; error.hidden = false;
            control("query").setAttribute("aria-invalid", "true"); control("query").focus(); return;
        }
        busy = true; button("search").disabled = button("next").disabled = button("inject").disabled = true;
        controller = new AbortController(); const active = controller;
        button("cancel").hidden = false; button("search").setAttribute("aria-busy", "true"); control("results").setAttribute("aria-busy", "true"); control("results").inert = true;
        status("正在查询并核验字段…");
        mark = host.stamp();
        const revision = inputRevision;
        try {
            await persist();
            const args = next ? { ...lastArgs, cursor } : { query: control("query").value, mode: control("mode").value, sourceId: control("wiki").value, work: control("work").value.trim(), limit: Number(control("limit").value), fields: [...control("fields").querySelectorAll("input:checked")].map(n => n.value), ...overrides };
            if (!args.fields.length) throw new Error("请至少选择一个返回字段");
            const result = await run(args, { signal: active.signal });
            if (active.signal.aborted) return;
            if (revision !== inputRevision || !host.current(mark)) { status("查询条件或聊天已修改，请重新查询。"); return; }
            latest = result; cursor = result.cursor; lastArgs = { ...args, cursor: undefined };
            render(result);
            status("本批找到 " + result.results.length + " 条资料" + (result.navigation?.length ? "、" + result.navigation.length + " 个分类" : "") + (result.choices?.length ? "、" + result.choices.length + " 个待选条目" : "") + (result.cursor ? "；还有下一批。" : "。") + (storage.state.warning || ""));
            button("next").disabled = !cursor;
            button("next").hidden = !cursor;
            button("inject").disabled = !result.results.length || !host.current(mark) || !host.status.injection;
        } catch (e) { if (!active.signal.aborted) { invalidate(); status(e.message); } }
        finally { busy = false; button("search").disabled = false; button("cancel").hidden = true; button("search").removeAttribute("aria-busy"); control("results").removeAttribute("aria-busy"); control("results").inert = false; }
    }
    button("search").onclick = () => search(false);
    button("next").onclick = () => search(true);
    button("save").onclick = async () => { try { await persist(); status("连接设置已保存；配对令牌仅保留在本页内存。"); } catch (e) { status(e.message); } };
    button("bind").onclick = async () => { try { await host.saveBinding({ work: control("work").value, sourceId: control("wiki").value }); invalidate(); status("已绑定当前聊天的作品与 Wiki 来源；其他聊天独立保存。"); } catch (e) { status(e.message); } };
    button("saveAliases").onclick = async () => {
        try {
            const work = control("work").value.trim(), sourceId = control("wiki").value;
            const entries = control("aliases").value.split(/\r?\n/).filter(s => s.trim()).map(line => {
                const at = line.indexOf("="); if (at < 1) throw new Error("别名格式应为：别名=完整标题");
                return { alias: line.slice(0, at), title: line.slice(at + 1), work, sourceId };
            });
            const others = getSettings().aliases.filter(e => e.work !== work || e.sourceId !== sourceId);
            await save({ mode: control("source").value, bridgeUrl: control("bridge").value.trim(), aliases: [...others, ...entries] });
            invalidate(); status("已保存当前来源与作品的别名。");
        } catch (e) { status(e.message); }
    };
    for (const name of ["siteName", "siteUrl", "siteApi", "transport", "articlePath"]) control(name).addEventListener("input", () => { discovered = null; button("addSite").disabled = true; });
    button("probe").onclick = async () => {
        button("probe").disabled = true; button("addSite").disabled = true;
        const input = { name: control("siteName").value, url: control("siteUrl").value, apiUrl: control("siteApi").value, transport: control("transport").value };
        const snapshot = JSON.stringify(input);
        control("probeStatus").textContent = "正在探测 API 并测试搜索…";
        try {
            await persist();
            const candidate = await discoverSource(input);
            if (snapshot !== JSON.stringify({ name: control("siteName").value, url: control("siteUrl").value, apiUrl: control("siteApi").value, transport: control("transport").value })) throw new Error("站点配置已修改，请重新测试");
            discovered = candidate; control("probeStatus").textContent = candidate.name + " · " + candidate.apiUrl + " · " + candidate.connection;
            button("addSite").disabled = false;
        } catch (e) { control("probeStatus").textContent = e.message; } finally { button("probe").disabled = false; }
    };
    button("addSite").onclick = async () => { try { if (!discovered) return; const s = await saveSource(discovered); refreshSources(s.id); refreshAliases(); invalidate(); status("已保存并选中 " + s.name); } catch (e) { status(e.message); } };
    button("manualSite").onclick = async () => {
        try {
            const apiUrl = control("siteApi").value.trim();
            if (!apiUrl) throw new Error("手动保存需要填写准确的 API 地址");
            const s = await saveSource({ name: control("siteName").value, url: control("siteUrl").value || wikiUrl(apiUrl).origin, apiUrl, articlePath: control("articlePath").value.trim() || undefined, transport: control("transport").value });
            refreshSources(s.id); refreshAliases(); invalidate(); status("站点已手动保存，连通性尚未验证。");
        } catch (e) { status(e.message); }
    };
    button("deleteSite").onclick = async () => { try { await removeSource(control("wiki").value); refreshSources(); refreshAliases(); invalidate(); status("自定义 Wiki 已删除；原聊天绑定可重新选择。"); } catch (e) { status(e.message); } };
    button("inject").onclick = () => { try { host.inject(latest, mark); status("已用于当前聊天下一轮生成；生成完成后自动清除。"); } catch (e) { status(e.message); } };
    button("clear").onclick = () => { host.clear(); button("inject").disabled = true; status("已清除注入"); };
    button("export").onclick = async () => {
        const data = await exportData();
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = "lore-offline.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    button("cache").onclick = async () => { await storage.set("wiki-cache", {}); status("查询缓存已清空，离线资料保留。"); };
    mountWorkflows({ root, getSettings, save, automatic, host, summarize, getLatest: () => ({ latest, mark, query: control("query").value }), getLibrary, importData, saveEntry, deleteEntry, restoreLibrary, invalidate, status, storage });
    control("injectionHint").textContent = host.status.injection ? "资料可能含剧透。查询后可用于当前聊天下一轮回复。" : "资料可能含剧透。当前为独立查询环境，注入回复需在酒馆内使用。";
    if (storage.state.warning) status(storage.state.warning);
}
