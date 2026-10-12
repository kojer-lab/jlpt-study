/**
 * Rebuild one approved 300-example batch with the SAME browser Kokoro JS and
 * LAME encoder used by the successful 20-example A/B pilot.
 *
 * This does not rewrite vocabulary words, furigana, audio/manifest.json,
 * study/FSRS state, or any N2 material.
 *
 * Commit/push each 50 verified replacements to main. On a failed Action, the
 * next run resumes at the first unpublished item, not from zero.
 */
import {readFile, writeFile, mkdir, stat} from "node:fs/promises";
import {createServer} from "node:http";
import {join, resolve, dirname} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";

const root=resolve(".");
const base="audio/vocab/";
const plan=JSON.parse(await readFile(join(root,base,"browser-batch-plan.json"),"utf8"));
// A workflow_dispatch input selects one isolated, restartable batch. The
// checked-in plan remains the approval policy and never needs to be rewritten.
const batchNumber=Number(process.env.BROWSER_AUDIO_BATCH_NUMBER||batchNumber);
const source=JSON.parse(await readFile(join(root,base,"source.json"),"utf8"));
const manifest=JSON.parse(await readFile(join(root,base,"manifest.json"),"utf8"));
const hash=data=>createHash("sha256").update(data).digest("hex");
if(plan.version!==1||!Number.isSafeInteger(batchNumber)||batchNumber<1||
 !Number.isInteger(plan.batch_number)||plan.batch_number!==1||
 plan.batch_size!==300||plan.engine!=="kokoro-js-jp@0.2.0"||
 plan.voice!=="jf_alpha"||plan.mode!=="replace-example-only"){
 throw new Error("Unexpected browser batch plan: will not modify production audio");
}
const all=source.items.filter(x=>x.kind==="example");
const start=(batchNumber-1)*plan.batch_size;
const end=Math.min(start+plan.batch_size,all.length);
if(start>=all.length)throw new Error("Batch beyond example count");
if(batchNumber!==1){
 const previous=join(root,base,"browser-batches/batch-"+String(batchNumber-1).padStart(4,"0")+".json");
 const ledger=JSON.parse(await readFile(previous,"utf8"));
 if(ledger.status!=="complete"||ledger.count!==300)throw new Error("Previous batch was not completed; cannot skip ahead");
}
const chosen=all.slice(start,end);
const paths=new Set(chosen.map(x=>x.path));
if(paths.size!==chosen.length||chosen.some(x=>x.voice!=="jf_alpha"||!x.text?.trim()||x.text.trim().endsWith("。")||!x.path.startsWith(base)||!x.path.endsWith(".mp3")))
 throw new Error("Invalid or duplicate example targets");
for(const x of chosen){
 const entry=manifest.files?.[x.id];
 if(entry?.examples?.[x.index]!==x.path)throw new Error("Manifest mismatch for "+x.path);
 await stat(join(root,x.path));
}
const digest=hash(JSON.stringify(chosen.map(x=>[x.id,x.index,x.path,x.text,x.voice])));
const ledgerPath=base+"browser-batches/batch-"+String(batchNumber).padStart(4,"0")+".json";
const revisionPath=base+"repaired-revisions.json";
await mkdir(dirname(join(root,ledgerPath)),{recursive:true});
let ledger;
try{ledger=JSON.parse(await readFile(join(root,ledgerPath),"utf8"))}
catch(e){if(e.code!=="ENOENT")throw e;
 ledger={version:1,batch_number:batchNumber,start_index:start,count:chosen.length,
  total_examples:all.length,source_sha256:digest,engine:plan.engine,voice:"jf_alpha",
  status:"in_progress",completed:[]};
}
if(ledger.source_sha256!==digest||ledger.count!==chosen.length||ledger.start_index!==start||
 ledger.completed.length>chosen.length||
 ledger.completed.some((r,i)=>r.path!==chosen[i].path)){
 throw new Error("Published ledger differs from source; refusing to change MP3 files");
}
if(ledger.status==="complete"){console.log("Batch already complete: "+ledger.completed.length+"/"+chosen.length);process.exit(0)}
const already=ledger.completed.length;
for(const rec of ledger.completed){
 const bytes=await readFile(join(root,rec.path));
 if(hash(bytes)!==rec.new_sha256)throw new Error("Published MP3 changed unexpectedly: "+rec.path);
}
const pageOriginal=await readFile(join(root,"audio-punctuation-check.html"),"utf8");
const closing=pageOriginal.lastIndexOf("</script>");
if(closing<0||!pageOriginal.includes("async function getTts()")||!pageOriginal.includes("async function wavToMp3("))
 throw new Error("Expected A/B audio engine unavailable");
