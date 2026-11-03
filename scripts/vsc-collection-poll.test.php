<?php
declare(strict_types=1);
require __DIR__.'/vsc-collection-poll.php';
use function AtlasVscCollection\{checkConfig,poll,loadConfig};
function verify(bool $value,string $message): void { if (!$value) throw new RuntimeException($message); }
$secret='synthetic-only-do-not-use-in-deployment-1234';
$config=['version'=>1,'enabled'=>true,'cronSecret'=>$secret];
$bodies=[
 ['inspected'=>2,'matched'=>1,'recorded'=>1,'hasMore'=>false],
 ['inspected'=>3,'held'=>1,'cancelled'=>1,'automated'=>0,'hasMore'=>false],
 ['sourceContacts'=>5,'sourceSmsBlocked'=>1,'unknownSmsStatus'=>0,'matchedSources'=>1,'unmappedSources'=>0,'peopleStopped'=>1,'cancelled'=>1,'sendingEnabled'=>false]
];
$passed=0;
verify(checkConfig($config)['ready'],'valid configuration');
foreach (['', 'short', $secret."\n"] as $key) verify(!checkConfig($config+[])['issues'] && !checkConfig(array_replace($config,['cronSecret'=>$key]))['ready'],'invalid secret refused');
verify(!checkConfig($config+['baseUrl'=>'https://foreign.invalid'])['ready'],'alternate origin refused');
foreach ([false,'true',1,null] as $enabled) {
 $r=poll(array_replace($config,['enabled'=>$enabled]),static function(){throw new RuntimeException('network must not run');});
 verify($r['exitCode']===3 && !$r['stages'],'disabled never calls network');
}
$passed++;
$calls=[];
$r=poll($config,static function($url,$key,$timeout) use (&$calls,$bodies,$secret){
 verify($key===$secret,'header key'); $i=count($calls); $calls[]=[$url,$timeout];
 return ['status'=>200,'body'=>json_encode($bodies[$i]+['private'=>$secret])];
});
verify($r['exitCode']===0 && count($calls)===3 && $r['sendingEnabled']===false,'three complete collectors');
verify(array_column($calls,0)===array_map(static fn($p)=>AtlasVscCollection\QA_ORIGIN.$p,['/api/cron/vsc-replies','/api/cron/vsc-historical-inbound','/api/cron/vsc-sms-stops']),'exact collection URLs');
verify(!str_contains(json_encode($r),$secret),'private response fields dropped');$passed++;
foreach ([[0,['hasMore'=>true]],[1,['hasMore'=>true]],[2,['unknownSmsStatus'=>1]],[2,['unmappedSources'=>1]]] as [$index,$change]) {
 $n=0;$r=poll($config,static function() use (&$n,$bodies,$index,$change){$i=$n++;return ['status'=>200,'body'=>json_encode(array_replace($bodies[$i],$i===$index?$change:[]))];});
 verify($r['exitCode']===2 && $n===3,'incomplete without loop');
}$passed++;
foreach (['http','exception','json','large','negative','missing_more'] as $failure) {
 $n=0;$r=poll($config,static function() use (&$n,$failure,$bodies,$secret){
  $i=$n++;if($i)return ['status'=>200,'body'=>json_encode($bodies[$i])];
  if($failure==='exception')throw new RuntimeException($secret);
  if($failure==='http')return ['status'=>302,'body'=>$secret];
  if($failure==='json')return ['status'=>200,'body'=>'{'];
  if($failure==='large')return ['status'=>200,'body'=>str_repeat('x',17000)];
  $body=$bodies[0];if($failure==='negative')$body['inspected']=-1;else unset($body['hasMore']);
  return ['status'=>200,'body'=>json_encode($body)];
 });
 verify($r['exitCode']===1 && $n===3 && $r['stages'][1]['status']==='complete','failure preserves independent collectors, no retry');
 verify(!str_contains(json_encode($r),$secret),'error sanitized');
}$passed++;
$temp=sys_get_temp_dir().'/atlas-vsc-'.bin2hex(random_bytes(8));mkdir($temp,0700);
$path=$temp.'/vsc-collection.config.json';$runner=$temp.'/vsc-collection-poll.php';copy(__DIR__.'/vsc-collection-poll.php',$runner);
function cliResult(string $runner,array $args=[]): array {
 $process=proc_open(array_merge([PHP_BINARY,$runner],$args),[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
 fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$code=proc_close($process);
 verify($error==='','no raw runtime errors');return [$code,json_decode($out,true,8,JSON_THROW_ON_ERROR)];
}
try {
 file_put_contents($path,json_encode(array_replace($config,['enabled'=>false])));chmod($path,0600);
 verify(loadConfig($path)['version']===1,'private configuration read');
 chmod($path,0644);clearstatcache();$refused=false;try{loadConfig($path);}catch(Throwable){$refused=true;}verify($refused,'readable secret file refused');chmod($path,0600);clearstatcache();
 verify(cliResult($runner,['--check'])[0]===0,'check without network');
 verify(cliResult($runner)[0]===3,'no-argument cron remains disabled');
 verify(cliResult($runner,['--run'])[0]===64,'unexpected arguments refused');$passed++;
 file_put_contents($path,json_encode($config));
 $lock=fopen($temp.'/vsc-collection.lock','c');flock($lock,LOCK_EX);
 $result=cliResult($runner);verify($result[0]===2 && $result[1]['status']==='already_running','overlapping invocation refused before network');
 flock($lock,LOCK_UN);fclose($lock);$passed++;
} finally { foreach ([$path,$runner,$temp.'/vsc-collection.lock'] as $file)if(is_file($file))unlink($file);rmdir($temp); }
echo $passed." PHP collection tests passed; no provider calls\n";
