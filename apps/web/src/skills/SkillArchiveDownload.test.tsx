// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { english, korean } from "../i18n/messages";
import { SkillArchiveDownload } from "./SkillArchiveDownload";

const errorMessage = "Could not download the skill ZIP. Reconnect to the internet and try again.";
const filename = `implementation-ledger-${__APP_RELEASE__.skillBundle}.zip`;
const archive = new Uint8Array([0x50, 0x4b, 3, 4, ...Array(24).fill(0)]);

describe("skill archive download", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await setLanguage("ko");
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:skill-archive");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    await act(async () => root.render(<SkillArchiveDownload />));
  });
  afterEach(async () => {
    await act(async () => root.unmount()); container.remove();
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function click() {
    await act(async () => { container.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
  }

  it("fetches only the app-pinned ZIP, downloads a named blob and releases it", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(new Response(archive)); vi.stubGlobal("fetch", fetch);
    const saved: Array<{ url: string; name: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { saved.push({ url: this.href, name: this.download }); });
    await click();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/downloads/${filename}`, { signal: expect.any(AbortSignal), redirect: "error" });
    expect(saved).toEqual([{ url: "blob:skill-archive", name: filename }]);
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("aria-busy")).toBe("false");
    expect(document.querySelector('a[href="blob:skill-archive"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:skill-archive");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["network", "404", "html"])("shows a translated retryable error for %s without falling back to the latest ZIP", async (failure) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    if (failure === "network") fetch.mockRejectedValueOnce(new TypeError("offline"));
    else fetch.mockResolvedValueOnce(failure === "404" ? new Response("missing", { status: 404 }) : new Response("<!doctype html><html>SPA fallback</html>"));
    await click();
    expect(container.querySelector("[role=alert]")?.textContent).toBe(korean[errorMessage]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await act(async () => setLanguage("en"));
    expect(container.querySelector("[role=alert]")?.textContent).toBe(english[errorMessage]);
    fetch.mockResolvedValueOnce(new Response(archive));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await click();
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`/downloads/${filename}`, `/downloads/${filename}`]);
    await act(async () => root.render(null));
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:skill-archive");
  });

  it("ignores duplicate clicks and cancels a pending download when closed", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetch);
    await click(); await click();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector("a")?.getAttribute("aria-disabled")).toBe("true");
    const signal = fetch.mock.calls[0]![1].signal as AbortSignal;
    await act(async () => root.render(null));
    expect(signal.aborted).toBe(true);
    await act(async () => finish(new Response(archive)));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
