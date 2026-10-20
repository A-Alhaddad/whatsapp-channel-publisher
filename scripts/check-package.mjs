import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root, encoding: 'utf8',
}).split('\0').filter(Boolean);
const failures = [];
const forbiddenParts = new Set(['node_modules', '.git', 'data', '.wwebjs_auth', '.wwebjs_cache', 'auth', 'web-cache', 'dist']);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bIGAA?[A-Za-z0-9]{70,}\b/,
];
for (const file of files) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (parts.some(part => forbiddenParts.has(part))
    || (name.startsWith('.env') && name !== '.env.example')
    || /\.(token|pem|key|log)$/i.test(name)) failures.push(`${file}: private/runtime file`);
  const path = resolve(root, file);
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    failures.push(`${file}: expected an ordinary file`);
    continue;
  }
  const content = readFileSync(path, 'utf8');
  if (secretPatterns.some(pattern => pattern.test(content))) failures.push(`${file}: possible credential`);
  if (file.endsWith('.md')) {
    for (const [, link] of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const target = resolve(dirname(path), link.split('#')[0]);
      const inside = relative(root, target);
      if (inside.startsWith('..') || isAbsolute(inside) || !existsSync(target)) {
        failures.push(`${file}: invalid local documentation link`);
      }
    }
  }
}
const metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
if (metadata.name !== lock.name || metadata.version !== lock.version || lock.packages[''].license !== metadata.license) {
  failures.push('package.json and package-lock.json metadata differ');
}
if (!/^PUBLISHER_TOKEN=$/m.test(readFileSync(resolve(root, '.env.example'), 'utf8'))) {
  failures.push('.env.example must have an empty token');
}
for (const name of ['LICENSE', 'README.md', 'README.ar.md', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md', 'CONTRIBUTING.md']) {
  if (!files.includes(name)) failures.push(`${name}: missing from source files`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} source files: documentation links, package metadata and private-file exclusions passed.`);
}
