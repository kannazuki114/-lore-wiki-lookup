import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldId, parseQuery, matchFilters, selectFields } from '../src/fields.js';
import { createEngine, validateOffline, formatResult } from '../src/engine.js';
import { createProvider } from '../src/provider.js';
import { createStorage } from '../src/storage.js';
import { createHost } from '../src/host.js';

const fixture = { schemaVersion: 1, entries: [
    { title: '甲', fields: { 作品: '星港', 阵营: '调查队', 性格: '谨慎' } },
    { title: '乙', fields: { 作品: '星港', 阵营: '调查队', 别名: ['小乙'], 分类: ['调查员'] } },
    { title: '丙', fields: { 作品: '其他', 阵营: '调查队' } }
] };
const offline = validateOffline(fixture);
const down = { request: async () => { throw new Error('未认证'); } };

test('字段别名、全角字符与引号值', () => {
    assert.equal(fieldId('所属组织：'), 'affiliation');
    assert.deepEqual(parseQuery('字段 星港 作品＝"Star Port" 性格~谨慎'), { text: '星港', filters: [{ field: 'work', op: 'eq', value: 'Star Port' }, { field: 'personality', op: 'contains', value: '谨慎' }] });
    assert.throws(() => parseQuery('不存在=值'), /未知/);
    assert.throws(() => parseQuery('性格="谨慎'), /引号/);
    assert.throws(() => parseQuery('性格='), /不能为空/);
    assert.throws(() => selectFields('foo'), /未知/);
});
test('AND 条件、不将未知字段认作匹配', () => {
    const filters = parseQuery('作品=星港 性格~谨慎').filters;
    assert.equal(matchFilters(offline[0], filters).matches, true);
    assert.deepEqual(matchFilters(offline[1], filters).missing, ['personality']);
    assert.equal(matchFilters(offline[2], filters).matches, false);
});
test('精确匹配与包含匹配有区别', () => {
    assert.equal(matchFilters(offline[0], parseQuery('阵营=调查').filters).matches, false);
    assert.equal(matchFilters(offline[0], parseQuery('阵营~调查').filters).matches, true);
});
test('导入格式与重复 ID 校验，拒绝未知字段', () => {
    assert.throws(() => validateOffline({ entries: [] }), /schemaVersion/);
    assert.throws(() => validateOffline({ schemaVersion: 1, entries: [{ title: 'x', fields: { bad: 'value' } }] }), /未知字段/);
    assert.throws(() => validateOffline({ schemaVersion: 1, entries: [fixture.entries[0], fixture.entries[0]] }), /重复/);
});
test('在线失败仍返回离线数据和可见错误', async () => {
    const result = await createEngine({ provider: down, offline }).run({ query: '作品=星港 性格~谨慎', fields: '性格,能力' });
    assert.equal(result.results.length, 1);
    assert.equal(result.onlineState, 'unavailable');
    assert.deepEqual(result.results[0].missing, ['abilities']);
    assert.match(result.warnings[0], /未认证/);
});
test('离线分页、精确别名查页与分类直接成员', async () => {
    const engine = createEngine({ provider: down, offline });
    const args = { query: '作品=星港', fields: '作品', limit: 1 };
    const first = await engine.run(args);
    const second = await engine.run({ ...args, cursor: first.cursor });
    assert.equal(first.results[0].title, '甲');
    assert.equal(second.results[0].title, '乙');
    assert.equal(second.cursor, null);
    await assert.rejects(engine.run({ ...args, query: '作品=其他', cursor: first.cursor }), /查询已改变/);
    assert.equal((await engine.run({ mode: 'page', query: '小乙' })).results[0].title, '乙');
    assert.equal((await engine.run({ mode: 'category', query: '调查员' })).results[0].title, '乙');
});
test('候选页面正文必须核验，摘要命中不算字段匹配，游标透传', async () => {
    const calls = [];
    const provider = { request: async (op, args) => {
        calls.push([op, args]);
        if (op === 'search') return { items: [{ title: '乙' }], pagination: { continueToken: 'opaque-next' } };
        if (op === 'get-page') return { title: '乙', format: 'html', content: 'mentions 谨慎', revid: 42 };
        return { pageTitle: '乙', categories: [] };
    } };
    const engine = createEngine({ provider, parsePage: () => structuredClone(offline[1]) });
    const args = { query: '性格~谨慎', fields: '性格' };
    const result = await engine.run(args);
    assert.equal(result.results.length, 0);
    assert.equal(result.rejected[0].missing[0], 'personality');
    await engine.run({ ...args, cursor: result.cursor });
    assert.equal(calls[3][1].continueToken, 'opaque-next');
});
test('缓存命中、过期回退和清缓存不删除离线包', async () => {
    const storage = createStorage(null);
    await storage.set('offline', fixture);
    let calls = 0;
    const fetchFn = async () => { calls++; return { ok: true, json: async () => ({ batchcomplete: true, query: { pages: [] } }) }; };
    const provider = createProvider({ storage, token: 't', fetchFn });
    assert.equal((await provider.request('search', { query: 'x' }))._cache, 'network');
    assert.equal((await provider.request('search', { query: 'x' }))._cache, 'fresh');
    assert.equal(calls, 1);
    const stale = createProvider({ storage, token: 't', settings: { cacheMinutes: 0 }, fetchFn: async () => { throw new Error('断网'); } });
    assert.equal((await stale.request('search', { query: 'x' }))._cache, 'stale');
    await storage.set('wiki-cache', {});
    assert.deepEqual(await storage.get('offline'), fixture);
    assert.equal(storage.state.persistent, false);
});
test('API 错误和非 JSON 响应不会缓存成成功', async () => {
    for (const fetchFn of [async () => ({ ok: true, json: async () => ({ error: { info: 'Unauthorized' } }) }), async () => ({ ok: true, json: async () => { throw new Error('not JSON'); } })]) {
        const storage = createStorage(null);
        await assert.rejects(createProvider({ token: 't', storage, fetchFn }).request('search', { query: 'x' }));
        assert.equal(await storage.get('wiki-cache'), undefined);
    }
});
test('注入预算保留出处，不把未命中当事实', async () => {
    const result = await createEngine({ provider: down, offline }).run({ query: '甲', fields: '性格,能力' });
    const text = formatResult(result, 1200);
    assert.match(text, /来源：/);
    assert.match(text, /能力：未找到明确资料/);
    assert.ok(text.length <= 1200);
    assert.throws(() => formatResult(result, 10), /超出注入预算/);
});
test('宿主工具、命令注册与聊天隔离清除', async () => {
    const prompts = [], events = {}, tools = [], commands = [];
    let metadata = {};
    globalThis.SillyTavern = { getContext: () => ({ chatMetadata: metadata, setExtensionPrompt: (...args) => prompts.push(args), registerFunctionTool: t => tools.push(t), eventSource: { on: (key, fn) => events[key] = fn }, SlashCommandParser: { addCommandObject: c => commands.push(c) }, SlashCommand: { fromProps: x => x } }) };
    try {
        const engine = createEngine({ provider: down, offline });
        const host = createHost(args => engine.run(args));
        assert.equal(tools.length, 1); assert.equal(commands.length, 5);
        const mark = host.stamp();
        const result = await engine.run({ query: '甲' });
        host.inject(result, mark);
        assert.match(prompts.at(-1)[1], /甲/);
        events.GENERATION_ENDED(); assert.equal(prompts.at(-1)[1], '');
        metadata = {};
        assert.throws(() => host.inject(result, mark), /聊天已切换/);
    } finally { delete globalThis.SillyTavern; }
});
