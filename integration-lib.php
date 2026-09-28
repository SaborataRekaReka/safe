<?php

declare(strict_types=1);

/*
 * Shared, dependency-free helpers for SAFE referral attribution.
 *
 * Runtime data lives in integration-data/ and is always accessed while holding
 * a separate lock file. The directory is denied by its own .htaccess file.
 */

function safe_json_encode(array $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    return is_string($json) ? $json : '{"ok":false,"error":"json_encode_failed"}';
}

function safe_json_response(int $statusCode, array $payload): void
{
    $body = safe_json_encode($payload);
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

function safe_finish_http_response(array $payload): void
{
    $body = safe_json_encode($payload);
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('Content-Length: ' . strlen($body));
    header('Connection: close');
    echo $body;

    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
        return;
    }

    while (ob_get_level() > 0) {
        @ob_end_flush();
    }
    @flush();
}

function safe_string_length(string $value): int
{
    return function_exists('mb_strlen') ? (int) mb_strlen($value, 'UTF-8') : strlen($value);
}

function safe_lower(string $value): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function safe_upper(string $value): string
{
    return function_exists('mb_strtoupper') ? mb_strtoupper($value, 'UTF-8') : strtoupper($value);
}

function safe_bool($value): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value) || is_float($value)) {
        return ((int) $value) !== 0;
    }

    if (is_string($value)) {
        return in_array(strtolower(trim($value)), array('1', 'true', 'yes', 'on'), true);
    }

    return false;
}

function safe_integration_config(): array
{
    static $config = null;

    if (is_array($config)) {
        return $config;
    }

    $defaults = array(
        // Must be configured outside the public document root.
        'data_dir' => '',
        'referral_ttl_seconds' => 72 * 60 * 60,
        'rate_limit_window_seconds' => 60,
        'rate_limit_max_requests' => 30,
        'telegram_operator_username' => 'Danil_Berdykin',
        'allowed_origins' => array(),
        'wazzup_webhook_secret' => '',
        'wazzup_channel_id' => '42cc9ad8-943e-4998-812e-009ce0898de5',
        'bitrix_webhook_url' => '',
        'bitrix_deal_category_id' => 1,
        'bitrix_contact_telegram_field' => 'UF_CRM_TELEGRAMID_WZ',
        'bitrix_deal_source_prefixes' => array('1|WZ_', 'WZ'),
        'bitrix_deal_created_grace_seconds' => 15 * 60,
        'bitrix_timeout_seconds' => 3,
        'bitrix_deal_fields' => array(
            'ref_id' => 'UF_CRM_SAFE_REF_ID',
            'click_id' => 'UF_CRM_SAFE_CLICK_ID',
            'code' => 'UF_CRM_SAFE_REQUEST_CODE',
            'page_url' => 'UF_CRM_SAFE_LANDING_URL'
        ),
        'bitrix_contact_fields' => array(),
        'queue_max_attempts' => 12,
        'queue_lease_seconds' => 45,
        'inline_retry_delays_seconds' => array(0, 1, 2, 4, 7),
        'drain_batch_size' => 10
    );

    $secretFile = __DIR__ . DIRECTORY_SEPARATOR . '.lead-secrets.php';
    $secrets = array();
    if (is_file($secretFile)) {
        $loaded = require $secretFile;
        if (is_array($loaded)) {
            $secrets = $loaded;
        }
    }

    $nested = isset($secrets['safe_referral_integration']) && is_array($secrets['safe_referral_integration'])
        ? $secrets['safe_referral_integration']
        : array();

    foreach ($defaults as $key => $defaultValue) {
        if (array_key_exists($key, $nested)) {
            $defaults[$key] = $nested[$key];
        } elseif (array_key_exists($key, $secrets)) {
            // Flat keys keep deployment configuration simple and remain backwards compatible.
            $defaults[$key] = $secrets[$key];
        }
    }

    $defaults['referral_ttl_seconds'] = max(300, (int) $defaults['referral_ttl_seconds']);
    $defaults['rate_limit_window_seconds'] = max(10, (int) $defaults['rate_limit_window_seconds']);
    $defaults['rate_limit_max_requests'] = max(1, (int) $defaults['rate_limit_max_requests']);
    $defaults['bitrix_deal_category_id'] = (int) $defaults['bitrix_deal_category_id'];
    $defaults['bitrix_deal_created_grace_seconds'] = max(0, (int) $defaults['bitrix_deal_created_grace_seconds']);
    $defaults['bitrix_timeout_seconds'] = max(2, min(15, (int) $defaults['bitrix_timeout_seconds']));
    $defaults['queue_max_attempts'] = max(1, (int) $defaults['queue_max_attempts']);
    $defaults['queue_lease_seconds'] = max(10, (int) $defaults['queue_lease_seconds']);
    $defaults['drain_batch_size'] = max(1, min(50, (int) $defaults['drain_batch_size']));

    if (!is_array($defaults['allowed_origins'])) {
        $defaults['allowed_origins'] = array();
    }
    if (!is_array($defaults['bitrix_deal_source_prefixes'])) {
        $defaults['bitrix_deal_source_prefixes'] = array((string) $defaults['bitrix_deal_source_prefixes']);
    }
    if (!is_array($defaults['bitrix_deal_fields'])) {
        $defaults['bitrix_deal_fields'] = array();
    }
    if (!is_array($defaults['bitrix_contact_fields'])) {
        $defaults['bitrix_contact_fields'] = array();
    }
    if (!is_array($defaults['inline_retry_delays_seconds'])) {
        $defaults['inline_retry_delays_seconds'] = array(0, 1, 2, 4, 7);
    }

    $config = $defaults;

    return $config;
}

