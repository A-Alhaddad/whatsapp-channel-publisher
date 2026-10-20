import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { installMediaCompatibility } from '../src/media-compatibility.mjs';

const { LoadUtils } = createRequire(import.meta.url)('whatsapp-web.js/src/util/Injected/Utils.js');
const install = window => runInNewContext(`(${installMediaCompatibility.toString()})()`, {window});

function channelBrowser({modernMetadata = false} = {}) {
  const calls = [];
  class MsgKey {
    static async newId() { return 'outgoing-id'; }
    constructor(data) { Object.assign(this, data); }
  }
  class Msg {
    constructor(data) {
      Object.assign(this, data);
      // WhatsApp model fields use __x_ storage. Enumerable MediaData.__x_id
      // overrides the real message key even when its value is undefined.
      this.id = Object.hasOwn(data, '__x_id') ? data.__x_id : data.id;
      if (!this.id) throw new Error("Data passed to getter must include an id property");
    }
    avParams() { return {type: this.type}; }
    updateAck(ack) { this.ack = ack; }
  }
  if (modernMetadata) delete Msg.prototype.avParams;
  const modules = {
    WAWebChatGetters: {getIsNewsletter: () => true, getIsBroadcast: () => false},
    WALinkify: {findLink: () => null},
    WAWebUserPrefsMeUser: {getMaybeMeLidUser: () => 'me-lid', getMaybeMePnUser: () => 'me-pn'},
    WAWebMsgKey: MsgKey,
    WAWebGetEphemeralFieldsMsgActionsUtils: {getEphemeralFields: () => ({})},
    WAWebCollections: {Msg: {modelClass: Msg}},
    WAWebMediaMetadata: {mediaMetadata: msg => ({type: msg.type, mimetype: 'image/jpeg'})},
    WAWebMsgDataFromModel: {msgDataFromMsgModel: msg => msg},
    WAWebNewsletterUpdateMsgsRecordsJob: {
      addNewsletterMsgsRecords: async () => calls.push('record'),
      updateNewsletterMsgRecord: async () => calls.push('acknowledged'),
    },
    WAWebNewsletterSendMessageJob: {sendNewsletterMessageJob: async request => {
      calls.push(request);
      return {success: true, serverId: 42, ack: {t: 123}};
    }},
  };
  const window = {require: name => modules[name]};
  // Exercise the actual locked dependency's helper, not a rewritten send function.
  runInNewContext(`(${LoadUtils.toString()})()`, {window});
  window.WWebJS.processMediaData = async () => ({
    __x_id: undefined, preview: 'preview', type: 'image', mediaHandle: 'uploaded-media',
    toJSON() { return {type: 'image'}; },
  });
  const channel = {id: {isLid: () => false, toJid: () => '12345@newsletter'},
    msgs: {add: () => calls.push('local-message')}};
  const send = () => window.WWebJS.sendMessage(channel, '', {
    media: {mimetype: 'image/jpeg', data: '/9j/'}, caption: 'Caption', waitUntilMsgSent: true,
  });
  return {window, send, calls, MsgKey};
}

test('locked upstream media helper reproduces the missing-id failure before any send', async () => {
  const {send, calls} = channelBrowser();
  await assert.rejects(send(), /must include an id property/);
  assert.deepEqual(calls, []);
});

test('backport preserves the message key, image and caption through server acknowledgement', async () => {
  const {window, send, calls, MsgKey} = channelBrowser();
  install(window);
  const msg = await send();
  assert.ok(msg.id instanceof MsgKey);
  assert.equal(msg.id.id, 'outgoing-id');
  assert.equal(msg.caption, 'Caption');
  assert.equal(msg.serverId, 42);
  assert.equal(msg.ack, 1);
  assert.equal(Object.hasOwn(msg, '__x_id'), false);
  const request = calls[2];
  assert.equal(request.type, 'media');
  assert.equal(request.mediaHandle, 'uploaded-media');
  assert.equal(request.newsletterJid, '12345@newsletter');
  assert.equal(calls[3], 'acknowledged');
});

test('repeated installation is idempotent and unsupported helper versions fail closed', () => {
  const {window} = channelBrowser();
  install(window);
  const patched = window.WWebJS.sendMessage;
  install(window);
  assert.equal(window.WWebJS.sendMessage, patched);
  window.WWebJS.sendMessage = async () => {};
  assert.throws(() => install(window), /Unsupported WhatsApp media helper/);
});

test('current WhatsApp uses the metadata module after removing Msg.avParams', async () => {
  const {window, send, calls} = channelBrowser({modernMetadata: true});
  install(window);
  const msg = await send();
  assert.equal(msg.serverId, 42);
  assert.equal(calls[2].mediaMetadata.type, 'image');
  assert.equal(calls[2].mediaMetadata.mimetype, 'image/jpeg');
});
