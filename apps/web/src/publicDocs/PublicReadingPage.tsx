import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Copy, Link as LinkIcon, Menu, Search } from "lucide-react";
import { appBrand, brandedTitle } from "../brand";
import { useTranslation, type Language } from "../i18n";
import { SiteHeader, useSiteHeaderSize } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { NavigationLink } from "../components/NavigationLink";
import { MarkdownContent } from "../components/MarkdownContent";
import { SkillInstallPanel } from "../components/SkillGuide";
import { SkillUpdatesButton } from "../skills/SkillUpdates";
import { Button, buttonVariants } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { docHref, documentId, groups, publicDocuments } from "./catalog";
import { DocsSearch } from "./DocsSearch";
import { DocExample, exampleAfter } from "./DocExample";
import skillComparisonKo from "./assets/skill-comparison-ko.png";
import skillComparisonEn from "./assets/skill-comparison-en.png";
import { releaseTitle } from "../pwa/releases";
import { publicReleases, releaseArticle, releasePathId } from "../publicReleases/catalog";
import { ReleasesContent } from "../publicReleases/ReleasesContent";
import { TourButton, useScreenTour } from "../onboarding/ScreenTour";
import "./docs.css";

const RUNNING_RELEASE = __APP_RELEASE__;

function CopyCode({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<"copied" | "selected" | undefined>();
  const pre = useRef<HTMLPreElement>(null);
  return <div className="ak-docs-code"><div className="ak-docs-code-toolbar"><Button size="sm" variant="ghost" onClick={async () => {
    try { await navigator.clipboard.writeText(pre.current?.textContent?.replace(/\n$/, "") ?? ""); setResult("copied"); }
    catch { if (pre.current) { const range = document.createRange(); range.selectNodeContents(pre.current); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); setResult("selected"); } }
  }}>{result === "copied" ? <Check /> : <Copy />}{t("Copy")}</Button>
    <span role="status">{result ? t(result === "copied" ? "Copied." : "Text selected. Copy it manually.") : null}</span></div>
    <pre ref={pre} tabIndex={0}>{children}</pre></div>;
}

