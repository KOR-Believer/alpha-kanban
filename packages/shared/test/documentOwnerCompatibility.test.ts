import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTicketDocument, updateTicketStatusAndProgress, appendUserInstruction } from "../src/ticketMarkdown";
import { parseMarkdownOutline } from "../src/documents";
import { checkNewOwner } from "../../../skills/implementation-ledger/scripts/lib/document-owner.mjs";

const skill = fileURLToPath(new URL("../../../skills/implementation-ledger/", import.meta.url));
function render(kind: string, owner: string | null) {
  return readFileSync(join(skill, "assets", `${kind}-template.md`), "utf8").replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    if (key === "OwnerHeader") return owner ? `Owner: ${owner}` : "";
    if (key === "PREFIX") return "OWN";
    if (key === "YYYY-MM-DD") return "2026-11-01";
    return "Fixture";
  });
}

describe("optional document Owner", () => {
  for (const kind of ["plan", "tickets", "inventory"]) {
    it(`${kind} templates produce ordinary and owned headers without YAML or empty Owner`, () => {
      const basic = render(kind, null);
      const owned = render(kind, "@alice");
      expect(checkNewOwner(basic, null).value).toBe(null);
      expect(basic).not.toContain("Owner:");
      expect(basic).not.toContain("{{OwnerHeader}}");
      expect(checkNewOwner(owned, "@alice").value).toBe("@alice");
      expect(owned.replace("Owner: @alice", "")).toBe(basic);
      expect(parseMarkdownOutline(owned).map(item => ({ title: item.title, level: item.level }))).toEqual(parseMarkdownOutline(basic).map(item => ({ title: item.title, level: item.level })));
    });
  }

  for (const eol of ["\n", "\r\n"]) for (const bom of ["", "\uFEFF"]) {
    it(`normal ticket edits preserve Owner and all non-target bytes (${JSON.stringify(eol)}, BOM=${!!bom})`, () => {
      const basic = bom + render("tickets", null).replaceAll("\n", eol);
      const owned = bom + render("tickets", "@alice").replaceAll("\n", eol);
      const mutate = (text: string) => appendUserInstruction(updateTicketStatusAndProgress(text, "OWN-00", { status: "READY", progress: 25 }), "OWN-00", "Keep the existing work history.", { date: "2026-11-01" });
      const next = mutate(owned);
      expect(next.replace("Owner: @alice", "")).toBe(mutate(basic));
      expect(checkNewOwner(next, "@alice").value).toBe("@alice");
      const document = parseTicketDocument(next);
      expect(document.missingSections).toEqual([]);
      expect(document.tickets[0]).toMatchObject({ id: "OWN-00", status: "READY", progress: 25, missingFields: [] });
      expect(document.tickets[0]?.userInstructions.at(-1)?.text).toBe("Keep the existing work history.");
      const scratch = mkdtempSync(join(tmpdir(), "ledger-owner-compat-"));
      try {
        const file = join(scratch, "01_fixture_tickets.md"); writeFileSync(file, next);
        expect(execFileSync(process.execPath, [join(skill, "scripts/check-ledger.mjs"), file], { encoding: "utf8" })).toContain("OK");
      } finally { rmSync(scratch, { recursive: true, force: true }); }
    });
  }
});
