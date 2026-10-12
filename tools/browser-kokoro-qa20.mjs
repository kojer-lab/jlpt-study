/**
 * Browser Kokoro JS MP3 A/B migration pilot, 20 examples.
 *
 * Browser-based synthesis reuses audio-punctuation-check.html as the canonical
 * Kokoro/MP3 encoder page. This is NOT the Python Kokoro pipeline.
 * Never replace the production audio/vocab MP3 files in this pilot.
 */
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const root = resolve(".");
const rootAudio = join(root, "audio/vocab");
const outDir = join(rootAudio, "browser-qa-20");
const source = JSON.parse(await readFile(join(rootAudio, "source.json"), "utf8"));
const reports = JSON.parse(await readFile(join(rootAudio, "end-sound-diagnostic-queue.json"), "utf8"));
const sourceMap = new Map(source.items.map(item => [item.id + "|" + item.kind + "|" + item.index, item]));
const expected = [{word_id:"unagasu",kind:"example",index:0,report_id:null,reason:"confirmed legacy MP3 tail artifact"}, ...reports.items.slice(0,19)];
if (expected.length !== 20 || new Set(expected.map(x=>x.word_id+"|"+x.kind+"|"+x.index)).size !== 20) {
 throw new Error("Pilot targets must contain exactly 20 distinct examples");
}
const targets = expected.map(x=>{
 if(x.kind!=="example")throw new Error("Only example audio is in the pilot");
 const src=sourceMap.get(x.word_id+"|example|"+x.index);
 if(!src || src.kind!=="example" || !src.path.endsWith(".mp3"))throw new Error("Missing matching source: "+x.word_id);
 if(!src.text || src.text.trim().endsWith("。"))throw new Error("Source text must be punctuation-normalized");
 return {...x,source:src};
});
for(const t of targets){await stat(join(root,t.source.path))}
await mkdir(outDir,{recursive:true});

const pageHtml=await readFile(join(root,"audio-punctuation-check.html"));
const server=createServer((req,res)=>{
 const p=new URL(req.url||"/","http://localhost").pathname;
 if(p!=="/audio-punctuation-check.html"){res.writeHead(404);res.end("Not found");return}
 res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
 res.end(pageHtml);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
let browser=null;
const checks=[];
try{
 // CI Chromium exposes navigator.gpu without a usable GPU adapter. The test
 // page checks navigator.gpu before choosing a device; force a true browser
 // WASM/q8 run BEFORE the page loads instead of falling back after WebGPU fails.
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage","--disable-features=WebGPU"]});
 const page=await browser.newPage({locale:"ja-JP"});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,"gpu",{configurable:true,value:undefined});
 });
 page.setDefaultTimeout(120000);
 page.on("console",message=>{if(message.type()==="error")console.error("BROWSER",message.text())});
 page.on("pageerror",err=>console.error("BROWSER PAGE ERROR",String(err)));
 await page.goto("http://127.0.0.1:"+port+"/audio-punctuation-check.html",{waitUntil:"domcontentloaded"});
 await page.locator("#exampleInput").waitFor();
 const engine=await page.evaluate(()=>navigator.gpu?"WebGPU fp32 (or WASM q8 fallback)":"WASM q8");
 console.log("Running browser Kokoro pilot, engine:",engine,"targets:",targets.length);
 for(let i=0;i<targets.length;i++){
  const t=targets[i],text=t.source.text.trim();
  console.log("START",i+1,"/",targets.length,t.source.path);
  await page.locator("#exampleInput").fill(text);
  await page.locator("#run").click();
  await page.waitForFunction(()=>{
   const el=document.querySelector("#run"),message=document.querySelector("#status")?.textContent||"";
   return el&&!el.disabled&&(/두 버전 생성 완료/.test(message)||/실패/.test(message));
  },null,{timeout:1200000});
  const statusText=await page.locator("#status").textContent();
  if(!statusText?.includes("두 버전 생성 완료"))throw new Error("Browser audio failure at "+t.source.path+": "+statusText);
  const b64=await page.evaluate(async()=>{
   const a=document.getElementById("downloadB");
   if(!a?.href?.startsWith("blob:"))throw new Error("New MP3 blob URL missing");
   const blob=await(await fetch(a.href)).blob();
   if(blob.type!=="audio/mpeg")throw new Error("New audio MIME is not MP3: "+blob.type);
   const data=new Uint8Array(await blob.arrayBuffer());
   let ascii="";
   for(let i=0;i<data.length;i+=8192)ascii+=String.fromCharCode(...data.subarray(i,i+8192));
   return btoa(ascii);
  });
  const bytes=Buffer.from(b64,"base64");
  if(bytes.length<2500 || !bytes.subarray(0,3).equals(Buffer.from("ID3")) && bytes[0]!==0xff)throw new Error("Invalid new MP3: "+t.source.path);
  const original=await readFile(join(root,t.source.path));
  const hash=data=>createHash("sha256").update(data).digest("hex");
  if(hash(original)===hash(bytes))throw new Error("Rebuilt audio identical to source for "+t.source.path);
  const name=t.word_id+"-ex"+(t.index+1)+".mp3";
  const relative="audio/vocab/browser-qa-20/"+name;
  await writeFile(join(outDir,name),bytes);
  checks.push({word_id:t.word_id,kind:t.kind,index:t.index,report_id:t.report_id,reason:t.reason||"reported unnatural ending",text,
   original_path:t.source.path,candidate_path:relative,original_bytes:original.length,candidate_bytes:bytes.length,
   original_sha256:hash(original),candidate_sha256:hash(bytes)});
  console.log("OK",i+1,"/",targets.length,relative,bytes.length,"bytes");
 }
 const manifest={version:1,count:checks.length,voice:"jf_alpha",browser_engine:"kokoro-js-jp@0.2.0",codec:"lamejs@1.2.1",runtime:engine,
  production_replaced:false,source:"audio/vocab/end-sound-diagnostic-queue.json + unagasu-ex1",items:checks};
 await writeFile(join(outDir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 console.log("PASS: all 20 MP3 comparison candidates created, production files untouched.");
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
