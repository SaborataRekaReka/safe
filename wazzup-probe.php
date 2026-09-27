<?php

declare(strict_types=1);

const PROBE_VERSION = '1';
const PROBE_SECRET_HASH = 'ec8cf271f91b073812fc23d67c1a0bc0b38651cdc23f2763717b12548a036375';
const STATUS_SECRET_HASH = 'e398676713d5437642d0b59348fcef336f8e52ac4a80b3b6e30b5f9f1c077be0';
const EXPECTED_CHANNEL_ID = '42cc9ad8-943e-4998-812e-009ce0898de5';
const PROBE_EXPIRES_AT = '2026-10-04T00:00:00Z';
const MAX_REQUEST_BYTES = 262144;
const MAX_STATE_BYTES = 1048576;
const MAX_ITEMS_PER_REQUEST = 100;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Robots-Tag: noindex, nofollow, nosnippet');
header('Referrer-Policy: no-referrer');
header('X-Wazzup-Probe-Version: ' . PROBE_VERSION);

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestMethod(): string
{
    return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
}

function providedHookSecret(): string
{
    $headerSecret = $_SERVER['HTTP_X_WAZZUP_PROBE_HOOK_TOKEN'] ?? '';
    if (is_string($headerSecret) && $headerSecret !== '') {
        return trim($headerSecret);
    }

    $querySecret = $_GET['token'] ?? '';
    return is_string($querySecret) ? trim($querySecret) : '';
}

function providedStatusSecret(): string
{
    $headerSecret = $_SERVER['HTTP_X_WAZZUP_PROBE_STATUS_TOKEN'] ?? '';
    return is_string($headerSecret) ? trim($headerSecret) : '';
}

function isAuthorizedHash(string $secret, string $expectedHash): bool
{
    if (preg_match('/\A[a-f0-9]{64}\z/D', $secret) !== 1) {
        return false;
    }

    return hash_equals($expectedHash, hash('sha256', $secret));
}

function isExpired(): bool
{
    $expiresAt = strtotime(PROBE_EXPIRES_AT);
    return $expiresAt !== false && time() >= $expiresAt;
}

function scalarString($value): string
{
    if (!is_string($value) && !is_int($value) && !is_float($value)) {
        return '';
    }

    return trim((string) $value);
}

function enumValue($value, array $allowed): string
{
    $candidate = scalarString($value);
    return in_array($candidate, $allowed, true) ? $candidate : 'other';
}

function isoTimestamp($value): string
{
    $candidate = scalarString($value);
    if ($candidate === '' || strlen($candidate) > 40) {
        return '';
    }

    return preg_match('/\A\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?\z/D', $candidate) === 1
        ? $candidate
        : '';
}

function fingerprint(string $kind, $value, string $secret): string
{
    $normalized = scalarString($value);
    if ($normalized === '') {
        return '';
    }

    return hash_hmac('sha256', $kind . ':' . $normalized, $secret);
}

function identifierShape($value): string
{
    $normalized = scalarString($value);
    $length = strlen($normalized);
    if ($normalized === '') {
        return 'empty:0';
    }

    if (preg_match('/\A\d+\z/D', $normalized) === 1) {
        return 'digits:' . $length;
    }

    if (
        preg_match(
            '/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/Di',
            $normalized
        ) === 1
    ) {
        return 'uuid:' . $length;
    }

    return 'other:' . $length;
}

function stateFilePath(): string
{
    $override = getenv('WAZZUP_PROBE_STATE_FILE');
    if (is_string($override) && trim($override) !== '') {
        return trim($override);
    }

    $preferredDirectory = dirname(__DIR__);
    $directory = is_dir($preferredDirectory) && is_writable($preferredDirectory)
        ? $preferredDirectory
        : sys_get_temp_dir();
    $suffix = substr(hash('sha256', __DIR__), 0, 12);

    return rtrim($directory, DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR
        . '.safe-fin-wazzup-probe-'
        . $suffix
        . '.jsonl';
}

function appendRecord(array $record): bool
{
    $encoded = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) {
        return false;
    }

    $handle = @fopen(stateFilePath(), 'ab');
    if ($handle === false) {
        return false;
    }

    @chmod(stateFilePath(), 0600);

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        return false;
    }

    $stats = fstat($handle);
    if (is_array($stats) && (int) ($stats['size'] ?? 0) > MAX_STATE_BYTES) {
        ftruncate($handle, 0);
    }

    $written = fwrite($handle, $encoded . PHP_EOL);
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return $written !== false;
}

