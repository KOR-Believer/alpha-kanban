import { useState } from "react";
import { Button } from "../components/ui/button";
import { MarkdownContent } from "../components/MarkdownContent";
import { LocalLinkDialogView } from "../browser/LocalLinkDialogView";
import { RemoveLinkDialog, SavedLinkRow } from "../browser/SavedLinkRow";
import type { LinkTarget } from "../browser/linkMappings";
import type { RepoCandidate } from "../browser/gitDiscovery";
import { useTranslation } from "../i18n";

const oldRoot = "/old-laptop/work/reports";
const path = oldRoot + "/docs/guide.md";
const project = "reading-journal";
const repo: RepoCandidate = {
  id: "example-reports", rootId: "workspace", path: "project-renamed", label: "workspace/project-renamed",
  handle: { name: "project-renamed" } as FileSystemDirectoryHandle, remotes: ["origin=example.org/team/reports"],
};
const root: LinkTarget = { handle: repo.handle, label: repo.label, repo };
const docs: LinkTarget = { handle: { name: "docs" } as FileSystemDirectoryHandle, label: "docs" };
const rootMapping = { sourceLabel: project, label: root.label, prefix: oldRoot };

export function LocalConnectionExample({ manage }: { manage: boolean }) {
  const { t } = useTranslation();
  const [mapping, setMapping] = useState(manage ? rootMapping : undefined);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<LinkTarget>();
  const [review, setReview] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reading, setReading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [prefix, setPrefix] = useState(oldRoot);
  const editing = manage && Boolean(mapping);
  const relative = target === docs ? "guide.md" : "docs/guide.md";
  function select(folder: LinkTarget) {
    setPrefix(folder === docs ? oldRoot + "/docs" : oldRoot); setTarget(folder);
  }
  function chooseFolder() {
    setReview(false); setTarget(undefined); setRefreshing(false); setOpen(true);
  }
  function finish() {
    setOpen(false);
    if (!editing) setReading(true);
  }
  return <>
    <p className="text-sm text-muted-foreground">{t("Select the sample repository, or choose a folder directly to try its docs folder.")}</p>
    {manage && <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{t("Link connections")}</h3>
      {mapping ? <SavedLinkRow mapping={mapping} onChange={chooseFolder} onRemove={() => setRemoving(true)} />
        : <p className="text-sm text-muted-foreground">{t("No saved link connections.")}</p>}
    </section>}
    {!reading && (!manage || !mapping) && <Button size="sm" variant="link" className="justify-self-start" onClick={() => mapping ? setReading(true) : chooseFolder()}>{path}</Button>}
    {reading && <>
      <Button size="xs" variant="ghost" className="justify-self-start" onClick={() => setReading(false)}>{t("Back to source document")}</Button>
      <MarkdownContent>{`# ${t("Reading guide")}\n\n${t("Keep a reading journal.")}`}</MarkdownContent>
    </>}
    {open && <LocalLinkDialogView path={path} project={project} manage={editing} existing={editing ? mapping : undefined}
      target={target} prefix={target ? prefix : ""} proposals={target ? [{ prefix, relative }] : []}
      preview={review && target ? { target, prefix, relative } : undefined}
      scan={{ repos: [repo], complete: true, reasons: [], visited: 2 }} busy={false} discover canPick scanning={refreshing}
      onRefresh={() => { setRefreshing(true); requestAnimationFrame(() => setRefreshing(false)); }} onStop={() => setRefreshing(false)}
      onPick={() => select(docs)} onSelect={() => select(root)} onPrefix={setPrefix}
      onRetry={finish} onClose={() => setOpen(false)} onBack={() => setReview(false)}
      onSubmit={() => { if (!target) return; if (!review) { setReview(true); return; } setMapping({ sourceLabel: project, label: target.label, prefix }); finish(); }} />}
    <RemoveLinkDialog open={removing} busy={false} onClose={() => setRemoving(false)} onRemove={() => { setMapping(undefined); setReading(false); setRemoving(false); }} />
  </>;
}
