# WhatsApp Channel Publisher

**English** | [العربية](README.ar.md)

A self-hosted publishing service for marketing websites, online stores and content platforms. Connect a WhatsApp account, discover channels you can manage, and publish text with an optional image from your own backend.

Created by **[Eng. Abd Alkareem Alhaddad](https://github.com/A-Alhaddad)** · [MIT license](LICENSE)

## What you can build

- Publish product launches, offers, articles and campaign updates to your channel.
- Add a “Publish to WhatsApp” button and an image selector to an existing admin dashboard.
- Track publication receipts and prevent accidental duplicates after connection failures.
- Integrate with PHP, Laravel, Node.js, Express or any backend that can call HTTP.

The project provides a private API, CLI, PHP and Node.js clients, documentation, and tests. It does not include a hosted dashboard, campaign scheduler, audience database or direct-message campaigns. It supports **channels**, not groups, communities or individual contacts.

This is an independent project using WhatsApp Web through `whatsapp-web.js`, not the official WhatsApp Cloud API. It is not affiliated with WhatsApp or Meta. WhatsApp Web changes can require maintenance; use an account that works on a phone and has publishing permission for the channel.

## Quick start

Requirements: **Node.js 22.12+**, npm, an installed Chrome/Chromium browser, and a non-root service user. PHP integrations optionally require **PHP 8.1+ with curl**.

```sh
git clone https://github.com/A-Alhaddad/whatsapp-channel-publisher.git
cd whatsapp-channel-publisher
npm ci --ignore-scripts
npm run setup
```

`setup` creates a private `.env` with a fresh random token and a `data/` directory. It never overwrites an existing `.env`. Dependency installation skips browser downloads and installation scripts; configure your installed browser before starting.

Edit `.env`:

```dotenv
PUBLISHER_TOKEN=<keep-the-generated-token>
PUBLISHER_PORT=3187
PUBLISHER_URL=http://127.0.0.1:3187
PUBLISHER_DATA_DIR=./data
CHROME_EXECUTABLE_PATH="/path/to/chrome"
```

Common browser paths, when installed:

- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Linux: `/usr/bin/google-chrome`, or your actual Chromium executable.

Start the service:

```sh
npm start
```

In another terminal in the project directory:

```sh
npm run cli -- connect
npm run cli -- status
npm run cli -- qr
```

When the state is `qr`, the last command saves the current QR to `data/pairing.html`. Open that private file and scan it from **WhatsApp → Linked devices → Link a device**. If it expires, run `qr` again. On a remote server, transfer the file privately to your computer; do not host it publicly.

```sh
npm run cli -- status
npm run cli -- channels
```

Wait for `state: "ready"`, then use a channel ID from the list, such as `123456789@newsletter`. Empty channels are supported. Following a channel alone does not grant permission to publish. Keep `data/` persistent so authentication and receipts survive restarts.

## Publish a marketing update

Start with [an English example](examples/campaign.en.txt) or [an Arabic example](examples/campaign.ar.txt), and edit it for your website. Replace the channel ID with a real ID returned by the service:

```sh
npm run cli -- prepare --channel 123456789@newsletter --text-file examples/campaign.en.txt --image photo.jpg --output data/campaign-001.json
```

`prepare` only creates a local payload with a new UUID. Omit `--image photo.jpg` for a text-only post. It refuses to overwrite an existing payload file. Review the text and image before publishing; keep the payload unchanged after the first request.

The following command sends a **real channel post**:

```sh
npm run cli -- publish --file data/campaign-001.json --confirm
npm run cli -- receipt --key YOUR-PUBLICATION-UUID
```

Replace `YOUR-PUBLICATION-UUID` with the `key` in the prepared file or response. A `pending` response means processing has started; only `sent` confirms publication. A timeout or `unknown` result needs reconciliation using the same key and the actual channel, not an automatic retry with a new UUID. See the [API reference](docs/en/API.md).

## Connect your website

Copy a client from `clients/` into your backend. The publisher stays running as a separate Node process on the same server. Store the same private token in your backend configuration; never expose it to browser JavaScript.

```js
import { PublisherClient } from './clients/PublisherClient.mjs';

const publisher = new PublisherClient({
  token: process.env.PUBLISHER_TOKEN,
  url: process.env.PUBLISHER_URL || 'http://127.0.0.1:3187',
});
const { channels } = await publisher.channels();
```

```php
require 'clients/PublisherClient.php';

$publisher = new \WhatsAppChannel\PublisherClient(
    getenv('PUBLISHER_TOKEN'),
    getenv('PUBLISHER_URL') ?: 'http://127.0.0.1:3187'
);
$channels = $publisher->channels();
```

The PHP client needs no Composer packages and does not load `.env` itself; use your framework's configuration or environment variables. Both example programs only list channels when executed. The [integration guide](docs/en/INTEGRATION.md) explains image selection, authorization, database records, status badges and intentional reposts.

## API at a glance

Every route requires `Authorization: Bearer <PUBLISHER_TOKEN>`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/session` | Connection state and temporary QR |
| POST | `/session/start` | Start pairing/reconnect |
| GET | `/channels` | Discover writable channels |
| POST | `/publications` | Publish or retrieve the same attempt |
| GET | `/publications/{key}` | Read a publication receipt |
| POST | `/publications/{key}/retire` | Close an unresolved/missing attempt |

Text is limited to 3000 UTF-16 units. A post accepts one optional JPEG, PNG or WebP image up to 10 MiB; JSON requests are limited to 15 MiB. Videos and image albums are not implemented. The service listens on `127.0.0.1` and rejects browser `Origin` headers. If your backend is elsewhere, use a private tunnel to loopback instead of exposing the publisher publicly.

## Documentation

| Topic | English | العربية |
| --- | --- | --- |
| Setup and usage | This README | [دليل التشغيل](README.ar.md) |
| API contract and errors | [API](docs/en/API.md) | [مرجع API](docs/ar/API.md) |
| Website integration | [Integration](docs/en/INTEGRATION.md) | [الدمج مع موقعك](docs/ar/INTEGRATION.md) |
| Linux deployment | [Deployment](docs/en/DEPLOYMENT.md) | [النشر على Linux](docs/ar/DEPLOYMENT.md) |

## Development

```sh
npm test
npm run check:package
# Optional PHP client integration test:
PHP_BINARY=/path/to/php npm test
```

Tests use local mock adapters and HTTP servers; they do not connect to WhatsApp or publish real messages. No `.env`, browser installation or QR is required for tests. GitHub Actions runs the suite on Node.js 22 and 24, including the PHP client integration test.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributions and [SECURITY.md](SECURITY.md) for reporting a security issue. The dependency lockfile is committed; use `npm ci` for reproducible installs.

## Author and license

**Eng. Abd Alkareem Alhaddad** — [GitHub](https://github.com/A-Alhaddad).

Project code is available under the [MIT license](LICENSE). Retain the copyright and license notice when redistributing it. Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
