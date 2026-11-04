import { ContextError } from "./context-error.mjs";
import { normalizeOwner } from "./document-owner.mjs";
import { normalizeDocumentRoot } from "./document-root.mjs";

// Git-config-compatible scalar syntax, deliberately without includes or merging.
export function parseSettings(text, kind, source = null, selectedKey = null) {
  const sectionName = kind === "config" ? "documents" : "user";
  const keyName = (selectedKey ?? (kind === "config" ? "ownerfolders" : "id")).toLowerCase();
  const fail = (code, message, line) => { throw new ContextError(code, message, { source, line }); };
  let section = null;
  const seen = new Set();
  let found = false;
  let value = null;
  for (const [index, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const line = index + 1;
    const text = raw.trim();
    if (!text || /^[#;]/.test(text)) continue;
    if (text.startsWith("[")) {
      const match = /^\[([a-z][a-z0-9-]*)\]\s*(?:[#;].*)?$/i.exec(text);
      if (!match) {
        if (selectedKey) { section = null; continue; }
        fail("SETTINGS_SYNTAX", "Use a plain [documents] or [user] section; subsections and includes are unsupported.", line);
      }
      section = match[1].toLowerCase();
      if (!selectedKey && section !== sectionName) fail(section === "user" || section === "documents" ? "SETTINGS_ROLE" : "SETTINGS_KEY", `Unsupported section [${section}] in .ak.${kind}.`, line);
      continue;
    }
    const match = /^([a-z][a-z0-9-]*)\s*=(.*)$/i.exec(text);
    // Reading placement/ownership must not depend on an unrelated user or policy
    // value. Default creation still validates the complete shared settings file.
    if (selectedKey && (match ? match[1].toLowerCase() !== keyName : !new RegExp(`^${keyName}\\b`, "i").test(text))) continue;
    if (!match || !section) fail("SETTINGS_SYNTAX", "Use key = value inside its section. Values must be explicit and on one line.", line);
    if (section !== sectionName) fail("SETTINGS_ROLE", `Put ${keyName} in [${sectionName}].`, line);
    const key = match[1].toLowerCase();
    if (!(kind === "config" ? ["ownerfolders", "root"] : ["id"]).includes(key)) fail("SETTINGS_KEY", `Unsupported key ${section}.${match[1]} in .ak.${kind}.`, line);
    if (seen.has(key)) fail("SETTINGS_DUPLICATE", `Duplicate ${section}.${match[1]}; remove the duplicate instead of relying on last-value wins.`, line);
    seen.add(key);
    let scalar;
    try { scalar = parseScalar(match[2]); }
    catch (error) { fail("SETTINGS_SYNTAX", error.message, line); }
    if (key === "root") {
      try { scalar = normalizeDocumentRoot(scalar); }
      catch (error) { fail(error.diagnostic.code, error.message, line); }
    } else if (kind === "config") {
      if (scalar !== "true" && scalar !== "false") fail("SETTINGS_VALUE", "ownerFolders must be true or false.", line);
      scalar = scalar === "true";
    } else {
      try { scalar = normalizeOwner(scalar); }
      catch (error) { fail(error.diagnostic.code, error.message, line); }
    }
    if (key === keyName) { found = true; value = scalar; }
  }
  return { present: found, value };
}

function parseScalar(input) {
  let quoted = false;
  let value = "";
  let whitespace = "";
  const escaped = { n: "\n", t: "\t", b: "\b", "\\": "\\", '"': '"' };
  for (let index = 0; index < input.length; index++) {
    let char = input[index];
    if (!quoted && (char === "#" || char === ";")) break;
    if (char === '"') {
      value += whitespace;
      whitespace = "";
      quoted = !quoted;
      continue;
    }
    if (char === "\\") {
      char = escaped[input[++index]];
      if (char === undefined) throw new Error("Invalid escape or multiline value.");
    } else if (!quoted && /[ \t]/.test(char)) {
      if (value) whitespace += char;
      continue;
    }
    value += whitespace + char;
    whitespace = "";
  }
  if (quoted) throw new Error("Unclosed quoted value.");
  if (/[\r\n\0]/.test(value)) throw new Error("Values must be single-line text without NUL bytes.");
  return value;
}
