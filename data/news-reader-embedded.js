/* Integrated JLPT N1 curated-news reader. No separate page or paid AI API. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const source=Array.isArray(window.KOJER_CURATED_NEWS?.articles)?window.KOJER_CURATED_NEWS.articles:[];
const storeKey="jlpt-news-expression-test-v2";
let article=null,translationOpen=false,selectedExpression=null,expressionOpen=false;
const extra=new Map();
for(const row of "日本銀行|にほんぎんこう\n日本政府|にほんせいふ\n日本|にほん\n物価上昇|ぶっかじょうしょう\n物価|ぶっか\n原材料|げんざいりょう\n価格転嫁|かかくてんか\n輸入|ゆにゅう\n販売価格|はんばいかかく\n企業|きぎょう\n値上げ|ねあげ\n家計|かけい\n負担|ふたん\n景気|けいき\n金融政策|きんゆうせいさく\n政策金利|せいさくきんり\n金利|きんり\n判断|はんだん\n報告|ほうこく\n地域|ちいき\n影響|えいきょう\n経済|けいざい\n収益|しゅうえき\n利益|りえき\n設備投資|せつびとうし\n人工知能|じんこうちのう\n需要|じゅよう\n投資|とうし\n消費者|しょうひしゃ\n人手不足|ひとでぶそく\n人件費|じんけんひ\n上昇|じょうしょう\n増加|ぞうか\n回復|かいふく\n円安|えんやす\n見通し|みとおし\n銀行|ぎんこう\n全国|ぜんこく\n情報|じょうほう\n緊急|きんきゅう\n対策|たいさく\n会議|かいぎ\nサイバー攻撃|サイバーこうげき\n攻撃|こうげき\n東京都|とうきょうと\n小平市|こだいらし\n自治体|じちたい\n行政|ぎょうせい\n情報システム|じょうほうシステム\n関係機関|かんけいきかん\n職員|しょくいん\n参加|さんか\n確認|かくにん\n安全|あんぜん\n不正アクセス|ふせいアクセス\n個人情報|こじんじょうほう\n警察庁|けいさつちょう\n被害|ひがい\n障害|しょうがい\n復旧|ふっきゅう\n脆弱性|ぜいじゃくせい\n小池百合子|こいけゆりこ\n都知事|とちじ\n監視|かんし\n指示|しじ\n必要|ひつよう\n重要|じゅうよう\n国際刑事裁判所|こくさいけいじさいばんしょ\n国際社会|こくさいしゃかい\n国際司法|こくさいしほう\n裁判所|さいばんしょ\n最高検察庁|さいこうけんさつちょう\n身柄|みがら\n引き渡し|ひきわたし\n要求|ようきゅう\n要請|ようせい\n逮捕状|たいほじょう\n赤根智子|あかねともこ\n所長|しょちょう\n関係者|かんけいしゃ\n戦争犯罪|せんそうはんざい\n主権|しゅけん\n条約|じょうやく\n締約国|ていやくこく\n訴追|そつい\n証拠|しょうこ\n司法判断|しほうはんだん\n意思疎通|いしそつう\n独立|どくりつ\n支持|しじ\n立場|たちば\n国家|こっか\n連携|れんけい\n移送|いそう\n各国|かっこく\n国境|こっきょう\n一貫|いっかん\n今後|こんご\n問題|もんだい\n横浜流星|よこはまりゅうせい\n松村北斗|まつむらほくと\n広瀬すず|ひろせすず\n藤井道人|ふじいみちひと\n凪良ゆう|なぎらゆう\n俳優|はいゆう\n監督|かんとく\n映画|えいが\n新作映画|しんさくえいが\n公開|こうかい\n主演|しゅえん\n出演|しゅつえん\n共演|きょうえん\n作品|さくひん\n制作|せいさく\n撮影|さつえい\n原作|げんさく\n小説|しょうせつ\n舞台|ぶたい\n初日|しょにち\n漫画家|まんがか\n人物|じんぶつ\n相棒|あいぼう\n親友|しんゆう\n関係|かんけい\n演技|えんぎ\n表現|ひょうげん\n魅力|みりょく\n期待|きたい\n印象|いんしょう\n現場|げんば\n演じる|えんじる\n振り返る|ふりかえる\n扮する|ふんする\n敬意|けいい\n東京|とうきょう\n家族|かぞく\n言葉|ことば\n気持ち|きもち\n映画化|えいがか\n主人公|しゅじんこう\n世界観|せかいかん\n登場人物|とうじょうじんぶつ\n劇場版|げきじょうばん\n呪術廻戦|じゅじゅつかいせん\n進撃の巨人|しんげきのきょじん\n制作工程|せいさくこうてい\n平松禎史|ひらまつただし\n新作|しんさく\n原画|げんが\n構図|こうず\n描写|びょうしゃ\n色彩|しきさい\n音響|おんきょう\n効果音|こうかおん\n音楽|おんがく\n機会|きかい\n対談|たいだん\n会場|かいじょう\n記念展|きねんてん\n設立|せつりつ\n記念|きねん\n手描き|てがき\n鉛筆|えんぴつ\n制作者|せいさくしゃ\n世界|せかい\n細部|さいぶ\n展示|てんじ\n人間|にんげん\n個性|こせい\n進歩|しんぽ\n感覚|かんかく\n一方|いっぽう\n双方|そうほう\n背景|はいけい\n観客|かんきゃく\n関心|かんしん\n注目|ちゅうもく\n多彩|たさい\n実写|じっしゃ\n映像|えいぞう\n奥行き|おくゆき\n立体感|りったいかん\n現実|げんじつ\n体験|たいけん\n技術|ぎじゅつ\n場面|ばめん\n贈った|おくった\n描き下ろした|かきおろした\n垣根を越えて|かきねをこえて\n広がり|ひろがり\n幅広い|はばひろい\n望遠鏡|ぼうえんきょう\n宇宙|うちゅう\n星々|ほしぼし\n天体|てんたい\n観測|かんそく\n木曽観測所|きそかんそくじょ\n木曽|きそ\n東京大学|とうきょうだいがく\n科学技術振興機構|かがくぎじゅつしんこうきこう\n科学技術|かがくぎじゅつ\n研究|けんきゅう\n研究者|けんきゅうしゃ\n時間領域天文学|じかんりょういきてんもんがく\n時間|じかん\n領域|りょういき\n機器|きき\n装置|そうち\n高速|こうそく\n画像|がぞう\n現象|げんしょう\n変動|へんどう\n口径|こうけい\n平方度|へいほうど\n範囲|はんい\n速度|そくど\n視野|しや\n可視光|かしこう\n分解能|ぶんかいのう\n分析|ぶんせき\n解析|かいせき\n比較|ひかく\n撮影技術|さつえいぎじゅつ\n長野県|ながのけん\n波及|はきゅう\n継続|けいぞく\n記録|きろく\n明るさ|あかるさ\n変化|へんか\n訪れた|おとずれた\n訪れ|おとずれ\n作り|つくり\n作り手|つくりて\n異なる|ことなる\n来日|らいにち\n来日した|らいにちした\n周年|しゅうねん\n巡った|めぐった\n最初|さいしょ\n足を止めた|あしをとめた\n足を運んだ|あしをはこんだ\n髪|かみ\n描き|えがき\n描く|えがく\n向けた|むけた\n着目|ちゃくもく\n画面|がめん\n見つめた|みつめた\n食い入る|くいいる\n質問|しつもん\n質問した|しつもんした\n若い|わかい\n世代|せだい\n経験|けいけん\n意味|いみ\n説明|せつめい\n説明した|せつめいした\n共感|きょうかん\n共感し|きょうかんし\n手作業|てさぎょう\n残る|のこる\n応じた|おうじた\n反映|はんえい\n短い|みじかい\n共通|きょうつう\n課題|かだい\n抱える|かかえる\n続いて|つづいて\n話題|わだい\n移った|うつった\n二度|にど\n鑑賞|かんしょう\n明かし|あかし\n評価|ひょうか\n評価した|ひょうかした\n高く|たかく\n大きな|おおきな\n伝わる|つたわる\n追求|ついきゅう\n述べ|のべ\n約|やく\n費やした|ついやした\n紹介|しょうかい\n紹介した|しょうかいした\n実際|じっさい\n動物|どうぶつ\n鳴き声|なきごえ\n裏話|うらばなし\n披露|ひろう\n全体|ぜんたい\n構想|こうそう\n固め|かため\n使用|しよう\n活用|かつよう\n屋外|おくがい\n一切|いっさい\n取り巻く|とりまく\n引き上げ|ひきあげ\n引き上げる|ひきあげる\n圧力|あつりょく\n品目|ひんもく\n商品|しょうひん\n実態|じったい\n浮かび上がった|うかびあがった\n価格|かかく\n高騰|こうとう\n中東情勢|ちゅうとうじょうせい\n緊迫化|きんぱくか\n押し上げ|おしあげ\n踏み切る|ふみきる\n動き|うごき\n日々|ひび\n買い物|かいもの\n直結|ちょっけつ\n小さくない|ちいさくない\n仕入れ値|しいれね\n自社|じしゃ\n努力|どりょく\n吸収|きゅうしゅう\n難しい|むずかしい\n重なり|かさなり\n据え置く|すえおく\n据え置けば|すえおけば\n圧迫|あっぱく\n慎重|しんちょう\n呼び戻す|よびもどす\n割引|わりびき\n販売促進|はんばいそくしん\n確保|かくほ\n顧客離れ|こきゃくばなれ\n防ぐ|ふせぐ\n迫られる|せまられる\n停滞|ていたい\n各地域|かくちいき\n緩やかな|ゆるやかな\n見方|みかた\n賃金|ちんぎん\n下支え|したざさえ\n底堅さ|そこがたさ\n一定|いってい\n普及|ふきゅう\n拡大|かくだい\n電子部品|でんしぶひん\n製造装置|せいぞうそうち\n通信設備|つうしんせつび\n活発化|かっぱつか\n活動|かつどう\n一因|いちいん\n成長分野|せいちょうぶんや\n好調|こうちょう\n恩恵|おんけい\n産業|さんぎょう\n均等|きんとう\n限らない|かぎらない\n新たな|あらたな\n同時|どうじ\n存在|そんざい\n現在|げんざい\n複雑|ふくざつ\n今年|ことし\n二度|にど\n対応|たいおう\n狙った|ねらった\n相次ぐ|あいつぐ\n改めて|あらためて\n各局|かくきょく\n部長級|ぶちょうきゅう\n日頃|ひごろ\n備え|そなえ\n発生|はっせい\n場合|ばあい\n対応手順|たいおうてじゅん\n多く|おおく\n支えられる|ささえられる\n単なる|たんなる\n故障|こしょう\n今回|こんかい\n利用|りよう\n身代金|みのしろきん\n受けた|うけた\n閲覧|えつらん\n状態|じょうたい\n陥り|おちいり\n時点|じてん\n外部|がいぶ\n事業者|じぎょうしゃ\n業務|ぎょうむ\n効率化|こうりつか\n提供元|ていきょうもと\n弱点|じゃくてん\n浮き彫り|うきぼり\n部局|ぶきょく\n防御策|ぼうぎょさく\n点検|てんけん\n方針|ほうしん\n侵入|しんにゅう\n万一|まんいち\n発覚|はっかく\n部署|ぶしょ\n事態|じたい\n把握|はあく\n順番|じゅんばん\n共有|きょうゆう\n事前|じぜん\n初動対応|しょどうたいおう\n遅れ|おくれ\n住民|じゅうみん\n同日|どうじつ\n定例会見|ていれいかいけん\n都庁|とちょう\n常時|じょうじ\n人員|じんいん\n増強|ぞうきょう\n明らかに|あきらかに\n一度|いちど\n保証|ほしょう\n手口|てぐち\n見直し|みなおし\n欠かせない|かかせない\n流出|りゅうしゅつ\n対立|たいりつ\n複数|ふくすう\n裁く|さばく\n仕組み|しくみ\n再び|ふたたび\n示した|しめした\n遺憾|いかん\n活動|かつどう\n強調|きょうちょう\n八日|ようか\n九日|ここのか\n九人|きゅうにん\n求めた|もとめた\n明らか|あきらか\n自国民|じこくみん\n違法|いほう\n十分|じゅうぶん\n発付|はっぷ\n当局|とうきょく\n見解|けんかい\n認められた|みとめられた\n意味|いみ\n人道|じんどう\n罪|つみ\n重大|じゅうだい\n犯罪|はんざい\n刑事責任|けいじせきにん\n問う|とう\n設けられた|もうけられた\n大統領|だいとうりょう\n当時|とうじ\n裁判官|さいばんかん\n関わった|かかわった\n経緯|けいい\n昨年|さくねん\n十二月|じゅうにがつ\n本人|ほんにん\n出席|しゅっせき\n審理|しんり\n進める|すすめる\n欠席裁判|けっせきさいばん\n有罪判決|ゆうざいはんけつ\n一連|いちれん\n延長線上|えんちょうせんじょう\n位置付け|いちづけ\n措置|そち\n不当|ふとう\n尾崎官房副長官|おざきかんぼうふくちょうかん\n官房副長官|かんぼうふくちょうかん\n申し入れ|もうしいれ\n含めて|ふくめて\n実効性|じっこうせい\n疑惑|ぎわく\n手掛かり|てがかり\n広い|ひろい\n空|そら\n光|ひかり\n見える|みえる\n捉える|とらえる\n彼方|かなた\n夜空|よぞら\n短時間|たんじかん\n瞬間|しゅんかん\n放つ|はなつ\n起きる|おきる\n見逃す|みのがす\n動画|どうが\n搭載|とうさい\n百五|ひゃくご\n特徴|とくちょう\n一度|いちど\n一般|いっぱん\n大きく|おおきく\n見渡せる|みわたせる\n能力|のうりょく\n最大|さいだい\n毎秒|まいびょう\n一定|いってい\n間隔|かんかく\n一枚|いちまい\n写真|しゃしん\n撮る|とる\n連続|れんぞく\n得られた|えられた\n調べる|しらべる\n詳しく|くわしく\n大量|たいりょう\n進む|すすむ\n数え切れない|かぞえきれない\n見つけ出す|みつけだす\n作業|さぎょう\n同じ|おなじ\n繰り返し|くりかえし\n強さ|つよさ\n速さ|はやさ\n処理|しょり\n役割|やくわり\n担う|になう\n天域|てんいき\n追い掛ける|おいかける\n異なる|ことなる\n種類|しゅるい\n組み合わせる|くみあわせる\n頼らず|たよらず\n多く|おおく\n紹介|しょうかい\n訪問|ほうもん\n汝|なんじ\n本屋大賞|ほんやたいしょう\n受賞|じゅしょう\n瀬戸内|せとうち\n十五年|じゅうごねん\n男女|だんじょ\n選択|せんたく\n井上暁海|いのうえあけみ\n青埜櫂|あおのかい\n久住尚人|くずみなおと\n尚人|なおと\n櫂|かい\n夢|ゆめ\n目指す|めざす\n揺れ動く|ゆれうごく\n互い|たがい\n置かれた|おかれた\n環境|かんきょう\n人生|じんせい\n決断|けつだん\n一致|いっち\n物語|ものがたり\n追い掛ける|おいかける\n主役|しゅやく\n恋愛|れんあい\n支える|ささえる\n存在|そんざい\n楽しかった|たのしかった\n以前|いぜん\n以来|いらい\n再会|さいかい\n喜び|よろこび\n率直|そっちょく\n段階|だんかい\n感じていた|かんじていた\n仕事|しごと\n抱いていた|いだいていた\n持つ|もつ\n優しさ|やさしさ\n繊細|せんさい\n重なって|かさなって\n響き合う|ひびきあう\n説得力|せっとくりょく\n高揚感|こうようかん\n包まれる|つつまれる\n通じて|つうじて\n築かれた|きずかれた\n登壇|とうだん\n同士|どうし".split("\n")){
 const p=row.indexOf("|");if(p<1)continue;
 const surface=row.slice(0,p).trim(),reading=row.slice(p+1).trim(),initial=surface[0];
 if(!surface||!reading)continue;
 if(!extra.has(initial))extra.set(initial,[]);
 extra.get(initial).push({surface,reading});
}
for(const arr of extra.values())arr.sort((a,b)=>b.surface.length-a.surface.length);
function wordHTML(surface,reading){
 const kanji=/[一-龯々]/;
 if(!kanji.test(surface))return esc(surface);
 const part=typeof furiganaParts==="function"?furiganaParts(surface,reading):{head:"",base:surface,reading,tail:""};
 if(!part.base||!part.reading||!kanji.test(part.base))return esc(surface);
 return esc(part.head)+'<span class="furi" data-r="'+esc(part.reading)+'">'+esc(part.base)+'</span>'+esc(part.tail);
}
function annotate(str){
 const text=String(str||"");let output="",offset=0,covered=0,kanji=0;
 kanji=(text.match(/[一-龯々]/g)||[]).length;
 while(offset<text.length){
  let hit=null;
  for(const entry of extra.get(text[offset])||[]){if(text.startsWith(entry.surface,offset)){hit=entry;break}}
  if(typeof exampleFuriLexicon!=="undefined"){
   const choices=exampleFuriLexicon.get(text[offset])||[];
   for(const entry of choices){
    if(text.startsWith(entry.surface,offset)&&(!hit||entry.surface.length>hit.surface.length)){hit=entry;break}
   }
  }
  if(hit){
   output+=wordHTML(hit.surface,hit.reading);
   covered+=(hit.surface.match(/[一-龯々]/g)||[]).length;
   offset+=hit.surface.length;
  }else{output+=esc(text[offset]);offset++}
 }
 return {output,covered,kanji};
}
function paragraphHTML(text){
 const expressions=(article?.expressions||[]).filter(e=>e?.form&&text.includes(e.form)).sort((a,b)=>b.form.length-a.form.length);
 let offset=0,html="",covered=0,kanji=0;
 while(offset<text.length){
  let hit=null;
  for(const exp of expressions){
   const i=text.indexOf(exp.form,offset);
   if(i<0)continue;
   if(!hit||i<hit.pos||(i===hit.pos&&exp.form.length>hit.exp.form.length))hit={pos:i,exp};
  }
  if(!hit){const a=annotate(text.slice(offset));html+=a.output;covered+=a.covered;kanji+=a.kanji;break}
  const a=annotate(text.slice(offset,hit.pos));covered+=a.covered;kanji+=a.kanji;html+=a.output;
  const b=annotate(hit.exp.form);covered+=b.covered;kanji+=b.kanji;
  html+='<span class="news-phrase" data-news-expression="'+esc(hit.exp.form)+'">'+b.output+"</span>";
  offset=hit.pos+hit.exp.form.length;
 }
 return {html,covered,kanji};
}
function saved(){
 try{const x=JSON.parse(localStorage.getItem(storeKey)||"[]");return Array.isArray(x)?x:[]}catch{return []}
}
function clearExpressionSelection(){
 selectedExpression=null;
 $("newsArticleBody").querySelectorAll("[data-news-expression]").forEach(el=>el.classList.remove("news-phrase-selected"));
 $("newsArticleExpressions").querySelectorAll("[data-news-expression-button]").forEach(el=>{
  el.classList.remove("active");
  el.setAttribute("aria-pressed","false");
 });
 $("newsArticleExpressionInfo").classList.add("hidden");
 $("newsArticleExpressionInfo").innerHTML="";
}
function expressionTab(open){
 expressionOpen=!!open;
 $("newsExpressionPanel").classList.toggle("hidden",!expressionOpen);
 $("newsExpressionToggle").setAttribute("aria-expanded",String(expressionOpen));
 $("newsExpressionArrow").textContent=expressionOpen?"－":"＋";
 if(!expressionOpen)clearExpressionSelection();
}
function phrase(key,{preserve=false,scroll=true}={}){
 if(!article||!expressionOpen)return;
 const e=article.expressions.find(x=>x.form===key);if(!e)return;
 if(!preserve&&selectedExpression===key){clearExpressionSelection();return;}
 selectedExpression=key;
 let firstHighlight=null;
 $("newsArticleBody").querySelectorAll("[data-news-expression]").forEach(el=>{
  const active=el.dataset.newsExpression===key;
  el.classList.toggle("news-phrase-selected",active);
  if(active&&!firstHighlight)firstHighlight=el;
 });
 $("newsArticleExpressions").querySelectorAll("[data-news-expression-button]").forEach(el=>{
  const active=el.dataset.newsExpressionButton===key;
  el.classList.toggle("active",active);
  el.setAttribute("aria-pressed",String(active));
 });
 const index=article.paragraphs.findIndex(x=>x.includes(key));
 const jp=index>=0?article.paragraphs[index]:"";
 const sentence=jp.split(/(?<=[。！？!?])/).find(x=>x.includes(key))||jp;
 const ko=index>=0?(article.translationParagraphs?.[index]||""):"";
 const id=article.id+":"+key,already=saved().some(x=>x.id===id);
 const panel=$("newsArticleExpressionInfo");
 panel.innerHTML='<strong lang="ja">'+esc(key)+'</strong> <span class="tag">실전 표현</span><p>'+esc(e.meaning||"")+'</p><p lang="ja" style="font-size:14px">'+esc(sentence)+'</p><button type="button" class="secondary" id="newsSavePhrase">'+(already?"✓ 저장됨 · 해제":"＋ 실전 표현 수첩에 저장")+"</button>";
 panel.classList.remove("hidden");
 $("newsSavePhrase").addEventListener("click",()=>{
  const all=saved();
  const next=all.some(x=>x.id===id)?all.filter(x=>x.id!==id):[...all,{id,type:"뉴스 표현",form:key,reading:"",meaning:e.meaning||"",example:sentence,translation:ko,note:"보도를 바탕으로 재구성한 학습 기사에 등장하는 표현",compare:"",source:article.source,title:article.title,cat:article.category,savedAt:new Date().toISOString()}];
  try{localStorage.setItem(storeKey,JSON.stringify(next));phrase(key,{preserve:true,scroll:false})}catch{$("newsSavePhrase").textContent="저장할 수 없어"}
 });
 if(scroll&&firstHighlight)firstHighlight.scrollIntoView({block:"center",behavior:"smooth"});
}
function refreshMode(){
 const m=localStorage.getItem("jlptN1FuriV3")||"interactive";
 $("newsArticleTools").querySelectorAll("[data-news-furi]").forEach(button=>{
  const active=button.dataset.newsFuri===m;
  button.classList.toggle("active",active);
  button.setAttribute("aria-pressed",String(active));
 });
}
function displayArticle(id){
 const a=source.find(x=>x.id===id);
 if(!a){displayList();return}
 article=a;translationOpen=false;
 $("newsCuratedBrowser").classList.add("hidden");
 $("newsCuratedDetail").classList.remove("hidden");
 $("newsArticleMeta").textContent=[a.category,a.source,a.date,a.bodyLength+"자"].join(" · ");
 $("newsArticleTitle").textContent=a.title;
 let marked=0,total=0;
 $("newsArticleBody").innerHTML=a.paragraphs.map(p=>{
  const r=paragraphHTML(p);marked+=r.covered;total+=r.kanji;
  return "<p>"+r.html+"</p>"
 }).join("");
 $("newsArticleTranslation").innerHTML=a.translationParagraphs.map(p=>"<p>"+esc(p)+"</p>").join("");
 $("newsArticleTranslation").classList.add("hidden");
 $("newsArticleTranslate").textContent="한국어 번역 보기";
 $("newsExpressionCount").textContent="("+a.expressions.length+"개)";
 $("newsArticleExpressions").innerHTML=a.expressions.map(e=>'<button class="secondary" type="button" aria-pressed="false" data-news-expression-button="'+esc(e.form)+'">'+esc(e.form)+'</button>').join("");
 expressionTab(false);
 refreshMode();
 if(typeof restoreInteractiveFuriState==="function")restoreInteractiveFuriState($("newsArticleBody"));
 $("newsArticleBody").dataset.readingCoverage=total?String(Math.round(100*marked/total)):"100";
}
function displayList(){
 if(article)expressionTab(false);
 article=null;$("newsCuratedBrowser").classList.remove("hidden");$("newsCuratedDetail").classList.add("hidden");
}
function route(){
 let hash=location.hash||"";
 try{hash=decodeURIComponent(hash)}catch{}
 if(!hash.startsWith("#newsreader"))return;
 if(!$("newsreaderView")?.classList.contains("active")&&typeof showView==="function")showView("newsreader");
 const id=hash.startsWith("#newsreader/")?hash.slice("#newsreader/".length):"";
 if(id)displayArticle(id);else displayList();
 window.scrollTo({top:0,behavior:"auto"});
}
function init(){
 if(!$("newsCuratedDetail"))return;
 for(const id of ["newsCuratedBack","newsCuratedBottomBack"])$(id).addEventListener("click",()=>{location.hash="#newsreader"});
 $("newsArticleTranslate").addEventListener("click",()=>{
  if(!article)return;
  translationOpen=!translationOpen;
  $("newsArticleTranslation").classList.toggle("hidden",!translationOpen);
  $("newsArticleTranslate").textContent=translationOpen?"한국어 번역 숨기기":"한국어 번역 보기";
 });
 $("newsArticleTools").addEventListener("click",e=>{
  const button=e.target.closest("[data-news-furi]");if(!button)return;
  localStorage.setItem("jlptN1FuriV3",button.dataset.newsFuri);
  if(typeof applyFuri==="function")applyFuri();
  refreshMode();
 });
 $("newsExpressionToggle").addEventListener("click",()=>expressionTab(!expressionOpen));
 $("newsArticleExpressions").addEventListener("click",e=>{
  const btn=e.target.closest("[data-news-expression-button]");
  if(btn)phrase(btn.dataset.newsExpressionButton);
 });
 document.addEventListener("click",e=>{
  const link=e.target.closest('a[href^="#newsreader/"]');
  if(link&&location.hash!=="#newsreader")history.replaceState(null,"","#newsreader");
  if(e.target.closest('[data-view="newsreader"],[data-go="newsreader"]')){
   history.replaceState(null,"","#newsreader");displayList();
  }
 },true);
 window.addEventListener("hashchange",route);
 window.addEventListener("popstate",route);
 route();
}
init();
})();
