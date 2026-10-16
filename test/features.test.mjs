import test from 'node:test';
import assert from 'node:assert/strict';
import { apiCandidates, sourceFromInfo, validateSource, pageUrl, MOEGIRL } from '../src/sources.js';
import { apiParameters, normalizeResponse, encodeCursor, decodeCursor } from '../src/mediawiki.js';
import { resolveAlias } from '../src/resolver.js';
import { createEngine, validateOffline } from '../src/engine.js';
import { createProvider } from '../src/provider.js';
import { createStorage } from '../src/storage.js';
import { createHost } from '../src/host.js';
import { publicIPv4, runPublicWiki } from '../tools/public-wiki.mjs';
import { createBridge } from '../tools/bridge.mjs';

test('Wiki URL 探测、协议校验和独立来源链接', () => {
    assert.deepEqual(apiCandidates('https://example.org/w/api.php?action=help'), ['https://example.org/w/api.php']);
    assert.ok(apiCandidates('https://example.org/wiki/角色').includes('https://example.org/w/api.php'));
    assert.equal(apiCandidates('https://example.org/project')[0], 'https://example.org/project/api.php');
    assert.deepEqual(apiCandidates('https://example.org', 'https://example.org/custom/api.php'), ['https://example.org/custom/api.php']);
    assert.throws(() => apiCandidates('javascript:alert(1)'));
    const source = sourceFromInfo('https://example.org/w/api.php', { server: '//example.org', base: 'https://example.org/wiki/Main', articlepath: '/wiki/$1', sitename: 'TestWiki' });
    assert.equal(source.name, 'TestWiki');
    assert.equal(pageUrl(source, '人物:小林'), 'https://example.org/wiki/' + encodeURIComponent('人物:小林'));
    assert.equal(validateSource({ id: 'moegirl', apiUrl: 'https://evil.example/' }).apiUrl, MOEGIRL.apiUrl);
});
test('分类搜索只查分类命名空间，子分类不混入页面，游标不能改操作', () => {
    assert.equal(apiParameters('search-categories', { query: '东方' }).srnamespace, 14);
    assert.equal(apiParameters('get-category-members', { query: '分类:东方', memberType: 'subcat' }).cmtype, 'subcat');
    assert.equal(apiParameters('get-category-members', { query: '东方' }).cmtitle, 'Category:东方');
    assert.throws(() => decodeCursor(encodeCursor({ action: 'edit' }), 'search'));
    const token = encodeCursor({ cmcontinue: 'subcat|东方', continue: '-||' });
    assert.equal(decodeCursor(token, 'get-category-members').cmcontinue, 'subcat|东方');
});
test('API 规范化保留重定向标题与消歧候选', () => {
    const page = normalizeResponse('get-page', { parse: { title: '完整名称', text: '<p>x</p>', properties: [{ name: 'disambiguation' }], links: [{ ns: 0, title: '作品A:名字' }, { ns: 14, title: 'Category:X' }] } });
    assert.equal(page.title, '完整名称'); assert.equal(page.disambiguation, true); assert.equal(page.links.length, 1);
    assert.equal(normalizeResponse('get-page', { parse: { text: 'x', properties: { disambiguation: '' } } }).disambiguation, true);
    assert.throws(() => normalizeResponse('siteinfo', { query: {} }), /MediaWiki/);
    assert.throws(() => normalizeResponse('get-categories', { query: { pages: [{ title: 'missing', missing: true }] } }), /不存在/);
});
test('别名按来源与作品消歧，未绑定时保留多个候选', async () => {
    const aliases = [{ alias: '小林', title: '林A', work: '作品A', sourceId: 'moegirl' }, { alias: '小林', title: '林B', work: '作品B', sourceId: 'moegirl' }, { alias: '小林', title: '别站林', sourceId: 'other' }];
    assert.equal(resolveAlias('小林', aliases, 'moegirl', '作品A')[0].title, '林A');
    let called = false;
    const engine = createEngine({ aliases, provider: { request: async () => { called = true; } } });
    const result = await engine.run({ mode: 'page', query: '小林' });
    assert.equal(result.choices.length, 2); assert.equal(called, false); assert.equal(result.results.length, 0);
});
test('作品绑定检索范围、未知归属需确认、明确选择后可读取', async () => {
    const calls = [];
    const provider = { source: MOEGIRL, request: async (op, args) => {
        calls.push([op, args]);
        if (op === 'search') return { items: [{ title: '角色' }] };
        if (op === 'get-page') return { title: '角色' };
        return { categories: [] };
    } };
    const parsePage = () => ({ title: '角色', fields: { personality: [{ value: '谨慎' }] }, source: { site: '萌娘百科' } });
    const engine = createEngine({ provider, parsePage });
    const result = await engine.run({ query: '角色', work: '作品A' });
    assert.equal(calls[0][1].query, '角色'); // Work is verified from source fields, not forced into the name query.
    assert.equal(result.results.length, 0); assert.equal(result.choices.length, 1);
    assert.equal((await engine.run({ mode: 'page', query: '角色', work: '作品A', resolveExact: true })).results.length, 1);
});
test('消歧页面不注入正文，而是返回可选条目', async () => {
    const provider = { request: async () => ({ disambiguation: true, links: [{ title: '角色(作品A)' }, { title: '角色(作品B)' }] }) };
    const result = await createEngine({ provider }).run({ mode: 'page', query: '角色' });
    assert.equal(result.results.length, 0); assert.equal(result.choices.length, 2);
});
test('本地同名人物按 entryId 选择，不混入另一个人物', async () => {
    const offline = validateOffline({ schemaVersion: 1, entries: [{ id: 'a', title: '同名', fields: { 作品: 'A' } }, { id: 'b', title: '同名', fields: { 作品: 'B' } }] });
    const engine = createEngine({ offline, provider: { request: async () => { throw new Error('offline'); } } });
    const result = await engine.run({ mode: 'page', query: '同名' });
    assert.equal(result.results.length, 0); assert.equal(result.choices.length, 2);
    const selected = await engine.run({ mode: 'page', query: '同名', entryId: 'local:b', resolveExact: true });
    assert.equal(selected.results.length, 1); assert.equal(selected.results[0].fields.work[0].value, 'B');
});
test('分类浏览返回导航及续页；更换来源后拒绝旧游标', async () => {
    const make = id => createEngine({ provider: { source: { id }, request: async op => ({ [op === 'search-categories' ? 'items' : 'members']: [{ title: 'Category:东方角色' }], pagination: { continueToken: 'next' } }) } });
    const args = { mode: 'categories', query: '东方' };
    const result = await make('a').run(args);
    assert.equal(result.navigation[0].title, 'Category:东方角色');
    await assert.rejects(make('b').run({ ...args, cursor: result.cursor }), /查询已改变/);
    assert.equal((await make('a').run({ mode: 'subcategories', query: '东方' })).navigation.length, 1);
});
test('缓存按 Wiki 隔离，自定义浏览器请求没有账号或桥接令牌', async () => {
    const storage = createStorage(null); let count = 0;
    for (const domain of ['one.example', 'two.example']) {
        const source = validateSource({ apiUrl: 'https://' + domain + '/api.php' });
        const p = createProvider({ source, storage, token: 'never-send', fetchFn: async (url, options) => { count++; assert.equal(options.credentials, 'omit'); assert.equal(options.headers, undefined); return { ok: true, json: async () => ({ query: { search: [{ title: domain }] } }) }; } });
        assert.equal((await p.request('search', { query: 'x' })).items[0].title, domain);
    }
    assert.equal(count, 2);
});
test('聊天作品和来源绑定随聊天隔离、保存，切换通知刷新', async () => {
    let metadata = {}; const first = metadata; let saved = 0, refreshed = 0; const handlers = {};
    globalThis.SillyTavern = { getContext: () => ({ chatMetadata: metadata, saveMetadata: async () => saved++, eventSource: { on: (k, f) => handlers[k] = f } }) };
    try {
        const host = createHost(async () => ({})); host.onChatChanged(() => refreshed++);
        await host.saveBinding({ work: '作品A', sourceId: 'moegirl' });
        metadata = {}; handlers.CHAT_CHANGED(); assert.equal(host.getBinding().work, undefined);
        metadata = first; handlers.CHAT_CHANGED(); assert.equal(host.getBinding().work, '作品A');
        assert.equal(saved, 1); assert.equal(refreshed, 2);
    } finally { delete globalThis.SillyTavern; }
});
test('公共桥接仅执行匿名只读操作，不将自定义请求交给认证客户端', async () => {
    assert.equal(publicIPv4('127.0.0.1'), false); assert.equal(publicIPv4('192.168.1.1'), false); assert.equal(publicIPv4('8.8.8.8'), true);
    const result = await runPublicWiki({ operation: 'search', query: 'x', source: { apiUrl: 'https://wiki.example/api.php' } }, async url => { assert.equal(url.searchParams.get('action'), 'query'); return { query: { search: [] } }; });
    assert.deepEqual(result.items, []);
    let authenticatedCalls = 0, publicCalls = 0;
    const server = createBridge({ token: 't'.repeat(32), run: async () => { authenticatedCalls++; }, publicRun: async () => { publicCalls++; return { general: {} }; } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
        const res = await fetch('http://127.0.0.1:' + server.address().port + '/query', { method: 'POST', headers: { 'X-Lore-Token': 't'.repeat(32) }, body: JSON.stringify({ operation: 'siteinfo', source: { apiUrl: 'https://wiki.example/api.php' } }) });
        assert.equal(res.status, 200); assert.equal(authenticatedCalls, 0); assert.equal(publicCalls, 1);
    } finally { await new Promise(r => server.close(r)); }
});