function loadRecords(): array
{
    $path = stateFilePath();
    if (!is_file($path) || !is_readable($path)) {
        return array();
    }

    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return array();
    }

    if (!flock($handle, LOCK_SH)) {
        fclose($handle);
        return array();
    }

    $records = array();
    while (($line = fgets($handle)) !== false) {
        $decoded = json_decode($line, true);
        if (is_array($decoded)) {
            $records[] = $decoded;
            if (count($records) > 200) {
                array_shift($records);
            }
        }
    }

    flock($handle, LOCK_UN);
    fclose($handle);

    return $records;
}

function boolField(array $value, string $key): bool
{
    return isset($value[$key]) && $value[$key] === true;
}

function messageRecord(array $message, string $secret): array
{
    $channelId = scalarString($message['channelId'] ?? '');

    return array(
        'received_at' => gmdate('c'),
        'kind' => 'message',
        'channel_match' => $channelId !== '' && hash_equals(EXPECTED_CHANNEL_ID, $channelId),
        'channel_fp' => fingerprint('channel', $channelId, $secret),
        'message_fp' => fingerprint('message', $message['messageId'] ?? '', $secret),
        'chat_fp' => fingerprint('chat', $message['chatId'] ?? '', $secret),
        'chat_id_shape' => identifierShape($message['chatId'] ?? ''),
        'chat_type' => enumValue(
            $message['chatType'] ?? '',
            array('telegram', 'telegroup', 'whatsapp', 'whatsgroup', 'viber', 'instagram')
        ),
        'message_type' => enumValue(
            $message['type'] ?? '',
            array('text', 'image', 'audio', 'video', 'document', 'vcard', 'geo', 'wapi_template', 'unsupported', 'missing_call', 'unknown')
        ),
        'status' => enumValue(
            $message['status'] ?? '',
            array('inbound', 'sent', 'delivered', 'read', 'error', 'edited')
        ),
        'message_time' => isoTimestamp($message['dateTime'] ?? ''),
        'is_echo' => boolField($message, 'isEcho'),
        'sent_from_app' => boolField($message, 'sentFromApp'),
        'is_edited' => boolField($message, 'isEdited'),
        'is_deleted' => boolField($message, 'isDeleted'),
        'has_text' => scalarString($message['text'] ?? '') !== '',
        'has_content' => scalarString($message['contentUri'] ?? '') !== ''
    );
}

function statusRecord(array $status, string $secret): array
{
    return array(
        'received_at' => gmdate('c'),
        'kind' => 'status',
        'message_fp' => fingerprint('message', $status['messageId'] ?? '', $secret),
        'status' => enumValue(
            $status['status'] ?? '',
            array('sent', 'delivered', 'read', 'error', 'edited')
        ),
        'message_time' => isoTimestamp($status['timestamp'] ?? ''),
        'has_error' => isset($status['error']) && is_array($status['error'])
    );
}

function publicRecord(array $record): array
{
    foreach (array('channel_fp', 'message_fp', 'chat_fp') as $key) {
        if (isset($record[$key]) && is_string($record[$key]) && $record[$key] !== '') {
            $record[$key] = substr($record[$key], 0, 16);
        }
    }

    return $record;
}