function safe_clean_host(string $host): string
{
    $host = safe_lower(trim($host));
    if ($host === '') {
        return '';
    }

    if ($host[0] === '[') {
        $closing = strpos($host, ']');
        return $closing === false ? '' : substr($host, 0, $closing + 1);
    }

    return preg_replace('/:\d+$/', '', $host) ?: '';
}

function safe_origin_is_allowed(string $origin, array $config): bool
{
    $originParts = parse_url($origin);
    if (!is_array($originParts) || empty($originParts['host']) || empty($originParts['scheme'])) {
        return false;
    }

    $scheme = safe_lower((string) $originParts['scheme']);
    if ($scheme !== 'https' && $scheme !== 'http') {
        return false;
    }

    $normalizedOrigin = $scheme . '://' . safe_lower((string) $originParts['host']);
    if (isset($originParts['port'])) {
        $normalizedOrigin .= ':' . (int) $originParts['port'];
    }

    foreach ($config['allowed_origins'] as $allowedOrigin) {
        if (!is_string($allowedOrigin)) {
            continue;
        }
        if (rtrim(safe_lower(trim($allowedOrigin)), '/') === rtrim($normalizedOrigin, '/')) {
            return true;
        }
    }

    $requestHost = safe_clean_host(isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '');

    return $requestHost !== '' && safe_clean_host((string) $originParts['host']) === $requestHost;
}

function safe_assert_same_origin_json_request(array $config): ?string
{
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? safe_lower((string) $_SERVER['CONTENT_TYPE']) : '';
    if (strpos($contentType, 'application/json') !== 0) {
        return 'content_type_must_be_application_json';
    }

    $fetchSite = isset($_SERVER['HTTP_SEC_FETCH_SITE']) ? safe_lower(trim((string) $_SERVER['HTTP_SEC_FETCH_SITE'])) : '';
    if ($fetchSite === 'cross-site') {
        return 'cross_origin_request_denied';
    }

    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string) $_SERVER['HTTP_ORIGIN']) : '';
    if ($origin !== '' && !safe_origin_is_allowed($origin, $config)) {
        return 'origin_not_allowed';
    }

    return null;
}

function safe_validate_identifier($value, int $maxLength, bool $required): array
{
    if (!is_string($value) && !is_int($value)) {
        return array(false, '', $required ? 'required' : 'invalid_type');
    }

    $normalized = trim((string) $value);
    if ($normalized === '') {
        return array(!$required, '', $required ? 'required' : '');
    }

    if (safe_string_length($normalized) > $maxLength) {
        return array(false, '', 'too_long');
    }

    if (preg_match('/[\x00-\x1F\x7F]/u', $normalized) === 1) {
        return array(false, '', 'contains_control_characters');
    }

    return array(true, $normalized, '');
}

function safe_validate_page_url($value, array $config): array
{
    if ($value === null || $value === '') {
        return array(true, '', '');
    }
    if (!is_string($value)) {
        return array(false, '', 'invalid_type');
    }

    $url = trim($value);
    if ($url === '' || strlen($url) > 2048 || filter_var($url, FILTER_VALIDATE_URL) === false) {
        return array(false, '', 'invalid_url');
    }

    $parts = parse_url($url);
    $scheme = is_array($parts) && isset($parts['scheme']) ? safe_lower((string) $parts['scheme']) : '';
    if (!is_array($parts) || empty($parts['host']) || ($scheme !== 'https' && $scheme !== 'http')) {
        return array(false, '', 'invalid_url');
    }

    $origin = $scheme . '://' . safe_lower((string) $parts['host']);
    if (isset($parts['port'])) {
        $origin .= ':' . (int) $parts['port'];
    }
    if (!safe_origin_is_allowed($origin, $config)) {
        return array(false, '', 'page_url_origin_not_allowed');
    }

    return array(true, $url, '');
}

function safe_default_state(): array
{
    return array(
        'version' => 1,
        'records' => array(),
        'messages' => array(),
        'queue' => array(),
        'rate_limits' => array()
    );
}

function safe_prepare_data_directory(array $config): string
{
    $directory = rtrim((string) $config['data_dir'], '/\\');
    if ($directory === '') {
        throw new RuntimeException('integration_data_directory_not_configured');
    }

    if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('integration_data_directory_unavailable');
    }
    @chmod($directory, 0700);

    return $directory;
}

function safe_normalize_state($decoded): array
{
    $state = is_array($decoded) ? $decoded : safe_default_state();
    foreach (array('records', 'messages', 'queue', 'rate_limits') as $key) {
        if (!isset($state[$key]) || !is_array($state[$key])) {
            $state[$key] = array();
        }
    }
    $state['version'] = 1;

    return $state;
}

