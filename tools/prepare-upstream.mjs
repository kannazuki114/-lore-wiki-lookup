// Build a persistent-session adapter using the user's local upstream checkout.
// Does not install packages, run repository scripts or modify the upstream tree.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] && path.resolve(process.argv[2]);
if (!root) throw new Error('用法：node tools/prepare-upstream.mjs <moegirlpedia-mediawiki-api源码目录>');
const requireUpstream = createRequire(path.join(root, 'package.json'));
const { build } = requireUpstream('esbuild');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.runtime/upstream-adapter.mjs');
await fs.mkdir(path.dirname(out), { recursive: true });
const sourcePath = name => JSON.stringify(path.join(root, 'src', name).replaceAll('\\', '/'));
const protocolPath = JSON.stringify(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/mediawiki.js').replaceAll('\\', '/'));
const result = await build({
    stdin: { contents: `
import { createClientFromEnv } from ${sourcePath('client.ts')};
import Api from ${sourcePath('module/Api.ts')};
import { apiParameters, normalizeResponse } from ${protocolPath};
export async function createQueryRunner() {
    let client;
    const connect = async () => client ||= await createClientFromEnv(process.env, options => new Api({ ...options, timeout: 15000 }));
    return async request => {
        const { operation } = request;
        const params = apiParameters(operation, request);
        delete params.origin; // Authenticated server request, not an anonymous browser CORS call.
        const active = await connect();
        try { return normalizeResponse(operation, await active.post(params), request); }
        catch (error) { client = null; throw error; }
    };
}
`, resolveDir: root, sourcefile: 'lore-bridge-adapter.js', loader: 'js' },
    outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node24.11', legalComments: 'linked', metafile: true
});
await fs.writeFile(path.join(path.dirname(out), 'build-info.json'), JSON.stringify({ builtAt: new Date().toISOString(), source: root, inputs: Object.keys(result.metafile.inputs) }, null, 2));
console.log('适配器已构建：' + out);
