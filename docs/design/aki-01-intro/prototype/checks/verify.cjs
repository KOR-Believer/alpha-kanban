// Logic-only DOM substitute: no browser layout, permission or native-dialog claims.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function context(hash = '') {
  const elements = new Map();
  const events = {};
  const timers = new Map(); let timerId=0, clock=0;
  const doc = { documentElement: {}, activeElement: null, querySelectorAll() { return []; }, addEventListener(name,fn){events[name]=fn;} };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      dataset:{}, attributes:{}, scrollTop:0, scrollHeight:500, clientHeight:410, id, value: '', textContent: '', innerHTML: '', isConnected: true,
      setAttribute(name,value) { this.attributes[name]=String(value); }, getAttribute(name) { return this.attributes[name]??null; },
      focus() { doc.activeElement = this; }, select() { this.selected = true; },
      showModal() { this.open = true; }, close() { this.open = false; this.events?.close?.(); },
      querySelectorAll() { return ['prompt-text', 'close-dialog', 'copy-request'].map(element); },
      addEventListener(name, fn) { (this.events ??= {})[name] = fn; }
    });
    return elements.get(id);
  }
  doc.getElementById = element;
  const c = vm.createContext({ Date:{now:()=>clock}, document: doc, window: { addEventListener(name, fn) { events[name] = fn; } }, location: { hash }, navigator: {}, console, setTimeout(fn){timers.set(++timerId,()=>{clock+=10000;fn();});return timerId;}, clearTimeout(id){timers.delete(id);} });
  vm.runInContext(source, c);
  return { c, element, events, timers, advance:ms=>{clock+=ms;}, run: code => vm.runInContext(code, c) };
}
(async () => {
  const x = context();
  if (process.argv[2] === '--markup') {
    x.run(`lang='${process.argv[3] === 'en' ? 'en' : 'ko'}'; render()`);
    process.stdout.write(x.element('app').innerHTML);
    return;
  }
  assert.equal(x.run('lang'), 'ko');
  assert(x.element('demo-seek').getAttribute('aria-valuetext').includes('0:00'));
  assert.equal(context('#updates').run('mode'), 'update');
  assert.equal(context('#skill').run('mode'), 'install');
  x.c.location.hash = '#updates'; x.events.hashchange(); assert.equal(x.run('mode'), 'update');
  x.c.location.hash = '#skill'; x.events.hashchange(); assert.equal(x.run('mode'), 'install');
  for (const language of ['ko', 'en']) {
    x.run(`lang='${language}';mode='update';selected='READ-04';mobileStatus='READY';render()`);
    assert.equal(x.run('mode'), 'update');
    assert.equal(x.run('selected'), 'READ-04'); assert.equal(x.run('mobileStatus'), 'READY');
    const html = x.element('app').innerHTML;
    assert.match(html, /<h1[^>]*>Alpha Kanban<\/h1>/);
    assert(html.indexOf('id="board"') < html.indexOf('id="example"'));
    assert(html.indexOf('id="updates"') > html.indexOf('id="skill"'));
    assert(!html.includes('<section id="updates"'));
    for (const banned of ['AKI-01', 'Design review', '선택적 칸반', '스킬만으로']) assert(!html.includes(banned));
    for (const anchor of ['top', 'example', 'skill', 'kanban', 'updates']) assert(html.includes(`id="${anchor}"`));
    for (const kind of ['install', 'update']) {
      const prompt = x.run(`prompts.${kind}()`);
      for (const word of ['references', 'assets', 'scripts', 'agents', 'https://github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger']) assert(prompt.includes(word));
    }
    x.run('boardView="board"');
    const board = x.run('boardHTML()');
    for (const ticket of x.run('tickets')) {
      const md = x.run(`markdown(tickets.find(x=>x.id==='${ticket.id}'))`);
      for (const text of [ticket.id, `${ticket.progress}%`]) assert(board.includes(text));
      assert(md.includes(`Status: ${ticket.status}`)); assert(md.includes(`Progress: ${ticket.progress}%`));
      assert(md.includes(ticket.scope[language === 'ko' ? 0 : 1]));
      if (ticket.status === 'DONE') assert(!md.includes('- [ ]'));
      for (const label of ['구현 범위:', '완료 기준:', '검증:', '사용자 지시:', '진행 메모:']) assert(md.includes(label));
    }

    const messages=x.run('messages'), chapters=x.run('chapters');
    assert.equal(messages.length,21);
    assert.equal(Array.from(chapters,c=>c.id).join(','),'discuss,draft,read,questions,implement,feedback');
    for(let i=0;i<6;i++)assert.equal(x.run('documentAt('+i+').stage'),'none');
    for(let i=6;i<13;i++)assert.equal(x.run('documentAt('+i+').questions'),true);
    assert.equal(x.run('documentAt(13).questions'),false);
    assert.equal(messages[16].kind,'implement');
    assert.equal(messages[12].kind,'update-docs');
    assert.equal(messages[18].kind,'feedback');
    assert(!messages.slice(0,5).some(m=>/\.md|READ-/.test(m.text.join(''))));
    for(const message of messages.filter(m=>m.kind)) {
      assert.equal(x.run('prompts['+JSON.stringify(message.kind)+']()'),message.text[language==='ko'?0:1]);
    }
    x.run('jumpDemo(0)'); assert.equal(x.run('playing'),false);
    x.run('jumpDemo(-1)'); assert.equal(x.run('messageIndex'),0);
    x.run('toggleDemo()'); assert.equal(x.run('playing'),true);
    const advance=[...x.timers.values()][0]; x.timers.clear(); advance();
    assert.equal(x.run('messageIndex'),1);
    x.run('demoDoc="plan";jumpDemo(13)'); assert.equal(x.run('playing'),false);
    assert.equal(x.timers.size,0);
    assert(x.run('documentText(13)').includes(language==='ko'?'- 없음':'- None'));
    assert(x.run('documentText(6)').includes(language==='ko'?'다음 방문':'across visits'));
    x.run('jumpDemo(20)'); assert.equal(x.run('playing'),false);
    assert(x.run('workflowHTML()').includes('id="demo-next" class="demo-control"'));
    x.run('jumpDemo(19);toggleDemo()');
    const finish=[...x.timers.values()][0];x.timers.clear();finish();
    assert.equal(x.run('messageIndex'),20);assert.equal(x.run('playing'),false);
    x.run('jumpDemo(8);demoView="document";demoDoc="tickets";toggleDemo()');
    x.element('language').onchange({target:{value:language}});
    assert.equal(x.run('messageIndex'),8);assert.equal(x.run('demoView'),'document');
    assert.equal(x.run('demoDoc'),'tickets');assert.equal(x.run('playing'),false);
    x.run('toggleDemo()');x.c.document.hidden=true;x.events.visibilitychange();
    assert.equal(x.run('playing'),false);x.c.document.hidden=false;
    x.run('toggleDemo()');
    x.element('demo-transcript').isConnected=false;
    x.element('demo-transcript').dataset.lastScroll='100';
    x.element('demo-transcript').scrollTop=0;
    x.element('demo-transcript').onscroll();
    assert.equal(x.run('playing'),true);
    x.element('demo-transcript').isConnected=true;
    x.run('pauseDemo()');
    x.run('toggleDemo()');x.element('demo-transcript').dataset.lastScroll='100';x.element('demo-transcript').scrollTop=10;x.element('demo-transcript').onscroll();
    assert.equal(x.run('playing'),false);
    x.run('demoDoc="tickets"');
    assert.equal(x.run('documentText(19)'),x.run("tickets.map(markdown).join('\\n\\n---\\n\\n')"));
    x.run('jumpDemo(0)');
    assert(!x.run('workflowHTML()').includes('data-message="1"'));
    const player=x.run('workflowHTML()');
    assert(!player.includes('message-author'));
    assert(player.includes('aria-readonly="true"'));
    assert(player.indexOf('demo-toolbar')<player.indexOf('demo-chat-canvas'));
    assert(player.indexOf('demo-composer')>player.indexOf('demo-transcript'));
    assert(!/<textarea|contenteditable/.test(player));
    assert.equal((player.match(/<input/g)||[]).length,1);
    assert(player.includes('id="demo-seek" type="range"'));
    x.run('toggleDemo()');
    for(let step=1;step<21;step++) {
      const tick=[...x.timers.values()][0];assert(tick);x.timers.clear();tick();
      x.element('demo-transcript').onscroll();
      assert.equal(x.run('messageIndex'),step);
      assert.equal(x.run('playing'),step<20);
    }
    assert.equal(x.timers.size,0);
    x.run('jumpDemo(0)');
    x.element('demo-transcript').onkeydown({target:x.element('demo-transcript'),key:'ArrowRight',preventDefault(){}});
    assert.equal(x.run('messageIndex'),1);
    x.element('demo-transcript').onkeydown({target:x.element('demo-transcript'),key:'ArrowLeft',preventDefault(){}});
    assert.equal(x.run('messageIndex'),0);
    for (const kind of ['install', 'update', 'discuss', 'draft', 'clarify', 'update-docs', 'implement', 'feedback']) {
      x.run(`openPrompt('${kind}',document.getElementById('trigger'))`);
      assert(x.element('prompt-dialog').open);
      await x.element('copy-request').onclick();
      assert(x.element('prompt-text').selected);
      assert(x.element('copy-status').textContent.includes(language === 'ko' ? '직접 복사' : 'manually'));
      x.c.navigator.clipboard = { writeText: async text => assert.equal(text, x.run(`prompts[${JSON.stringify(kind)}]()`)) };
      await x.element('copy-request').onclick();
      assert(x.element('copy-status').textContent.includes(language === 'ko' ? '복사했어요' : 'Request copied'));
      delete x.c.navigator.clipboard;
      let prevented = false;
      x.element('copy-request').focus();
      x.element('prompt-dialog').events.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
      assert(prevented); assert.equal(x.c.document.activeElement.id, 'prompt-text');
      x.element('prompt-dialog').events.keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
      assert.equal(x.c.document.activeElement.id, 'copy-request');
      x.element('close-dialog').onclick();
      assert.equal(x.element('prompt-dialog').open, false);
      assert.equal(x.c.document.activeElement.id, 'trigger');
    }
  }
  for (const unsafe of ['localStorage', 'sessionStorage', 'indexedDB', 'serviceWorker', 'showDirectoryPicker', 'fetch(', 'XMLHttpRequest', 'sendBeacon']) assert(!source.includes(unsafe));
  x.run('jumpDemo(0);changeSpeed(1);toggleDemo()');
  x.advance(2000);x.run('changeSpeed(2)');
  assert.equal(x.run('scriptTime'),2000);assert.equal(x.timers.size,1);
  x.advance(1000);x.run('pauseDemo()');assert.equal(x.run('scriptTime'),4000);
  x.run('toggleDemo()');x.advance(500);x.run('pauseDemo()');
  assert.equal(x.run('scriptTime'),5000);
  x.run('seekDemo(59900)');assert.equal(x.run('documentAt(messageIndex).stage'),'none');
  x.run('seekDemo(60000)');assert.equal(x.run('documentAt(messageIndex).stage'),'draft');
  assert(x.run('documentPaneHTML()').includes('01_reading_plan.md'));
  x.run('seekDemo(129900)');assert.equal(x.run('documentAt(messageIndex).questions'),true);
  x.run('seekDemo(130000)');assert.equal(x.run('documentAt(messageIndex).questions'),false);
  x.run('docSource=true');assert(x.run('documentPaneHTML()').includes('<pre>'));
  x.run('docSource=false');assert(!x.run('documentPaneHTML()').includes('<pre>'));
  x.run('seekDemo(0)');assert(!x.run('documentPaneHTML()').includes('.md'));
  x.run('seekDemo(totalTime)');assert.equal(x.run('playbackState()'),'Finished');
  x.run('toggleDemo()');assert.equal(x.run('scriptTime'),0);assert.equal(x.run('playing'),true);
  assert.equal(x.run('speed'),2);x.run('pauseDemo()');
  assert.equal(x.element('demo-play').getAttribute('aria-label'),'Play');
  x.element('demo-transcript').scrollTop=135;x.run('captureTranscriptScroll()');
  x.element('demo-transcript').clientHeight=0;x.element('demo-transcript').scrollTop=0;
  x.run('paintDemo()');assert.equal(x.run('transcriptScroll'),135);
  x.run('jumpDemo(8)');assert.equal(x.run('followOnChatReturn'),true);
  x.element('demo-transcript').clientHeight=410;x.run('restoreTranscriptScroll()');
  assert.equal(x.element('demo-transcript').scrollTop,500);
  assert.equal(x.run('followOnChatReturn'),false);
  for (const asset of ['assets/raleway.woff2', 'assets/pretendard.woff2', 'assets/Raleway-OFL.txt', 'assets/Pretendard-OFL.txt', 'assets/Lucide-LICENSE.txt']) assert(fs.statSync(path.join(root, asset)).size > 0);
  console.log('PASS — logic-only: bilingual 21-message playback, boundaries, timers, chapters, rewind document snapshots, locale preservation, visibility/scroll pause, shared records, prompt copy/focus and local assets. No browser QA. No files written.');
})().catch(error => { console.error(error); process.exit(1); });
