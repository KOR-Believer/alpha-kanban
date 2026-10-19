import { useState } from "react";
import { ticketStatusSchema, type TicketStatus } from "@alpha-kanban/shared";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { StatusDot } from "../App";
import { useTranslation } from "../i18n";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { READING_DEMO, demoFileName, demoTicketMarkdown } from "./intro/demo";

export function IntroDemoBoard() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<"board" | "markdown">("board");
  const [selected, setSelected] = useState<string>("READ-02");
  const [mobileStatus, setMobileStatus] = useState<TicketStatus>("IN_PROGRESS");
  const ticket = READING_DEMO.find(item => item.id === selected)!;
  return <figure className="ak-intro-demo" id="kanban" aria-label={t("Example project board")}>
    <header className="ak-intro-demo-heading">
      <div><BookOpen aria-hidden="true" /><h3>{t("Reading journal project")}</h3><Badge variant="outline">{t("Fictional project")}</Badge></div>
      <div role="group" aria-label={t("Example view")}>
        <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} aria-pressed={view === "board"} onClick={() => setView("board")}>{t("Board")}</Button>
        <Button size="sm" variant={view === "markdown" ? "secondary" : "ghost"} aria-pressed={view === "markdown"} onClick={() => setView("markdown")}>{"Markdown"}</Button>
      </div>
    </header>
    <div className="ak-intro-demo-toolbar"><code>{`docs/${demoFileName("tickets")}`}</code><span>{t("{{done}} / {{total}} tickets done", { done: READING_DEMO.filter(item => item.status === "DONE").length, total: READING_DEMO.length })}</span></div>
    {view === "board" ? <>
      <div className="ak-intro-demo-status"><Select value={mobileStatus} onValueChange={value => setMobileStatus(value as TicketStatus)}>
        <SelectTrigger size="field" aria-label={t("View by status")}><SelectValue /></SelectTrigger>
        <SelectContent>{ticketStatusSchema.options.map(status => <SelectItem value={status} key={status}>{t(status)}{` (${READING_DEMO.filter(item => item.status === status).length})`}</SelectItem>)}</SelectContent>
      </Select></div>
      <div className="ak-intro-demo-columns">
        {ticketStatusSchema.options.map(status => {
          const tickets = READING_DEMO.filter(item => item.status === status);
          return <section className="ak-kanban-column ak-panel-muted" data-populated={tickets.length > 0} data-mobile-active={mobileStatus === status} key={status} data-status={status} aria-label={t("{{status}} tickets", { status: t(status) })}>
            <header className="ak-intro-demo-column-heading"><span><StatusDot status={status} /><h4>{t(status)}</h4></span><Badge variant="muted">{tickets.length}</Badge></header>
            <div className="ak-intro-demo-cards">{tickets.length ? tickets.map(item => <Button variant="outline" className="ak-intro-demo-card h-auto w-full items-start justify-start rounded-[var(--ak-radius-sm)] whitespace-normal text-left" data-ticket-id={item.id} key={item.id}
              aria-label={t("Read work record for {{ticket}}", { ticket: t(item.title) })} onClick={() => { setSelected(item.id); setView("markdown"); }}>
              <Badge variant="outline">{item.id}</Badge><strong>{t(item.title)}</strong><p>{t(item.scope)}</p><p className="ak-intro-demo-note">{t(item.note)}</p>
              <span className="ak-intro-demo-progress"><span role="progressbar" aria-label={t("Progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}><span style={{ width: `${item.progress}%` }} /></span><span>{new Intl.NumberFormat(i18n.language, { style: "percent" }).format(item.progress / 100)}</span></span>
              <span className="ak-intro-demo-record">{t("Read work record")}<ArrowUpRight aria-hidden="true" /></span>
            </Button>) : <p className="ak-intro-demo-empty">{t("Empty")}</p>}</div>
          </section>;
        })}
      </div>
    </> : <div className="ak-intro-demo-markdown" id="demo-markdown">
      <div role="group" aria-label={t("Example tickets")}>{READING_DEMO.map(item => <Button size="sm" variant="ghost" key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.id}</Button>)}</div>
      <pre className="ak-scroll-area" tabIndex={0}>{demoTicketMarkdown(ticket, t)}</pre>
    </div>}
    <figcaption>{t("This is the later state of the project in the conversation below. Select a card to read its scope, decisions, and remaining checks.")}</figcaption>
  </figure>;
}
