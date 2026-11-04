import type { ReleaseChannel } from "../../release-channel.mjs";

export type ReleaseRecord = {
  id: string; sequence: number; date: string; notify: boolean;
  notes: { ko: string[]; en: string[] };
  skill?: { compatibility: "compatible" | "unknown"; notes: { ko: string[]; en: string[] } };
};
export type ReleaseInfo = {
  app: string; mode: "app" | "recovery" | "retired"; protocol: number; buildId: string; storageSchema: number;
  channel?: ReleaseChannel; canonicalOrigin?: string;
  skillBundle: string; skillVersion: string | null; documentFormat: number | null;
  skillPayload?: string;
  skillArchive?: string;
  notes: { ko: string[]; en: string[] };
  releaseId?: string; history?: ReleaseRecord[];
};

export function parseHistory(value: unknown): ReleaseRecord[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new Error("Invalid release history.");
  const ids = new Set<string>();
  let sequence = 0;
  for (const row of value as ReleaseRecord[]) {
    if (!row || !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(row.id) || ids.has(row.id) ||
      !Number.isSafeInteger(row.sequence) || row.sequence <= sequence || typeof row.notify !== "boolean" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date ||
      !validNotes(row.notes) || (row.skill !== undefined && (!row.skill || !["compatible", "unknown"].includes(row.skill.compatibility) || !validNotes(row.skill.notes)))) {
      throw new Error("Invalid release history.");
    }
    ids.add(row.id); sequence = row.sequence;
  }
  return value as ReleaseRecord[];
}
function validNotes(value: ReleaseRecord["notes"]) {
  return [value?.ko, value?.en].every((notes) => Array.isArray(notes) && notes.length > 0 && notes.length <= 30 && notes.every((note) => typeof note === "string" && note.trim() && note.length <= 2000));
}

export function releaseRecords(release: ReleaseInfo): ReleaseRecord[] {
  return release.history?.filter((row) => row.sequence <= (release.history!.find((item) => item.id === release.releaseId)?.sequence ?? 0)) ?? [];
}

export function releaseKey(release: ReleaseInfo) { return release.releaseId ?? release.buildId; }

const PREFIX = "alpha-kanban.releases.v1.";
const fallback = new Map<string, string>();
function read(key: string) { try { return fallback.get(key) ?? localStorage.getItem(PREFIX + key); } catch { return fallback.get(key); } }
function write(key: string, value: string) { try { localStorage.setItem(PREFIX + key, value); fallback.delete(key); } catch { fallback.set(key, value); } }

export function observeRelease(release: ReleaseInfo) {
  const records = releaseRecords(release);
  if (!read("baseline") && records.length) write("baseline", String(records.at(-1)!.sequence));
}
export function unreadReleases(release: ReleaseInfo) {
  const baseline = Number(read("baseline"));
  if (!baseline) return [];
  return releaseRecords(release).filter((row) => row.notify && row.sequence > baseline && !read("read." + row.id));
}
export function markReleasesRead(records: ReleaseRecord[]) { records.forEach((row) => write("read." + row.id, "1")); }
export function wasNotified(release: ReleaseInfo) { return Boolean(read("notified." + releaseKey(release))); }
export function markNotified(release: ReleaseInfo) { write("notified." + releaseKey(release), "1"); }
