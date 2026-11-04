export type PathOwner =
  | { status: "unassigned"; value: null }
  | { status: "invalid"; value: null; folder?: string; folderPath?: string }
  | { status: "owned"; value: string; folder: string; folderPath: string; descendants: string[] };
export function normalizeOwner(value: unknown): string;
export function ownerFromPath(projectRelativePath: string, options?: { kind?: "file" | "directory"; documentRoot?: string | null }): PathOwner;
export function readOwnerHeader(markdown: string): { value: string | null; line: number | null };
export function checkNewOwner(markdown: string, expectedOwner: string | null): { value: string | null; line: number | null };
