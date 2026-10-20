import pkg from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { join } from 'node:path';
import { writableChannels } from './channels.mjs';
import { installMediaCompatibility } from './media-compatibility.mjs';
const { Client, LocalAuth, MessageMedia } = pkg;

export class WhatsAppAdapter {
  constructor(dataDirectory) {
    this.client = null;
    this.state = 'disconnected';
    this.qr = null;
    this.qrExpires = 0;
    this.dataDirectory = dataDirectory;
  }

  ready() { return this.state === 'ready'; }

  status() {
    return { state: this.state, qr: Date.now() < this.qrExpires ? this.qr : null,
      account: this.ready() ? (this.client.info?.wid?.user || null) : null };
  }

  start() {
    if (['starting', 'qr', 'authenticated', 'ready'].includes(this.state)) return;
    this.state = 'starting';
    void this.initialize().catch(() => { this.state = 'error'; this.qr = null; });
  }

  async initialize() {
    if (this.client) {
      this.client.removeAllListeners();
      await this.client.destroy().catch(() => {});
    }
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: 'publisher', dataPath: join(this.dataDirectory, 'auth') }),
      webVersionCache: { type: 'local', path: join(this.dataDirectory, 'web-cache') },
      puppeteer: { headless: true, executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
        args: ['--disable-dev-shm-usage'] },
    });
    const current = this.client;
    this.client.on('qr', qr => {
      if (this.client !== current) return;
      this.state = 'qr';
      void QRCode.toDataURL(qr, { width: 280, margin: 2 }).then(image => {
        if (this.client !== current || this.state !== 'qr') return;
        this.qr = image;
        this.qrExpires = Date.now() + 45000;
      }).catch(() => { if (this.client === current) this.qr = null; });
    });
    this.client.on('authenticated', () => { this.qr = null; this.state = 'authenticated'; });
    this.client.on('ready', () => { this.qr = null; this.state = 'ready'; });
    this.client.on('auth_failure', () => { this.qr = null; this.state = 'error'; });
    this.client.on('disconnected', () => { this.qr = null; this.state = 'disconnected'; });
    await this.client.initialize();
  }

  async channels() {
    return this.client.pupPage.evaluate(writableChannels);
  }

  async canPublish(target) {
    if (typeof target !== 'string' || !/^\d{5,30}@newsletter$/.test(target)) return false;
    return (await this.client.pupPage.evaluate(writableChannels, target)).some(channel => channel.id === target);
  }

  async send(body) {
    if (!(await this.canPublish(body.target))) throw new Error('Channel permission changed');
    if (body.image) await this.client.pupPage.evaluate(installMediaCompatibility);
    const message = body.image
      ? await this.client.sendMessage(body.target, new MessageMedia(body.image.mime, body.image.data, 'advertisement'), { caption: body.text, waitUntilMsgSent: true })
      : await this.client.sendMessage(body.target, body.text, { waitUntilMsgSent: true });
    // whatsapp-web.js can return a local message even when channel publishing failed.
    // Its channel implementation assigns serverId only after a successful server response.
    if (!message?.rawData?.serverId) return null;
    // Current WhatsApp MsgKey versions serialize the identifier as $1.
    return message?.id?._serialized || message?.id?.$1 || null;
  }
}
