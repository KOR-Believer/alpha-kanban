import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { appendProgressNote, appendUserInstruction, inspectTicketCompatibility, parseTicketDocument, updateTicketStatusAndProgress } from "../src/ticketMarkdown";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = readFileSync(join(root, "skills/implementation-ledger/assets/tickets-template.md"), "utf8")
  .replace("{{OwnerHeader}}", "").replace("{{DocumentIdHeader}}", "").replace("{{PREFIX}}-00", "TEST-01").replaceAll(/\{\{[^}]+\}\}/g, "Example")
  .replaceAll("PREFIX-00", "TEST-01").replaceAll("PROJECT-00", "TEST-01");
const temp = mkdtempSync(join(tmpdir(), "ak-format-"));
const file = join(temp, "01_test_tickets.md");
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const withHeader = (header: string) => base.replace(/^(# .+\n)/, `$1\n${header}\n`);
const run = (tool: string, args: string[]) => spawnSync(process.execPath, [join(root, `skills/implementation-ledger/scripts/${tool}.mjs`), ...args], { encoding: "utf8" });

describe("one format contract across browser parser, writers and independent helpers", () => {
  const cases: Array<[string, string, boolean]> = [
    ["unversioned", base, true], ["explicit current", withHeader("Ledger-Format: 1"), true],
    ["future", withHeader("Ledger-Format: 2"), false], ["old unknown zero", withHeader("Ledger-Format: 0"), false],
    ["invalid", withHeader("Ledger-Format: v1"), false], ["empty", withHeader("Ledger-Format:"), false],
    ["duplicate", withHeader("Ledger-Format: 1\nLedger-Format: 1"), false],
    ["case variant", withHeader("ledger-format: 1"), false], ["indented", withHeader("  Ledger-Format: 2"), false],
    ["body example is not metadata", base + "\n```md\nLedger-Format: 999\n```\n", true],
    ["other-tool YAML is opaque", "---\ntitle: Original\nLedger-Format: 999\n---\n" + base, true],
    ["unclosed YAML", "---\ntitle: Original\n" + base, false],
    ["damaged state", base.replace("Status: TODO", "Status: UNKNOWN"), false],
    ["missing section", base.replace("## Ticket List", "## Notes"), false],
    ["mixed newlines", base.replace("\n", "\r\n"), false],
    ["plain markdown", "# Notes\n\nNothing to edit\n", false],
  ];
  it.each(cases)("%s agrees without a mutation", (_name, source, supported) => {
    writeFileSync(file, source);
    const result = inspectTicketCompatibility(source);
    expect(result.writable).toBe(supported);
    expect(parseTicketDocument(source).compatibility).toEqual(result);
    for (const tool of ["ticket-md", "check-ledger"]) {
      const execution = run(tool, tool === "ticket-md" ? ["show", file, "TEST-01"] : [file, "--legacy"]);
      expect(execution.status, execution.stderr + execution.stdout).toBe(supported ? 0 : 1);
    }
    if (!supported) {
      for (const mutate of [() => updateTicketStatusAndProgress(source, "TEST-01", { status: "READY", progress: 25 }),
        () => appendUserInstruction(source, "TEST-01", "No write"), () => appendProgressNote(source, "TEST-01", "No write")]) expect(mutate).toThrow();
      for (const command of [["status", file, "TEST-01", "--status", "READY", "--progress", "25"],
        ["append-user", file, "TEST-01", "No write"], ["append-note", file, "TEST-01", "No write"]]) {
        expect(run("ticket-md", command).status).toBe(1);
      }
    }
    expect(readFileSync(file, "utf8")).toBe(source);
  });

  it.each(["\n", "\r\n"])("keeps BOM, %j, metadata, unknown prose and another ticket intact", (eol) => {
    const header = "Ledger-Format: 1\nOwner: @alice\nDocument-ID: 33cfe3fc-a0ab-4d1e-9b8b-f30501a2bac1\nCustom: 그대로";
    const source = "\uFEFF" + ("---\ntitle: 원래 제목\n---\n" + withHeader(header)).trimEnd().replaceAll("\n", eol);
    writeFileSync(file, source);
    const execution = run("ticket-md", ["append-user", file, "TEST-01", "기록 보존"]);
    expect(execution.status, execution.stderr).toBe(0);
    const updated = readFileSync(file, "utf8");
    expect(updated.startsWith("\uFEFF---" + eol)).toBe(true);
    expect(updated.endsWith(eol)).toBe(false);
    expect(updated.slice(0, updated.indexOf("사용자 지시:"))).toBe(source.slice(0, source.indexOf("사용자 지시:")));
    expect(updated).toContain(header.replaceAll("\n", eol));
    if (eol === "\r\n") expect(updated.replaceAll("\r\n", "")).not.toContain("\n");
    expect(appendUserInstruction(source, "TEST-01", "기록 보존", { date: "2026-11-01" })).toContain(header.replaceAll("\n", eol));
  });

  it("never appends a ticket note into trailing non-ticket sections", () => {
    const suffix = "\n## Extra\n\nKeep this unknown section.\n";
    writeFileSync(file, base + suffix);
    expect(run("ticket-md", ["append-note", file, "TEST-01", "Targeted note"]).status).toBe(0);
    const updated = readFileSync(file, "utf8");
    expect(updated.endsWith(suffix)).toBe(true);
    expect(parseTicketDocument(updated).tickets[0]?.progressNotes.at(-1)?.text).toBe("Targeted note");
  });
  it("recognizes existing letter-suffix IDs and keeps peer notes outside the ticket", () => {
    const source = base.replaceAll("TEST-01", "TEST-01A") + "\n### Additional context\n\nLeave this peer section intact.\n";
    writeFileSync(file, source);
    expect(inspectTicketCompatibility(source).writable).toBe(true);
    expect(parseTicketDocument(source).tickets.map((ticket) => ticket.id)).toEqual(["TEST-01A"]);
    expect(run("check-ledger", [file]).status).toBe(0);
    expect(run("ticket-md", ["append-note", file, "TEST-01A", "Targeted note"]).status).toBe(0);
    const updated = readFileSync(file, "utf8");
    expect(updated.slice(updated.indexOf("### Additional context"))).toBe(source.slice(source.indexOf("### Additional context")));
    expect(run("check-ledger", [file]).status).toBe(0);
  });
  it("refuses invalid UTF-8 before helpers can replace undecodable bytes", () => {
    const bytes = Buffer.concat([Buffer.from(base), Buffer.from([0xff])]);
    writeFileSync(file, bytes);
    expect(run("ticket-md", ["append-user", file, "TEST-01", "No write"]).status).not.toBe(0);
    expect(run("check-ledger", [file]).status).not.toBe(0);
    expect(readFileSync(file)).toEqual(bytes);
  });
});
