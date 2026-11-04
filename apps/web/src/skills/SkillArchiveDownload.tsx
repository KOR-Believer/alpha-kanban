import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { buttonVariants } from "../components/ui/button";
import { useTranslation } from "../i18n";
import type { ReleaseInfo } from "../pwa/releases";

const RUNNING_RELEASE = __APP_RELEASE__;
export function SkillArchiveDownload({ release = RUNNING_RELEASE }: { release?: ReleaseInfo } = {}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const urls = useRef(new Map<string, number>());
  const filename = `implementation-ledger-${release.skillBundle}.zip`;
  const href = `/downloads/${filename}`;

  useEffect(() => () => {
    pending.current?.abort(); pending.current = null;
    for (const [url, timer] of urls.current) { window.clearTimeout(timer); URL.revokeObjectURL(url); }
    urls.current.clear();
  }, []);

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (pending.current) return;
    const request = new AbortController(); pending.current = request;
    setBusy(true); setFailed(false);
    try {
      // Fetch can use the precache even when Chrome's native download request cannot.
      const response = await fetch(href, { signal: request.signal, redirect: "error" });
      if (!response.ok) throw new Error("Skill archive unavailable");
      const blob = await response.blob();
      const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (blob.size < 22 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 3 || signature[3] !== 4) throw new Error("Invalid skill archive");
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (!/^[a-f0-9]{64}$/.test(release.skillArchive ?? "") || digest !== release.skillArchive) throw new Error("Invalid skill archive");
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urls.current.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 30_000));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename;
      document.body.append(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
    } catch {
      if (!request.signal.aborted) setFailed(true);
    } finally {
      if (pending.current === request) { pending.current = null; setBusy(false); }
    }
  }

  return <>
    <a className={buttonVariants({ variant: "ghost", size: "sm", className: "mt-3" })} href={href} download={filename} aria-disabled={busy} aria-busy={busy} onClick={download}>
      {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}{t("Download Codex skill")}
    </a>
    {failed ? <p role="alert" className="mt-2 text-sm text-destructive">{t("Could not download the skill ZIP. Reconnect to the internet and try again.")}</p> : null}
  </>;
}
