'use strict';
const SOURCE='https://github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger';
const REPO='https://github.com/KOR-Believer/alpha-kanban';
let lang='ko',mode='install',boardView='board',mobileStatus='IN_PROGRESS',selected='READ-02',opener=null,promptKind='install';
const t=(ko,en)=>lang==='ko'?ko:en;
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Lucide icon nodes copied from the installed package. License: assets/Lucide-LICENSE.txt.
const icon=(kind='arrow')=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kind==='copy'?'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>':'<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'}</svg>`;
const ext=(url,label,cls='')=>`<a href="${url}" target="_blank" rel="noopener noreferrer" class="${cls}">${label} ${icon()}</a>`;
const prompts={
 install:()=>t(`$skill-installer로 아래 GitHub 경로의 implementation-ledger 스킬을 설치해 줘.\n\n${SOURCE}\n\nSKILL.md뿐 아니라 references, assets, scripts, agents를 포함한 폴더 전체를 설치해 줘.\n내 Codex 환경이 인식하는 개인 스킬 경로를 확인해서 사용해 줘.\n같은 이름의 스킬이 이미 있으면 먼저 비교해서 변경 내용을 알려줘.\n기존 설치본은 백업하고 개인 수정은 보존해. 덮어쓰기 전에는 내 확인을 받아.\n설치가 끝나면 설치 위치와 인식 여부를 알려줘. 프로젝트 문서나 코드는 변경하지 마.`,`Use $skill-installer to install implementation-ledger from this GitHub path:\n\n${SOURCE}\n\nInstall the entire folder, including references, assets, scripts, and agents, not only SKILL.md.\nFind and use the personal skill location recognized by my Codex environment.\nIf a skill with the same name is already installed, compare it and explain the changes first.\nBack up the existing installation and preserve my customizations. Ask before overwriting it.\nReport the installation location and whether Codex recognizes it. Do not change project documents or code.`),
 update:()=>t(`implementation-ledger의 현재 설치 위치와 출처를 확인하고, 아래 공식 원본과 비교해 업데이트해 줘.\n\n${SOURCE}\n\nSKILL.md뿐 아니라 references, assets, scripts, agents를 포함한 전체 폴더를 비교해 줘.\n차이와 주요 변경 내용, 개인 수정과 충돌하는 부분을 먼저 설명해 줘.\n기존 설치본 전체를 백업하고 개인 수정은 보존해. 덮어쓰기 전에는 내 확인을 받아.\n선택이 필요한 충돌은 물어봐 줘. 확인하지 않은 버전이나 릴리스 태그를 만들지 마.\n프로젝트 문서나 코드는 변경하지 마.\n완료 후 설치 위치, 적용한 출처, 주요 변경과 Codex 인식 여부를 알려줘.`,`Find the location and source of my installed implementation-ledger and compare it with this official source before updating:\n\n${SOURCE}\n\nCompare the entire folder, including SKILL.md, references, assets, scripts, and agents.\nExplain the changes and any conflicts with personal customizations first.\nBack up the entire existing installation and preserve my edits. Ask before overwriting.\nAsk me to resolve any conflicts requiring a choice. Do not invent versions or release tags.\nDo not change project documents or code.\nReport the installation location, applied source, main changes, and whether Codex recognizes it.`),

};
const statuses=['TODO','READY','IN_PROGRESS','BLOCKED','DEFERRED','DONE'];
const statusName=s=>({TODO:t('할 일','To do'),READY:t('준비','Ready'),IN_PROGRESS:t('진행 중','In progress'),BLOCKED:t('막힘','Blocked'),DEFERRED:t('보류','Deferred'),DONE:t('완료','Done')})[s];
// One fictional data model powers every board card and Markdown excerpt.
const tickets = [
  {
    id: 'READ-03', status: 'TODO', progress: 0,
    title: ['책 기록 수정·삭제하기', 'Edit and delete book records'],
    scope: ['책의 제목·저자·읽기 상태를 수정하고, 확인 후 삭제한다.', 'Edit title, author, and reading status; confirm before deleting a record.'],
    note: ['합의한 기능 · 구현 대기', 'Agreed feature · Awaiting implementation'],
    acceptance: [[false, ['수정 내용이 반영되고 삭제 전 확인을 받는다.', 'Changes are saved and deletion requires confirmation.']]],
    checks: [[false, ['수정 저장과 삭제 확인·취소를 검증한다.', 'Verify saving edits and confirming or canceling deletion.']]],
    decision: ['책 기록은 수정할 수 있게 하고, 삭제 전에는 확인해 줘.', 'Allow editing book records and ask before deleting them.'],
    result: ['플랜에서 범위를 합의했다. 구현과 검증은 대기 중이다.', 'Scope is agreed in the plan. Implementation and verification are pending.']
  },
  {
    id: 'READ-04', status: 'READY', progress: 25,
    title: ['책 목록 정렬 선택 추가', 'Add book sorting controls'],
    scope: ['제목순과 최근 기록순을 선택한다. 필터 조건은 유지한다.', 'Choose title or recently recorded order. Preserve active filters.'],
    note: ['범위 합의 · 제목순 / 최근 기록순', 'Scope agreed · Title / recently recorded'],
    acceptance: [[false, ['정렬을 바꿔도 검색·필터 조건이 유지된다.', 'Changing sort preserves search and filters.']]],
    checks: [[false, ['두 정렬 순서와 필터 조합을 확인한다.', 'Check both sort orders with filtering.']]],
    decision: ['기본은 최근 기록순으로 해 주세요.', 'Use recently recorded order by default.'],
    result: ['범위와 기본 정렬을 합의했다. 구현 전이며 완료 검증은 아직 수행하지 않았다.', 'Agreed on scope and default order. Implementation and completion checks have not started.']
  },
  {
    id: 'READ-02', status: 'IN_PROGRESS', progress: 75,
    title: ['읽은 책 필터와 제목 검색', 'Read-books filter and title search'],
    scope: ['두 조건을 함께 적용하고 빈 결과를 안내한다. 필터는 다음 방문에 남기지 않는다.', 'Combine both conditions and show an empty state. Do not persist the filter across visits.'],
    note: ['배치 수정 · 모바일 검증 대기', 'Layout revised · Mobile check pending'],
    acceptance: [
      [true, ['제목 검색과 읽은 책 필터가 함께 적용된다.', 'Title search and read-books filtering work together.']],
      [false, ['좁은 화면에서는 필터를 검색창 아래에 배치한다.', 'Place the filter below the search field on narrow screens.']]
    ],
    checks: [
      [true, ['조건 조합과 빈 결과 테스트를 수행했다.', 'Ran combined-filter and empty-result tests.']],
      [false, ['390px 화면의 제목·버튼 배치를 확인한다.', 'Check title and button layout at 390px.']]
    ],
    decision: ['플랜의 열린 질문을 논의해 필터는 이번 방문에만 유지하고 메모 검색은 제외하기로 했다. 플랜·티켓에 반영된 결정을 직접 검토한 뒤 구현을 요청했다. 결과를 보고 휴대폰에서는 필터를 검색창 아래로 내려 달라고 요청했다.', 'The plan’s questions were discussed: keep filters for this visit and exclude note search. The user reviewed these decisions in the updated plan and tickets before requesting implementation. On reviewing the result, they asked to move the filter below search on phones.'],
    result: ['합의한 범위로 필터·검색·빈 결과 안내를 구현했고 조건 조합과 빈 결과 테스트를 통과했다. 이후 피드백을 같은 티켓의 완료 기준에 반영했다. 모바일 배치를 수정했고 실제 기기 재확인이 남아 IN_PROGRESS 75%를 유지한다.', 'Implemented the agreed filter, search, and empty state; combined-filter and empty-result tests passed. Added the later feedback to this ticket’s acceptance criteria. Mobile layout was adjusted; device rechecking remains; keep IN_PROGRESS at 75%.']
  },
  {
    id: 'READ-01', status: 'DONE', progress: 100,
    title: ['책 기록의 기본 항목 정하기', 'Define book record fields'],
    scope: ['제목·저자·읽기 상태를 기록한다.', 'Record title, author, and reading status.'],
    note: ['검토 완료 · 필수 항목과 예시 대조', 'Reviewed · Fields matched to sample'],
    acceptance: [[true, ['책 기록의 필수 항목이 정해졌다.', 'Required book record fields are defined.']]],
    checks: [[true, ['예시 기록과 필수 항목을 대조했다.', 'Compared the sample record with required fields.']]],
    decision: ['제목·저자·읽기 상태부터 기록해요.', 'Start with title, author, and reading status.'],
    result: ['기본 항목을 정하고 예시 기록과 대조했다. 합의한 문서 검토를 마쳤다.', 'Defined the fields and compared them with the sample record. Completed the agreed document review.']
  }
];
const field = value => value[lang === 'ko' ? 0 : 1];
const checklist = items => items.map(([done, text]) => `- [${done ? 'x' : ' '}] ${field(text)}`).join('\n');
function markdown(ticket) {
  return [
    `### ${ticket.id}. ${field(ticket.title)}`, '',
    `Status: ${ticket.status}`, `Progress: ${ticket.progress}%`,
    ...(ticket.status === 'DONE' ? ['Completed at: 2026-10-18T10:00:00+09:00'] : []), '',
    '구현 범위:', '', `- ${field(ticket.scope)}`, '',
    '완료 기준:', '', checklist(ticket.acceptance), '',
    '검증:', '', checklist(ticket.checks), '',
    '사용자 지시:', '', `- 2026-10-18: ${field(ticket.decision)}`, '',
    '진행 메모:', '', `- 2026-10-18: ${field(ticket.result)}`
  ].join('\n');
}
// One bilingual data model supplies every visible step and work-request dialog.
const messages = [
  {
    "role": "human",
    "text": [
      "$implementation-ledger를 사용해 줘. 독서 기록 앱을 만들고 싶어. 아직 문서나 코드는 작성하지 말고, 기능과 방향부터 토론하자.",
      "Use $implementation-ledger. I want to build a reading journal app. Do not write documents or code yet; let’s discuss the features and direction first."
    ],
    "kind": "discuss"
  },
  {
    "role": "codex",
    "text": [
      "어떤 기록을 남기고, 어떻게 찾아보고 싶나요?",
      "What would you like to record, and how would you find it later?"
    ]
  },
  {
    "role": "human",
    "text": [
      "제목·저자·읽기 상태를 기록하고, 읽은 책 필터와 제목 검색이 있으면 좋겠어.",
      "Title, author, and reading status. I’d also like a read-books filter and title search."
    ]
  },
  {
    "role": "codex",
    "text": [
      "좋아요. 검색과 필터를 함께 쓰고, 기록 수정·삭제와 제목순·최근 기록순 정렬도 범위에 넣을까요? 기본은 최근 기록순으로요.",
      "Let’s combine search and filtering. Shall we also include editing, confirmed deletion, and title/recent sorting, with recent first?"
    ]
  },
  {
    "role": "human",
    "text": [
      "응, 그 방향으로 하자. 삭제 전에 확인해 주면 좋겠어.",
      "Yes, that direction works. Ask before deleting a record."
    ]
  },
  {
    "role": "human",
    "text": [
      "지금까지의 대화를 토대로 플랜과 티켓 초안을 작성해 줘. 아직 구현하지 마.",
      "Draft a plan and tickets based on our conversation so far. Do not implement yet."
    ],
    "kind": "draft"
  },
  {
    "role": "codex",
    "text": [
      "플랜과 티켓 초안을 정리했어요. 아직 구현하지 않았습니다. 두 문서를 읽고 범위와 남은 질문을 확인해 주세요.",
      "The plan and ticket drafts are ready. Nothing has been implemented. Please read both documents to review the scope and remaining questions."
    ],
    "attachments": true
  },
  {
    "role": "human",
    "text": [
      "플랜을 읽어봤어. 열린 질문이 두 개 남아 있네. 하나씩 설명해 줘. 답에 따라 무엇이 달라지는지 함께 논의하자.",
      "I’ve read the plan. There are two open questions. Explain them one at a time so we can discuss what changes with each answer."
    ],
    "kind": "clarify"
  },
  {
    "role": "codex",
    "text": [
      "필터를 다음 방문까지 저장하면 같은 조건으로 시작할 수 있어요. 이번 방문에만 유지하면 다시 열 때 전체 목록부터 보게 됩니다. 어느 쪽이 좋을까요?",
      "Saving the filter across visits restores the same view. Keeping it only for this visit means reopening the app shows all books. Which do you prefer?"
    ]
  },
  {
    "role": "human",
    "text": [
      "필터는 이번 방문에만 유지하자. 다시 열면 전체 목록으로.",
      "Keep the filter only for this visit. Show all books when I return."
    ]
  },
  {
    "role": "codex",
    "text": [
      "메모 검색까지 포함하면 검색 대상과 결과 기준이 늘어납니다. 이번에는 제목 검색에 집중할까요?",
      "Searching notes expands both the search scope and result criteria. Shall we focus on title search this time?"
    ]
  },
  {
    "role": "human",
    "text": [
      "응. 메모 검색은 이번 구현에서 빼자.",
      "Yes. Exclude note search from this implementation."
    ]
  },
  {
    "role": "human",
    "text": [
      "방금 결정한 내용을 플랜과 티켓에 반영해 줘. 내가 다시 읽고 확인할게.",
      "Reflect the decisions we just made in the plan and tickets. I’ll read them again and check."
    ],
    "kind": "update-docs"
  },
  {
    "role": "codex",
    "text": [
      "결정을 플랜과 티켓에 반영했어요. 필터는 이번 방문만 유지하고 메모 검색은 제외했습니다. 완료 기준도 갱신했고, 질문 섹션은 남겨 “없음”으로 정리했어요.",
      "I’ve reflected the decisions in the plan and tickets: filters last for this visit, and note search is excluded. Acceptance criteria are updated. The questions section remains and now says “None.”"
    ],
    "attachments": true
  },
  {
    "role": "human",
    "text": [
      "수정된 문서를 다시 읽었어. 결정한 범위와 제외 사항이 잘 반영됐네.",
      "I’ve reread the updated documents. The agreed scope and exclusions are reflected correctly."
    ]
  },
  {
    "role": "codex",
    "text": [
      "좋아요. 읽다가 질문이 남아 있으면 다시 토론하면 됩니다. 구현은 요청을 기다릴게요.",
      "Good. If reading brings up more questions, we can discuss them again. I’ll wait for your implementation request."
    ],
    "loop": true
  },
  {
    "role": "human",
    "text": [
      "플랜과 티켓을 확인했어. 검토한 티켓을 선행 관계에 맞춰 순서대로 구현해 줘.",
      "I’ve reviewed the plan and tickets. Implement the reviewed tickets in dependency order."
    ],
    "kind": "implement"
  },
  {
    "role": "codex",
    "text": [
      "기본 항목을 정리하고 검색·필터를 구현했습니다. 조건 조합과 빈 결과 테스트를 수행했어요. READ-02는 모바일 확인이 남아 진행 중 75%로 기록했습니다. 칸반에서 결과와 남은 검증을 읽어보세요.",
      "I defined the fields and implemented search and filtering, then ran combined-filter and empty-result tests. READ-02 is in progress at 75%, awaiting mobile checks. Review the results and remaining verification in Kanban."
    ]
  },
  {
    "role": "human",
    "text": [
      "실제 화면을 확인했어. 휴대폰에서 검색창이 너무 좁네. 휴대폰에서는 검색창 아래로 필터를 내려 줘.",
      "I checked the actual screen. Search is too narrow on my phone. Move the filter below the search field on phones."
    ],
    "kind": "feedback"
  },
  {
    "role": "codex",
    "text": [
      "피드백을 플랜과 티켓의 완료 기준에 반영하고 모바일 배치를 수정했어요. 실제 휴대폰에서 다시 확인하는 검증은 남겨 두었습니다. READ-02는 계속 진행 중이에요.",
      "I reflected the feedback in the plan and ticket acceptance criteria and adjusted the mobile layout. Rechecking it on a phone remains open. READ-02 stays in progress."
    ]
  },
  {
    "role": "human",
    "text": [
      "수정된 화면을 다시 확인할게. 더 필요한 게 있으면 토론하고 문서에도 반영하자.",
      "I’ll check the revised screen again. If anything else is needed, let’s discuss it and update the documents."
    ]
  }
];
const chapters = [
  {
    "id": "discuss",
    "at": 0,
    "label": [
      "아이데이션",
      "Ideate"
    ]
  },
  {
    "id": "draft",
    "at": 5,
    "label": [
      "초안",
      "Draft"
    ]
  },
  {
    "id": "read",
    "at": 7,
    "label": [
      "직접 읽기",
      "Read"
    ]
  },
  {
    "id": "questions",
    "at": 8,
    "label": [
      "질문·결정",
      "Decide"
    ]
  },
  {
    "id": "implement",
    "at": 16,
    "label": [
      "구현",
      "Implement"
    ]
  },
  {
    "id": "feedback",
    "at": 18,
    "label": [
      "결과·반복",
      "Iterate"
    ]
  }
];
for (const message of messages) if(message.kind) prompts[message.kind]=()=>field(message.text);

