import { describe, expect, it } from "vitest";
import { documentPresentation } from "../src/documentPresentation.mjs";

const id = "a66c536c-107a-499b-a071-880d858aba67";
describe("read-only document header presentation", () => {
  it.each(["\n", "\r\n"])("preserves source line positions, other fields and examples with %j", (eol) => {
    const source = ["\uFEFF# Example", "Owner: @alice", `Document-ID: ${id}`, "Author: Keep this", "", "## Body", "", "Owner: @body", "", "```md", `Document-ID: ${id}`, "```", ""].join(eol);
    const result = documentPresentation(source);
    expect(result.fields).toEqual([{ name: "Owner", value: "@alice", line: 2 }, { name: "Document-ID", value: id, line: 3 }]);
    expect(result.markdown.split(eol)).toEqual(source.split(eol).map((line, index) => index === 1 || index === 2 ? "" : line));
    expect(result.markdown.split(eol)[5]).toBe("## Body");
  });
  it.each(["Owner: @alice\nOwner: @bob", "Owner: nobody", "owner: @alice", "Owner: @alice Document-ID: " + id])("keeps unrecognized or invalid fields visible: %s", (header) => {
    const source = `# Example\n${header}\n\nBody\n`;
    expect(documentPresentation(source)).toEqual({ markdown: source, fields: [] });
  });
  it("does not treat YAML or code samples as properties and does not gate future-format rendering", () => {
    const source = `---\nOwner: @yaml\n---\n# Example\nLedger-Format: 99\nOwner: @alice\n\n\
\`\`\`md\nOwner: @example\n\`\`\`\n`;
    const result = documentPresentation(source);
    expect(result.fields.map((field) => field.value)).toEqual(["@alice"]);
    expect(result.markdown).toContain("Owner: @yaml"); expect(result.markdown).toContain("Owner: @example");
    expect(result.markdown).toContain("Ledger-Format: 99");
  });
});
