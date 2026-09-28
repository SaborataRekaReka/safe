<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'integration-lib.php';

$config = safe_integration_config();

if (isset($_SERVER['REQUEST_METHOD']) && strtoupper((string) $_SERVER['REQUEST_METHOD']) !== 'POST') {
    header('Allow: POST');
    safe_json_response(405, array('ok' => false, 'error' => 'method_not_allowed'));
}

if (!safe_webhook_is_authorized($config)) {
    safe_json_response(trim((string) $config['wazzup_webhook_secret']) === '' ? 503 : 401, array(
        'ok' => false,
        'error' => trim((string) $config['wazzup_webhook_secret']) === '' ? 'webhook_not_configured' : 'unauthorized'
    ));
}

// An authenticated POST with ?drain=1 can be called by cron to retry durable
// queue entries if Wazzup's native Bitrix entity appeared after the webhook.
if (isset($_GET['drain']) && (string) $_GET['drain'] === '1') {
    try {
        $processed = safe_process_due_queue($config, (int) $config['drain_batch_size']);
        safe_json_response(200, array('ok' => true, 'processed' => $processed));
    } catch (Throwable $error) {
        safe_log_event('queue_drain_failed', array('error' => get_class($error)));
        safe_json_response(500, array('ok' => false, 'error' => 'queue_drain_failed'));
    }
}

$rawBody = file_get_contents('php://input');
if (!is_string($rawBody) || $rawBody === '' || strlen($rawBody) > 1048576) {
    safe_json_response(400, array('ok' => false, 'error' => 'invalid_request_body'));
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    safe_json_response(400, array('ok' => false, 'error' => 'invalid_json'));
}

// Wazzup immediately sends this probe after PATCH /v3/webhooks.
if (isset($payload['test']) && safe_bool($payload['test'])) {
    safe_json_response(200, array('ok' => true));
}

$messages = isset($payload['messages']) && is_array($payload['messages']) ? $payload['messages'] : array();
$messageKeys = array();
$accepted = 0;

try {
    foreach ($messages as $message) {
        if (!is_array($message)) {
            continue;
        }
        $prepared = safe_prepare_wazzup_message($message, $config);
        if (!empty($prepared['accepted']) && !empty($prepared['message_key'])) {
            $messageKeys[(string) $prepared['message_key']] = true;
            $accepted++;
        }
    }
} catch (Throwable $error) {
    safe_log_event('wazzup_enqueue_failed', array('error' => get_class($error)));
    safe_json_response(500, array('ok' => false, 'error' => 'temporary_server_error'));
}

// Acknowledge only after the durable queue write, but before any Bitrix network
// call. This prevents Wazzup retries from creating parallel processing races.
ignore_user_abort(true);
@set_time_limit(30);
$canFinishInBackground = function_exists('fastcgi_finish_request');
safe_finish_http_response(array('ok' => true, 'accepted' => $accepted));

try {
    $processed = 0;
    foreach (array_keys($messageKeys) as $messageKey) {
        if ($processed >= 5) {
            break;
        }
        // On FastCGI the full bounded retry schedule runs after the client has
        // received 200. Other SAPIs make one quick attempt and leave retries
        // to referral-drain.php, so Wazzup is never held near its timeout.
        if (safe_process_queue_item($messageKey, $config, $canFinishInBackground)) {
            $processed++;
        }
    }

    // Also give one older due item a chance on normal webhook traffic.
    safe_process_due_queue($config, 1);
} catch (Throwable $error) {
    safe_log_event('wazzup_background_processing_failed', array('error' => get_class($error)));
}

exit;
