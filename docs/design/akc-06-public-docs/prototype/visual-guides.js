/* In-memory teaching examples. No filesystem, network, permissions or storage APIs. */
(() => {
  'use strict';
  const states = new Map();
  const names = {
    owners: ['폴더를 따라 소유자 찾기', 'Find the owner in the folder tree'],
    config: ['설정과 새 문서의 위치', 'Settings and new-document placement'],
    'user-config': ['내 이름은 언제 쓰일까요?', 'When is my name used?'],
    organize: ['정리 전과 후, 직접 비교하기', 'Try document maintenance'],
    handoff: ['CLI로 인계할 때 바뀌는 것', 'What changes in a CLI handoff'],
    'local-links': ['옛 주소와 내 폴더 연결하기', 'Connect an old path to this PC'],
    connections: ['연결만 바꾸거나 해제하기', 'Change or remove only the connection'],
    updates: ['앱과 스킬, 무엇이 바뀔까요?', 'App or skill: what changes?'],
    backup: ['스킬 백업을 골라 복원하기', 'Choose and restore a skill backup'],
    'folder-access': ['폴더를 다시 여는 과정', 'Reopen a connected folder'],
  };
  // Introduce the feature, prerequisites and effects before asking readers to try it.
  const afterSection = {
    owners: 'meaning',
    config: 'example',
    'user-config': 'precedence',
    organize: 'apply',
    handoff: 'request',
    'local-links': 'connect',
    connections: 'remove',
    updates: 'backup',
    backup: 'restore',
    'folder-access': 'permission',
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons = {
    folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
    file: '<path d="M14 3H5v18h14V8Z M14 3v5h5 M8 12h8 M8 16h6"/>',
    pc: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    link: '<path d="m10 8 3-3a4 4 0 0 1 6 6l-3 3M14 16l-3 3a4 4 0 0 1-6-6l3-3m1 6 6-6"/>',
    shield: '<path d="m12 3 8 3v5c0 5-5 9-8 10-3-1-8-5-8-10V6Z M8 12l3 3 5-6"/>',
    reset: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
    alert: '<path d="m12 3 10 18H2Z M12 9v5m0 3v.1"/>',
  };
  const icon = name => `<svg class="od-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
  const code = text => `<code>${escape(text)}</code>`;
  const badge = text => `<span class="vg-badge">${escape(text)}</span>`;
  const button = (action, text, primary = false, extra = '') => `<button type="button" class="btn${primary ? ' primary' : ''}" data-guide-action="${action}" ${extra}>${text}</button>`;
  const panel = (label, body, kind = 'file') => `<div class="vg-panel"><div class="vg-panel-label">${icon(kind)}<span>${label}</span></div>${body}</div>`;
  const pre = text => `<pre class="vg-code">${escape(text)}</pre>`;
  const note = (text, kind = 'check') => `<p class="vg-note">${icon(kind)}<span>${text}</span></p>`;
  const arrow = `<div class="vg-arrow" aria-hidden="true">${icon('arrow')}</div>`;
  const pair = (left, right) => `<div class="vg-pair">${left}${arrow}${right}</div>`;
  const result = html => `<div class="vg-result" tabindex="-1">${html}</div>`;
  function tabs(options, value) {
    return `<div class="vg-options">${options.map(([key, label]) => button(`mode:${key}`, escape(label), false, `aria-pressed="${key === value}"`)).join('')}</div>`;
  }
  function steps(labels, current) {
    return `<ol class="vg-steps">${labels.map((label, i) => `<li${i === current ? ' aria-current="step"' : ''} class="${i < current ? 'is-done' : ''}"><span class="vg-step-number">${i < current ? icon('check') : i + 1}</span><span>${label}</span></li>`).join('')}</ol>`;
  }
  function tree(rows) {
    return `<ul class="vg-tree">${rows.map(([depth, label, selected, file]) => `<li style="--tree-depth:${depth}"${selected ? ' class="is-selected"' : ''}>${icon(file ? 'file' : 'folder')}<span>${escape(label)}</span>${selected ? icon('check') : ''}</li>`).join('')}</ul>`;
  }
  const defaults = id => ({step:0, mode:id === 'updates' ? 'app' : id === 'folder-access' ? 'permission' : id === 'owners' ? 'nested' : 'default', choice:'repo', method:'found', changed:false});
  function ownership(s, t) {
    const nested = s.mode === 'nested', basic = s.mode === 'basic';
    const rows = [[0, 'reading-journal'], [1, 'docs'], ...(!basic ? [[2, '@alice', !nested]] : []), ...(nested ? [[3, '@bob', true]] : []), [basic ? 2 : nested ? 4 : 3, '01_reading_plan.md', false, true]];
    const owner = basic ? t('미지정', 'Unassigned') : nested ? '@bob' : '@alice';
    return tabs([['basic',t('일반 폴더','Plain folders')],['owned',t('사용자 폴더','Owner folder')],['nested',t('중첩 사용자 폴더','Nested owners')]],s.mode)
      + pair(panel(t('문서의 위치','Document location'),tree(rows),'folder'),panel(t('칸반에 표시되는 소유자','Owner shown on the board'),`<div class="vg-owner">${badge(owner)}</div><p>${t('문서에서 가장 가까운 @폴더','The closest @ folder above the document')}</p><div class="vg-property"><span>${t('본문에 기록된 Owner','Recorded Owner')}</span>${code(basic ? t('없음','None') : '@alice')}</div>`))
      + note(basic ? t('@폴더가 없어도 문서를 작성하고 읽을 수 있어요.','You can create and read documents without an @ folder.') : nested ? t('이 문서는 @bob 소유예요. 기록된 @alice는 문서 정리에서 교정할 수 있어요.','This document belongs to @bob. Maintenance can correct the recorded @alice.') : t('폴더의 @alice가 문서 소유자로 표시돼요.','The folder’s @alice is shown as the document owner.'));
  }
  function configuration(s,t) {
    const owned = ['owned','custom'].includes(s.mode), hasUser = s.mode !== 'default', root = s.mode === 'custom' ? 'notes/planning' : 'docs';
    const config = s.mode === 'custom' ? '[documents]\nroot = notes/planning\nownerFolders = true' : owned ? '[documents]\nownerFolders = true' : t('파일 없음 · 기본값 사용','No file · use defaults');
    return tabs([['default',t('무설정','No settings')],['user',t('내 이름만 설정','Name only')],['owned',t('소유자 폴더 켜기','Owner folders on')],['custom',t('문서 폴더 변경','Custom folder')]],s.mode)
      + `<div class="vg-two"><div>${panel('.ak.config',pre(config))}${panel('.ak.user',pre(hasUser ? '[user]\nid = @alice' : t('파일 없음','No file')))}</div>${panel(t('새로 작성할 문서','New document'),tree([[0,'reading-journal'],[1,root],...(owned ? [[2,'@alice',true]] : []),[owned?3:2,'01_reading_plan.md',false,true]])+`<div class="vg-property"><span>Owner</span>${code(owned?'@alice':t('기록하지 않음','Omitted'))}</div>`,'folder')}</div>`
      + note(s.mode === 'user' ? t('.ak.user만 설정해도 사용자 폴더가 생기지는 않아요.','Setting .ak.user alone does not enable owner folders.') : owned ? t('ownerFolders가 켜져 있어 새 문서를 내 이름의 폴더에 작성해요.','With ownerFolders enabled, new documents go in your owner folder.') : t('설정이 없으면 docs에서 기본 사용을 이어가요.','With no settings, basic use continues in docs.'));
  }
  const sampleId = '8b8e2a91-0f43-4bc0-9c51-54618dbb4401';
  function maintenance(s,t) {
    const before = ['# Reading plan','Owner: @previous','','## Progress Board','| Ticket | Status |','| R-01 | TODO |','','## Ticket List','### R-01. Read a chapter','Status: READY','Progress: 25%'];
    const after = ['# Reading plan',`Document-ID: ${sampleId}`,'Owner: @alice','','## Ticket List','### R-01. Read a chapter','Status: READY','Progress: 25%'];
    const diff=()=>{
      let left=0,right=0;
      const rows=[[before[0],after[0]],[null,after[1]],[before[1],after[2]],[before[2],after[3]],...before.slice(3,7).map(v=>[v,null]),...before.slice(7).map((v,i)=>[v,after[i+4]])];
      return `<div class="vg-aligned-diff"><div class="vg-diff-head"><span>${t('변경 전','Before')}</span><span>${t('변경 후','After')}</span></div>${rows.map(([a,b])=>`<div class="vg-diff-row">${[a,b].map((v,i)=>{const change=a!==b&&v!==null,n=v===null?'':i===0?++left:++right;return `<div class="vg-diff-cell${v===null?' vg-diff-empty':''}${change?i===0?' vg-minus':' vg-plus':''}"><span class="vg-line-number">${n}</span><span class="vg-line-sign">${change?i===0?'−':'+':' '}</span><code>${v===null?'':escape(v)||'&nbsp;'}</code></div>`}).join('')}</div>`).join('')}</div>`;
    };
    let body;
    if(s.step===0) body=panel('docs/@alice/01_reading_plan.md',pre(before.join('\n')))+note(t('폴더는 @alice, 본문에는 이전 소유자가 기록되어 있어요.','The folder belongs to @alice; the header still records a previous owner.'),'file')+button('next',t('정리 미리보기','Preview maintenance'),true);
    else if(s.step===1) body=diff()+note(t('ID 발급·Owner 교정·예전 보드 삭제를 제안해요. 티켓 본문은 그대로예요.','The preview adds an ID, corrects Owner and removes the old board. Ticket bodies stay the same.'))+`<div class="vg-actions">${button('back',t('취소','Cancel'))}${button('next',t('예시에 적용','Apply to example'),true)}</div>`;
    else body=panel('docs/@alice/01_reading_plan.md',pre(after.join('\n')))+note(t('선택한 문서의 변경만 적용됐어요. 같은 폴더의 다른 문서는 그대로예요.','Only the selected document was updated. Other files in the folder are unchanged.'));
    return steps([t('원문','Original'),t('미리보기','Preview'),t('적용 결과','Result')],s.step)+body;
  }
  function handoff(s,t) {
    const row = (label,before,after) => `<div class="vg-change"><span>${label}</span><div>${code(before)}<span aria-hidden="true">→</span>${code(after)}</div></div>`;
    return steps([t('대상 선택','Choose source'),t('CLI 변경 검토','Review CLI plan'),t('확인 후 적용','Apply confirmed plan')],s.step)
      + pair(panel(t('인계 전','Before'),tree([[0,'docs'],[1,'@alice',s.step<2],[2,'01_reading_plan.md',false,true],[1,'@bob']]),'folder'),panel(t('인계 후','After'),s.step<2 ? `<div class="vg-destination">${icon('folder')}${code('docs/@bob/')}<small>${t('확인한 뒤 이동','Move after confirmation')}</small></div>` : tree([[0,'docs'],[1,'@alice'],[1,'@bob',true],[2,'01_reading_plan.md',false,true]]),'folder'))
      + (s.step>0 ? `<div class="vg-change-list">${row('Owner','@alice','@bob')}${row(t('docs/overview.md의 참조','Reference in docs/overview.md'),'@alice/01_reading_plan.md','@bob/01_reading_plan.md')}<div class="vg-property"><span>${t('유지되는 정보','Preserved')}</span>${badge(t('번호 01 · 같은 Document-ID','Number 01 · same Document-ID'))}</div></div>`:'')
      + note(t('이 예시는 CLI로 이동과 링크 보정을 함께 처리하는 방법이에요. 직접 옮겼다면 문서 정리로 Owner를 맞출 수도 있어요.','This example uses the CLI to move the file and repair links together. After a manual move, document maintenance can align Owner instead.'), 'file')
      + (s.step<2?button('next',s.step===0?t('변경 계획 살펴보기','Review the change plan'):t('확인 후 결과 보기','View the confirmed result'),true):note(t('업무 문서를 인수해도 티켓 구현이 자동으로 시작되지는 않아요.','Taking over a document does not start implementing its tickets.')));
  }
  const oldRoot = '/Users/alice/work/reading-journal';
  function mappedPath(prefix,tail) {return `<div class="vg-path"><span class="vg-path-prefix">${escape(prefix)}</span><span class="vg-path-tail">/${escape(tail)}</span></div>`;}
  function linkFlow(s,t) {
    const narrow=s.choice==='docs', origin=oldRoot+(narrow?'/docs':''), destination=narrow?'journal-clone/docs':'journal-clone', tail=(narrow?'':'docs/')+(s.step===4?'decisions.md':'guide.md');
    const mapping=pair(panel(t('문서에 적힌 주소','Path in the source document'),mappedPath(origin,tail),'file'),panel(t('이 PC에서 열 파일','File opened on this PC'),mappedPath(destination,tail),'pc'));
    let body='';
    if(s.step===0)body=panel(t('열리지 않는 문서 링크','A document link that does not open'),mappedPath(oldRoot,'docs/guide.md'),'link')+note(t('옛 주소만으로 repo를 확정할 수 없어서 처음에는 연결할 폴더를 골라요.','An old path alone cannot identify the repo. Choose the folder on the first connection.'),'alert')+button('next',t('연결 과정 시작','Try connecting a folder'),true);
    if(s.step===1)body=`<div class="vg-mini-toolbar"><strong>${t('이 컴퓨터의 폴더','Folders on this computer')}</strong>${button('manual',t('폴더 직접 선택 예시','Try manual folder selection'))}</div><p class="vg-helper">${s.method==='manual'?t('repo 폴더와 그 안의 docs 중 어디까지 연결할지 비교해 보세요.','Compare selecting the repo folder with selecting only its docs folder.'):t('허용된 workspace에서 찾은 repo예요. 파일이 있는 폴더를 직접 고를 수도 있어요.','A repo discovered under the granted workspace. You can also select a folder directly.')}</p><div class="vg-choice-list">${button('choose:repo',`${icon('folder')}<span><strong>journal-clone</strong><small>${t('repo 전체 · 내부 파일 docs/guide.md 확인','Whole repo · docs/guide.md exists')}</small></span>`,false)}${s.method==='manual'?button('choose:docs',`${icon('folder')}<span><strong>journal-clone/docs</strong><small>${t('docs만 연결 · 내부 파일 guide.md 확인','Only docs · guide.md exists')}</small></span>`):''}</div>`;
    if(s.step===2)body=mapping+`<div class="vg-mapping-summary"><span>${t('저장할 폴더 연결','Folder connection to save')}</span>${code(origin)}<span aria-hidden="true">↓</span>${code(destination)}</div>`+note(t('강조한 앞 경로만 연결해요. 뒤쪽 파일 경로는 그대로 이어 붙여요.','Map the highlighted prefix. The remaining file path stays the same.'),'link')+`<div class="vg-actions">${button('back',t('다시 선택','Choose again'))}${button('next',t('연결하고 열기 예시','Connect and open example'),true)}</div>`;
    if(s.step>=3)body=mapping+`<div class="vg-reader"><div class="vg-reader-toolbar">${icon('file')}<span>${t('연결된 문서 페이지','Connected document page')}</span>${badge(t('읽기 전용','Read-only'))}</div><div class="vg-reader-body"><strong>${s.step===4?t('결정 기록','Decisions'):t('작업 가이드','Project guide')}</strong><div class="vg-reading-lines" aria-hidden="true"><i></i><i></i><i></i></div></div></div>`+note(s.step===4?t('같은 앞 경로의 다른 문서도 저장한 연결로 열렸어요. 폴더를 다시 고르지 않아요.','Another document with the same prefix uses the saved connection. No second folder selection.'):t('새 모달이 아닌 문서 페이지로 열려요. 출발 프로젝트의 목록은 유지돼요.','The document opens as a page, retaining the source project’s document list.'),'link')+(s.step===3?button('next',t('같은 폴더의 다른 문서 열기','Open another document in the same folder'),true):'');
    return steps([t('옛 링크','Old link'),t('폴더 선택','Choose folder'),t('연결 확인','Confirm mapping'),t('열기·재사용','Open & reuse')],Math.min(s.step,3))+body+`<p class="vg-footnote">${t('원본 Markdown은 그대로예요. 저장한 연결은 이 브라우저의 출발 프로젝트에서 재사용해요.','The original Markdown stays unchanged. The saved mapping is reused within the source project in this browser.')}</p>`;
  }
  function connections(s,t) {
    const disconnected=s.step===2&&s.mode==='remove', changed=s.step===2&&s.mode==='change';
    const dest=changed?'journal-new':'journal-clone';
    return `<div class="vg-mini-toolbar">${icon('link')}<strong>${t('로컬 폴더 → 링크 연결','Local folders → Link connections')}</strong></div>`
      + pair(panel(t('원래 폴더','Original folder'),pre(oldRoot),'file'),panel(t('이 PC의 연결','Connection on this PC'),disconnected?`<p class="vg-empty">${t('연결 없음','No connection')}</p>`:pre(dest),'folder'))
      + (s.step===0?`<div class="vg-actions">${button('change',t('연결 대상 변경 예시','Try changing the destination'),true)}${button('remove',t('연결 해제 예시','Try disconnecting'))}</div>`:s.step===1?`<div class="vg-confirm"><strong>${s.mode==='change'?t('journal-new로 바꿀까요?','Change the destination to journal-new?'):t('이 폴더 연결을 해제할까요?','Remove this folder connection?')}</strong><p>${s.mode==='change'?t('새 폴더에서 docs/guide.md를 확인한 뒤 연결을 저장해요.','Save the mapping after verifying docs/guide.md in the new folder.'):t('원본 폴더와 파일은 삭제되지 않아요.','The original folder and files are not deleted.')}</p><div class="vg-actions">${button('cancel',t('취소','Cancel'))}${button('next',t('예시에서 확인','Confirm in example'),true)}</div></div>`:note(disconnected?t('다음에 링크를 열면 다시 연결할 폴더를 골라야 해요.','Opening the link next time requires choosing a folder again.'):t('이제 이 연결의 링크는 확인한 새 폴더에서 열려요.','Links using this mapping now open in the verified new folder.')))
      + `<div class="vg-preserved">${icon('file')}<span>${t('원본 링크와 문서','Original link and document')}</span>${badge(t('변경 없음','Unchanged'))}</div>`;
  }
  function updates(s,t) {
    const skill=s.mode==='skill';
    const target=skill?'implementation-ledger':t('브라우저 앱','Browser app');
    const targetPanel=panel(target,skill?tree([[0,'implementation-ledger'],[1,'SKILL.md',false,true],[1,'references'],[2,'ledger-format.md',false,true]]):`<div class="vg-app-preview"><div>${icon('folder')}<strong>Alpha Kanban</strong></div><div class="vg-app-columns" aria-hidden="true"><i></i><i></i><i></i></div></div>`,skill?'folder':'pc');
    let content;
    if(s.step===0)content=pair(panel(t('업데이트할 대상','Target of the update'),`<div class="vg-target">${icon(skill?'folder':'pc')}<strong>${target}</strong><p>${skill?t('AI가 참고하는 스킬 파일','Skill files your AI reads'):t('지금 열어 둔 웹 화면','The web app you are viewing')}</p></div>`,skill?'folder':'pc'),targetPanel)+note(skill?t('등록된 스킬의 업데이트 예시예요. 그 스킬을 사용하는 작업을 마친 뒤 진행하세요.','This example uses a registered skill. Finish work using the skill before updating.') : t('업데이트 내역을 읽는 것만으로 적용되지는 않아요.','Reading update notes does not apply an update.'),'file')+button('next',t('변경 내용 보기 예시','Try reviewing changes'),true);
    else if(s.step===1)content=skill?`<div class="vg-two">${panel(t('현재 설치본','Current installation'),tree([[0,'implementation-ledger'],[1,'SKILL.md',false,true],[1,'references'],[2,'ledger-format.md',false,true]]))}${panel(t('앱에서 제공하는 스킬','Skill supplied by the app'),`<div class="vg-file-changes"><p>${badge(t('수정','Changed'))}${code('SKILL.md')}</p><p>${badge(t('수정','Changed'))}${code('references/ledger-format.md')}</p></div>`)}</div>`+note(t('개인 수정 등으로 일반 업데이트가 막히면 자동 덮어쓰지 않아요. 내용을 비교하고 보존 방법을 확인하세요.','Custom edits can block normal updates. Compare and preserve them before choosing a replacement.'),'shield')+`<div class="vg-actions">${button('back',t('취소','Cancel'))}${button('next',t('백업 후 업데이트 예시','Try backing up and updating'),true)}</div>`:panel(t('준비된 앱 업데이트','Prepared app update'),`<div class="vg-release"><span class="vg-badge">${t('변경 내역 예시','Example release notes')}</span><strong>${t('문서 탐색 개선','Document navigation improvements')}</strong><p>${t('무엇이 달라지고 어떻게 사용하는지 읽은 뒤 적용해요.','Read what changed and how to use it before applying.')}</p></div>`,'pc')+note(t('앱만 업데이트하면 설치된 스킬은 그대로 남아요.','An app-only update leaves the installed skill unchanged.'))+`<div class="vg-actions">${button('back',t('나중에','Later'))}${button('next',t('앱만 업데이트 예시','Try an app-only update'),true)}</div>`;
    else content=`<div class="vg-outcome">${icon('check')}<strong>${skill?t('스킬 파일 교체·검증','Skill files replaced and verified'):t('새 앱으로 시작','New app loaded')}</strong></div>`+pair(panel(skill?t('이 브라우저의 백업','Backup in this browser'):t('설치된 스킬','Installed skill'),skill?pre('implementation-ledger\n  '+t('교체 전 파일 보관','Previous files retained')):pre('implementation-ledger\n  '+t('변경 없음','Unchanged')),'shield'),panel(t('프로젝트 문서','Project documents'),tree([[0,'reading-journal'],[1,'docs'],[2,'01_reading_plan.md',false,true]])+badge(t('변경 없음','Unchanged')),'folder'))+note(skill?t('스킬 업데이트는 프로젝트의 문서 정리나 티켓 실행을 시작하지 않아요.','Updating a skill does not run document maintenance or implement tickets.'):t('앱과 스킬을 함께 업데이트할 때는 스킬의 변경 내용도 별도로 확인해요.','For a combined update, review the skill changes too.'));
    return tabs([['app',t('앱 업데이트','App update')],['skill',t('스킬 업데이트','Skill update')]],s.mode)+`<p class="vg-helper">${skill?t('시작 위치: 앱 상단의 스킬 업데이트','Start from: Skill updates in the app header'):t('시작 위치: 앱의 업데이트 알림','Start from: the app update notice')}</p>`+steps([t('대상 확인','Choose target'),t('변경 검토','Review changes'),t('결과 확인','Check result')],s.step)+content;
  }
  function backup(s,t) {
    let body;
    if(s.step===0)body=panel(t('스킬 업데이트 → 스킬 백업','Skill updates → Skill backups'),`<div class="vg-backup-row">${icon('shield')}<div><strong>${t('업데이트 직전 설치본 · 예시 백업','Pre-update installation · example backup')}</strong><small>implementation-ledger</small></div>${button('next',t('백업 복원 예시','Try restoring the backup'),true)}</div>`,'folder')+note(t('스킬 백업에는 SKILL.md와 그 스킬의 파일이 들어 있어요. 프로젝트 문서는 별도로 보존하세요.','Skill backups contain SKILL.md and the skill’s files. Preserve project documents separately.'),'file');
    else if(s.step===1)body=pair(panel(t('현재 설치 폴더','Current installation'),pre('implementation-ledger\n  SKILL.md\n  references/')) ,panel(t('복원할 내용','Files to restore'),pre(t('선택한 백업의\n교체 전 스킬 파일','Previous skill files\nfrom the selected backup')),'shield'))+`<label class="vg-checkbox"><input type="checkbox" data-guide-field="changed"${s.changed?' checked':''}>${t('앱 밖에서 스킬 파일을 수정한 경우 보기','Try a case with external file changes')}</label>`+(s.changed?`<p class="vg-warning" role="status">${icon('alert')}<span>${t('현재 파일이 백업 당시의 상태와 달라 복원을 멈춥니다. 외부 변경부터 확인하세요.','Restoration stops because the current files changed outside the app. Review those changes first.')}</span></p>`:note(t('대상과 백업을 확인했을 때만 복원을 실행해요.','Restore only after checking the destination and selected backup.')))+`<div class="vg-actions">${button('back',t('취소','Cancel'))}${button('next',t('복원 확인 예시','Confirm example restore'),true,s.changed?'disabled':'')}</div>`;
    else body=`<div class="vg-outcome">${icon('check')}<strong>${t('기존 스킬 파일 복원','Original skill files restored')}</strong></div>`+pair(panel('implementation-ledger',tree([[0,'implementation-ledger'],[1,'SKILL.md',true,true],[1,'references']]),'folder'),panel(t('이 브라우저의 백업','Backup in this browser'),`<div class="vg-target">${icon('shield')}${badge(t('복원 후에도 보관','Retained after restoration'))}</div>`,'shield'))+note(t('브라우저 데이터를 지우기 전에는 백업 내보내기로 별도 사본을 보관하세요.','Export a separate copy before clearing browser data.'));
    return steps([t('백업 선택','Choose backup'),t('대상·변경 확인','Check destination'),t('명시적 복원','Explicit restore')],s.step)+body;
  }
  function access(s,t) {
    const missing=s.mode==='missing';
    let body;
    if(s.step===0)body=panel(t('프로젝트 열기','Open project'),`<div class="vg-backup-row">${icon('folder')}<div><strong>reading-journal</strong><small>${missing?t('원본 파일 확인 필요','Check the original files'):t('다시 연결 필요','Reconnect needed')}</small></div>${badge(missing?t('파일 없음','File missing'):t('접근 필요','Access needed'))}</div>`,'folder')+note(missing?t('폴더가 이동했거나 원본 파일이 사라졌는지 먼저 확인해요.','First check whether the folder moved or the original file is missing.'):t('폴더 연결 정보가 남아 있어도 읽기·쓰기 권한을 다시 허용해야 할 수 있어요.','The saved connection can remain while read/write access needs permission again.'),'alert')+button('next',missing?t('확인할 위치 보기','See what to check'):t('폴더 다시 연결 예시','Try reconnecting the folder'),true);
    else if(missing)body=pair(panel(t('원래 폴더 확인','Check the original folder'),tree([[0,'reading-journal'],[1,'docs']]),'folder'),panel(t('보존한 원본 찾기','Find the preserved original'),`<p>${t('이동한 폴더 또는 별도로 보관한 문서 백업을 확인하세요.','Check the moved folder or your separate document backup.')}</p>`,'shield'))+note(t('접근 허용만으로 사라진 파일을 만들거나 같은 이름의 다른 파일을 대신 열지 않아요.','Granting access does not recreate missing files or substitute another file with the same name.'),'alert');
    else if(s.step===1)body=`<div class="vg-permission"><span>${icon('pc')}</span><strong>${t('폴더 접근 허용 · 예시','Folder permission · example')}</strong><p>${t('reading-journal 폴더의 파일을 읽고 수정하도록 허용할까요?','Allow reading and editing files in reading-journal?')}</p><div class="vg-actions">${button('back',t('허용 안 함 예시','Deny in example'))}${button('next',t('허용 예시','Allow in example'),true)}</div></div>`+note(t('허용은 접근 권한만 부여해요. 문서를 변경하는 작업은 따로 확인해요.','Permission grants access. A document change still needs its own confirmation.'),'shield');
    else body=panel(t('다시 열린 프로젝트','Reopened project'),tree([[0,'reading-journal'],[1,'docs'],[2,'01_reading_plan.md',false,true],[2,'01_reading_tickets.md',false,true]]),'folder')+note(t('저장한 폴더 연결을 이어 사용해요. 권한 허용 과정에서 문서 내용은 바뀌지 않아요.','The saved folder connection is reused. Granting access does not change document contents.'));
    return tabs([['permission',t('접근 권한 만료','Access expired')],['missing',t('원본 파일 없음','Original file missing')]],s.mode)+steps(missing?[t('문제 확인','Check problem'),t('원본 확인','Find original')]:[t('접근 필요','Access needed'),t('권한 허용','Grant access'),t('문서 열기','Open documents')],s.step)+body;
  }
  const views={owners:ownership, config:configuration, 'user-config':configuration, organize:maintenance, handoff, 'local-links':linkFlow, connections, updates, backup, 'folder-access':access};
  function paint(root, focusAction) {
    const id=root.dataset.guide, lang=root.dataset.lang;
    const t=(ko,en)=>lang==='en'?en:ko;
    if(!states.has(id))states.set(id,defaults(id));
    const s=states.get(id);
    root.innerHTML=`<div class="vg-heading"><div><span class="vg-eyebrow">${icon('pc')}${t('직접 눌러보는 사용 예시','Interactive example')}</span><h2 id="visual-guide" tabindex="-1">${names[id][lang==='en'?1:0]}</h2></div>${button('reset',icon('reset'),false,`aria-label="${t('예시 처음부터','Restart example')}" title="${t('예시 처음부터','Restart example')}"`)}</div><p class="vg-boundary">${t('예시 화면입니다. 실제 파일이나 설정은 변경하지 않습니다.','An example only. Your files and settings are not changed.')}</p>${result(views[id](s,t))}`;
    if(focusAction){
      const same=Array.from(root.querySelectorAll('[data-guide-action]')).find(el=>el.dataset.guideAction===focusAction&&!el.disabled);
      (same||root.querySelector('.vg-result')).focus({preventScroll:true});
    }
  }
  function render(id,lang) {return names[id]?`<section class="visual-guide" data-guide="${id}" data-lang="${lang}" aria-labelledby="visual-guide"></section>`:'';}
  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-guide-action]');
    const root=control?.closest('[data-guide]');if(!root)return;
    const id=root.dataset.guide,s=states.get(id),action=control.dataset.guideAction;
    if(action==='reset')states.set(id,defaults(id));
    else if(action.startsWith('mode:'))Object.assign(s,{...defaults(id),mode:action.slice(5)});
    else if(action.startsWith('choose:')){s.choice=action.slice(7);s.step=2;}
    else if(action==='manual')s.method='manual';
    else if(action==='change'||action==='remove'){s.mode=action;s.step=1;}
    else if(action==='cancel')s.step=0;
    else if(action==='back')s.step=Math.max(0,s.step-1);
    else if(action==='next'){
      if(id==='backup'&&s.step===1&&s.changed)return;
      const max=id==='local-links'?4:id==='folder-access'&&s.mode==='missing'?1:2;
      s.step=Math.min(max,s.step+1);
    }
    paint(root,action);
  });
  document.addEventListener('change',event=>{
    const input=event.target.closest('[data-guide-field]'),root=input?.closest('[data-guide]');if(!root)return;
    const s=states.get(root.dataset.guide);s.changed=input.checked;paint(root);
    root.querySelector('[data-guide-field]').focus({preventScroll:true});
  });
  window.AK_VISUAL_GUIDES={has:id=>Boolean(names[id]),afterSection:id=>afterSection[id],render,mount:()=>document.querySelectorAll('[data-guide]').forEach(root=>paint(root))};
})();
