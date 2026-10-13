/** N2 3904 MP3 browser Kokoro synthesis, restartable in 50-file checkpoints. */
import {readFile,writeFile,mkdir,rename,unlink} from "node:fs/promises";
import {createServer} from "node:http";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";
const root=resolve("."),base="audio/n2/",batch=Number(process.env.N2_AUDIO_BATCH||1);
const read=async p=>JSON.parse(await readFile(join(root,p),"utf8"));
const plan=await read(base+"plan.json"),source=await read(base+"source.json");
if(plan.version!==1||plan.total_clips!==3904||plan.batch_size!==100||plan.checkpoint_size!==50||
 plan.approval!=="n2-separate-audio-only"||plan.engine!=="kokoro-js-jp@0.2.0"||
 plan.runtime!=="wasm_q8"||plan.voice!=="jf_alpha"||plan.target_kbps!==64||
 source.items?.length!==3904||source.word_total!==1952||source.example_total!==1952||
 !Number.isInteger(batch)||batch<1||batch>40)throw Error("Unapproved N2 batch or source");
const begin=(batch-1)*100,items=source.items.slice(begin,begin+100),hash=b=>createHash("sha256").update(b).digest("hex");
const manifestPath=base+"manifest.json",revPath=base+"revisions.json",progressPath=base+"progress.json";
const ledgerPath=base+"batches/batch-"+String(batch).padStart(4,"0")+".json";
if(batch>1){const prev=await read(base+"batches/batch-"+String(batch-1).padStart(4,"0")+".json");
 if(prev.status!=="complete"||prev.completed.length!==prev.count)throw Error("Previous batch incomplete");}
const catalogHash=hash(JSON.stringify(items.map(x=>[x.id,x.kind,x.text,x.path])));
let ledger;try{ledger=await read(ledgerPath)}
catch(e){if(e.code!=="ENOENT")throw e;ledger={version:1,batch,start_index:begin,count:items.length,source_sha256:catalogHash,status:"in_progress",completed:[]}}
if(ledger.source_sha256!==catalogHash||ledger.count!==items.length||
 ledger.completed.some((r,i)=>r.path!==items[i].path))throw Error("Source/checkpoint mismatch");
