import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { WhatsAppAdapter } from '../src/whatsapp.mjs';
import { installMediaCompatibility } from '../src/media-compatibility.mjs';

function browserClient(channels, update = async () => {}) {
  return {
    pupPage: { evaluate: async (fn, target = null) => {
      const modules = {
        WAWebCollections: { WAWebNewsletterCollection: {getModelsArray: () => channels},
          WAWebNewsletterMetadataCollection: {update} },
        WAWebChatGetters: {getIsNewsletter: channel => channel.isChannel},
      };
      const result = await runInNewContext(`(${fn.toString()})(target)`, {
        target, window: {require: name => modules[name], WWebJS: {
          getChatModel: () => assert.fail('Must not load channel message history'),
        }},
      });
      return JSON.parse(JSON.stringify(result));
    } },
    getChatById: () => assert.fail('Full channel serialization fails on missing message keys'),
    getChannels: () => assert.fail('Full channel serialization fails on missing message keys'),
  };
}

const owned = () => ({isChannel: true, isReadOnly: false, id: {_serialized: '12345@newsletter'}, name: 'Empty channel',
  get msgs() { assert.fail('Discovery must not depend on messages'); },
  serialize() { throw new Error('IndexedDB: No key or key range specified'); },
});

test('empty owned channel is listed without reading history; unrelated and unverified channels are excluded', async () => {
  const adapter = new WhatsAppAdapter('/unused');
  const refreshed = [];
  adapter.client = browserClient([
    owned(),
    {isChannel: true, isReadOnly: true, id: {_serialized: '12346@newsletter'}},
    {isChannel: true, id: {_serialized: '12347@newsletter'}},
    {isChannel: false, isReadOnly: false, id: {_serialized: '12345@g.us'}},
    {isChannel: true, isReadOnly: false, id: {_serialized: '12345@c.us'}},
  ], async id => refreshed.push(id._serialized));
  assert.deepEqual(await adapter.channels(), [{id: '12345@newsletter', name: 'Empty channel'}]);
  assert.deepEqual(refreshed, ['12345@newsletter']);
});

test('membership refresh removes a demoted channel and fails closed when refresh fails', async () => {
  const adapter = new WhatsAppAdapter('/unused');
  const channel = owned();
  adapter.client = browserClient([channel], async () => { channel.isReadOnly = true; });
  assert.deepEqual(await adapter.channels(), []);
  channel.isReadOnly = false;
  adapter.client = browserClient([channel], async () => { throw new Error('Metadata unavailable'); });
  await assert.rejects(adapter.canPublish('12345@newsletter'), /Metadata unavailable/);
});

test('publication checks the exact target and rejects unknown or invalid channel IDs', async () => {
  const adapter = new WhatsAppAdapter('/unused');
  adapter.client = browserClient([owned()]);
  assert.equal(await adapter.canPublish('12345@newsletter'), true);
  assert.equal(await adapter.canPublish('99999@newsletter'), false);
  assert.equal(await adapter.canPublish('12345@g.us'), false);
  assert.equal(await adapter.canPublish(null), false);
});

test('channel publication needs server acknowledgement, not merely a local message ID', async () => {
  const adapter = new WhatsAppAdapter('/unused');
  let message = {id: {_serialized: 'local-id'}, rawData: {}};
  adapter.client = browserClient([owned()]);
  adapter.client.sendMessage = async (target, text, options) => {
    assert.equal(target, '12345@newsletter');
    assert.equal(text, 'Test');
    assert.equal(options.waitUntilMsgSent, true);
    return message;
  };
  assert.equal(await adapter.send({target: '12345@newsletter', text: 'Test'}), null);
  message = {id: {_serialized: 'local-id'}, rawData: {serverId: '42'}};
  assert.equal(await adapter.send({target: '12345@newsletter', text: 'Test'}), 'local-id');
  message = {id: {$1: 'current-message-id'}, rawData: {serverId: 42}};
  assert.equal(await adapter.send({target: '12345@newsletter', text: 'Test'}), 'current-message-id');
  message = {id: {$1: 'unconfirmed-id'}, rawData: {}};
  assert.equal(await adapter.send({target: '12345@newsletter', text: 'Test'}), null);
});

test('permission is checked again immediately before sending, including image publications', async () => {
  const adapter = new WhatsAppAdapter('/unused');
  const channel = owned();
  adapter.client = browserClient([channel]);
  assert.equal(await adapter.canPublish('12345@newsletter'), true);
  channel.isReadOnly = true;
  adapter.client.sendMessage = () => assert.fail('Must not send');
  await assert.rejects(adapter.send({target: '12345@newsletter', text: 'Test', image: {mime: 'image/png', data: 'AA=='}}), /permission changed/);
});

test('image publication applies the compatibility fix before forwarding image and caption', async () => {
  const adapter = new WhatsAppAdapter('/unused');
  const client = browserClient([owned()]);
  const evaluate = client.pupPage.evaluate;
  let patched = false;
  client.pupPage.evaluate = async (fn, target) => {
    if (fn === installMediaCompatibility) { patched = true; return; }
    return evaluate(fn, target);
  };
  client.sendMessage = async (target, media, options) => {
    assert.equal(patched, true);
    assert.equal(target, '12345@newsletter');
    assert.equal(media.mimetype, 'image/jpeg');
    assert.equal(media.data, '/9j/');
    assert.equal(options.caption, 'Caption');
    assert.equal(options.waitUntilMsgSent, true);
    return {id: {_serialized: 'confirmed-id'}, rawData: {serverId: 42}};
  };
  adapter.client = client;
  assert.equal(await adapter.send({target:'12345@newsletter', text:'Caption', image:{mime:'image/jpeg',data:'/9j/'}}), 'confirmed-id');
});
