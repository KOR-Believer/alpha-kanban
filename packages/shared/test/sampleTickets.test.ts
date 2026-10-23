import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseTicketDocument, updateTicketStatusAndProgress } from "../src/ticketMarkdown";

const root = new URL("../../../", import.meta.url);
const samplePath = new URL("examples/sample_tickets.md", root);
const sample = readFileSync(samplePath, "utf8");

describe("README sample tickets", () => {
  it.each(["README.md", "README.en.md"])("%s links to the validated sample", (readme) => {
    expect(readFileSync(new URL(readme, root), "utf8")).toContain("](examples/sample_tickets.md)");
  });

  it("uses the current ledger structure without duplicate status tables or embedded templates", () => {
    expect(sample.match(/^## .+$/gm)).toEqual([
      "## Status",
      "## 확인·결정이 필요한 사항",
      "## Ticket List",
    ]);
    expect(sample).toContain("## 확인·결정이 필요한 사항\n\n- 없음\n");
    expect(sample).toContain("- 기준 문서: 없음");
    const output = execFileSync(process.execPath, [
      fileURLToPath(new URL("skills/implementation-ledger/scripts/check-ledger.mjs", root)),
      fileURLToPath(samplePath),
    ], { encoding: "utf8" });
    expect(output).toContain("2 ticket(s)\nOK");
  });

  it("parses both sample tickets and updates only the selected ticket", () => {
    const before = parseTicketDocument(sample);
    expect(before.missingSections).toEqual([]);
    expect(before.status).toMatchObject({ doneTickets: 0, totalTickets: 2 });
    expect(before.tickets).toMatchObject([
      { id: "SMP-01", status: "READY", progress: 25, missingFields: [] },
      { id: "SMP-02", status: "TODO", progress: 0, missingFields: [] },
    ]);

    const updated = updateTicketStatusAndProgress(sample, "SMP-02", {
      status: "IN_PROGRESS",
      progress: 50,
      reason: "Sample verification",
    });
    const after = parseTicketDocument(updated);
    expect(after.tickets[0]).toEqual(before.tickets[0]);
    expect(after.tickets[1]).toMatchObject({ status: "IN_PROGRESS", progress: 50 });
    expect(after.tickets[1]?.userInstructions.slice(0, -1)).toEqual(before.tickets[1]?.userInstructions);
    expect(after.tickets[1]?.userInstructions.at(-1)?.text).toContain("Sample verification");
    expect(after.tickets[1]?.progressNotes.map((note) => note.raw)).toEqual(
      before.tickets[1]?.progressNotes.map((note) => note.raw),
    );
    expect(after.tickets[1]?.completionCriteria).toEqual(before.tickets[1]?.completionCriteria);
    expect(after.tickets[1]?.validation).toEqual(before.tickets[1]?.validation);
    expect(after.status).toMatchObject({ doneTickets: 0, totalTickets: 2 });
    expect(updated).not.toContain("## Progress Board");
  });
});
