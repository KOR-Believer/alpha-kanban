// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NavigationLink } from "./NavigationLink";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("exposes the exact URL and runs guarded SPA navigation only for an ordinary click", async () => {
  const navigate = vi.fn();
  const href = "/w/bw_fixture?doc=d_notes&q=needle&match=needle#ticket=T-01&detail=side";
  await act(async () => root.render(<NavigationLink href={href} onNavigate={navigate}>Open</NavigationLink>));
  const link = host.querySelector("a")!;
  expect(link.getAttribute("href")).toBe(href);
  for (const options of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }]) {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...options });
    await act(async () => link.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  }
  expect(navigate).not.toHaveBeenCalled();
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => link.dispatchEvent(click));
  expect(click.defaultPrevented).toBe(true);
  expect(navigate).toHaveBeenCalledOnce();
});

it("does not offer a new-tab URL for disabled actions or intercept an explicit target", async () => {
  const navigate = vi.fn();
  await act(async () => root.render(<NavigationLink href="/w/bw_fixture" onNavigate={navigate} disabled>Unavailable</NavigationLink>));
  expect(host.querySelector("a")!.hasAttribute("href")).toBe(false);
  expect(host.querySelector("a")!.getAttribute("aria-disabled")).toBe("true");
  await act(async () => root.render(<NavigationLink href="/all" target="_blank" onNavigate={navigate}>Open</NavigationLink>));
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => host.querySelector("a")!.dispatchEvent(click));
  expect(click.defaultPrevented).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});
