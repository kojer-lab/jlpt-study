import { readFile, writeFile, readdir } from "node:fs/promises";
import vm from "node:vm";

const OPENJLPT_URL="https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json/vocab/n1.json";
const ENKO_URL="https://raw.githubusercontent.com/jhseo1211/open-english-korean-dict/main/dict/words.json";
const OUT="data/n1-extra-words-openjlpt.js";

async function getJson(url){
  const r=await fetch(url,{headers:{"user-agent":"kojer-jlpt-study-vocab-sync"}});
  if(!r.ok)throw new Error("Fetch failed "+r.status+" "+url);
  return r.json();
}
const escapeHtml=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
const plainHtml=html=>String(html??"").replace(/<span class="furi" data-r="[^"]*">([^<]*)<\/span>/g,"$1").replace(/<[^>]+>/g,"");
const readingHtml=html=>{
  let out="";
  String(html??"").replace(/<span class="furi" data-r="([^"]*)">([^<]*)<\/span>|([^<]+)/g,(_,r,b,text)=>{out+=r||text||b||"";return""});
  return out;
};
function furiHtml(s){
  if(!s)return"";
  let out="",last=0,re=/\{([^|{}]+)\|([^{}]+)\}/g,m;
  while((m=re.exec(s))){
    out+=escapeHtml(s.slice(last,m.index));
    out+='<span class="furi" data-r="'+escapeHtml(m[2])+'">'+escapeHtml(m[1])+'</span>';
    last=re.lastIndex;
  }
  out+=escapeHtml(s.slice(last));
  return out;
}

const phraseMap=new Map(Object.entries({
  "as usual":"평소처럼","as ever":"여전히 / 변함없이","in advance":"미리 / 사전에",
  "by all means":"꼭 / 부디","at any rate":"어쨌든","in any case":"어쨌든 / 어떤 경우에도",
  "on the contrary":"반대로","for the time being":"당분간","once again":"다시 한번",
  "in the meantime":"그동안 / 한편","after all":"결국 / 역시","in other words":"다시 말해",
  "more or less":"대체로 / 어느 정도","sooner or later":"조만간","little by little":"조금씩",
  "one after another":"잇따라 / 차례차례","without fail":"반드시","not necessarily":"반드시 ~인 것은 아니다",
  "to take into account":"고려하다","to take into consideration":"고려하다",
  "to make use of":"활용하다","to get rid of":"없애다 / 제거하다","to deal with":"다루다 / 대응하다",
  "to be concerned about":"우려하다 / 걱정하다","to bring about":"초래하다 / 일으키다",
  "to point out":"지적하다","to carry out":"수행하다 / 실행하다","to make up for":"보충하다 / 만회하다",
  "to look back on":"돌이켜보다","to look into":"조사하다 / 살펴보다","to put off":"미루다 / 연기하다",
  "to turn down":"거절하다 / 낮추다","to set aside":"따로 두다 / 제쳐두다","to come up with":"생각해내다 / 제시하다",
  "to be based on":"~에 근거하다","to be due to":"~때문이다","to be likely to":"~할 가능성이 높다",
  "to be supposed to":"~하기로 되어 있다","to be capable of":"~할 수 있다",
  "to look up (to)":"우러러보다 / 존경하다","love and hate":"애증","likes and dislikes":"호불호",
  "civility":"예의 / 공손함","courtesy":"예의 / 정중함","relation(ship)":"관계 / 사이",
  "mental arithmetic":"암산","running away from home":"가출","to get angry":"화를 내다",
  "to be in a hurry":"초조해하다 / 서두르다","to be impatient":"초조해하다",
  "to make a mistake":"실수하다 / 잘못하다","oil painting":"유화","rain gear":"우비 / 우구",
  "addressed to":"~앞 / ~에게","putting off":"뒤로 미룸 / 후순위","postponing":"연기 / 미룸",
  "phonetic-equivalent character":"아테지 / 소리에 맞춘 한자 표기",
  "to be enthusiastic about":"의욕을 내다 / 열의를 보이다","unlucky day":"흉일 / 운이 나쁜 날",
  "to place an order":"주문하다","to give an order":"주문하다 / 지시하다",
  "to behave like a spoiled child":"응석부리다","to fawn on":"응석부리다 / 어리광부리다",
  "to be renewed":"새로워지다 / 격식을 차리다","to redden":"붉어지다 / 붉히다",
  "to reveal":"밝히다 / 드러내다","to divulge":"누설하다 / 밝히다"
}));

