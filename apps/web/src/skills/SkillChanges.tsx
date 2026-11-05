import { useState } from "react";
import { useTranslation } from "../i18n";
import { CodeDiff } from "../components/CodeDiff";
import type { SkillReview } from "./repository";

function FileChange({ change, review }: { change: SkillReview["changes"][number]; review: SkillReview }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return <li className="min-w-0 py-2">
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="ak-focus-ring cursor-pointer break-all text-sm">
        <code>{change.path}</code>{" · "}{t(change.kind === "add" ? "Add file" : change.kind === "remove" ? "Remove file" : "Change file")}
      </summary>
      {expanded ? <div className="mt-3"><CodeDiff
        before={review.files.find((file) => file.path === change.path)?.content ?? ""}
        after={review.bundle.files.find((file) => file.path === change.path)?.content ?? ""}
        label={t("Changes in {{path}}", { path: change.path })} />
      </div> : null}
    </details>
  </li>;
}

/** The same reviewed bytes are used by regular, PWA-bound and explicit reinstall flows. */
export function SkillChanges({ review }: { review: SkillReview }) {
  return <ul className="min-w-0 divide-y divide-border">{review.changes.map((change) => <FileChange key={change.path} change={change} review={review} />)}</ul>;
}
