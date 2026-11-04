export function parseSettings(text: string, kind: "config" | "user", source?: string | null, selectedKey?: string | null): { present: boolean; value: string | boolean | null };
export const DEFAULT_DOCUMENT_ROOT: "docs";
export function normalizeDocumentRoot(value: string): string;
