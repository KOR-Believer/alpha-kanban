import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export const VIRTUAL_TICKET_THRESHOLD = 80;
const focusable = 'a[href],button:not(:disabled),[tabindex="0"]';

/** All columns share the board's existing scroller; only card DOM is windowed. */
export function VirtualTicketList<T>({ items, itemKey, children, pinnedKey }: {
  items: T[]; itemKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode; pinnedKey?: string;
}) {
  return items.length < VIRTUAL_TICKET_THRESHOLD
    ? <>{items.map((item, index) => <div key={itemKey(item)}>{children(item, index)}</div>)}</>
    : <WindowedTickets items={items} itemKey={itemKey} pinnedKey={pinnedKey}>{children}</WindowedTickets>;
}

function WindowedTickets<T>({ items, itemKey, children, pinnedKey }: {
  items: T[]; itemKey: (item: T) => string;
  children: (item: T, index: number) => ReactNode; pinnedKey?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [gap, setGap] = useState(8);
  const [focusedKey, setFocusedKey] = useState<string>();
  const pendingFocus = useRef<{ key: string; last: boolean; primary: boolean } | undefined>(undefined);
  const keys = items.map(itemKey);
  const dragIndex = pinnedKey ? keys.indexOf(pinnedKey) : -1;
  const focusIndex = focusedKey ? keys.indexOf(focusedKey) : -1;
  const getScrollElement = useCallback(() => host.current?.closest<HTMLElement>("[data-board-scroll]") ?? null, []);
  const virtualizer = useVirtualizer({
    count: items.length, getScrollElement, estimateSize: () => 190, overscan: 5,
    getItemKey: (i) => keys[i]!, scrollMargin: margin, scrollPaddingStart: margin, gap,
    rangeExtractor: useCallback((range) => [...new Set([
      ...defaultRangeExtractor(range), ...(dragIndex >= 0 ? [dragIndex] : []), ...(focusIndex >= 0 ? [focusIndex] : []),
    ])].sort((a, b) => a - b), [dragIndex, focusIndex]),
  });
  useLayoutEffect(() => {
    const element = host.current, scroll = getScrollElement();
    if (!element || !scroll) return;
    const measure = () => {
      setMargin(element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
      setGap(parseFloat(getComputedStyle(element.parentElement!).rowGap) || 8);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    if (element.parentElement) observer.observe(element.parentElement);
    return () => observer.disconnect();
  }, [getScrollElement]);
  useLayoutEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;
    const row = Array.from(host.current?.querySelectorAll<HTMLElement>("[data-virtual-key]") ?? [])
      .find((element) => element.dataset.virtualKey === request.key);
    const targets = row?.querySelectorAll<HTMLElement>(focusable);
    const target = (request.primary ? row?.querySelector<HTMLElement>("[data-ticket-open]") : undefined) ??
      (request.last ? targets?.[targets.length - 1] : targets?.[0]);
    if (target) { pendingFocus.current = undefined; target.focus({ preventScroll: true }); }
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).matches("input,textarea,select,[contenteditable]")) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-virtual-key]");
    const current = row ? keys.indexOf(row.dataset.virtualKey!) : -1;
    if (current < 0) return;
    let next: number;
    if (event.key === "ArrowDown") next = current + 1;
    else if (event.key === "ArrowUp") next = current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") {
      const targets = row!.querySelectorAll<HTMLElement>(focusable);
      if (event.target !== (event.shiftKey ? targets[0] : targets[targets.length - 1])) return;
      next = current + (event.shiftKey ? -1 : 1);
    } else return;
    if (next < 0 || next >= items.length) return;
    event.preventDefault();
    pendingFocus.current = { key: keys[next]!, last: event.key === "Tab" && event.shiftKey, primary: event.key !== "Tab" };
    setFocusedKey(keys[next]);
    virtualizer.scrollToIndex(next, { align: "auto" });
  }

  return <div ref={host} data-virtual-ticket-list role="list" className="relative min-w-0" style={{ height: virtualizer.getTotalSize() }}
    onKeyDown={onKeyDown}
    onFocusCapture={(event) => setFocusedKey((event.target as HTMLElement).closest<HTMLElement>("[data-virtual-key]")?.dataset.virtualKey)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedKey(undefined); }}>
    {virtualizer.getVirtualItems().map((item) => <div key={item.key} ref={virtualizer.measureElement}
      data-index={item.index} data-virtual-key={keys[item.index]} role="listitem" aria-setsize={items.length} aria-posinset={item.index + 1}
      className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${item.start - margin}px)` }}>
      {children(items[item.index]!, item.index)}
    </div>)}
  </div>;
}