if(ledger.status==="complete"){console.log("Already complete",batch);process.exit(0)}
const manifest=await read(manifestPath),revisions=await read(revPath),progress=await read(progressPath);
if(!manifest.files||!revisions.files||manifest.version!==1||revisions.version!==1)throw Error("Invalid manifest");
await mkdir(join(root,base+"mp3"),{recursive:true});
await mkdir(join(root,base+"batches"),{recursive:true});
const runGit=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:180000,stdio:["ignore","pipe","inherit"]}).trim();
function probe(path,kind){
 const p=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","stream=codec_name,sample_rate,channels:format=duration,bit_rate","-of","json",path],{encoding:"utf8",timeout:30000}));
 const x=p.streams?.[0],seconds=Number(p.format?.duration),rate=Number(p.format?.bit_rate);
 if(x?.codec_name!=="mp3"||Number(x.sample_rate)!==24000||Number(x.channels)!==1||
  !(seconds>=plan.quality.min_seconds)||seconds>(kind==="word"?plan.quality.max_word_seconds:plan.quality.max_example_seconds)||
  !(rate>=58000&&rate<=74000))throw Error("Invalid MP3 codec/duration/rate "+path+" "+JSON.stringify(p));
 execFileSync("ffmpeg",["-v","error","-nostdin","-i",path,"-f","null","-"],{timeout:45000,stdio:["ignore","ignore","pipe"]});
 return Number(seconds.toFixed(3));
}
for(const rec of ledger.completed){
 const data=await readFile(join(root,rec.path));
 if(hash(data)!==rec.sha256)throw Error("Corrupt finished N2 audio "+rec.path);
 probe(join(root,rec.path),rec.kind);
}
let pending=[];
async function checkpoint(){
 if(!pending.length)return;
 for(const r of pending){
  const entry=manifest.files[r.id]||{examples:[]};
  if(r.kind==="word")entry.word=r.path;else entry.examples[0]=r.path;
  manifest.files[r.id]=entry;revisions.files[r.path]=r.sha256.slice(0,16);
 }
 const vals=Object.values(manifest.files),w=vals.filter(x=>!!x.word).length,e=vals.filter(x=>!!x.examples?.[0]).length;
 progress.completed_words=w;progress.completed_examples=e;progress.completed=w+e;progress.integrity_verified=w+e;
 progress.percent=Number(((w+e)*100/3904).toFixed(2));
 progress.current_batch=batch;progress.phase=e?"example_synthesis":"word_synthesis";
 progress.status=w+e===3904?"complete":"running";progress.updated_at=new Date().toISOString();
 progress.last_item=ledger.completed.at(-1)?.path;
 progress.note=(w+e===3904?"모든 N2 MP3 파일 자동 검증 완료. 발음은 실제 청취 추가 검수 필요.":(e?"예문":"단어")+" 합성 중")+" · "+(w+e)+" / 3904 검증 완료";
 ledger.status=ledger.completed.length===items.length?"complete":"in_progress";ledger.updated_at=progress.updated_at;
 for(const [path,obj] of [[manifestPath,manifest],[revPath,revisions],[progressPath,progress],[ledgerPath,ledger]])
  await writeFile(join(root,path),JSON.stringify(obj,null,2)+"\n");
 const staged=[...pending.map(r=>r.path),manifestPath,revPath,progressPath,ledgerPath];
 if(batch===1&&ledger.completed.length<=50)staged.push(base+"source.json");
 runGit("add","--",...staged);
 runGit("commit","-m","audio(n2): "+(w+e)+"/3904 verified Kokoro 64kbps MP3");
 for(let attempt=1;attempt<=5;attempt++){
  runGit("fetch","origin","main");
  try{runGit("rebase","origin/main")}catch(e){try{runGit("rebase","--abort")}catch{}throw Error("Conflicting concurrent main changes")}
  try{runGit("push","origin","HEAD:main");break}catch(e){if(attempt===5)throw e}
 }
 console.log("N2 CHECKPOINT",w+e,"/3904",w,"words",e,"examples");
 pending=[];
}
const pageOriginal=await readFile(join(root,"audio-punctuation-check.html"),"utf8");
const close=pageOriginal.lastIndexOf("</script>");
if(close<0||!pageOriginal.includes("async function getTts()"))throw Error("Kokoro browser engine missing");
const inject=[
 "window.__kojerN2Speak=async(text)=>{",
 " const tts=await getTts();const wav=(await tts.speak(text,'jf_alpha')).toBlob();",
 " if(wav.size<1500)throw Error('Invalid Kokoro WAV length');",
 " const bytes=new Uint8Array(await wav.arrayBuffer());let s='';",
 " for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));",
 " return btoa(s);};"
].join("\n");
const html=pageOriginal.slice(0,close)+inject+pageOriginal.slice(close);
const server=createServer((req,res)=>{
 if(new URL(req.url||"/","http://localhost").pathname!=="/audio-punctuation-check.html"){res.writeHead(404);res.end();return}
 res.writeHead(200,{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"});res.end(html);
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
let browser;
try{
 runGit("config","user.name","github-actions[bot]");
 runGit("config","user.email","41898282+github-actions[bot]@users.noreply.github.com");
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-features=WebGPU"]});
 const page=await browser.newPage({locale:"ja-JP"});
 await page.addInitScript(()=>Object.defineProperty(navigator,"gpu",{configurable:true,value:undefined}));
 page.setDefaultTimeout(200000);
 page.on("pageerror",e=>console.error("Kokoro Browser",String(e).slice(0,350)));
 const addr="http://127.0.0.1:"+server.address().port+"/audio-punctuation-check.html";
 await page.goto(addr,{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>typeof window.__kojerN2Speak==="function");
 if(await page.evaluate(()=>!!navigator.gpu))throw Error("WASM q8 execution required");
 for(let i=ledger.completed.length;i<items.length;i++){
  const item=items[i],dest=join(root,item.path);
  if(!/^[a-z0-9-]+$/i.test(item.id)||!item.path.startsWith("audio/n2/mp3/")||item.voice!=="jf_alpha"||!item.text)throw Error("Unsafe item "+item.id);
  let b64;
  for(let attempt=1;attempt<=2;attempt++){
   try{b64=await page.evaluate(t=>Promise.race([
    window.__kojerN2Speak(t),new Promise((_,bad)=>setTimeout(()=>bad(Error("Kokoro timeout")),180000))
   ]),item.text);break}
   catch(e){console.error("Retry",item.id,item.kind,String(e).slice(0,350));if(attempt===2)throw e;await page.reload({waitUntil:"domcontentloaded"})}
  }
  const wav=Buffer.from(b64,"base64");
  if(wav.length<1500||wav.toString("ascii",0,4)!=="RIFF"||wav.toString("ascii",8,12)!=="WAVE")throw Error("Invalid WAV "+item.id);
  const wavPath=dest+".temp.wav",tmp=dest+".temp.mp3";
  await writeFile(wavPath,wav);
  try{
   execFileSync("ffmpeg",["-v","error","-nostdin","-y","-i",wavPath,"-map","0:a:0","-vn","-map_metadata","-1","-c:a","libmp3lame","-ar","24000","-ac","1","-b:a","64k","-f","mp3",tmp],{timeout:60000});
   const mp3=await readFile(tmp),duration=probe(tmp,item.kind);
   if(mp3.length<1200)throw Error("MP3 too small "+item.id);
   await rename(tmp,dest);
   const rec={id:item.id,kind:item.kind,path:item.path,sha256:hash(mp3),bytes:mp3.length,duration_s:duration};
   ledger.completed.push(rec);pending.push(rec);
   console.log("VERIFIED",begin+i+1,"/3904",item.id,item.kind,duration);
   if(pending.length>=50||i===items.length-1)await checkpoint();
  }finally{await unlink(wavPath).catch(()=>{});await unlink(tmp).catch(()=>{})}
 }
 console.log("COMPLETE N2 BATCH",batch);
}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok))}
