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
 "내 JLPT N1 사이트의 최신 일본 뉴스 학습 기사 6개를 작성·검수하고 연결된 GitHub 저장소 kojer-lab/jlpt-study에 직접 추가해 줘. 최종 JSON 파일을 내게 다시 전달하거나 수동 업로드하게 만들지 마.",
 "현재 뉴스는 날짜별 선택 로딩 구조야. 먼저 GitHub의 data/news-index-v1.js, data/news-articles-2026-10-10.json, index.html 및 data/news-reader-embedded.js를 열어 실제 스키마와 로딩 구조를 확인해. 과거 data/news-curated-v1.js, data/news-generated-2026-10-10.js는 백업이며 사이트에서 직접 로드하지 않아. 절대로 옛 news-generated-*.js 파일이나 오래된 방식의 script 태그만 생성하면 안 돼.",
 "1) 아래 RSS 후보에서 경제·사회·국제·문화·과학·스포츠 등 서로 다른 분야 6개를 골라 언론사 URL 원문을 직접 확인해. 접근 불가하면 신뢰할 만한 다른 보도/공식 발표로 교차 확인하고, 검증할 수 없으면 제외해. 원문을 읽지 않았다면 그 사실을 반드시 밝혀.",
 "2) 확인된 사실에 근거해 독립적으로 재작성한 JLPT N1 일본어 기사 900~1,200자 5~8문단, 문단별 자연스러운 한국어 번역 및 본문에 실제 등장하는 N1 표현 5~15개를 작성해. 인용문·수치·인물·사실을 꾸며내거나 원문을 복제하지 마.",
 "2-1) 초안 작성이 끝나면 배포 전에 반드시 별도의 2차 검수 단계를 수행해. 모든 문단의 사실관계·한국어 번역·일본어 문법·숫자·고유명사를 다시 확인하고, 기사별 N1 실전 표현 전체를 표로 추출해 본문에 실제 등장하는지, 각 form과 reading의 한자 구간이 정확히 대응하는지, 동사 활용형·부정형 읽기가 맞는지 하나씩 대조해. '不正アクセス'처럼 한자+가타카나 혼합 표현도 빠뜨리지 마. 한자 없는 표현은 임의의 후리가나를 덧붙이지 마.",
 "2-2) 유사 표현(similar)에도 한자가 있으면 괄호 안에 정확한 히라가나 읽기(예: 共同事業（きょうどうじぎょう）)를 함께 제공해. 사이트에서는 괄호를 그대로 표시하지 않고 클릭 후리가나 데이터로 사용해. 유사 표현과 본문 예문 속 한자도 가능한 읽기 검증을 수행하되 확실하지 않은 읽기는 만들어내지 말고 표시해. 표현마다 reading과 meaning을 서로 바꿔 적지 않았는지, 단어 뜻의 긍정/부정 방향이 맞는지도 검수해.",
 "2-3) 신규 날짜별 JSON을 저장하기 전에 실제 기사별 전체 문단 수, 일본어 글자 수, 번역 문단 수, N1 표현 수, 글자+읽기의 후리가나 정합성, 이미 수록된 기사와 주제/ID 중복 여부를 자동 점검해. 오류가 나오면 수정 후 다시 검사해. 검수를 했다는 말만 하지 말고 검수 결과와 수정한 항목 수를 최종 보고에 포함해.",
 "2-4) 실전 표현 제목만 확인하는 것으로는 부족해. article.expressions의 모든 form, example(해당 표현이 포함된 본문 문장), similar에 등장하는 한자를 별도로 검수해. 기존 data/news-furi-reviewed-v1.js와 날짜별 교정 사전 data/news-furi-2026-10-10-reviewed.js, data/news-reader-embedded.js의 annotate, wordHTML, annotateExpressionSentence를 참고해. 확인된 한자 읽기를 새 날짜의 data/news-furi-YYYY-MM-DD-reviewed.js 파일에 객체 병합 형태로 추가하고, index.html에 news-reader-embedded.js 앞에 script를 넣어 실제 표시되도록 해. 괄호 후리가나를 일본어 본문에 중복 표시하지 마. 적용률을 기계적으로 측정하고 가능하면 예문 한자 95% 이상을 확인하되, 확인되지 않은 읽기를 절대 지어내지 마. 미확인 항목은 별도 보고해.",
 "3) 기사 객체 필수 필드: id(중복 없는 문자열),date(YYYY-MM-DD),title,category,source,sourceUrl,kind,bodyLength(일본어 paragraph 합계 글자 수),paragraphs(일본어 문자열 배열),translationParagraphs(같은 길이의 한국어 문자열 배열),expressions([{form,reading,meaning,similar,note}]). 기존 ID 및 같은 뉴스 주제 중복을 조사해.",
 "4) 새 기사 전체를 {version:1,date:'YYYY-MM-DD',articles:[...]} 형태의 JSON으로 묶어 GitHub data/news-articles-YYYY-MM-DD-batchNN.json 에 직접 생성해. 날짜에 기존 파일이 있으면 덮어쓰지 않고 새 batch 번호로 저장해. 기사 날짜가 여러 개면 날짜별로 파일을 나눠. 기존 기사·파일·SRS·저장 기록은 모두 보존해.",
 "5) data/news-index-v1.js의 window.KOJER_NEWS_INDEX.articles 배열에 신규 기사 각각의 가벼운 메타데이터 {id,date,category,title,bodyLength,source,asset:'data/news-articles-YYYY-MM-DD-batchNN.json'}를 추가해. 기존 index 항목 전체를 유지하고 ID 중복을 막아. 새 콘텐츠 파일 경로(asset)는 GitHub에 실제 생성한 JSON을 가리켜야 해. window.KOJER_CURATED_NEWS의 빈 articles 초기화는 유지해.",
 "6) index.html의 data/news-index-v1.js 스크립트 URL에서 쿼리 버전만 새 값(예: v=YYYYMMDD-batchNN)으로 갱신해 브라우저 캐시를 무효화해. 전체 기사를 동기 스크립트로 불러오거나 날짜별 기사 본문을 첫 화면에 로드하지 마. JS 문법·JSON 구조·모든 파일 URL·기사 목록 수와 날짜 필터 작동을 점검해.",
 "7) GitHub 연결/쓰기 권한이 없으면 직접 게시했다고 주장하지 마. 저장에 실패하면 원인과 구조화 JSON 파일을 제공해. 로그인 토큰 요구 및 별도 유료 AI API/Gemini 사용은 금지야. 작업이 성공하면 새 파일, index 변경, HTML 캐시 변경에 대한 실제 GitHub 커밋과 새 기사 수를 보고해.",
 "8) 현재 기사 뉴스읽기 환경은 후리가나 클릭 방식이므로 data/news-reader-embedded.js의 expressionDetailRuby, annotateExpressionSentence, similarExpressionHTML과 호환되는 읽기를 작성해야 해. 신규 기사 저장 후 실전 표현 전체를 글자/후리가나 렌더링 관점에서도 한번 더 검수해. 기존 16개와 학습 기록은 절대로 훼손하지 마.",
 "아래는 RSS에서 수집된 뉴스 후보 목록이야:",JSON.stringify(candidates)
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