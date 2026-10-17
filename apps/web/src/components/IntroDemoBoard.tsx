import { formatUserTicketChange, ticketStatusSchema, type TicketProgress, type TicketStatus } from "@alpha-kanban/shared";
import { BookOpen } from "lucide-react";
import { StatusDot } from "../App";
import { useTranslation } from "../i18n";
import { Badge } from "./ui/badge";

type DemoTicket = { id: string; title: string; description: string; status: TicketStatus; progress: TicketProgress };

// Fictional document content stays identical on the board and in the Markdown excerpt.
export const READING_DEMO: DemoTicket[] = [
  { id: "DEMO-04", title: "검색 결과가 없을 때 안내하기", description: "검색어를 지우고 다시 시작하기", status: "TODO", progress: 0 },
  { id: "DEMO-03", title: "모바일 책 목록 검토", description: "좁은 화면의 제목과 버튼 확인", status: "READY", progress: 25 },
  { id: "DEMO-02", title: "읽은 책 필터 만들기", description: "상태와 검색어를 함께 적용하기", status: "IN_PROGRESS", progress: 50 },
  { id: "DEMO-01", title: "책 기록의 기본 항목 정하기", description: "제목 · 저자 · 읽기 상태", status: "DONE", progress: 100 },
];

export const DEMO_TICKET = READING_DEMO[2]!;
export const DEMO_MARKDOWN = [
  `### ${DEMO_TICKET.id}. ${DEMO_TICKET.title}`,
  `Status: ${DEMO_TICKET.status}`,
  `Progress: ${DEMO_TICKET.progress}%`,
  "", "사용자 지시:",
  `- 2026-10-18: ${formatUserTicketChange("READY", DEMO_TICKET.status, 25, DEMO_TICKET.progress, "")}`,
  "- 2026-10-18: [수동지시] 상태와 검색어를 함께 적용해주세요.",
].join("\n");

export function IntroDemoBoard() {
  const { t, i18n } = useTranslation();
  return <figure className="ak-intro-demo" aria-label={t("Example project board")}>
    <header className="ak-intro-demo-heading">
      <div><BookOpen aria-hidden="true" /><h3>{"책갈피"}</h3><span>{t("Reading journal project")}</span></div>
      <Badge variant="outline">{t("Fictional project")}</Badge>
    </header>
    <div className="ak-intro-demo-toolbar"><code>{"docs/02_reading_tickets.md"}</code><span>{t("{{done}} / {{total}} tickets done", { done: READING_DEMO.filter((ticket) => ticket.status === "DONE").length, total: READING_DEMO.length })}</span></div>
    <div className="ak-intro-demo-scroll ak-scroll-area">
      <div className="ak-intro-demo-columns">
        {ticketStatusSchema.options.map((status) => {
          const tickets = READING_DEMO.filter((ticket) => ticket.status === status);
          return <section className="ak-kanban-column ak-panel-muted" key={status} data-status={status} aria-label={t("{{status}} tickets", { status: t(status) })}>
            <header className="ak-intro-demo-column-heading"><span><StatusDot status={status} /><h4>{t(status)}</h4></span><Badge variant="muted">{tickets.length}</Badge></header>
            <div className="ak-intro-demo-cards">
              {tickets.length ? tickets.map((ticket) => <article className="ak-card ak-intro-demo-card" data-ticket-id={ticket.id} key={ticket.id}>
                <Badge variant="outline">{ticket.id}</Badge>
                <h5>{ticket.title}</h5>
                <p>{ticket.description}</p>
                <div className="ak-intro-demo-progress"><span role="progressbar" aria-label={t("Progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={ticket.progress}><span style={{ width: `${ticket.progress}%` }} /></span><span>{new Intl.NumberFormat(i18n.language, { style: "percent" }).format(ticket.progress / 100)}</span></div>
              </article>) : <p className="ak-intro-demo-empty">{t("Empty")}</p>}
            </div>
          </section>;
        })}
      </div>
    </div>
    <figcaption><span>{t("Example board with fictional tickets")}</span><a className="ak-focus-ring" href="#demo-markdown">{t("View this ticket's Markdown")}</a></figcaption>
  </figure>;
}
