import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Copy, Download } from "lucide-react";
import { useTranslation } from "../i18n";
import { IS_BROWSER_LOCAL } from "../storageMode";
import { Button, buttonVariants } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Textarea } from "./ui/textarea";

export const SKILL_SOURCE_URL = "https://github.com/KOR-Believer/alpha-kanban/tree/master/skills/implementation-ledger";
export const INSTALL_REQUEST = "Check the bundled implementation-ledger skill at {{url}}. Verify its source and available version, including the entire skill folder and its references. Compare it with my existing skill and preserve personal changes. Explain the installation method and changes first; ask before overwriting anything. Do not invent release tags or download URLs.";

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

export function SkillInstallDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const request = useRef<HTMLTextAreaElement>(null);
  const text = t(INSTALL_REQUEST, { url: SKILL_SOURCE_URL });
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied. Paste this request into your AI tool.");
    } catch {
      request.current?.focus();
      request.current?.select();
      setCopyStatus("Text selected. Copy it manually.");
    }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setCopyStatus(""); setOpen(true); }}><Copy aria-hidden="true" />{t("Review and copy install request")}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Installation request for Codex")}</DialogTitle><DialogDescription>{t("Review this request and send it to your external AI tool. This website does not install skills or launch AI.")}</DialogDescription></DialogHeader>
        <DialogBody className="pb-5">
          <Textarea ref={request} value={text} readOnly aria-label={t("Installation request")} className="min-h-48" />
          <details className="mt-4 text-sm">
            <summary className="ak-focus-ring cursor-pointer">{t("Manual installation")}</summary>
            <ol className="mt-3 list-decimal space-y-3 pl-5">
              <li>{t("Before replacing an existing implementation-ledger skill, back it up and compare the changes.")}</li>
              <li>{t("Place the complete extracted folder at this location:")}<code className="block break-all">{"~/.codex/skills/implementation-ledger/"}</code><p className="mt-1 text-muted-foreground">{t("If {{variable}} is set, use {{path}} instead.", { variable: "CODEX_HOME", path: "$CODEX_HOME/skills/implementation-ledger/" })}</p></li>
              <li>{t("Reopen Codex and invoke {{skill}} to discuss what you want to build and draft a plan.", { skill: "$implementation-ledger" })}</li>
              <li>{t("Before requesting implementation, discuss open questions that affect the work and create or update the tickets. Connect the project folder to review progress.")}</li>
            </ol>
            {IS_BROWSER_LOCAL ? <a className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-3" })} href="/downloads/implementation-ledger.zip" download><Download aria-hidden="true" />{t("Download Codex skill")}</a> : null}
          </details>
        </DialogBody>
        <DialogFooter className="flex-wrap"><p role="status" className="mr-auto text-xs text-muted-foreground">{t(copyStatus)}</p><Button variant="outline" onClick={() => setOpen(false)}>{t("Close")}</Button><Button onClick={() => void copy()}><Copy aria-hidden="true" />{t("Copy request")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function SkillInstallPanel() {
  const { t } = useTranslation();
  return <div className="ak-skill-install">
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
    <div className="ak-start-section-heading"><div><h2>{t("Keep work moving with AI and documents")}</h2><p>{t("Work in your AI chat. See the plan and progress here.")}</p></div><Link to="/intro" className={buttonVariants({ variant: "ghost", size: "sm" })}><BookOpen aria-hidden="true" />{t("How it works")}</Link></div>
    <DocumentWorkflow />
    <SkillInstallPanel />
  </section>;
}
