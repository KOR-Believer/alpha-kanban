import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { parseRevisionRoute, revisionSource, type RevisionRoute } from "./revisionNavigation";
import { RevisionRepositoryRequest } from "./RevisionRepositoryRequest";
import type { RevisionReadResult } from "./revisionRepository";
import type { RevisionTarget } from "@alpha-kanban/shared/revisionLinks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";

export function linkedRoute(href: string, id?: string, fragment = "", sourceDocumentId?: string): string {
  const url = new URL(revisionSource(href), "https://local.invalid");
  if (sourceDocumentId && !url.searchParams.has("linked") && url.pathname.startsWith("/w/")) url.searchParams.set("doc", sourceDocumentId);
  url.searchParams.delete("linked"); url.searchParams.delete("anchor");
  url.searchParams.delete("asset");
  if (id) {
    url.searchParams.set("linked", /^ld_[a-zA-Z0-9-]+$/.test(id) ? id : "unavailable");
    if (fragment) url.searchParams.set("anchor", fragment);
  }
  return url.pathname + url.search + url.hash;
}

export function filePreviewRoute(href: string, id: string, sourceDocumentId?: string): string {
  const url = new URL(linkedRoute(href), "https://local.invalid");
  if (sourceDocumentId && !url.searchParams.has("doc")) url.searchParams.set("doc", sourceDocumentId);
  url.searchParams.set("asset", /^f_[a-zA-Z0-9-]+$/.test(id) ? id : "unavailable");
  return url.pathname + url.search + url.hash;
}

function draftSource(href: string) {
  const url = new URL(linkedRoute(href), "https://local.invalid");
  url.searchParams.delete("q"); url.searchParams.delete("match");
  return url.pathname + url.search + url.hash;
}

type RevisionRequest = { from: string; destination: string; scope: string; target: RevisionTarget; current: boolean; web: boolean };
const Navigation = createContext<{ id?: string; previewId?: string; revision?: RevisionRoute; previewing: boolean; fragment: string; href: string; sourceHref: string; rememberSource: (element: HTMLElement) => void; protectDraft: (owner: object, dirty: boolean, busy: boolean) => void;
  openRevision?: (destination: string) => void; preparedRevision?: (href: string) => RevisionReadResult | undefined; confirmingExit?: boolean;
}>({ previewing: false, fragment: "", href: "/", sourceHref: "/", rememberSource: () => {}, protectDraft: () => {} });
export const useLinkedNavigation = () => useContext(Navigation);

export function LinkedNavigationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const href = useLocation({ select: (location) => location.href });
  const [request, setRequest] = useState<RevisionRequest>();
  const prepared = useRef<{ href: string; result: RevisionReadResult }>(undefined);
  const preparedRevision = useCallback((destination: string) => prepared.current?.href === destination ? prepared.current.result : undefined, []);
  const openRevision = useCallback((destination: string) => {
    const route = parseRevisionRoute(destination);
    if (!route?.target) return;
    setRequest({ from: href, destination, scope: new URL(destination, "https://local.invalid").pathname,
      target: route.target, current: route.current, web: route.web });
  }, [href]);
  useEffect(() => {
    // The verified bytes are handed to the mounted reader once. Back/forward,
    // refresh and later requests validate the current folder grant again.
    prepared.current = undefined;
    setRequest(previous => previous && previous.from !== href ? undefined : previous);
  }, [href]);
  const sourceFocus = useRef<HTMLElement | null>(null);
  const wasLinked = useRef(false);
  const drafts = useRef(new Map<object, { busy: boolean }>());
  const resolveExit = useRef<((blocked: boolean) => void) | null>(null);
  const [pendingExit, setPendingExit] = useState(false);
  const protectDraft = useCallback((owner: object, dirty: boolean, busy: boolean) => {
    if (dirty || busy) drafts.current.set(owner, { busy });
    else drafts.current.delete(owner);
  }, []);
  useEffect(() => {
    const unblock = router.history.block({
      enableBeforeUnload: false, // The existing PWA draft guard owns full-page exits.
      blockerFn: ({ currentLocation, nextLocation }) => {
        // Visible ticket dialogs already own their discard confirmation. This
        // additional guard is for drafts whose portal is suspended by a preview.
        const current = new URL(currentLocation.href, "https://local.invalid");
        if (!current.searchParams.has("linked") && !current.searchParams.has("asset") && !parseRevisionRoute(current.href)) return false;
        if (!drafts.current.size || draftSource(currentLocation.href) === draftSource(nextLocation.href)) return false;
        if (resolveExit.current || [...drafts.current.values()].some((draft) => draft.busy)) return true;
        return new Promise<boolean>((resolve) => { resolveExit.current = resolve; setPendingExit(true); });
      },
    });
    return () => { unblock(); resolveExit.current?.(true); resolveExit.current = null; };
  }, [router]);
  function finishExit(blocked: boolean) {
    resolveExit.current?.(blocked); resolveExit.current = null; setPendingExit(false);
  }
  const value = useMemo(() => {
    const url = new URL(href, "https://local.invalid");
    const revision = parseRevisionRoute(href);
    return { href, revision, openRevision, preparedRevision, confirmingExit: pendingExit, id: url.searchParams.get("linked") ?? undefined, previewId: url.searchParams.get("asset") ?? undefined, previewing: Boolean(revision) || url.searchParams.has("linked") || url.searchParams.has("asset"), fragment: url.searchParams.get("anchor") ?? "", sourceHref: revision ? revisionSource(href) : linkedRoute(href), rememberSource: (element: HTMLElement) => { sourceFocus.current = element; }, protectDraft };
  }, [href, openRevision, preparedRevision, pendingExit, protectDraft]);
  useEffect(() => {
    if (wasLinked.current && !value.previewing && sourceFocus.current?.isConnected) sourceFocus.current.focus({ preventScroll: true });
    wasLinked.current = value.previewing;
  }, [value.previewing]);
  return <Navigation.Provider value={value}>{children}
    {!pendingExit && request?.from === href && <RevisionRepositoryRequest key={request.destination} {...request} onCancel={() => setRequest(undefined)}
      onFinish={result => {
        if (router.state.location.href !== request.from) return;
        prepared.current = { href: request.destination, result };
        setRequest(undefined);
        void router.navigate({ href: request.destination, resetScroll: false });
      }} />}
    <Dialog open={pendingExit} onOpenChange={(open) => { if (!open) finishExit(true); }}>
      <DialogContent className="w-[min(440px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("작성 중인 내용을 버릴까요?")}</DialogTitle>
          <DialogDescription>{t("아직 저장하지 않은 상태 변경 사유와 수동 지시가 사라집니다.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => finishExit(true)}>{t("Cancel")}</Button>
          <Button variant="destructive" onClick={() => finishExit(false)}>{t("Discard and continue")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </Navigation.Provider>;
}
