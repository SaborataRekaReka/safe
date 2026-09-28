<?php

declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'integration-lib.php';

function test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$seen = array();
for ($i = 0; $i < 200; $i++) {
    $code = safe_generate_referral_code($seen);
    test_assert(preg_match('/^(?=.*[A-Z])(?=.*[2-9])[A-HJKMNP-Z2-9]{6}$/', $code) === 1, 'code format');
    test_assert(!isset($seen[$code]), 'code uniqueness');
    $seen[$code] = true;
}

test_assert(
    safe_extract_referral_candidates('Здравствуйте! Хочу обменять средства. Обращение K7M4Q2') === array('K7M4Q2'),
    'prefilled Russian message code extraction'
);
test_assert(
    safe_extract_referral_candidates('K7M4Q2') === array('K7M4Q2'),
    'standalone human-friendly code extraction'
);
test_assert(
    safe_extract_referral_candidates('Обычное сообщение 123456 без кода') === array(),
    'numeric text is not treated as a referral code'
);

$config = safe_integration_config();
test_assert($config['inline_retry_delays_seconds'] === array(0, 1, 2, 4, 7), 'bounded inline retry schedule');
test_assert(safe_source_is_wazzup('1|WZ_TELEGRAM_example', $config), 'new Wazzup deal source');
test_assert(safe_source_is_wazzup('WZ42cc9ad8-example', $config), 'legacy Wazzup deal source');
test_assert(!safe_source_is_wazzup('WEB', $config), 'unrelated deal source rejected');

$messageConfig = $config;
$messageConfig['wazzup_channel_id'] = 'expected-channel';
$nonInbound = safe_prepare_wazzup_message(array(
    'channelId' => 'expected-channel',
    'status' => 'sent',
    'isEcho' => false,
    'chatId' => '123',
    'type' => 'text',
    'text' => 'Обращение K7M4Q2'
), $messageConfig);
test_assert($nonInbound['reason'] === 'non_inbound_message', 'only inbound Wazzup messages are considered');

$wrongChannel = safe_prepare_wazzup_message(array(
    'channelId' => 'another-channel',
    'status' => 'inbound',
    'isEcho' => false,
    'chatId' => '123',
    'type' => 'text',
    'text' => 'Обращение K7M4Q2'
), $messageConfig);
test_assert($wrongChannel['reason'] === 'different_channel', 'messages from other channels are ignored');

$fields = safe_attribution_fields(array(
    'ref_id' => 'partner-17',
    'click_id' => 'click-29',
    'code' => 'K7M4Q2',
    'page_url' => 'https://safe-fin.com/partner_link?ref_id=partner-17'
), $config['bitrix_deal_fields']);
test_assert(isset($fields['UF_CRM_SAFE_REF_ID']) && $fields['UF_CRM_SAFE_REF_ID'] === 'partner-17', 'ref_id field mapping');
test_assert(isset($fields['UF_CRM_SAFE_CLICK_ID']) && $fields['UF_CRM_SAFE_CLICK_ID'] === 'click-29', 'click_id field mapping');
test_assert(isset($fields['UF_CRM_SAFE_REQUEST_CODE']) && $fields['UF_CRM_SAFE_REQUEST_CODE'] === 'K7M4Q2', 'request code field mapping');
test_assert(isset($fields['UF_CRM_SAFE_LANDING_URL']), 'landing URL field mapping');

echo "OK referral integration unit checks\n";
