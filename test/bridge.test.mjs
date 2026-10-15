import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, validateRequest } from '../tools/bridge.mjs';

test('桥接只接受读取操作，限制分页键，避免续页参数覆盖 action', () => {
    assert.throws(() => validateRequest({ operation: 'edit', query: 'x' }));
    assert.throws(() => validateRequest({ operation: 'search', query: 'x', limit: 100 }));
    assert.throws(() => validateRequest({ operation: 'search', query: 'x', continueToken: Buffer.from(JSON.stringify({ action: 'edit' })).toString('base64url') }));
    const token = Buffer.from(JSON.stringify({ sroffset: 5, continue: '-||' })).toString('base64url');
    assert.equal(validateRequest({ operation: 'search', query: 'x', continueToken: token }).continueToken, token);
});
test('桥接配对、来源验证、请求体校验和错误脱敏', async () => {
    const token = 't'.repeat(32);
    let calls = 0;
    const server = createBridge({ token, run: async body => { calls++; if (body.query === 'fail') throw new Error('MOEGIRLPEDIA_BOT_PASSWORD=secret'); return { items: [], operation: body.operation }; } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port + '/query';
    try {
        const send = (body, extra = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lore-Token': token, ...extra }, body: JSON.stringify(body) });
        assert.equal((await send({ operation: 'search', query: 'x' }, { 'X-Lore-Token': 'bad' })).status, 401);
        assert.equal((await send({ operation: 'search', query: 'x' }, { Origin: 'https://evil.example' })).status, 403);
        assert.equal((await send({ operation: 'edit', query: 'x' })).status, 400);
        const good = await send({ operation: 'search', query: 'x' }, { Origin: 'http://localhost:8000' });
        assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:8000');
        assert.equal((await good.json()).operation, 'search');
        const fail = await send({ operation: 'search', query: 'fail' });
        assert.equal(fail.status, 502);
        assert.ok(!(await fail.text()).includes('secret'));
        assert.equal(calls, 2);
    } finally { await new Promise(r => server.close(r)); }
});
