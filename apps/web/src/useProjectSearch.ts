import { useEffect, useMemo, useState } from "react";
import type { MarkdownFileSummary } from "@alpha-kanban/shared";
import { browserRepository } from "./browser/repository";
import { searchDocument, searchYield, type DocumentSearchMatch } from "./documentSearch";
import { normalizeTicketQuery } from "./ticketSearch";

const EMPTY_MATCHES = new Map<string, DocumentSearchMatch>();

export function useProjectSearch(files: MarkdownFileSummary[], query: string, enabled: boolean) {
  const needle = normalizeTicketQuery(query);
  const active = enabled && Boolean(needle);
  const scope = useMemo(() => JSON.stringify(files.map((file) => [file.workspaceId, file.id, file.hash, file.workspaceRelativePath])), [files]);
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState({ scope: "", done: false });
  const [result, setResult] = useState({ key: "", matches: EMPTY_MATCHES, checked: 0, missing: 0, running: false });
  const key = scope + "\n" + needle;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let next = 0;
    setPrepared({ scope, done: false });
    void Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
      let slice = performance.now();
      while (next < files.length && !controller.signal.aborted) {
        const file = files[next++]!;
        try { await browserRepository.prepareDocumentSearch(file); } catch { /* Report missing entries in the search result. */ }
        if (performance.now() - slice > 8) { await searchYield(); slice = performance.now(); }
      }
    })).then(() => { if (!controller.signal.aborted) setPrepared({ scope, done: true }); });
    return () => controller.abort();
    // Changing the query does not restart preparation or reread document bodies.
  }, [active, scope, retry]);

  const preparationDone = prepared.scope === scope && prepared.done;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const matches = new Map<string, DocumentSearchMatch>();
    let checked = 0, missing = 0;
    setResult({ key, matches: EMPTY_MATCHES, checked, missing, running: true });
    void (async () => {
      let slice = performance.now(), published = slice;
      for (const file of files) {
        if (controller.signal.aborted) return;
        const entry = await browserRepository.documentSearch.get(file);
        if (controller.signal.aborted) return;
        if (entry) {
          const match = searchDocument(entry, needle);
          if (match) matches.set(file.id, match);
        } else missing++;
        checked++;
        if (performance.now() - published > 60) {
          setResult({ key, matches: new Map(matches), checked, missing, running: true });
          published = performance.now();
        }
        if (performance.now() - slice > 8) { await searchYield(); slice = performance.now(); }
      }
      if (!controller.signal.aborted) setResult({ key, matches, checked, missing, running: false });
    })();
    return () => controller.abort();
  }, [active, key, preparationDone, retry]);

  const current = active && result.key === key;
  return {
    matches: current ? result.matches : EMPTY_MATCHES,
    busy: active && (!current || !preparationDone || result.running),
    checked: current ? result.checked : 0,
    missing: current && preparationDone && !result.running ? result.missing : 0,
    retry: () => setRetry((value) => value + 1),
  };
}
