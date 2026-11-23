export type RevisionTarget = { commit: string; path: string; repo?: string; anchor?: string };
export const revisionProtocol: "web+akgit";
export function validRepoHint(repo: unknown): boolean;
export function normalizeGitRemote(value: string): string | undefined;
export function revisionLines(anchor?: string): {start: number; end: number} | undefined;
export function formatRevisionLink(target: RevisionTarget): string;
export function revisionWebUrl(target: RevisionTarget): string | undefined;
export function parseRevisionLink(source: string): RevisionTarget | undefined;
export function revisionCitation(target: RevisionTarget, options?: { label?: string; published?: boolean; webLabel?: string }): {target: RevisionTarget; href: string; web?: string; markdown: string};
