import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import { useTranslation } from "./i18n";
import { LanguageSelector } from "./components/LanguageSelector";
import { PwaMenu } from "./pwa/PwaMenu";
import { DocumentWorkflow, SkillInstallPanel } from "./components/SkillGuide";
import { buttonVariants } from "./components/ui/button";
import { DEMO_MARKDOWN, IntroDemoBoard } from "./components/IntroDemoBoard";

export function IntroPage() {
  const { t } = useTranslation();
  const description = t("Turn plans with AI into a shared Kanban. Continue working in your AI chat and see the plan and progress in one place.");
  useEffect(() => {
    const oldTitle = document.title;
    document.title = t("Alpha Kanban | People and AI, on the same Markdown");
    const metadata = [
      ["name", "description", description],
      ["property", "og:title", "Alpha Kanban"],
      ["property", "og:description", description],
      ["property", "og:type", "website"],
    ];
    const restore = metadata.map(([attribute, name, content]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
      const element = existing ?? document.createElement("meta");
      const previous = element.content;
      element.setAttribute(attribute!, name!); element.content = content!;
      if (!existing) document.head.append(element);
      return () => { if (existing) existing.content = previous; else element.remove(); };
    });
    return () => { document.title = oldTitle; restore.forEach((reset) => reset()); };
  }, [description, t]);
  return <div className="ak-intro-page">
    <header className="ak-intro-header"><div className="ak-intro-wrap">
      <Link to="/" className="ak-public-brand ak-focus-ring"><FolderKanban aria-hidden="true" />{t("Alpha Kanban")}</Link>
      <nav aria-label={t("Introduction navigation")}>
        <a href="#workflow" className="ak-intro-section-link ak-focus-ring">{t("Workflow")}</a>
        <a href="#skill" className="ak-intro-section-link ak-focus-ring">{t("Skill guide")}</a>
        <LanguageSelector />
        <PwaMenu />
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm", className: "hidden min-[701px]:inline-flex" })}>{t("Open project")}<ArrowUpRight aria-hidden="true" /></Link>
      </nav>
    </div></header>
    <main>
      <section className="ak-intro-wrap ak-intro-hero">
        <p className="ak-intro-eyebrow">{t("People and AI, on the same Markdown")}</p>
        <h1>{t("Alpha Kanban")}</h1>
        <p className="ak-intro-lead">{t("Turn plans with AI into a shared Kanban.")}<br />{t("Continue in your AI chat. Keep the plan and progress in view.")}</p>
        <div className="ak-intro-actions"><Link to="/" className={buttonVariants()}>{t("Get started")}<ArrowUpRight aria-hidden="true" /></Link><span>{t("Explore first. No folder connection needed.")}</span></div>
        <IntroDemoBoard />
      </section>
      <section className="ak-intro-section" id="workflow"><div className="ak-intro-wrap">
        <p className="ak-intro-eyebrow">01 / {t("Workflow")}</p>
        <h2>{t("Start with a conversation. Continue in documents.")}</h2>
        <DocumentWorkflow />
        <div className="ak-intro-document" id="demo-markdown"><div><h3>{t("The next step keeps its context.")}</h3><p>{t("This is DEMO-02 from the board above, with an optional instruction recorded in Markdown.")}</p><code>{"docs/01_reading_plan.md\ndocs/02_reading_tickets.md"}</code></div><pre><code>{DEMO_MARKDOWN}</code></pre></div>
      </div></section>
      <section className="ak-intro-section"><div className="ak-intro-wrap ak-intro-boundary"><div><p className="ak-intro-eyebrow">02 / {t("Source and boundaries")}</p><h2>{t("Files in your folder. Decisions in your hands.")}</h2><p>{t("Alpha Kanban helps people and AI work from the same documents. Conversations and implementation requests stay in your external AI tool.")}</p></div><ul>
        <li><h3>{t("Local Markdown is the source")}</h3><p>{t("Your documents stay in your folder. They are not uploaded to a server.")}</p></li>
        <li><h3>{t("Explicit permission to access folders")}</h3><p>{t("Connect folders you select and explicitly allow access to. Local-folder support targets desktop Chrome.")}</p></li>
        <li><h3>{t("Your AI chat stays your workspace")}</h3><p>{t("Everything can be done in your AI chat. Moving tickets and recording instructions on the board are optional.")}</p></li>
      </ul></div></section>
      <section className="ak-intro-section" id="skill"><div className="ak-intro-wrap"><p className="ak-intro-eyebrow">03 / {t("Start with a skill")}</p><h2>{t("Need your first documents?")}</h2><p>{t("Start by giving Codex the implementation-ledger skill, then discuss what you want to build and draft a plan together.")}</p><SkillInstallPanel /></div></section>
      <section className="ak-intro-wrap ak-intro-closing"><div><h2>{t("Continue from the same documents.")}</h2><p>{t("Open a project and work forward from your plan.")}</p></div><Link to="/" className={buttonVariants({ variant: "outline" })}>{t("Go to project launcher")}<ArrowUpRight aria-hidden="true" /></Link></section>
    </main>
    <footer className="ak-intro-footer"><div className="ak-intro-wrap"><span>{t("Alpha Kanban")}</span><span>{t("Local Markdown stays the source")}</span></div></footer>
  </div>;
}
