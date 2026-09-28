<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . DIRECTORY_SEPARATOR . 'integration-lib.php';

try {
    $config = safe_integration_config();
    $processed = safe_process_due_queue($config, (int) $config['drain_batch_size']);
    fwrite(STDOUT, 'processed=' . $processed . PHP_EOL);
    exit(0);
} catch (Throwable $error) {
    safe_log_event('queue_drain_failed', array('error' => get_class($error)));
    fwrite(STDERR, "queue_drain_failed\n");
    exit(1);
}