function safe_cleanup_state(array &$state, int $now, array $config): void
{
    foreach ($state['rate_limits'] as $key => $timestamps) {
        if (!is_array($timestamps)) {
            unset($state['rate_limits'][$key]);
            continue;
        }
        $timestamps = array_values(array_filter($timestamps, static function ($timestamp) use ($now, $config): bool {
            return is_int($timestamp) && $timestamp > $now - (int) $config['rate_limit_window_seconds'];
        }));
        if ($timestamps) {
            $state['rate_limits'][$key] = $timestamps;
        } else {
            unset($state['rate_limits'][$key]);
        }
    }

    foreach ($state['records'] as $code => $record) {
        $expiresAt = is_array($record) && isset($record['expires_at']) ? (int) $record['expires_at'] : 0;
        $attributedAt = is_array($record) && isset($record['attributed_at']) ? (int) $record['attributed_at'] : 0;
        $retentionEnd = $attributedAt > 0 ? $attributedAt + 30 * 86400 : $expiresAt + 86400;
        if ($retentionEnd > 0 && $retentionEnd < $now) {
            unset($state['records'][$code]);
        }
    }

    foreach ($state['messages'] as $key => $message) {
        $updatedAt = is_array($message) && isset($message['updated_at']) ? (int) $message['updated_at'] : 0;
        if ($updatedAt > 0 && $updatedAt < $now - 7 * 86400) {
            unset($state['messages'][$key], $state['queue'][$key]);
        }
    }
}

function safe_atomic_write(string $path, string $contents): void
{
    $directory = dirname($path);
    $temporary = tempnam($directory, 'state-');
    if (!is_string($temporary)) {
        throw new RuntimeException('integration_state_tempfile_failed');
    }

    $written = @file_put_contents($temporary, $contents, LOCK_EX);
    if ($written !== strlen($contents)) {
        @unlink($temporary);
        throw new RuntimeException('integration_state_write_failed');
    }
    @chmod($temporary, 0600);

    if (!@rename($temporary, $path)) {
        // rename() replaces atomically on the production Linux host. This fallback
        // keeps local Windows/PHP development usable without changing the format.
        $written = @file_put_contents($path, $contents, LOCK_EX);
        @unlink($temporary);
        if ($written !== strlen($contents)) {
            throw new RuntimeException('integration_state_replace_failed');
        }
    }
    @chmod($path, 0600);
}

function safe_state_transaction(callable $callback)
{
    $config = safe_integration_config();
    $directory = safe_prepare_data_directory($config);
    $lockPath = $directory . DIRECTORY_SEPARATOR . 'state.lock';
    $statePath = $directory . DIRECTORY_SEPARATOR . 'state.json';
    $lock = @fopen($lockPath, 'c+');
    if ($lock === false) {
        throw new RuntimeException('integration_state_lock_unavailable');
    }
    @chmod($lockPath, 0600);

    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        throw new RuntimeException('integration_state_lock_failed');
    }

    try {
        $decoded = null;
        if (is_file($statePath)) {
            $raw = @file_get_contents($statePath);
            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                if (!is_array($decoded)) {
                    // Never replace a damaged state file with an empty one: that
                    // could erase an attribution mapping and enable a wrong match.
                    throw new RuntimeException('integration_state_corrupt');
                }
            }
        }
        $state = safe_normalize_state($decoded);
        safe_cleanup_state($state, time(), $config);
        $result = $callback($state);
        $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            throw new RuntimeException('integration_state_encode_failed');
        }
        safe_atomic_write($statePath, $json);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }

    return $result;
}

function safe_log_event(string $event, array $context = array()): void
{
    try {
        $config = safe_integration_config();
        $directory = safe_prepare_data_directory($config);
        $entry = array_merge(array('time' => gmdate('c'), 'event' => $event), $context);
        $line = safe_json_encode($entry) . "\n";
        @file_put_contents($directory . DIRECTORY_SEPARATOR . 'events.ndjson', $line, FILE_APPEND | LOCK_EX);
        @chmod($directory . DIRECTORY_SEPARATOR . 'events.ndjson', 0600);
    } catch (Throwable $ignored) {
        // Logging must never change attribution behavior or a webhook response.
    }
}

function safe_client_rate_key(): string
{
    $address = isset($_SERVER['REMOTE_ADDR']) ? trim((string) $_SERVER['REMOTE_ADDR']) : 'unknown';

    return hash('sha256', $address);
}

function safe_generate_referral_code(array $existingRecords): string
{
    $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    $lastIndex = strlen($alphabet) - 1;

    for ($attempt = 0; $attempt < 30; $attempt++) {
        $code = '';
        $hasLetter = false;
        $hasDigit = false;
        for ($i = 0; $i < 6; $i++) {
            $character = $alphabet[random_int(0, $lastIndex)];
            $code .= $character;
            $hasDigit = $hasDigit || preg_match('/[2-9]/', $character) === 1;
            $hasLetter = $hasLetter || preg_match('/[A-Z]/', $character) === 1;
        }
        if ($hasLetter && $hasDigit && !isset($existingRecords[$code])) {
            return $code;
        }
    }

    throw new RuntimeException('referral_code_generation_failed');
}

function safe_create_referral_record(string $refId, string $clickId, string $pageUrl, array $config): array
{
    $now = time();
    $rateKey = safe_client_rate_key();

    return safe_state_transaction(static function (array &$state) use ($refId, $clickId, $pageUrl, $config, $now, $rateKey): array {
        $timestamps = isset($state['rate_limits'][$rateKey]) && is_array($state['rate_limits'][$rateKey])
            ? $state['rate_limits'][$rateKey]
            : array();
        if (count($timestamps) >= (int) $config['rate_limit_max_requests']) {
            return array('ok' => false, 'error' => 'rate_limit_exceeded');
        }
        $timestamps[] = $now;
        $state['rate_limits'][$rateKey] = $timestamps;

        $code = safe_generate_referral_code($state['records']);
        $record = array(
            'code' => $code,
            'ref_id' => $refId,
            'click_id' => $clickId,
            'page_url' => $pageUrl,
            'created_at' => $now,
            'expires_at' => $now + (int) $config['referral_ttl_seconds'],
            'status' => 'pending'
        );
        $state['records'][$code] = $record;

        return array('ok' => true, 'record' => $record);
    });
}

