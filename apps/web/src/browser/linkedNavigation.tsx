import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";

export function linkedRoute(href: string, id?: string, fragment = "", sourceDocumentId?: string): string {
  const url = new URL(href, "https://local.invalid");
  if (sourceDocumentId && !url.searchParams.has("linked") && url.pathname.startsWith("/w/")) url.searchParams.set("doc", sourceDocumentId);
  url.searchParams.delete("linked"); url.searchParams.delete("anchor");
  if (id) {
    url.searchParams.set("linked", /^ld_[a-zA-Z0-9-]+$/.test(id) ? id : "unavailable");
    if (fragment) url.searchParams.set("anchor", fragment);
  }
  return url.pathname + url.search + url.hash;
}

const Navigation = createContext<{ id?: string; fragment: string; href: string; sourceHref: string; rememberSource: (element: HTMLElement) => void; protectDraft: (owner: object, dirty: boolean, busy: boolean) => void }>({ fragment: "", href: "/", sourceHref: "/", rememberSource: () => {}, protectDraft: () => {} });
export const useLinkedNavigation = () => useContext(Navigation);

export function LinkedNavigationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const href = useLocation({ select: (location) => location.href });
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
        if (!new URL(currentLocation.href, "https://local.invalid").searchParams.has("linked") || !drafts.current.size || linkedRoute(currentLocation.href) === linkedRoute(nextLocation.href)) return false;
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
    return { href, id: url.searchParams.get("linked") ?? undefined, fragment: url.searchParams.get("anchor") ?? "", sourceHref: linkedRoute(href), rememberSource: (element: HTMLElement) => { sourceFocus.current = element; }, protectDraft };
  }, [href, protectDraft]);
  useEffect(() => {
    if (wasLinked.current && !value.id && sourceFocus.current?.isConnected) sourceFocus.current.focus({ preventScroll: true });
    wasLinked.current = Boolean(value.id);
  }, [value.id]);
  return <Navigation.Provider value={value}>{children}
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
