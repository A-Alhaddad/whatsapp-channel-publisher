import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { PublisherClient, PublisherError } from '../clients/PublisherClient.mjs';
import { validatePublication } from '../src/server.mjs';

process.umask(0o077);
const help = `Commands (run from the package directory):
  npm run cli -- status
  npm run cli -- connect
  npm run cli -- qr
  npm run cli -- channels
  npm run cli -- prepare --channel ID@newsletter --text-file message.txt --image photo.jpg --output data/post.json
  npm run cli -- publish --file data/post.json --confirm
  npm run cli -- receipt --key UUID
  npm run cli -- retire --key UUID --confirm

prepare writes a NEW immutable payload locally; omit --image for a text post.
publish sends a real channel post. Reuse the same file/key when checking a failed request.
retire is only for an unknown/missing attempt after manually checking the actual channel.
`;

try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: Object.fromEntries(['channel', 'text-file', 'image', 'output', 'file', 'key'].map(key => [key, { type: 'string' }])
      .concat([['confirm', { type: 'boolean', default: false }]])),
  });
  const command = positionals[0];
  if (!command || command === 'help') {
    console.log(help);
  } else if (command === 'prepare') {
    if (!values.channel || !values['text-file'] || !values.output) throw new Error('channel, text-file and output are required');
    const payload = { key: randomUUID(), target: values.channel, text: readFileSync(values['text-file'], 'utf8').trim() };
    if (values.image) {
      if (statSync(values.image).size > 10 * 1024 * 1024) throw new Error('Image exceeds 10 MiB');
      const bytes = readFileSync(values.image);
      const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
        : bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
      payload.image = { mime, data: bytes.toString('base64') };
    }
    if (!validatePublication(payload)) throw new Error('Invalid channel, text or image; see docs/en/API.md');
    mkdirSync(dirname(resolve(values.output)), { recursive: true, mode: 0o700 });
    writeFileSync(values.output, JSON.stringify(payload), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ prepared: values.output, key: payload.key, sent: false }));
  } else {
    const client = new PublisherClient({ url: process.env.PUBLISHER_URL, token: process.env.PUBLISHER_TOKEN });
    let result;
    if (command === 'status') {
      const { qr, ...state } = await client.session();
      result = { ...state, qr_available: Boolean(qr) };
    } else if (command === 'connect') {
      const { qr, ...state } = await client.connect();
      result = { ...state, next: 'Run the qr command to save the current pairing QR.' };
    } else if (command === 'qr') {
      const state = await client.session();
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(state.qr || '')) throw new Error(`QR not available (state: ${state.state}). Try again after connect.`);
      const folder = resolve(process.env.PUBLISHER_DATA_DIR || './data');
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const path = resolve(folder, 'pairing.html');
      writeFileSync(path, `<!doctype html><meta charset="utf-8"><title>WhatsApp pairing</title><h1>WhatsApp · Linked devices · Link a device</h1><p>Scan the current code. If expired, run the qr command again.</p><img alt="WhatsApp pairing QR" src="${state.qr}">`, { mode: 0o600 });
      result = { qr_file: path };
    } else if (command === 'channels') {
      result = await client.channels();
    } else if (command === 'publish') {
      if (!values.confirm || !values.file) throw new Error('Publishing requires --file and --confirm');
      const payload = JSON.parse(readFileSync(values.file, 'utf8'));
      if (!validatePublication(payload)) throw new Error('Invalid prepared payload');
      result = await client.publish(payload);
    } else if (command === 'receipt') {
      result = await client.receipt(values.key);
    } else if (command === 'retire') {
      if (!values.confirm) throw new Error('Retiring requires --confirm after checking the actual channel');
      result = await client.retire(values.key);
    } else {
      throw new Error('Unknown command. Run help.');
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error instanceof PublisherError ? `${error.code} (${error.status})` : error.message);
  process.exitCode = 1;
}
