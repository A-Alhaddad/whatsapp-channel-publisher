import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Journal } from '../src/journal.mjs';
import { createPublisherServer, validatePublication } from '../src/server.mjs';

const token = 'test-token-'.repeat(4);
const body = (extra = {}) => ({key: randomUUID(), target: '123456789@newsletter', text: 'إعلان تجريبي', ...extra});
async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'channel-publisher-test-'));
  let sends = 0, starts = 0;
  const adapter = {
    ready: () => true, status: () => ({state: 'ready'}), start: () => { starts++; },
    channels: async () => [{id: '123456789@newsletter', name: 'Test channel'}],
    canPublish: async () => true, send: async () => { sends++; return 'message-1'; },
    ...overrides,
  };
  const journal = new Journal(directory);
  const server = createPublisherServer({token, adapter, journal});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, {recursive: true, force: true});
  });
  const request = async (path, method = 'GET', payload, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers},
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return {status: response.status, body: await response.json()};
  };
  return {request, journal, directory, sends: () => sends, starts: () => starts};
}

test('every route requires the private token and rejects browser origins', async t => {
  const f = await fixture(t);
  for (const path of ['/session', '/channels', '/publications/' + randomUUID()]) {
    assert.equal((await f.request(path, 'GET', undefined, {Authorization: 'Bearer wrong'})).status, 401);
    assert.equal((await f.request(path, 'GET', undefined, {Origin: 'https://example.test'})).status, 403);
  }
  assert.equal((await f.request('/session/start', 'POST', {}, {Authorization: ''})).status, 401);
  assert.equal(f.starts(), 0);
  assert.throws(() => createPublisherServer({token: 'short'}));
});

test('session startup and writable channel discovery', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/session/start', 'POST')).status, 202);
  assert.equal(f.starts(), 1);
  assert.equal((await f.request('/channels')).body.channels[0].id, '123456789@newsletter');
  assert.equal((await f.request('/session')).body.state, 'ready');
});

test('only channel destinations and valid bounded media are accepted', () => {
  assert.equal(validatePublication(body()), true);
  for (const target of ['12345@c.us', '12345@g.us', '../file', 'https://example.test']) {
    assert.equal(validatePublication(body({target})), false);
  }
  for (const text of ['', ' ', 'x'.repeat(3001), null]) assert.equal(validatePublication(body({text})), false);
  assert.equal(validatePublication(body({key: '../escape'})), false);
  assert.equal(validatePublication(body({image: {mime: 'image/png', data: Buffer.from('not png').toString('base64')}})), false);
  assert.equal(validatePublication(body({image: {mime: 'image/png', data: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')}})), true);
  assert.equal(validatePublication(body({image: {mime: 'image/png', data: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64')}})), false);
});

test('disconnected or non-admin accounts never send', async t => {
  const offline = await fixture(t, {ready: () => false});
  assert.equal((await offline.request('/publications', 'POST', body())).body.code, 'not_connected');
  assert.equal((await offline.request('/channels')).status, 409);
  assert.equal(offline.sends(), 0);
  const readOnly = await fixture(t, {canPublish: async () => false});
  const data = body();
  assert.equal((await readOnly.request('/publications', 'POST', data)).body.code, 'channel_not_writable');
  assert.equal(readOnly.journal.get(data.key).status, 'rejected');
  assert.equal(readOnly.sends(), 0);
});

test('confirmed publication is persistent and repeated requests do not send again', async t => {
  const f = await fixture(t), data = body();
  assert.equal((await f.request('/publications', 'POST', data)).status, 202);
  const receipt = await f.request('/publications/' + data.key);
  assert.equal(receipt.body.status, 'sent');
  assert.equal(receipt.body.message_id, 'message-1');
  assert.equal((await f.request('/publications', 'POST', data)).body.status, 'sent');
  assert.equal(f.sends(), 1);
  assert.equal(new Journal(f.directory).get(data.key).status, 'sent');
  assert.equal(statSync(join(f.directory, data.key + '.json')).mode & 0o777, 0o600);
  assert.equal('text' in receipt.body, false);
});

test('changed payload under the same idempotency key is rejected', async t => {
  const f = await fixture(t), data = body();
  await f.request('/publications', 'POST', data);
  const changed = await f.request('/publications', 'POST', {...data, text: 'different'});
  assert.equal(changed.status, 409);
  assert.equal(changed.body.code, 'payload_changed');
  assert.equal(f.sends(), 1);
});

test('concurrent publications reserve the send slot before asynchronous permission checks', async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const checking = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, {canPublish: () => { entered(); return checking; }});
  const data = body(), first = f.request('/publications', 'POST', data);
  await started;
  assert.equal((await f.request('/publications', 'POST', body())).body.code, 'busy');
  assert.equal((await f.request('/publications/' + data.key)).body.status, 'pending');
  assert.equal((await f.request('/publications/' + data.key + '/retire', 'POST')).status, 409);
  release(true);
  await first;
  assert.equal(f.sends(), 1);
});

test('delivery failures are unknown and cannot be automatically replayed', async t => {
  let calls = 0;
  const f = await fixture(t, {send: async () => { calls++; throw new Error('connection lost after sending'); }});
  const data = body();
  await f.request('/publications', 'POST', data);
  assert.equal((await f.request('/publications/' + data.key)).body.status, 'unknown');
  assert.equal((await f.request('/publications', 'POST', data)).body.status, 'unknown');
  assert.equal(calls, 1);
  assert.equal((await f.request('/publications/' + data.key + '/retire', 'POST')).body.status, 'retired');
  assert.equal((await f.request('/publications', 'POST', data)).body.code, 'attempt_retired');
  assert.equal(calls, 1);
});

test('retiring a missing attempt blocks an original delayed request', async t => {
  const f = await fixture(t), data = body();
  assert.equal((await f.request('/publications/' + data.key)).status, 404);
  await f.request('/publications/' + data.key + '/retire', 'POST');
  assert.equal((await f.request('/publications', 'POST', data)).body.code, 'attempt_retired');
  assert.equal(f.sends(), 0);
});

test('sent receipts cannot be retired and pending receipts become unknown after restart', async t => {
  const f = await fixture(t), data = body();
  await f.request('/publications', 'POST', data);
  assert.equal((await f.request('/publications/' + data.key + '/retire', 'POST')).status, 409);
  const pending = body();
  f.journal.put({key: pending.key, target: pending.target, status: 'pending'});
  assert.equal(new Journal(f.directory).get(pending.key).status, 'unknown');
});

test('corrupt journal fails closed instead of sending a duplicate', async t => {
  const f = await fixture(t), data = body();
  writeFileSync(join(f.directory, data.key + '.json'), 'broken');
  assert.equal((await f.request('/publications', 'POST', data)).status, 503);
  assert.equal(f.sends(), 0);
});
