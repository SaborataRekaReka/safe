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

function sendToTelegramApi($token, $chatId, $text, $proxy = '', array $resolveIps = array())
{
    $result = array(
        'ok' => false,
        'error' => 'unknown_telegram_error',
        'status' => 0,
        'description' => '',
        'resolve_ip' => ''
    );

    $endpoint = 'https://api.telegram.org/bot' . rawurlencode($token) . '/sendMessage';
    $endpointHost = 'api.telegram.org';
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
        $attemptResolveIps = array('');
        foreach ($resolveIps as $candidateIp) {
            $normalizedCandidate = normalizeValue($candidateIp);
            if ($normalizedCandidate !== '' && !in_array($normalizedCandidate, $attemptResolveIps, true)) {
                $attemptResolveIps[] = $normalizedCandidate;
            }
        }

        foreach ($attemptResolveIps as $resolveIp) {
            $curlHandle = curl_init($endpoint);
            if ($curlHandle === false) {
                $result['error'] = 'curl_init_failed';
                return $result;
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

            if (defined('CURLOPT_IPRESOLVE') && defined('CURL_IPRESOLVE_V4')) {
                curl_setopt($curlHandle, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
            }

            if ($proxy !== '') {
                curl_setopt($curlHandle, CURLOPT_PROXY, $proxy);
            }

            if ($resolveIp !== '' && defined('CURLOPT_RESOLVE')) {
                curl_setopt($curlHandle, CURLOPT_RESOLVE, array($endpointHost . ':443:' . $resolveIp));
            }

            $curlResponse = curl_exec($curlHandle);
            $curlErrorNo = curl_errno($curlHandle);
            $curlErrorMessage = curl_error($curlHandle);
            $statusCode = (int) curl_getinfo($curlHandle, CURLINFO_HTTP_CODE);
            $result['status'] = $statusCode;
            $result['resolve_ip'] = $resolveIp;
            curl_close($curlHandle);

            if ($curlResponse === false || !is_string($curlResponse)) {
                $result['error'] = 'curl_transport_error';
                $result['description'] = 'curl_errno_' . (string) $curlErrorNo . ($curlErrorMessage !== '' ? ': ' . $curlErrorMessage : '');
                continue;
            }

            $responseBody = $curlResponse;

            $decoded = json_decode($responseBody, true);
            if (!is_array($decoded)) {
                $result['error'] = 'telegram_invalid_json';
                $result['description'] = 'telegram_response_parse_failed';
                return $result;
            }

            if (!empty($decoded['ok'])) {
                return array('ok' => true);
            }

            $result['error'] = 'telegram_api_error';
            $result['status'] = isset($decoded['error_code']) ? (int) $decoded['error_code'] : $statusCode;
            $result['description'] = normalizeValue(isset($decoded['description']) ? $decoded['description'] : '');
            if ($result['description'] === '') {
                $result['description'] = 'telegram_rejected_request';
            }

            return $result;
        }

        return $result;
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
            $result['error'] = 'stream_transport_error';
            $result['description'] = 'stream_request_failed';
            return $result;
        }

        $responseBody = $streamResponse;

        $headers = isset($http_response_header) && is_array($http_response_header) ? $http_response_header : array();
        if (isset($headers[0]) && preg_match('/\s(\d{3})\s/', $headers[0], $matches) === 1) {
            $statusCode = (int) $matches[1];
        }

        $result['status'] = $statusCode;
    }

    $decoded = json_decode($responseBody, true);
    if (!is_array($decoded)) {
        $result['error'] = 'telegram_invalid_json';
        $result['description'] = 'telegram_response_parse_failed';
        return $result;
    }

    if (!empty($decoded['ok'])) {
        return array('ok' => true);
    }

    $result['error'] = 'telegram_api_error';
    $result['status'] = isset($decoded['error_code']) ? (int) $decoded['error_code'] : $statusCode;
    $result['description'] = normalizeValue(isset($decoded['description']) ? $decoded['description'] : '');
    if ($result['description'] === '') {
        $result['description'] = 'telegram_rejected_request';
    }

    return $result;
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
$telegramProxy = '';
$telegramResolveIp = '';
$secretsPath = __DIR__ . '/.lead-secrets.php';

if (is_readable($secretsPath)) {
    $fileSecrets = @include $secretsPath;
    if (is_array($fileSecrets)) {
        $telegramBotToken = normalizeValue(isset($fileSecrets['telegram_bot_token']) ? $fileSecrets['telegram_bot_token'] : '');
        $telegramChatId = normalizeValue(isset($fileSecrets['telegram_chat_id']) ? $fileSecrets['telegram_chat_id'] : '');
        $telegramProxy = normalizeValue(isset($fileSecrets['telegram_proxy']) ? $fileSecrets['telegram_proxy'] : '');
        $telegramResolveIp = normalizeValue(isset($fileSecrets['telegram_resolve_ip']) ? $fileSecrets['telegram_resolve_ip'] : '');
    }
}

if ($telegramBotToken === '') {
    $telegramBotToken = normalizeValue(getenv('TELEGRAM_BOT_TOKEN') ?: '');
}

if ($telegramChatId === '') {
    $telegramChatId = normalizeValue(getenv('TELEGRAM_CHAT_ID') ?: '');
}

if ($telegramProxy === '') {
    $telegramProxy = normalizeValue(getenv('TELEGRAM_PROXY') ?: '');
}

if ($telegramResolveIp === '') {
    $telegramResolveIp = normalizeValue(getenv('TELEGRAM_RESOLVE_IP') ?: '');
}

if ($telegramBotToken === '' || $telegramChatId === '') {
    respond(200, array('ok' => false, 'error' => 'telegram_not_configured'));
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

$telegramResolveIps = array();
if ($telegramResolveIp !== '') {
    $telegramResolveIps[] = $telegramResolveIp;
}
$telegramResolveIps[] = '149.154.167.220';

$telegramResult = sendToTelegramApi($telegramBotToken, $telegramChatId, $telegramText, $telegramProxy, $telegramResolveIps);
if (empty($telegramResult['ok'])) {
    $errorDetail = array(
        'error' => isset($telegramResult['error']) ? $telegramResult['error'] : 'unknown_telegram_error',
        'status' => isset($telegramResult['status']) ? (int) $telegramResult['status'] : 0,
        'description' => isset($telegramResult['description']) ? (string) $telegramResult['description'] : '',
        'resolveIp' => isset($telegramResult['resolve_ip']) ? (string) $telegramResult['resolve_ip'] : ''
    );

    respond(200, array('ok' => false, 'error' => 'telegram_send_failed', 'detail' => $errorDetail));
}

respond(200, array('ok' => true));
