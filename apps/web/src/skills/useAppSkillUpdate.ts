import { useEffect, useRef, useState } from "react";
import { pwaClient } from "../pwa/client";
import type { ReleaseInfo } from "../pwa/releases";
import { loadSkillBundle } from "./bundle";
import { SkillRepository, skillError, type AppSkillUpdate, type SkillReview } from "./repository";
import { subscribeAppUpdateAcknowledged } from "./appUpdateNotice";

function repositoryFor(release: ReleaseInfo) {
  return new SkillRepository(undefined, undefined, {
    version: release.skillBundle, digest: release.skillPayload,
    compatible: release.history?.at(-1)?.skill?.compatibility === "compatible",
  });
}
export type PreparedSkillUpdate = {
  buildId: string; state: "checking" | "none" | "current" | "update" | "permission" | "blocked";
  repository: SkillRepository; review?: SkillReview; handle?: FileSystemDirectoryHandle; error?: string;
};

export function useAppSkillUpdate(release: ReleaseInfo, target: ReleaseInfo | undefined, enabled: boolean) {
  const [prepared, setPrepared] = useState<PreparedSkillUpdate>();
  const [inspection, setInspection] = useState(0);
  const [result, setResult] = useState<AppSkillUpdate>();
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const acknowledged = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const repository = repositoryFor(release);
    const clearAcknowledged = (id: string) => {
      if (cancelled) return;
      acknowledged.current.add(id);
      setResult(current => current?.id === id ? undefined : current);
    };
    const unsubscribe = subscribeAppUpdateAcknowledged(clearAcknowledged);
    const refreshAcknowledgement = () => {
      if (document.visibilityState !== "visible") return;
      void repository.appUpdate().then(current => {
        if (current?.acknowledged) clearAcknowledged(current.id);
      }).catch(() => undefined);
    };
    window.addEventListener("focus", refreshAcknowledgement);
    document.addEventListener("visibilitychange", refreshAcknowledgement);
    void (async () => {
      const approval = await repository.appUpdate();
      if (!approval || approval.fromBuild === release.buildId || approval.acknowledged) return;
      if (!cancelled) setFinishing(true);
      return repository.completeAppUpdate(release.buildId, () => loadSkillBundle(release.skillBundle, release.skillPayload));
    })()
      .then((value) => { if (!cancelled) setResult(value && !acknowledged.current.has(value.id) && !value.acknowledged ? value : undefined); })
      .catch((reason) => { if (!cancelled) setError(skillError(reason)); })
      .finally(() => { if (!cancelled) setFinishing(false); });
    return () => {
      cancelled = true; unsubscribe();
      window.removeEventListener("focus", refreshAcknowledgement);
      document.removeEventListener("visibilitychange", refreshAcknowledgement);
    };
  }, [enabled, release]);

  useEffect(() => {
    if (!target) { setPrepared(undefined); return; }
    let cancelled = false;
    const repository = repositoryFor(target);
    const base = { buildId: target.buildId, repository };
    setPrepared({ ...base, state: "checking" });
    void (async () => {
      const connection = await repository.connection();
      if (!connection) return { ...base, state: "none" } as PreparedSkillUpdate;
      if ((await repository.recoveries()).some((record) => record.state === "pending")) throw new Error("Review the unfinished skill update before changing its connection.");
      const permissionNeeded = { ...base, state: "permission", handle: connection.handle } as const;
      if (await connection.handle.queryPermission({ mode: "read" }) !== "granted") return permissionNeeded;
      const review = await repository.inspect(connection, await pwaClient.preparedSkillBundle(target));
      if (review.state === "current") return { ...base, state: "current", review } as PreparedSkillUpdate;
      if (review.state === "review") throw new Error("Ask your AI tool to review compatibility before changing your skill or documents.");
      if (await connection.handle.queryPermission({ mode: "readwrite" }) !== "granted") return permissionNeeded;
      return { ...base, state: "update", review } as PreparedSkillUpdate;
    })().then((value) => { if (!cancelled) setPrepared(value); }).catch((reason) => {
      if (!cancelled) setPrepared({ ...base, state: "blocked", error: skillError(reason) });
    });
    return () => { cancelled = true; };
  }, [target, inspection]);

  async function dismissResult() {
    try {
      if (result) await repositoryFor(release).acknowledgeAppUpdate(result.id);
      setResult(current => current?.id === result?.id ? undefined : current); setError("");
    } catch (reason) { setError(skillError(reason)); }
  }
  return { recheck: () => setInspection(value => value + 1), prepared, result, error, finishing, dismissResult };
}
