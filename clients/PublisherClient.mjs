export class PublisherError extends Error {
  constructor(code, status = 0) {
    super(`WhatsApp publisher: ${code}`);
    this.name = 'PublisherError';
    this.code = code;
    this.status = status;
  }
}

// Copy this file into any Node.js backend. It has no third-party dependencies.
export class PublisherClient {
  #base;
  #token;

  constructor({ url = 'http://127.0.0.1:3187', token }) {
    const base = new URL(url);
    if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
      || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
      throw new PublisherError('loopback_url_required');
    }
    if (typeof token !== 'string' || token.length < 32) throw new PublisherError('private_token_required');
    this.#base = base.origin;
    this.#token = token;
  }

  async #request(method, path, payload) {
    let response;
    try {
      response = await fetch(this.#base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${this.#token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    } catch {
      // Do not automatically repeat a POST after a timeout.
      throw new PublisherError('transport_error');
    }
    let data;
    try { data = await response.json(); }
    catch { throw new PublisherError('invalid_response', response.status); }
    if (!response.ok) {
      const code = /^[a-z_]{1,64}$/.test(data?.code || '') ? data.code : 'request_failed';
      throw new PublisherError(code, response.status);
    }
    return data;
  }

  #key(key) {
    if (typeof key !== 'string' || !/^[a-f0-9-]{36}$/.test(key)) throw new PublisherError('invalid_key');
    return key;
  }

  session() { return this.#request('GET', '/session'); }
  connect() { return this.#request('POST', '/session/start'); }
  channels() { return this.#request('GET', '/channels'); }
  publish(payload) { return this.#request('POST', '/publications', payload); }
  receipt(key) { return this.#request('GET', '/publications/' + this.#key(key)); }
  retire(key) { return this.#request('POST', '/publications/' + this.#key(key) + '/retire'); }
}