function firstKorean(v){
  if(!v)return null;
  if(typeof v==="string")return v.trim()||null;
  if(Array.isArray(v))return v.map(firstKorean).find(Boolean)||null;
  if(typeof v==="object"){
    for(const k of ["meaning_ko","korean","ko","meaning","definition"]){
      const x=firstKorean(v[k]);if(x)return x;
    }
  }
  return null;
}
function dictLookup(dict,raw){
  let s=String(raw||"").toLowerCase().trim();
  s=s.replace(/\([^)]*\)/g," ").replace(/\[[^\]]*\]/g," ").replace(/[!?]/g,"").replace(/\s+/g," ").trim();
  const direct=phraseMap.get(s);if(direct)return direct;
  const candidates=[s];
  if(s.startsWith("to "))candidates.push(s.slice(3));
  if(s.startsWith("a "))candidates.push(s.slice(2));
  if(s.startsWith("an "))candidates.push(s.slice(3));
  if(s.startsWith("the "))candidates.push(s.slice(4));
  for(const c0 of candidates){
    const c=c0.trim();
    if(!c)continue;
    const hit=firstKorean(dict[c]);if(hit)return hit;
    if(c.endsWith("ies")){const h=firstKorean(dict[c.slice(0,-3)+"y"]);if(h)return h}
    if(c.endsWith("es")){const h=firstKorean(dict[c.slice(0,-2)]);if(h)return h}
    if(c.endsWith("s")){const h=firstKorean(dict[c.slice(0,-1)]);if(h)return h}
    if(c.endsWith("ing")){const h=firstKorean(dict[c.slice(0,-3)]);if(h)return h}
    if(c.endsWith("ed")){const h=firstKorean(dict[c.slice(0,-2)]);if(h)return h}
  }
  return null;
}
function translateMeanings(meanings,dict){
  const found=[];
  // Precision first: N1 cards are more useful with one or two solid senses
  // than with a long list containing unrelated English homonyms.
  for(const original of (meanings||[]).slice(0,2)){
    const whole=dictLookup(dict,original);
    if(whole&&!found.includes(whole))found.push(whole);
    if(found.length>=2)break;
    const chunks=String(original).split(/\s*[;,/]\s*|\s+\bor\b\s+/i).filter(Boolean).slice(0,3);
    for(const c of chunks){
      const k=dictLookup(dict,c);
      if(k&&!found.includes(k))found.push(k);
      if(found.length>=2)break;
    }
    if(found.length>=2)break;
  }
  return found.length?found.join(" / "):"영어 뜻 · "+(meanings||[]).slice(0,2).join(" / ");
}

async function curatedKeys(){
  const keys=new Set();
  const html=await readFile("index.html","utf8");
  const match=html.match(/const words=(\[[\s\S]*?\]);\s*\n\nconst quizData=/);
  if(match){
    const context={};vm.createContext(context);
    const code="(()=>{const F=(b,r)=>'<span class=\\\"furi\\\" data-r=\\\"'+r+'\\\">'+b+'</span>';return "+match[1]+"})()";
    const list=vm.runInContext(code,context);
    for(const w of list)keys.add(plainHtml(w.w)+"\u0000"+readingHtml(w.w));
  }
  for(const name of (await readdir("data")).filter(n=>/^n1-extra-words-(?!openjlpt).*\.js$/.test(n))){
    const src=await readFile("data/"+name,"utf8");
    const eq=src.indexOf("=");if(eq<0)continue;
    const raw=src.slice(eq+1).trim().replace(/;\s*$/,"");
    let list;try{list=JSON.parse(raw)}catch{continue}
    for(const w of list||[])keys.add(String(w.w||"")+"\u0000"+String(w.r||""));
  }
  return keys;
}

const [openjlpt,enko,curated]=await Promise.all([getJson(OPENJLPT_URL),getJson(ENKO_URL),curatedKeys()]);
if(!Array.isArray(openjlpt))throw new Error("OpenJLPT N1 payload is not an array");

let skipped=0,korean=0,englishFallback=0,withExample=0;
const out=[];
for(const x of openjlpt){
  const word=String(x.word||"").trim(),reading=String(x.reading||"").trim();
  if(!word)continue;
  const key=word+"\u0000"+reading;
  if(curated.has(key)){skipped++;continue}
  const meaning=translateMeanings(x.meanings,enko);
  if(meaning.startsWith("영어 뜻 · "))englishFallback++;else korean++;
  const ex=(x.examples||[])[0]||null;
  const examples=[];
  if(ex&&ex.ja){
    examples.push({
      jp:furiHtml(ex.furigana||ex.ja),
      ko:ex.en?"EN · "+ex.en:"",
      tatoebaId:ex.tatoeba_id||null
    });
    withExample++;
  }
  out.push({
    id:"ojlpt-"+x.id,
    w:word,
    r:reading,
    meaning,
    meaningEn:(x.meanings||[]).slice(0,3).join("; "),
    examples,
    source:"openjlpt",
    jlpt:"N1"
  });
}
const header="/* Generated from OpenJLPT N1 vocabulary. Data derivative: CC BY-SA 4.0.\n   See data/ATTRIBUTION.md. Do not edit by hand; run tools/import-openjlpt-n1.mjs. */\n";
await writeFile(OUT,header+"window.N1_OPENJLPT_WORDS="+JSON.stringify(out)+";\n","utf8");
console.log(JSON.stringify({sourceCount:openjlpt.length,curatedSkipped:skipped,imported:out.length,koreanMeanings:korean,englishFallback,withExample,output:OUT},null,2));
