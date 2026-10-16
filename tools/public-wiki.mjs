// Anonymous reads only. Pin a validated DNS answer; do not forward cookies or credentials.
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { readMediaWiki } from '../src/mediawiki.js';

export function publicIPv4(address) {
    const p = address.split('.').map(Number);
    if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || p[0] === 169 && p[1] === 254 || p[0] === 172 && p[1] >= 16 && p[1] <= 31 || p[0] === 192 && (p[1] === 168 || p[1] === 0 || p[1] === 2) || p[0] === 100 && p[1] >= 64 && p[1] <= 127 || p[0] === 198 && [18, 19, 51].includes(p[1]) || p[0] === 203 && p[1] === 0 && p[2] === 113);
}
export async function publicRead(url, resolve = lookup) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('公共桥接仅支持 HTTPS 443 API');
    const addresses = await resolve(url.hostname, { family: 4, all: true });
    if (!addresses.length || addresses.some(a => !publicIPv4(a.address))) throw new Error('该 API 不是公共 IPv4 地址');
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'LoreWikiLookup/0.2 (read-only MediaWiki client)', Accept: 'application/json' }, lookup: (_host, options, callback) => options?.all ? callback(null, [addresses[0]]) : callback(null, addresses[0].address, 4) }, response => {
            if (response.statusCode !== 200) { response.resume(); reject(new Error('公共 Wiki HTTP ' + response.statusCode + '，请使用最终 API 地址')); return; }
            const chunks = []; let size = 0;
            response.on('data', chunk => { size += chunk.length; if (size > 6 * 1024 * 1024) req.destroy(new Error('页面响应超过 6 MB')); else chunks.push(chunk); });
            response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('公共 Wiki 未返回 JSON')); } });
            response.on('error', reject);
        });
        const timer = setTimeout(() => req.destroy(new Error('公共 Wiki 请求超时')), 15000);
        req.on('close', () => clearTimeout(timer));
        req.on('error', reject);
    });
}
export async function runPublicWiki(request, read = publicRead) {
    return readMediaWiki(request.operation, request, params => {
        const url = new URL(request.source.apiUrl);
        url.search = new URLSearchParams(params).toString();
        return read(url);
    }, new URL(request.source.apiUrl).hostname.endsWith('.moegirl.org.cn'));
}
