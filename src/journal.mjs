import { mkdirSync, readFileSync, readdirSync, renameSync, openSync, writeFileSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const validKey = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);

// Keep this journal across restarts and deployments. Losing it loses deduplication.
export class Journal {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(directory).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      const record = this.get(name.slice(0, -5));
      if (record?.status === 'pending') {
        this.put({ ...record, status: 'unknown', code: 'interrupted' });
      }
    }
  }

  get(key) {
    if (!validKey(key)) throw new Error('Invalid publication key');
    try {
      return JSON.parse(readFileSync(join(this.directory, `${key}.json`), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error; // A corrupt ledger must never be treated as a new publication.
    }
  }

  put(record) {
    if (!validKey(record.key)) throw new Error('Invalid publication key');
    const destination = join(this.directory, `${record.key}.json`);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      writeFileSync(fd, JSON.stringify({ ...record, updated_at: new Date().toISOString() }));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, destination);
    const dir = openSync(this.directory, 'r');
    try { fsyncSync(dir); } finally { closeSync(dir); }
    return this.get(record.key);
  }
}
