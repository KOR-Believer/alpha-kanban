import type { ComponentProps, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useTranslation } from "../i18n";
import { FolderIdentity, RepositoryFolderPicker, RepositoryPickerDialog, useRepositoryFilters } from "./RepositoryFolderPicker";
import { folderPrefixes, relativeToPrefix } from "./linkPaths";
import type { LinkMapping, LinkPreview, LinkProposal, LinkTarget } from "./linkMappings";

type Picker = ComponentProps<typeof RepositoryFolderPicker>;
type Props = Pick<Picker, "scan" | "scanning" | "busy" | "discover" | "canPick" | "touch" | "onRefresh" | "onStop" | "onPick" | "onSelect"> & {
  path: string; project: string; prefix: string; proposals: LinkProposal[]; target?: LinkTarget; preview?: LinkPreview;
  existing?: Pick<LinkMapping, "label" | "prefix">; error?: string; manage?: boolean;
  contentRef?: ComponentProps<typeof RepositoryPickerDialog>["contentRef"]; headerAction?: ReactNode; lockDismiss?: boolean;
  onPrefix: (value: string) => void; onClose: () => void; onBack: () => void; onSubmit: () => void;
  onRetry?: () => void; onReviewOverlap?: () => void;
};
export function LocalLinkDialogView({ path, project, prefix, proposals, target, preview, existing, error, manage,
  contentRef, headerAction, lockDismiss, scan, scanning, busy, discover, canPick, touch, onRefresh, onStop, onPick, onSelect,
  onPrefix, onClose, onBack, onSubmit, onRetry, onReviewOverlap }: Props) {
  const { t } = useTranslation();
  const filters = useRepositoryFilters();
  const prefixes = folderPrefixes(path);
  const remaining = prefix ? relativeToPrefix(path, prefix) : undefined;
  return <RepositoryPickerDialog contentRef={contentRef} onClose={onClose} lockDismiss={busy || lockDismiss}
    title={t(preview ? "Review link connection" : existing ? "Change link connection" : "Connect local link")}
    description={t("Choose a local repository or folder, then check which old path it replaces.")}
    headerAction={headerAction}
    footer={<>{preview ? <Button variant="ghost" disabled={busy} className="mr-auto" onClick={onBack}><ArrowLeft />{t("Back")}</Button> : null}<Button variant="outline" disabled={busy} onClick={onClose}>{t("Cancel")}</Button><Button data-tour="link-apply" disabled={!target || !remaining || busy} onClick={onSubmit}>{t(preview ? manage ? "Save link connection" : existing?.prefix === prefix ? "Replace connection and open" : "Connect and open" : "Review selected folder")}</Button></>}>
      <details className="min-w-0"><summary data-tour="link-original" className="cursor-pointer font-medium">{t("Original link path")}</summary><code className="mt-2 block break-all text-xs text-muted-foreground">{path}</code></details>
      {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
      {preview ? <>
        <section data-tour="link-preview" className="grid gap-3 rounded-lg border border-border p-4">
          <h3 className="font-semibold">{t("Connection to save")}</h3><FolderIdentity target={target!} />
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("Old folder to replace")}</span><code className="break-all">{prefix}</code></div>
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("File to open inside the selected folder")}</span><code className="break-all">{remaining}</code></div>
        </section>
        {preview.overlap ? <section className="grid gap-3 rounded-lg border border-border p-4" aria-label={t("File that will open")}>
          <h3 className="font-semibold">{t("File that will open")}</h3><p className="text-muted-foreground">{t("A more specific saved connection applies to this file. It will stay in use.")}</p>
          <p className="break-all font-medium">{preview.target.label}</p><code className="break-all">{preview.relative}</code>
          <Button size="sm" variant="outline" className="justify-self-start" disabled={busy} onClick={onReviewOverlap}>{t("Review the saved connection instead")}</Button>
        </section> : null}
        <p className="text-muted-foreground">{t("Reuse for matching links from {{project}}.", { project })}</p>
        <p className="text-xs text-muted-foreground">{t("This connection is reused for links with the same old folder in this project. It is saved only in this browser and site address.")}</p>
      </> : <>
        {existing ? <div className="grid gap-2 text-sm"><p className="break-all">{t("Saved folder: {{folder}}", { folder: existing.label })}</p><code className="break-all text-xs">{existing.prefix}</code>
          <Button variant="outline" size="sm" className="justify-self-start" disabled={busy} onClick={onRetry}>{t(manage ? "Check folder access" : "Allow access and retry")}</Button>
        </div> : null}
        <RepositoryFolderPicker scan={scan} filters={filters} scanning={scanning} busy={busy} discover={discover} canPick={canPick}
          selectedId={target?.repo?.id} touch={touch} onRefresh={onRefresh}
          onStop={onStop}
          onPick={onPick} onSelect={onSelect} />
        {target ? <section data-tour="link-selection" className="grid min-w-0 gap-3 border-t border-border pt-4">
          <p className="break-all font-medium">{t("Selected folder: {{folder}}", { folder: target.label })}</p>
          {proposals.length > 1 ? <p>{t("Several paths exist in this folder. Choose the intended file.")}</p> : null}
          <label className="grid min-w-0 gap-2 font-medium">{t("Old folder to replace")}<Select value={prefix} onValueChange={onPrefix} disabled={busy}><SelectTrigger size="field" className="w-full min-w-0"><SelectValue placeholder={t("Choose a matching path")} /></SelectTrigger><SelectContent>{(proposals.length ? proposals.map((item) => item.prefix) : prefixes).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>
          <div className="grid gap-1"><span className="text-xs text-muted-foreground">{t("File to open inside the selected folder")}</span><code className="break-all">{remaining ?? "—"}</code></div>
        </section> : null}
      </>}
  </RepositoryPickerDialog>;
}
