import { readFile, writeFile, mkdir } from "node:fs/promises";
import vm from "node:vm";

const html=await readFile("index.html","utf8");
const marker="const readingSets=";
const start=html.indexOf(marker);
const end=html.indexOf("\n\nif(window.N1_EXTRA_READING)",start);
if(start<0||end<0)throw new Error("Could not locate inline readingSets");
const raw=html.slice(start+marker.length,end).trim().replace(/;\s*$/,"");
const context={F:(base)=>String(base)};
vm.createContext(context);
const readingSets=vm.runInContext(`(${raw})`,context);

async function assignedJson(path){
 const src=await readFile(path,"utf8");
 const eq=src.indexOf("=");
 if(eq<0)return null;
 return JSON.parse(src.slice(eq+1).trim().replace(/;\s*$/,""));
}
const extra=await assignedJson("data/n1-extra-reading.js");
if(extra){
 for(const mode of ["short","medium","long","news"]){
  if(Array.isArray(extra[mode]))readingSets[mode].push(...extra[mode]);
 }
}
const daily=await assignedJson("data/n1-daily-news.js");
if(Array.isArray(daily))readingSets.news.push(...daily);

const sets=[];
for(const mode of ["short","medium","long","news"]){
 for(const set of readingSets[mode]){
  sets.push({
   mode,
   title:set.title,
   passage:set.passage||"",
   questions:(set.questions||[]).map(q=>({
    q:q.q||"",
    c:Array.isArray(q.c)?q.c:[],
    e:q.e||""
   }))
  });
 }
}
await mkdir("data",{recursive:true});
await writeFile("data/n1-reading-furigana-source.json",JSON.stringify({version:1,count:sets.length,sets},null,2)+"\n");
console.log(`Exported ${sets.length} reading sets for furigana generation.`);