export function PublicReadingPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language as Language;
  const location = useLocation();
  const router = useRouter();
  const documents = useMemo(() => publicDocuments(appBrand.channel), []);
  const isReleases = location.pathname === "/releases" || location.pathname.startsWith("/releases/");
  const releaseId = isReleases ? releasePathId(location.pathname) : null;
  const records = useMemo(() => publicReleases(RUNNING_RELEASE), []);
  const record = records.find(item => item.id === releaseId);
  const article = record ? releaseArticle(RUNNING_RELEASE, record.id) : undefined;
  const id = isReleases ? `release:${releaseId ?? "list"}` : documentId(location.pathname);
  const doc = documents.find(item => item.id === id);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const tour = useScreenTour(isReleases ? "releases" : "docs", { enabled: !searchOpen && !menuOpen, eligible: false, scope: `${location.pathname}:${location.hash}` });
  const [activeSection, setActiveSection] = useState("");
  const main = useRef<HTMLElement>(null);
  const { header, headerHeight } = useSiteHeaderSize();
  const focusTarget = useRef<HTMLElement | null>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuNavigating = useRef(false);
  const title = isReleases ? (releaseId === null ? t("What’s new in Alpha Kanban") : record ? releaseTitle(record, language) : t("Release not found")) : doc?.title[language] ?? t("Guide not found");
  useEffect(() => { const previous = document.title; document.title = brandedTitle(`${title} · Alpha Kanban`); return () => { document.title = previous; }; }, [title]);
  function showLocation() {
    let anchor = "";
    try { anchor = decodeURIComponent(location.hash.replace(/^#/, "")); } catch { /* Invalid anchors show the article's start. */ }
    const target = anchor ? document.getElementById(anchor) : null;
    if (target && main.current?.contains(target)) { target.scrollIntoView({ block: "start" }); target.focus({ preventScroll: true }); }
    else { window.scrollTo(0, 0); document.getElementById("public-docs-title")?.focus({ preventScroll: true }); }
  }
  useEffect(() => { const frame = requestAnimationFrame(showLocation); return () => cancelAnimationFrame(frame); }, [id, location.hash]);
  useEffect(() => {
    const headings = [...(main.current?.querySelectorAll<HTMLElement>("h2[id]") ?? [])];
    if (!headings.length) { setActiveSection(""); return; }
    let frame = 0;
    function update() {
      frame = 0;
      const edge = Number.parseFloat(getComputedStyle(headings[0]!).scrollMarginTop) || headerHeight;
      const atEnd = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const current = atEnd ? headings.at(-1) : headings.filter(heading => heading.getBoundingClientRect().top <= edge + 1).at(-1) ?? headings[0];
      setActiveSection(current!.id);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [id, headerHeight]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.isComposing && !document.querySelector('[role="dialog"]')) {
        event.preventDefault(); focusTarget.current = document.activeElement as HTMLElement; setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", shortcut); return () => document.removeEventListener("keydown", shortcut);
  }, []);
  function go(href: string) {
    if (menuOpen) menuNavigating.current = true;
    setMenuOpen(false); setSearchOpen(false);
    router.history.push(href);
    if (href === location.href) requestAnimationFrame(showLocation);
  }
  function nav() {
    return groups.map((group, groupIndex) => {
      const items = documents.filter(item => item.group === groupIndex);
      return items.length ? <section key={groupIndex}><h2>{group[language]}</h2><ul>{items.map(item => <li key={item.id}>
        <NavigationLink href={docHref(item.id)} onNavigate={() => go(docHref(item.id))} aria-current={item.id === id ? "page" : undefined} className="ak-focus-ring">{item.title[language]}</NavigationLink>
      </li>)}</ul></section> : null;
    });
  }
  const releaseHeadings = record ? [
    { id: "changes", title: t("What changed") },
    ...(article?.sections.map(section => ({ id: section.id, title: section.title[language] })) ?? []),
    ...(article?.example ? [{ id: "visual-guide", title: t("Interactive example") }] : []),
    ...(record.skill ? [{ id: "skill", title: t("Skill updates") }] : []),
    { id: "related", title: t("Related guides") },
  ] : [];
  const headings = isReleases ? releaseHeadings : doc?.sections.flatMap(section => [{ id: section.id, title: section.title[language] }, ...(exampleAfter[id] === section.id ? [{ id: "visual-guide", title: t("Interactive example") }] : [])]) ?? [];
  function toc() { return <nav aria-label={t("On this page")}>{headings.map(heading => <NavigationLink key={heading.id} href={`${location.pathname}#${heading.id}`} onNavigate={() => go(`${location.pathname}#${heading.id}`)} className="ak-focus-ring" aria-current={heading.id === activeSection ? "location" : undefined}>{heading.title}</NavigationLink>)}</nav>; }
  const index = documents.findIndex(item => item.id === id), previous = documents[index - 1], next = documents[index + 1];
  return <div className="ak-public-docs" style={{ "--ak-docs-header-height": `${headerHeight}px` } as CSSProperties}>
    <a className="ak-docs-skip ak-focus-ring" href="#public-docs-title">{t("Skip to content")}</a>
    <SiteHeader ref={header} page={isReleases ? "/releases" : "/docs"} className="ak-docs-header" onNavigate={go} tools={<>
      <TourButton tour={tour} />
      <Button data-tour="docs-search" size="sm" variant="outline" title={t("Search documentation")} aria-label={t("Search documentation")} onClick={event => { focusTarget.current = event.currentTarget; setSearchOpen(true); }}><Search /><span className="ak-toolbar-label">{t("Search documentation")}</span><kbd className="ak-docs-shortcut" aria-hidden="true">{"⌘/Ctrl K"}</kbd></Button>
    </>} />
    <div className="ak-docs-layout">
      <aside data-tour="docs-navigation" className="ak-docs-sidebar ak-scroll-area"><nav aria-label={t("Documentation")}>{nav()}</nav></aside>
      <main ref={main} className="ak-docs-main">
        <div className="ak-docs-mobile-nav"><Button data-tour="docs-navigation" ref={menuTrigger} variant="ghost" size="sm" onClick={() => { menuNavigating.current = false; setMenuOpen(true); }}><Menu />{t("Browse documentation")}</Button></div>
        <article key={id} className="ak-docs-article">
          {isReleases ? <ReleasesContent release={RUNNING_RELEASE} records={records} record={record} article={article} isList={releaseId === null} go={go} tableOfContents={<details className="ak-docs-mobile-toc"><summary data-tour="docs-toc">{t("On this page")}</summary>{toc()}</details>} /> : <>
          <div className="ak-docs-breadcrumb"><NavigationLink href="/docs" onNavigate={() => go("/docs")}>{t("Documentation")}</NavigationLink><span>/</span><span>{doc ? groups[doc.group]![language] : t("Guide not found")}</span></div>
          <header className="ak-docs-page-heading"><h1 id="public-docs-title" tabIndex={-1}>{title}</h1><p>{doc?.lead[language] ?? t("Check the address or choose a guide from the navigation.")}</p></header>
          {doc ? <>
            <details className="ak-docs-mobile-toc"><summary data-tour="docs-toc">{t("On this page")}</summary>{toc()}</details>
            {doc.sections.map(section => <div key={section.id}>
              <section className="ak-docs-section" aria-labelledby={section.id}><h2 id={section.id} tabIndex={-1}>
                {section.title[language]}<NavigationLink href={docHref(id, section.id)} onNavigate={() => go(docHref(id, section.id))} aria-label={t("Link to {{heading}}", { heading: section.title[language] })} className="ak-focus-ring"><LinkIcon /></NavigationLink>
              </h2>
                <MarkdownContent components={{ pre: ({ children }) => <CopyCode>{children}</CopyCode>, a: ({ href, children }) => href?.startsWith("/docs") ? <NavigationLink href={href} onNavigate={() => go(href)}>{children}</NavigationLink> : <a href={href}>{children}</a> }}>{section.body[language]}</MarkdownContent>
                {id === "install" && section.id === "request" ? <SkillInstallPanel /> : null}
                {id === "updates" && section.id === "skill" ? <SkillUpdatesButton /> : null}
                {id === "updates" && section.id === "skill" && appBrand.channel === "stable" ? <figure className="ak-docs-capture">
                  <a href={language === "ko" ? skillComparisonKo : skillComparisonEn} target="_blank" rel="noreferrer" aria-label={t("Open the example screenshot at full size (new tab)")}>
                    <img src={language === "ko" ? skillComparisonKo : skillComparisonEn} width={960} height={760} loading="lazy" decoding="async" alt={t("Skill updates comparing an installed release with the provided skill, with compatibility review required.")} />
                  </a>
                  <figcaption>{t("Comparison example. When compatibility needs review, changes are shown without an apply action.")}</figcaption>
                </figure> : null}
              </section>
              {exampleAfter[id] === section.id ? <DocExample id={id} /> : null}
            </div>)}
            <nav data-tour="docs-next" className="ak-docs-next" aria-label={t("Previous and next guides")}>
              {previous ? <NavigationLink href={docHref(previous.id)} onNavigate={() => go(docHref(previous.id))}><ArrowLeft /><span><small>{t("Previous guide")}</small><strong>{previous.title[language]}</strong></span></NavigationLink> : <span />}
              {next ? <NavigationLink href={docHref(next.id)} onNavigate={() => go(docHref(next.id))}><span><small>{t("Next guide")}</small><strong>{next.title[language]}</strong></span><ArrowRight /></NavigationLink> : null}
            </nav>
          </> : <NavigationLink href="/docs" onNavigate={() => go("/docs")} className={buttonVariants({ variant: "outline" })}>{t("Browse documentation")}</NavigationLink>}
          </>}
          <SiteFooter className="ak-docs-footer" />
        </article>
      </main>
      <aside data-tour={headings.length ? "docs-toc" : undefined} className="ak-docs-toc ak-scroll-area">{headings.length ? <><h2>{t("On this page")}</h2>{toc()}</> : null}</aside>
    </div>
    <DocsSearch open={searchOpen} onOpenChange={setSearchOpen} returnFocus={() => focusTarget.current?.focus({ preventScroll: true })} documents={documents} onNavigate={go} />
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}><DialogContent className="ak-docs-menu" aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); if (!menuNavigating.current) menuTrigger.current?.focus({ preventScroll: true }); }}>
      <DialogHeader><DialogTitle>{t("Browse documentation")}</DialogTitle></DialogHeader><DialogBody><nav className="ak-docs-sidebar" aria-label={t("Documentation")}>{nav()}</nav></DialogBody>
    </DialogContent></Dialog>
  </div>;
}
