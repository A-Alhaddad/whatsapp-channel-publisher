**English** | [العربية](../ar/INTEGRATION.md) · [Home](../../README.md)

# Integrate a marketing website

Your backend owns users, products, campaigns, content and authorization. The publisher accepts a final caption, one optional image and a channel ID; it has no dependency on your application's database or framework.

## Connection settings

1. Restrict the settings page to authorized administrators. Apply CSRF protection to browser requests.
2. Have a “Connect account” button call your backend, which calls `POST /session/start`.
3. Poll `GET /session` and display the QR only to that administrator. Stop refreshing the QR when the state becomes `ready`.
4. Populate a channel selector from `GET /channels`. Save the selected channel ID in your application's settings.
5. Keep the publisher token in server configuration, never browser code.

## Compose and publish

- Load the product, offer or article from your database and verify permission to publish it.
- Display a caption preview and an image selector. Validate on the backend that the chosen image belongs to the item.
- Format the copy using your own rules: offer title, price, deadline, shipping details and destination link. Your application owns timezone and currency formatting.
- Read the chosen image from trusted storage, check its size and type, then Base64-encode its bytes. Do not build an unrestricted image downloader from arbitrary user-submitted URLs.
- On publish, generate a UUID and persist the exact final payload before sending the POST.
- Poll that UUID's receipt. Show “Published” only after `sent`.

The [sample captions](../../examples/) are fictional content to adapt for your own campaigns. No example program sends a post automatically.

## Suggested application records

| Field | Purpose |
| --- | --- |
| `publication_key` | UUID, protected by a unique constraint |
| `item_id` | Your product, campaign or content record |
| `channel_id` | Destination selected for this attempt |
| `payload_snapshot` | Immutable final payload in private storage |
| `image_id` | Selected image, if any |
| `status` | Your local state and publisher receipt state |
| `message_id` | Confirmed WhatsApp message ID |
| `sent_at` | Confirmed publication timestamp |
| `created_by` | Administrator who requested the post |

Use a transaction or lock to prevent double clicks from creating two unrelated publication keys. Do not rebuild an in-flight attempt from item data that changed after the POST. Keep its original payload and key until its outcome is resolved.

The publisher stores receipts but has no “list all campaign receipts” endpoint. Build publishing history from your own database.

## Intentional reposts

When an item has a previous `sent` receipt, show “This item was published before” and request confirmation. On confirmation, create a new UUID and record while retaining the previous receipt.

Wait for any `pending` attempt. For `unknown`, inspect the actual channel and follow [the retirement/reconciliation flow](API.md). Do not turn a timeout into a new post automatically.

## Client calls

The included Node.js and PHP examples only list channels when run. Both clients expose session, connection, channel, publish, receipt and retirement operations.

```js
const payload = {
  key: savedAttempt.publication_key,
  target: savedAttempt.channel_id,
  text: savedAttempt.text,
  image: savedAttempt.image, // null or { mime, data }
};
const accepted = await publisher.publish(payload);
// "pending" is not a confirmed publication.
const receipt = await publisher.receipt(payload.key);
```

PHP requires no Composer dependencies. Copy the client and adjust its `require` path. Other languages can call the same HTTP endpoints directly. A scheduler or queue, if needed, belongs in your backend and must preserve each attempt's key and payload.
