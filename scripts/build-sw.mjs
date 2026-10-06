import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
const dist = resolve('dist');
async function filesIn(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? filesIn(resolve(dir, e.name)) : [resolve(dir, e.name)],
    ),
  );
  return nested.flat();
}
const files = (await filesIn(dist)).filter((f) => !f.endsWith('sw.js')).sort();
const hash = createHash('sha256');
for (const file of files) {
  hash.update(relative(dist, file));
  hash.update(await readFile(file));
}
const urls = files.map((f) => relative(dist, f).split(sep).join('/'));
const template = await readFile('src/app/service-worker.template.js', 'utf8');
await writeFile(
  resolve(dist, 'sw.js'),
  template
    .replace('__BUILD_HASH__', hash.digest('hex').slice(0, 16))
    .replace('__PRECACHE_LIST__', JSON.stringify(urls)),
  'utf8',
);
execFileSync(process.execPath, ['--check', resolve(dist, 'sw.js')]);
console.log(`离线缓存生成完成：${urls.length} 个本地资源。`);
