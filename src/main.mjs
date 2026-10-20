import { mkdirSync, openSync, writeFileSync, readFileSync, unlinkSync, existsSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Journal } from './journal.mjs';
import { WhatsAppAdapter } from './whatsapp.mjs';
import { createPublisherServer } from './server.mjs';

process.umask(0o077);
const directory = resolve(process.env.PUBLISHER_DATA_DIR || './data');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const lockPath = join(directory, 'publisher.pid');
if (existsSync(lockPath)) {
  const pid = Number(readFileSync(lockPath, 'utf8'));
  if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid publisher lock; inspect before restarting');
  let running = true;
  try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') running = false; }
  if (running) throw new Error('Another publisher process is using this session');
  unlinkSync(lockPath);
}
const lock = openSync(lockPath, 'wx', 0o600);
writeFileSync(lock, String(process.pid));
closeSync(lock);
process.on('exit', () => { try { unlinkSync(lockPath); } catch {} });
const adapter = new WhatsAppAdapter(directory);
const server = createPublisherServer({ token: process.env.PUBLISHER_TOKEN, adapter,
  journal: new Journal(join(directory, 'publications')) });
server.listen(Number(process.env.PUBLISHER_PORT || 3187), '127.0.0.1', () => {
  console.log('Private WhatsApp publisher listening on loopback');
  if (existsSync(join(directory, 'auth', 'session-publisher'))) adapter.start();
});
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    setTimeout(() => process.exit(0), 5000).unref();
    Promise.resolve(adapter.client?.destroy()).finally(() => process.exit(0));
  });
}
