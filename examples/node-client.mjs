import { PublisherClient } from '../clients/PublisherClient.mjs';

const publisher = new PublisherClient({
  url: process.env.PUBLISHER_URL || 'http://127.0.0.1:3187',
  token: process.env.PUBLISHER_TOKEN,
});

// Read-only example. Pair the service first, using the CLI.
console.log(await publisher.channels());

// In your authenticated backend handler:
// 1. Build { key: UUID, target: selectedChannelId, text: yourCaption,
//            image: { mime: 'image/jpeg', data: base64OfSelectedImage } }.
// 2. Save that immutable payload/key in your database BEFORE sending it.
// 3. const receipt = await publisher.publish(savedPayload);
// 4. Poll publisher.receipt(savedPayload.key) and update the saved status.
// 5. A confirmed, intentional repost gets a NEW key and a new database row.
//    pending/unknown requests must be reconciled first. Never auto-create a new key on error.
