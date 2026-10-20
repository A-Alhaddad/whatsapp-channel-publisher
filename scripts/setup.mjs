import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

process.umask(0o077);
const content = [
  `PUBLISHER_TOKEN=${randomBytes(32).toString('hex')}`,
  'PUBLISHER_PORT=3187',
  'PUBLISHER_URL=http://127.0.0.1:3187',
  'PUBLISHER_DATA_DIR=./data',
  'CHROME_EXECUTABLE_PATH=',
  '',
].join('\n');
try {
  // Never replace a key belonging to an existing installation.
  writeFileSync('.env', content, { flag: 'wx', mode: 0o600 });
  mkdirSync('data', { recursive: true, mode: 0o700 });
  console.log('Created private .env and data/. Set CHROME_EXECUTABLE_PATH before starting.');
} catch (error) {
  if (error.code === 'EEXIST') console.error('.env already exists; it was not changed.');
  else console.error('Could not create the local configuration.');
  process.exitCode = 1;
}
