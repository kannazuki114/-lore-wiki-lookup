// Fresh browser profile, real public Moegirl API, no bridge and no model.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer(async (req, res) => {
    try {
        const file = path.resolve(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'preview.html');
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[path.extname(file)] || 'text/plain');
        res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const requests = [], checks = [], errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (!r.url().startsWith(base)) requests.push(r.url()); });
try {
    await page.goto(base);
    await page.evaluate(() => window.LoreWikiLookup.ready);
    const settings = await page.evaluate(() => window.LoreWikiLookup.getSettings());
    assert.equal(settings.sources[0].transport, 'direct');
    // Network is deliberately unmocked. Public queries must work with an empty token.
    const exact = await page.evaluate(() => window.LoreWikiLookup.query({ query: '博丽灵梦 种族=人类', fields: '名称,别名,种族,身份,地点,性格,经历', limit: 1 }));
    assert.equal(exact.onlineState, 'ok', JSON.stringify(exact.warnings));
    assert.equal(exact.results[0]?.title, '博丽灵梦', JSON.stringify(exact));
    assert.equal(exact.results[0].fields.race[0].value, '人类');
    assert.ok(exact.results[0].fields.occupation.some(v => v.value === '巫女'));
    assert.ok(exact.results[0].fields.location.some(v => v.value === '博丽神社'));
    checks.push({ name: '精确名称、明确种族筛选和标注段落提取', title: exact.results[0].title, fields: Object.keys(exact.results[0].fields).filter(k => exact.results[0].fields[k].length) });
    const redirect = await page.evaluate(() => window.LoreWikiLookup.query({ mode: 'page', query: '灵梦', fields: '种族', limit: 1 }));
    assert.equal(redirect.results[0]?.title, '博丽灵梦', JSON.stringify(redirect.warnings));
    checks.push({ name: '重定向名称读取', title: redirect.results[0].title });
    const partial = await page.evaluate(() => window.LoreWikiLookup.query({ query: '灵梦', fields: '简介', limit: 3 }));
    assert.ok(partial.results.some(r => r.title === '博丽灵梦'), JSON.stringify(partial.warnings));
    checks.push({ name: '部分名称联网检索', titles: partial.results.map(r => r.title) });
    const series = await page.evaluate(() => window.LoreWikiLookup.query({ query: '字段 东方Project', fields: '简介,分类', limit: 3 }));
    assert.equal(series.matchMode, 'category', JSON.stringify(series));
    assert.equal(series.matchedCategory, 'Category:东方Project');
    assert.ok(series.results.length, JSON.stringify(series.warnings));
    assert.ok(series.results.every(r => r.fields.categories.some(v => v.value === '东方Project')));
    checks.push({ name: '字段检索匹配分类后读取直接成员', category: series.matchedCategory, titles: series.results.map(r => r.title) });
    if (series.cursor) {
        const next = await page.evaluate(cursor => window.LoreWikiLookup.query({ query: '字段 东方Project', fields: '简介,分类', limit: 3, cursor }), series.cursor);
        assert.ok(next.results.length, JSON.stringify(next.warnings));
        assert.ok(!next.results.some(r => series.results.some(old => old.title === r.title)));
        checks.push({ name: '真实分类索引续页', titles: next.results.map(r => r.title) });
    }
    const subcategories = await page.evaluate(() => window.LoreWikiLookup.query({ mode: 'subcategories', query: '东方相关条目', limit: 3 }));
    assert.ok(subcategories.navigation?.length, JSON.stringify(subcategories));
    checks.push({ name: '子分类联网读取', titles: subcategories.navigation.map(r => r.title) });
    assert.ok(requests.length);
    assert.ok(requests.every(url => new URL(url).hostname === 'zh.moegirl.org.cn'), JSON.stringify(requests));
    assert.deepEqual(errors, []);
    await page.locator('[data-control=mode]').selectOption('page');
    await page.locator('[data-control=query]').fill('博丽灵梦');
    await page.locator('[data-action=search]').click();
    await page.locator('.lore-result h3').filter({ hasText: '博丽灵梦' }).waitFor({ timeout: 60000 });
    checks.push({ name: '真实面板按钮查询展示', title: '博丽灵梦' });
    await fs.mkdir(path.join(root, 'test/output'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test/output/live-moegirl.png'), fullPage: true });
    const report = { at: new Date().toISOString(), checks, requestCount: requests.length, hosts: [...new Set(requests.map(url => new URL(url).hostname))], noBridgeOrModel: true, errors };
    await fs.writeFile(path.join(root, 'test/output/live-moegirl-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
