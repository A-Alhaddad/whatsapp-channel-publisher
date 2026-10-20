<?php

declare(strict_types=1);

// PHP 8.1+, ext-curl. Copy this file into your backend; Composer is not required.
namespace WhatsAppChannel;

final class PublisherException extends \RuntimeException
{
    public function __construct(public readonly string $publisherCode, int $httpStatus = 0)
    {
        parent::__construct('WhatsApp publisher: '.$publisherCode, $httpStatus);
    }
}

final class PublisherClient
{
    public function __construct(private string $token, private string $url = 'http://127.0.0.1:3187')
    {
        $parts = parse_url($url);
        if (!$parts || ($parts['scheme'] ?? '') !== 'http'
            || !in_array($parts['host'] ?? '', ['127.0.0.1', 'localhost', '[::1]'], true)
            || !in_array($parts['path'] ?? '', ['', '/'], true)
            || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['query']) || isset($parts['fragment'])) {
            throw new PublisherException('loopback_url_required');
        }
        if (strlen($token) < 32) throw new PublisherException('private_token_required');
        $this->url = rtrim($url, '/');
    }

    private function request(string $method, string $path, ?array $payload = null): array
    {
        $curl = curl_init($this->url.$path);
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer '.$this->token, 'Content-Type: application/json', 'Accept: application/json'],
        ]);
        try {
            if ($payload !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($payload, JSON_THROW_ON_ERROR));
            $body = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            if ($body === false) throw new PublisherException('transport_error');
            try { $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR); }
            catch (\JsonException $e) { throw new PublisherException('invalid_response', $status); }
            if (!is_array($data)) throw new PublisherException('invalid_response', $status);
            if ($status < 200 || $status >= 300) {
                $code = is_string($data['code'] ?? null) && preg_match('/^[a-z_]{1,64}$/', $data['code'])
                    ? $data['code'] : 'request_failed';
                throw new PublisherException($code, $status);
            }
            return $data;
        } finally {
            curl_close($curl);
        }
    }

    private function key(string $key): string
    {
        if (!preg_match('/^[a-f0-9-]{36}$/', $key)) throw new PublisherException('invalid_key');
        return $key;
    }

    public function session(): array { return $this->request('GET', '/session'); }
    public function connect(): array { return $this->request('POST', '/session/start'); }
    public function channels(): array { return $this->request('GET', '/channels'); }
    public function publish(array $payload): array { return $this->request('POST', '/publications', $payload); }
    public function receipt(string $key): array { return $this->request('GET', '/publications/'.$this->key($key)); }
    public function retire(string $key): array { return $this->request('POST', '/publications/'.$this->key($key).'/retire'); }
}
