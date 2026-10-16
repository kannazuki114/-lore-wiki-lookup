import test from 'node:test';
import assert from 'node:assert/strict';
import { readMediaWiki, publicParameters, encodeCursor, decodeCursor, normalizeResponse } from '../src/mediawiki.js';
import { createProvider } from '../src/provider.js';
import { createEngine, rankNames, formatResult } from '../src/engine.js';
import { titleFromUrl, validateSource } from '../src/sources.js';

test('默认萌百无需令牌直接 GET，且不发送账号、桥接或模型请求', async () => {
    const urls = [];
    const provider = createProvider({ fetchFn: async (url, options) => {
        urls.push(new URL(url));
        assert.equal(options.credentials, 'omit');
        assert.equal(options.headers, undefined);
        assert.equal(options.body, undefined);
        return { ok: true, json: async () => ({ batchcomplete: true, query: { pages: [{ title: '博丽灵梦', index: 1 }] } }) };
    } });
    assert.equal((await provider.request('search', { query: '灵梦' })).items[0].title, '博丽灵梦');
    assert.equal(urls.length, 1);
    assert.equal(urls[0].origin, 'https://zh.moegirl.org.cn');
    assert.equal(urls[0].searchParams.get('generator'), 'search');
});

test('受限自定义 API 自动转公开接口，生成器分页不退回错误接口', async () => {
    const calls = [];
    const read = async params => {
        calls.push(params);
        return params.list ? { error: { code: 'action-notallowed', info: 'Unauthorized' } }
            : { query: { pages: [{ title: '第二', index: 2 }, { title: '第一', index: 1 }] }, continue: { gsroffset: 2, continue: 'gsroffset||' } };
    };
    const result = await readMediaWiki('search', { query: '角色', limit: 2 }, read);
    assert.deepEqual(result.items.map(r => r.title), ['第一', '第二']);
    await readMediaWiki('search', { query: '角色', limit: 2, continueToken: result.pagination.continueToken }, read);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].gsroffset, 2);
    assert.equal(calls[2].list, undefined);
    assert.throws(() => decodeCursor(encodeCursor({ gsroffset: 1, action: 'edit' }), 'search'), /越界/);
    assert.throws(() => decodeCursor(encodeCursor({ gsroffset: 1, sroffset: 1 }), 'search'), /冲突/);
});

test('正文摘要保留重定向标题、修订号与缺失提示，不把不存在页面当成功', () => {
    const page = normalizeResponse('get-page', { query: { pages: [{ title: '规范标题', lastrevid: 123, extract: '<p>种族：人类</p>' }] } });
    assert.equal(page.title, '规范标题');
    assert.equal(page.revid, 123);
    assert.match(page._warning, /省略信息栏/);
    assert.throws(() => normalizeResponse('get-page', { query: { pages: [{ title: '没有', missing: true }] } }), /不存在/);
    assert.deepEqual(normalizeResponse('search', { batchcomplete: true }).items, []);
});

test('字段检索精确分类优先，按成员取页且保留属性过滤；没有分类才退回名称', async () => {
    const calls = [];
    const provider = { request: async (operation, args) => {
        calls.push([operation, args]);
        if (operation === 'search-categories') return { items: args.query === '东方Project' ? [{ title: 'Category:东方Project系列作品' }, { title: 'Category:东方Project' }] : [] };
        if (operation === 'get-category-members' || operation === 'search') return { members: [{ title: '博丽灵梦' }], items: [{ title: '博丽灵梦' }] };
        return operation === 'get-page' ? { title: '博丽灵梦' } : { categories: [] };
    } };
    const parsePage = () => ({ title: '博丽灵梦', fields: { race: [{ value: '人类' }] }, source: {} });
    const engine = createEngine({ provider, parsePage });
    const result = await engine.run({ query: '字段 东方Project 种族=人类', fields: '种族' });
    assert.equal(result.matchedCategory, 'Category:东方Project');
    assert.equal(calls[1][0], 'get-category-members');
    assert.equal(result.results.length, 1);
    const fallback = await engine.run({ mode: 'series', query: '灵梦', fields: '种族' });
    assert.equal(fallback.matchMode, 'name');
    assert.ok(calls.some(([op, args]) => op === 'search' && args.query === '灵梦'));
    const p = publicParameters('get-category-members', { query: 'Category:东方Project', memberType: 'subcat', limit: 3 });
    assert.equal(p.gsrnamespace, 14);
    assert.equal(p.gsrsearch, 'incategory:"东方Project"');
});

