// Real network samples: fixed niche characters plus freshly randomized pages.
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
        if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'text/plain');
        res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const requests = [], errors = [], samples = [];
page.on('request', r => { if (!r.url().startsWith(base)) requests.push(r.url()); });
page.on('pageerror', e => errors.push(e.message));
const out = path.join(root, 'test/output');
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, 'test/live/samples'), { recursive: true });
try {
    await page.goto(base);
    await page.evaluate(() => window.LoreWikiLookup.ready);
    const cold = ['矜羯罗', '明罗', '萨拉', '梦月', '幻月', '神玉', '蕾蒂·霍瓦特洛克', '梅露露林斯·蕾蒂·阿尔兹', '库尔特·范德尔', '妹尾佳织', '加藤叶月', '天野远子'];
    const replay = process.argv.includes('--replay') ? JSON.parse(await fs.readFile(path.join(out, 'wiki-sample-baseline.json'), 'utf8')).samples : null;
    const random = new Map();
    for (let batch = 0; !replay && batch < 4 && random.size < 12; batch++) {
        const rows = await page.evaluate(async () => {
            const params = new URLSearchParams({ action: 'query', generator: 'random', grnnamespace: '0', grnlimit: '12', prop: 'info', format: 'json', formatversion: '2', origin: '*', requestid: crypto.randomUUID() });
            const response = await fetch('https://zh.moegirl.org.cn/api.php?' + params, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
            const data = await response.json();
            if (data.error) throw new Error(data.error.info);
            return Object.values(data.query?.pages || {}).map(p => ({ title: p.title, pageId: p.pageid }));
        });
        for (const row of rows) if (!cold.includes(row.title)) random.set(row.title, row);
    }
    assert.ok(replay || random.size >= 12, '没有取得足够随机页面');
    const entries = replay ? replay.map(({ title, group, pageId }) => ({ title, group, pageId })) : [...cold.map(title => ({ title, group: 'niche-character' })), ...[...random.values()].slice(0, 12).map(row => ({ ...row, group: 'random-page' }))];
    for (const [index, entry] of entries.entries()) {
        const start = Date.now();
        try {
            const value = await page.evaluate(async title => {
                const result = await window.LoreWikiLookup.query({ query: title, mode: 'page', fields: window.LoreWikiLookup.fields.map(f => f.id), limit: 1 });
                return result;
            }, entry.title);
            await fs.writeFile(path.join(root, 'test/live/samples', index + '.json'), JSON.stringify(value));
            const record = value.results[0];
            const fields = record ? Object.fromEntries(Object.entries(record.fields).map(([id, values]) => [id, values.length])) : {};
            let searchTitle = null;
            if (entry.group === 'niche-character' && index % 2 === 0) {
                const search = await page.evaluate(title => window.LoreWikiLookup.query({ query: title, fields: '简介', limit: 1 }), entry.title);
                searchTitle = search.results[0]?.title || null;
            }
            const item = { ...entry, canonicalTitle: record?.title, read: !!record, state: value.onlineState, fields, missing: record?.missing, choices: value.choices?.map(c => c.title), warnings: value.warnings, searchTitle, elapsedMs: Date.now() - start };
            if (!record && item.choices?.length) {
                // Explicit test selection, never automatic resolution in the product.
                const expected = entry.title === '萨拉' ? '萨拉(东方Project)' : entry.title === '梅露露林斯·蕾蒂·阿尔兹' ? '梅露露琳丝·蕾蒂·亚尔兹' : null;
                if (expected) {
                    assert.ok(item.choices.includes(expected), '真实候选中遗漏：' + expected);
                    const chosen = await page.evaluate(title => window.LoreWikiLookup.query({ query: title, mode: 'page', resolveExact: true, fields: '简介,页面原文', limit: 1 }), expected);
                    assert.equal(chosen.results[0]?.title, expected, JSON.stringify(chosen.warnings));
                    assert.ok(chosen.results[0].fields.content.length);
                    item.selectedChoiceRead = expected;
                }
            }
            samples.push(item);
            console.log(JSON.stringify({ index: index + 1, title: entry.title, read: item.read, fields: Object.keys(fields).filter(id => fields[id]), state: item.state }));
        } catch (error) { samples.push({ ...entry, read: false, error: error.message, elapsedMs: Date.now() - start }); console.log(JSON.stringify({ title: entry.title, error: error.message })); }
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(requests.every(url => new URL(url).hostname === 'zh.moegirl.org.cn'));
    assert.deepEqual(errors, []);
    const report = { at: new Date().toISOString(), method: replay ? 'Replay all 24 baseline samples, including the original failed and ambiguous inputs; fresh browser profile' : '12 fixed niche characters + 12 server-random namespace-0 pages; fresh browser profile; all samples retained', source: 'https://zh.moegirl.org.cn/api.php', requested: entries.length, read: samples.filter(s => s.read).length, needsChoice: samples.filter(s => !s.read && s.choices?.length).length, choiceRead: samples.filter(s => s.selectedChoiceRead).length, failed: samples.filter(s => !s.read && !s.choices?.length || s.error).length, requestCount: requests.length, noBridgeOrModel: true, errors, samples };
    await fs.writeFile(path.join(out, 'wiki-sample-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ requested: report.requested, read: report.read, needsChoice: report.needsChoice, failed: report.failed, requestCount: report.requestCount }));
    // Fail the run after recording every sample rather than hiding failed pages.
    if (samples.some(s => !s.read && !s.choices?.length)) process.exitCode = 1;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
