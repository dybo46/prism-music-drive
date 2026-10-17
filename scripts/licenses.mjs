import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = JSON.parse(await readFile('package.json', 'utf8')),
  seen = new Set(),
  entries = [];
async function collect(name) {
  if (seen.has(name)) return;
  seen.add(name);
  const directory = path.resolve('node_modules', name),
    pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const files = await readdir(directory);
  const licenses = files.filter((f) => /^licen[cs]e(?:\.|$)/i.test(f));
  let text = '';
  for (const file of licenses) text += (await readFile(path.join(directory, file), 'utf8')) + '\n';
  if (!text) {
    const readme = files.find((f) => /^readme/i.test(f));
    if (readme) {
      const body = await readFile(path.join(directory, readme), 'utf8'),
        match = body.match(/(?:^|\n)#+ Licen[sc]e[^\n]*\n([\s\S]*)/i);
      if (match) text = match[1].trim();
    }
  }
  if (!text) throw Error('Missing license text for ' + name);
  entries.push({ name, version: pkg.version, license: pkg.license, text });
  for (const dep of Object.keys(pkg.dependencies || {})) await collect(dep);
}
for (const name of Object.keys(root.dependencies)) await collect(name);
entries.sort((a, b) => a.name.localeCompare(b.name));
const intro =
  '# Third-party notices\n\nThe application bundles the following production packages. License texts are reproduced below and also shipped in `third-party-notices.txt`. Three.js addons inherit the Three.js MIT license. No reference video, mockup, or Prompt Motion source code is bundled.\n\n';
const list =
  '| Package | Version | License |\n| --- | --- | --- |\n' +
  entries.map((e) => `| ${e.name} | ${e.version} | ${e.license} |`).join('\n') +
  '\n\n';
const text =
  intro +
  list +
  entries
    .map((e) => `## ${e.name} ${e.version}\n\n\`\`\`text\n${e.text.trim()}\n\`\`\`\n`)
    .join('\n');
await mkdir('public', { recursive: true });
await writeFile('THIRD_PARTY_NOTICES.md', text);
await writeFile('public/third-party-notices.txt', text);
console.log('Collected', entries.length, 'production license notices.');
