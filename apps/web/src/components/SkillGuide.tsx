import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Copy, Download } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button, buttonVariants } from "./ui/button";
import { RequestDialog } from "./intro/RequestDialog";

export const SKILL_SOURCE_URL = "https://github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger";
export const INSTALL_REQUEST = "Check the bundled implementation-ledger skill at {{url}}. Verify its source and available version, including the entire skill folder and its references. Compare it with my existing skill and preserve personal changes. Explain the installation method and changes first; ask before overwriting anything. Do not invent release tags or download URLs.";
export const INTRO_INSTALL_REQUEST = "Use $skill-installer to install implementation-ledger from this GitHub path:\n\n{{url}}\n\nInstall the entire folder, including references, assets, scripts, and agents, not only SKILL.md. Find the personal skill location recognized by my Codex environment. If it is already installed, compare the changes first. Back up the entire installation, preserve my customizations, and ask before overwriting. Report the location and whether Codex recognizes it. Do not change project documents or code.";
export const UPDATE_REQUEST = "Find the location and source of my installed implementation-ledger and compare it with this official source:\n\n{{url}}\n\nCompare the entire folder, including SKILL.md, references, assets, scripts, and agents. Explain the changes and any conflicts with personal customizations first. Back up the entire installation, preserve my edits, and ask before overwriting. Ask me to resolve conflicts that need a choice. Do not invent versions or release tags. Do not change project documents or code. Report the installation location, applied source, main changes, and whether Codex recognizes it.";

const workflow = [
  ["Draft a plan with your AI", "Discuss what you want to build with your AI and use implementation-ledger to draft a plan."],
  ["Discuss relevant open questions", "Read the plan and discuss open questions that affect this implementation. Questions about later work can stay open."],
  ["Create or update tickets", "Create or update tickets with the agreed scope and completion criteria. Add an inventory when needed."],
  ["Implement and review", "Ask your AI to implement the latest tickets, then connect the project folder to review progress. Moving tickets and leaving instructions are optional."],
] as const;

export function DocumentWorkflow() {
  const { t } = useTranslation();
  return <ol className="ak-document-workflow">
    {workflow.map(([title, description], index) => <li key={title}>
      <span className="ak-workflow-number" aria-hidden="true">0{index + 1}</span>
      <div><h3>{t(title)}</h3><p>{t(description)}</p></div>
    </li>)}
  </ol>;
}

