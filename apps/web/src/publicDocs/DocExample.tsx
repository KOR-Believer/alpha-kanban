import { useState, type ReactNode } from "react";
import { ArrowRight, FileText, FolderOpen, RotateCcw } from "lucide-react";
import { useTranslation } from "../i18n";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import { CodeDiff } from "../components/CodeDiff";
import { SkillFolderConnection } from "../skills/SkillFolderConnection";
import { SkillChanges } from "../skills/SkillChanges";
import type { SkillReview } from "../skills/repository";

export const exampleAfter: Record<string, string> = { owners: "meaning", config: "example", "user-config": "precedence",
  organize: "apply", handoff: "request", "local-links": "connect", connections: "remove", updates: "backup", backup: "restore", "folder-access": "permission" };
// Canonical paths, Owner fields and skill names stay unchanged across languages.
const source = "# Reading plan\n\nOwner: @alice\n\n## Progress Board\n\n| Ticket | Status |\n| --- | --- |\n| READ-01 | READY |\n\n## Goal\n\nKeep a reading journal.\n";
const cleaned = "# Reading plan\n\nOwner: @bob\nDocument-ID: 237b8cb5-c435-4dde-a902-a9b5c8b8fbb1\n\n## Goal\n\nKeep a reading journal.\n";
// Deliberately incomplete handles: examples cannot read, request permission, or write a file.
const exampleFolder = { name: "implementation-ledger", kind: "directory" } as FileSystemDirectoryHandle;
const connection = { id: "public-example", name: exampleFolder.name, handle: exampleFolder };
const exampleReview: SkillReview = {
  connection, state: "update", files: [{ path: "references/example.md", content: "# Example\n\nReview before replacing files.\n", sha256: "example-before", mtime: 0 }],
  bundle: { files: [{ path: "references/example.md", content: "# Example\n\nReview and back up before replacing files.\n", sha256: "example-after" }] } as SkillReview["bundle"],
  changes: [{ path: "references/example.md", kind: "change" }],
};
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ak-docs-example-panel"><h3><FolderOpen aria-hidden="true" />{title}</h3>{children}</div>;
}
function Pair({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="ak-docs-example-pair">{left}<ArrowRight className="ak-docs-example-arrow" aria-hidden="true" />{right}</div>;
}

export function DocExample({ id }: { id: string }) {
  const { t } = useTranslation();
  const [revision, setRevision] = useState(0);
  return <section className="ak-docs-example" aria-labelledby="visual-guide">
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
  const [confirmed, setConfirmed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [access, setAccess] = useState(false);
  const [candidate, setCandidate] = useState(false);
  const options = (items: [string, string][]) => <div className="ak-docs-example-options">{items.map(([value, label]) => <Button key={value} size="sm" variant={mode === value ? "secondary" : "outline"} aria-pressed={mode === value} onClick={() => { setMode(value); setStep(0); setConfirmed(false); }}>{t(label)}</Button>)}</div>;
  const next = (label: string) => <Button size="sm" onClick={() => setStep(value => value + 1)}>{t(label)}</Button>;
  const unchanged = <p className="ak-docs-example-note"><FileText aria-hidden="true" />{t("Original Markdown stays unchanged.")}</p>;
  if (id === "owners") {
    const nested = mode === "nested", basic = mode === "basic";
    return <>{options([["basic", "Plain folders"], ["owned", "Owner folder"], ["nested", "Nested owner folders"]])}
      <Pair left={<Panel title={t("Document location")}><pre>{`reading-journal/\n  docs/\n${basic ? "    01_reading_plan.md" : `    @alice/\n${nested ? "      @bob/\n        " : "      "}01_reading_plan.md`}`}</pre></Panel>}
        right={<Panel title={t("Owner shown on the board")}><Badge variant="muted">{basic ? t("Unassigned") : nested ? "@bob" : "@alice"}</Badge><p>{t("The closest valid @ folder determines the owner.")}</p><p>{t("Recorded owner")}: <code>{"@alice"}</code></p></Panel>} />
      <p>{t("The recorded Owner can differ. Document maintenance lets you review its correction to the folder owner.")}</p></>;
  }
  if (id === "config" || id === "user-config") {
    const owned = mode === "owned" || mode === "custom", hasUser = mode !== "default", root = mode === "custom" ? "notes/planning" : "docs";
    return <>{options([["default", "No settings"], ["user", "User setting only"], ["owned", "Owner folders enabled"], ["custom", "Custom document folder"]])}
      <Pair left={<Panel title={t("Configuration files")}><pre>{`${owned ? `[documents]\n${mode === "custom" ? `root = ${root}\n` : ""}ownerFolders = true` : t("No .ak.config · use defaults")}${hasUser ? "\n\n.ak.user\n[user]\nid = @alice" : ""}`}</pre></Panel>}
        right={<Panel title={t("New document location")}><pre>{`${root}/${owned ? "@alice/" : ""}01_reading_plan.md`}</pre><p>{owned ? "Owner: @alice" : t("No Owner header required")}</p></Panel>} />
      <p>{t("A user setting alone does not enable owner folders. Existing files are not moved.")}</p></>;
  }
  if (id === "organize") return <>
    <p><code>{"docs/@bob/01_reading_plan.md"}</code></p>
    {step === 0 ? <><Panel title={t("Before")}><pre>{source}</pre></Panel>{next("Document maintenance")}</> : <>
      <CodeDiff before={source} after={cleaned} />
      {step === 1 ? <div className="ak-docs-example-options"><Button size="sm" variant="ghost" onClick={() => setStep(0)}>{t("Cancel")}</Button>{next("Apply reviewed changes")}</div> : <p role="status">{t("Example applied: Owner and ID updated; obsolete guidance removed. The goal is unchanged.")}</p>}
    </>}
  </>;
  if (id === "handoff") return <>
    <Pair left={<Panel title={t("Before")}><pre>{"docs/@alice/01_reading_plan.md\n\nOwner: @alice"}</pre></Panel>}
      right={<Panel title={t("After")}><pre>{"docs/@bob/01_reading_plan.md\n\nOwner: @bob"}</pre></Panel>} />
    <p>{t("A CLI handoff analyzes the move and affected references together. Review the fixed plan before applying it.")}</p>
    {step === 0 ? next("Preview reference changes") : <CodeDiff before="[Plan](@alice/01_reading_plan.md)" after="[Plan](@bob/01_reading_plan.md)" />}
    <p>{t("The file keeps its number and Document-ID. Taking ownership does not start ticket implementation.")}</p>
  </>;
  if (id === "local-links") {
    const narrow = mode === "docs";
    return <>{options([["default", "Connect repository root"], ["docs", "Connect only docs"]])}
      <Panel title={t("Original link path")}><pre>{"/old-laptop/work/reports/docs/guide.md"}</pre></Panel>
      <Pair left={<Panel title={t("Old folder to replace")}><code>{"/old-laptop/work/reports"}{narrow ? "/docs" : ""}</code></Panel>}
        right={<Panel title={t("Selected local folder")}><code>{"workspace/project-renamed"}{narrow ? "/docs" : ""}</code></Panel>} />
      <p>{t("File to open inside the selected folder")}: <code>{narrow ? "guide.md" : "docs/guide.md"}</code></p>
      <p>{t(narrow ? "Only links under the old docs prefix reuse this connection." : "Other paths under the old repository prefix can reuse this connection.")}</p>
      {step === 0 ? next("Review selected folder") : step === 1 ? <><p>{t("The remaining file exists in the chosen folder. Check the scope before saving.")}</p><Button size="sm" onClick={() => setStep(2)}>{t("Connect and open")}</Button></> : <p role="status">{t("The example opens docs/guide.md from the selected folder.")}</p>}{unchanged}
    </>;
  }
  if (id === "connections") return <>
    <Panel title={t("Saved connection")}><pre>{"/old-laptop/work/reports → workspace/project-renamed"}</pre><Badge variant={step === 2 && mode === "remove" ? "muted" : "success"}>{t(step === 2 && mode === "remove" ? "Disconnected" : "Connected")}</Badge></Panel>
    {step === 0 ? <div className="ak-docs-example-options"><Button size="sm" variant="outline" onClick={() => { setMode("change"); setStep(1); }}>{t("Change link connection")}</Button><Button size="sm" variant="outline" onClick={() => { setMode("remove"); setStep(1); }}>{t("Remove link connection")}</Button></div> : step === 1 ? <>
      <p>{t(mode === "remove" ? "Remove only this saved mapping. Keep the folder and its files." : "Choose the replacement folder and verify the remaining file path again.")}</p><div className="ak-docs-example-options"><Button size="sm" variant="ghost" onClick={() => setStep(0)}>{t("Cancel")}</Button>{next("Confirm")}</div>
    </> : <p role="status">{t(mode === "remove" ? "The example mapping is removed. Opening the old link will ask for a connection again." : "The example mapping now uses the replacement folder.")}</p>}{unchanged}
  </>;
  if (id === "updates") return <>
    <p>{t("Open Skill updates in the app header, then connect your installed skill folder.")}</p>
    <SkillFolderConnection connection={connected ? connection : undefined} candidate={candidate ? exampleFolder : undefined}
      needsAccess={connected && !access} busy={false} recovery={false} dropSupported
      onChoose={() => { setCandidate(true); setStep(0); }} onAllow={() => { setCandidate(false); setConnected(true); setAccess(true); setStep(1); }}
      onCancel={() => setCandidate(false)} onCheck={() => { setAccess(true); setStep(1); }} onDisconnect={() => { setConnected(false); setStep(0); }} />
    {!candidate && !connected ? <Button size="sm" variant="outline" onClick={() => setCandidate(true)}>{t("Show the state after dropping a folder")}</Button> : null}
    {connected && !candidate ? <>
      {options([["default", "Compatible update example"], ["review", "Compatibility needs review"]])}
      <SkillChanges review={exampleReview} />
      {mode === "review" ? <p role="status">{t("Ask your AI tool to review compatibility before changing your skill or documents.")}</p> : step < 2 ? <>
        <label className="ak-docs-example-check"><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} /><span>{t("I have finished tasks using this skill in my AI tools and reviewed the files to replace.")}</span></label>
        <Button size="sm" disabled={!confirmed} onClick={() => setStep(2)}>{t("Back up and update skill")}</Button>
      </> : <p role="status">{t("Example complete: the previous skill files are backed up and the replacement is verified.")}</p>}
    </> : null}
  </>;
  if (id === "backup") return <>
    <Panel title={t("Skill backups")}><p>{"implementation-ledger · "}{t("Example backup")}</p><Badge variant="muted">{t(step === 2 ? "Restored" : "Update verified")}</Badge></Panel>
    {step === 0 ? next("Restore backup") : step === 1 ? <>
      <p>{t("Finish AI tasks using this skill before restoring. Only files matching the recorded copies will be replaced.")}</p>
      <label className="ak-docs-example-check"><Checkbox checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} /><span>{t("Simulate an external file change")}</span></label>
      <div className="ak-docs-example-options"><Button size="sm" variant="ghost" onClick={() => setStep(0)}>{t("Cancel")}</Button><Button size="sm" onClick={() => setStep(confirmed ? 3 : 2)}>{t("Confirm restore")}</Button></div>
    </> : <p role="status">{t(step === 3 ? "The external change prevents restoration. Check the files before trying again." : "Original skill files restored and verified.")}</p>}
    <p>{t("Backups stay on this site in this browser and are not automatically deleted, even after restoring or disconnecting.")}</p>
  </>;
  return <>{options([["default", "Access expired"], ["missing", "Original file missing"]])}
    <Panel title={"reading-journal"}><Badge variant="warning">{t(mode === "missing" ? "Original file missing" : step === 2 ? "Connected" : "Reconnect needed")}</Badge></Panel>
    {mode === "missing" ? <p>{t("Check the original folder or your document backup. Granting access cannot recreate a missing file.")}</p> : step === 0 ? next("Reconnect folder") : step === 1 ? <>
      <p>{t("Chrome asks for folder access. Allow it in the browser prompt; cancelling keeps the saved connection.")}</p>
      <div className="ak-docs-example-options"><Button size="sm" variant="outline" onClick={() => setStep(0)}>{t("Show cancelled result")}</Button>{next("Show allowed result")}</div>
    </> : <p role="status">{t("The saved folder connection is usable again. No document was changed.")}</p>}
  </>;
}
