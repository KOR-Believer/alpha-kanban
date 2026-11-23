import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { inferMarkdownFileType, inferSequenceNumber, inferSlug } from "@alpha-kanban/shared/documents";
import { parseTicketDocument } from "@alpha-kanban/shared/ticketMarkdown";
import { parseSmokeDocument } from "@alpha-kanban/shared/smokeMarkdown";
import { revisionHeadings } from "@alpha-kanban/shared/revisionHeadings";
import { formatRevisionLink, revisionLines, type RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { MarkdownDocumentReader } from "../components/MarkdownDocumentReader";
import { SourceReader } from "../components/files/SourceReader";
import { SmokeSheetReader } from "../components/smoke/SmokeSheetReader";
import { BOARD_STATUSES, groupBoardTickets, KanbanColumn, TicketBoardGrid } from "../components/tickets/TicketBoardColumns";
import { Button } from "../components/ui/button";
import { useTranslation } from "../i18n";
import { useLinkedNavigation } from "./linkedNavigation";
import { revisionRoute } from "./revisionNavigation";

export function RevisionMarkdown({ markdown, target, scope, current, web }: {
  markdown: string; target: RevisionTarget; scope: string; current: boolean; web: boolean;
}) {
  const { t } = useTranslation(), { href } = useLinkedNavigation(), navigate = useNavigate();
  const [raw, setRaw] = useState(Boolean(target.anchor));
  const type = inferMarkdownFileType(target.path);
  const file = { id: formatRevisionLink({ ...target, anchor: undefined }) + (current ? ":working" : ""), workspaceId: scope,
    filename: target.path.split("/").at(-1)!, type, slug: inferSlug(target.path), sequenceNumber: inferSequenceNumber(target.path),
    relativePath: target.path, workspaceRelativePath: target.path };
  const outline = useMemo(() => revisionHeadings(markdown), [markdown]);
  const ids = useMemo(() => Object.fromEntries(outline.map(h => [h.line, "git-heading-" + h.anchor])), [outline]);
  const tickets = useMemo(() => type === "tickets" ? parseTicketDocument(markdown).tickets : undefined, [markdown, type]);
  const grouped = useMemo(() => tickets && groupBoardTickets(tickets), [tickets]);
  const smoke = useMemo(() => type === "smoke" || type === "smoke-run" ? parseSmokeDocument(markdown, type) : undefined, [markdown, type]);
  const lines = revisionLines(target.anchor);
  const ticketLinks = useMemo(() => {
    const anchors = new Map(outline.map(h => [h.line, h.anchor]));
    return new Map(tickets?.map(ticket => [ticket.id, revisionRoute(href, { ...target, anchor: anchors.get(ticket.range.startLine) ?? "L" + ticket.range.startLine }, web, current)]));
  }, [tickets, outline, href, target, web, current]);
  const structured = Boolean(smoke || tickets?.length);
  const showStructure = structured && !raw;
  return <>
    {structured && <div className="ak-revision-doc-modes" role="group" aria-label={t("Document view")}>
      <Button size="xs" variant={!raw ? "secondary" : "ghost"} aria-pressed={!raw} onClick={() => setRaw(false)}>{t(smoke ? "Sheet" : "Board")}</Button>
      <Button size="xs" variant={raw ? "secondary" : "ghost"} aria-pressed={raw} onClick={() => setRaw(true)}>{t("Markdown")}</Button>
    </div>}
    {target.anchor && !lines && !outline.some(h => h.anchor === target.anchor) && <p role="status" className="px-5 pt-3 text-sm">{t("The cited heading is missing from this file.")}</p>}
    {showStructure && grouped ? <div className="ak-project-board-scroll ak-scroll-area min-h-0 flex-1" data-board-scroll data-linked-document>
      <TicketBoardGrid>{BOARD_STATUSES.map(status => <KanbanColumn key={status} status={status} tickets={grouped.get(status) ?? []} file={file}
        ticketHref={id => ticketLinks.get(id)!} onTicketSelect={id => void navigate({ href: ticketLinks.get(id)!, resetScroll: false })} />)}</TicketBoardGrid>
    </div> : showStructure && smoke ? <div className="min-h-0 flex-1 overflow-hidden" data-linked-document><SmokeSheetReader document={smoke} file={file} /></div>
      : lines ? <div className="min-h-0 flex-1 overflow-hidden" data-linked-document><SourceReader text={markdown} range={lines} /></div>
      : <div className="ak-scroll-area ak-document-reader-viewport min-h-0 min-w-0 flex-1" data-linked-document>
        <MarkdownDocumentReader document={{ markdown, outline }} revisionHeadingIds={ids} fragment={target.anchor && "git-heading-" + target.anchor} file={file} />
      </div>}
  </>;
}
