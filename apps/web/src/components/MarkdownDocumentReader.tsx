import { NavigationLink } from "./NavigationLink";
import { buildAppRoute } from "../appRoute";
import { memo, useEffect, useMemo, useRef, type RefObject } from "react";
import { SearchHighlight } from "./tickets/TicketSearch";
import { normalizeTicketQuery } from "../ticketSearch";
import { sourceOffset } from "../documentSearch";
import { documentPresentation } from "@alpha-kanban/shared/documentPresentation";
import { MarkdownContent } from "./MarkdownContent";
import { Archive, BookOpen, Check, FileText, ListChecks } from "lucide-react";
import type { DocumentSetSummary, MarkdownDocumentResponse, MarkdownFileSummary, MarkdownFileType } from "@alpha-kanban/shared";
import { t, useTranslation } from "../i18n";
import { Badge } from "./ui/badge";
import { localLinkUrlTransform, useBrowserMarkdownComponents } from "../browser/MarkdownResources";
import type { LinkContext } from "../browser/linkMappings";

const MARKDOWN_HEADING_HIGHLIGHT_CLASS = "ak-markdown-heading-highlight";
export type ReaderFile = Pick<MarkdownFileSummary, "id" | "workspaceId" | "type" | "filename" | "slug" | "sequenceNumber" | "workspaceRelativePath" | "relativePath">;

