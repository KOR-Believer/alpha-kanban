export type LedgerCompatibility = {
  status: "legacy" | "supported" | "unsupported" | "invalid";
  version: string | null;
  readable: boolean;
  writable: boolean;
  code: "UNSUPPORTED_FORMAT" | "INVALID_FORMAT" | "NEEDS_REPAIR" | null;
};
export function inspectLedgerFormat(markdown: string): LedgerCompatibility;
export function inspectTicketCompatibility(markdown: string): LedgerCompatibility;
export function assertTicketCompatibility(markdown: string): LedgerCompatibility;
export function structuralLedgerLines(markdown: string): string[];
