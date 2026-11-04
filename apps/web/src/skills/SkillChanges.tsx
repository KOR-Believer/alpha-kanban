import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "../i18n";
import { CodeDiff } from "../components/CodeDiff";
import { Badge } from "../components/ui/badge";
import type { SkillReview } from "./repository";

function FileChange({ change, review }: { change: SkillReview["changes"][number]; review: SkillReview }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return <li className="min-w-0 py-2">
    <details className="group" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="ak-focus-ring flex cursor-pointer list-none items-start gap-2 text-sm [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-1.5 size-3 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <code className="min-w-0 break-all">{change.path}</code>
          <Badge variant={change.kind === "add" ? "success" : change.kind === "remove" ? "danger" : "warning"}>
            {t(change.kind === "add" ? "Add file" : change.kind === "remove" ? "Remove file" : "Change file")}
          </Badge>
        </span>
      </summary>
      {expanded ? <div className="mt-3"><CodeDiff
        before={review.files.find((file) => file.path === change.path)?.content ?? ""}
        after={review.bundle.files.find((file) => file.path === change.path)?.content ?? ""}
        beforeLabel={t("Installed skill")} afterLabel={t("Skill to apply")}
        label={t("Changes in {{path}}", { path: change.path })} />
      </div> : null}
    </details>
  </li>;
}

/** The same reviewed bytes are used by regular, PWA-bound and explicit reinstall flows. */
export function SkillChanges({ review }: { review: SkillReview }) {
  return <ul className="min-w-0 divide-y divide-border">{review.changes.map((change) => <FileChange key={change.path} change={change} review={review} />)}</ul>;
}
