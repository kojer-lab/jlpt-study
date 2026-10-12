/**
 * Rebuild one 300-word batch from the proven Kokoro JS WASM q8, jf_alpha
 * frontend. Receive WAV from browser then encode directly to 64kbps MP3 via
 * FFmpeg to avoid a second lossy compression pass.
 *
 * Does not modify any example audio, words/furigana, FSRS records, or N2
 * data. 50 verified word audio files per resumable GitHub commit.
 */
import {readFile, writeFile, mkdir, stat, unlink, rename, appendFile} from "node:fs/promises";
import {createServer} from "node:http";
import {join, resolve, dirname} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";

const root=resolve(".");
const base="audio/vocab/";
const plan=JSON.parse(await readFile(join(root,base,"browser-word-plan.json"),"utf8"));
// The workflow selects and resumes one isolated 300-word batch.
const batchNumber=Number(process.env.BROWSER_WORD_BATCH_NUMBER||"1");
const completedOutput=process.env.GITHUB_OUTPUT||null;
async function markProduced(yes){if(completedOutput)await appendFile(completedOutput,"produced="+String(!!yes)+"\n")}
const source=JSON.parse(await readFile(join(root,base,"source.json"),"utf8"));
const manifest=JSON.parse(await readFile(join(root,base,"manifest.json"),"utf8"));
const hash=data=>createHash("sha256").update(data).digest("hex");
if(plan.version!==1||!Number.isSafeInteger(batchNumber)||batchNumber<1||
 plan.batch_size!==300||plan.checkpoint_size!==50||
 plan.engine!=="kokoro-js-jp@0.2.0"||plan.voice!=="jf_alpha"||
 plan.runtime!=="wasm_q8"||plan.target_kbps!==64||plan.sample_rate!==24000||
 plan.mode!=="replace-word-only"||plan.word_count!==3233){
 throw new Error("Unexpected browser word-audio plan: refusing to modify production files");
}
const wordOverrides=new Map([
 // Known old static word audio read 吐く as つく. The taught reading is はく.
 ["oj-08cfe03cb3","はく"]
]);
const all=source.items.filter(x=>x.kind==="word");
if(all.length!==plan.word_count)throw new Error("Word count changed: expected 3233, got "+all.length);
if(batchNumber>Math.ceil(all.length/plan.batch_size))throw new Error("Word batch is out of range");
const start=(batchNumber-1)*plan.batch_size;
const end=Math.min(start+plan.batch_size,all.length);
if(start>=all.length)throw new Error("Batch beyond word count");
if(batchNumber!==1){
 const previous=join(root,base,"browser-word-batches/batch-"+String(batchNumber-1).padStart(4,"0")+".json");
 const ledger=JSON.parse(await readFile(previous,"utf8"));
 if(ledger.status!=="complete"||ledger.count!==300)throw new Error("Previous batch was not completed; cannot skip ahead");
}
const chosen=all.slice(start,end).map(x=>({...x,text:wordOverrides.get(x.id)||x.text}));
const paths=new Set(chosen.map(x=>x.path));
if(paths.size!==chosen.length||chosen.some(x=>x.voice!=="jf_alpha"||typeof x.text!=="string"||
 !x.text.trim()||x.text.trim().length>70||/[\r\n]/.test(x.text)||
 !x.path.startsWith(base)||!x.path.endsWith("-word.mp3")||x.path.includes("..")||x.path.includes("\\")))
 throw new Error("Invalid or duplicate word audio target");
if(new Set(chosen.map(x=>x.id)).size!==chosen.length)throw new Error("Duplicate word ID");
for(const x of chosen){
 const entry=manifest.files?.[x.id];
 if(entry?.word!==x.path)throw new Error("Word audio manifest mismatch for "+x.path);
 await stat(join(root,x.path));
}
const digest=hash(JSON.stringify(chosen.map(x=>[x.id,x.index,x.path,x.text,x.voice])));
const ledgerPath=base+"browser-word-batches/batch-"+String(batchNumber).padStart(4,"0")+".json";
const revisionPath=base+"repaired-revisions.json";
await mkdir(dirname(join(root,ledgerPath)),{recursive:true});
let ledger;
try{ledger=JSON.parse(await readFile(join(root,ledgerPath),"utf8"))}
catch(e){if(e.code!=="ENOENT")throw e;
 ledger={version:1,batch_number:batchNumber,start_index:start,count:chosen.length,
  total_words:all.length,source_sha256:digest,engine:plan.engine,voice:"jf_alpha",bitrate_kbps:64,
  status:"in_progress",completed:[]};
}
if(ledger.source_sha256!==digest||ledger.count!==chosen.length||ledger.start_index!==start||
 ledger.completed.length>chosen.length||
 ledger.completed.some((r,i)=>r.path!==chosen[i].path)){
 throw new Error("Published ledger differs from source; refusing to change MP3 files");
}
if(ledger.status==="complete"){
 if(ledger.completed.length!==chosen.length)throw Error("Corrupted completed word batch");
 console.log("Word batch already complete: "+ledger.completed.length+"/"+chosen.length);
 await markProduced(false);process.exit(0);
}
const already=ledger.completed.length;
for(const rec of ledger.completed){
 const bytes=await readFile(join(root,rec.path));
 if(hash(bytes)!==rec.new_sha256)throw new Error("Published MP3 changed unexpectedly: "+rec.path);
}
const pageOriginal=await readFile(join(root,"audio-punctuation-check.html"),"utf8");
const closing=pageOriginal.lastIndexOf("</script>");
if(closing<0||!pageOriginal.includes("async function getTts()"))
 throw new Error("Expected A/B audio engine unavailable");
