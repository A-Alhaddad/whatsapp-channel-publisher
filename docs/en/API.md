**English** | [العربية](../ar/API.md) · [Home](../../README.md)

# API reference

Base URL: `http://127.0.0.1:3187`. This is a backend-to-backend API. Every route, including session status, requires:

```http
Authorization: Bearer <PUBLISHER_TOKEN>
Accept: application/json
```

For publication requests, also send `Content-Type: application/json`. Requests carrying an `Origin` header are rejected. Your authenticated backend must mediate requests from an admin dashboard.

## Routes

| Method and path | Purpose | Usual response |
| --- | --- | --- |
| `GET /session` | Read connection state and current QR | `200` |
| `POST /session/start` | Start pairing or reconnect | `202` |
| `GET /channels` | List channels the account can publish to | `200` |
| `POST /publications` | Create a publication attempt, or retrieve an identical existing attempt | `202` or `200` |
| `GET /publications/{key}` | Read one attempt's receipt | `200` or `404` |
| `POST /publications/{key}/retire` | Close an unknown/missing attempt and block a delayed original request | `200` or `409` |

## Session

```json
{"state":"ready","qr":null,"account":"COUNTRY_CODE_AND_PHONE"}
```

Only enable publishing when `state === "ready"`. States include `disconnected`, `starting`, `qr`, `authenticated`, `ready` and `error`. During pairing, `qr` may contain a temporary PNG data URL. Show it only to authorized administrators and never log it. `POST /session/start` starts asynchronous initialization; poll `GET /session` for progress.

## Channels

```json
{"channels":[{"id":"123456789@newsletter","name":"Campaign updates"}]}
```

Empty channels are supported. The account must own the channel or have permission to publish; merely following it is insufficient. A disconnected account returns `409 not_connected`. Channel IDs are not invite links.

## Publication payload

```json
{
  "key": "970a10ae-1c6f-4af8-b987-179656e4c807",
  "target": "123456789@newsletter",
  "text": "New collection\nDiscover the latest products.\nhttps://example.com/collection",
  "image": {
    "mime": "image/jpeg",
    "data": "<BASE64_OF_IMAGE_BYTES>"
  }
}
```

| Field | Constraints |
| --- | --- |
| `key` | New lowercase UUID for each intentional attempt. Persist it before the POST. |
| `target` | Channel ID from discovery: digits followed by `@newsletter`. Groups, contacts and invite URLs are rejected. |
| `text` | Nonblank string, at most 3000 UTF-16 units (`text.length` in JavaScript). Some emoji count as two units. |
| `image` | Optional; omit it or send `null` for text-only posts. One image per post. |
| `image.mime` | `image/jpeg`, `image/png` or `image/webp`. |
| `image.data` | Base64 image bytes, without a `data:` prefix. At most 10 MiB before encoding; the file signature is checked. |

The full JSON request must be at most 15 MiB. Videos and image albums are not supported. If an item has multiple images, your website lets the user choose one and prepares that image. The publisher does not fetch image URLs.

## Receipts

Initial `202` response:

```json
{
  "key": "970a10ae-1c6f-4af8-b987-179656e4c807",
  "target": "123456789@newsletter",
  "hash": "<PAYLOAD_SHA256>",
  "status": "pending",
  "updated_at": "2026-01-01T10:00:00.000Z"
}
```

Poll `GET /publications/{key}`. Confirmed publication changes the status to `sent` and adds `message_id` and `sent_at`. Receipt timestamps are UTC ISO 8601. Timezone formatting inside your marketing copy is your application's responsibility.

| Status | Meaning and action |
| --- | --- |
| `pending` | Processing is in progress. Poll this attempt; do not start a second copy. |
| `sent` | A sending acknowledgement was received. Save the message ID and timestamp. |
| `rejected` | The channel permission check failed before sending. Fix permissions, then the same payload/key can be retried. |
| `unknown` | Delivery is uncertain and the post may already exist. Inspect the actual channel; do not retry automatically. |
| `retired` | The key is closed; future requests with it cannot send. This does not delete an existing post. |

The receipt journal stores the key, destination, payload hash and status, not the caption or image bytes.

## Idempotency and lost responses

- The same key and content return the existing record without sending again, except `rejected`, which permits a new permission check.
- Changing the text, target or image with the same key returns `409 payload_changed`.
- After a timeout or lost HTTP response, read the receipt for **the same key**. Included clients do not automatically retry POST requests.
- `404` alone does not prove that the original upload will never arrive. After checking the channel, `POST /publications/{key}/retire` can close that key before deciding whether a fresh attempt is needed.
- Retirement is allowed only for `unknown`, `retired` or missing records. `pending`, `sent` and `rejected` return `409 attempt_active`.
- Recheck the channel after retiring an uncertain attempt. Retirement cannot undo a post that already reached WhatsApp.
- On service restart, `pending` records become `unknown`; they are never automatically replayed.
- An intentional repost after `sent` needs a new user confirmation, a fresh UUID and a new database record. Keep the previous receipt.

Only one send operation runs at a time per service instance. Other new attempts return `409 busy`; manage queuing in your application.

## Errors

Errors use `{"code":"unauthorized"}`. Match machine-readable codes, not translated messages.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | `unauthorized` | Missing or incorrect token |
| 403 | `origin_forbidden` | Browser Origin header supplied |
| 404 | `not_found` | Unknown route or attempt |
| 409 | `not_connected` | Account is not ready |
| 409 | `busy` | Another send is active |
| 409 | `payload_changed` | Key already used with different content |
| 409 | `attempt_retired` | Attempt key is closed |
| 409 | `attempt_active` | Current state does not permit retirement |
| 415 | `json_required` | Publication content type is not JSON |
| 422 | `invalid_payload` | Invalid fields, image type or size |
| 422 | `channel_not_writable` | Account cannot publish to this channel |
| 400 / 413 | `service_unavailable` | Invalid JSON / request body exceeds the limit |
| 503 | `service_unavailable` | Operation failed; reconcile the receipt before resending |

Clients also report local errors such as `transport_error`, `invalid_response`, `loopback_url_required`, `private_token_required` and `invalid_key`. A transport error during publishing does not prove that delivery failed.
