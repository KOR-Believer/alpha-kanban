import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, FolderOpen, RotateCcw } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ReconnectFolderButton } from "../components/ReconnectFolderButton";
import { WorkspaceStatusBadge } from "../components/WorkspaceNavigation";
import { DocumentOwnerBadge } from "../components/DocumentOwner";
import { DocumentMaintenanceView } from "../components/DocumentMaintenanceView";
import { LocalConnectionExample } from "./LocalConnectionExample";
import { BackupExample, SkillUpdateExample } from "./SkillExamples";
import { RevisionHeader, type RevisionView } from "../components/RevisionHeader";
import { MarkdownContent } from "../components/MarkdownContent";
import { CodeDiff } from "../components/CodeDiff";
export const exampleAfter: Record<string, string> = { owners: "meaning", config: "example", "user-config": "precedence",
  organize: "apply", handoff: "request", "local-links": "connect", connections: "remove", updates: "backup", backup: "restore", "folder-access": "permission" };
// Canonical paths, Owner fields and skill names stay unchanged across languages.
const source = "# Reading plan\n\nOwner: @alice\n\n## Progress Board\n\n| Ticket | Status |\n| --- | --- |\n| READ-01 | READY |\n\n## Goal\n\nKeep a reading journal.\n";
const cleaned = "# Reading plan\n\nOwner: @bob\nDocument-ID: 237b8cb5-c435-4dde-a902-a9b5c8b8fbb1\n\n## Goal\n\nKeep a reading journal.\n";
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ak-docs-example-panel"><h3><FolderOpen aria-hidden="true" />{title}</h3>{children}</div>;
}
function Pair({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="ak-docs-example-pair">{left}<ArrowRight className="ak-docs-example-arrow" aria-hidden="true" />{right}</div>;
}

export function RevisionLinkExample() {
  const { t } = useTranslation();
  const [view, setView] = useState<"plan" | RevisionView>("plan");
  const deadline = t("Refund deadline");
  const cited = `## ${deadline}\n\n${t("Refunds are available for 7 days after approval.")}`;
  const current = `## ${deadline}\n\n${t("Refunds are available for 10 days after approval.")}`;
  const revision = t("Cited revision") + " · 6ca9f5aa";
  return <div className="ak-docs-example">
    <Badge variant="muted" className="justify-self-start">{t("Example only")}</Badge>
    {view === "plan" ? <Panel title={t("Refund plan")}>
      <Button variant="link" size="sm" onClick={() => setView("cited")}>{deadline}</Button>
    </Panel> : <>
      <RevisionHeader view={view} commit="6ca9f5aa" path="policies/refund.md" onSelect={setView}>
        <Button size="xs" variant="ghost" onClick={() => setView("plan")}><ArrowLeft />{t("Back to source document")}</Button>
      </RevisionHeader>
      {view === "compare"
        ? <div className="ak-revision-comparison"><CodeDiff before={cited} after={current} beforeLabel={revision} afterLabel={t("Current working file")} /></div>
        : <MarkdownContent>{view === "current" ? current : cited}</MarkdownContent>}
    </>}
  </div>;
}

export function DocExample({ id }: { id: string }) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  return <section data-tour="docs-example" className="ak-docs-example" aria-labelledby="visual-guide">
    <div className="ak-docs-example-heading"><div><Badge variant="muted">{t("Example only")}</Badge><h2 id="visual-guide" tabIndex={-1}>{t("Interactive example")}</h2></div>
      <Button size="iconSm" variant="ghost" onClick={() => setRevision(value => value + 1)} title={t("Restart example")} aria-label={t("Restart example")}><RotateCcw /></Button></div>
    <p className="ak-docs-example-intro">{t("Try the controls below. This example does not connect folders or change your files.")}</p>
    <ExampleBody id={id} key={revision} />
  </section>;
}

