import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import { useTranslation } from "./i18n";
import { LanguageSelector } from "./components/LanguageSelector";
import { PwaMenu } from "./pwa/PwaMenu";
import { SkillInstallPanel } from "./components/SkillGuide";
import { buttonVariants } from "./components/ui/button";
import { IntroDemoBoard } from "./components/IntroDemoBoard";
import { IntroConversation } from "./components/intro/IntroConversation";

export function IntroPage() {
  const { t } = useTranslation();
  const description = t("Plan with AI and see the whole picture in Kanban. The implementation-ledger skill records scope, decisions, implementation, and verification in Markdown. Follow progress and read the reasoning behind each task.");
  useEffect(() => {
    const oldTitle = document.title;
    document.title = t("Alpha Kanban | Plan with AI, review in Kanban");
    const metadata = [
      ["name", "description", description], ["property", "og:title", "Alpha Kanban"],
      ["property", "og:description", description], ["property", "og:type", "website"],
    ];
    const restore = metadata.map(([attribute, name, content]) => {
      const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
      const element = existing ?? document.createElement("meta");
      const previous = element.content;
      element.setAttribute(attribute!, name!); element.content = content!;
      if (!existing) document.head.append(element);
      return () => { if (existing) existing.content = previous; else element.remove(); };
    });
    return () => { document.title = oldTitle; restore.forEach(reset => reset()); };
  }, [description, t]);

  const actions = <div className="ak-intro-actions">
    <Link to="/" className={buttonVariants({ size: "lg" })}>{t("Start Kanban")}<ArrowUpRight aria-hidden="true" /></Link>
    <a href="#skill" className={buttonVariants({ variant: "outline", size: "lg" })}>{t("Install the skill")}<ArrowUpRight aria-hidden="true" /></a>
  </div>;
  return <div className="ak-intro-page" id="top">
    <header className="ak-intro-header"><div className="ak-intro-wrap">
      <Link to="/" className="ak-public-brand ak-focus-ring"><FolderKanban aria-hidden="true" />{t("Alpha Kanban")}</Link>
      <nav aria-label={t("Introduction navigation")}>
        <a href="#kanban" className="ak-intro-section-link ak-focus-ring">{t("Board")}</a>
        <a href="#workflow" className="ak-intro-section-link ak-focus-ring">{t("Workflow")}</a>
        <a href="#skill" className="ak-intro-section-link ak-focus-ring">{t("Skill guide")}</a>
        <LanguageSelector /><PwaMenu />
      </nav>
    </div></header>
    <main>
      <section className="ak-intro-wrap ak-intro-hero">
        <h1>{t("Alpha Kanban")}</h1><p className="ak-intro-lead">{description}</p>{actions}<IntroDemoBoard />
      </section>
      <section className="ak-intro-section" id="workflow"><div className="ak-intro-wrap">
        <p className="ak-intro-eyebrow">{t("Fictional example · Reading journal app · External AI chat")}</p>
        <h2>{t("How a conversation becomes a work record.")}</h2>
        <p>{t("Explore the idea first, turn it into documents, and work through the remaining questions together.")}</p>
        <IntroConversation />
      </div></section>
      <section className="ak-intro-section" id="skill"><div className="ak-intro-wrap"><SkillInstallPanel variant="intro" /></div></section>
      <section className="ak-intro-section"><div className="ak-intro-wrap ak-intro-boundary">
        <div><p className="ak-intro-eyebrow">{t("Continue in your project")}</p><h2>{t("Records in Markdown. The whole picture in Kanban.")}</h2></div>
        <div><h3>{t("Open a project folder and review the records")}</h3><p>{t("Open Kanban in desktop Chrome and allow access to your project folder. Your Markdown stays in that folder and is not uploaded to a server.")}</p><p>{t("Everything can be done in your AI chat. Moving tickets and recording instructions on the board are optional.")}</p><p>{t("If you save instructions here, ask your AI to reread the latest documents. Saving does not launch AI.")}</p></div>
      </div></section>
      <section className="ak-intro-wrap ak-intro-closing"><h2>{t("From an agreed plan to results you can review.")}</h2>{actions}</section>
    </main>
    <footer className="ak-intro-footer"><div className="ak-intro-wrap"><span>{"Alpha Kanban / implementation-ledger"}</span><div><a href="#updates" className="ak-focus-ring">{t("Update an existing skill")}</a><a href="https://github.com/KOR-Believer/alpha-kanban" target="_blank" rel="noreferrer" className="ak-focus-ring">{t("GitHub source")}</a></div></div></footer>
  </div>;
}
