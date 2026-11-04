import { ArrowLeft, ArrowRight, Link as LinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation, type Language } from "../i18n";
import { releaseChannel } from "../../release-channel.mjs";
import { releaseHref, releaseTitle, type ReleaseInfo, type ReleaseRecord } from "../pwa/releases";
import { NavigationLink } from "../components/NavigationLink";
import { MarkdownContent } from "../components/MarkdownContent";
import { Badge } from "../components/ui/badge";
import { buttonVariants } from "../components/ui/button";
import { docHref, publicDocuments } from "../publicDocs/catalog";
import { DocExample } from "../publicDocs/DocExample";
import type { ReleaseArticle } from "./catalog";
import "./releases.css";

export function ReleasesContent({ release, records, record, article, isList, go, tableOfContents }: {
  release: ReleaseInfo; records: ReleaseRecord[]; record?: ReleaseRecord; article?: ReleaseArticle;
  isList: boolean; go: (href: string) => void;
  tableOfContents?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language as Language;
  const channel = releaseChannel(release.channel);
  const formatDate = (date: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
  const guides = publicDocuments(channel).filter(doc => (article?.guides ?? ["updates"]).includes(doc.id));
  function heading(id: string, title: string) {
    const href = `${releaseHref(record!.id)}#${id}`;
    return <h2 id={id} tabIndex={-1}>{title}<NavigationLink className="ak-focus-ring" href={href} onNavigate={() => go(href)} aria-label={t("Link to {{heading}}", { heading: title })}><LinkIcon /></NavigationLink></h2>;
  }
  if (isList) return <>
    <div className="ak-docs-breadcrumb"><span>{t("Releases")}</span><span>/</span><span>{t(channel === "canary" ? "Canary" : "Stable")}</span></div>
    <header className="ak-docs-page-heading"><h1 id="public-docs-title" tabIndex={-1}>{t("What’s new in Alpha Kanban")}</h1><p>{t("Read what changed and what to do next, in date order.")}</p></header>
    <div className="ak-release-list">{records.map(row => <article key={row.id} className="ak-release-item">
      <time dateTime={row.date}>{formatDate(row.date)}</time>
      <div><h2><NavigationLink className="ak-focus-ring" href={releaseHref(row.id)} onNavigate={() => go(releaseHref(row.id))}>{releaseTitle(row, language)}</NavigationLink></h2>
        <p>{row.notes[language][0]}</p>
        <NavigationLink className="ak-release-read ak-focus-ring" href={releaseHref(row.id)} onNavigate={() => go(releaseHref(row.id))} aria-label={t("Read {{title}}", { title: releaseTitle(row, language) })}>{t("Read the changes")}<ArrowRight /></NavigationLink>
      </div>
    </article>)}</div>
    {!records.length ? <p className="ak-release-empty">{t("No release notes are available in this app.")}</p> : null}
  </>;
  if (!record) return <>
    <header className="ak-docs-page-heading"><h1 id="public-docs-title" tabIndex={-1}>{t("Release not found")}</h1><p>{t("Check the address or choose a release from the list. If an update is waiting, its summary is available in Update history.")}</p></header>
    <NavigationLink href="/releases" onNavigate={() => go("/releases")} className={buttonVariants({ variant: "outline" })}><ArrowLeft />{t("All releases")}</NavigationLink>
  </>;
  return <>
    <NavigationLink className="ak-release-back ak-focus-ring" href="/releases" onNavigate={() => go("/releases")}><ArrowLeft />{t("All releases")}</NavigationLink>
    <header className="ak-docs-page-heading">
      <div className="ak-release-date"><time dateTime={record.date}>{formatDate(record.date)}</time><Badge variant="muted">{channel === "canary" ? "CANARY" : t("Stable")}</Badge></div>
      <h1 id="public-docs-title" tabIndex={-1}>{releaseTitle(record, language)}</h1>
    </header>
    {tableOfContents}
    <section className="ak-docs-section">{heading("changes", t("What changed"))}
      <ul className="ak-release-notes">{record.notes[language].map((note, i) => <li key={i}>{note}</li>)}</ul>
    </section>
    {article?.sections.map(section => <section className="ak-docs-section" key={section.id}>
      {heading(section.id, section.title[language])}
      <MarkdownContent components={{ a: ({ href, children }) => <NavigationLink href={href ?? "#"} onNavigate={href?.startsWith("/docs") ? () => go(href) : undefined}>{children}</NavigationLink> }}>{section.body[language]}</MarkdownContent>
    </section>)}
    {article?.example ? <DocExample id={article.example} /> : null}
    {record.skill ? <section className="ak-docs-section">{heading("skill", t("Skill updates"))}
      <ul className="ak-release-notes">{record.skill.notes[language].map((note, i) => <li key={i}>{note}</li>)}</ul>
    </section> : null}
    <section className="ak-docs-section">{heading("related", t("Related guides"))}
      <p className="ak-release-guide-lead">{t("Follow these guides for the current steps and controls.")}</p>
      <nav className="ak-release-related" aria-label={t("Related guides")}>{guides.map(doc => <NavigationLink className="ak-focus-ring" key={doc.id} href={docHref(doc.id)} onNavigate={() => go(docHref(doc.id))}>{doc.title[language]}<ArrowRight /></NavigationLink>)}</nav>
    </section>
  </>;
}
