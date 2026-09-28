<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'integration-lib.php';

$config = safe_integration_config();

if (isset($_SERVER['REQUEST_METHOD']) && strtoupper((string) $_SERVER['REQUEST_METHOD']) !== 'POST') {
    header('Allow: POST');
    safe_json_response(405, array('ok' => false, 'error' => 'method_not_allowed'));
}

$requestError = safe_assert_same_origin_json_request($config);
if ($requestError !== null) {
    safe_json_response(403, array('ok' => false, 'error' => $requestError));
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > 16384) {
    safe_json_response(400, array('ok' => false, 'error' => 'invalid_request_body'));
}

$input = json_decode($rawBody, true);
if (!is_array($input)) {
    safe_json_response(400, array('ok' => false, 'error' => 'invalid_json'));
}

list($refValid, $refId, $refError) = safe_validate_identifier(isset($input['ref_id']) ? $input['ref_id'] : null, 128, true);
if (!$refValid) {
    safe_json_response(422, array('ok' => false, 'error' => 'invalid_ref_id', 'detail' => $refError));
}

list($clickValid, $clickId, $clickError) = safe_validate_identifier(isset($input['click_id']) ? $input['click_id'] : '', 256, false);
if (!$clickValid) {
    safe_json_response(422, array('ok' => false, 'error' => 'invalid_click_id', 'detail' => $clickError));
}

list($pageValid, $pageUrl, $pageError) = safe_validate_page_url(isset($input['page_url']) ? $input['page_url'] : '', $config);
if (!$pageValid) {
    safe_json_response(422, array('ok' => false, 'error' => 'invalid_page_url', 'detail' => $pageError));
}

try {
    $created = safe_create_referral_record($refId, $clickId, $pageUrl, $config);
    if (empty($created['ok'])) {
        $status = isset($created['error']) && $created['error'] === 'rate_limit_exceeded' ? 429 : 500;
        safe_json_response($status, array('ok' => false, 'error' => isset($created['error']) ? $created['error'] : 'record_create_failed'));
    }

    $record = $created['record'];
    $handoff = safe_build_telegram_handoff($record, $config);
    safe_log_event('referral_created', array(
        'code' => $record['code'],
        'ref_id_hash' => hash('sha256', $record['ref_id']),
        'has_click_id' => $record['click_id'] !== ''
    ));

    safe_json_response(201, array(
        'ok' => true,
        'code' => $record['code'],
        'expires_at' => (int) $record['expires_at'],
        'expires_at_iso' => gmdate('c', (int) $record['expires_at']),
        'message' => $handoff['message'],
        'telegram_url' => $handoff['telegram_url']
    ));
} catch (Throwable $error) {
    safe_log_event('referral_create_failed', array('error' => get_class($error)));
    safe_json_response(500, array('ok' => false, 'error' => 'temporary_server_error'));
}
