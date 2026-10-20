<?php

require __DIR__.'/../clients/PublisherClient.php';

$publisher = new \WhatsAppChannel\PublisherClient(
    getenv('PUBLISHER_TOKEN') ?: '',
    getenv('PUBLISHER_URL') ?: 'http://127.0.0.1:3187'
);

// Read-only example; PHP does not automatically load .env files.
echo json_encode($publisher->channels(), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE).PHP_EOL;

// Use these methods from authenticated Laravel, Symfony or plain PHP handlers:
// $publisher->connect();                  // starts pairing; does not send a message
// $state = $publisher->session();         // state + temporary QR data URL
// $publisher->publish($savedPayload);     // a real post; persist payload/key before calling
// $publisher->receipt($savedPayload['key']);
//
// The payload is {key: UUID, target: channel ID, text: caption, image: {mime, data}}.
// Omit image for text-only posts. Build it from an image the current user is allowed to use.
// A timeout is not proof of failure: reconcile the existing key; never retry with a new key automatically.
