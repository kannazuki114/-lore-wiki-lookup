import { FIELDS, fieldId } from "./fields.js";
import { parseImport } from "./library.js";

export function mountWorkflows({ root, getSettings, save, automatic, host, summarize, getLatest, getLibrary, importData, saveEntry, deleteEntry, restoreLibrary, invalidate, status, storage }) {
    const box = document.createElement("div");
    box.className = "lore-workflows";
    box.innerHTML = `<details class="lore-auto"><summary>回复前自动查资料</summary>
      <label class="lore-check"><input type="checkbox" data-flow="enabled"> 生成回复前自动查询资料</label>
      <div class="lore-row"><label>每轮最多查询<input data-flow="maxQueries" type="number" min="1" max="3"></label><label>等待上限（毫秒）<input data-flow="budgetMs" type="number" min="1000" max="20000" step="1000"></label></div>
      <div class="lore-row"><label>扫描最近几条玩家消息<input data-flow="scanDepth" type="number" min="1" max="5"></label><label>注入预算（字符）<input data-flow="injectBudget" type="number" min="500" max="12000" step="500"></label></div>
      <label>关注词（每行一个）<textarea style="resize:none" data-flow="watchlist" rows="3" placeholder="明罗&#10;天野远子"></textarea></label>
      <label>自动返回字段<input data-flow="autoFields" placeholder="简介,作品,性格,能力,关系"></label>
      <label class="lore-check"><input data-flow="brackets" type="checkbox"> 也查询「括号中的未知名称」</label>
      <label class="lore-check"><input data-flow="autoSummary" type="checkbox"> 自动资料交给独立副模型整理（失败时用原文）</label>
      <label>资料整理通道<select data-flow="backend"><option value="bridge">独立副模型（本地桥接）</option><option value="host">酒馆当前连接（仅手动整理）</option></select></label>
      <label>整理等待上限（毫秒）<input data-flow="summaryTimeout" type="number" min="1000" max="30000" step="1000"></label>
      <p class="lore-muted">独立副模型地址、模型与密钥在桥接服务中配置。自动查询识别已知名称、别名及关注词，同名歧义会跳过。</p>
      <div class="lore-actions"><button data-flow-action="saveAuto">保存自动设置</button><button data-flow-action="checkAuto">检查本轮自动资料</button></div>
      <p data-flow="autoStatus" class="lore-muted"></p><label>上次自动注入预览<textarea style="resize:none" readonly data-flow="autoPreview" rows="5"></textarea></label>
    </details>
    <details class="lore-library"><summary>资料导入与编辑</summary>
      <p class="lore-muted">支持 TXT、Markdown、本插件 JSON 和 SillyTavern／角色卡世界书。可先预览，再合并或替换。</p>
      <label>导入文本的作品归属（可选）<input data-flow="importWork"></label>
      <label>导入方式<select data-flow="importMode"><option value="merge">合并资料，同 ID 更新</option><option value="replace">替换整个本地资料库</option></select></label>
      <label class="lore-check"><input type="checkbox" data-flow="includeDisabled"> 同时导入世界书已停用条目</label>
      <div class="lore-actions"><button data-flow-action="chooseImport">选择文件并预览</button><button data-flow-action="commitImport" disabled>确认导入</button></div>
      <pre data-flow="importPreview" class="lore-preview"></pre>
      <div class="lore-actions"><button data-flow-action="refreshLibrary">刷新条目列表</button><button data-flow-action="newEntry">新建条目</button><button data-flow-action="restore">恢复上次修改前的资料库</button></div>
      <label>本地条目<select data-flow="entries"><option value="">选择条目</option></select></label>
      <div data-flow="editor" hidden>
        <label>标题<input data-flow="entryTitle"></label><label>来源说明<input data-flow="entrySource"></label>
        <div data-flow="editorFields"></div>
        <div class="lore-row"><label>添加字段<select data-flow="newField"></select></label><button data-flow-action="addField">添加字段</button></div>
        <div class="lore-actions"><button data-flow-action="saveEntry">保存条目</button><button data-flow-action="deleteEntry">删除条目</button></div>
      </div><p data-flow="libraryStatus" class="lore-muted"></p>
    </details>`;
    root.querySelector(".lore-settings").append(box);
    const flow = name => box.querySelector('[data-flow="' + name + '"]');
    const action = name => box.querySelector('[data-flow-action="' + name + '"]');
    const config = getSettings();
    flow("importWork").value = host.getBinding().work || "";
    const mapping = { enabled: "autoEnabled", maxQueries: "autoMaxQueries", budgetMs: "autoBudgetMs", injectBudget: "autoInjectBudget", scanDepth: "autoScanDepth", watchlist: "autoWatchlist", autoFields: "autoFields", brackets: "autoBracketNames", autoSummary: "autoSummarize", backend: "summaryBackend", summaryTimeout: "summaryTimeoutMs" };
    for (const [name, key] of Object.entries(mapping)) {
        const input = flow(name);
        if (input.type === "checkbox") input.checked = config[key]; else input.value = config[key];
    }
    automatic.subscribe(state => { flow("autoStatus").textContent = state.notice; flow("autoPreview").value = state.text; });
    action("saveAuto").onclick = async () => {
        try {
            const values = Object.fromEntries(Object.entries(mapping).map(([name, key]) => { const input = flow(name); return [key, input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value]; }));
            await save(values); invalidate(); status("自动查询与资料整理设置已保存。");
        } catch (e) { status(e.message); }
    };
    action("checkAuto").onclick = async () => {
        try { const c = globalThis.SillyTavern?.getContext?.() || {}; await automatic.prepare(c.chat || [], 0, null, "normal"); }
        catch (e) { status(e.message); }
    };

    const summaryBox = document.createElement("details"); summaryBox.className = "lore-summary";
    summaryBox.innerHTML = `<summary>整理查询结果</summary><label>整理重点（可选）<input data-summary="topic" placeholder="例如 角色性格与说话习惯"></label><div class="lore-actions"><button data-summary-action="run">用副模型整理本批资料</button><button data-summary-action="inject" disabled>将整理用于下一轮</button></div><p data-summary="status" class="lore-muted">原始查询资料始终保留，整理结果须通过原文引用核验。</p><pre data-summary="result" class="lore-preview"></pre>`;
    root.querySelector(".lore-settings").append(summaryBox);
    const s = name => summaryBox.querySelector('[data-summary="' + name + '"]');
    const sb = name => summaryBox.querySelector('[data-summary-action="' + name + '"]');
    let summary = null, summaryController = null;
    root.addEventListener("lore-invalidated", () => { summaryController?.abort(); summary = null; sb("inject").disabled = true; s("result").textContent = ""; });
    sb("run").onclick = async () => {
        const snapshot = getLatest();
        if (!snapshot.latest) { s("status").textContent = "请先查询资料。"; return; }
        const active = new AbortController(); summaryController?.abort(); summaryController = active;
        sb("run").disabled = true; sb("inject").disabled = true; summary = null;
        s("status").textContent = "正在整理并核对引用…";
        try {
            const value = await summarize(snapshot.latest, s("topic").value || snapshot.query, { signal: active.signal });
            if (active.signal.aborted || !host.current(snapshot.mark) || getLatest().latest !== snapshot.latest) throw new Error("资料或聊天已改变，请重新整理");
            summary = { ...value, latest: snapshot.latest, mark: snapshot.mark };
            s("result").textContent = value.text;
            s("status").textContent = "已整理，引用短句已在来源中核对；请结合原文判断概括是否准确。";
            sb("inject").disabled = !host.status.injection;
        } catch (e) { s("status").textContent = e.message + "；原始查询资料仍可使用。"; }
        finally { sb("run").disabled = false; }
    };
    sb("inject").onclick = () => { try { if (summary) { host.inject(summary.latest, summary.mark, summary.text); s("status").textContent = "整理结果已用于当前聊天下一轮回复。"; } } catch (e) { s("status").textContent = e.message; } };

    let pack = null, snapshotRevision = 0, currentPack = null, editing = null, editingId = null;
    const libraryStatus = text => flow("libraryStatus").textContent = text + (storage.state.warning ? " " + storage.state.warning : "");
    async function refresh() {
        currentPack = await getLibrary();
        flow("entries").replaceChildren();
        const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "选择条目（" + currentPack.entries.length + "）"; flow("entries").append(placeholder);
        currentPack.entries.forEach((e, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = e.title; flow("entries").append(option); });
        return currentPack;
    }
    const addField = (id, values = []) => {
        if (flow("editorFields").querySelector('[data-edit-field="' + id + '"]')) return;
        const row = document.createElement("div"); row.dataset.editField = id; row.className = "lore-edit-field";
        const label = document.createElement("label"); label.textContent = FIELDS.find(f => f.id === id).label;
        const textarea = document.createElement("textarea"); textarea.rows = 3; textarea.value = (Array.isArray(values) ? values : [values]).join("\n---\n");
        const remove = document.createElement("button"); remove.textContent = "移除此字段"; remove.onclick = () => row.remove();
        label.append(textarea); row.append(label, remove); flow("editorFields").append(row);
    };
    const edit = entry => {
        editing = structuredClone(entry); editingId = entry.id || entry.title ? String(entry.id || entry.title) : null;
        flow("editor").hidden = false; flow("entryTitle").value = entry.title || ""; flow("entrySource").value = entry.source || "用户编辑";
        flow("editorFields").replaceChildren();
        const grouped = {};
        for (const [key, values] of Object.entries(entry.fields || {})) { const id = fieldId(key); if (id) (grouped[id] ||= []).push(...(Array.isArray(values) ? values : [values])); }
        for (const [id, values] of Object.entries(grouped)) addField(id, values);
        libraryStatus("编辑字段文本；多值可用单独一行 --- 分隔。保存前可导出完整资料包备份。");
    };
    for (const field of FIELDS) { const option = document.createElement("option"); option.value = field.id; option.textContent = field.label; flow("newField").append(option); }
    action("addField").onclick = () => addField(flow("newField").value);
    action("refreshLibrary").onclick = async () => { try { await refresh(); flow("editor").hidden = true; libraryStatus("条目列表已刷新。"); } catch (e) { libraryStatus(e.message); } };
    action("newEntry").onclick = async () => { await refresh(); edit({ title: "", fields: { summary: [""] } }); editingId = null; };
    flow("entries").onchange = () => { if (flow("entries").value !== "") edit(currentPack.entries[Number(flow("entries").value)]); };
    action("saveEntry").onclick = async () => {
        try {
            const fields = Object.fromEntries([...flow("editorFields").querySelectorAll("[data-edit-field]")].map(row => [row.dataset.editField, row.querySelector("textarea").value.split(/\r?\n---\r?\n/).map(v => v.trim()).filter(Boolean)]));
            await saveEntry({ ...editing, title: flow("entryTitle").value.trim(), source: flow("entrySource").value, fields }, editingId, currentPack.revision || 0);
            await refresh(); flow("editor").hidden = true; invalidate(); libraryStatus("条目已保存并立即用于检索。");
        } catch (e) { libraryStatus(e.message); }
    };
    action("deleteEntry").onclick = async () => {
        try { if (!editingId) throw new Error("新建条目尚未保存"); await deleteEntry(editingId, currentPack.revision || 0); await refresh(); flow("editor").hidden = true; invalidate(); libraryStatus("条目已删除，可恢复上次修改前的资料库。"); } catch (e) { libraryStatus(e.message); }
    };
    action("restore").onclick = async () => { try { const current = await getLibrary(); await restoreLibrary(current.revision || 0); await refresh(); flow("editor").hidden = true; invalidate(); libraryStatus("已恢复上次修改前的资料库。"); } catch (e) { libraryStatus(e.message); } };
    const file = root.querySelector('[data-control="file"]'); file.accept = ".json,.txt,.md,.markdown,application/json,text/plain,text/markdown";
    const choose = () => { box.querySelector(".lore-library").open = true; file.click(); };
    root.querySelector('[data-action="import"]').onclick = choose;
    action("chooseImport").onclick = choose;
    file.onchange = async () => {
        pack = null; action("commitImport").disabled = true;
        try {
            const input = file.files[0]; if (!input) return;
            if (input.size > 10 * 1024 * 1024) throw new Error("资料包不能超过 10 MB");
            const parsed = parseImport({ name: input.name, text: await input.text(), work: flow("importWork").value.trim(), includeDisabled: flow("includeDisabled").checked });
            const current = await getLibrary(); snapshotRevision = current.revision || 0;
            pack = parsed.pack;
            const known = new Set(current.entries.map(e => String(e.id || e.title)));
            const updates = pack.entries.filter(e => known.has(String(e.id || e.title))).length;
            flow("importPreview").textContent = "待导入 " + parsed.count + " 条，跳过停用条目 " + parsed.skipped + " 条；同 ID 更新 " + updates + " 条。\n" + parsed.warnings.join("\n") + "\n\n" + pack.entries.slice(0, 8).map(e => e.title + "\n" + JSON.stringify(e.fields).slice(0, 450)).join("\n\n");
            action("commitImport").disabled = !pack.entries.length;
        } catch (e) { flow("importPreview").textContent = e.message; } finally { file.value = ""; }
    };
    action("commitImport").onclick = async () => {
        try { if (!pack) return; const count = await importData(pack, flow("importMode").value, snapshotRevision); pack = null; action("commitImport").disabled = true; await refresh(); invalidate(); status("已导入资料，当前共 " + count + " 条；可恢复上次修改前的资料库。" + storage.state.warning); }
        catch (e) { libraryStatus(e.message); }
    };
    refresh().catch(e => libraryStatus(e.message));
}
