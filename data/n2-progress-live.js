
(() => {
const $ = id => document.getElementById(id);
const number = n => Number(n).toLocaleString("ko-KR");
let loading=false, lastSuccessful=0;
async function update(){
  if(loading)return;
  loading=true;$("message").textContent="GitHub 배포 데이터 확인 중…";$("dot").className="dot";
  try{
    const response=await fetch("data/n2-target-2000-draft.json?refresh="+Date.now(),{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    if(!Array.isArray(data.words))throw new Error("형식 오류");
    const statuses={};
    for(const word of data.words){statuses[word.qa_status]=(statuses[word.qa_status]||0)+1;}
    const total=data.meta.target_ready_cards||data.meta.target_total||2000,base=data.meta.ready_existing||322;
    const promoted=statuses.reviewed_promoted||0;
    const reviewed=base+promoted, progress=Math.min(100,100*reviewed/total);
    $("complete").textContent=number(reviewed);
    $("percent").textContent=progress.toFixed(2)+"%";
    $("bar").style.width=progress+"%";
    $("overallProgress").setAttribute("aria-valuenow",String(reviewed));
    $("overallProgress").setAttribute("aria-valuemax",String(total));
    $("remaining").textContent=number(Math.max(0,total-reviewed))+"개 후보 미완료";
    $("promoted").textContent=number(promoted);
    $("pending").textContent=number(statuses.needs_ko_and_long_example||0);
    $("homograph").textContent=number(statuses.needs_homograph_review||0);
    $("duplicates").textContent=number(statuses.duplicate_exact_n1||0);
    $("doneBatches").textContent=number(promoted)+"개";
    $("readyBilingual").textContent=number(reviewed)+"개";
    const when=data.meta.last_reviewed_at||data.meta.created_on||"";
    $("message").textContent="배포 데이터 정상 확인"+(when?" · 데이터 기준 "+when:"");
    $("dot").className="dot live";
    lastSuccessful=Date.now();
    $("time").textContent="조회 "+new Date().toLocaleTimeString("ko-KR");
  }catch(error){
    $("dot").className="dot fail";
    $("message").textContent=(lastSuccessful?"마지막 확인 수치 표시 중 · ":"") + "새 데이터 확인 실패 ("+error.message+")";
    $("time").textContent="네트워크를 확인하고 새로고침";
  }finally{loading=false;}
}
$("refresh").addEventListener("click",update);
window.addEventListener("online",update);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)update();});
update();setInterval(()=>{if(!document.hidden)update();},30000);
})();
