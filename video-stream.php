<?php

$videos = array(
    'nikita-bronnikov' => 'nikita-bronnikov.mp4',
    'mikhail-ivanov' => 'mikhail-ivanov.mp4',
    'aleksey-mashkov' => 'aleksey-mashkov.mp4',
    'viktor-medvedev' => 'viktor-medvedev.mp4',
    'arkadiy' => 'arkadiy.mp4',
    'aleksey-malechenko' => 'aleksey-malechenko.mp4'
);

$method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string) $_SERVER['REQUEST_METHOD']) : 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    http_response_code(405);
    exit;
}

$videoId = isset($_GET['video']) && is_string($_GET['video']) ? $_GET['video'] : '';
if (!isset($videos[$videoId])) {
    http_response_code(404);
    exit;
}

$filename = $videos[$videoId];
$filePath = __DIR__ . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'videos' . DIRECTORY_SEPARATOR . $filename;
if (!is_file($filePath) || !is_readable($filePath)) {
    http_response_code(404);
    exit;
}

clearstatcache(true, $filePath);
$fileSize = filesize($filePath);
$modifiedAt = filemtime($filePath);
if ($fileSize === false || $modifiedAt === false || $fileSize < 1) {
    http_response_code(500);
    exit;
}

$fileSize = (int) $fileSize;
$modifiedAt = (int) $modifiedAt;
$etag = '"' . sha1($filename . ':' . $fileSize . ':' . $modifiedAt) . '"';
$lastModified = gmdate('D, d M Y H:i:s', $modifiedAt) . ' GMT';

header_remove('X-Powered-By');
header('Content-Type: video/mp4');
header('Content-Disposition: inline; filename="' . $filename . '"');
header('Accept-Ranges: bytes');
header('X-Accel-Buffering: no');
header('Cache-Control: public, max-age=14400, immutable');
header('CDN-Cache-Control: public, max-age=2592000, stale-while-revalidate=86400, stale-if-error=604800');
header('ETag: ' . $etag);
header('Last-Modified: ' . $lastModified);

$ifNoneMatch = isset($_SERVER['HTTP_IF_NONE_MATCH']) ? trim((string) $_SERVER['HTTP_IF_NONE_MATCH']) : '';
if ($ifNoneMatch !== '' && $ifNoneMatch === $etag && !isset($_SERVER['HTTP_RANGE'])) {
    http_response_code(304);
    exit;
}

$start = 0;
$end = $fileSize - 1;
$rangeHeader = isset($_SERVER['HTTP_RANGE']) ? trim((string) $_SERVER['HTTP_RANGE']) : '';
$ifRange = isset($_SERVER['HTTP_IF_RANGE']) ? trim((string) $_SERVER['HTTP_IF_RANGE']) : '';
if ($ifRange !== '' && $ifRange !== $etag && $ifRange !== $lastModified) {
    $rangeHeader = '';
}

if ($rangeHeader !== '') {
    if (strpos($rangeHeader, ',') !== false || preg_match('/^bytes=(\d*)-(\d*)$/', $rangeHeader, $matches) !== 1) {
        header('Content-Range: bytes */' . $fileSize);
        http_response_code(416);
        exit;
    }

    if ($matches[1] === '' && $matches[2] === '') {
        header('Content-Range: bytes */' . $fileSize);
        http_response_code(416);
        exit;
    }

    if ($matches[1] === '') {
        $suffixLength = (int) $matches[2];
        if ($suffixLength < 1) {
            header('Content-Range: bytes */' . $fileSize);
            http_response_code(416);
            exit;
        }
        $start = max(0, $fileSize - $suffixLength);
    } else {
        $start = (int) $matches[1];
        if ($matches[2] !== '') {
            $end = (int) $matches[2];
        }
    }

    if ($start >= $fileSize || $end < $start) {
        header('Content-Range: bytes */' . $fileSize);
        http_response_code(416);
        exit;
    }

    $end = min($end, $fileSize - 1);
    http_response_code(206);
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $fileSize);
}

$contentLength = $end - $start + 1;
header('Content-Length: ' . $contentLength);

if ($method === 'HEAD') {
    exit;
}

@ini_set('zlib.output_compression', '0');
while (ob_get_level() > 0) {
    @ob_end_clean();
}
@set_time_limit(0);
ignore_user_abort(true);

$handle = fopen($filePath, 'rb');
if ($handle === false) {
    http_response_code(500);
    exit;
}

if ($start > 0 && fseek($handle, $start) !== 0) {
    fclose($handle);
    http_response_code(500);
    exit;
}

$remaining = $contentLength;
while ($remaining > 0 && !feof($handle)) {
    $chunk = fread($handle, min(262144, $remaining));
    if ($chunk === false || $chunk === '') {
        break;
    }

    echo $chunk;
    $remaining -= strlen($chunk);
    flush();
}

fclose($handle);
