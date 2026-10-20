import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { validKey } from './journal.mjs';

const digest = value => createHash('sha256').update(value).digest();
const MAX_BODY = 15 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const validTarget = value => typeof value === 'string' && /^\d{5,30}@newsletter$/.test(value);

function imageMatches(mime, data) {
  if (mime === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/webp') return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export function validatePublication(body) {
  if (!body || !validKey(body.key) || !validTarget(body.target) ||
      typeof body.text !== 'string' || body.text.trim().length === 0 || body.text.length > 3000) {
    return false;
  }
  if (body.image !== undefined && body.image !== null) {
    if (typeof body.image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image.data)) return false;
    const bytes = Buffer.from(body.image.data, 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE || !imageMatches(body.image.mime, bytes)) return false;
  }
  return true;
}

function fingerprint(body) {
  return createHash('sha256').update(JSON.stringify([body.target, body.text, body.image ?? null])).digest('hex');
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error(), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error(), { status: 400 }); }
}

export function createPublisherServer({ token, adapter, journal }) {
  if (!token || token.length < 32) throw new Error('PUBLISHER_TOKEN must contain at least 32 characters');
  const expected = digest(`Bearer ${token}`);
  let active = false;

  async function deliver(body, record) {
    try {
      const messageId = await adapter.send(body);
      if (!messageId) throw new Error('No acknowledgement');
      journal.put({ ...record, status: 'sent', message_id: messageId, sent_at: new Date().toISOString() });
    } catch {
      // Once sending starts an error may still mean WhatsApp accepted the post.
      // Do not automatically send again; an admin must inspect the actual channel.
      journal.put({ ...record, status: 'unknown', code: 'delivery_unconfirmed' });
    } finally {
      active = false;
    }
  }

  const server = createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(value));
    };
    if (!timingSafeEqual(expected, digest(request.headers.authorization || ''))) {
      reply(401, { code: 'unauthorized' });
      return;
    }
    // This API is for backend-to-backend requests, never browser cross-origin access.
    if (request.headers.origin) { reply(403, { code: 'origin_forbidden' }); return; }
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/session') {
        reply(200, adapter.status());
      } else if (request.method === 'POST' && path === '/session/start') {
        adapter.start();
        reply(202, adapter.status());
      } else if (request.method === 'GET' && path === '/channels') {
        if (!adapter.ready()) { reply(409, { code: 'not_connected' }); return; }
        reply(200, { channels: await adapter.channels() });
      } else if (request.method === 'GET' && /^\/publications\/[a-f0-9-]{36}$/.test(path)) {
        const record = journal.get(path.split('/').pop());
        reply(record ? 200 : 404, record || { code: 'not_found' });
      } else if (request.method === 'POST' && /^\/publications\/[a-f0-9-]{36}\/retire$/.test(path)) {
        const key = path.split('/')[2], record = journal.get(key);
        if (record && !['unknown', 'retired'].includes(record.status)) {
          reply(409, { code: 'attempt_active' }); return;
        }
        // A tombstone also blocks a delayed original HTTP request that has not finished uploading.
        reply(200, journal.put({ ...record, key, status: 'retired' }));
      } else if (request.method === 'POST' && path === '/publications') {
        if (!request.headers['content-type']?.startsWith('application/json')) {
          reply(415, { code: 'json_required' }); return;
        }
        const body = await readJson(request);
        if (!validatePublication(body)) { reply(422, { code: 'invalid_payload' }); return; }
        const hash = fingerprint(body);
        const existing = journal.get(body.key);
        if (existing) {
          if (existing.status === 'retired') { reply(409, { code: 'attempt_retired' }); return; }
          if (existing.hash !== hash) { reply(409, { code: 'payload_changed' }); return; }
          if (existing.status !== 'rejected') {
            reply(existing.status === 'pending' ? 202 : 200, existing);
            return;
          }
        }
        if (!adapter.ready()) { reply(409, { code: 'not_connected' }); return; }
        if (active) { reply(409, { code: 'busy' }); return; }
        // Reserve before awaiting permission checks; two simultaneous requests cannot both send.
        active = true;
        let record;
        try {
          record = journal.put({ key: body.key, target: body.target, hash, status: 'pending' });
          if (!(await adapter.canPublish(body.target))) {
            journal.put({ ...record, status: 'rejected', code: 'channel_not_writable' });
            reply(422, { code: 'channel_not_writable' }); active = false; return;
          }
          reply(202, record);
          // Catch journal-write errors too; never expose account/session details in logs.
          void deliver(body, record).catch(() => { active = false; console.error('Publication journal update failed'); });
        } catch (error) {
          active = false;
          if (record) journal.put({ ...record, status: 'unknown', code: 'delivery_unconfirmed' });
          throw error;
        }
      } else {
        reply(404, { code: 'not_found' });
      }
    } catch (error) {
      if (!response.headersSent) reply(error.status || 503, { code: 'service_unavailable' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
