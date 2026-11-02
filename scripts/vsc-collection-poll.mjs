/** QA collection only. No dispatch endpoint, provider credential or retry. */
import {pathToFileURL} from 'node:url';
export const QA_ORIGIN='https://project-atlas-qa-beta-1-git-feature-vsc-campai-f0c292-neos-immo.vercel.app';
const stages=[
 {name:'replies',path:'/api/cron/vsc-replies',timeout:180000,counts:['inspected','matched','recorded'],more:true},
 {name:'historical',path:'/api/cron/vsc-historical-inbound',timeout:120000,counts:['inspected','held','cancelled','automated'],more:true},
 {name:'smsStops',path:'/api/cron/vsc-sms-stops',timeout:120000,counts:['sourceContacts','sourceSmsBlocked','unknownSmsStatus','matchedSources','unmappedSources','peopleStopped','cancelled'],more:false}
];
export function checkConfiguration(env){
 const issues=[];
 if((env.VSC_COLLECTION_BASE_URL??QA_ORIGIN)!==QA_ORIGIN)issues.push('VSC_COLLECTION_BASE_URL');
 if(typeof env.CRON_SECRET!=='string'||env.CRON_SECRET.length<32||env.CRON_SECRET.length>4000||/[\r\n\x00]/.test(env.CRON_SECRET))issues.push('CRON_SECRET');
 return {ready:issues.length===0,issues,target:'qa',sendingEnabled:false};
}
async function readBounded(response){
 if(!response.body)throw new Error('empty');
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384)throw new Error('oversized');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function pollVscCollection(env,{fetchImpl=fetch}={}){
 const config=checkConfiguration(env);
 if(!config.ready||env.VSC_COLLECTION_RUN_ENABLED!=='true')return {status:'disabled',exitCode:3,issues:config.issues,sendingEnabled:false,stages:[]};
 const results=[];
 for(const stage of stages){
  try{
   const response=await fetchImpl(QA_ORIGIN+stage.path,{method:'GET',headers:{authorization:`Bearer ${env.CRON_SECRET}`,accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(stage.timeout)});
   if(!response.ok){results.push({name:stage.name,status:'failed',httpStatus:response.status});continue;}
   const data=await readBounded(response);
   if(!data||stage.counts.some(k=>!Number.isSafeInteger(data[k])||data[k]<0)||(stage.more&&typeof data.hasMore!=='boolean')||(!stage.more&&data.sendingEnabled!==false))throw new Error('invalid');
   const incomplete=stage.more?data.hasMore:data.unknownSmsStatus>0||data.unmappedSources>0;
   results.push({name:stage.name,status:incomplete?'incomplete':'complete',...Object.fromEntries(stage.counts.map(k=>[k,data[k]])),...(stage.more?{hasMore:data.hasMore}:{})});
  }catch{results.push({name:stage.name,status:'failed'});}
 }
 const failed=results.some(r=>r.status==='failed'),incomplete=results.some(r=>r.status==='incomplete');
 return {status:failed?'failed':incomplete?'incomplete':'complete',exitCode:failed?1:incomplete?2:0,sendingEnabled:false,stages:results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args.length!==1||!['--check','--run'].includes(args[0])){console.error('Usage: node scripts/vsc-collection-poll.mjs --check|--run');process.exitCode=64;}
 else{
  const result=args[0]==='--check'?checkConfiguration(process.env):await pollVscCollection(process.env);
  console.log(JSON.stringify(result));process.exitCode=args[0]==='--check'?(result.ready?0:3):result.exitCode;
 }
}
