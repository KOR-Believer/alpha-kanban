import type { SkillBundle, SkillFile } from "./bundle";

type FileIdentity = Pick<SkillFile, "path" | "sha256">;
export type SkillInstallation =
  | { kind: "current"; bundle: string }
  | { kind: "known"; source: string }
  | { kind: "unknown" };

export function sameSkillFiles(a: FileIdentity[], b: FileIdentity[]) {
  return a.length === b.length && a.every((file) => b.some((other) => other.path === file.path && other.sha256 === file.sha256));
}

/** Display identity only; update eligibility is still checked by SkillRepository. */
export function identifySkillInstallation(files: FileIdentity[], bundle: SkillBundle): SkillInstallation {
  if (sameSkillFiles(files, bundle.files)) return { kind: "current", bundle: bundle.version };
  const known = bundle.known.find((release) => sameSkillFiles(files, release.files));
  // Older records identify a source commit, not a published bundle ID.
  return known ? { kind: "known", source: known.source } : { kind: "unknown" };
}
