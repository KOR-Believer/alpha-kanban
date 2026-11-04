import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Channel = "stable" | "canary";
async function repair(channel: Channel, remote: string | undefined, inventoryChannel = remote) {
  const button = { disabled: false, onclick: undefined as undefined | (() => Promise<void>) };
  const result = { textContent: "" }, language = { value: "ko", onchange: undefined };
  const put = vi.fn(), remove = vi.fn();
  const buildId = "a".repeat(16);
  class PortPair {
    port1 = { onmessage: undefined as undefined | ((event: { data: unknown }) => void), close() {} };
    port2 = { postMessage: (data: unknown) => this.port1.onmessage?.({ data }) };
  }
  const worker = { scriptURL: "https://app.test/sw.js", state: "activated", postMessage(data: { type: string }, ports: PortPair["port2"][]) {
    ports[0]!.postMessage(data.type === "AK_INFO" ? { channel: remote, mode: "app", ready: true, buildId } : { ok: true, count: 0 });
  } };
  const registration = { scope: "https://app.test/", active: worker, waiting: null, update: async () => {} };
  const fetcher = vi.fn(async (url: URL) => ({ ok: true, json: async () => url.pathname === "/release.json"
    ? { app: "alpha-kanban", protocol: 1, mode: "app", channel: remote, buildId }
    : { channel: inventoryChannel, buildId, assets: [{ url: "index.html", integrity: "sha256-test" }] } }));
  const source = readFileSync(new URL("../../public-browser/repair.js", import.meta.url), "utf8")
    .replace('"__RELEASE_CHANNEL__"', JSON.stringify(channel)).replace('"__OTHER_CHANNEL_ORIGINS__"', "[]");
  runInNewContext(source, {
    document: { documentElement: { lang: "ko" }, querySelector: (key: string) => key === "#repair" ? button : key === "#result" ? result : language, querySelectorAll: () => [] },
    location: { origin: "https://app.test" }, localStorage: { getItem: () => "ko" },
    navigator: { onLine: true, locks: { request: async (_name: string, _options: unknown, body: (lock: object) => Promise<void>) => body({}) }, serviceWorker: { getRegistration: async () => undefined, register: async () => registration } },
    caches: { open: async () => ({ put }), delete: remove }, fetch: fetcher,
    URL, crypto, AbortSignal, MessageChannel: PortPair, setTimeout, clearTimeout,
  });
  await button.onclick!();
  return { result: result.textContent, put, remove, fetcher };
}

describe("standalone repair channel boundary", () => {
  for (const channel of ["stable", "canary"] as const) {
    it(`${channel} repairs matching assets without deleting user storage`, async () => {
      const value = await repair(channel, channel);
      expect(value.result).toBe("앱 파일을 다시 받았습니다. 앱으로 돌아가세요.");
      expect(value.put).toHaveBeenCalledOnce(); expect(value.remove).not.toHaveBeenCalled();
    });
    it(`${channel} rejects another channel before fetching or writing its assets`, async () => {
      const other = channel === "stable" ? "canary" : "stable";
      const value = await repair(channel, other);
      expect(value.result).toContain("복구를 마치지 못했습니다");
      expect(value.fetcher).toHaveBeenCalledOnce(); expect(value.put).not.toHaveBeenCalled(); expect(value.remove).not.toHaveBeenCalled();
    });
    it(`${channel} rejects mismatched offline inventory before cache writes`, async () => {
      const value = await repair(channel, channel, channel === "stable" ? "canary" : "stable");
      expect(value.result).toContain("복구를 마치지 못했습니다");
      expect(value.fetcher).toHaveBeenCalledTimes(2); expect(value.put).not.toHaveBeenCalled();
    });
  }
  it("accepts channel-less repair data only on stable", async () => {
    expect((await repair("stable", undefined)).put).toHaveBeenCalledOnce();
    expect((await repair("canary", undefined)).put).not.toHaveBeenCalled();
  });
});