function safe_build_telegram_handoff(array $record, array $config): array
{
    $username = ltrim(trim((string) $config['telegram_operator_username']), '@');
    if (preg_match('/^[A-Za-z0-9_]{5,32}$/', $username) !== 1) {
        throw new RuntimeException('telegram_operator_username_invalid');
    }

    $message = 'Здравствуйте! Хочу обменять средства. Обращение ' . $record['code'];

    return array(
        'message' => $message,
        'telegram_url' => 'https://t.me/' . rawurlencode($username) . '?text=' . rawurlencode($message)
    );
}

function safe_extract_referral_candidates(string $text): array
{
    $candidates = array();
    $codeClass = 'A-HJKMNP-Z2-9';
    $patterns = array(
        '/(?:ОБРАЩЕНИ(?:Е|Я)|КОД|REQUEST|CODE)\s*[:#№\-]?\s*([' . $codeClass . ']{5,8})(?![A-Z0-9])/iu',
        '/(?<![A-Z0-9])SAFE[\-\s]?([' . $codeClass . ']{5,8})(?![A-Z0-9])/i',
        '/(?<![A-Z0-9])([' . $codeClass . ']{5,8})(?![A-Z0-9])/i'
    );

    foreach ($patterns as $pattern) {
        $matches = array();
        if (preg_match_all($pattern, $text, $matches) !== false && isset($matches[1])) {
            foreach ($matches[1] as $candidate) {
                $candidate = safe_upper((string) $candidate);
                if (preg_match('/[A-Z]/', $candidate) !== 1 || preg_match('/[2-9]/', $candidate) !== 1) {
                    continue;
                }
                $candidates[$candidate] = true;
            }
        }
    }

    return array_keys($candidates);
}

function safe_message_key(string $channelId, string $messageId, string $chatId, string $text, int $messageAt): string
{
    $identity = $messageId !== ''
        ? $channelId . "\n" . $messageId
        : $channelId . "\n" . $chatId . "\n" . $messageAt . "\n" . $text;

    return hash('sha256', $identity);
}

function safe_wazzup_message_time($value): int
{
    if (is_int($value) || is_float($value) || (is_string($value) && preg_match('/^\d+(?:\.\d+)?$/', $value) === 1)) {
        $number = (float) $value;
        if ($number > 20000000000) {
            $number /= 1000;
        }
        $timestamp = (int) $number;
        return $timestamp > 0 ? $timestamp : time();
    }

    if (is_string($value) && trim($value) !== '') {
        $timestamp = strtotime($value);
        if ($timestamp !== false) {
            return $timestamp;
        }
    }

    return time();
}