export function MarkdownDocumentReader({ document, documentSet, file, onFileSelect, fileHref, linkContext, bodyRef, titleRef, headingPrefix, searchQuery = "" }: {
  document: Pick<MarkdownDocumentResponse, "markdown" | "outline">;
  documentSet?: DocumentSetSummary;
  file: ReaderFile;
  onFileSelect?: (id: string) => void;
  fileHref?: (id: string) => string;
  linkContext?: LinkContext;
  bodyRef?: RefObject<HTMLDivElement | null>;
  titleRef?: RefObject<HTMLHeadingElement | null>;
  headingPrefix?: string;
  searchQuery?: string;
}) {
  const { t } = useTranslation();
  const headingIdsByLine = useMemo(() => createHeadingIdsByLine(document.outline, headingPrefix), [document.outline, headingPrefix]);
  const presentation = useMemo(() => documentPresentation(document.markdown), [document.markdown]);
  const ownBodyRef = useRef<HTMLDivElement>(null);
  const readerRef = bodyRef ?? ownBodyRef;
  const match = useMemo(() => {
    const query = normalizeTicketQuery(searchQuery);
    const folded = document.markdown.toLowerCase();
    const offset = query ? sourceOffset(document.markdown, folded.indexOf(query), folded.length) : -1;
    if (offset < 0) return undefined;
    const start = document.markdown.lastIndexOf("\n", offset) + 1;
    const end = document.markdown.indexOf("\n", offset + query.length);
    return { line: document.markdown.slice(0, offset).split("\n").length,
      excerpt: document.markdown.slice(Math.max(start, offset - 40), Math.min(end < 0 ? document.markdown.length : end, offset + query.length + 100)) };
  }, [document.markdown, searchQuery]);
  useEffect(() => {
    readerRef.current?.querySelector<HTMLElement>("[data-search-hit]")?.scrollIntoView({ block: "center" });
  }, [file.id, document.markdown, searchQuery, readerRef]);

  return (
    <div className="grid h-full min-h-0 min-w-[840px] grid-cols-[260px_minmax(0,1fr)] items-stretch gap-4 max-[960px]:h-auto max-[960px]:min-w-0 max-[960px]:grid-cols-1">
      <aside className="ak-panel flex min-h-0 flex-col overflow-hidden max-[960px]:max-h-[40dvh]">
        <div className="shrink-0 border-b border-[var(--ak-hairline)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentTypeBadge type={file.type} />
            {file.sequenceNumber !== undefined ? (
              <Badge variant="muted">#{file.sequenceNumber}</Badge>
            ) : null}
          </div>
          <h3 className="ak-title mt-2 truncate text-sm" title={documentSet?.label ?? file.slug}>
            {documentSet?.label ?? file.slug}
          </h3>
          <p className="ak-body-muted mt-1 break-all text-xs">{file.workspaceRelativePath}</p>
        </div>

        <div className="ak-scroll-area grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
          <section className="grid gap-2">
            <h4 className="ak-muted-label">{t("Linked docs")}</h4>
            <div className="grid gap-1">
              {(documentSet?.documents ?? [file]).map((linkedFile) => (
                <NavigationLink href={fileHref?.(linkedFile.id) ?? buildAppRoute({ workspaceId: file.workspaceId, filePath: linkedFile.id })}
                  className={[
                    "ak-row flex min-w-0 items-center justify-between gap-2 px-2 py-1.5 text-left text-xs transition-colors",
                    linkedFile.id === file.id ? "ak-row-active" : "",
                  ].join(" ")}
                  key={linkedFile.id}
                  disabled={!onFileSelect}
                  onNavigate={() => onFileSelect?.(linkedFile.id)}
                  title={linkedFile.relativePath}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {(() => {
                      const Icon = documentTypeIcon(linkedFile.type);
                      return <Icon className="size-3 shrink-0 text-[var(--ak-ink-muted)]" aria-hidden="true" />;
                    })()}
                    <span className="truncate">{documentTypeLabel(linkedFile.type)}</span>
                  </span>
                  {linkedFile.id === file.id ? <Check className="size-3" aria-hidden="true" /> : null}
                </NavigationLink>
              ))}
            </div>
          </section>

          {documentSet?.ticketProgress?.totalTickets !== undefined ? (
            <section className="grid gap-2">
              <h4 className="ak-muted-label">{t("Ticket progress")}</h4>
              <div className="ak-panel-muted px-3 py-2 text-sm">
                {t("{{done}} / {{total}} tickets done", { done: documentSet.ticketProgress.doneTickets ?? 0, total: documentSet.ticketProgress.totalTickets })}
              </div>
            </section>
          ) : null}

          <section className="grid gap-2">
            <h4 className="ak-muted-label">{t("Outline")}</h4>
            {document.outline.length > 0 ? (
              <ol className="grid gap-1 text-xs leading-5 text-[var(--ak-ink-muted)]">
                {document.outline.map((heading) => {
                  const headingId = headingIdsByLine[heading.line];
                  return (
                  <li
                    className="min-w-0"
                    key={`${heading.line}-${heading.title}`}
                    style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 8}px` }}
                  >
                    <button
                      className="ak-focus-ring grid w-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-2 rounded-[var(--ak-radius-sm)] px-1 py-1 text-left transition-colors hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]"
                      onClick={() => scrollToMarkdownHeading(headingId)}
                      title={heading.title}
                      type="button"
                    >
                      <span className="text-[var(--ak-ink-faint)]">{t("Line {{line}}", { line: heading.line })}</span>
                      <span className="truncate">{heading.title}</span>
                    </button>
                  </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-xs text-[var(--ak-ink-faint)]">{t("No headings")}</p>
            )}
          </section>
        </div>
      </aside>

      <article className="ak-panel flex min-h-0 min-w-0 flex-col overflow-hidden max-[960px]:h-[calc(100dvh-10rem)]">
        <div className="shrink-0 border-b border-[var(--ak-hairline)] bg-[var(--ak-surface)] px-5 py-4">
          <p className="ak-muted-label">{t("{{type}} reader", { type: documentTypeLabel(file.type) })}</p>
          <h3 ref={titleRef} tabIndex={-1} className="ak-title mt-1 break-words text-lg outline-none">
            {document.outline[0]?.title ?? file.filename}
          </h3>
          {presentation.fields.length ? <dl className="ak-document-properties" aria-label={t("Document properties")}>
            {presentation.fields.map((field) => <div key={field.name}>
              <dt>{t(field.name === "Owner" ? "Recorded owner" : "Document ID")}</dt>
              <dd>{field.name === "Owner" ? <Badge variant="muted">{field.value}</Badge> : <code>{field.value}</code>}</dd>
            </div>)}
          </dl> : null}
        </div>
        {match ? <div className="shrink-0 border-b border-border px-5 py-2 text-xs text-muted-foreground" role="status">
          <span className="font-medium">{t("Line {{line}}", { line: match.line })} · </span><SearchHighlight text={match.excerpt} query={searchQuery} />
        </div> : null}
        <div ref={readerRef} className="ak-scroll-area min-h-0 flex-1 overflow-auto px-5 py-4">
          <MarkdownMessage content={presentation.markdown} headingIdsByLine={headingIdsByLine} file={linkContext ? undefined : file} context={linkContext} searchLine={match?.line} />
        </div>
      </article>
    </div>
  );
}

const MarkdownMessage = memo(function MarkdownMessage({
  content,
  headingIdsByLine,
  file,
  context,
  searchLine,
}: {
  content: string;
  headingIdsByLine?: Record<number, string>;
  file?: Pick<MarkdownFileSummary, "id" | "workspaceId">;
  context?: LinkContext;
  searchLine?: number;
}) {
  const resources = useBrowserMarkdownComponents(file, context);
  const remarkPlugins = [...(headingIdsByLine ? [remarkHeadingIds(headingIdsByLine)] : []), ...(searchLine ? [remarkSearchLine(searchLine)] : [])];

  return (
    <MarkdownContent remarkPlugins={remarkPlugins} urlTransform={localLinkUrlTransform} components={resources}>{content}</MarkdownContent>
  );
});

/** Mark the source block without rewriting Markdown or changing its GFM grammar. */
function remarkSearchLine(line: number) {
  return function searchLinePlugin() {
    return function transform(tree: unknown) {
      visitMarkdownAst(tree, (node) => {
        if (!["paragraph", "heading", "code", "tableRow"].includes(String(node.type))) return;
        if ((node.position?.start?.line ?? Infinity) > line || (node.position?.end?.line ?? -1) < line) return;
        const properties = ensureRecordProperty(ensureRecordProperty(node, "data"), "hProperties");
        properties["data-search-hit"] = "true";
        properties.className = "rounded-sm bg-primary/10 ring-2 ring-primary/30";
      });
    };
  };
}

export function createHeadingIdsByLine(
  outline: MarkdownDocumentResponse["outline"], prefix = "md-heading",
): Record<number, string> {
  return Object.fromEntries(
    outline.map((heading) => [
      heading.line,
      `${prefix}-${heading.line}-${slugifyHeading(heading.title)}`,
    ]),
  );
}

function scrollToMarkdownHeading(id?: string): void {
  if (!id) {
    return;
  }

  const target = document.getElementById(id);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  const scrollContainer = target.closest(".ak-scroll-area");
  let didHighlight = false;

  const highlight = () => {
    if (didHighlight) {
      return;
    }
    didHighlight = true;
    flashMarkdownHeading(target);
  };

  if (scrollContainer && "onscrollend" in scrollContainer) {
    const fallbackTimeout = window.setTimeout(highlight, 700);
    scrollContainer.addEventListener(
      "scrollend",
      () => {
        window.clearTimeout(fallbackTimeout);
        highlight();
      },
      { once: true },
    );
    return;
  }

  window.setTimeout(highlight, 450);
}

function flashMarkdownHeading(target: HTMLElement): void {
  const existingTimeout = Number(target.dataset.akHighlightTimeout);
  if (Number.isFinite(existingTimeout) && existingTimeout > 0) {
    window.clearTimeout(existingTimeout);
  }

  target.classList.remove(MARKDOWN_HEADING_HIGHLIGHT_CLASS);
  void target.offsetWidth;
  target.classList.add(MARKDOWN_HEADING_HIGHLIGHT_CLASS);
  const timeout = window.setTimeout(() => {
    target.classList.remove(MARKDOWN_HEADING_HIGHLIGHT_CLASS);
    delete target.dataset.akHighlightTimeout;
  }, 1_200);
  target.dataset.akHighlightTimeout = String(timeout);
}

function slugifyHeading(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

function remarkHeadingIds(headingIdsByLine: Record<number, string>) {
  return function attachHeadingIds() {
    return function transformMarkdownTree(tree: unknown): void {
      visitMarkdownAst(tree, (node) => {
        if (node.type !== "heading") {
          return;
        }

        const line = node.position?.start?.line;
        const id = typeof line === "number" ? headingIdsByLine[line] : undefined;
        if (!id) {
          return;
        }

        const data = ensureRecordProperty(node, "data");
        const hProperties = ensureRecordProperty(data, "hProperties");
        hProperties.id = id;
      });
    };
  };
}

type MarkdownAstNode = Record<string, unknown> & {
  children?: unknown[];
  position?: {
    start?: {
      line?: number;
    };
    end?: { line?: number };
  };
  type?: unknown;
};

function visitMarkdownAst(
  value: unknown,
  visitor: (node: MarkdownAstNode) => void,
): void {
  if (!isRecord(value)) {
    return;
  }

  const node = value as MarkdownAstNode;
  visitor(node);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visitMarkdownAst(child, visitor);
    }
  }
}

function ensureRecordProperty(
  target: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = target[key];
  if (isRecord(current)) {
    return current;
  }

  const next: Record<string, unknown> = {};
  target[key] = next;
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function DocumentTypeBadge({ type }: { type: MarkdownFileType }) {
  useTranslation();
  return (
    <Badge variant={type === "tickets" ? "default" : "outline"}>
      {documentTypeLabel(type)}
    </Badge>
  );
}

export function documentTypeLabel(type: MarkdownFileType): string {
  return {
    inventory: t("Inventory"),
    markdown: t("Markdown"),
    plan: t("Plan"),
    tickets: t("Tickets"),
  }[type];
}

export function documentTypeIcon(type: MarkdownFileType) {
  return {
    inventory: Archive,
    markdown: FileText,
    plan: BookOpen,
    tickets: ListChecks,
  }[type];
}
