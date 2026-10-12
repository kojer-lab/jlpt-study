/**
 * Compress the previously approved browser-Kokoro 128kbps example MP3s
 * to 64kbps WITHOUT synthesizing speech again.
 *
 * Input is pinned to all 11 successful browser regeneration ledgers and each
 * input's original SHA256. Output modifies ONLY the listed example MP3 files,
 * repaired-revisions.json (to bust Safari/Chrome caches), and this batch ledger.
 * Commit/push every 50 verified audio clips. Reruns resume at the last
 * published checkpoint and refuse unexpectedly modified source files.
 *
 * Launch with BROWSER_AUDIO_COMPRESS_BATCH_NUMBER=1..11
 */
import {readFile,writeFile,mkdir,stat,rename,unlink} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const root=resolve(".");
const pathPrefix="audio/vocab/";
const plan=JSON.parse(await readFile(join(root,pathPrefix,"compression-plan.json"),"utf8"));
const batchNumber=Number(process.env.BROWSER_AUDIO_COMPRESS_BATCH_NUMBER||"1");
const sha=data=>createHash("sha256").update(data).digest("hex");
const safePath=p=>typeof p==="string"&&p.startsWith(pathPrefix)&&p.endsWith(".mp3")&&
 !p.includes("..")&&!p.includes("\\")&&!p.includes("\0")&&/-ex[12]\.mp3$/.test(p);
function assert(cond,message){if(!cond)throw new Error(message)}
assert(plan.version===1&&plan.mode==="transcode-example-only"&&
 plan.total_examples===3104&&plan.batch_size===300&&plan.checkpoint_size===50&&
 plan.source_batch_count===11&&plan.original_kbps===128&&plan.target_kbps===64&&
 plan.target_sample_rate===24000&&plan.target_channels===1&&
 Number.isSafeInteger(batchNumber)&&batchNumber>=1&&batchNumber<=11,
 "Unexpected plan or batch: refusing to change audio files");

const original=[];
for(let n=1;n<=plan.source_batch_count;n++){
 const name=pathPrefix+"browser-batches/batch-"+String(n).padStart(4,"0")+".json";
 const data=JSON.parse(await readFile(join(root,name),"utf8"));
 const expected=Math.min(300,plan.total_examples-(n-1)*300);
 assert(data.status==="complete"&&data.batch_number===n&&data.start_index===(n-1)*300&&
  data.count===expected&&data.completed?.length===expected,
  "Approved browser speech batch missing or incomplete: "+n);
 for(const item of data.completed){
  assert(safePath(item.path)&&/^[0-9a-f]{64}$/.test(item.new_sha256)&&
   Number.isFinite(item.duration_s)&&item.duration_s>0.30,
   "Invalid approved input MP3 entry: "+item.path);
  original.push(item);
 }
}
assert(original.length===plan.total_examples,
 "Expected all 3104 successfully regenerated example files");
assert(new Set(original.map(x=>x.path)).size===original.length,
 "Duplicate path in approved browser audio set");

const start=(batchNumber-1)*plan.batch_size;
const chosen=original.slice(start,Math.min(start+plan.batch_size,original.length));
const chosenDigest=sha(JSON.stringify(chosen.map(x=>[x.path,x.new_sha256])));
const ledgerPath=pathPrefix+"compression-batches/batch-"+String(batchNumber).padStart(4,"0")+".json";
const revisionPath=pathPrefix+"repaired-revisions.json";
await mkdir(dirname(join(root,ledgerPath)),{recursive:true});

// Never advance to a later batch until the previous one was committed completely.
if(batchNumber>1){
 const previousPath=pathPrefix+"compression-batches/batch-"+String(batchNumber-1).padStart(4,"0")+".json";
 const previous=JSON.parse(await readFile(join(root,previousPath),"utf8"));
 const expected=Math.min(300,plan.total_examples-(batchNumber-2)*300);
 assert(previous.status==="complete"&&previous.batch_number===batchNumber-1&&
  previous.count===expected&&previous.completed?.length===expected,
  "Previous compression batch is not fully published");
}

let ledger;
try{ledger=JSON.parse(await readFile(join(root,ledgerPath),"utf8"))}
catch(e){
 if(e.code!=="ENOENT")throw e;
 ledger={
  version:1,mode:"transcode-example-only",batch_number:batchNumber,
  start_index:start,count:chosen.length,total_examples:original.length,
  source_sha256:chosenDigest,source_kbps:128,target_kbps:64,
  status:"in_progress",completed:[],updated_at:null
 };
}
assert(ledger.version===1&&ledger.batch_number===batchNumber&&
 ledger.start_index===start&&ledger.count===chosen.length&&
 ledger.source_sha256===chosenDigest&&ledger.target_kbps===64&&
 Array.isArray(ledger.completed)&&ledger.completed.length<=chosen.length&&
 ledger.completed.every((item,i)=>item.path===chosen[i].path&&item.original_sha256===chosen[i].new_sha256),
 "Compression resume ledger does not match original input manifest");
for(const item of ledger.completed){
 const data=await readFile(join(root,item.path));
 assert(sha(data)===item.new_sha256,"Previously published 64kbps audio changed: "+item.path);
}
if(ledger.status==="complete"){
 assert(ledger.completed.length===chosen.length,"Completed ledger has missing MP3s");
 console.log("ALREADY COMPLETE",batchNumber,chosen.length);
 process.exit(0);
}