function safe_prepare_wazzup_message(array $message, array $config): array
{
    $channelId = isset($message['channelId']) ? trim((string) $message['channelId']) : '';
    if ($channelId === '' || !hash_equals((string) $config['wazzup_channel_id'], $channelId)) {
        return array('accepted' => false, 'reason' => 'different_channel');
    }

    $status = isset($message['status']) ? safe_lower(trim((string) $message['status'])) : '';
    if ($status !== 'inbound') {
        return array('accepted' => false, 'reason' => 'non_inbound_message');
    }
    if (safe_bool(isset($message['isEcho']) ? $message['isEcho'] : false)) {
        return array('accepted' => false, 'reason' => 'outbound_message');
    }
    if (safe_bool(isset($message['isEdited']) ? $message['isEdited'] : false)) {
        return array('accepted' => false, 'reason' => 'edited_message');
    }
    if (safe_bool(isset($message['isDeleted']) ? $message['isDeleted'] : false)) {
        return array('accepted' => false, 'reason' => 'deleted_message');
    }

    $type = isset($message['type']) ? safe_lower(trim((string) $message['type'])) : 'text';
    if ($type !== '' && $type !== 'text') {
        return array('accepted' => false, 'reason' => 'non_text_message');
    }

    $chatId = isset($message['chatId']) ? trim((string) $message['chatId']) : '';
    $text = isset($message['text']) && is_string($message['text']) ? trim($message['text']) : '';
    if ($chatId === '' || $text === '') {
        return array('accepted' => false, 'reason' => 'missing_chat_or_text');
    }
    if (strlen($chatId) > 200 || strlen($text) > 10000) {
        return array('accepted' => false, 'reason' => 'message_too_large');
    }

    $messageId = isset($message['messageId']) ? trim((string) $message['messageId']) : '';
    $messageAt = safe_wazzup_message_time(isset($message['dateTime']) ? $message['dateTime'] : null);
    $messageKey = safe_message_key($channelId, $messageId, $chatId, $text, $messageAt);
    $candidates = safe_extract_referral_candidates($text);
    $now = time();

    $prepared = safe_state_transaction(static function (array &$state) use (
        $messageKey,
        $messageId,
        $channelId,
        $chatId,
        $messageAt,
        $candidates,
        $now
    ): array {
        if (isset($state['messages'][$messageKey]) && is_array($state['messages'][$messageKey])) {
            $knownStatus = isset($state['messages'][$messageKey]['status'])
                ? (string) $state['messages'][$messageKey]['status']
                : '';
            return array(
                'accepted' => $knownStatus === 'queued',
                'message_key' => $messageKey,
                'duplicate' => true,
                'status' => $knownStatus
            );
        }

        $baseMessage = array(
            'received_at' => $now,
            'updated_at' => $now,
            'message_id_hash' => hash('sha256', $messageId),
            'chat_id_hash' => hash('sha256', $chatId)
        );

        if (!$candidates) {
            $state['messages'][$messageKey] = array_merge($baseMessage, array(
                'status' => 'ignored',
                'reason' => 'no_referral_code'
            ));
            return array('accepted' => false, 'reason' => 'no_referral_code', 'message_key' => $messageKey);
        }

        $activeCodes = array();
        $expiredCodes = array();
        foreach ($candidates as $candidate) {
            if (!isset($state['records'][$candidate]) || !is_array($state['records'][$candidate])) {
                continue;
            }
            if ((int) $state['records'][$candidate]['expires_at'] < $now) {
                $expiredCodes[] = $candidate;
            } else {
                $activeCodes[] = $candidate;
            }
        }

        if (count($activeCodes) !== 1) {
            $reason = count($activeCodes) > 1
                ? 'ambiguous_referral_code'
                : ($expiredCodes ? 'expired_referral_code' : 'unknown_referral_code');
            $state['messages'][$messageKey] = array_merge($baseMessage, array(
                'status' => 'ignored',
                'reason' => $reason
            ));
            return array('accepted' => false, 'reason' => $reason, 'message_key' => $messageKey);
        }

        $code = $activeCodes[0];
        $record = &$state['records'][$code];
        $claimedChatId = isset($record['claimed_chat_id']) ? (string) $record['claimed_chat_id'] : '';
        if ($claimedChatId !== '' && !hash_equals($claimedChatId, $chatId)) {
            $state['messages'][$messageKey] = array_merge($baseMessage, array(
                'status' => 'ignored',
                'reason' => 'referral_code_claimed_by_another_chat'
            ));
            return array('accepted' => false, 'reason' => 'referral_code_claimed_by_another_chat', 'message_key' => $messageKey);
        }

        if (isset($record['status']) && $record['status'] === 'attributed') {
            $state['messages'][$messageKey] = array_merge($baseMessage, array(
                'status' => 'succeeded',
                'reason' => 'already_attributed',
                'code' => $code,
                'deal_id' => isset($record['deal_id']) ? (string) $record['deal_id'] : ''
            ));
            return array('accepted' => false, 'reason' => 'already_attributed', 'message_key' => $messageKey);
        }

        foreach ($state['queue'] as $queuedEvent) {
            if (is_array($queuedEvent) && isset($queuedEvent['code']) && hash_equals($code, (string) $queuedEvent['code'])) {
                $state['messages'][$messageKey] = array_merge($baseMessage, array(
                    'status' => 'ignored',
                    'reason' => 'referral_code_already_queued',
                    'code' => $code
                ));
                return array(
                    'accepted' => false,
                    'reason' => 'referral_code_already_queued',
                    'message_key' => $messageKey
                );
            }
        }

        $record['claimed_chat_id'] = $chatId;
        $record['claimed_at'] = $now;
        $record['status'] = 'claimed';
        $event = array(
            'message_key' => $messageKey,
            'channel_id' => $channelId,
            'chat_id' => $chatId,
            'code' => $code,
            'message_at' => $messageAt,
            'received_at' => $now,
            'attempts' => 0,
            'next_attempt_at' => $now,
            'lease_until' => 0,
            'last_error' => ''
        );
        $state['queue'][$messageKey] = $event;
        $state['messages'][$messageKey] = array_merge($baseMessage, array(
            'status' => 'queued',
            'reason' => '',
            'code' => $code
        ));

        return array('accepted' => true, 'message_key' => $messageKey, 'duplicate' => false, 'status' => 'queued');
    });

    if (empty($prepared['accepted']) && empty($prepared['duplicate'])) {
        safe_log_event('wazzup_message_unmatched', array(
            'message_key' => $messageKey,
            'reason' => isset($prepared['reason']) ? $prepared['reason'] : 'ignored',
            'chat_id_hash' => hash('sha256', $chatId)
        ));
    }

    return $prepared;
}

function safe_webhook_is_authorized(array $config): bool
{
    $expected = trim((string) $config['wazzup_webhook_secret']);
    if ($expected === '') {
        return false;
    }

    $provided = isset($_GET['secret']) ? (string) $_GET['secret'] : '';
    if ($provided === '' && isset($_SERVER['HTTP_X_SAFE_WEBHOOK_SECRET'])) {
        $provided = (string) $_SERVER['HTTP_X_SAFE_WEBHOOK_SECRET'];
    }

    return $provided !== '' && hash_equals($expected, $provided);
}

function safe_http_post_form(string $url, array $parameters, int $timeoutSeconds): array
{
    $encoded = http_build_query($parameters, '', '&', PHP_QUERY_RFC3986);
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        if ($handle === false) {
            return array('ok' => false, 'error' => 'curl_init_failed');
        }
        curl_setopt_array($handle, array(
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => min(3, $timeoutSeconds),
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_HTTPHEADER => array('Content-Type: application/x-www-form-urlencoded; charset=UTF-8'),
            CURLOPT_POSTFIELDS => $encoded
        ));
        $body = curl_exec($handle);
        $curlError = curl_errno($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        if (!is_string($body)) {
            return array('ok' => false, 'error' => 'transport_error_' . $curlError, 'status' => $status);
        }
    } else {
        $context = stream_context_create(array('http' => array(
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded; charset=UTF-8\r\n",
            'content' => $encoded,
            'timeout' => $timeoutSeconds,
            'ignore_errors' => true
        )));
        $body = @file_get_contents($url, false, $context);
        if (!is_string($body)) {
            return array('ok' => false, 'error' => 'transport_error', 'status' => 0);
        }
        $status = 0;
        $headers = isset($http_response_header) && is_array($http_response_header) ? $http_response_header : array();
        if (isset($headers[0]) && preg_match('/\s(\d{3})(?:\s|$)/', $headers[0], $match) === 1) {
            $status = (int) $match[1];
        }
    }

    $decoded = json_decode($body, true);
    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        return array('ok' => false, 'error' => 'invalid_http_response', 'status' => $status);
    }

    return array('ok' => true, 'status' => $status, 'body' => $decoded);
}

