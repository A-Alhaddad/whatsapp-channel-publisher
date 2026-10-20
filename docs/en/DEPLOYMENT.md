**English** | [العربية](../ar/DEPLOYMENT.md) · [Home](../../README.md)

# Linux deployment

Run this service alongside your backend as a non-root user with Node.js 22.12+ and a working Chrome/Chromium installation. The service binds only to `127.0.0.1`. Do not expose the publisher port publicly.

## systemd layout

The template is [deploy/whatsapp-channel-publisher.service](../../deploy/whatsapp-channel-publisher.service). Prepare these paths before enabling it:

| Setting | Suggested value |
| --- | --- |
| User and group | `whatsapp-publisher` |
| Working directory | `/opt/whatsapp-channel-publisher` |
| Environment file | `/etc/whatsapp-channel-publisher.env` |
| Persistent data | `/var/lib/whatsapp-channel-publisher` |
| Node executable | `/usr/bin/node` — verify and adjust if installed elsewhere |

Install dependencies with `npm ci --ignore-scripts`. Create a fresh private token using `npm run setup`, then place the configuration in the environment file. Set `PUBLISHER_DATA_DIR` to the absolute persistent path and `CHROME_EXECUTABLE_PATH` to the installed browser. The environment file should be readable only by its owner (`600`); the data directory should belong to the service user (`700`).

Install the unit in `/etc/systemd/system/`, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-channel-publisher
sudo systemctl status whatsapp-channel-publisher
```

The template reads `/etc/whatsapp-channel-publisher.env`, whereas `npm run cli` reads `.env` in the current project directory. Run the CLI as the service user with the same configuration, or provide a private `.env` containing those values. Avoid running a second service process against the same data directory.

## Browser and pairing

Install the browser's OS dependencies using your operating system's supported packages. Run it as the non-root service user; do not disable its sandbox to work around a root launch failure. Pair using the CLI instructions in the README. Transfer the generated pairing page privately if the server is remote.

Keep the data directory persistent: it contains authentication and the publication journal. Back it up privately. Deleting the journal loses protection against replaying previously seen publication keys.

## Updates

Before updating, inspect the release changes and your working tree. Stop the service for a controlled update, retain its private data and configuration, install the locked dependencies, run the tests, and restart. Check `/session` from your backend and inspect any unresolved publication receipts. Pending attempts become `unknown` after restart and are not sent again automatically.

For another independent installation, use a separate token, port and data directory. If the application lives on another host, a private tunnel can forward to loopback. Container deployments need their own network and browser setup; this repository does not include a Docker image.
