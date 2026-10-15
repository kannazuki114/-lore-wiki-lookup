import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { apiParameters } from '../src/mediawiki.js';
import { runPublicWiki } from './public-wiki.mjs';
import { runAiSummary, validateSummaryRequest } from './ai-summary.mjs';

export function validateRequest(body) {
    if (!body || typeof body !== 'object') throw new Error('请求无效');
    apiParameters(body.operation, body);
    let source;
    if (body.source) {
        const url = new URL(body.source.apiUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('公共桥接需要 HTTPS 地址');
        url.search = ''; url.hash = '';
        source = { apiUrl: url.href };
    }
    return { operation: body.operation, query: String(body.query || '').trim().normalize('NFC'), limit: Number(body.limit ?? 5), continueToken: body.continueToken, memberType: body.memberType, ...(source ? { source } : {}) };
}

export function createBridge({ token, allowedOrigins = ['http://localhost:8000', 'http://127.0.0.1:8000'], run, publicRun = runPublicWiki, summarize = runAiSummary }) {
    if (typeof token !== 'string' || token.length < 24) throw new Error('配对令牌至少 24 字符');
    let busy = false;
    return http.createServer(async (req, res) => {
        const origin = req.headers.origin;
        const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
        if (origin && !allowedOrigins.includes(origin)) { send(403, { error: '酒馆来源未获桥接配置允许' }); return; }
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Lore-Token');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        const supplied = Buffer.from(String(req.headers['x-lore-token'] || ''));
        const expected = Buffer.from(token);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { send(401, { error: '配对令牌不正确' }); return; }
        if (!['/query', '/summarize'].includes(req.url) || req.method !== 'POST') { send(404, { error: '未找到查询接口' }); return; }
        if (busy) { send(429, { error: '已有查询正在执行，请稍后重试' }); return; }
        let body;
        try {
            let text = '';
            const chunks = []; let size = 0;
            for await (const chunk of req) { size += chunk.length; if (size > 160000) throw new Error('请求体过大'); chunks.push(chunk); }
            text = Buffer.concat(chunks).toString('utf8');
            body = req.url === '/summarize' ? validateSummaryRequest(JSON.parse(text)) : validateRequest(JSON.parse(text));
        } catch { send(400, { error: '查询参数无效' }); return; }
        if (busy) { send(429, { error: '已有查询正在执行' }); return; }
        busy = true;
        try { send(200, await (req.url === '/summarize' ? summarize(body) : body.source ? publicRun(body) : run(body))); }
        catch {
            // Upstream errors may contain auth details: never forward raw exceptions.
            send(502, { error: req.url === '/summarize' ? '副模型整理失败：检查服务端 LORE_AI_BASE_URL、LORE_AI_MODEL、LORE_AI_KEY 或输出格式' : body.source ? '自定义 Wiki 读取失败：检查公共 HTTPS API 地址、网络与站点权限' : '萌百查询失败：请检查服务端凭据、网络及上游构建；未返回认证细节' });
        } finally { busy = false; }
    });
}

export function upstreamRunner(modulePath) {
    let runner;
    return async request => {
        if (!runner) {
            const module = await import(pathToFileURL(path.resolve(modulePath)).href);
            runner = await module.createQueryRunner();
        }
        return runner(request);
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const token = process.env.LORE_BRIDGE_TOKEN || randomBytes(24).toString('hex');
    const origins = (process.env.LORE_ALLOWED_ORIGINS || 'http://localhost:8000,http://127.0.0.1:8000').split(',').map(s => s.trim());
    const run = process.env.LORE_UPSTREAM_MODULE ? upstreamRunner(process.env.LORE_UPSTREAM_MODULE) : async () => { throw new Error('萌百适配器未配置'); };
    const server = createBridge({ token, allowedOrigins: origins, run });
    server.listen(39765, '127.0.0.1', () => {
        console.log('Wiki 桥接已监听 http://127.0.0.1:39765（仅本机）');
        console.log('配对令牌（填入酒馆插件，非萌百密码）：' + token);
    });
}