let messageIndex=0, playing=false, playbackTimer=null, demoView='chat', demoDoc='plan';
let scriptTime=0, speed=1, lastTick=0, timerGeneration=0, started=false, docSource=false;
let transcriptScroll=0, followOnChatReturn=false;
const messageTimes=messages.map((_,i)=>i*10000), totalTime=messageTimes.at(-1);
const timeLabel=ms=>Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0');
const playbackState=()=>scriptTime>=totalTime?t('재생 완료','Finished'):playing?t('재생 중','Playing'):started?t('일시정지','Paused'):t('재생 대기','Ready');
function documentAt(index) {
  if(index<6) return {stage:'none',questions:null};
  return {stage:index<13?'draft':index<17?'reviewed':index<19?'result':'feedback',questions:index<13};
}
function documentText(index) {
  const snapshot=documentAt(index);
  if(snapshot.stage==='none') return t('아직 문서를 만들지 않았습니다.\n지금은 아이디어를 함께 이야기하는 중입니다.','No documents yet.\nThis conversation is still exploring the idea.');
  if(demoDoc==='plan') return t('# 독서 기록 앱 · 플랜','# Reading journal · Plan')+'\n\n'+
    t('구현 범위','Scope')+'\n'+tickets.map(ticket=>'- '+field(ticket.title)).join('\n')+'\n\n'+
    (snapshot.questions?'':t('결정한 내용\n- 필터는 이번 방문에만 유지\n- 메모 검색은 이번 구현에서 제외\n\n','Recorded decisions\n- Filters last for this visit only\n- Note search is excluded this iteration\n\n'))+
    t('확인·결정이 필요한 사항 (열린 질문)','Questions requiring confirmation or a decision (open questions)')+'\n'+
    (snapshot.questions?t('- 필터 선택을 다음 방문에도 유지할까요?\n- 이번 작업에 독서 메모 검색도 포함할까요?','- Should filters persist across visits?\n- Should this iteration include searching reading notes?'):t('- 없음','- None'))+
    (snapshot.stage==='feedback'?t('\n\n결과 검토 후 반영\n- 휴대폰에서는 필터를 검색창 아래에 배치\n- 실제 휴대폰 재검증은 남아 있음','\n\nAfter result review\n- Place filters below search on phones\n- Phone verification remains open'):'');
  if(snapshot.stage==='feedback') return tickets.map(markdown).join('\n\n---\n\n');
  return tickets.map(ticket=>{
    const progressed=snapshot.stage==='result';
    const status=progressed?ticket.status:'TODO';
    const progress=progressed?ticket.progress:0;
    return '### '+ticket.id+'. '+field(ticket.title)+'\nStatus: '+status+'\nProgress: '+progress+'%\n\n'+t('구현 범위:\n','Scope:\n')+
      (ticket.id==='READ-02'?t('제목 검색과 읽은 책 필터를 함께 적용한다.','Combine title search and read-books filtering.'):field(ticket.scope))+
      (ticket.id==='READ-02'&&!snapshot.questions?t('\n결정: 필터는 이번 방문만 유지. 메모 검색 제외.','\nDecision: filters last for this visit. Exclude note search.'):'')+
      '\n\n'+(progressed?ticket.id==='READ-02'?t('검증:\n- [x] 조건 조합·빈 결과 테스트\n- [ ] 모바일 화면 확인','Verification:\n- [x] Combined-filter and empty-result tests\n- [ ] Mobile layout check'):field(ticket.result):t('구현 전 · 사람이 초안을 검토합니다.','Not implemented · Human draft review.'));
  }).join('\n\n---\n\n');
}
// Lucide geometry; no provider logo or connected-session indicators.
function playerIcon(name) {
  const nodes={play:'<path d="m6 3 14 9-14 9V3z"/>',pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',prev:'<path d="m15 18-6-6 6-6"/>',next:'<path d="m9 18 6-6-6-6"/>',restart:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'};
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+nodes[name]+'</svg>';
}
function control(id,name,label,disabled=false) {
  return '<button id="'+id+'" class="demo-control" title="'+label+'" aria-label="'+label+'"'+(disabled?' disabled':'')+'>'+playerIcon(name)+'</button>';
}
function messageBody(message) {
  return escapeHTML(field(message.text)).replace(/(\$implementation-ledger|READ-02|75%)/g,'<code>$1</code>').split('\n\n').map(text=>'<p>'+text+'</p>').join('');
}
function composerHTML() {
  const svg=nodes=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">'+nodes+'</svg>';
  return '<div class="demo-composer" role="textbox" aria-readonly="true" aria-label="'+t('읽기 전용 가상 입력 영역','Read-only simulated composer')+'"><div class="composer-placeholder">'+t('Codex와 함께 작업하세요','Work with Codex')+'</div><div class="composer-chrome" aria-hidden="true">'+svg('<path d="M12 5v14M5 12h14"/>')+'<span class="composer-model">Codex</span>'+svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>')+'<span class="composer-send">'+svg('<path d="M12 5v14m-6-8 6-6 6 6"/>')+'</span></div></div>';
}

