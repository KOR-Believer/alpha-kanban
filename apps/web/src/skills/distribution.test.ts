import { describe, expect, it } from "vitest";
import { RELEASE_CHANNELS } from "../../release-channel.mjs";
import { english, korean } from "../i18n/messages";
import { skillAgentRequest, skillChannelLabel, skillDistribution } from "./distribution";

describe("app-pinned skill requests", () => {
  for (const channel of ["stable", "canary"] as const) for (const locale of ["ko", "en"] as const) for (const mode of ["install", "update"] as const) {
    it(`${channel} ${locale} ${mode} pins both payloads and completion to that app without resolving master`, () => {
      const config = RELEASE_CHANNELS[channel];
      const release = { ...__APP_RELEASE__, channel, canonicalOrigin: config.origin, skillBundle: "a".repeat(12), skillPayload: "b".repeat(64), skillArchive: "c".repeat(64) };
      const messages = locale === "ko" ? korean : english;
      const request = skillAgentRequest((key, values) => {
        expect(messages[key]).toBeTruthy();
        return messages[key]!.replace(/{{(\w+)}}/g, (_, name) => values?.[name] ?? "");
      }, mode, release);
      for (const suffix of [`.json`, `.zip`]) expect(request).toContain(`${config.origin}/downloads/implementation-ledger-${release.skillBundle}${suffix}`);
      expect(request).toContain(release.skillPayload); expect(request).toContain(release.skillArchive);
      expect(request).toContain(`${config.origin}/about#updates`);
      expect(request).not.toMatch(/\{\{|\/tree\/master|manifest\.json|localhost|127\.0\.0\.1|implementation-ledger-canary/);
      expect(request).toContain(locale === "ko" ? "검증에 실패하면 멈추고" : "verification fails, stop");
      expect(request).toContain(locale === "ko" ? "덮어쓰기 전에" : "before overwriting");
      expect(messages[skillChannelLabel(channel)]).toBeTruthy();
    });
  }
  it("rejects mismatched or missing pins instead of falling back to another source", () => {
    const release = { ...__APP_RELEASE__, channel: "canary" as const, canonicalOrigin: RELEASE_CHANNELS.canary.origin };
    for (const patch of [{ canonicalOrigin: RELEASE_CHANNELS.stable.origin }, { skillPayload: undefined }, { skillArchive: undefined }, { skillBundle: "latest" }]) {
      expect(() => skillDistribution({ ...release, ...patch })).toThrow("unavailable");
    }
  });
});
