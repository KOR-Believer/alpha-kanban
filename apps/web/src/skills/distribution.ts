import { RELEASE_CHANNELS, releaseChannel } from "../../release-channel.mjs";
import type { ReleaseInfo } from "../pwa/releases";

export function skillChannelLabel(channel: ReleaseInfo["channel"]) {
  return releaseChannel(channel) === "canary" ? "Canary-provided skill" : "Stable-provided skill";
}

/** Public requests use the build's canonical channel, never the preview host or a mutable branch. */
export function skillDistribution(release: ReleaseInfo = __APP_RELEASE__) {
  const config = RELEASE_CHANNELS[releaseChannel(release.channel)];
  if ((release.canonicalOrigin !== undefined && release.canonicalOrigin !== config.origin) ||
    !/^[a-f0-9]{12}$/.test(release.skillBundle) || !/^[a-f0-9]{64}$/.test(release.skillPayload ?? "") || !/^[a-f0-9]{64}$/.test(release.skillArchive ?? "")) {
    throw new Error("Skill information is unavailable. Use the agent request instead.");
  }
  const filename = `implementation-ledger-${release.skillBundle}`;
  return {
    channel: config.channel, version: release.skillBundle,
    url: `${config.origin}/downloads/${filename}.json`, digest: release.skillPayload!,
    archiveUrl: `${config.origin}/downloads/${filename}.zip`, archiveDigest: release.skillArchive!,
    registrationUrl: `${config.origin}/about#updates`,
  };
}

export const INSTALL_REQUEST = "Install the complete implementation-ledger supplied by this app in the personal skill location used by this AI tool. If it is already installed, compare the changes first, back up the entire installation, preserve my customizations, and ask before overwriting.";
export const UPDATE_REQUEST = "Compare my installed implementation-ledger with the complete skill supplied by this app. Explain changes and conflicts with my customizations first. Back up the entire installation, preserve my edits, and ask before overwriting. Ask me to resolve conflicts that need a choice.";
export const PINNED_SKILL_REQUEST = "Use only this app-pinned bundle:\nJSON: {{url}}\nJSON SHA-256: {{digest}}\nZIP: {{archiveUrl}}\nZIP SHA-256: {{archiveDigest}}\nBundle: {{version}}\n\nVerify the downloaded JSON and ZIP hashes before using them. Compare every extracted skill file with the JSON file list and SHA-256 values, including references, assets, scripts, agents, and licenses. Install the complete folder, not only SKILL.md. If this bundle is unavailable or verification fails, stop; do not substitute the latest manifest, a branch, or another channel. The recorded source commit is provenance; a worktree bundle can differ from that commit. Finish other AI tasks and skill changes using this folder before replacing it. Do not run downloaded scripts or change project documents, other skills, or personal settings. Verify the installed file hashes after an approved change and report the bundle, actual source, and whether this AI tool recognizes it. Do not invent versions or release tags.";
export const INSTALL_COMPLETION = "Only after installation succeeds, print the actual installed directory as copyable text in your final chat or console response. Explain that registering this folder is optional for checking and confirming future updates in Alpha Kanban. Provide this registration link: {{registrationUrl}} . Never include the personal directory in the URL or report a failed installation as complete. If possible, open the containing folder in the file manager with implementation-ledger selected so I can drag it into Alpha Kanban.";

type Translate = (key: string, values?: Record<string, string>) => string;
export function skillAgentRequest(t: Translate, mode: "install" | "update", release: ReleaseInfo = __APP_RELEASE__) {
  const target = skillDistribution(release);
  return [t(mode === "install" ? INSTALL_REQUEST : UPDATE_REQUEST), t(PINNED_SKILL_REQUEST, target), t(INSTALL_COMPLETION, target)].join("\n\n");
}
