<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond($statusCode, array $payload)
{
    http_response_code((int) $statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalizeValue($value)
{
    $stringValue = is_string($value) ? $value : '';
    $trimmed = trim($stringValue);
    $normalized = preg_replace('/\s+/u', ' ', $trimmed);
    return is_string($normalized) ? $normalized : '';
}

function stringLength($value)
{
    if (function_exists('mb_strlen')) {
        return (int) mb_strlen($value);
    }

    return strlen($value);
}

function truncateUtf8($value, $maxLength)
{
    if (function_exists('mb_substr') && function_exists('mb_strlen')) {
        if (mb_strlen($value) <= $maxLength) {
            return $value;
        }

        return mb_substr($value, 0, $maxLength);
    }

    if (strlen($value) <= $maxLength) {
        return $value;
    }

    return substr($value, 0, $maxLength);
}

function sendToTelegramApi($token, $chatId, $text)
{
    $endpoint = 'https://api.telegram.org/bot' . rawurlencode($token) . '/sendMessage';
    $postFields = http_build_query(
        array(
            'chat_id' => $chatId,
            'text' => $text
        ),
        '',
        '&',
        PHP_QUERY_RFC3986
    );

    $responseBody = '';
    $statusCode = 0;

    if (function_exists('curl_init')) {
        $curlHandle = curl_init($endpoint);
        if ($curlHandle === false) {
            return false;
        }

        curl_setopt_array(
            $curlHandle,
            array(
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 6,
                CURLOPT_TIMEOUT => 12,
                CURLOPT_HTTPHEADER => array('Content-Type: application/x-www-form-urlencoded;charset=UTF-8'),
                CURLOPT_POSTFIELDS => $postFields
            )
        );

        $curlResponse = curl_exec($curlHandle);
        $statusCode = (int) curl_getinfo($curlHandle, CURLINFO_HTTP_CODE);
        curl_close($curlHandle);

        if (!is_string($curlResponse)) {
            return false;
        }

        $responseBody = $curlResponse;
    } else {
        $context = stream_context_create(
            array(
                'http' => array(
                    'method' => 'POST',
                    'header' => "Content-Type: application/x-www-form-urlencoded;charset=UTF-8\r\n",
                    'content' => $postFields,
                    'timeout' => 12,
                    'ignore_errors' => true
                )
            )
        );

        $streamResponse = @file_get_contents($endpoint, false, $context);
        if (!is_string($streamResponse)) {
            return false;
        }

        $responseBody = $streamResponse;

        $headers = isset($http_response_header) && is_array($http_response_header) ? $http_response_header : array();
        if (isset($headers[0]) && preg_match('/\s(\d{3})\s/', $headers[0], $matches) === 1) {
            $statusCode = (int) $matches[1];
        }
    }

    if ($statusCode < 200 || $statusCode >= 300) {
        return false;
    }

    $decoded = json_decode($responseBody, true);
    return is_array($decoded) && !empty($decoded['ok']);
}

$requestMethod = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : '';
if ($requestMethod !== 'POST') {
    respond(405, array('ok' => false, 'error' => 'method_not_allowed'));
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
$host = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '';
if ($origin !== '' && $host !== '') {
    $originHost = parse_url($origin, PHP_URL_HOST);
    if (is_string($originHost) && strcasecmp($originHost, $host) !== 0) {
        respond(403, array('ok' => false, 'error' => 'forbidden_origin'));
    }
}

$rawInput = file_get_contents('php://input');
if (!is_string($rawInput) || $rawInput === '') {
    respond(400, array('ok' => false, 'error' => 'empty_payload'));
}

$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    respond(400, array('ok' => false, 'error' => 'invalid_json'));
}

$name = normalizeValue(isset($payload['name']) ? $payload['name'] : '');
$contact = normalizeValue(isset($payload['contact']) ? $payload['contact'] : '');
$message = normalizeValue(isset($payload['message']) ? $payload['message'] : '');
$pageTitle = normalizeValue(isset($payload['pageTitle']) ? $payload['pageTitle'] : '');
$pageUrl = normalizeValue(isset($payload['pageUrl']) ? $payload['pageUrl'] : '');
$createdAt = normalizeValue(isset($payload['createdAt']) ? $payload['createdAt'] : '');

if (stringLength($name) < 2) {
    respond(422, array('ok' => false, 'error' => 'invalid_name'));
}

if (stringLength($contact) < 3) {
    respond(422, array('ok' => false, 'error' => 'invalid_contact'));
}

$telegramBotToken = '';
$telegramChatId = '';
$secretsPath = __DIR__ . '/.lead-secrets.php';

if (is_readable($secretsPath)) {
    $fileSecrets = @include $secretsPath;
    if (is_array($fileSecrets)) {
        $telegramBotToken = normalizeValue(isset($fileSecrets['telegram_bot_token']) ? $fileSecrets['telegram_bot_token'] : '');
        $telegramChatId = normalizeValue(isset($fileSecrets['telegram_chat_id']) ? $fileSecrets['telegram_chat_id'] : '');
    }
}

if ($telegramBotToken === '') {
    $telegramBotToken = normalizeValue(getenv('TELEGRAM_BOT_TOKEN') ?: '');
}

if ($telegramChatId === '') {
    $telegramChatId = normalizeValue(getenv('TELEGRAM_CHAT_ID') ?: '');
}

if ($telegramBotToken === '' || $telegramChatId === '') {
    respond(500, array('ok' => false, 'error' => 'telegram_not_configured'));
}

$messageLines = array(
    'Новая заявка с сайта SAFE',
    '',
    'Имя: ' . $name,
    'Контакт: ' . $contact,
    'Комментарий: ' . ($message !== '' ? $message : 'не указан')
);

if ($pageTitle !== '') {
    $messageLines[] = '';
    $messageLines[] = 'Страница: ' . $pageTitle;
}

if ($pageUrl !== '') {
    $messageLines[] = 'URL: ' . $pageUrl;
}

if ($createdAt !== '') {
    $messageLines[] = 'Дата: ' . $createdAt;
}

$telegramText = implode("\n", $messageLines);
$telegramText = truncateUtf8($telegramText, 3800);

if (!sendToTelegramApi($telegramBotToken, $telegramChatId, $telegramText)) {
    respond(502, array('ok' => false, 'error' => 'telegram_send_failed'));
}

respond(200, array('ok' => true));
