/** Freeze reviewed N2 source. Exactly 2,000 N2 source entries, 48 shared with N1. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
const all=[];
for(let i=1;i<=32;i++){
 const data=await readFile("data/n2-words-phase"+i+".js","utf8");
 const match=data.match(new RegExp("window\\.N2_WORDS_PHASE"+i+"\\s*=\\s*(\\[[\\s\\S]*\\]);?\\s*$"));
 if(!match)throw Error("Cannot parse N2 phase "+i);
 const words=JSON.parse(match[1]);if(!Array.isArray(words))throw Error("Invalid phase "+i);
 all.push(...words);
}
const audit=JSON.parse(await readFile("data/n2-duplicate-audit-20261013.json","utf8"));
const reused=audit.collisions.filter(x=>x.source==="existing"&&x.collision_type==="same_word_same_reading").map(x=>x.id);
if(all.length!==2000||new Set(all.map(x=>x.id)).size!==2000||reused.length!==48)throw Error("N2 source catalog changed unexpectedly");
const reusedIds=new Set(reused),unique=all.filter(x=>!reusedIds.has(x.id));
if(unique.length!==1952)throw Error("N2 unique words expected 1952");
const items=[];
for(const kind of ["word","example"])for(const w of unique){
 const text=(kind==="word"?w.r:String(w.examples?.[0]?.jp||"").trim().replace(/。(?=[」』]?\s*$)/u,"")).trim();
 if(!/^[a-zA-Z0-9-]+$/.test(w.id)||!text||text.length>250||/[\r\n]/.test(text)||!w.meaning||!w.examples?.[0]?.ko)throw Error("Invalid item "+w.id+" "+kind);
 items.push({id:w.id,kind,text,path:"audio/n2/mp3/"+w.id+(kind==="word"?"-word":"-ex1")+".mp3",voice:"jf_alpha"});
}
if(items.length!==3904||new Set(items.map(x=>x.path)).size!==3904)throw Error("Duplicate N2 audio paths");
const document={version:1,engine:"kokoro-js-jp@0.2.0",runtime:"wasm_q8",voice:"jf_alpha",word_total:1952,example_total:1952,reused_n1:48,total:3904,items};
const json=JSON.stringify(document,null,2)+"\n",path="audio/n2/source.json";
await mkdir("audio/n2",{recursive:true});
try{if(await readFile(path,"utf8")!==json)throw Error("N2 source modified after freezing");console.log("N2 source verified, 3904 clips");}
catch(e){if(e.code!=="ENOENT")throw e;await writeFile(path,json);console.log("N2 source created, 3904 clips");}