test('名称分层排序精确、前缀、包含；层内保留 Wiki 顺序', () => {
    const rows = ['其他人物', '大灵梦', '灵梦(作品)', '灵梦', '灵梦二号'].map(title => ({ title }));
    assert.deepEqual(rankNames(rows, '灵梦').map(r => r.title), ['灵梦', '灵梦(作品)', '灵梦二号', '大灵梦', '其他人物']);
});

test('页面网址按当前来源解析标题，外站网址与非条目地址拒绝', () => {
    assert.equal(titleFromUrl('https://zh.moegirl.org.cn/%E6%98%8E%E7%BD%97#简介'), '明罗');
    assert.equal(titleFromUrl('https://mzh.moegirl.org.cn/index.php?title=天野远子'), '天野远子');
    const source = validateSource({ url: 'https://test.example/', apiUrl: 'https://test.example/api.php', articlePath: 'https://test.example/w/index.php?title=$1' });
    assert.equal(titleFromUrl('https://test.example/w/index.php?title=Star_Port', source), 'Star Port');
    assert.throws(() => titleFromUrl('https://other.example/明罗'), /来源/);
    assert.throws(() => titleFromUrl('https://zh.moegirl.org.cn/'), /条目/);
});

test('消歧采用真实页面链接，保留原查询的译名变体且不截掉第31项', async () => {
    const links = Array.from({ length: 35 }, (_, i) => ({ title: '莎拉·角色' + i }));
    links.push({ title: '萨拉(东方Project)' });
    const calls = [];
    const provider = { request: async (operation, args) => {
        calls.push([operation, args]);
        if (operation === 'get-page') return { title: '莎拉', disambiguation: true, links: [] };
        if (operation === 'get-links') return { links };
        throw new Error('不应使用泛搜索');
    } };
    const result = await createEngine({ provider }).run({ mode: 'page', query: '萨拉' });
    assert.equal(result.results.length, 0);
    assert.equal(result.choices.length, 36);
    assert.equal(result.choices[0].title, '萨拉(东方Project)');
    assert.equal(calls[1][1].query, '莎拉');
});

test('找不到完整名称时提供前缀搜索候选，不擅自选定人物', async () => {
    const provider = { request: async (operation, args) => {
        if (operation === 'get-page') throw new Error('页面不存在');
        if (operation === 'search') return { items: args.query === '梅露露' ? [{ title: '梅露露琳丝·蕾蒂·亚尔兹' }] : [] };
    } };
    const result = await createEngine({ provider }).run({ mode: 'page', query: '梅露露林斯·蕾蒂·阿尔兹' });
    assert.equal(result.results.length, 0);
    assert.equal(result.choices[0].title, '梅露露琳丝·蕾蒂·亚尔兹');
    assert.match(result.choices[0].reason, /手动选择/);
});

test('长资料注入按完整段落取舍，保留来源并说明省略', () => {
    const result = { notice: '原文资料', warnings: [], results: [{ title: '明罗', source: { site: '萌娘百科', url: 'https://zh.moegirl.org.cn/明罗' }, fields: { content: [{ value: '完整短段。', section: '原文' }, { value: '很长的段落。'.repeat(300), section: '原文' }, { value: '另一个完整短段。', section: '原文' }] } }] };
    const text = formatResult(result, 600);
    assert.ok(text.length <= 600); assert.match(text, /https:\/\/zh.moegirl/);
    assert.match(text, /完整短段。/); assert.match(text, /另一个完整短段。/);
    assert.match(text, /按完整段落省略/); assert.ok(!text.includes('很长的段落'));
});
