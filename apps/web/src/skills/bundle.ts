export type SkillFile = { path: string; content: string; sha256: string };
export type SkillBundle = {
  schema: 1; name: "implementation-ledger"; version: string; files: SkillFile[];
  known: Array<{ source: string; files: Array<Pick<SkillFile, "path" | "sha256">> }>;
};
export const MAX_FILES = 100;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 512 * 1024;
export function safeSkillPath(path: string) {
  return typeof path === "string" && path.length <= 240 && path.split("/").length <= 6 &&
    path.split("/").every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part) && !part.endsWith(".") && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}
export async function skillHash(content: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)));
}
function hex(value: ArrayBuffer) { return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function validPaths(files: Array<Pick<SkillFile, "path" | "sha256">>) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) return false;
  const names = new Set<string>();
  for (const file of files) {
    if (!file || !safeSkillPath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || names.has(file.path.toLowerCase())) return false;
    names.add(file.path.toLowerCase());
  }
  return files.some((file) => file.path === "SKILL.md") && !files.some((file) => file.path.split("/").slice(0, -1).some((_, index, parts) => names.has(parts.slice(0, index + 1).join("/").toLowerCase())));
}
export function isLedgerSkill(content: string) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)?.[1];
  return Boolean(frontmatter && /^name:\s*["']?implementation-ledger["']?\s*$/m.test(frontmatter));
}
export async function validateBundle(value: unknown, expected: string, digest?: string): Promise<SkillBundle> {
  const bundle = value as SkillBundle;
  if (!bundle || bundle.schema !== 1 || bundle.name !== "implementation-ledger" || !/^[a-f0-9]{12}$/.test(expected) || bundle.version !== expected ||
    !validPaths(bundle.files) || !Array.isArray(bundle.known) || bundle.known.length > 100 || !bundle.known.every((item) => item && /^[a-f0-9]{40}$/.test(item.source) && validPaths(item.files))) throw new Error("Invalid skill bundle.");
  let size = 0;
  let joined = "";
  for (const file of bundle.files) {
    if (typeof file.content !== "string") throw new Error("Invalid skill bundle.");
    const bytes = new TextEncoder().encode(file.content).length;
    size += bytes;
    if (bytes > MAX_FILE_BYTES || size > MAX_BYTES || await skillHash(file.content) !== file.sha256) throw new Error("Invalid skill bundle.");
    joined += "implementation-ledger/" + file.path + file.content;
  }
  if ((await skillHash(joined)).slice(0, 12) !== expected || !isLedgerSkill(bundle.files.find((file) => file.path === "SKILL.md")!.content) ||
    (digest !== undefined && (!/^[a-f0-9]{64}$/.test(digest) || await skillHash(JSON.stringify(bundle)) !== digest))) throw new Error("Invalid skill bundle.");
  return bundle;
}
export async function loadSkillBundle(version = __APP_RELEASE__.skillBundle, digest = __APP_RELEASE__.skillPayload) {
  if (!/^[a-f0-9]{12}$/.test(version) || !digest) throw new Error("Skill information is unavailable. Use the agent request instead.");
  const response = await fetch(`/downloads/implementation-ledger-${version}.json`, { signal: AbortSignal.timeout(15_000) });
  return readSkillBundle(response, version, digest);
}
export async function readSkillBundle(response: Response, version: string, digest: string) {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Skill information is unavailable. Use the agent request instead.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Invalid skill bundle.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES * 3) throw new Error("Invalid skill bundle.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader.cancel(); }
  return validateBundle(JSON.parse(text), version, digest);
}