function safe_bitrix_call(string $method, array $parameters, array $config): array
{
    $baseUrl = rtrim(trim((string) $config['bitrix_webhook_url']), '/') . '/';
    if ($baseUrl === '/' || filter_var($baseUrl, FILTER_VALIDATE_URL) === false || strpos($baseUrl, 'https://') !== 0) {
        return array('ok' => false, 'error' => 'bitrix_webhook_not_configured');
    }
    if (preg_match('/^[a-z0-9.]+$/i', $method) !== 1) {
        return array('ok' => false, 'error' => 'bitrix_method_invalid');
    }

    $response = safe_http_post_form($baseUrl . $method . '.json', $parameters, (int) $config['bitrix_timeout_seconds']);
    if (empty($response['ok'])) {
        return $response;
    }

    $body = $response['body'];
    if (isset($body['error'])) {
        return array(
            'ok' => false,
            'error' => 'bitrix_' . preg_replace('/[^a-z0-9_\-]/i', '', (string) $body['error']),
            'status' => isset($response['status']) ? (int) $response['status'] : 0
        );
    }

    return array('ok' => true, 'result' => isset($body['result']) ? $body['result'] : null);
}

function safe_find_bitrix_contact(string $chatId, array $config): array
{
    $telegramField = trim((string) $config['bitrix_contact_telegram_field']);
    if (preg_match('/^UF_CRM_[A-Z0-9_]+$/', $telegramField) !== 1) {
        return array('status' => 'terminal', 'error' => 'contact_telegram_field_invalid');
    }

    $response = safe_bitrix_call('crm.contact.list', array(
        'order' => array('DATE_MODIFY' => 'DESC'),
        'filter' => array('=' . $telegramField => $chatId),
        'select' => array('ID', 'DATE_CREATE', 'DATE_MODIFY', $telegramField)
    ), $config);
    if (empty($response['ok'])) {
        return array('status' => 'retry', 'error' => isset($response['error']) ? $response['error'] : 'contact_lookup_failed');
    }

    $contacts = is_array($response['result']) ? array_values($response['result']) : array();
    if (count($contacts) === 0) {
        return array('status' => 'retry', 'error' => 'native_contact_not_ready');
    }
    if (count($contacts) !== 1 || empty($contacts[0]['ID'])) {
        return array('status' => 'retry', 'error' => 'ambiguous_native_contact');
    }

    return array('status' => 'success', 'contact_id' => (string) $contacts[0]['ID']);
}

function safe_source_is_wazzup(string $sourceId, array $config): bool
{
    foreach ($config['bitrix_deal_source_prefixes'] as $prefix) {
        $prefix = trim((string) $prefix);
        if ($prefix !== '' && stripos($sourceId, $prefix) === 0) {
            return true;
        }
    }

    return false;
}

function safe_find_bitrix_deal(string $contactId, array $record, array $config): array
{
    $response = safe_bitrix_call('crm.deal.list', array(
        'order' => array('DATE_MODIFY' => 'DESC', 'ID' => 'DESC'),
        'filter' => array(
            '=CONTACT_ID' => $contactId,
            '=CATEGORY_ID' => (int) $config['bitrix_deal_category_id'],
            '=CLOSED' => 'N'
        ),
        'select' => array('ID', 'CONTACT_ID', 'CATEGORY_ID', 'CLOSED', 'SOURCE_ID', 'DATE_CREATE', 'DATE_MODIFY')
    ), $config);
    if (empty($response['ok'])) {
        return array('status' => 'retry', 'error' => isset($response['error']) ? $response['error'] : 'deal_lookup_failed');
    }

    $deals = is_array($response['result']) ? array_values($response['result']) : array();
    $minimumCreatedAt = (int) $record['created_at'] - (int) $config['bitrix_deal_created_grace_seconds'];
    $eligible = array();

    foreach ($deals as $deal) {
        if (!is_array($deal) || empty($deal['ID'])) {
            continue;
        }
        $sourceId = isset($deal['SOURCE_ID']) ? (string) $deal['SOURCE_ID'] : '';
        if (!safe_source_is_wazzup($sourceId, $config)) {
            continue;
        }
        $createdAt = isset($deal['DATE_CREATE']) ? strtotime((string) $deal['DATE_CREATE']) : false;
        $modifiedAt = isset($deal['DATE_MODIFY']) ? strtotime((string) $deal['DATE_MODIFY']) : false;
        $recentActivityAt = max($createdAt === false ? 0 : $createdAt, $modifiedAt === false ? 0 : $modifiedAt);
        if ($recentActivityAt < $minimumCreatedAt) {
            continue;
        }
        if (isset($deal['CLOSED']) && strtoupper((string) $deal['CLOSED']) === 'Y') {
            continue;
        }
        $eligible[] = $deal;
    }

    if (count($eligible) === 0) {
        return array('status' => 'retry', 'error' => 'native_deal_not_ready');
    }
    if (count($eligible) !== 1) {
        return array('status' => 'retry', 'error' => 'ambiguous_native_deal');
    }

    $chosen = $eligible[0];

    return array('status' => 'success', 'deal_id' => (string) $chosen['ID']);
}

