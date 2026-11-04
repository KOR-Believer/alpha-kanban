(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const docs=window.AK_DOCS, groups=window.AK_GROUPS, releases=window.AK_RELEASES;
const getStored=(key,fallback)=>{try{return localStorage.getItem('akc06-'+key)||fallback}catch{return fallback}};
const store=(key,val)=>{try{localStorage.setItem('akc06-'+key,val)}catch{}};
let lang='ko',theme='light',channel='stable',route='/docs/start',section='',currentHash='',pending='',restoreControl='',searchItems=[],selected=0,opener=null,toastTimer,observer;
const scrollPositions=new Map();
const t=(ko,en)=>lang==='en'?en:ko;
const txt=obj=>obj[lang];
const visibleDocs=()=>docs.filter(d=>window.AK_DOC_CHANNELS[channel].includes(d.id));
const glyphs={
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
 book:'<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2"/>',
 folder:'<path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z"/><path d="M7 11v5m5-5v3m5-3v6"/>',
 flask:'<path d="M9 3h6M10 3v7L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-10V3M7 16h10"/>',
 moon:'<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 language:'<path d="M3 5h12M9 3v2M5 5c0 5 4 8 8 10M13 5c0 5-4 8-8 10m10 6 4-11 4 11m-6-4h4"/>',
 right:'<path d="M5 12h14m-6-6 6 6-6 6"/>',left:'<path d="M19 12H5m6-6-6 6 6 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"/>',
 check:'<path d="m5 12 4 4L19 6"/>',hash:'<path d="M5 9h15M4 15h15M11 3 7 21M17 3l-4 18"/>',list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
};
function icon(name){return `<svg class="od-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name]||glyphs.book}</svg>`}
function href(path,anchor='',overrides={}){
 const p=new URLSearchParams({lang,theme,channel,...overrides});if(anchor)p.set('section',anchor);
 return '#'+path+'?'+p.toString();
}
function docLink(id,label,anchor=''){return `<a href="${esc(href('/docs/'+id,anchor))}">${label}</a>`}
function parse(){
 const [rawPath,rawQuery='']=location.hash.slice(1).split('?');
 const p=new URLSearchParams(rawQuery);route=rawPath||'/docs/start';section=p.get('section')||'';
 const choose=(key,values,fall)=>values.includes(p.get(key))?p.get(key):values.includes(getStored(key,fall))?getStored(key,fall):fall;
 lang=choose('lang',['ko','en'],'ko');theme=choose('theme',['light','dark'],'light');channel=choose('channel',['stable','canary'],'stable');
 document.documentElement.lang=lang;document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.dataset.releaseChannel=channel;
}
function titleRelease(r){return txt(window.AK_RELEASE_TITLES[r.id]||{ko:r.notes.ko[0],en:r.notes.en[0]})}
function heading(id,title){return `<h2 id="${esc(id)}" tabindex="-1">${title}<a class="heading-link" href="${esc(href(route,id))}" aria-label="${esc(t('문단 링크: ','Link to section: ')+title)}">${icon('hash')}</a></h2>`}
function decorate(body){
 const holder=document.createElement('div');holder.innerHTML=body;
 holder.querySelectorAll('[data-channel-content]').forEach(el=>{if(el.dataset.channelContent!==channel)el.remove()});
 holder.querySelectorAll('a[data-doc]').forEach(a=>{
  if(window.AK_DOC_CHANNELS[channel].includes(a.dataset.doc))a.setAttribute('href',href('/docs/'+a.dataset.doc,a.dataset.section||''));
  else a.replaceWith(document.createTextNode(a.textContent));
 });
 holder.querySelectorAll('[data-copy-label]').forEach(s=>s.innerHTML=icon('copy')+' '+t('복사','Copy'));
 holder.querySelectorAll('[data-table-label]').forEach(el=>el.setAttribute('aria-label',t('설정 표, 가로로 스크롤할 수 있습니다','Configuration table, scroll horizontally for more')));
 return holder.innerHTML;
}
function sideNav(){
 const visible=visibleDocs();
 return groups.map((g,idx)=>{
  const items=visible.filter(d=>d.group===idx);if(!items.length)return '';
  return `<section class="nav-group"><h2>${txt(g)}</h2>${items.map(d=>`<a href="${esc(href('/docs/'+d.id))}"${route==='/docs/'+d.id?' aria-current="page"':''}>${txt(d.title)}</a>`).join('')}</section>`;
 }).join('');
}
function renderHeader(){
 $('.header-inner').innerHTML=`<a class="brand" href="${esc(href('/docs/start'))}" aria-label="Alpha Kanban ${t('문서 홈','documentation home')}"><span class="brand-mark">${icon(channel==='canary'?'flask':'folder')}</span><span>Alpha Kanban</span>${channel==='canary'?'<span class="badge canary">CANARY</span>':''}</a>
 <nav class="top-nav" aria-label="${t('주 탐색','Main navigation')}"><button class="btn ghost mobile-menu" id="menu-open" aria-haspopup="dialog" aria-controls="menu-dialog">${icon('menu')}${t('메뉴','Menu')}</button><a href="${esc(href('/docs/start'))}"${route.startsWith('/docs')?' aria-current="page"':''}>${t('문서','Docs')}</a><a href="${esc(href('/releases'))}"${route.startsWith('/releases')?' aria-current="page"':''}>${t('릴리즈','Releases')}</a></nav>
 <div class="tools"><label class="language-wrap">${icon('language')}<span class="sr-only">${t('언어','Language')}</span><select id="language" aria-label="${t('언어','Language')}"><option value="ko"${lang==='ko'?' selected':''}>한국어</option><option value="en"${lang==='en'?' selected':''}>English</option></select></label><button id="theme-toggle" class="btn ghost icon-btn" aria-label="${t(theme==='dark'?'라이트 모드로 전환':'다크 모드로 전환',theme==='dark'?'Switch to light mode':'Switch to dark mode')}" title="${t(theme==='dark'?'라이트 모드':'다크 모드',theme==='dark'?'Light mode':'Dark mode')}">${icon(theme==='dark'?'sun':'moon')}</button><span class="divider" aria-hidden="true"></span><button id="search-open" class="btn search-trigger" aria-label="${t('공식 문서 검색','Search public documentation')}" aria-haspopup="dialog" aria-controls="search-dialog">${icon('search')}<span class="search-label-text">${t('문서 검색','Search docs')}</span><kbd>⌘ K</kbd></button></div>`;
 $('#sidebar-content').innerHTML=sideNav();$('#sidebar-label').textContent=t('공식 문서','DOCUMENTATION');
 $('#sidebar-foot').textContent=t('AI와 대화하고, 문서로 이어가세요.','Start a conversation. Keep a record.');
 $('#menu-title').textContent=t('문서 탐색','Browse documentation');$('#menu-links').innerHTML=sideNav();
 $('#footer-note').textContent=t('AI와 함께하는 작업의 기록','A record of your work with AI');
 $('#footer-links').innerHTML=docLink('start',t('문서','Docs'))+' &nbsp;·&nbsp; '+`<a href="${esc(href('/releases'))}">${t('릴리즈','Releases')}</a>`;
 $('#skip-link').textContent=t('본문으로 건너뛰기','Skip to content');
 $('.sidebar').setAttribute('aria-label',t('공식 문서','Documentation'));
 $('#toc').setAttribute('aria-label',t('이 페이지에서','On this page'));
 $('#footer-links').setAttribute('aria-label',t('하단 탐색','Footer navigation'));
 $('.review-area').setAttribute('aria-label',t('시안 검토 도구','Prototype review tools'));
 $('#search-results').setAttribute('aria-label',t('검색 결과','Search results'));
 $('label[for="manual-copy"]').textContent=t('복사할 텍스트','Text to copy');
 $$('.close-dialog').forEach(b=>{b.innerHTML=icon('close');b.setAttribute('aria-label',t('닫기','Close'))});
}
function renderToc(items){
 const nav=items.map((s,i)=>`<a href="${esc(href(route,s.id))}" data-toc="${s.id}"${i===0?' aria-current="location"':''}>${s.title}</a>`).join('');
 $('#toc').innerHTML=items.length?`<p>${t('이 페이지에서','On this page')}</p><nav aria-label="${t('페이지 목차','On this page')}">${nav}</nav><div class="toc-foot"><p>${t('변경된 내용이 궁금한가요?','Looking for what changed?')}</p><a href="${esc(href('/releases'))}">${t('릴리즈 읽기','Read the releases')} →</a></div>`:'';
 return items.length?`<details class="mobile-toc"><summary>${t('이 페이지의 목차','On this page')}</summary><nav aria-label="${t('페이지 목차','On this page')}">${nav}</nav></details>`:'';
}
function docPage(d){
 const guide=window.AK_VISUAL_GUIDES.render(d.id,lang);
 const anchor=d.sections.findIndex(s=>s.id===window.AK_VISUAL_GUIDES.afterSection(d.id));
 const splitAt=anchor<0?d.sections.length:anchor+1;
 const list=d.sections.map(s=>({id:s.id,title:txt(s.title)}));
 if(guide)list.splice(splitAt,0,{id:'visual-guide',title:t('직접 눌러보는 예시','Interactive example')});
 const prose=sections=>sections.length?`<div class="ak-markdown">${sections.map(s=>`<section>${heading(s.id,txt(s.title))}${decorate(txt(s.body))}</section>`).join('')}</div>`:'';
 const body=prose(d.sections.slice(0,splitAt))+guide+prose(d.sections.slice(splitAt));
 const mobile=renderToc(list);const visible=visibleDocs(),idx=visible.indexOf(d),prev=visible[idx-1],next=visible[idx+1];
 return `<div class="breadcrumb">${docLink('start',t('문서','Docs'))}${icon('chevron')}<span>${txt(groups[d.group])}</span></div><header class="page-heading"><h1 id="page-title" tabindex="-1">${txt(d.title)}</h1><p class="page-lead">${txt(d.lead)}</p></header>${mobile}${body}<nav class="next-prev" aria-label="${t('이전 및 다음 문서','Previous and next documents')}">${prev?`<a href="${esc(href('/docs/'+prev.id))}">${icon('left')}<span class="od-field"><small>${t('이전 문서','Previous')}</small><strong>${txt(prev.title)}</strong></span></a>`:'<span></span>'}${next?`<a href="${esc(href('/docs/'+next.id))}"><span class="od-field"><small>${t('다음 문서','Next')}</small><strong>${txt(next.title)}</strong></span>${icon('right')}</a>`:'<span></span>'}</nav>`;
}
function releaseList(){
 const list=[...releases[channel]].sort((a,b)=>b.date.localeCompare(a.date)||b.sequence-a.sequence);
 renderToc([]);
 return `<div class="breadcrumb"><span>${t('릴리즈','Releases')}</span>${icon('chevron')}<span>${channel==='canary'?'Canary':t('정식','Stable')}</span></div><header class="page-heading"><h1 id="page-title" tabindex="-1">${t('새로워진 Alpha Kanban','What’s new in Alpha Kanban')}</h1><p class="page-lead">${t('달라진 동작과 다음 작업을 날짜순으로 확인하세요.','Read what changed and what to do next, in date order.')}</p></header><div class="release-list">${list.map(r=>`<article class="release-item"><time datetime="${r.date}">${r.date.replaceAll('-','.')}</time><div><h2><a href="${esc(href('/releases/'+r.id))}">${esc(titleRelease(r))}</a></h2><p>${esc(r.notes[lang][0])}</p><a class="read-link" href="${esc(href('/releases/'+r.id))}">${t('변경 내용 읽기','Read the changes')}${icon('right')}</a></div></article>`).join('')}</div>`;
}
function releaseDetail(r){
 const visible=visibleDocs();
 const related=(window.AK_RELEASE_RELATED[r.id]||['updates']).map(id=>visible.find(d=>d.id===id)).filter(Boolean);
 const notes=r.notes[lang], skillNotes=r.skill?.notes[lang]||[], isShort=notes.length===1;
 const sections=[];
 if(!isShort)sections.push({id:'changes',title:t('달라진 동작','What changed')});
 if(!isShort&&skillNotes.length)sections.push({id:'next-action',title:t('기존 사용자의 다음 행동','What to do next')});
 if(related.length)sections.push({id:'related',title:t('관련 가이드','Related guides')});
 const mobile=renderToc(sections);
 const body=isShort
  ?notes.concat(skillNotes).map(n=>`<p>${esc(n)}</p>`).join('')
  :`<section>${heading('changes',t('달라진 동작','What changed'))}<ul>${notes.slice(1).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></section>${skillNotes.length?`<section>${heading('next-action',t('기존 사용자의 다음 행동','What to do next'))}${skillNotes.map(n=>`<p>${esc(n)}</p>`).join('')}</section>`:''}`;
 return `<a class="release-back" href="${esc(href('/releases'))}">${icon('left')}${t('릴리즈 목록','All releases')}</a><header class="page-heading"><div class="release-date"><time datetime="${r.date}">${r.date.replaceAll('-','.')}</time><span class="badge">${channel==='canary'?'CANARY':t('정식','Stable')}</span></div><h1 id="page-title" tabindex="-1">${esc(titleRelease(r))}</h1>${isShort?'':`<p class="page-lead">${esc(notes[0])}</p>`}</header>${isShort?'':mobile}<div class="ak-markdown">${body}${related.length?`<section>${heading('related',t('관련 가이드','Related guides'))}<div class="related-links">${related.map(d=>`<a href="${esc(href('/docs/'+d.id))}"><span>${txt(d.title)}</span>${icon('right')}</a>`).join('')}</div></section>`:''}</div>`;
}
function missing(){
 renderToc([]);const isRelease=route.startsWith('/releases/');
 return `<div class="not-found"><p class="error-number">404</p><h1 id="page-title" tabindex="-1">${t(isRelease?'이 릴리즈를 찾을 수 없습니다':'페이지를 찾을 수 없습니다',isRelease?'Release not found':'Page not found')}</h1><p class="page-lead">${t(isRelease?'이 채널에 해당 릴리즈 상세가 없습니다. 앱의 업데이트 내역에서 제공된 요약은 그대로 읽을 수 있습니다.':'주소를 확인하거나 문서 시작 페이지에서 원하는 내용을 찾아보세요.',isRelease?'This release detail is not available in this channel. You can still read the summary supplied in the app’s Update history.':'Check the address or find what you need from the documentation home.')}</p><p class="error-path">${esc(route)}</p><div class="od-cluster"><a class="btn primary" href="${esc(href(isRelease?'/releases':'/docs/start'))}">${t(isRelease?'릴리즈 목록으로':'문서 시작으로',isRelease?'Back to releases':'Documentation home')}</a><button class="btn" id="missing-search">${icon('search')}${t('문서 검색','Search docs')}</button></div></div>`;
}
function updateReview(){
 $('#review-summary').textContent=t('시안 검토 도구 · 제품 영역 밖','Prototype review tools · outside the product');
 $('#review-channel-label').textContent=t('검토 채널','Review channel');$('#review-channel').value=channel;
 $('#review-channel option[value=stable]').textContent=t('Stable · 정식','Stable');
 const previousState=$('#review-state').value;
 $('#review-state-label').textContent=t('대표 상태','Review state');
 $('#review-state').innerHTML=[['start',t('시작하기','Getting started')],['owners',t('소유자 가이드','Owner guide')],['config',t('설정 참고','Configuration')],['releases',t('릴리즈 목록','Release list')],['search',t('검색 전','Search, empty query')],['results',t('검색 결과','Search results')],['empty',t('검색 결과 없음','No search results')],['missing',t('없는 문서 주소','Missing document')],['missing-release',t('없는 릴리즈 상세','Missing release detail')]].filter(([v])=>!docs.some(d=>d.id===v)||window.AK_DOC_CHANNELS[channel].includes(v)).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
 if(Array.from($('#review-state').options).some(o=>o.value===previousState))$('#review-state').value=previousState;
 $('#review-open').textContent=t('상태 열기','Open state');$('#review-notes-link').textContent=t('검토 노트 보기','Review notes');
 $('#review-help').textContent=t('이 영역은 시안 검토용입니다. 채널 전환은 제품 기능이 아니며 폴더 접근·설치·업데이트를 실행하지 않습니다. 390px는 브라우저 창 너비로 확인하세요.','This area is for prototype review. Channel switching is not a product feature. No folder access, installation, or update is performed. Review mobile at a browser width of 390px.');
}
function render(){
 if(observer)observer.disconnect();parse();currentHash=location.hash;renderHeader();
 let html,title;
 const d=visibleDocs().find(d=>route==='/docs/'+d.id);
 if(d){html=docPage(d);title=txt(d.title)}else if(route==='/releases'){html=releaseList();title=t('릴리즈','Releases')}else{
 const r=releases[channel].find(r=>route==='/releases/'+r.id);
 if(r){html=releaseDetail(r);title=titleRelease(r)}else{html=missing();title=t('페이지를 찾을 수 없습니다','Page not found')}
 }
 $('#main').innerHTML=html;window.AK_VISUAL_GUIDES.mount();document.title=title+' · Alpha Kanban'+(channel==='canary'?' Canary':'');updateReview();
 $('#copy-title').textContent=t('텍스트 복사','Copy text');$('#copy-help').textContent=t('자동 복사를 사용할 수 없습니다. 아래 텍스트를 선택해 복사하세요.','Automatic copy is unavailable. Select and copy the text below.');
 $('#search-title').textContent=t('문서 검색','Search documentation');$('#search-label').textContent=t('공식 문서에서 찾기','Find in public documentation');$('#search-input').placeholder=t('문서 제목이나 내용을 입력하세요','Search titles and content');$('#search-clear').innerHTML=icon('close');$('#search-clear').setAttribute('aria-label',t('검색어 지우기','Clear search'));$('#search-footer').innerHTML=`<span><kbd>↑</kbd> <kbd>↓</kbd> ${t('이동','Navigate')}</span><span><kbd>Enter</kbd> ${t('열기','Open')}</span><span><kbd>Esc</kbd> ${t('닫기','Close')}</span><span>${t('공식 문서만 검색합니다','Public documentation only')}</span>`;
 $('#search-input').setAttribute('aria-label',t('공식 문서 검색어','Search public documentation'));
 if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setToc(visible[0].target.id)},{rootMargin:'-150px 0px -55% 0px',threshold:0});$$('.ak-markdown h2[id], #visual-guide').forEach(h=>observer.observe(h))}
}
function setToc(id){$$('[data-toc]').forEach(a=>{if(a.dataset.toc===id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
function scrollAfter(mode){
 requestAnimationFrame(()=>{
  if(mode==='settings'){window.scrollTo(0,scrollPositions.get(currentHash)||0);if(restoreControl){document.getElementById(restoreControl)?.focus({preventScroll:true});restoreControl=''}return}
  if(mode!=='push'&&scrollPositions.has(currentHash)){window.scrollTo(0,scrollPositions.get(currentHash));return}
  const target=section?document.getElementById(section):null;
  if(target){target.scrollIntoView({behavior:'instant',block:'start'});target.focus({preventScroll:true});setToc(section);target.classList.add('anchor-flash');setTimeout(()=>target.classList.remove('anchor-flash'),1400)}
  else{window.scrollTo(0,0);if(mode==='push')$('#page-title')?.focus({preventScroll:true})}
 });
}
function navigate(url){
 if(location.hash===url){if(section){document.getElementById(section)?.scrollIntoView({block:'start'})}else window.scrollTo(0,0);return}
 scrollPositions.set(currentHash,window.scrollY);pending='push';location.hash=url;
}
function setting(key,value,control){
 const y=window.scrollY;store(key,value);const url=href(route,section,{[key]:value});scrollPositions.set(url,y);pending='settings';restoreControl=control;location.hash=url;
}
function openDialog(id,trigger){opener=trigger||document.activeElement;const dlg=document.getElementById(id);dlg.showModal();if(id==='search-dialog'){updateSearch();$('#search-input').focus()}else if(id==='menu-dialog'){dlg.querySelector('[aria-current=page]')?.focus()}}
function closeDialog(dlg,returnFocus=true){dlg.close();if(returnFocus&&opener?.isConnected)opener.focus();opener=null}
function searchableText(html){
 const holder=document.createElement('div');holder.innerHTML=decorate(html);
 holder.querySelectorAll('button, .code-head, .heading-link, svg, [aria-hidden="true"]').forEach(el=>el.remove());
 const blocks=new Set(['P','DIV','SECTION','ASIDE','H1','H2','H3','H4','UL','OL','LI','TABLE','THEAD','TBODY','TR','TH','TD','PRE','BLOCKQUOTE','DETAILS','SUMMARY','BR']);
 function textOf(node){
  if(node.nodeType===Node.TEXT_NODE)return node.textContent;
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const text=Array.from(node.childNodes,textOf).join('');
  return blocks.has(node.tagName)?' '+text+' ':text;
 }
 return textOf(holder).replace(/\s+/g,' ').trim();
}
function updateSearch(){
 const q=$('#search-input').value.trim().toLocaleLowerCase();selected=0;
 if(!q)searchItems=visibleDocs().filter(d=>(channel==='canary'?['start','install','owners','config']:['start','install','planning','updates']).includes(d.id)).map(d=>({d,id:'',title:txt(d.title),excerpt:txt(d.lead)}));
 else{
  const terms=q.split(/\s+/);searchItems=[];
  visibleDocs().forEach(d=>{
   d.sections.forEach(s=>{const body=searchableText(txt(s.body)),hay=(txt(d.title)+' '+txt(s.title)+' '+body).toLocaleLowerCase();if(terms.every(term=>hay.includes(term))){const pos=body.toLocaleLowerCase().indexOf(terms[0]);const start=Math.max(0,pos-24);searchItems.push({d,id:s.id,title:txt(s.title),excerpt:(start?'…':'')+body.slice(start,start+130)+(body.length>start+130?'…':'')})}});
  });searchItems=searchItems.slice(0,30);
 }
 $('#search-clear').hidden=!q;$('#search-status').textContent=q?t(`${searchItems.length}개의 검색 결과`,`${searchItems.length} results`):t('자주 찾는 문서','Suggested documents');
 $('#search-results').innerHTML=searchItems.length?searchItems.map((r,i)=>`<button type="button" class="search-result" role="option" id="result-${i}" aria-selected="${i===0}" data-result="${i}" tabindex="-1">${icon('book')}<span class="od-field od-fill"><small>${esc(txt(groups[r.d.group]))}${r.id?' · '+esc(txt(r.d.title)):''}</small><strong>${esc(r.title)}</strong><span class="excerpt od-clamp-2">${esc(r.excerpt)}</span></span></button>`).join(''):`<div class="empty-search"><strong>${t('검색 결과가 없습니다','No results found')}</strong><p>${t('다른 단어로 검색하거나 검색어를 지워 문서를 둘러보세요.','Try another keyword or clear your search to browse the docs.')}</p><button type="button" class="btn" id="empty-clear">${t('검색어 지우기','Clear search')}</button></div>`;
 const input=$('#search-input');input.setAttribute('aria-expanded','true');if(searchItems.length)input.setAttribute('aria-activedescendant','result-0');else input.removeAttribute('aria-activedescendant');
}
function chooseResult(i){const r=searchItems[i];if(!r)return;closeDialog($('#search-dialog'),false);navigate(href('/docs/'+r.d.id,r.id))}
function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,2600)}
async function copyText(value,button){
 try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(value);const old=button.innerHTML;button.innerHTML=icon('check')+' '+t('복사됨','Copied');toast(t('복사했습니다. 필요한 곳에 붙여넣으세요.','Copied. Paste it where you need it.'));setTimeout(()=>{if(button.isConnected)button.innerHTML=old},2000)}
 catch{$('#manual-copy').value=value;openDialog('copy-dialog',button);$('#manual-copy').focus();$('#manual-copy').select()}
}
document.addEventListener('click',event=>{
 const target=event.target.closest('button,a');if(!target)return;
 if(target.matches('a[href^="#/"]')){if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();const open=$('dialog[open]');if(open)closeDialog(open,false);const mt=target.closest('.mobile-toc');if(mt)mt.open=false;navigate(target.getAttribute('href'));return}
 if(target.matches('[data-copy-code]')){copyText(target.closest('.codebox').querySelector('code').textContent,target);return}
 if(target.matches('.close-dialog')){closeDialog(target.closest('dialog'));return}
 if(target.matches('[data-result]')){chooseResult(Number(target.dataset.result));return}
 switch(target.id){
 case 'search-open':case 'missing-search':openDialog('search-dialog',target);break;
 case 'menu-open':openDialog('menu-dialog',target);break;
 case 'theme-toggle':setting('theme',theme==='dark'?'light':'dark','theme-toggle');break;
 case 'search-clear':case 'empty-clear':$('#search-input').value='';updateSearch();$('#search-input').focus();break;
 case 'review-open':{
  const state=$('#review-state').value;
  if(['search','results','empty'].includes(state)){$('#search-input').value=state==='results'?(channel==='canary'?t('소유자','owner'):t('업데이트','update')):state==='empty'?'zz-no-document-427':'';openDialog('search-dialog',target)}
  else navigate(href(state==='releases'?'/releases':state==='missing'?'/docs/page-not-found':state==='missing-release'?'/releases/not-available':'/docs/'+state));break;
 }
 }
});
document.addEventListener('change',event=>{if(event.target.id==='language')setting('lang',event.target.value,'language');if(event.target.id==='review-channel')setting('channel',event.target.value,'review-channel')});
$('#search-input').addEventListener('input',updateSearch);
$('#search-input').addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDialog($('#search-dialog'));return}
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!searchItems.length)return;selected=(selected+(event.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;$$('[data-result]').forEach((el,i)=>el.setAttribute('aria-selected',String(i===selected)));event.target.setAttribute('aria-activedescendant','result-'+selected);document.getElementById('result-'+selected)?.scrollIntoView({block:'nearest'})}
 if(event.key==='Enter'){event.preventDefault();chooseResult(selected)}
});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if($('#search-dialog').open){$('#search-input').focus();return}const other=$('dialog[open]');if(other)closeDialog(other);openDialog('search-dialog',$('#search-open'))}});
$$('dialog').forEach(dlg=>{
 dlg.addEventListener('cancel',e=>{e.preventDefault();closeDialog(dlg)});
 dlg.addEventListener('click',e=>{if(e.target===dlg){const r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(dlg)}});
 dlg.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const els=Array.from(dlg.querySelectorAll('button:not([disabled]),input,select,textarea,a[href],[tabindex="0"]')).filter(el=>!el.hidden&&el.getClientRects().length&&el.tabIndex>=0);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
});
$('#skip-link').addEventListener('click',e=>{e.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'})});
window.addEventListener('scroll',()=>{scrollPositions.set(currentHash,window.scrollY)},{passive:true});
window.addEventListener('hashchange',()=>{const mode=pending;pending='';render();scrollAfter(mode)});
render();scrollAfter('initial');
})();
