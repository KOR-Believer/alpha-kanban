import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Copy, FileText, Folder, Mic, Pause, Play, Plus, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "../../i18n";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DEMO_DOCUMENTS, INTRO_CHAPTERS, INTRO_DURATION, INTRO_MESSAGES, MESSAGE_DURATION, demoDocumentMarkdown, demoFileName, demoStage, type DemoDocument, type DemoMessage } from "./demo";
import { PLAYBACK_RATES, playbackLabel, playbackTime, useIntroPlayback } from "./useIntroPlayback";
import { RequestDialog } from "./RequestDialog";

const activities: Record<number, string> = {
  6: "Drafted documents", 13: "Recorded decisions", 17: "Recorded implementation results", 19: "Applied feedback",
};

export function IntroConversation() {
  const { t, i18n } = useTranslation();
  const playback = useIntroPlayback(i18n.language);
  const [selectedDocument, setSelectedDocument] = useState<DemoDocument>("plan");
  const [mobileView, setMobileView] = useState<"chat" | "document">("chat");
  const [source, setSource] = useState(false);
  const [requestIndex, setRequestIndex] = useState<number | null>(null);
  const requestOpener = useRef<HTMLButtonElement | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const lastScroll = useRef(0);
  const followWhenVisible = useRef(true);
  const previousIndex = useRef(-1);
  const markdown = useMemo(() => demoDocumentMarkdown(playback.index, selectedDocument, t), [playback.index, selectedDocument, t]);
  const created = demoStage(playback.index) !== "none";
  const finished = playback.position >= INTRO_DURATION;
  const currentChapter = INTRO_CHAPTERS.reduce((current, chapter, index) => chapter.at <= playback.index ? index : current, 0);
  const playLabel = playback.playing ? t("Pause playback") : finished ? t("Replay conversation") : t("Play conversation");
  const stateLabel = t(playbackLabel(playback));

  function followTranscript() {
    const element = transcript.current;
    if (!element || element.clientHeight === 0 || !followWhenVisible.current) return;
    element.scrollTop = element.scrollHeight;
    lastScroll.current = element.scrollTop;
    followWhenVisible.current = false;
  }
  useLayoutEffect(() => {
    if (previousIndex.current !== playback.index) followWhenVisible.current = true;
    previousIndex.current = playback.index;
    followTranscript();
  }, [playback.index, mobileView, i18n.language]);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !transcript.current) return;
    const observer = new ResizeObserver(followTranscript);
    observer.observe(transcript.current);
    return () => observer.disconnect();
  }, []);

  function seek(index: number) { followWhenVisible.current = true; playback.seek(index * MESSAGE_DURATION); }
  function openDocument(document: DemoDocument) {
    playback.pause(); setSelectedDocument(document); setMobileView("document");
  }
  function fileButton(document: DemoDocument, location: string) {
    return <Button key={document} variant={selectedDocument === document ? "secondary" : "ghost"} size="sm" className="min-w-0 max-w-full shrink rounded-[var(--ak-radius-xs)]" title={demoFileName(document)} data-document={document} data-file-location={location}
      aria-pressed={selectedDocument === document} onClick={() => openDocument(document)}>
      <FileText aria-hidden="true" /><span>{demoFileName(document)}</span>
    </Button>;
  }

  return <section className="ak-conversation" id="record" aria-label={t("Fictional conversation")}>
    <header className="ak-conversation-heading"><div><h3>{t("Building a reading journal")}</h3><p>{t("Codex · Conversation and work records")}</p></div><Badge variant="outline">{t("Fictional conversation")}</Badge></header>
    <nav className="ak-conversation-chapters" aria-label={t("Conversation chapters")}>
      {INTRO_CHAPTERS.map((chapter, index) => <Button key={chapter.id} variant={index === currentChapter ? "secondary" : "ghost"} className="h-auto min-h-10 whitespace-normal" id={`workflow-${chapter.id}`} aria-current={index === currentChapter ? "step" : undefined} onClick={() => seek(chapter.at)}>
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{t(chapter.label)}
      </Button>)}
    </nav>
    <div className="ak-conversation-controls">
      <Button variant="ghost" size="icon" aria-label={t("Previous message")} title={t("Previous message")} disabled={playback.index === 0} onClick={() => seek(playback.index - 1)}><ChevronLeft aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon" id="demo-play" aria-label={playLabel} title={playLabel} onClick={playback.toggle}>{playback.playing ? <Pause aria-hidden="true" /> : finished ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" />}</Button>
      <Button variant="ghost" size="icon" aria-label={t("Next message")} title={t("Next message")} disabled={finished} onClick={() => seek(playback.index + 1)}><ChevronRight aria-hidden="true" /></Button>
      <Button variant="ghost" size="icon" aria-label={t("Restart conversation")} title={t("Restart conversation")} onClick={() => seek(0)}><RotateCcw aria-hidden="true" /></Button>
      <strong role="status" id="demo-state">{stateLabel}</strong>
      <div className="ak-conversation-speed"><span aria-hidden="true">{t("Playback speed")}</span>
        <Select value={String(playback.rate)} onValueChange={(value) => playback.changeRate(Number(value))}>
          <SelectTrigger size="sm" id="demo-speed" aria-label={t("Playback speed")}><SelectValue /></SelectTrigger>
          <SelectContent>{PLAYBACK_RATES.map(rate => <SelectItem value={String(rate)} key={rate}>{new Intl.NumberFormat(i18n.language).format(rate)}{"×"}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
    <div className="ak-conversation-timeline">
      <input id="demo-seek" className="ak-focus-ring" type="range" min={0} max={INTRO_DURATION} step={100} value={playback.position}
        style={{ "--playback-progress": `${playback.position / INTRO_DURATION * 100}%` } as CSSProperties}
        aria-label={t("Conversation timeline")} aria-valuetext={`${playbackTime(playback.position)} / ${playbackTime(INTRO_DURATION)} · ${playback.index + 1} / ${INTRO_MESSAGES.length} · ${stateLabel}`}
        onChange={(event) => { followWhenVisible.current = true; playback.seek(Number(event.target.value)); }} />
      <div><span id="demo-time">{playbackTime(playback.position)}{" / "}{playbackTime(INTRO_DURATION)}</span><span>{playback.index + 1}{" / "}{INTRO_MESSAGES.length}</span></div>
    </div>
    <div className="ak-conversation-mobile-switch" role="group" aria-label={t("Conversation view")}>
      <Button variant={mobileView === "chat" ? "secondary" : "ghost"} aria-pressed={mobileView === "chat"} onClick={() => { playback.pause(); setMobileView("chat"); }}>{t("Conversation")}</Button>
      <Button variant={mobileView === "document" ? "secondary" : "ghost"} aria-pressed={mobileView === "document"} onClick={() => { playback.pause(); setMobileView("document"); }}>{t("Documents")}</Button>
    </div>
    <div className="ak-conversation-window" data-mobile-view={mobileView}>
      <div className="ak-conversation-chat">
        <div className="ak-conversation-title"><Folder aria-hidden="true" />{t("Reading journal project")}</div>
        <div ref={transcript} id="demo-transcript" className="ak-conversation-transcript ak-scroll-area ak-focus-ring" tabIndex={0} role="region" aria-label={t("Fictional transcript")}
          onScroll={(event) => {
            const element = event.currentTarget;
            if (!element.clientHeight) return;
            if (element.scrollTop < lastScroll.current - 2 && playback.playing) playback.pause();
            lastScroll.current = element.scrollTop;
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === " ") { event.preventDefault(); playback.toggle(); }
            if (event.key === "ArrowRight") { event.preventDefault(); seek(playback.index + 1); }
            if (event.key === "ArrowLeft") { event.preventDefault(); seek(playback.index - 1); }
          }}>
          {INTRO_MESSAGES.slice(0, playback.index + 1).map((message: DemoMessage, index) => <article className={`ak-conversation-message ${message.role}`} data-message={index} key={index} aria-label={message.role === "human" ? t("User message") : t("Codex response")}>
            {activities[index] && <div className="ak-conversation-activity">{t(activities[index]!)}</div>}
            <div className="ak-conversation-prose">{t(message.text)}</div>
            {message.kind && <Button variant="ghost" size="iconSm" className="ak-conversation-copy" title={t("View and copy this request")} aria-label={t("View and copy this request")} onClick={(event) => {
              playback.pause(); requestOpener.current = event.currentTarget; setRequestIndex(index);
            }}><Copy aria-hidden="true" /></Button>}
            {message.attachments && <div className="ak-conversation-attachments"><p>{t(index === 6 ? "2 document drafts" : "Decisions reflected in 2 documents")}</p>
              {DEMO_DOCUMENTS.map(document => <Button key={document} variant="ghost" className="h-auto min-h-10 w-full justify-start rounded-none whitespace-normal text-left" data-document={document} data-file-location="chat" onClick={() => openDocument(document)}><FileText aria-hidden="true" /><span>{`docs/${demoFileName(document)}`}</span><span>{t(index === 6 ? "Created" : "Updated")}</span></Button>)}
            </div>}
            {message.loop && <Button variant="outline" size="sm" onClick={() => seek(8)}>{t("Return to questions")}</Button>}
          </article>)}
          {finished && <div className="ak-conversation-ending"><p>{t("Review results → discuss → update documents → implement & verify")}</p><Button variant="outline" size="sm" onClick={() => seek(0)}><RotateCcw aria-hidden="true" />{t("Replay conversation")}</Button><Button variant="ghost" size="sm" onClick={() => seek(8)}>{t("Revisit questions")}</Button></div>}
        </div>
        <div className="ak-conversation-composer" role="textbox" aria-readonly="true" aria-label={t("Read-only simulated composer")}>
          <span>{t("Work with Codex")}</span><div aria-hidden="true"><Plus /><span>{"Codex"}</span><Mic /><i><ArrowUp /></i></div>
        </div>
      </div>
      <section className="ak-conversation-document" aria-label={t("Example documents")}>
        <div className="ak-conversation-file-tabs" role="group" aria-label={t("Document tabs")}>{created ? DEMO_DOCUMENTS.map(document => fileButton(document, "tab")) : <span>{t("Documents")}</span>}</div>
        <div className="ak-conversation-document-toolbar"><span>{t("Reading journal")}{created && ` / docs / ${demoFileName(selectedDocument)}`}</span>
          {created && <Button size="sm" variant="outline" aria-pressed={source} onClick={() => { playback.pause(); setSource(!source); }}>{source ? t("Preview") : t("Source")}</Button>}
        </div>
        <div id="demo-document-text" className="ak-conversation-document-body ak-scroll-area ak-focus-ring" tabIndex={0}>
          {!created ? <><p>{t("No documents yet.")}</p><p>{t("This conversation is still exploring the idea.")}</p></> : source ? <pre>{markdown}</pre> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>}
        </div>
      </section>
      <aside className="ak-conversation-tree" aria-label={t("Example files")}><div className="ak-conversation-title">{t("Files")}</div>
        {created ? <><p><Folder aria-hidden="true" />{"docs"}</p>{DEMO_DOCUMENTS.map(document => fileButton(document, "tree"))}</> : <p>{t("No documents yet.")}</p>}
      </aside>
    </div>
    <p className="ak-conversation-footnote">{t("A scripted conversation. Requests can be copied; no AI or actual work runs here.")}</p>
    <RequestDialog open={requestIndex !== null} onOpenChange={(open) => { if (!open) setRequestIndex(null); }}
      returnFocus={requestOpener.current} title={t("Request for your AI tool")}
      text={requestIndex === null ? "" : t(INTRO_MESSAGES[requestIndex]!.text)} success="Work request copied. Paste it into your AI chat." />
  </section>;
}
