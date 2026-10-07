import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

const root=process.cwd();
const outDir=path.join(root,"audio","vocab");
await mkdir(outDir,{recursive:true});

const server=spawn("python3",["-m","http.server","4173","--bind","127.0.0.1"],{cwd:root,stdio:"inherit"});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<30;i++){
  try{const r=await fetch("http://127.0.0.1:4173/index.html");if(r.ok)break}catch{}
  await sleep(500);
}

const browser=await chromium.launch({headless:true});
try{
  const indexPage=await browser.newPage();
  await indexPage.goto("http://127.0.0.1:4173/index.html",{waitUntil:"domcontentloaded",timeout:120000});
  await indexPage.waitForFunction(()=>typeof window.__jlptAudioManifest==="function",{timeout:30000});
  const items=await indexPage.evaluate(()=>window.__jlptAudioManifest());
  console.log("Audio items:",items.length);

  const genPage=await browser.newPage();
  await genPage.goto("http://127.0.0.1:4173/tools/audio-generator.html",{waitUntil:"domcontentloaded",timeout:120000});
  await genPage.waitForFunction(()=>window.__generatorReady===true,{timeout:30000});

  let made=0,skipped=0;
  for(const [i,item] of items.entries()){
    const file=path.join(root,item.path);
    try{await access(file);skipped++;continue}catch{}
    console.log("["+String(i+1).padStart(3,"0")+"/"+items.length+"]",item.path,item.text);
    const result=await genPage.evaluate(async item=>await window.generateStaticKokoro(item),item);
    await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file,Buffer.from(result.base64,"base64"));
    made++;
  }

  const files={};
  for(const item of items){
    files[item.id]??={word:null,examples:[]};
    if(item.kind==="word")files[item.id].word=item.path;
    else files[item.id].examples[item.index]=item.path;
  }
  const manifest={version:1,engine:"KokoroJP 0.2.0 / WASM q8 / jf_alpha",generatedAt:new Date().toISOString(),count:items.length,files};
  await writeFile(path.join(outDir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log("Done. generated="+made+" skipped="+skipped);
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