const checkMp3=file=>{
 const text=execFileSync("ffprobe",[
  "-v","error","-show_entries","stream=codec_name,sample_rate,channels:format=duration,bit_rate",
  "-of","json",file],{encoding:"utf8",timeout:30000});
 const d=JSON.parse(text),stream=d.streams?.[0];
 const seconds=Number(d.format?.duration),bitrate=Number(d.format?.bit_rate);
 assert(stream?.codec_name==="mp3"&&stream.sample_rate==="24000"&&stream.channels===1&&
  Number.isFinite(seconds)&&seconds>.30&&seconds<45,
  "MP3 format/duration invalid: "+file);
 return {seconds,bitrate};
};
function git(...args){
 const output=execFileSync("git",args,{cwd:root,encoding:"utf8",
  stdio:["ignore","pipe","inherit"],timeout:180000}).trim();
 if(output)console.log("git",args[0],output.slice(0,260));
 return output;
}
let pending=[];
async function publishCheckpoint(){
 if(!pending.length)return;
 const progress=ledger.completed.length;
 const revisions=JSON.parse(await readFile(join(root,revisionPath),"utf8"));
 assert(revisions.version===1&&revisions.files&&typeof revisions.files==="object",
  "Cached audio revisions mapping has unexpected format");
 for(const item of pending)revisions.files[item.path]=item.new_sha256.slice(0,16);
 await writeFile(join(root,revisionPath),JSON.stringify(revisions,null,2)+"\n");
 ledger.updated_at=new Date().toISOString();
 ledger.status=progress===chosen.length?"complete":"in_progress";
 await writeFile(join(root,ledgerPath),JSON.stringify(ledger,null,2)+"\n");
 const staged=[...pending.map(x=>x.path),revisionPath,ledgerPath];
 git("add","--",...staged);
 const changed=git("diff","--cached","--name-only").split("\n").filter(Boolean);
 assert(changed.length===staged.length&&changed.every(x=>staged.includes(x)),
  "Unexpected changes staged with audio compression");
 git("commit","-m","audio: convert example MP3 batch "+batchNumber+
  " clips "+(progress-pending.length+1)+"-"+progress+"/"+chosen.length+" to 64kbps");
 for(let attempt=1;attempt<=5;attempt++){
  git("fetch","origin","main");
  try{git("rebase","origin/main")}
  catch(error){
   try{git("rebase","--abort")}catch{}
   throw new Error("Concurrent audio writes conflict, halted safely");
  }
  try{
   git("push","origin","HEAD:main");
   console.log("CHECKPOINT PUBLISHED",progress,"/",chosen.length,"batch",batchNumber);
   pending=[];return;
  }catch(error){
   if(attempt===5)throw new Error("Could not publish checkpoint after 5 tries");
  }
 }
}

git("config","user.name","github-actions[bot]");
git("config","user.email","41898282+github-actions[bot]@users.noreply.github.com");
console.log("START BATCH",batchNumber,"/",11,"range",start+1,"..",start+chosen.length,
 "resume",ledger.completed.length,"/",chosen.length);
for(let i=ledger.completed.length;i<chosen.length;i++){
 const item=chosen[i],file=join(root,item.path),prior=await readFile(file);
 const oldhash=sha(prior);
 assert(oldhash===item.new_sha256,
  "Source file differs from the proven 128kbps browser audio; refusing "+item.path);
 const input=checkMp3(file);
 assert(input.bitrate>=115000&&input.bitrate<=145000,
  "Source MP3 is not approximately 128kbps: "+item.path+" ("+input.bitrate+")");
 const temp=file+".compress-64-pending";
 try{
  execFileSync("ffmpeg",[
   "-hide_banner","-loglevel","error","-nostdin","-y",
   "-i",file,"-map","0:a:0","-vn","-map_metadata","-1",
   "-c:a","libmp3lame","-ar","24000","-ac","1","-b:a","64k",temp
  ],{timeout:60000});
  const converted=await readFile(temp),out=checkMp3(temp),newhash=sha(converted);
  assert(converted.length>2000&&converted.length<prior.length&&newhash!==oldhash,
   "New 64kbps file is invalid or has not reduced size: "+item.path);
  assert(out.bitrate>=59000&&out.bitrate<=72000&&
   Math.abs(out.seconds-input.seconds)<.15,
   "64kbps conversion failed codec/length validation: "+item.path);
  // Atomic replacement: only after decoding, codec and SHA verification.
  await rename(temp,file);
  ledger.completed.push({
   path:item.path,original_sha256:oldhash,new_sha256:newhash,
   original_bytes:prior.length,compressed_bytes:converted.length,
   duration_s:Number(out.seconds.toFixed(3))
  });
  pending.push(ledger.completed.at(-1));
  console.log("CONVERTED",ledger.completed.length,"/",chosen.length,item.path,
   prior.length,"->",converted.length);
  if(pending.length>=plan.checkpoint_size||ledger.completed.length===chosen.length)
   await publishCheckpoint();
 }finally{await unlink(temp).catch(()=>{})}
}
console.log("COMPLETE 64KBPS BATCH",batchNumber,"/",11,
 "converted",ledger.completed.length,"examples; word audio and study records untouched");
