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
    root.innerHTML = `<header><span class="lore-kicker">MOEGIRLPEDIA · FIELD LOOKUP</span><h2>人物与剧情查询</h2><p>按字段找资料，沿来源读故事。</p></header>
      <details class="lore-connection"><summary>连接与离线资料</summary>
        <p>萌娘百科使用认证桥接；自定义 MediaWiki 可直连或使用公共桥接。</p>
        <label>查询方式<select data-control="source"><option value="bridge">联网优先，离线补充</option><option value="offline">仅离线资料</option></select></label>
        <label>桥接地址<input data-control="bridge" placeholder="http://127.0.0.1:39765"></label>
        <label>配对令牌<input data-control="token" type="password" autocomplete="off" placeholder="桥接启动时显示的令牌，仅保留在内存"></label>
        <p class="lore-muted">萌娘百科用户名和 Bot Password 仅在桥接服务的环境变量中配置。</p>
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
      <label>Wiki 来源<select data-control="wiki"></select></label>
      <div class="lore-row"><label>当前作品<input data-control="work" placeholder="可选，例如 东方Project"></label><button data-action="bind">绑定当前聊天</button></div>
      <details class="lore-aliases"><summary>当前作品的别名映射</summary><p class="lore-muted">每行：别名=完整页面标题。按当前来源与作品保存；同名多义时会显示候选。</p><textarea data-control="aliases" rows="3" placeholder="灵梦=博丽灵梦"></textarea><button data-action="saveAliases">保存别名</button></details>
      <div class="lore-row"><label>检索方式<select data-control="mode"><option value="search">按条件搜索</option><option value="page">指定页面提取</option><option value="categories">搜索分类名称</option><option value="category">分类直接成员</option><option value="subcategories">浏览子分类</option></select></label><label>每批候选<select data-control="limit"><option>3</option><option selected>5</option><option>8</option></select></label></div>
      <label>查询名称或条件<textarea data-control="query" rows="2" placeholder='例：原神 阵营~西风骑士团；指定页面：博丽灵梦'></textarea></label>
      <p class="lore-muted">多个条件同时满足。= 精确匹配，~ 包含匹配；带空格的值用双引号。未读取到的字段不算命中。</p>
      <details open><summary>返回字段</summary><div class="lore-fields" data-control="fields"></div></details>
      <div class="lore-actions"><button class="lore-primary" data-action="search">查询资料</button><button data-action="next" disabled>下一批</button><button data-action="inject" disabled>用于下一轮回复</button><button data-action="clear">清除注入</button></div>
      <p class="lore-warning">当前版本按页面字段提取，尚不提供章节级防剧透过滤。</p>
      <p role="status" aria-live="polite" data-control="status">准备就绪</p><div class="lore-actions" data-control="trail"></div><div data-control="results"></div>`;
    target.append(root);
    const control = name => root.querySelector('[data-control="' + name + '"]');
    const button = name => root.querySelector('[data-action="' + name + '"]');
    control("source").value = settings.mode;
    control("bridge").value = settings.bridgeUrl;
    const refreshSources = (id = getSettings().activeSource) => {
        control("wiki").replaceChildren();
        for (const source of getSettings().sources) { const option = document.createElement("option"); option.value = source.id; option.textContent = source.name; control("wiki").append(option); }
        if (getSettings().sources.some(s => s.id === id)) control("wiki").value = id;
    };
    const refreshAliases = () => {
        control("aliases").value = getSettings().aliases.filter(e => e.sourceId === control("wiki").value && e.work === control("work").value.trim()).map(e => e.alias + "=" + e.title).join("\n");
    };
    const applyBinding = () => { const binding = host.getBinding(); refreshSources(binding.sourceId || getSettings().activeSource); control("work").value = binding.work || ""; refreshAliases(); };
    applyBinding();
    const defaults = new Set(["summary", "work", "personality", "abilities", "relationships", "history", "plot"]);
    for (const field of FIELDS) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox"; input.value = field.id; input.checked = defaults.has(field.id);
        label.append(input, field.label);
        control("fields").append(label);
    }
    let latest, cursor, mark, lastArgs, busy = false, inputRevision = 0, discovered = null, trail = [];
    const status = text => control("status").textContent = text;
    const persist = async () => { await save({ mode: control("source").value, bridgeUrl: control("bridge").value.trim(), activeSource: control("wiki").value }, control("token").value); };
    const invalidate = () => { inputRevision++; cursor = null; latest = null; button("next").disabled = true; button("inject").disabled = true; root.dispatchEvent(new Event("lore-invalidated")); };
    root.addEventListener("input", event => { if (["query", "mode", "limit", "wiki", "work", "source", "bridge", "token"].some(name => event.target === control(name)) || control("fields").contains(event.target)) invalidate(); });
    control("wiki").onchange = () => { refreshAliases(); trail = []; control("trail").replaceChildren(); };
    control("work").onchange = refreshAliases;
    host.onChatChanged(() => { invalidate(); applyBinding(); trail = []; control("trail").replaceChildren(); control("results").replaceChildren(); status("聊天已切换，已读取此聊天的作品和来源绑定。"); });
    function navigate(title, mode, exact = false, entryId) {
        trail.push({ title: control("query").value, mode: control("mode").value });
        control("query").value = title; control("mode").value = mode; invalidate();
        renderTrail(); search(false, { resolveExact: exact, entryId });
    }
    function renderTrail() {
        control("trail").replaceChildren();
        if (!trail.length) return;
        const back = document.createElement("button"); back.textContent = "← 返回上级浏览";
        back.onclick = () => { const prev = trail.pop(); control("query").value = prev.title; control("mode").value = prev.mode; invalidate(); renderTrail(); search(false); };
        control("trail").append(back);
    }
    function render(result) {
        const container = control("results");
        container.replaceChildren();
        const intro = document.createElement("p");
        intro.textContent = result.notice;
        container.append(intro);
        for (const warning of result.warnings) { const p = document.createElement("p"); p.className = "lore-warning"; p.textContent = warning; container.append(p); }
        for (const item of result.navigation || []) {
            const row = document.createElement("article"); row.className = "lore-result";
            const title = document.createElement("h3"); title.textContent = item.title; row.append(title);
            const actions = document.createElement("div"); actions.className = "lore-actions";
            for (const [label, mode] of [["查看页面成员", "category"], ["展开子分类", "subcategories"]]) { const b = document.createElement("button"); b.textContent = label; b.onclick = () => navigate(item.title, mode); actions.append(b); }
            row.append(actions); container.append(row);
        }
        for (const choice of result.choices || []) {
            const row = document.createElement("article"); row.className = "lore-result lore-choice";
            const title = document.createElement("strong"); title.textContent = choice.title;
            const why = document.createElement("p"); why.textContent = choice.reason + (choice.work ? " · " + choice.work : "");
            const b = document.createElement("button"); b.textContent = "选择此条目"; b.onclick = () => navigate(choice.title, "page", true, choice.entryId);
            row.append(title, why, b); container.append(row);
        }
        for (const record of result.results) {
            const card = document.createElement("article"); card.className = "lore-result";
            const title = document.createElement("h3"); title.textContent = record.title;
            const source = document.createElement("p"); source.className = "lore-muted";
            source.textContent = record.source.kind === "wiki" ? record.source.site + " · " + record.source.cache + " · " + record.source.fetchedAt : "离线补充 · " + record.source.site;
            if (["different", "unknown"].includes(record.workMatch)) source.textContent += " · 作品归属未匹配（已手动选择）";
            card.append(title, source);
            if (record.source.url) {
                const link = document.createElement("a"); link.href = record.source.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = "打开来源页面 ↗"; card.append(link);
            }
            const list = document.createElement("dl");
            for (const [id, values] of Object.entries(record.fields)) {
                const dt = document.createElement("dt"), dd = document.createElement("dd");
                dt.textContent = FIELDS.find(f => f.id === id)?.label || id;
                dd.textContent = values.length ? values.map(v => v.value + "〔" + v.section + "〕").join("\n") : "未找到明确资料";
                list.append(dt, dd);
            }
            card.append(list); container.append(card);
        }
        if (result.rejected.length) {
            const detail = document.createElement("details"), summary = document.createElement("summary");
            summary.textContent = "未通过字段核验的候选（" + result.rejected.length + "）"; detail.append(summary);
            for (const r of result.rejected) { const p = document.createElement("p"); p.textContent = r.title + "：缺失 " + r.missing.join("、") + "；不匹配 " + r.mismatched.join("、"); detail.append(p); }
            container.append(detail);
        }
    }
    async function search(next, overrides = {}) {
        if (busy) return;
        busy = true; button("search").disabled = button("next").disabled = button("inject").disabled = true;
        status("正在查询并核验字段…");
        mark = host.stamp();
        const revision = inputRevision;
        try {
            await persist();
            const args = next ? { ...lastArgs, cursor } : { query: control("query").value, mode: control("mode").value, sourceId: control("wiki").value, work: control("work").value.trim(), limit: Number(control("limit").value), fields: [...control("fields").querySelectorAll("input:checked")].map(n => n.value), ...overrides };
            if (!args.fields.length) throw new Error("请至少选择一个返回字段");
            const result = await run(args);
            if (revision !== inputRevision || !host.current(mark)) { status("查询条件或聊天已修改，请重新查询。"); return; }
            latest = result; cursor = result.cursor; lastArgs = { ...args, cursor: undefined };
            render(result);
            status("本批读取 " + result.scanned + " 个 Wiki 候选，返回 " + result.results.length + " 条资料、" + (result.navigation?.length || 0) + " 个分类、" + (result.choices?.length || 0) + " 个待确认条目。" + (storage.state.warning || ""));
            button("next").disabled = !cursor;
            button("inject").disabled = !result.results.length || !host.current(mark) || !host.status.injection;
        } catch (e) { invalidate(); status(e.message); }
        finally { busy = false; button("search").disabled = false; }
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
    if (!host.status.tools) status("已加载查询面板；当前宿主没有注册 AI 工具。" + storage.state.warning);
}
