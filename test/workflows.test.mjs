import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, createLibrary } from '../src/library.js';
import { createStorage } from '../src/storage.js';
import { AUTOMATIC_DEFAULTS, detectQueries, createAutomatic, automaticText, validateAutomation } from '../src/automatic.js';
import { summarySources, validateSummary, generateSummary } from '../src/summary.js';
import { createHost } from '../src/host.js';
import { createBridge } from '../tools/bridge.mjs';
import { runAiSummary } from '../tools/ai-summary.mjs';

const record = { id: 'local:lin', title: '林澈', fields: { summary: [{ value: '林澈是调查员。', section: '简介' }], personality: [{ value: '谨慎，守信。', section: '性格' }] }, source: { kind: 'offline', site: '示例', note: '原创资料' } };
const result = () => ({ results: [structuredClone(record)], warnings: [], choices: [], notice: 'test' });
const goodSummary = JSON.stringify({ claims: [{ text: '林澈为人谨慎。', evidence: [{ sourceId: 'S1', quote: '谨慎，守信。' }] }] });

test('TXT 与 Markdown 标题、字段、多人物和代码围栏导入', () => {
    const parsed = parseImport({ name: '人物.md', work: '星港', text: '# 人物资料\n## 林澈\n性格：谨慎\n### 能力\n修理机器。\n## 沈岚\n**身份**：队长\n```text\n# 不应成为新条目\n```' });
    assert.equal(parsed.count, 2); assert.equal(parsed.pack.entries[0].title, '林澈');
    assert.deepEqual(parsed.pack.entries[0].fields.personality, ['谨慎']);
    assert.equal(parsed.pack.entries[0].fields.abilities[0], '修理机器。');
    assert.equal(parsed.pack.entries[1].fields.occupation[0], '队长');
    assert.ok(parsed.pack.entries[1].fields.occupation.includes('# 不应成为新条目'));
    assert.equal(parseImport({ name: '资料.txt', text: '没有标题的设定原文。' }).pack.entries[0].fields.summary[0], '没有标题的设定原文。');
});
test('世界书兼容两类导出，跳过停用条目，不把次级关键词当别名', () => {
    const data = { entries: { 0: { uid: 1, comment: '人物', key: ['小林'], keysecondary: ['雨天'], selective: true, content: '{{user}} 遇见林澈。' }, 1: { uid: 2, key: ['停用'], disable: true, content: '未启用' } } };
    const parsed = parseImport({ name: 'book.json', text: JSON.stringify(data) });
    assert.equal(parsed.count, 1); assert.equal(parsed.skipped, 1);
    assert.deepEqual(parsed.pack.entries[0].fields.aliases, ['小林']);
    assert.equal(parsed.pack.entries[0].fields.summary[0], '{{user}} 遇见林澈。');
    assert.deepEqual(parsed.pack.entries[0].importMeta.secondaryKeys, ['雨天']);
    assert.equal(parseImport({ name: 'book.json', includeDisabled: true, text: JSON.stringify(data) }).count, 2);
    assert.equal(parseImport({ name: 'card.json', text: JSON.stringify({ data: { character_book: { entries: [{ id: 9, keys: ['小林'], enabled: true, content: '设定' }] } } }) }).count, 1);
});
test('长文本完整分段，导入 ID 稳定且无效格式不会入库', () => {
    const text = '长'.repeat(42000);
    const one = parseImport({ name: 'long.txt', text }), two = parseImport({ name: 'long.txt', text });
    assert.equal(one.pack.entries[0].fields.summary.join(''), text);
    assert.equal(one.pack.entries[0].id, two.pack.entries[0].id);
    assert.equal(parseImport({ name: 'names.md', text: '# 林澈\n资料' }).pack.entries[0].id, parseImport({ name: 'names.md', text: '\n\n# 林澈\n资料更新' }).pack.entries[0].id);
    assert.throws(() => parseImport({ name: 'bad.json', text: '{}' }));
});
test('资料合并、编辑、删除、恢复、旧版本保存冲突检查', async () => {
    const storage = createStorage(null); let changes = 0;
    const library = createLibrary(storage, () => changes++);
    let data = await library.import({ schemaVersion: 1, entries: [{ id: 'a', title: '甲', fields: { 简介: '旧' } }] }, 'merge', 0);
    data = await library.save({ id: 'a', title: '甲', fields: { 简介: '新' } }, 'a', data.revision);
    await assert.rejects(library.remove('a', 1), /资料库已更新/);
    data = await library.remove('a', data.revision); assert.equal(data.entries.length, 0);
    data = await library.restore(data.revision); assert.equal(data.entries[0].fields.简介, '新');
    assert.equal(changes, 4);
});
test('自动识别优先完整名称，限制数量，未知括号须显式开启', () => {
    const chat = [{ is_user: true, mes: '林澈和沈岚进入「城堡」。' }];
    const config = { ...AUTOMATIC_DEFAULTS, autoMaxQueries: 1 };
    assert.deepEqual(detectQueries(chat, ['林澈', '沈岚'], config), ['林澈']);
    assert.deepEqual(detectQueries(chat, [], config), []);
    assert.deepEqual(detectQueries(chat, [], { ...config, autoBracketNames: true }), ['城堡']);
    assert.deepEqual(detectQueries([{ is_user: true, mes: 'Alice is here' }], ['Li'], config), []);
    assert.throws(() => validateAutomation({ autoMaxQueries: 100 }));
});
function autoHarness(query, extra = {}) {
    let revision = 0; let onClear; const writes = [];
    const host = { status: { injection: true }, stamp: () => revision, current: s => s === revision, getBinding: () => ({}), onClear: fn => onClear = fn, writeAutomatic: (text, s) => { if (s === revision) writes.push(text); }, isAuxiliary: () => false };
    const auto = createAutomatic({ query, host, getSettings: () => ({ ...AUTOMATIC_DEFAULTS, autoEnabled: true, ...extra }), knownNames: () => ['林澈'], summarize: async () => ({ text: '整理文本' }), context: () => ({}) });
    return { auto, writes, clear: () => { revision++; onClear(); } };
}
test('自动拦截和事件重复触发复用查询，quiet 不查询，清理后可再查', async () => {
    let calls = 0;
    const h = autoHarness(async () => { calls++; return result(); });
    const chat = [{ is_user: true, mes: '林澈来了。' }];
    await Promise.all([h.auto.prepare(chat), h.auto.prepare(chat)]);
    assert.equal(calls, 1); assert.match(h.writes.at(-1), /林澈/);
    await h.auto.prepare(chat, 0, null, 'quiet'); assert.equal(calls, 1);
    h.clear(); await h.auto.prepare(chat); assert.equal(calls, 2);
});
test('迟到查询在切换聊天后不注入，同名歧义跳过', async () => {
    let release;
    const h = autoHarness(() => new Promise(r => release = r));
    const pending = h.auto.prepare([{ is_user: true, mes: '林澈' }]);
    h.clear(); release(result()); await pending;
    assert.equal(h.writes.filter(Boolean).length, 0);
    const ambiguous = autoHarness(async () => ({ ...result(), choices: [{ title: '另一个林澈' }] }));
    await ambiguous.auto.prepare([{ is_user: true, mes: '林澈' }]);
    assert.equal(ambiguous.writes.filter(Boolean).length, 0);
    assert.match(ambiguous.auto.state.notice, /歧义/);
});
test('自动等待超时继续生成，迟到结果仍不能注入', async () => {
    let release;
    const h = autoHarness(() => new Promise(r => release = r), { autoBudgetMs: 20 });
    await h.auto.prepare([{ is_user: true, mes: '林澈' }]);
    release(result()); await new Promise(r => setTimeout(r, 5));
    assert.equal(h.writes.filter(Boolean).length, 0); assert.match(h.auto.state.notice, /等待上限/);
});
test('自动注入保持预算和出处，副模型失败使用原始资料', async () => {
    const text = automaticText(result(), 500); assert.ok(text.length <= 500); assert.match(text, /来源：/);
    const h = autoHarness(async () => result(), { autoSummarize: true, summaryBackend: 'host' });
    await h.auto.prepare([{ is_user: true, mes: '林澈' }]);
    assert.match(h.writes.at(-1), /调查员/); assert.match(h.auto.state.notice, /跳过当前主连接/);
});
test('副模型引用须指向本批来源并包含真实原文', () => {
    const sources = summarySources(result());
    assert.match(validateSummary(goodSummary, sources).text, /\[S1\]/);
    assert.throws(() => validateSummary(JSON.stringify({ claims: [{ text: '伪造', evidence: [{ sourceId: 'S1', quote: '原文不存在' }] }] }), sources), /无法/);
    assert.throws(() => validateSummary(JSON.stringify({ claims: [{ text: '伪造', evidence: [{ sourceId: 'S9', quote: '谨慎' }] }] }), sources), /无法/);
});
test('宿主原始生成整理、内部生成不清注入，主生成结束清理', async () => {
    const events = {}, prompts = [];
    const ctx = { chatMetadata: {}, eventSource: { on: (k, f) => events[k] = f }, setExtensionPrompt: (...args) => prompts.push(args) };
    globalThis.SillyTavern = { getContext: () => ctx };
    try {
        const host = createHost(async () => ({}));
        const stamp = host.stamp();
        ctx.generateRaw = async () => { assert.equal(host.isAuxiliary(), true); events.GENERATION_ENDED(); return goodSummary; };
        const summary = await generateSummary({ result: result(), settings: { summaryBackend: 'host' }, context: ctx, auxiliary: host.withAuxiliary });
        assert.match(summary.text, /谨慎/); assert.equal(host.current(stamp), true);
        events.GENERATION_ENDED(); assert.equal(host.current(stamp), false);
        ctx.generateRaw = () => new Promise(() => {});
        await assert.rejects(generateSummary({ result: result(), settings: { summaryBackend: 'host', summaryTimeoutMs: 10 }, context: ctx, auxiliary: host.withAuxiliary }), /超时/);
        assert.equal(host.isAuxiliary(), false);
    } finally { delete globalThis.SillyTavern; }
});
test('独立模型只向服务端配置地址请求，桥接鉴权且错误不泄漏密钥', async () => {
    let seen = false;
    const value = await runAiSummary({ sources: [{ id: 'S1', title: '林澈', text: '谨慎，守信。' }] }, { env: { LORE_AI_BASE_URL: 'https://model.example/v1', LORE_AI_MODEL: 'fixture', LORE_AI_KEY: 'test-secret' }, fetchFn: async (url, args) => {
        seen = true; assert.equal(url.href, 'https://model.example/v1/chat/completions'); assert.equal(args.headers.Authorization, 'Bearer test-secret');
        assert.equal(JSON.parse(args.body).messages[0].role, 'system');
        return { ok: true, json: async () => ({ choices: [{ message: { content: goodSummary } }] }) };
    } });
    assert.equal(seen, true); assert.equal(value.content, goodSummary);
    const server = createBridge({ token: 't'.repeat(32), run: async () => ({}), summarize: async () => { throw new Error('test-secret'); } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const url = 'http://127.0.0.1:' + server.address().port + '/summarize';
        assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
        const response = await fetch(url, { method: 'POST', headers: { 'X-Lore-Token': 't'.repeat(32) }, body: JSON.stringify({ sources: [{ id: 'S1', title: '林澈', text: '谨慎' }] }) });
        assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('test-secret'));
    } finally { await new Promise(r => server.close(r)); }
});
