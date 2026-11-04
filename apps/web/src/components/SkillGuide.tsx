import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Copy } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button, buttonVariants } from "./ui/button";
import { RequestDialog } from "./intro/RequestDialog";
import { SkillUpdatesButton } from "../skills/SkillUpdates";
import { SkillArchiveDownload } from "../skills/SkillArchiveDownload";
import { skillAgentRequest, skillChannelLabel, skillDistribution } from "../skills/distribution";

const distribution = skillDistribution();

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
  const text = skillAgentRequest(t, mode);
  return <>
    <Button ref={opener} variant="outline" size="sm" onClick={() => setOpen(true)}><Copy aria-hidden="true" />{mode === "update" ? t("Review and copy update request") : t("Review and copy install request")}</Button>
    <RequestDialog open={open} onOpenChange={setOpen} returnFocus={opener.current} text={text}
      title={mode === "update" ? t("Update request for your AI tool") : t("Installation request for your AI tool")}
      success={mode === "update" ? "Update request copied. Paste it into your AI tool to compare your installation." : expanded ? "Installation request copied. Paste it into your AI tool to install the skill." : "Copied. Paste this request into your AI tool."}>
          <details className="mt-4 text-sm">
            <summary className="ak-focus-ring cursor-pointer">{t("Manual installation example: Codex")}</summary>
            <p className="mt-3">{t(skillChannelLabel(distribution.channel))} · <code>{distribution.version}</code></p>
            <ol className="mt-3 list-decimal space-y-3 pl-5">
              <li>{t("Before replacing an existing implementation-ledger skill, back it up and compare the changes.")}</li>
              <li>{t("Place the complete extracted folder at this location:")}<code className="block break-all">{"~/.codex/skills/implementation-ledger/"}</code><p className="mt-1 text-muted-foreground">{t("If {{variable}} is set, use {{path}} instead.", { variable: "CODEX_HOME", path: "$CODEX_HOME/skills/implementation-ledger/" })}</p></li>
              <li>{t("Reopen Codex and invoke {{skill}} to discuss what you want to build and draft a plan.", { skill: "$implementation-ledger" })}</li>
              <li>{t("Before requesting implementation, discuss open questions that affect the work and create or update the tickets. Connect the project folder to review progress.")}</li>
            </ol>
            <SkillArchiveDownload />
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
    <div><p className="ak-intro-eyebrow">{t("Skill installation and updates")}</p><h2>{"implementation-ledger"}</h2><p>{t("Give your AI a shared structure for scope, decisions, implementation results, and verification in Markdown.")}</p><p>{t("Install with your AI tool first. Connect the installed folder to compare updates and confirm a backed-up replacement. Personal changes require a separate review and overwrite confirmation.")}</p></div>
    <div><div className="ak-intro-skill-modes" role="group" aria-label={t("Installation mode")}>
      <Button variant={mode === "install" ? "secondary" : "ghost"} aria-pressed={mode === "install"} onClick={() => selectMode("install")}>{t("First installation")}</Button>
      <Button variant={mode === "update" ? "secondary" : "ghost"} aria-pressed={mode === "update"} onClick={() => selectMode("update")}>{t("Update an existing skill")}</Button>
    </div><h3>{mode === "install" ? t("Install the complete folder supplied by this app") : t("Compare before updating your skill")}</h3>
      <a href={distribution.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("View bundled skill")}<ArrowUpRight aria-hidden="true" /></a>
      <code>{t(skillChannelLabel(distribution.channel))}{" · "}{distribution.version}</code>
      <p>{mode === "install" ? t("Include reference files and templates. If the skill already exists, compare it, back it up, preserve personal changes, and confirm before replacing it.") : t("Compare the whole installed folder with the official source. Review the changes and conflicts, keep a full backup, and confirm before replacing anything.")}</p>
      <SkillInstallDialog mode={mode} expanded />
      {mode === "update" ? <div className="mt-3"><SkillUpdatesButton /></div> : null}
      <p className="ak-intro-skill-caption">{t("Copy the request into an AI tool that can access your local files. Internet access is needed to fetch this app’s pinned bundle.")}</p>
    </div>
  </div>;
  return <div data-tour="skill-install" className="ak-skill-install">
    <div><h3>{"implementation-ledger"}</h3><p>{t("Give your AI a shared structure for writing plans and tickets.")}</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <SkillInstallDialog />
      <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={distribution.url} target="_blank" rel="noreferrer">{t("View bundled skill")}<ArrowUpRight aria-hidden="true" /></a>
    </div>
  </div>;
}

export function SkillGuide() {
  const { t } = useTranslation();
  return <section className="ak-start-guide" aria-label={t("Work with your AI coding tool")}>
    <div data-tour="ai-workflow" className="ak-start-section-heading"><div><h2>{t("Keep work moving with AI and documents")}</h2><p>{t("Work in your AI chat. See the plan and progress here.")}</p></div><Link to="/about" className={buttonVariants({ variant: "ghost", size: "sm" })}><BookOpen aria-hidden="true" />{t("How it works")}</Link></div>
    <DocumentWorkflow />
    <SkillInstallPanel />
  </section>;
}
