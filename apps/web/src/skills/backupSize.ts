import type { SkillFile } from "./bundle";

// File contents only: IndexedDB's own encoding, handles and record overhead are browser-dependent.
export function skillBackupContentBytes(record: { before: Pick<SkillFile, "content">[]; intended: Pick<SkillFile, "content">[] }) {
  const encoder = new TextEncoder();
  return [...record.before, ...record.intended].reduce((total, file) => total + encoder.encode(file.content).length, 0);
}

export function formatSkillBytes(bytes: number, language: string) {
  const divisor = bytes >= 1_000_000 ? 1_000_000 : bytes >= 1_000 ? 1_000 : 1;
  return new Intl.NumberFormat(language, {
    style: "unit", unit: divisor === 1_000_000 ? "megabyte" : divisor === 1_000 ? "kilobyte" : "byte", maximumFractionDigits: 1,
  }).format(bytes / divisor);
}
