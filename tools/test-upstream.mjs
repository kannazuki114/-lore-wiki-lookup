// Uses real bundled upstream code, fake credentials and intercepted fetch. Never connects to Wiki.
import assert from 'node:assert/strict';
import { createQueryRunner } from '../.runtime/upstream-adapter.mjs';

const saved = { fetch: globalThis.fetch, user: process.env.MOEGIRLPEDIA_USERNAME, password: process.env.MOEGIRLPEDIA_BOT_PASSWORD };
const calls = [];
process.env.MOEGIRLPEDIA_USERNAME = 'Fixture@ReadOnly';
process.env.MOEGIRLPEDIA_BOT_PASSWORD = 'fixture-not-a-real-password';
globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://mzh.moegirl.org.cn/api.php');
    const params = Object.fromEntries(new URLSearchParams(options.body));
    calls.push(params);
    let value;
    if (params.meta === 'tokens') value = { query: { tokens: { logintoken: 'fixture-token' } } };
    else if (params.action === 'login') value = { login: { result: 'Success' } };
    else {
        assert.equal(params.assertuser, 'Fixture');
        if (params.list === 'search') value = { query: { search: [{ title: '测试角色', pageid: 1 }], searchinfo: { totalhits: 1 } } };
        else if (params.action === 'parse') value = { parse: { text: '<p>测试正文</p>', displaytitle: '测试角色', revid: 7, sections: [] } };
        else if (params.prop === 'categories') { assert.equal(params.redirects, '1'); value = { query: { pages: [{ title: '测试角色', categories: [{ title: 'Category:测试' }] }] } }; }
        else if (params.list === 'categorymembers') { assert.equal(params.cmtype, 'page'); value = { query: { categorymembers: [{ title: '测试角色', pageid: 1, ns: 0 }] } }; }
        else throw new Error('Unexpected request');
    }
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'session=fixture; Path=/; Secure' } });
};
try {
    const run = await createQueryRunner();
    assert.equal((await run({ operation: 'search', query: '测试', limit: 5 })).items[0].title, '测试角色');
    assert.equal((await run({ operation: 'get-page', query: '测试角色', limit: 5 })).format, 'html');
    assert.equal((await run({ operation: 'get-categories', query: '别名', limit: 500 })).pageTitle, '测试角色');
    assert.equal((await run({ operation: 'get-category-members', query: '测试', limit: 5 })).members[0].title, '测试角色');
    assert.equal(calls.filter(p => p.action === 'login').length, 1);
    await assert.rejects(run({ operation: 'edit', query: '测试' }), /不支持/);
    console.log('上游适配验证通过：4 种读取操作，1 次模拟登录，认证会话复用；无真实联网。');
} finally {
    globalThis.fetch = saved.fetch;
    if (saved.user === undefined) delete process.env.MOEGIRLPEDIA_USERNAME; else process.env.MOEGIRLPEDIA_USERNAME = saved.user;
    if (saved.password === undefined) delete process.env.MOEGIRLPEDIA_BOT_PASSWORD; else process.env.MOEGIRLPEDIA_BOT_PASSWORD = saved.password;
}
