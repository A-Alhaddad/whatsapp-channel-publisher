import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { PublisherClient, PublisherError } from '../clients/PublisherClient.mjs';
import { createPublisherServer } from '../src/server.mjs';
import { Journal } from '../src/journal.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const token = 'portable-test-only-'.repeat(4);
const target = '123456789@newsletter';
function directory(t) {
  const path = mkdtempSync(join(tmpdir(), 'portable-publisher-test-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
async function fixture(t) {
  let sends = 0;
  const server = createPublisherServer({
    token,
    journal: new Journal(directory(t)),
    adapter: {
      ready: () => true, start() {}, status: () => ({ state: 'ready', qr: null }),
      channels: async () => [{ id: target, name: 'Fixture channel' }],
      canPublish: async () => true,
      send: async () => { sends++; return 'fixture-message'; },
    },
  });
  const url = await listen(t, server);
  return { url, client: new PublisherClient({ url, token }), sends: () => sends };
}
const cli = (args, options = {}) => exec(process.execPath, [join(root, 'bin/publisher.mjs'), ...args], options);

test('portable Node client supports discovery, publication and idempotent receipts', async t => {
  const { client, sends } = await fixture(t);
  assert.equal((await client.connect()).state, 'ready');
  assert.equal((await client.session()).qr, null);
  assert.equal((await client.channels()).channels[0].id, target);
  const payload = { key: randomUUID(), target, text: 'نص من مشروع مستقل' };
  assert.equal((await client.publish(payload)).status, 'pending');
  assert.equal((await client.receipt(payload.key)).status, 'sent');
  assert.equal((await client.publish(payload)).status, 'sent');
  assert.equal(sends(), 1);
  await assert.rejects(client.publish({ ...payload, text: 'changed' }),
    error => error.code === 'payload_changed' && error.status === 409);
  const key = randomUUID();
  assert.equal((await client.retire(key)).status, 'retired');
});

test('portable clients restrict destinations and report errors without credentials', async t => {
  for (const url of ['https://example.com', 'http://example.com', 'http://user@localhost', 'http://localhost/path']) {
    assert.throws(() => new PublisherClient({ url, token }), /loopback_url_required/);
  }
  assert.throws(() => new PublisherClient({ token: 'short' }), /private_token_required/);
  const { url, client } = await fixture(t);
  assert.throws(() => client.receipt('../secret'), /invalid_key/);
  await assert.rejects(new PublisherClient({ url, token: 'incorrect-'.repeat(4) }).session(),
    error => error instanceof PublisherError && error.code === 'unauthorized' && !error.message.includes(token));
});

test('Node client never retries a POST with a lost HTTP response', async t => {
  let attempts = 0;
  const url = await listen(t, createServer((request) => {
    attempts++;
    request.socket.destroy();
  }));
  const client = new PublisherClient({ url, token });
  await assert.rejects(client.publish({ key: randomUUID(), target, text: 'test' }), /transport_error/);
  assert.equal(attempts, 1);
});

test('setup creates private configuration without exposing or replacing the key', async t => {
  const cwd = directory(t);
  const { stdout } = await exec(process.execPath, [join(root, 'scripts/setup.mjs')], { cwd });
  const env = readFileSync(join(cwd, '.env'), 'utf8');
  const generatedToken = env.match(/^PUBLISHER_TOKEN=([a-f0-9]{64})$/m)?.[1];
  assert.ok(generatedToken);
  assert.equal(stdout.includes(generatedToken), false);
  assert.equal(statSync(join(cwd, '.env')).mode & 0o777, 0o600);
  assert.equal(statSync(join(cwd, 'data')).mode & 0o777, 0o700);
  await assert.rejects(exec(process.execPath, [join(root, 'scripts/setup.mjs')], { cwd }), /already exists/);
  assert.equal(readFileSync(join(cwd, '.env'), 'utf8'), env);
});

test('CLI prepares an immutable image payload and requires explicit publish confirmation', async t => {
  const cwd = directory(t);
  writeFileSync(join(cwd, 'text.txt'), 'عنوان مستقل\nتفاصيل');
  writeFileSync(join(cwd, 'photo.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const args = ['prepare', '--channel', target, '--text-file', 'text.txt', '--image', 'photo.png', '--output', 'data/post.json'];
  const prepared = await cli(args, { cwd });
  assert.equal(JSON.parse(prepared.stdout).sent, false);
  const saved = readFileSync(join(cwd, 'data/post.json'), 'utf8');
  const payload = JSON.parse(saved);
  assert.equal(payload.image.mime, 'image/png');
  assert.equal(statSync(join(cwd, 'data/post.json')).mode & 0o777, 0o600);
  await assert.rejects(cli(args, { cwd }), /EEXIST/);
  assert.equal(readFileSync(join(cwd, 'data/post.json'), 'utf8'), saved);
  const { url, sends } = await fixture(t);
  const env = { ...process.env, PUBLISHER_TOKEN: token, PUBLISHER_URL: url };
  await assert.rejects(cli(['publish', '--file', 'data/post.json'], { cwd, env }), /requires --file and --confirm/);
  assert.equal(sends(), 0);
  const accepted = await cli(['publish', '--file', 'data/post.json', '--confirm'], { cwd, env });
  assert.equal(JSON.parse(accepted.stdout).status, 'pending');
  const result = await cli(['receipt', '--key', payload.key], { cwd, env });
  assert.equal(JSON.parse(result.stdout).status, 'sent');
  assert.equal(sends(), 1);
});

test('CLI rejects unsupported images before creating a publication file', async t => {
  const cwd = directory(t);
  writeFileSync(join(cwd, 'text.txt'), 'نص');
  writeFileSync(join(cwd, 'photo.jpg'), 'not an image');
  await assert.rejects(cli(['prepare', '--channel', target, '--text-file', 'text.txt',
    '--image', 'photo.jpg', '--output', 'post.json'], { cwd }), /Invalid channel, text or image/);
  assert.throws(() => readFileSync(join(cwd, 'post.json')), { code: 'ENOENT' });
});

test('PHP client interoperates with the local API without Composer', { skip: !process.env.PHP_BINARY }, async t => {
  const { url, sends } = await fixture(t);
  const source = String.raw`
    require getenv('CLIENT_PATH');
    $client = new \WhatsAppChannel\PublisherClient(getenv('PUBLISHER_TOKEN'), getenv('PUBLISHER_URL'));
    $channels = $client->channels();
    $payload = ['key' => getenv('TEST_KEY'), 'target' => $channels['channels'][0]['id'], 'text' => 'PHP fixture'];
    $client->publish($payload);
    $receipt = $client->receipt($payload['key']);
    $client->publish($payload);
    try { $client->publish(array_merge($payload, ['text' => 'changed'])); }
    catch (\WhatsAppChannel\PublisherException $e) { $error = $e->publisherCode; }
    echo json_encode(['receipt' => $receipt['status'], 'error' => $error]);
  `;
  const { stdout } = await exec(process.env.PHP_BINARY, ['-r', source], {
    env: { ...process.env, CLIENT_PATH: join(root, 'clients/PublisherClient.php'),
      PUBLISHER_TOKEN: token, PUBLISHER_URL: url, TEST_KEY: randomUUID() },
  });
  assert.deepEqual(JSON.parse(stdout), { receipt: 'sent', error: 'payload_changed' });
  assert.equal(sends(), 1);
});
