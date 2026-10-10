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
 const list=$("newsCollectList"),filters=$("newsCollectFilters");
 const results=$("newsRssResults"),total=$("newsRssCount"),hint=$("newsRssExpandLabel");
 clear(list);clear(filters);
 if(results)results.classList.toggle("hidden",!items.length);
 if(total)total.textContent=items.length+"건";
 if(hint)hint.textContent=results?.open?"접기":"목록 펼치기";
 if(!items.length)return;
 const cats=["전체",...new Set(items.map(a=>a.category).filter(Boolean))];
 if(!cats.includes(selected))selected="전체";
 for(const cat of cats){
  const b=button(cat,()=>{selected=cat;publish()});
  b.classList.toggle("active",cat===selected);
  b.setAttribute("aria-pressed",String(cat===selected));
  filters.appendChild(b);
 }
 const matches=items.filter(x=>selected==="전체"||x.category===selected);
 if(!matches.length){const p=document.createElement("p");p.className="sub";p.textContent="이 분야에 해당하는 뉴스 후보가 없어.";list.appendChild(p);return}
 const fmt=time=>{try{return new Date(time).toLocaleString("ko-KR",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})+" JST"}catch{return""}};
 for(const a of matches){
  if(typeof a.url!=="string"||!/^https:\/\//i.test(a.url))continue;
  const art=document.createElement("details");art.className="news-rss-item";
  const head=document.createElement("summary");head.className="news-rss-row";
  const category=document.createElement("span");category.className="news-rss-category";category.textContent=a.category||"뉴스";
  const title=document.createElement("strong");title.className="news-rss-title";title.lang="ja";title.textContent=a.title;
  const source=document.createElement("span");source.className="news-rss-source";source.textContent=a.source||"";
  const arrow=document.createElement("span");arrow.className="news-rss-chevron";arrow.setAttribute("aria-hidden","true");arrow.textContent="⌄";
  head.append(category,title,source,arrow);
  const body=document.createElement("div");body.className="news-rss-body";
  const meta=document.createElement("p");meta.className="news-rss-meta";meta.textContent=[a.source,fmt(a.publishedAt)].filter(Boolean).join(" · ");
  const passage=document.createElement("p");passage.className="news-rss-summary";passage.lang="ja";passage.textContent=a.summary;
  const link=document.createElement("a");link.href=a.url;link.target="_blank";link.rel="noopener noreferrer";link.className="news-rss-source-link";link.textContent="언론사 원문 확인 ↗";
  body.append(meta,passage,link);art.append(head,body);list.appendChild(art);
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
function importStatus(message,error=false){const el=$("newsImportStatus");if(el){el.textContent=message;el.style.color=error?"var(--danger,var(--muted))":"var(--muted)";}}
function normalizeImport(payload){
 const list=Array.isArray(payload)?payload:Array.isArray(payload?.articles)?payload.articles:Array.isArray(payload?.data)?payload.data:null;
 if(!list||!list.length||list.length>30)throw Error("기사 배열이 없거나 30개를 초과해.");
 return list.map((raw,i)=>{
  const a=raw.article&&typeof raw.article==="object"?raw.article:raw;
  const rawParagraphs=a.paragraphs;
  const paragraphs=Array.isArray(rawParagraphs)?rawParagraphs.map(p=>typeof p==="string"?p:(typeof p?.ja==="string"?p.ja:"")):[];
  const translationParagraphs=Array.isArray(a.translationParagraphs)?a.translationParagraphs:Array.isArray(a.translations)?a.translations:Array.isArray(rawParagraphs)?rawParagraphs.map(p=>p?.ko||""):[];
  const expressions=a.expressions;
  if(!a.title||paragraphs.length<5||paragraphs.length>10||!paragraphs.every(x=>typeof x==="string"&&x.length>30))throw Error((i+1)+"번 기사 본문 형식이 올바르지 않아.");
  if(translationParagraphs.length!==paragraphs.length||!translationParagraphs.every(x=>typeof x==="string"&&x.trim()))throw Error((i+1)+"번 기사 문단별 번역이 누락됐어.");
  if(!Array.isArray(expressions)||expressions.length<5||!expressions.every(x=>x&&typeof x.form==="string"&&typeof x.reading==="string"&&typeof x.meaning==="string"))throw Error((i+1)+"번 기사 N1 표현 형식이 올바르지 않아.");
  const title=String(a.title).trim(),id=String(a.id||"gpt-"+Array.from(title).map(c=>c.codePointAt(0).toString(36)).join("-")).slice(0,240);
  return {id,title,category:String(a.category||"시사"),source:String(a.source||"GPT 학습 기사"),date:String(a.date||new Date().toISOString().slice(0,10)),paragraphs,translationParagraphs,expressions,bodyLength:paragraphs.join("").length,sourceUrl:String(a.sourceUrl||a.source_url||raw.source_url||""),kind:String(a.kind||"학습용 재구성"),verification:a.verification||null};
 });
}
async function importArticles(file){
 const btn=$("newsImportButton");btn.disabled=true;
 try{
  if(typeof cloudClient==="undefined"||!cloudClient||typeof cloudUser==="undefined"||!cloudUser)throw Error("먼저 사이트의 클라우드 동기화 설정에서 로그인해 줘.");
  if(file.size>2500000)throw Error("파일이 너무 커. 2.5MB 이하 JSON을 사용해 줘.");
  const articles=normalizeImport(JSON.parse(await file.text()));
  const ids=articles.map(a=>a.id);
  if(new Set(ids).size!==ids.length)throw Error("JSON 안에 중복 기사 ID가 있어.");
  const {data:existing,error:checkError}=await cloudClient.from("jlpt_news_generated_articles").select("id").in("id",ids);
  if(checkError)throw checkError;
  const known=new Set((existing||[]).map(x=>x.id));
  const fresh=articles.filter(a=>!known.has(a.id));
  if(!fresh.length){importStatus("이미 저장된 기사야. 중복 저장하지 않았어.");await loadArchive();return}
  const rows=fresh.map(a=>({id:a.id,owner_id:cloudUser.id,source_url:a.sourceUrl||null,article:a}));
  const {error}=await cloudClient.from("jlpt_news_generated_articles").insert(rows);
  if(error)throw error;
  window.KOJER_ADD_GENERATED_NEWS?.(fresh);
  importStatus(fresh.length+"개 기사 저장 완료 · 중복 "+(articles.length-fresh.length)+"개 제외. 뉴스 읽기 목록에서 확인해 줘.");
 }catch(e){importStatus("가져오기 실패: "+(e.message||String(e)),true)}
 finally{btn.disabled=false;$("newsImportFile").value=""}
}
const importBtn=$("newsImportButton"),importFile=$("newsImportFile");
if(importBtn&&importFile){importBtn.addEventListener("click",()=>importFile.click());importFile.addEventListener("change",()=>{if(importFile.files?.[0])importArticles(importFile.files[0])})}
async function generateSix(){
 const btn=$("newsGenerateButton");
 if(!btn||busy)return;
 if(!items.length){setStatus("먼저 오늘의 기사 모으기를 실행해 줘.",true);return}
 const candidates=items.slice(0,14).map(x=>({title:x.title,summary:x.summary,source:x.source,category:x.category,publishedAt:x.publishedAt,url:x.url}));
 const prompt=[
 "내 GitHub Pages JLPT N1 뉴스 읽기 사이트에 새 학습 기사 6개를 작성하고, 연결된 GitHub 저장소에 바로 게시해 줘. 작업 완료 후 JSON 파일을 나에게 다시 보내거나 내가 다른 대화에 첨부하는 단계는 없애고 싶어.",
 "대상 GitHub 저장소: kojer-lab/jlpt-study. 기존 코드를 먼저 읽어. 특히 index.html, data/news-curated-v1.js, data/news-generated-2026-10-10.js, data/news-reader-embedded.js의 기존 기사 배열 구조와 스크립트 로드 순서를 참고해 줘. 나에게 파일 복사·붙여넣기나 수동 업로드를 시키지 마.",
 "1) 아래 RSS 후보에서 경제·사회·국제·문화·기술·스포츠 등 다양한 분야의 기사 6개를 고르고, 각 원문 URL을 직접 열어 사실관계를 확인해. 원문에 접근이 안 되면 신뢰할 만한 다른 보도/공식 자료로 교차 확인하되 사실과 해석을 구분하고, 검증할 수 없으면 다른 후보로 교체해. 원문을 읽지 못했는데 읽었다고 주장하지 마.",
 "2) 원문을 복제하지 말고 각 기사마다 독립적인 학습용 일본어 900~1,200자, 5~8문단과 동일 개수의 자연스러운 한국어 문단 번역, 실제 본문에 나오는 N1 핵심 표현 5~15개를 만들어 줘. 표현 객체는 form, reading(히라가나), meaning(한국어), similar, note를 사용하고, 부정 표현의 뜻과 예문·한자 읽기도 검사해 줘. 확인되지 않은 수치/인용/사실을 만들지 마.",
 "3) 기사 데이터는 각 항목에 id(기존과 중복되지 않는 고유 문자열), date(YYYY-MM-DD), title, category, source, sourceUrl, kind, bodyLength, paragraphs(일본어 문자열 배열), translationParagraphs(같은 길이의 한국어 문자열 배열), expressions(객체 배열)를 갖추게 해. article.id가 기존 기사와 겹치지 않는지, bodyLength가 실제 본문 길이와 일치하는지 검수해.",
 "4) 연결된 GitHub 도구로 저장소의 현재 파일들을 확인한 다음, 기존 data/news-generated-2026-10-10.js 방식과 동일하게 window.KOJER_CURATED_NEWS.articles에 새 기사만 id 중복 없이 push하는 신규 data/news-generated-YYYY-MM-DD-batchNN.js 파일을 생성해 줘. 이미 있는 파일·기존 기사 16개(또는 그 이후 누적된 기사)·학습 기록·기타 사이트 기능은 절대 덮어쓰거나 삭제하지 마. 같은 날짜에 파일이 있으면 batch 번호를 달리해.",
 "5) index.html의 기존 뉴스 데이터 스크립트 태그 다음에 새 스크립트 태그를 추가해 사이트에서 읽히도록 GitHub에 커밋해 줘. 새 데이터가 기사 목록/날짜 필터에 나타나도록 기존 스키마를 지켜. JS 문법 및 기사 개수, 날짜/번역/표현 검증을 하고 실제 변경이 성공했을 때만 'GitHub 등록 완료'라고 알려 줘.",
 "6) 이 대화에서 GitHub 연결이 없거나 쓰기 권한이 없어 게시할 수 없다면 등록을 성공했다고 말하지 마. 대신 6개를 전부 완성한 JSON 파일과 실패 이유를 제공하고, GitHub 연결 권한이 필요한지 알려 줘. Supabase 사용자 ID나 로그인 토큰은 요구하지 마. 별도 유료 AI API·Gemini는 사용하지 마.",
 "최종 보고는 선택한 기사 6개의 제목, 원문 검증 상태, 실제 GitHub 커밋 및 사이트 게시 성공 여부를 구분해 알려 줘.",
 "다음은 수집된 RSS 뉴스 후보 JSON이야:",JSON.stringify(candidates)
 ].join("\n\n");
 try{
  await navigator.clipboard.writeText(prompt);
  setStatus("GPT 기사 작성·GitHub 직접 등록 요청문을 복사했어. ChatGPT에 붙여넣고 전송해 줘. GitHub 연결 권한이 필요할 수 있어.");
  window.open("https://chatgpt.com/","_blank","noopener,noreferrer");
 }catch(e){
  const area=document.createElement("textarea");area.value=prompt;area.style.cssText="position:fixed;left:10%;top:15%;width:80%;height:55%;z-index:9999;background:var(--panel);color:var(--text);padding:16px";
  area.setAttribute("aria-label","GPT 요청문 — 전체 선택 후 복사");document.body.appendChild(area);area.focus();area.select();
  setStatus("자동 복사가 차단됐어. 화면의 요청문을 복사해서 ChatGPT에 붙여넣어 줘.",true);
 }
}
const gen=$("newsGenerateButton");
if(gen)gen.addEventListener("click",generateSix);
window.addEventListener("focus",()=>{if(!document.hidden)loadArchive()});
window.addEventListener("kojer-news:updated",loadArchive);
setTimeout(loadArchive,1800);
async function collect(){
 if(busy)return;
 busy=true;
 const rssResults=$("newsRssResults");
if(rssResults)rssResults.addEventListener("toggle",()=>{
 const hint=$("newsRssExpandLabel");
 if(hint)hint.textContent=rssResults.open?"접기":"목록 펼치기";
});
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