function renderedDocument(source) {
  return source.split('\n').map(line=>{
    const text=escapeHTML(line);
    if(/^### /.test(line))return '<h3>'+text.slice(4)+'</h3>';
    if(/^# /.test(line))return '<h2>'+text.slice(2)+'</h2>';
    if(line==='---')return '<hr>';
    if(/^- \[[ x]\]/.test(line))return '<div class="doc-check">'+(line[3]==='x'?'☑':'☐')+' '+text.slice(6)+'</div>';
    if(/^- /.test(line))return '<div class="doc-bullet">• '+text.slice(2)+'</div>';
    if(!line)return '<div class="doc-space"></div>';
    return '<p>'+text+'</p>';
  }).join('');
}
function documentPaneHTML() {
  const created=messageIndex>=6;
  const file=doc=>'01_reading_'+doc+'.md';
  const fileButton=(doc)=>'<button data-demo-doc="'+doc+'" aria-pressed="'+(demoDoc===doc)+'">'+file(doc)+'</button>';
  return '<section class="demo-documents"><div class="document-tabs">'+(created?['plan','tickets'].map(fileButton).join(''):'<span>'+t('문서','Documents')+'</span>')+'</div><div class="document-toolbar"><span>'+t('독서 기록','Reading journal')+(created?' / docs / '+file(demoDoc):'')+'</span>'+(created?'<button id="demo-source" aria-pressed="'+docSource+'">'+(docSource?t('미리보기','Preview'):t('소스 보기','Source'))+'</button>':'')+'</div><div id="demo-document-text" tabindex="0" class="document-body">'+(docSource&&created?'<pre>'+escapeHTML(documentText(messageIndex))+'</pre>':renderedDocument(documentText(messageIndex)))+'</div></section><aside class="demo-tree"><div class="workspace-title">'+t('파일','Files')+'</div>'+(created?'<p>docs</p>'+['plan','tickets'].map(fileButton).join(''):'<p>'+t('아직 문서 없음','No documents yet')+'</p>')+'</aside>';
}

function workflowHTML() {
  return '<div class="demo-shell" data-od-id="conversation-player"><header class="demo-heading"><div><strong>'+t('독서 기록 앱 만들기','Building a reading journal')+'</strong><span>Codex · '+t('대화와 작업 기록','Conversation & work records')+'</span></div><span class="badge">'+t('가상 대화 예시','Fictional conversation')+'</span></header>'+
    '<nav class="demo-chapters" aria-label="'+t('대화 챕터','Conversation chapters')+'">'+chapters.map((c,i)=>'<button id="workflow-'+c.id+'" data-chapter="'+i+'" aria-current="'+(i===chapters.findLastIndex(c=>c.at<=messageIndex)?'step':'false')+'"><span>0'+(i+1)+'</span>'+field(c.label)+'</button>').join('')+'</nav>'+
    '<div class="demo-toolbar">'+control('demo-prev','prev',t('이전 메시지','Previous message'),messageIndex===0)+
    control('demo-play',playing?'pause':scriptTime>=totalTime?'restart':'play',playing?t('일시정지','Pause'):scriptTime>=totalTime?t('다시 재생','Replay'):t('재생','Play'))+
    control('demo-next','next',t('다음 메시지','Next message'),messageIndex===messages.length-1)+control('demo-restart','restart',t('처음부터 다시','Restart'))+
    '<strong id="demo-state" role="status">'+playbackState()+'</strong><label class="speed-label" for="demo-speed">'+t('배속','Speed')+'</label><select id="demo-speed">'+[.5,1,1.5,2,3].map(value=>'<option value="'+value+'" '+(speed===value?'selected':'')+'>'+value+'×</option>').join('')+'</select></div>'+
    '<div class="demo-timeline"><input id="demo-seek" type="range" min="0" max="'+totalTime+'" step="100" value="'+scriptTime+'" aria-label="'+t('대화 재생 위치','Conversation timeline')+'"><div><span id="demo-time">'+timeLabel(scriptTime)+' / '+timeLabel(totalTime)+'</span><span id="demo-position">'+(messageIndex+1)+' / '+messages.length+'</span></div></div>'+
    '<div class="demo-view-switch" aria-label="'+t('보기','View')+'"><button data-demo-view="chat" aria-pressed="'+(demoView==='chat')+'">'+t('대화','Chat')+'</button><button data-demo-view="document" aria-pressed="'+(demoView==='document')+'">'+t('문서','Documents')+'</button></div>'+
    '<div class="demo-body" data-mobile-view="'+demoView+'"><div class="demo-chat-canvas"><div class="workspace-title">'+t('독서 기록 프로젝트','Reading journal project')+'</div><div id="demo-transcript" class="demo-transcript" tabindex="0" role="region" aria-label="'+t('가상 대화 기록','Fictional transcript')+'">'+
    messages.slice(0,messageIndex+1).map((m,i)=>'<article class="demo-message '+m.role+'" data-message="'+i+'" aria-label="'+(m.role==='human'?t('사용자 메시지','User message'):t('Codex 응답','Codex response'))+'">'+
      ([6,13,17,19].includes(i)?'<div class="demo-activity">'+t(i===6?'문서 초안 작성':i===13?'결정 사항 반영':i===17?'구현 결과 정리':'피드백 반영',i===6?'Drafted documents':i===13?'Recorded decisions':i===17?'Recorded implementation results':'Applied feedback')+'</div>':'')+
      '<div class="message-prose">'+messageBody(m)+'</div>'+
      (m.kind?'<button class="message-copy" data-prompt="'+m.kind+'" aria-label="'+t('이 요청문 보기·복사','View and copy this request')+'">'+icon('copy')+'</button>':'')+
      (m.attachments?'<div class="demo-attachments"><div class="file-summary">'+t(i===6?'문서 초안 2개':'문서 2개에 결정 반영',i===6?'2 document drafts':'Decisions reflected in 2 documents')+'</div>'+['plan','tickets'].map(doc=>'<button data-demo-doc="'+doc+'"><span>docs/01_reading_'+doc+'.md</span><span class="file-change">'+t(i===6?'생성':'수정',i===6?'Created':'Updated')+'</span></button>').join('')+'</div>':'')+
      (m.loop?'<button class="demo-loop" data-jump="8">'+t('질문이 남으면 다시 토론','Return to questions')+'</button>':'')+'</article>').join('')+
    (messageIndex===messages.length-1?'<div class="demo-ending"><p>'+t('결과 확인 → 다시 토론 → 문서 반영 → 구현·검증','Review results → discuss → update documents → implement & verify')+'</p><button data-jump="0">'+t('다시 보기','Replay')+'</button><button data-jump="8">'+t('질문 토론으로','Revisit questions')+'</button></div>':'')+'</div>'+composerHTML()+'</div>'+
    documentPaneHTML()+'</div>'+
    '<footer class="demo-footnote">'+t('스크립트 대화입니다. 요청문을 복사할 수 있으며, 여기서 AI나 실제 작업을 실행하지 않습니다.','A scripted conversation. Requests can be copied; no AI or actual work runs here.')+'</footer></div>';
}
function updateTimeline() {
  const seek=document.getElementById('demo-seek');
  seek.value=String(scriptTime);
  seek.setAttribute('aria-valuetext',timeLabel(scriptTime)+' / '+timeLabel(totalTime)+' · '+(messageIndex+1)+' / '+messages.length+' · '+playbackState());
  document.getElementById('demo-time').textContent=timeLabel(scriptTime)+' / '+timeLabel(totalTime);
  document.getElementById('demo-position').textContent=(messageIndex+1)+' / '+messages.length;
  document.getElementById('demo-state').textContent=playbackState();
  const play=document.getElementById('demo-play');
  const label=playing?t('일시정지','Pause'):scriptTime>=totalTime?t('다시 재생','Replay'):t('재생','Play');
  if(play.getAttribute('aria-label')!==label) {
    play.setAttribute('aria-label',label);play.title=label;
    play.innerHTML=playerIcon(playing?'pause':scriptTime>=totalTime?'restart':'play');
  }
}
function settleClock() {
  if(!playing)return;
  const now=Date.now();
  scriptTime=Math.min(totalTime,scriptTime+(now-lastTick)*speed); lastTick=now;
  messageIndex=Math.min(messages.length-1,Math.floor(scriptTime/10000));
}
function pauseDemo() {
  settleClock(); playing=false; clearTimeout(playbackTimer); playbackTimer=null; timerGeneration++;
  updateTimeline();
}
function captureTranscriptScroll() {
  const transcript=document.getElementById('demo-transcript');
  if(transcript?.clientHeight>0)transcriptScroll=transcript.scrollTop;
}
function restoreTranscriptScroll(follow=false) {
  const transcript=document.getElementById('demo-transcript');
  if(follow)followOnChatReturn=true;
  // Hidden mobile panes have no scroll geometry; follow once they are visible.
  if(transcript.clientHeight>0) {
    transcript.scrollTop=followOnChatReturn?transcript.scrollHeight:transcriptScroll;
    transcriptScroll=transcript.scrollTop;followOnChatReturn=false;
  }
  transcript.dataset.lastScroll=String(transcript.scrollTop);
}
function paintDemo(follow=false) {
  const active=document.activeElement?.id;
  captureTranscriptScroll();
  const record=document.getElementById('record');
  if(document.createElement && record.querySelector('.demo-body')) {
    const fragment=document.createElement('div');fragment.innerHTML=workflowHTML();
    record.querySelector('.demo-body').replaceWith(fragment.querySelector('.demo-body'));
    record.querySelector('.demo-chapters').innerHTML=fragment.querySelector('.demo-chapters').innerHTML;
    record.querySelector('.demo-view-switch').innerHTML=fragment.querySelector('.demo-view-switch').innerHTML;
    for(const id of ['demo-play','demo-prev','demo-next']) {
      const current=document.getElementById(id), next=fragment.querySelector('#'+id);
      current.innerHTML=next.innerHTML;current.disabled=next.disabled;
      current.setAttribute('aria-label',next.getAttribute('aria-label'));current.title=next.title;
    }
  } else record.innerHTML=workflowHTML();
  bindDemo();
  restoreTranscriptScroll(follow);
  updateTimeline();
  if(active?.startsWith('demo-')||active?.startsWith('workflow-'))document.getElementById(active)?.focus({preventScroll:true});
}
function scheduleDemo() {
  clearTimeout(playbackTimer);
  const generation=++timerGeneration;
  if(!playing)return;
  playbackTimer=setTimeout(()=>{
    if(!playing||generation!==timerGeneration)return;
    const previous=messageIndex; settleClock();
    if(scriptTime>=totalTime)pauseDemo();
    if(previous!==messageIndex)paintDemo(true);
    updateTimeline(); scheduleDemo();
  },100);
}
function seekDemo(time) {
  pauseDemo(); started=true; scriptTime=Math.max(0,Math.min(Number(time),totalTime));
  messageIndex=Math.floor(scriptTime/10000);paintDemo(true);updateTimeline();
}
function jumpDemo(index) {seekDemo(messageTimes[Math.max(0,Math.min(index,messages.length-1))]);}
function changeSpeed(value) {
  const previous=messageIndex;
  settleClock();speed=Number(value);lastTick=Date.now();scheduleDemo();
  if(previous!==messageIndex)paintDemo(true);
  updateTimeline();
}
function toggleDemo() {
  if(playing)pauseDemo();
  else {
    if(scriptTime>=totalTime){scriptTime=0;messageIndex=0;}
    started=true;playing=true;lastTick=Date.now();scheduleDemo();
  }
  paintDemo();updateTimeline();
}
function bindDemo() {
  document.getElementById("demo-seek").oninput=event=>seekDemo(event.target.value);
  document.getElementById("demo-speed").onchange=event=>changeSpeed(event.target.value);
  const sourceToggle=document.getElementById("demo-source");
  if(sourceToggle)sourceToggle.onclick=()=>{pauseDemo();docSource=!docSource;paintDemo();};
  document.querySelectorAll('#record button').forEach((button,index)=>{if(!button.id)button.id='demo-action-'+index;});
  document.getElementById('demo-play').onclick=toggleDemo;
  document.getElementById('demo-prev').onclick=()=>jumpDemo(messageIndex-1);
  document.getElementById('demo-next').onclick=()=>jumpDemo(messageIndex+1);
  document.getElementById('demo-restart').onclick=()=>jumpDemo(0);
  document.querySelectorAll('[data-chapter]').forEach(el=>el.onclick=()=>jumpDemo(chapters[Number(el.dataset.chapter)].at));
  document.querySelectorAll('[data-jump]').forEach(el=>el.onclick=()=>jumpDemo(Number(el.dataset.jump)));
  document.querySelectorAll('[data-demo-view]').forEach(el=>el.onclick=()=>{pauseDemo();demoView=el.dataset.demoView;paintDemo();});
  document.querySelectorAll('[data-demo-doc]').forEach(el=>el.onclick=()=>{pauseDemo();demoDoc=el.dataset.demoDoc;demoView='document';paintDemo();});
  document.querySelectorAll('#record [data-prompt]').forEach(el=>el.onclick=()=>openPrompt(el.dataset.prompt,el));
  const transcript=document.getElementById('demo-transcript');
  transcript.onscroll=()=>{
    // A replaced transcript can still receive a queued scroll event.
    if(!transcript.isConnected||transcript.clientHeight===0)return;
    const previous=Number(transcript.dataset.lastScroll||0);
    if(transcript.scrollTop<previous-2&&playing){pauseDemo();paintDemo();}
    transcript.dataset.lastScroll=String(transcript.scrollTop);
  };
  transcript.onkeydown=event=>{
    if(event.target!==transcript)return;
    if(event.key===' '){event.preventDefault();toggleDemo();}
    if(event.key==='ArrowRight'){event.preventDefault();jumpDemo(messageIndex+1);}
    if(event.key==='ArrowLeft'){event.preventDefault();jumpDemo(messageIndex-1);}
  };
  updateTimeline();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){pauseDemo();paintDemo();}});
