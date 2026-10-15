// Real, previously fetched pages; extraction is offline and never executes Wiki scripts.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer(async (req, res) => {
    try {
        const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!file.startsWith(root + path.sep)) throw new Error('invalid');
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/plain'); res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
try {
    await page.goto(base + '/package.json');
    const report = await page.evaluate(async () => {
        const { extractPage } = await import('/src/extract.js');
        const { normalizeResponse } = await import('/src/mediawiki.js');
        const { sourceFromInfo } = await import('/src/sources.js');
        const moeHtml = await (await fetch('/test/live/moegirl-character.txt')).text();
        const thRaw = JSON.parse(await (await fetch('/test/live/thwiki-character.txt')).text());
        const thInfo = JSON.parse(await (await fetch('/test/live/thwiki-site.txt')).text());
        const thSource = sourceFromInfo('https://thwiki.cc/api.php', thInfo.query.general);
        const records = [extractPage({ title: '博丽灵梦', format: 'html', content: moeHtml }), extractPage({ ...normalizeResponse('get-page', thRaw), source: thSource })];
        return records.map(r => ({ title: r.title, source: r.source, counts: Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, v.length])), sections: r.sections.length, flags: { ability: !!r.fields.abilities?.length, relationships: !!r.fields.relationships?.length, personality: !!r.fields.personality?.length, summary: !!r.fields.summary?.length, race: !!r.fields.race?.length } }));
    });
    assert.ok(report[0].flags.personality); assert.ok(report[0].flags.relationships); assert.ok(report[0].counts.history > 0); assert.ok(report[0].counts.aliases > 1);
    assert.ok(report[1].flags.ability); assert.ok(report[1].flags.relationships); assert.ok(report[1].flags.summary); assert.match(report[1].source.url, /^https:\/\/thwiki.cc\//);
    await fs.writeFile(path.join(root, 'test/live/page-report.json'), JSON.stringify({ at: new Date().toISOString(), report }, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
