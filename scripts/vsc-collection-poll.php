<?php
/** OVH CLI collector, QA only. Install outside every public document root. */
declare(strict_types=1);
namespace AtlasVscCollection;

const QA_ORIGIN = 'https://project-atlas-qa-beta-1-git-feature-vsc-campai-f0c292-neos-immo.vercel.app';
function checkConfig(array $config): array {
    $issues = [];
    if (($config['version'] ?? null) !== 1 || array_diff(array_keys($config), ['version','enabled','cronSecret'])) $issues[] = 'version_or_fields';
    if (!isset($config['enabled']) || !is_bool($config['enabled'])) $issues[] = 'enabled';
    $key = $config['cronSecret'] ?? null;
    if (!is_string($key) || strlen($key) < 32 || strlen($key) > 4000 || !preg_match('/^[\x21-\x7e]+$/D', $key)) $issues[] = 'cronSecret';
    return ['ready'=>!$issues, 'issues'=>$issues, 'target'=>'qa', 'sendingEnabled'=>false];
}
function loadConfig(string $path): array {
    if (is_link($path) || !is_file($path) || (fileperms($path) & 0077) !== 0 || fileowner($path) !== fileowner(__FILE__) || filesize($path) > 8192) throw new \RuntimeException('private_configuration_required');
    $config = json_decode(file_get_contents($path), true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($config)) throw new \RuntimeException('invalid_configuration');
    return $config;
}
function request(string $url, string $secret, int $timeout): array {
    if (!extension_loaded('curl')) throw new \RuntimeException('curl_required');
    $curl = curl_init($url); $body = '';
    curl_setopt_array($curl, [
        CURLOPT_HTTPGET=>true, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2, CURLOPT_CONNECTTIMEOUT=>10, CURLOPT_TIMEOUT=>$timeout,
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$secret, 'Accept: application/json', 'Cache-Control: no-store'],
        CURLOPT_WRITEFUNCTION=>static function($handle, string $chunk) use (&$body): int {
            if (strlen($body)+strlen($chunk)>16384) return 0;
            $body .= $chunk; return strlen($chunk);
        }
    ]);
    try {
        if (curl_exec($curl) === false) throw new \RuntimeException('request_failed');
        return ['status'=>(int)curl_getinfo($curl,CURLINFO_HTTP_CODE), 'body'=>$body];
    } finally { curl_close($curl); }
}
function poll(array $config, ?callable $http = null): array {
    $checked = checkConfig($config);
    if (!$checked['ready'] || $config['enabled'] !== true) return ['status'=>'disabled','exitCode'=>3,'issues'=>$checked['issues'],'sendingEnabled'=>false,'stages'=>[]];
    $http ??= __NAMESPACE__.'\\request';
    $stages = [
        ['replies','/api/cron/vsc-replies',180,['inspected','matched','recorded'],true],
        ['historical','/api/cron/vsc-historical-inbound',120,['inspected','held','cancelled','automated'],true],
        ['smsStops','/api/cron/vsc-sms-stops',120,['sourceContacts','sourceSmsBlocked','unknownSmsStatus','matchedSources','unmappedSources','peopleStopped','cancelled'],false]
    ];
    $results = []; $failed = false; $incomplete = false;
    foreach ($stages as [$name,$path,$timeout,$counts,$more]) {
        try {
            $response = $http(QA_ORIGIN.$path,$config['cronSecret'],$timeout);
            if (($response['status'] ?? null) !== 200) { $results[]=['name'=>$name,'status'=>'failed']; $failed=true; continue; }
            if (!is_string($response['body'] ?? null) || strlen($response['body'])>16384) throw new \RuntimeException('invalid_response');
            $data = json_decode($response['body'],true,8,JSON_THROW_ON_ERROR);
            if (!is_array($data)) throw new \RuntimeException('invalid_response');
            $result=['name'=>$name];
            foreach ($counts as $key) {
                if (!isset($data[$key]) || !is_int($data[$key]) || $data[$key]<0 || $data[$key]>9007199254740991) throw new \RuntimeException('invalid_count');
                $result[$key]=$data[$key];
            }
            if ($more && !is_bool($data['hasMore'] ?? null) || !$more && ($data['sendingEnabled'] ?? null) !== false) throw new \RuntimeException('invalid_status');
            $pending = $more ? $data['hasMore'] : $data['unknownSmsStatus']>0 || $data['unmappedSources']>0;
            $result['status']=$pending?'incomplete':'complete';
            if ($more) $result['hasMore']=$data['hasMore'];
            $incomplete = $incomplete || $pending; $results[]=$result;
        } catch (\Throwable $error) { $results[]=['name'=>$name,'status'=>'failed']; $failed=true; }
    }
    return ['status'=>$failed?'failed':($incomplete?'incomplete':'complete'),'exitCode'=>$failed?1:($incomplete?2:0),'sendingEnabled'=>false,'stages'=>$results];
}
function main(array $args): array {
    if ($args && $args !== ['--check']) return ['status'=>'invalid_arguments','exitCode'=>64,'sendingEnabled'=>false];
    if (preg_match('~/(www|public)(/|$)~',__DIR__)) return ['status'=>'public_directory_refused','exitCode'=>3,'sendingEnabled'=>false];
    $lock = null;
    try {
        umask(0077);
        $config = loadConfig(__DIR__.'/vsc-collection.config.json');
        if ($args === ['--check']) { $result=checkConfig($config); return $result+['exitCode'=>$result['ready']?0:3]; }
        if (!checkConfig($config)['ready'] || $config['enabled'] !== true) return poll($config);
        $lockPath=__DIR__.'/vsc-collection.lock';
        if (is_link($lockPath)) throw new \RuntimeException('invalid_lock');
        $lock=fopen($lockPath,'c');
        if (!$lock || !flock($lock,LOCK_EX|LOCK_NB)) return ['status'=>'already_running','exitCode'=>2,'sendingEnabled'=>false];
        return poll($config);
    } catch (\Throwable $error) { return ['status'=>'configuration_or_runtime_unavailable','exitCode'=>3,'sendingEnabled'=>false]; }
    finally { if (is_resource($lock)) { flock($lock,LOCK_UN); fclose($lock); } }
}
// HTTP execution is always refused, even if the configuration was misplaced.
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $result=main(array_slice($argv,1));
    echo json_encode($result,JSON_UNESCAPED_SLASHES).PHP_EOL;
    exit($result['exitCode']);
}
