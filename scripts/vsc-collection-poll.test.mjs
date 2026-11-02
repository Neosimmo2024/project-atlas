import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkConfiguration,pollVscCollection,QA_ORIGIN} from './vsc-collection-poll.mjs';
const secret='synthetic-secret-used-only-in-tests-1234';
const env={CRON_SECRET:secret,VSC_COLLECTION_RUN_ENABLED:'true'};
const bodies=[{inspected:2,matched:1,recorded:1,hasMore:false},{inspected:3,held:1,cancelled:1,automated:0,hasMore:false},{sourceContacts:5,sourceSmsBlocked:1,unknownSmsStatus:0,matchedSources:1,unmappedSources:0,peopleStopped:1,cancelled:1,sendingEnabled:false}];
const response=(body)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
test('configuration check never exposes credentials and refuses alternate destinations',()=>{
 assert.equal(checkConfiguration(env).ready,true);
 for(const target of ['https://evil.invalid',QA_ORIGIN+'/',QA_ORIGIN+'?token=private'])assert.deepEqual(checkConfiguration({...env,VSC_COLLECTION_BASE_URL:target}).issues,['VSC_COLLECTION_BASE_URL']);
 for(const key of ['', 'short',secret+'\n'])assert.equal(checkConfiguration({...env,CRON_SECRET:key}).ready,false);
 assert.ok(!JSON.stringify(checkConfiguration(env)).includes(secret));
});
test('disabled and invalid configuration never calls the network',async()=>{
 for(const flag of [undefined,'false','TRUE','1']){const r=await pollVscCollection({...env,VSC_COLLECTION_RUN_ENABLED:flag},{fetchImpl:()=>assert.fail('network')});assert.equal(r.exitCode,3);}
 const r=await pollVscCollection({...env,VSC_COLLECTION_BASE_URL:'https://production.invalid'},{fetchImpl:()=>assert.fail('network')});assert.equal(r.exitCode,3);
});
test('runs exactly three sequential collection GETs, no dispatch and no private response fields',async()=>{
 const calls=[];const r=await pollVscCollection(env,{fetchImpl:async(url,init)=>{calls.push({url,init});return response({...bodies[calls.length-1],private:'PII',token:secret});}});
 assert.equal(r.exitCode,0);assert.equal(r.sendingEnabled,false);
 assert.deepEqual(calls.map(c=>c.url),['/api/cron/vsc-replies','/api/cron/vsc-historical-inbound','/api/cron/vsc-sms-stops'].map(p=>QA_ORIGIN+p));
 for(const c of calls){assert.equal(c.init.method,'GET');assert.equal(c.init.redirect,'error');assert.equal(c.init.headers.authorization,`Bearer ${secret}`);assert.ok(c.init.signal);}
 assert.ok(!JSON.stringify(r).includes(secret));assert.ok(!JSON.stringify(r).includes('PII'));
});
test('reports pending pages and unknown or unmapped STOPs without looping',async()=>{
 for(const changed of [{index:0,value:{hasMore:true}},{index:1,value:{hasMore:true}},{index:2,value:{unknownSmsStatus:1}},{index:2,value:{unmappedSources:1}}]){let calls=0;const r=await pollVscCollection(env,{fetchImpl:async()=>{const i=calls++;return response({...bodies[i],...(i===changed.index?changed.value:{})});}});assert.equal(calls,3);assert.equal(r.exitCode,2);}
});
test('continues independent collectors after failure, sanitizes errors, never retries',async()=>{
 for(const failure of ['http','network','json','count','large']){let calls=0;const r=await pollVscCollection(env,{fetchImpl:async()=>{const i=calls++;if(i)return response(bodies[i]);if(failure==='http')return new Response('private '+secret,{status:503});if(failure==='network')throw new Error(secret);if(failure==='json')return new Response('{');if(failure==='large')return new Response('x'.repeat(17000));return response({...bodies[0],inspected:-1});}});assert.equal(calls,3);assert.equal(r.exitCode,1);assert.equal(r.stages[1].status,'complete');assert.ok(!JSON.stringify(r).includes(secret));}
});