function statusResponse(): void
{
    $records = loadRecords();
    $counts = array('test' => 0, 'message' => 0, 'status' => 0, 'unknown' => 0);

    foreach ($records as $record) {
        $kind = scalarString($record['kind'] ?? '');
        if (array_key_exists($kind, $counts)) {
            $counts[$kind]++;
        }
    }

    $chatCandidate = scalarString($_SERVER['HTTP_X_WAZZUP_PROBE_CHAT_ID'] ?? '');
    $hmacSecret = scalarString($_SERVER['HTTP_X_WAZZUP_PROBE_HMAC_TOKEN'] ?? '');
    $chatMatch = null;
    if (
        $chatCandidate !== ''
        && isAuthorizedHash($hmacSecret, PROBE_SECRET_HASH)
    ) {
        $candidateFingerprint = fingerprint('chat', $chatCandidate, $hmacSecret);
        $chatMatch = false;
        foreach ($records as $record) {
            if (
                isset($record['chat_fp'])
                && is_string($record['chat_fp'])
                && hash_equals($record['chat_fp'], $candidateFingerprint)
            ) {
                $chatMatch = true;
                break;
            }
        }
    }

    $latest = array_slice($records, -10);
    $latest = array_reverse(array_map('publicRecord', $latest));

    respond(200, array(
        'ok' => true,
        'version' => PROBE_VERSION,
        'expired' => isExpired(),
        'expires_at' => PROBE_EXPIRES_AT,
        'records' => count($records),
        'counts' => $counts,
        'chat_candidate_match' => $chatMatch,
        'latest' => $latest
    ));
}

$method = requestMethod();

if ($method === 'GET') {
    if (!isAuthorizedHash(providedStatusSecret(), STATUS_SECRET_HASH)) {
        respond(404, array('ok' => false));
    }

    statusResponse();
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, array('ok' => false, 'error' => 'method_not_allowed'));
}

if (!isAuthorizedHash(providedHookSecret(), PROBE_SECRET_HASH)) {
    respond(404, array('ok' => false));
}

if (isExpired()) {
    respond(200, array('ok' => true, 'expired' => true, 'stored' => 0));
}

$secret = providedHookSecret();
$contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($contentLength < 0 || $contentLength > MAX_REQUEST_BYTES) {
    respond(413, array('ok' => false, 'error' => 'payload_too_large'));
}

$rawBody = file_get_contents('php://input', false, null, 0, MAX_REQUEST_BYTES + 1);
if (!is_string($rawBody) || strlen($rawBody) > MAX_REQUEST_BYTES) {
    respond(413, array('ok' => false, 'error' => 'payload_too_large'));
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    respond(400, array('ok' => false, 'error' => 'invalid_json'));
}

$stored = 0;
$ignored = 0;
$storageOk = true;

if (isset($payload['test']) && $payload['test'] === true) {
    $storageOk = appendRecord(array(
        'received_at' => gmdate('c'),
        'kind' => 'test'
    ));
    $stored = $storageOk ? 1 : 0;
}

if (isset($payload['messages']) && is_array($payload['messages'])) {
    foreach (array_slice($payload['messages'], 0, MAX_ITEMS_PER_REQUEST) as $message) {
        if (!is_array($message)) {
            continue;
        }

        if (!hash_equals(EXPECTED_CHANNEL_ID, scalarString($message['channelId'] ?? ''))) {
            $ignored++;
            continue;
        }

        $saved = appendRecord(messageRecord($message, $secret));
        $storageOk = $storageOk && $saved;
        $stored += $saved ? 1 : 0;
    }
}

if (isset($payload['statuses']) && is_array($payload['statuses'])) {
    $ignored += min(count($payload['statuses']), MAX_ITEMS_PER_REQUEST);
}

if (
    $stored === 0
    && !isset($payload['test'])
    && !isset($payload['messages'])
    && !isset($payload['statuses'])
) {
    $storageOk = appendRecord(array(
        'received_at' => gmdate('c'),
        'kind' => 'unknown',
        'has_messages' => isset($payload['messages']),
        'has_statuses' => isset($payload['statuses'])
    ));
    $stored = $storageOk ? 1 : 0;
}

if (!$storageOk) {
    respond(500, array('ok' => false, 'error' => 'storage_unavailable'));
}

respond(200, array('ok' => true, 'stored' => $stored, 'ignored' => $ignored));