function cardHTML(ticket) {
  return `<button class="ticket" data-ticket="${ticket.id}" data-od-id="ticket-${ticket.id.toLowerCase()}"
    aria-label="${escapeHTML(field(ticket.title) + ' — ' + t('작업 기록 보기', 'Read work record'))}">
    <span class="ticket-meta"><span>${ticket.id}</span><span>${statusName(ticket.status)}</span></span>
    <h4>${field(ticket.title)}</h4>
    <p>${field(ticket.scope)}</p>
    <span class="ticket-note">${field(ticket.note)}</span>
    <span class="progress"><span class="progress-track"><span class="progress-fill" style="width:${ticket.progress}%"></span></span><span>${ticket.progress}%</span></span>
    <span class="record-link">${t('작업 기록 보기', 'Read work record')} ${icon()}</span>
  </button>`;
}
function boardHTML() {
  const activeStatuses = statuses.filter(status => tickets.some(ticket => ticket.status === status));
  return `<div class="board-head">
    <div><h2>${t('책갈피 프로젝트', 'Bookmark project')}</h2><span class="badge">${t('가상 예시', 'Fictional example')}</span></div>
    <div class="tabs board-tabs" role="tablist" aria-label="${t('예시 보기', 'Example view')}">
      ${['board','markdown'].map(view => `<button id="view-${view}" data-view="${view}" role="tab"
        aria-selected="${boardView===view}" tabindex="${boardView===view?0:-1}" aria-controls="board-panel">
        ${view==='board'?t('보드','Board'):'Markdown'}</button>`).join('')}
    </div>
  </div>
  <div class="board-toolbar"><code>docs/01_reading_tickets.md</code><span>${tickets.filter(x=>x.status==='DONE').length} / ${tickets.length} ${t('티켓 완료','tickets done')}</span></div>
  <div id="board-panel" role="tabpanel" aria-labelledby="view-${boardView}">
    ${boardView==='board' ? `
      <label class="mobile-status-label" for="mobile-status">${t('상태별 보기','View by status')}</label>
      <select id="mobile-status" class="mobile-status">
        ${statuses.map(status=>`<option value="${status}" ${mobileStatus===status?'selected':''}>${statusName(status)} (${tickets.filter(x=>x.status===status).length})</option>`).join('')}
      </select>
      <div class="board-grid">${statuses.map(status=>`
        <section class="column ${activeStatuses.includes(status)?'populated':''} ${mobileStatus===status?'mobile-active':''}" data-od-id="column-${status.toLowerCase()}">
          <div class="column-head"><span>${statusName(status)}</span><span>${tickets.filter(x=>x.status===status).length}</span></div>
          <div class="column-body">${tickets.filter(x=>x.status===status).map(cardHTML).join('') || `<p class="empty">${t('티켓 없음','No tickets')}</p>`}</div>
        </section>`).join('')}
      </div>` : `
      <div class="detail-tools"><label for="ticket-select">${t('작업 기록','Work record')}</label>
        <select id="ticket-select">${tickets.map(ticket=>`<option value="${ticket.id}" ${selected===ticket.id?'selected':''}>${ticket.id} · ${field(ticket.title)}</option>`).join('')}</select>
      </div>
      <pre class="markdown" tabindex="0" data-od-id="markdown-record">${escapeHTML(markdown(tickets.find(x=>x.id===selected)))}</pre>`}
  </div>
  <p class="board-caption">${t('아래 대화 예시의 이후 진행 모습입니다. 카드를 눌러 범위·결정·남은 검증을 읽어보세요.','A later progress snapshot of the fictional conversation below. Open a card to read scope, decisions, and remaining checks.')}</p>`;
}
function dualActions(prefix) {
  return `<div class="actions dual-actions">
    ${ext('https://kanban.giveit2.me/',t('칸반 시작하기','Start Kanban'),'button primary')}
    <a class="button outline" id="${prefix}-install" href="#skill" data-mode="install">${t('스킬 설치하기','Install the skill')}${icon()}</a>
  </div>`;
}
function installHTML() {
  return `<section id="skill" class="section band" data-od-id="skill-install">
    <span id="updates" class="anchor-alias" aria-hidden="true">
</span>
    <div class="wrap install-layout">
      <div class="installation-heading">
<p class="eyebrow">${t('스킬 설치·업데이트','Skill installation & updates')}</p>
        <h2>implementation-<wbr>ledger</h2>
        <p>${t('AI가 범위와 결정을 기록하고, 구현 후에는 결과와 검증을 같은 Markdown에 갱신하도록 돕습니다.','Help AI record scope and decisions, then update the same Markdown with outcomes and verification.')}</p>
        <p class="quiet">${t('웹·PWA 업데이트와 개인 스킬 업데이트는 별개입니다. 설치된 스킬은 Codex에서 확인하세요.','Web and PWA updates are separate from personal skill updates. Check your installed skill in Codex.')}</p>
      </div>
<div class="install-content">
<div class="segments" role="tablist" aria-label="${t('설치 방식','Installation mode')}">
<button id="mode-install" data-mode-tab="install" role="tab" aria-selected="${mode==='install'}" tabindex="${mode==='install'?0:-1}" aria-controls="install-panel">${t('처음 설치','First installation')}</button>
<button id="mode-update" data-mode-tab="update" role="tab" aria-selected="${mode==='update'}" tabindex="${mode==='update'?0:-1}" aria-controls="install-panel">${t('기존 스킬 업데이트','Update existing skill')}</button>
</div>
<div id="install-panel" role="tabpanel" aria-labelledby="mode-${mode}">
<h3>${mode==='install'?t('공식 원본에서 전체 폴더 설치','Install the complete official skill'):t('기존 설치본과 공식 원본 비교','Compare your copy with the official source')}</h3>
<p class="source">${t('공식 출처','Official source')}${ext(SOURCE,'KOR-Believer / alpha-kanban')}<code>master / skills / implementation-ledger</code>
</p>
<p>${mode==='install'?t('참조 파일과 템플릿까지 함께 설치합니다. 같은 이름의 스킬이 있다면 먼저 비교하고, 백업과 개인 수정 보존 후 덮어쓰기를 확인합니다.','Include references and templates. If a copy already exists, compare it first, back it up, preserve personal edits, and confirm before overwriting.'):t('설치 위치와 출처를 확인하고 변경 내용을 먼저 읽습니다. 전체 백업, 개인 수정 보존, 덮어쓰기 전 확인을 요청문에 포함했습니다.','Check the installation location and source, then review the changes. The request includes a full backup, preservation of customizations, and confirmation before overwriting.')}</p>
<div class="actions">
<button id="install-preview" data-prompt="${mode}" data-od-id="install-preview">${icon('copy')}${mode==='install'?t('설치 요청문 확인·복사','Review & copy install request'):t('업데이트 요청문 확인·복사','Review & copy update request')}</button>
</div>
<p class="source">${t('이 페이지는 요청문을 제공합니다. 실제 설치·업데이트는 로컬 파일을 다룰 수 있는 Codex에서 진행하며, GitHub 연결이 필요합니다.','This page provides a request. Codex performs installation or updates with local file access and a connection to GitHub.')}</p>
</div>
<details class="manual" data-od-id="manual-install">
<summary>${t('직접 설치하는 방법','Manual installation')}</summary>
<ol>
<li>${t('공식 저장소의 전체 implementation-ledger 폴더를 준비하세요. SKILL.md와 references, assets, scripts, agents를 함께 유지하세요.','Obtain the complete implementation-ledger folder from the official repository. Keep SKILL.md, references, assets, scripts, and agents together.')}</li>
<li>${t('기존 설치본 전체를 백업하고 차이를 비교하세요. 개인 수정을 보존하고 덮어쓸 내용을 확인하세요.','Back up the existing folder and compare changes. Preserve your edits and confirm what will be overwritten.')}</li>
<li>${t('Codex가 인식하는 개인 스킬 위치에 폴더를 두세요. 기본 경로는','Place the folder in the personal skill directory recognized by Codex. The default is')} <code>~/.codex/skills/implementation-ledger/</code>. ${t('CODEX_HOME을 설정했다면','If CODEX_HOME is set, use')} <code>$CODEX_HOME/skills/implementation-ledger/</code>.</li>
<li>${t('Codex를 다시 열어 $implementation-ledger가 인식되는지 확인하세요. 보이지 않으면 전체 폴더와 참조 파일 설치를 확인해 달라고 요청하세요.','Reopen Codex and check that $implementation-ledger is recognized. If it is missing, ask Codex to inspect the complete folder and references.')}</li>
</ol>${ext(SOURCE,t('전체 스킬 소스 보기','View the complete skill source'))}</details>
</div>    </div>
  </section>`;
}
function render() {
  captureTranscriptScroll();
  document.documentElement.lang = lang;
  document.title = 'Alpha Kanban · ' + t('AI와 계획하고, 칸반에서 확인하세요','Plan with AI. Review on Kanban.');
  document.getElementById('app').innerHTML = `
    <header class="header" data-od-id="header"><div class="wrap header-inner">
      <a class="brand" href="#top">Alpha Kanban</a>
      <nav class="nav" aria-label="${t('주 메뉴','Main navigation')}">
        <a href="#kanban">${t('칸반','Kanban')}</a>
        <a href="#example">${t('작업 흐름','Workflow')}</a>
        <a href="#skill">${t('스킬 설치','Install skill')}</a>
        <a class="github" href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
        <select id="language" aria-label="${t('언어','Language')}">
          <option value="ko" ${lang==='ko'?'selected':''}>한국어</option>
          <option value="en" ${lang==='en'?'selected':''}>English</option>
        </select>
      </nav>
    </div></header>
    <main id="top">
      <section class="hero wrap" data-od-id="hero">
        <h1 data-od-id="product-name">Alpha Kanban</h1>
        <p class="value">${t('AI와 계획하고, 칸반에서 한눈에 확인하세요.','Plan with AI. See the whole picture on Kanban.')}</p>
        <p class="lead">${t('implementation-ledger 스킬이 작업 범위와 결정, 구현·검증 결과를 Markdown에 기록합니다. 칸반에서 전체 진행을 훑고, 각 작업의 근거까지 확인하세요.','The implementation-ledger skill records scope, decisions, and implementation results in Markdown. Use Kanban to scan progress and review the evidence behind each task.')}</p>
        ${dualActions('hero')}
      </section>
      <section id="kanban" class="board-section wrap" data-od-id="kanban-preview">
        <div id="board">${boardHTML()}</div>
      </section>
      <section id="example" class="section" data-od-id="worked-example"><div class="wrap">
        <div class="section-intro"><p class="eyebrow">${t('가상 예시 · 독서 기록 앱 · 외부 AI 채팅','Fictional example · Reading journal app · External AI chat')}</p>
          <h2>${t('대화가 작업 기록이 되는 과정.','From conversation to a reviewable record.')}</h2>
          <p>${t('아이디어를 충분히 이야기한 뒤 문서로 정리하고, 남은 질문을 함께 풀어가세요.','Explore the idea together before turning it into documents. Then work through the remaining questions together.')}</p>
        </div>
        <div id="record">${workflowHTML()}</div>
      </div></section>
      ${installHTML()}
      <section class="section usage" data-od-id="usage"><div class="wrap viewer-detail">
        <div><p class="eyebrow">${t('내 프로젝트에서 이어가기','Continue in your project')}</p><h2>${t('기록은 Markdown에,<br>전체 흐름은 칸반에.','The record in Markdown.<br>The whole picture on Kanban.')}</h2></div>
        <div><h3>${t('프로젝트 폴더를 열고 기록 확인','Open your project folder to review')}</h3>
          <p>${t('데스크톱 Chrome에서 칸반을 열고 프로젝트 폴더 접근을 허용하세요. Alpha Kanban은 선택한 폴더의 Markdown을 읽으며 서버에 업로드하지 않습니다.','Open Kanban in desktop Chrome and allow access to your project folder. Alpha Kanban reads Markdown from the folder you choose without uploading it to a server.')}</p>
          <p>${t('필요하면 쓰기 권한을 허용해 상태·진행률·지시를 기록할 수 있습니다. 저장은 AI를 실행하지 않으며, 지시를 남긴 뒤에는 AI에 최신 문서를 읽도록 요청하세요.','With write permission, you can also record status, progress, and directions. Saving does not run AI; ask AI to reread the latest document after leaving a direction.')}</p>
          <p class="quiet">${t('스킬과 칸반은 각각 사용할 수도 있습니다.','The skill and Kanban can also be used independently.')}</p>
        </div>
      </div></section>
      <section class="section closing-section" data-od-id="closing"><div class="wrap closing">
        <h2>${t('함께 정한 계획을,<br>확인할 수 있는 결과로.','From an agreed plan<br>to results you can review.')}</h2>${dualActions('closing')}
      </div></section>
    </main>
    <footer class="footer"><div class="wrap"><span>Alpha Kanban <span class="subtle">/ implementation-ledger</span></span>
      <div><a href="#updates" data-mode="update">${t('기존 스킬 업데이트','Update your skill')}</a> · ${ext(REPO,t('GitHub 소스','GitHub source'))}</div>
    </div></footer>`;
  bind();
  restoreTranscriptScroll();
  document.querySelectorAll('h2,h3,nav a,button,select,summary').forEach((el,i)=>{
    if(!el.dataset.odId) el.dataset.odId=el.id||`content-${i}`;
  });
}
function focusAfterRender(id) {
  render();
  document.getElementById(id)?.focus({preventScroll:true});
}
function selectMode(next) {
  mode = next;
}
function bind() {
  bindDemo();
  document.getElementById('language').onchange = event => {
    pauseDemo();
    lang=event.target.value;
    focusAfterRender('language');
  };
  document.querySelectorAll('[data-mode]').forEach(el=>el.onclick=event=>{
    event.preventDefault();
    const target=el.getAttribute('href');
    selectMode(el.dataset.mode);
    render();
    location.hash=target;
  });
  document.querySelectorAll('[data-mode-tab]').forEach(el=>el.onclick=()=>{
    selectMode(el.dataset.modeTab);
    focusAfterRender(`mode-${mode}`);
  });
  document.querySelectorAll('[data-prompt]').forEach(el=>el.onclick=()=>openPrompt(el.dataset.prompt,el));
  document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>{
    boardView=el.dataset.view;
    focusAfterRender(`view-${boardView}`);
  });
  document.querySelectorAll('[data-ticket]').forEach(el=>el.onclick=()=>{
    selected=el.dataset.ticket;
    boardView='markdown';
    focusAfterRender('ticket-select');
  });
  const mobile=document.getElementById('mobile-status');
  if(mobile) mobile.onchange=event=>{mobileStatus=event.target.value;focusAfterRender('mobile-status');};
  const selector=document.getElementById('ticket-select');
  if(selector) selector.onchange=event=>{selected=event.target.value;focusAfterRender('ticket-select');};
  document.querySelectorAll('[role=tablist]').forEach(list=>list.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const buttons=[...list.querySelectorAll('[role=tab]')];
    const index=buttons.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
      (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[next].click();
  }));
}
const dialog=document.getElementById('prompt-dialog'),area=document.getElementById('prompt-text'),notice=document.getElementById('copy-status');
dialog.addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const controls=[...dialog.querySelectorAll('textarea,button')],first=controls[0],last=controls.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
function openPrompt(kind,trigger){pauseDemo();promptKind=kind;opener=trigger;document.getElementById('dialog-title').textContent=kind==='install'?t('Codex에 전달할 설치 요청','Installation request for Codex'):kind==='update'?t('Codex에 전달할 업데이트 요청','Update request for Codex'):t('프로젝트에서 사용할 작업 요청','Work request for your project');document.getElementById('dialog-desc').textContent=t('내용을 확인하고 복사해 Codex 채팅에 붙여넣으세요. 복사만으로 작업이 실행되지는 않습니다.','Review and copy this request into your Codex chat. Copying does not execute it.');area.value=prompts[kind]();area.setAttribute('aria-label',t('요청문','Request'));notice.textContent='';document.getElementById('close-dialog').textContent=t('닫기','Close');document.getElementById('copy-request').innerHTML=icon('copy')+t('요청문 복사','Copy request');dialog.showModal();document.getElementById('close-dialog').focus();}
document.getElementById('close-dialog').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
document.getElementById('copy-request').onclick=async()=>{const kind=promptKind;try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(area.value);notice.textContent=kind==='install'?t('요청문을 복사했어요. Codex에 붙여넣어 설치를 진행하세요.','Request copied. Paste it into Codex to proceed with installation.'):kind==='update'?t('요청문을 복사했어요. Codex에서 기존 설치본과 비교한 뒤 업데이트를 진행하세요.','Request copied. Compare your installed copy in Codex before updating.'):t('요청문을 복사했어요. 작업할 프로젝트의 Codex 채팅에 붙여넣으세요.','Request copied. Paste it into the Codex chat for your project.');}catch{area.focus();area.select();notice.textContent=t('요청문을 선택했어요. 직접 복사해 Codex에 붙여넣으세요.','Text selected. Copy it manually and paste it into Codex.');}};
function syncHash() {
  const chapter=chapters.find(c=>location.hash==='#workflow-'+c.id);
  if(chapter){jumpDemo(chapter.at);return;}
  if(location.hash !== '#updates' && location.hash !== '#skill') return;
  const next=location.hash === '#updates' ? 'update' : 'install';
  if(mode !== next) { mode=next; render(); }
}
window.addEventListener('hashchange',syncHash);
if(location.hash === '#updates') mode='update';
render();

if(location.hash.startsWith('#workflow-')) syncHash();
