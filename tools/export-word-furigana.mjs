import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import vm from "node:vm";

async function assignedJson(path){
  const src=await readFile(path,"utf8");
  const eq=src.indexOf("=");
  if(eq<0)return null;
  return JSON.parse(src.slice(eq+1).trim().replace(/;\s*$/,""));
}

function plainJapanese(value){
  let text=String(value||"");
  const entities={"&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&amp;":"&"};
  for(let pass=0;pass<3;pass++){
    text=text.replace(/<[^>]*>/g,"");
    text=text.replace(/&(lt|gt|quot|#39|amp);/g,m=>entities[m]||m);
  }
  return text.replace(/<[^>]*>/g,"");
}

const html=await readFile("index.html","utf8");
const marker="const words=";
const start=html.indexOf(marker);
const end=html.indexOf("\n];",start);
if(start<0||end<0)throw new Error("Could not locate inline words array");
const raw=html.slice(start+marker.length,end+2).trim();
const context={F:(base)=>String(base)};
vm.createContext(context);
const words=vm.runInContext(`(${raw})`,context).map(w=>({
  id:w.id,
  w:String(w.w||""),
  examples:Array.isArray(w.examples)?w.examples.map(ex=>({jp:String(ex.jp||""),ko:String(ex.ko||"")})):[]
}));

const extraFiles=[
  "data/n1-extra-words-1.js","data/n1-extra-words-2.js","data/n1-extra-words-3.js",
  "data/n1-extra-words-openjlpt-1.js","data/n1-extra-words-openjlpt-2.js","data/n1-extra-words-openjlpt-3.js",
  "data/n1-extra-words-openjlpt-4.js","data/n1-extra-words-openjlpt-5.js","data/n1-extra-words-openjlpt-6.js"
];
for(const path of extraFiles){
  const arr=await assignedJson(path);
  if(!Array.isArray(arr))continue;
  for(const x of arr){
    words.push({
      id:x.id,
      w:String(x.w||""),
      examples:Array.isArray(x.examples)?x.examples.map(ex=>({jp:String(ex.jp||""),ko:String(ex.ko||"")})):[]
    });
  }
}

const overrides=await assignedJson("data/n1-curated-overrides.js")||{};
for(const w of words){
  const o=overrides[w.id];
  if(!o)continue;
  if(o.w)w.w=String(o.w);
  if(Array.isArray(o.examples))w.examples=o.examples.map(ex=>({jp:String(ex.jp||""),ko:String(ex.ko||"")}));
}

const names=await readdir("data");
const secondNames=names.filter(n=>/^n1-second-examples-\d+\.js$/.test(n))
  .sort((a,b)=>Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]));
const secondBanks=[];
for(const name of secondNames)secondBanks.push(await assignedJson("data/"+name)||{});
for(const w of words){
  if(!Array.isArray(w.examples))w.examples=[];
  if(w.examples.length>=2)continue;
  for(const bank of secondBanks){
    const ex=bank[w.id];
    if(!ex)continue;
    const jp=String(ex.jp||"");
    if(!w.examples.some(x=>String(x.jp||"")===jp))w.examples.push({jp,ko:String(ex.ko||"")});
    if(w.examples.length>=2)break;
  }
}

const breakdownNames=names.filter(n=>/^n1-word-breakdowns-\d+\.js$/.test(n))
  .sort((a,b)=>Number(a.match(/(\d+)/)[1])-Number(b.match(/(\d+)/)[1]));
const breakdowns={};
for(const name of breakdownNames)Object.assign(breakdowns,await assignedJson("data/"+name)||{});

const out=words.map(w=>({
  id:w.id,
  examples:w.examples.slice(0,2).map(ex=>plainJapanese(ex.jp)),
  related:Array.isArray(breakdowns[w.id]?.related)?breakdowns[w.id].related.map(plainJapanese):[]
}));

await mkdir("data",{recursive:true});
await writeFile(
  "data/n1-word-furigana-source.json",
  JSON.stringify({version:1,count:out.length,words:out},null,2)+"\n",
  "utf8"
);
console.log(`Exported ${out.length} words for example/related furigana generation.`);