const injected=String.raw`
window.__kojerWordGenerate=async(wordReading)=>{
 if(!wordReading||typeof wordReading!=="string")throw new Error("Empty word reading");
 const tts=await getTts();
 const audio=await tts.speak(wordReading,"jf_alpha");
 const wav=audio.toBlob();
 if(wav.size<1500)throw new Error("Generated WAV is unexpectedly short");
 const bytes=new Uint8Array(await wav.arrayBuffer());
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
  !(seconds>0.12&&seconds<45))throw new Error("Invalid MP3 encoding/duration: "+path);
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
 git("commit","-m","audio: browser Kokoro word batch "+batchNumber+" clips "+(progress-pending.length+1)+"-"+progress+"/"+chosen.length+" 64kbps");
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
 await page.waitForFunction(()=>typeof window.__kojerWordGenerate==="function",{timeout:120000});
 const runtime=await page.evaluate(()=>navigator.gpu?"webgpu":"wasm_q8");
 if(runtime!=="wasm_q8")throw new Error("Runner is not forced to the validated WASM q8 engine");
 console.log("START WORD AUDIO BATCH",batchNumber,"word indices",start,"..",end-1,"resume",already,"/",chosen.length,runtime);
 git("config","user.name","github-actions[bot]");
 git("config","user.email","41898282+github-actions[bot]@users.noreply.github.com");
 for(let i=already;i<chosen.length;i++){
  const item=chosen[i],path=join(root,item.path);
  const old=await readFile(path),oldsha=hash(old);
  let base64;
  for(let attempt=1;attempt<=2;attempt++){
   try{
    base64=await page.evaluate(text=>Promise.race([
     window.__kojerWordGenerate(text),
     new Promise((_,reject)=>setTimeout(()=>reject(new Error("TTS timeout after 180 seconds")),180000))
    ]),item.text.trim());
    break;
   }catch(error){
    console.error("Synthesis failed",item.path,"attempt",attempt,String(error).slice(0,500));
    if(attempt===2)throw error;
   }
  }
  const wav=Buffer.from(base64,"base64");
  if(wav.length<1500||wav.subarray(0,4).toString()!=="RIFF"||
   wav.subarray(8,12).toString()!=="WAVE")
   throw new Error("Browser WAV invalid: "+item.path);
  const wavTemp=path+".browser-word.wav",mp3Temp=path+".browser-word-pending";
  await writeFile(wavTemp,wav);
  try{
   // Direct single MP3 encode from the browser's lossless speech output.
   execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-y",
    "-i",wavTemp,"-map","0:a:0","-vn","-map_metadata","-1",
    "-c:a","libmp3lame","-ar","24000","-ac","1",
    "-b:a","64k","-f","mp3",mp3Temp],{timeout:60000});
   const bytes=await readFile(mp3Temp),newsha=hash(bytes);
   const duration=checkMp3(mp3Temp);
   const hasId3=bytes.subarray(0,3).toString()==="ID3";
   const hasMpegSync=bytes[0]===255&&(bytes[1]&0xe0)===0xe0;
   // Log diagnostics BEFORE touching production audio. Do not bypass any
   // MP3 validation when a source word produces unexpected short audio.
   console.log("WORD MP3 CHECK",JSON.stringify({
    path:item.path,reading:item.text,wavBytes:wav.length,oldBytes:old.length,
    mp3Bytes:bytes.length,duration_s:duration,first16:bytes.subarray(0,16).toString("hex"),
    validMp3Header:hasId3||hasMpegSync,sameSha:newsha===oldsha
   }));
   if(bytes.length<1200||newsha===oldsha||!(hasId3||hasMpegSync))
    throw new Error("64kbps word MP3 validation failed: "+item.path+
     " / bytes="+bytes.length+" / seconds="+duration+
     " / prefix="+bytes.subarray(0,12).toString("hex")+
     " / sameSha="+(newsha===oldsha));
   const probe=JSON.parse(execFileSync("ffprobe",["-v","error",
    "-show_entries","format=bit_rate","-of","json",mp3Temp],{encoding:"utf8"}));
   const rate=Number(probe.format?.bit_rate);
   if(!(rate>=58000&&rate<=74000))throw new Error("Unexpected word MP3 bitrate: "+rate);
   await rename(mp3Temp,path);
   ledger.completed.push({path:item.path,id:item.id,reading:item.text,
    old_sha256:oldsha,new_sha256:newsha,original_bytes:old.length,
    bytes:bytes.length,duration_s:Number(duration.toFixed(3))});
   pending.push(ledger.completed.at(-1));
  }finally{
   await unlink(wavTemp).catch(()=>{});
   await unlink(mp3Temp).catch(()=>{});
  }
  const progress=ledger.completed.length;
  console.log("GENERATED WORD",progress,"/",chosen.length,item.path,item.text);
  if(pending.length>=50||progress===chosen.length)await publishCheckpoint();
 }
 console.log("COMPLETE WORD BATCH",batchNumber,chosen.length,"/",all.length,"words replaced at 64kbps; FSRS untouched");
 await markProduced(true);
 // Give GitHub Pages a chance to publish a finished batch before next batch.
 if(batchNumber<Math.ceil(all.length/plan.batch_size))
  await new Promise(resolve=>setTimeout(resolve,135000));
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