function safe_attribution_fields(array $record, array $map): array
{
    $values = array(
        'ref_id' => isset($record['ref_id']) ? (string) $record['ref_id'] : '',
        'click_id' => isset($record['click_id']) ? (string) $record['click_id'] : '',
        'code' => isset($record['code']) ? (string) $record['code'] : '',
        'page_url' => isset($record['page_url']) ? (string) $record['page_url'] : ''
    );
    $fields = array();
    foreach ($map as $valueKey => $fieldName) {
        $fieldName = trim((string) $fieldName);
        if (!array_key_exists($valueKey, $values) || $values[$valueKey] === '') {
            continue;
        }
        if (preg_match('/^UF_CRM_[A-Z0-9_]+$/', $fieldName) !== 1) {
            continue;
        }
        $fields[$fieldName] = $values[$valueKey];
    }

    return $fields;
}

function safe_attribute_event(array $event, array $config): array
{
    $code = isset($event['code']) ? (string) $event['code'] : '';
    $chatId = isset($event['chat_id']) ? (string) $event['chat_id'] : '';
    $recordResult = safe_state_transaction(static function (array &$state) use ($code, $chatId): array {
        if (!isset($state['records'][$code]) || !is_array($state['records'][$code])) {
            return array('status' => 'terminal', 'error' => 'referral_record_missing');
        }
        $record = $state['records'][$code];
        if ((int) $record['expires_at'] < time()) {
            return array('status' => 'terminal', 'error' => 'referral_record_expired');
        }
        if (!isset($record['claimed_chat_id']) || !hash_equals((string) $record['claimed_chat_id'], $chatId)) {
            return array('status' => 'terminal', 'error' => 'referral_chat_mismatch');
        }
        if (isset($record['status']) && $record['status'] === 'attributed') {
            return array(
                'status' => 'already_attributed',
                'record' => $record,
                'contact_id' => isset($record['contact_id']) ? (string) $record['contact_id'] : '',
                'deal_id' => isset($record['deal_id']) ? (string) $record['deal_id'] : ''
            );
        }

        return array('status' => 'success', 'record' => $record);
    });

    if ($recordResult['status'] === 'terminal') {
        return $recordResult;
    }
    if ($recordResult['status'] === 'already_attributed') {
        return array(
            'status' => 'success',
            'contact_id' => $recordResult['contact_id'],
            'deal_id' => $recordResult['deal_id'],
            'already_attributed' => true
        );
    }
    $record = $recordResult['record'];

    $contact = safe_find_bitrix_contact($chatId, $config);
    if ($contact['status'] !== 'success') {
        return $contact;
    }

    $deal = safe_find_bitrix_deal($contact['contact_id'], $record, $config);
    if ($deal['status'] !== 'success') {
        return $deal;
    }

    $dealFields = safe_attribution_fields($record, $config['bitrix_deal_fields']);
    if (!$dealFields) {
        return array('status' => 'terminal', 'error' => 'deal_attribution_fields_not_configured');
    }
    $updatedDeal = safe_bitrix_call('crm.deal.update', array(
        'id' => $deal['deal_id'],
        'fields' => $dealFields
    ), $config);
    if (empty($updatedDeal['ok'])) {
        return array('status' => 'retry', 'error' => isset($updatedDeal['error']) ? $updatedDeal['error'] : 'deal_update_failed');
    }

    $contactFields = safe_attribution_fields($record, $config['bitrix_contact_fields']);
    if ($contactFields) {
        $updatedContact = safe_bitrix_call('crm.contact.update', array(
            'id' => $contact['contact_id'],
            'fields' => $contactFields
        ), $config);
        if (empty($updatedContact['ok'])) {
            return array('status' => 'retry', 'error' => isset($updatedContact['error']) ? $updatedContact['error'] : 'contact_update_failed');
        }
    }

    $commentLines = array(
        'Партнёрская атрибуция SAFE',
        'ref_id: ' . (string) $record['ref_id'],
        'Код обращения: ' . (string) $record['code']
    );
    if (isset($record['click_id']) && (string) $record['click_id'] !== '') {
        $commentLines[] = 'click_id: ' . (string) $record['click_id'];
    }
    if (isset($record['page_url']) && (string) $record['page_url'] !== '') {
        $commentLines[] = 'Ссылка перехода: ' . (string) $record['page_url'];
    }
    $commentResult = safe_bitrix_call('crm.timeline.comment.add', array(
        'fields' => array(
            'ENTITY_ID' => $deal['deal_id'],
            'ENTITY_TYPE' => 'deal',
            'COMMENT' => implode("\n", $commentLines)
        )
    ), $config);
    if (empty($commentResult['ok'])) {
        safe_log_event('bitrix_timeline_comment_failed', array(
            'deal_id' => $deal['deal_id'],
            'error' => isset($commentResult['error']) ? (string) $commentResult['error'] : 'comment_add_failed'
        ));
    }

    return array(
        'status' => 'success',
        'contact_id' => $contact['contact_id'],
        'deal_id' => $deal['deal_id']
    );
}

