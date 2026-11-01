// Source offsets let optional metadata edits preserve all non-target bytes.
export function scanDocumentHeader(markdown) {
  const lines = [];
  const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match;
  while ((match = pattern.exec(markdown)) && match[0]) {
    lines.push({ text: match[1], ending: match[2], start: match.index, end: pattern.lastIndex });
  }
  if (lines[0]?.text.startsWith("\uFEFF")) lines[0].text = lines[0].text.slice(1);
  let at = 0, frontMatterEnd = 0;
  if (lines[0]?.text === "---") {
    at = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)$/.test(line.text));
    if (at < 0) return { lines, fields: [], title: null, frontMatterEnd: lines.length, error: "UNCLOSED_FRONT_MATTER" };
    frontMatterEnd = ++at;
  }
  while (lines[at]?.text.trim() === "") at++;
  if (!/^#\s+\S/.test(lines[at]?.text ?? "")) return { lines, fields: [], title: null, frontMatterEnd, error: "MISSING_DOCUMENT_TITLE" };
  const title = at++;
  const fields = [];
  for (; at < lines.length; at++) {
    const line = lines[at];
    if (!line.text.trim()) continue;
    const field = /^([\p{L}][\p{L}\p{N} _-]*):[ \t]*(.*)$/u.exec(line.text);
    if (!field) {
      // A misspelled reserved field in the header is an error, not ordinary prose.
      if (/^\s*(?:ledger-format|document-id|owner)\s*(?::|$)/i.test(line.text)) {
        fields.push({ name: line.text.split(":")[0], value: line.text.split(":").slice(1).join(":"), line: at + 1, start: line.start, end: line.end, malformed: true });
      }
      break;
    }
    fields.push({ name: field[1], value: field[2], line: at + 1, start: line.start, end: line.end, malformed: false });
  }
  return { lines, fields, title, frontMatterEnd, error: null };
}

export function headerField(header, name) {
  const fields = header.fields.filter((field) => field.name.trim().toLowerCase() === name.toLowerCase());
  if (fields.length > 1) return { value: null, field: null, error: "DUPLICATE_FIELD" };
  const field = fields[0] ?? null;
  if (field && (field.name !== name || field.malformed)) return { value: null, field, error: "INVALID_FIELD" };
  return { value: field?.value ?? null, field, error: null };
}

export function structuralLedgerLines(markdown) {
  const header = scanDocumentHeader(markdown);
  let fence = "";
  return markdown.replace(/^\uFEFF/, "").split(/\r?\n/).map((line, index) => {
    if (index < header.frontMatterEnd) return "";
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = "";
      return "";
    }
    if (marker) { fence = marker; return ""; }
    return line;
  });
}