export function SkillInstallDialog({ mode = "install", expanded = false }: { mode?: "install" | "update"; expanded?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const text = t(mode === "update" ? UPDATE_REQUEST : expanded ? INTRO_INSTALL_REQUEST : INSTALL_REQUEST, { url: SKILL_SOURCE_URL });
  return <>
    <Button ref={opener} variant="outline" size="sm" onClick={() => setOpen(true)}><Copy aria-hidden="true" />{mode === "update" ? t("Review and copy update request") : t("Review and copy install request")}</Button>
    <RequestDialog open={open} onOpenChange={setOpen} returnFocus={opener.current} text={text}
      title={mode === "update" ? t("Update request for Codex") : t("Installation request for Codex")}
      success={mode === "update" ? "Update request copied. Paste it into Codex to compare your installation." : expanded ? "Installation request copied. Paste it into Codex to install the skill." : "Copied. Paste this request into your AI tool."}>
          <details className="mt-4 text-sm">
            <summary className="ak-focus-ring cursor-pointer">{t("Manual installation")}</summary>
            <ol className="mt-3 list-decimal space-y-3 pl-5">
              <li>{t("Before replacing an existing implementation-ledger skill, back it up and compare the changes.")}</li>
              <li>{t("Place the complete extracted folder at this location:")}<code className="block break-all">{"~/.codex/skills/implementation-ledger/"}</code><p className="mt-1 text-muted-foreground">{t("If {{variable}} is set, use {{path}} instead.", { variable: "CODEX_HOME", path: "$CODEX_HOME/skills/implementation-ledger/" })}</p></li>
              <li>{t("Reopen Codex and invoke {{skill}} to discuss what you want to build and draft a plan.", { skill: "$implementation-ledger" })}</li>
              <li>{t("Before requesting implementation, discuss open questions that affect the work and create or update the tickets. Connect the project folder to review progress.")}</li>
            </ol>
            <a className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-3" })} href="/downloads/implementation-ledger.zip" download><Download aria-hidden="true" />{t("Download Codex skill")}</a>
          </details>
    </RequestDialog>
  </>;
}

export function SkillInstallPanel({ variant = "compact" }: { variant?: "compact" | "intro" }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"install" | "update">(() => variant === "intro" && window.location.hash === "#updates" ? "update" : "install");
  useEffect(() => {
    if (variant !== "intro") return;
    function syncHash() {
      if (window.location.hash === "#updates") setMode("update");
      if (window.location.hash === "#skill") setMode("install");
    }
    syncHash(); window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [variant]);
  function selectMode(next: "install" | "update") {
    setMode(next);
    const hash = next === "update" ? "#updates" : "#skill";
    if (window.location.hash !== hash) window.location.hash = hash;
  }
  if (variant === "intro") return <div className="ak-intro-skill" id="updates">
    <div><p className="ak-intro-eyebrow">{t("Skill installation and updates")}</p><h2>{"implementation-ledger"}</h2><p>{t("Give your AI a shared structure for scope, decisions, implementation results, and verification in Markdown.")}</p><p>{t("Web and PWA updates do not update your personal skill. Ask Codex to check your installation.")}</p></div>
    <div><div className="ak-intro-skill-modes" role="group" aria-label={t("Installation mode")}>
      <Button variant={mode === "install" ? "secondary" : "ghost"} aria-pressed={mode === "install"} onClick={() => selectMode("install")}>{t("First installation")}</Button>
      <Button variant={mode === "update" ? "secondary" : "ghost"} aria-pressed={mode === "update"} onClick={() => selectMode("update")}>{t("Update an existing skill")}</Button>
    </div><h3>{mode === "install" ? t("Install the complete folder from the official source") : t("Compare before updating your skill")}</h3>
      <a href={SKILL_SOURCE_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>{"KOR-Believer / alpha-kanban"}<ArrowUpRight aria-hidden="true" /></a>
      <code>{"master / skills / implementation-ledger"}</code>
      <p>{mode === "install" ? t("Include reference files and templates. If the skill already exists, compare it, back it up, preserve personal changes, and confirm before replacing it.") : t("Compare the whole installed folder with the official source. Review the changes and conflicts, keep a full backup, and confirm before replacing anything.")}</p>
      <SkillInstallDialog mode={mode} expanded />
      <p className="ak-intro-skill-caption">{t("Copy the request into Codex, where your local files can be accessed. Internet access is needed to download or update the skill from GitHub.")}</p>
    </div>
  </div>;
  return <div data-tour="skill-install" className="ak-skill-install">
    <div><h3>{"implementation-ledger"}</h3><p>{t("Give your AI a shared structure for writing plans and tickets.")}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <SkillInstallDialog />
      <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={SKILL_SOURCE_URL} target="_blank" rel="noreferrer">{t("View skill source")}<ArrowUpRight aria-hidden="true" /></a>
    </div>
  </div>;
}

export function SkillGuide() {
  const { t } = useTranslation();
  return <section className="ak-start-guide" aria-label={t("Work with your AI coding tool")}>
    <div data-tour="ai-workflow" className="ak-start-section-heading"><div><h2>{t("Keep work moving with AI and documents")}</h2><p>{t("Work in your AI chat. See the plan and progress here.")}</p></div><Link to="/intro" className={buttonVariants({ variant: "ghost", size: "sm" })}><BookOpen aria-hidden="true" />{t("How it works")}</Link></div>
    <DocumentWorkflow />
    <SkillInstallPanel />
  </section>;
}
