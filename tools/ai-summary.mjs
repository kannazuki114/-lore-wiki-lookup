import { SUMMARY_INSTRUCTION } from '../src/summary.js';

export function validateSummaryRequest(body) {
    if (!body || !Array.isArray(body.sources) || !body.sources.length || body.sources.length > 12) throw new Error('无效来源');
    let size = 0; const seen = new Set();
    const sources = body.sources.map(s => {
        if (!s || typeof s.id !== 'string' || !/^S\d{1,2}$/.test(s.id) || seen.has(s.id) || typeof s.title !== 'string' || s.title.length > 500 || typeof s.text !== 'string' || !s.text.trim() || s.text.length > 7000) throw new Error('来源格式无效');
        seen.add(s.id); size += s.text.length;
        return { id: s.id, title: s.title, text: s.text };
    });
    if (size > 25000) throw new Error('来源过长');
    return { sources, topic: String(body.topic || '').slice(0, 500) };
}
export async function runAiSummary(body, { env = process.env, fetchFn = fetch } = {}) {
    const input = validateSummaryRequest(body);
    if (!env.LORE_AI_BASE_URL || !env.LORE_AI_MODEL) throw new Error('副模型未配置');
    const url = new URL(env.LORE_AI_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('模型地址无效');
    if (!url.pathname.endsWith('/chat/completions')) url.pathname = url.pathname.replace(/\/$/, '') + (url.pathname === '/' ? '/v1' : '') + '/chat/completions';
    url.search = ''; url.hash = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
        const response = await fetchFn(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(env.LORE_AI_KEY ? { Authorization: 'Bearer ' + env.LORE_AI_KEY } : {}) }, body: JSON.stringify({ model: env.LORE_AI_MODEL, messages: [{ role: 'system', content: SUMMARY_INSTRUCTION }, { role: 'user', content: JSON.stringify(input) }], stream: false, max_tokens: 1600, temperature: 0.2 }), signal: controller.signal });
        if (!response.ok) throw new Error('副模型请求失败');
        const data = await response.json();
        const choice = data.choices?.[0];
        if (choice?.finish_reason === 'length') throw new Error('副模型输出被截断');
        const content = choice?.message?.content;
        if (typeof content !== 'string' || !content.trim() || content.length > 20000) throw new Error('副模型未返回有效内容');
        return { content };
    } finally { clearTimeout(timer); }
}