const injected=String.raw`
window.__kojerBatchGenerate=async(sentence)=>{
 if(!sentence||typeof sentence!=="string"||sentence.endsWith("。"))throw new Error("Invalid normalized Japanese text");
 const tts=await getTts();
 const audio=await tts.speak(sentence,"jf_alpha");
 const mp3=await wavToMp3(audio.toBlob());
 if(mp3.size<2500)throw new Error("Generated audio too short");
 const bytes=new Uint8Array(await mp3.arrayBuffer());
 let ascii="";
 for(let i=0;i<bytes.length;i+=8192)ascii+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(ascii);
};
`;
const pageHtml=pageOriginal.slice(0,closing)+injected+pageOriginal.slice(closing);
const server=createServer((req,res)=>{
 const path=new URL(req.url||"/","http://localhost").pathname;
 if(path!=="/audio-punctuation-check.html"){res.writeHead(404);res.end("Not found");return}
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
 res.end(pageHtml);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser;
let pending=[];
function git(...args){const ret=execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","inherit"],timeout:180000}).trim();if(ret)console.log("git",args[0],ret.slice(0,350));return ret}
function checkMp3(path){
 const result=execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_name,sample_rate,channels:format=duration","-of","json",path],{encoding:"utf8",timeout:30000});
 const json=JSON.parse(result);
 const stream=json.streams?.[0],seconds=Number(json.format?.duration);
 if(stream?.codec_name!=="mp3"||stream?.sample_rate!=="24000"||stream.channels!==1||
  !(seconds>0.30&&seconds<45))throw new Error("Invalid MP3 encoding/duration: "+path);
 return seconds;
}
async function publishCheckpoint(){
 if(!pending.length)return;
 const progress=ledger.completed.length;
 const rev=JSON.parse(await readFile(join(root,revisionPath),"utf8"));
 if(rev.version!==1||!rev.files)throw new Error("Invalid revision map");
 for(const rec of pending)rev.files[rec.path]=rec.new_sha256.slice(0,16);
 await writeFile(join(root,revisionPath),JSON.stringify(rev,null,2)+"\n");
 ledger.status=progress===chosen.length?"complete":"in_progress";
 ledger.updated_at=new Date().toISOString();
 await writeFile(join(root,ledgerPath),JSON.stringify(ledger,null,2)+"\n");
 const staged=[...pending.map(x=>x.path),revisionPath,ledgerPath];
 git("add","--",...staged);
 const diff=git("diff","--cached","--name-only").split("\n").filter(Boolean);
 if(diff.length!==staged.length||diff.some(x=>!staged.includes(x)))throw new Error("Staged unexpected repository changes");
 git("commit","-m","audio: browser Kokoro batch "+batchNumber+" clips "+(progress-pending.length+1)+"-"+progress+"/"+chosen.length);
 for(let i=1;i<=5;i++){
  git("fetch","origin","main");
  try{git("rebase","origin/main")}catch(error){
   try{git("rebase","--abort")}catch{}
   throw new Error("Concurrent MP3 changes conflict; manual inspection required");
  }
  try{git("push","origin","HEAD:main");
   console.log("CHECKPOINT PUBLISHED",progress,"/",chosen.length,"batch",batchNumber);
   pending=[];return;
  }catch(error){if(i===5)throw new Error("Failed to publish progress after five tries")}
 }
}
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-features=WebGPU"]});
 const page=await browser.newPage({locale:"ja-JP"});
 await page.addInitScript(()=>{Object.defineProperty(navigator,"gpu",{configurable:true,value:undefined})});
 page.setDefaultTimeout(120000);
 page.on("pageerror",e=>console.error("BROWSER PAGE ERROR",String(e)));
 page.on("console",msg=>{if(msg.type()==="error")console.error("BROWSER",msg.text().slice(0,400))});
 await page.goto("http://127.0.0.1:"+port+"/audio-punctuation-check.html",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>typeof window.__kojerBatchGenerate==="function",{timeout:120000});
 const runtime=await page.evaluate(()=>navigator.gpu?"webgpu":"wasm_q8");
 if(runtime!=="wasm_q8")throw new Error("Runner is not forced to the validated WASM q8 engine");
 console.log("START BROWSER AUDIO BATCH",batchNumber,"example indices",start,"..",end-1,"resume",already,"/",chosen.length,runtime);
 git("config","user.name","github-actions[bot]");
 git("config","user.email","41898282+github-actions[bot]@users.noreply.github.com");
 for(let i=already;i<chosen.length;i++){
  const item=chosen[i],path=join(root,item.path);
  const old=await readFile(path),oldsha=hash(old);
  let base64;
  for(let attempt=1;attempt<=2;attempt++){
   try{
    base64=await page.evaluate(text=>Promise.race([
     window.__kojerBatchGenerate(text),
     new Promise((_,reject)=>setTimeout(()=>reject(new Error("TTS timeout after 180 seconds")),180000))
    ]),item.text.trim());
    break;
   }catch(error){
    console.error("Synthesis failed",item.path,"attempt",attempt,String(error).slice(0,500));
    if(attempt===2)throw error;
   }
  }
  const bytes=Buffer.from(base64,"base64"),newsha=hash(bytes);
  if(bytes.length<2500||newsha===oldsha||(bytes.toString("ascii",0,3)!=="ID3"&&bytes[0]!==255))
   throw new Error("New MP3 invalid or identical: "+item.path);
  const temp=path+".browser-pending";
  await writeFile(temp,bytes);
  try{const duration=checkMp3(temp);await writeFile(path,bytes);
   ledger.completed.push({path:item.path,id:item.id,index:item.index,old_sha256:oldsha,new_sha256:newsha,
    bytes:bytes.length,duration_s:Number(duration.toFixed(3))});
   pending.push(ledger.completed.at(-1));
  }finally{await import("node:fs/promises").then(fs=>fs.unlink(temp).catch(()=>{}))}
  const progress=ledger.completed.length;
  console.log("GENERATED",progress,"/",chosen.length,item.path,bytes.length);
  if(pending.length>=50||progress===chosen.length)await publishCheckpoint();
 }
 console.log("COMPLETE BATCH",batchNumber,chosen.length,"/",all.length,"examples replaced; FSRS untouched");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
