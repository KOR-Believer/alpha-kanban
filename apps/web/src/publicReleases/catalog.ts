import content from "./content.json";
import { releaseChannel, type ReleaseChannel } from "../../release-channel.mjs";
import { releaseRecords, type ReleaseInfo, type ReleaseRecord } from "../pwa/releases";
import type { PublicSection } from "../publicDocs/catalog";

export type ReleaseArticle = { sections: PublicSection[]; guides: string[]; example?: "owners" | "local-links" };
const articles = content as Record<ReleaseChannel, Record<string, ReleaseArticle>>;

// The running build is the boundary. No latest-manifest fetch, remote content or local documents.
export function publicReleases(release: ReleaseInfo, channel: ReleaseChannel = releaseChannel(release.channel)): ReleaseRecord[] {
  if (channel !== releaseChannel(release.channel)) return [];
  return releaseRecords(release).slice().sort((a, b) => b.date.localeCompare(a.date) || b.sequence - a.sequence);
}
export function releaseArticle(release: ReleaseInfo, id: string): ReleaseArticle | undefined {
  return publicReleases(release).some(row => row.id === id) ? articles[releaseChannel(release.channel)][id] : undefined;
}
export function releasePathId(pathname: string): string | null {
  if (pathname === "/releases" || pathname === "/releases/") return null;
  try { return decodeURIComponent(pathname.slice("/releases/".length)); } catch { return ""; }
}
