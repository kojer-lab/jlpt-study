/* Built into the JLPT news tab. RSS feed only, no full-article copying or AI generation. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const API="https://honnatvsuwzhdcyyftzl.supabase.co/functions/v1/news-collector";
const CACHE_KEY="jlptNewsRecentHeadlinesV1";
let items=[],selected="전체",busy=false,fetched="",failures=[];
const norm=s=>String(s||"").replace(/[\s　、。！？!?:：,.．・「」『』（）()【】－-]/g,"").toLowerCase();
function hasBrief(item){
 if(!item||typeof item.title!=="string"||typeof item.summary!=="string")return false;
 const summary=item.summary.trim();
 if(summary.length<45||!/[一-龯ぁ-ゖァ-ヺ]/.test(summary))return false;
 const title=norm(item.title.replace(/\s*[-－]\s*[^-－]{2,45}$/,""));
 const compact=norm(summary);
 if(compact===title||title.length>12&&compact.includes(title)&&compact.replace(title,"").length<40)return false;
 return summary.split(/[。！？!？\n]/).some(s=>s.trim().length>=18&&/[一-龯ぁ-ゖァ-ヺ]/.test(s)&&norm(s)!==title);
}
function setStatus(message,error=false){const target=$("newsCollectStatus");target.textContent=message;target.style.color=error?"var(--danger,var(--muted))":"var(--muted)";}
function clear(node){node.replaceChildren();}
function button(text,handler){
 const el=document.createElement("button");
 el.type="button";el.className="secondary";el.textContent=text;el.addEventListener("click",handler);return el;
}
function publish(){
 const list=$("newsCollectList"),filters=$("newsCollectFilters");clear(list);clear(filters);
 const cats=["전체",...new Set(items.map(a=>a.category))];
 for(const cat of cats){
  const b=button(cat,()=>{selected=cat;publish()});
  if(cat===selected)b.style.cssText="background:var(--accent);color:#fff;border-color:var(--accent)";
  filters.appendChild(b);
 }
 const matches=items.filter(x=>selected==="전체"||x.category===selected);
 if(!matches.length){const p=document.createElement("p");p.className="sub";p.textContent=items.length?"이 분야에 읽을 만한 소개문이 없어.":"수집된 뉴스가 없어. 기사 모으기를 눌러줘.";list.appendChild(p);return}
 const fmt=time=>{try{return new Date(time).toLocaleString("ko-KR",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})+" JST"}catch{return""}};
 for(const a of matches){
  if(typeof a.url!=="string"||!/^https:\/\//i.test(a.url))continue;
  const art=document.createElement("article");art.className="news-rss-item";
  const meta=document.createElement("div");meta.className="sub";
  meta.textContent=[a.category,a.source,fmt(a.publishedAt)].filter(Boolean).join(" · ");
  const title=document.createElement("h3");title.lang="ja";title.textContent=a.title;
  const details=document.createElement("details");const summary=document.createElement("summary");
  summary.textContent="일본어 RSS 소개문 읽기";
  const passage=document.createElement("p");passage.className="news-rss-summary";passage.lang="ja";passage.textContent=a.summary;
  details.append(summary,passage);
  const link=document.createElement("a");link.href=a.url;link.target="_blank";link.rel="noopener noreferrer";
  link.className="secondary";link.style.cssText="display:inline-block;padding:7px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;text-decoration:none;color:var(--accent)";
  link.textContent="언론사 원문 열기 ↗";
  art.append(meta,title,details,link);list.appendChild(art);
 }
}
function loadCache(){
 try{
  const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
  if(!cached||!Array.isArray(cached.articles))return;
  items=cached.articles.filter(x=>x&&typeof x.url==="string"&&/^https:\/\//i.test(x.url)&&hasBrief(x));
  failures=Array.isArray(cached.failedCategories)?cached.failedCategories:[];fetched=cached.generatedAt||"";
  if(items.length){
   setStatus("이전에 모은 "+items.length+"건 · "+(fetched?fmtCache(fetched):"저장된 뉴스")+(failures.length?" · 일부 분야 미수집":""));
   publish();
  }
 }catch(e){console.warn("뉴스 캐시 읽기 실패",e)}
}
function fmtCache(t){try{return new Date(t).toLocaleString("ko-KR",{timeZone:"Asia/Tokyo"})+" JST"}catch{return t}}
async function loadArchive(){
 if(typeof cloudClient==="undefined"||!cloudClient||typeof cloudUser==="undefined"||!cloudUser)return;
 const {data,error}=await cloudClient.from("jlpt_news_generated_articles").select("article").eq("owner_id",cloudUser.id).order("created_at",{ascending:false}).limit(500);
 if(!error&&Array.isArray(data))window.KOJER_ADD_GENERATED_NEWS?.(data.map(x=>x.article));
}
async function generateSix(){
 const button=$("newsGenerateButton");
 if(!button||busy)return;
 if(typeof cloudClient==="undefined"||!cloudClient||typeof cloudUser==="undefined"||!cloudUser){setStatus("먼저 PC·모바일 동기화 메뉴에서 로그인해 줘.",true);return}
 if(!items.length){setStatus("먼저 오늘의 기사 모으기를 실행해 줘.",true);return}
 button.disabled=true;button.textContent="6개 학습 기사 생성 중…";
 setStatus("무료 AI로 학습 기사를 순서대로 만들고 있어. 최대 몇 분 걸릴 수 있어.");
 try{
  const config=loadCloudConfig();
  const {data:auth,error:authError}=await cloudClient.auth.getSession();
  if(authError||!auth?.session?.access_token)throw new Error("로그인이 만료됐어.");
  const response=await fetch("https://honnatvsuwzhdcyyftzl.supabase.co/functions/v1/news-generate",{
   method:"POST",headers:{"authorization":"Bearer "+auth.session.access_token,"apikey":config.key,"content-type":"application/json"},
   body:JSON.stringify({candidates:items.slice(0,25)})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"기사 생성 실패");
  const added=Array.isArray(result.articles)?result.articles:[];
  window.KOJER_ADD_GENERATED_NEWS?.(added);
  const issues=Array.isArray(result.errors)?result.errors:[];
  const reasons=[...new Set(issues.map(e=>String(e?.error||"원인 미상").slice(0,180)))];
  const detail=reasons.length?" · 실패 원인: "+reasons.slice(0,3).join(" / "):"";
  setStatus(added.length+"개 학습 기사 생성·저장 완료"+(issues.length?" · "+issues.length+"개 실패":"")+(result.selected===0?" · 생성 가능한 새 기사 없음":"")+detail+". 기존 10개 기사는 유지돼.",issues.length>0||added.length===0);
  if(issues.length)console.warn("학습 기사 생성 실패 상세",issues);
 }catch(e){setStatus(e.message||"기사 생성 실패",true)}
 finally{button.disabled=false;button.textContent="✨ 학습 기사 6개 만들기"}
}
const gen=$("newsGenerateButton");
if(gen)gen.addEventListener("click",generateSix);
window.addEventListener("focus",()=>{if(!document.hidden)loadArchive()});
window.addEventListener("kojer-news:updated",loadArchive);
setTimeout(loadArchive,1800);
async function collect(){
 if(busy)return;
 busy=true;
 const btn=$("newsCollectButton");btn.disabled=true;btn.textContent="뉴스 수집 중…";
 setStatus("최근 일본 뉴스를 분야별로 수집하고 있어…");
 try{
  // Reuse the main JLPT Supabase session; do not create a second auth client.
  if(typeof cloudClient==="undefined"||!cloudClient||typeof cloudUser==="undefined"||!cloudUser)
   throw new Error("PC·모바일 동기화 메뉴에서 Supabase에 로그인해야 최신 RSS 뉴스를 모을 수 있어.");
  const config=loadCloudConfig();
  if(config.url!=="https://honnatvsuwzhdcyyftzl.supabase.co"||!config.key)
   throw new Error("기존 JLPT Supabase 프로젝트에 먼저 연결해 줘.");
  const {data:auth,error:authError}=await cloudClient.auth.getSession();
  if(authError||!auth?.session?.access_token)throw new Error("로그인이 만료됐어. 동기화 메뉴에서 다시 로그인해 줘.");
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),18000);
  let response;
  try{
   response=await fetch(API,{method:"GET",headers:{"Authorization":"Bearer "+auth.session.access_token,"apikey":config.key},signal:controller.signal,cache:"no-store"});
  }finally{clearTimeout(timeout)}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"뉴스 수집 실패 (HTTP "+response.status+")");
  if(!Array.isArray(result.articles))throw new Error("서버가 기사 목록을 제공하지 않았어.");
  const next=result.articles.filter(x=>x&&typeof x.url==="string"&&/^https:\/\//i.test(x.url)&&hasBrief(x));
  if(!next.length)throw new Error("현재 제공된 RSS 중 읽을 내용이 충분한 기사가 없어. 제목만 있는 결과는 제외했어.");
  items=next;selected="전체";fetched=result.generatedAt||new Date().toISOString();
  failures=Array.isArray(result.failedCategories)?result.failedCategories:[];
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({articles:items,generatedAt:fetched,failedCategories:failures}))}catch(e){console.warn("RSS 캐시 저장 실패",e)}
  publish();
  setStatus(items.length+"건 수집 완료 · "+fmtCache(fetched)+(failures.length?" · 미수집 분야: "+failures.join(", "):""));
 }catch(e){setStatus(e.name==="AbortError"?"수집 시간이 초과됐어. 다시 시도해 줘.":(e.message||"뉴스 수집에 실패했어."),true)}
 finally{busy=false;btn.disabled=false;btn.textContent="↻ 오늘의 기사 다시 모으기"}
}
const btn=$("newsCollectButton");
if(btn){btn.addEventListener("click",collect);loadCache();publish();}
const setup=$("newsCollectorGoCloud");
if(setup)setup.addEventListener("click",()=>{if(typeof showView==="function")showView("cloud")});
window.KOJER_COLLECT_NEWS={collect,hasBrief};
})();