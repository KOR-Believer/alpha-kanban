// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PwaStartupNotice } from "./PwaStartupNotice";
import { setLanguage } from "../i18n";

describe("version mismatch guidance", () => {
  it.each(["ko", "en"] as const)("keeps %s guidance still until the user chooses navigation or reload", async (language) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const reload = vi.fn(); vi.stubGlobal("location", { reload });
    await setLanguage(language);
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<PwaStartupNotice />));
      expect(host.querySelector("h1")?.textContent).toBe(language === "ko" ? "앱 업데이트를 확인해 주세요" : "Check for an app update");
      expect(host.querySelector("a")?.getAttribute("href")).toBe("/");
      expect(reload).not.toHaveBeenCalled();
      await act(async () => host.querySelector("button")!.click());
      expect(reload).toHaveBeenCalledTimes(1);
    } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
  });
});
