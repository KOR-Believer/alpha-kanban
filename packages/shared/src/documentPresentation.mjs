import { scanDocumentHeader, headerField } from "../../../skills/implementation-ledger/scripts/lib/document-header.mjs";
import { readDocumentMetadata } from "../../../skills/implementation-ledger/scripts/lib/document-metadata.mjs";

/** Reading only: preserve original line numbers while presenting valid header fields separately. */
export function documentPresentation(markdown) {
  const header = scanDocumentHeader(markdown), metadata = readDocumentMetadata(markdown);
  const fields = [];
  for (const [name, value] of [["Owner", metadata.owner], ["Document-ID", metadata.documentId]]) {
    const field = headerField(header, name).field;
    if (value.status === "valid" && field) fields.push({ name, value: value.raw, line: field.line, start: field.start, end: field.end - header.lines[field.line - 1].ending.length });
  }
  let body = markdown;
  for (const field of [...fields].sort((a, b) => b.start - a.start)) body = body.slice(0, field.start) + body.slice(field.end);
  return { markdown: body, fields: fields.map(({ name, value, line }) => ({ name, value, line })) };
}