function safe_claim_queue_item(string $messageKey, array $config): ?array
{
    $now = time();

    return safe_state_transaction(static function (array &$state) use ($messageKey, $config, $now): ?array {
        if (!isset($state['queue'][$messageKey]) || !is_array($state['queue'][$messageKey])) {
            return null;
        }
        $event = $state['queue'][$messageKey];
        if ((int) $event['attempts'] >= (int) $config['queue_max_attempts']) {
            $state['messages'][$messageKey]['status'] = 'failed';
            $state['messages'][$messageKey]['reason'] = 'retry_limit_reached';
            $state['messages'][$messageKey]['updated_at'] = $now;
            unset($state['queue'][$messageKey]);
            return null;
        }
        if ((int) $event['next_attempt_at'] > $now || (int) $event['lease_until'] > $now) {
            return null;
        }
        $event['lease_until'] = $now + (int) $config['queue_lease_seconds'];
        $state['queue'][$messageKey] = $event;

        return $event;
    });
}

function safe_complete_queue_item(string $messageKey, array $result, int $attemptCount, array $config): void
{
    $now = time();
    safe_state_transaction(static function (array &$state) use ($messageKey, $result, $attemptCount, $config, $now): bool {
        if (!isset($state['queue'][$messageKey]) || !is_array($state['queue'][$messageKey])) {
            return false;
        }
        $event = $state['queue'][$messageKey];
        $totalAttempts = (int) $event['attempts'] + $attemptCount;
        $status = isset($result['status']) ? (string) $result['status'] : 'retry';

        if ($status === 'success') {
            $code = (string) $event['code'];
            if (isset($state['records'][$code]) && is_array($state['records'][$code])) {
                $state['records'][$code]['status'] = 'attributed';
                $state['records'][$code]['attributed_at'] = $now;
                $state['records'][$code]['contact_id'] = isset($result['contact_id']) ? (string) $result['contact_id'] : '';
                $state['records'][$code]['deal_id'] = isset($result['deal_id']) ? (string) $result['deal_id'] : '';
            }
            $state['messages'][$messageKey]['status'] = 'succeeded';
            $state['messages'][$messageKey]['reason'] = !empty($result['already_attributed']) ? 'already_attributed' : '';
            $state['messages'][$messageKey]['updated_at'] = $now;
            $state['messages'][$messageKey]['deal_id'] = isset($result['deal_id']) ? (string) $result['deal_id'] : '';
            unset($state['queue'][$messageKey]);
            return true;
        }

        $error = isset($result['error']) ? (string) $result['error'] : 'attribution_failed';
        if ($status === 'terminal' || $totalAttempts >= (int) $config['queue_max_attempts']) {
            $state['messages'][$messageKey]['status'] = 'failed';
            $state['messages'][$messageKey]['reason'] = $error;
            $state['messages'][$messageKey]['updated_at'] = $now;
            unset($state['queue'][$messageKey]);
            return true;
        }

        $event['attempts'] = $totalAttempts;
        $event['lease_until'] = 0;
        $event['last_error'] = $error;
        $event['next_attempt_at'] = $now + min(300, max(5, 1 << min(8, $totalAttempts)));
        $state['queue'][$messageKey] = $event;
        $state['messages'][$messageKey]['updated_at'] = $now;
        $state['messages'][$messageKey]['reason'] = $error;

        return true;
    });

    if (isset($result['status']) && $result['status'] === 'success') {
        safe_log_event('referral_attributed', array(
            'message_key' => $messageKey,
            'contact_id' => isset($result['contact_id']) ? (string) $result['contact_id'] : '',
            'deal_id' => isset($result['deal_id']) ? (string) $result['deal_id'] : ''
        ));
    } else {
        safe_log_event('referral_attribution_deferred', array(
            'message_key' => $messageKey,
            'reason' => isset($result['error']) ? (string) $result['error'] : 'attribution_failed'
        ));
    }
}

function safe_process_queue_item(string $messageKey, array $config, bool $withInlineRetries): bool
{
    $event = safe_claim_queue_item($messageKey, $config);
    if ($event === null) {
        return false;
    }

    $delays = $withInlineRetries ? $config['inline_retry_delays_seconds'] : array(0);
    if (!$delays) {
        $delays = array(0);
    }
    $result = array('status' => 'retry', 'error' => 'attribution_not_attempted');
    $attemptCount = 0;

    foreach ($delays as $delay) {
        $delay = max(0, min(5, (int) $delay));
        if ($delay > 0) {
            sleep($delay);
        }
        $attemptCount++;
        $result = safe_attribute_event($event, $config);
        if (isset($result['status']) && $result['status'] !== 'retry') {
            break;
        }
    }

    safe_complete_queue_item($messageKey, $result, $attemptCount, $config);

    return true;
}

function safe_due_queue_keys(array $config, int $limit): array
{
    $now = time();

    return safe_state_transaction(static function (array &$state) use ($now, $limit): array {
        $keys = array();
        foreach ($state['queue'] as $key => $event) {
            if (!is_array($event)) {
                continue;
            }
            if ((int) $event['next_attempt_at'] <= $now && (int) $event['lease_until'] <= $now) {
                $keys[] = (string) $key;
                if (count($keys) >= $limit) {
                    break;
                }
            }
        }
        return $keys;
    });
}

function safe_process_due_queue(array $config, int $limit): int
{
    $processed = 0;
    foreach (safe_due_queue_keys($config, $limit) as $messageKey) {
        if (safe_process_queue_item($messageKey, $config, false)) {
            $processed++;
        }
    }

    return $processed;
}