function ExampleBody({ id }: { id: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(id === "owners" ? "nested" : "default");
  const [step, setStep] = useState(0);
  const options = (items: [string, string][]) => <fieldset><legend className="mb-2 text-xs font-semibold text-muted-foreground">{t("Example scenario")}</legend><div className="ak-docs-example-options">{items.map(([value, label]) => <Button key={value} size="sm" variant={mode === value ? "secondary" : "outline"} aria-pressed={mode === value} onClick={() => { setMode(value); setStep(0); }}>{t(label)}</Button>)}</div></fieldset>;
  if (id === "owners") {
    const nested = mode === "nested", basic = mode === "basic";
    const path = ["docs", ...(!basic ? ["@alice"] : []), ...(nested ? ["@bob"] : []), "01_reading_plan.md"].join("/");
    return <>{options([["basic", "Plain folders"], ["owned", "Owner folder"], ["nested", "Nested owner folders"]])}
      <Pair left={<Panel title={t("Document location")}><pre>{`reading-journal/\n  docs/\n${basic ? "    01_reading_plan.md" : `    @alice/\n${nested ? "      @bob/\n        " : "      "}01_reading_plan.md`}`}</pre></Panel>}
        right={<Panel title={t("Owner shown on the board")}>{basic ? <span>{t("Unassigned")}</span> : <DocumentOwnerBadge file={{ relativePath: path, documentRoot: "docs" }} />}<p>{t("The closest valid @ folder determines the owner.")}</p><p>{t("Recorded owner")}: <code>{"@alice"}</code></p></Panel>} />
      <p>{t("The recorded Owner can differ. Document maintenance lets you review its correction to the folder owner.")}</p></>;
  }
  if (id === "config" || id === "user-config") {
    const owned = mode === "owned" || mode === "custom", hasUser = mode !== "default", root = mode === "custom" ? "notes/planning" : "docs";
    return <>{options([["default", "No settings"], ["user", "User setting only"], ["owned", "Owner folders enabled"], ["custom", "Custom document folder"]])}
      <Pair left={<Panel title={t("Configuration files")}><pre>{`${owned ? `.ak.config\n[documents]\n${mode === "custom" ? `root = ${root}\n` : ""}ownerFolders = true` : t("No .ak.config · use defaults")}${hasUser ? "\n\n.ak.user\n[user]\nid = @alice" : ""}`}</pre></Panel>}
        right={<Panel title={t("New document location")}><pre>{`${root}/${owned ? "@alice/" : ""}01_reading_plan.md`}</pre><p>{owned ? "Owner: @alice" : t("No Owner header required")}</p></Panel>} />
      <p>{t("A user setting alone does not enable owner folders. Existing files are not moved.")}</p></>;
  }
  if (id === "organize") {
    const path = "docs/@bob/01_reading_plan.md";
    const applied = mode === "applied";
    return <>
      <code>{path}</code>
      <DocumentMaintenanceView open={step === 1} path={path} onPreview={() => setStep(1)} close={() => setStep(0)}
        preview={{ schema: 1, decision: applied ? "noop" : "ready", generatedIds: {}, references: [], rules: [], retained: [], issues: [],
          changes: applied ? [] : [{ path, afterPath: path, before: source, after: cleaned }] }}
        onApply={() => { setMode("applied"); setStep(0); }} />
      {applied && <p role="status">{t("Example applied: Owner and ID updated; obsolete guidance removed. The goal is unchanged.")}</p>}
    </>;
  }
  if (id === "handoff") return <>
    <Pair left={<Panel title={t("Before")}><pre>{"docs/@alice/01_reading_plan.md\n\nOwner: @alice"}</pre></Panel>}
      right={<Panel title={t("After")}><pre>{"docs/@bob/01_reading_plan.md\n\nOwner: @bob"}</pre></Panel>} />
    <p>{t("A CLI handoff analyzes the move and affected references together. Review the fixed plan before applying it.")}</p>
    <details><summary>{t("Preview reference changes")}</summary><CodeDiff before="[Plan](@alice/01_reading_plan.md)" after="[Plan](@bob/01_reading_plan.md)" /></details>
    <p>{t("The file keeps its number and Document-ID. Taking ownership does not start ticket implementation.")}</p>
  </>;
  if (id === "local-links" || id === "connections") return <LocalConnectionExample manage={id === "connections"} />;
  if (id === "updates") return <SkillUpdateExample />;
  if (id === "backup") return <BackupExample />;
  return <>{options([["default", "Access expired"], ["denied", "Access denied"], ["missing", "Original file missing"]])}
    <Panel title={"reading-journal"}>
      {mode === "missing" ? <p role="alert">{t("This file moved or was removed. Select it again in the file explorer.")}</p> : <>
        <WorkspaceStatusBadge count={1} isAvailable={step !== 0 && mode !== "denied"} />
        {(!step || mode === "denied") && <ReconnectFolderButton onClick={() => setStep(1)} />}
        {step === 1 && mode === "denied" && <p role="alert">{t("Folder access was not granted.")}</p>}
      </>}
    </Panel>
  </>;
}
