// Read-only live test, no account or credential access.
import fs from 'node:fs/promises';
import { runPublicWiki } from './public-wiki.mjs';
const out = new URL('../test/live/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const calls = [
    { operation: 'siteinfo' },
    { operation: 'search', query: '博丽灵梦', limit: 1 },
    { operation: 'search-categories', query: '角色', limit: 2 },
    { operation: 'get-page', query: '博丽灵梦', limit: 1 },
    { operation: 'get-categories', query: '博丽灵梦', limit: 5 },
    { operation: 'get-category-members', query: '官方角色', memberType: 'subcat', limit: 2 }
];
const report = [];
for (const args of calls) {
    try {
        const data = await runPublicWiki({ ...args, source: { apiUrl: 'https://thwiki.cc/api.php' } });
        await fs.writeFile(new URL('thwiki-' + args.operation + '.json', out), JSON.stringify(data));
        report.push({ operation: args.operation, ok: true, count: data.items?.length ?? data.members?.length ?? data.categories?.length ?? null, title: data.title || data.general?.sitename });
    } catch (e) { report.push({ operation: args.operation, ok: false, error: e.message }); }
}
await fs.writeFile(new URL('api-report.json', out), JSON.stringify({ at: new Date().toISOString(), source: 'https://thwiki.cc/api.php', report }, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.some(r => !r.ok)) process.exitCode = 1;
