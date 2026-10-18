import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { english, korean } from "./messages";

const base = path.resolve(import.meta.dirname, "..");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() && entry.name !== "i18n" ? files(path.join(dir, entry.name)) :
    /\.tsx?$/.test(entry.name) && !/\.test\.|Fixtures/.test(entry.name) ? [path.join(dir, entry.name)] : []);
const sources = files(base).map((file) => ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true));

describe("UI copy coverage", () => {
  it("keeps literal UI text and accessible labels in the translation catalog", () => {
    const missing: string[] = [];
    for (const source of sources) {
      const report = (node: ts.Node) => missing.push(`${path.relative(base, source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${node.getText(source)}`);
      function visit(node: ts.Node) {
        // Native language names must remain recognizable in either locale.
        if (ts.isJsxText(node) && /[A-Za-z가-힣]/.test(node.text) && !["한국어", "English"].includes(node.text.trim())) report(node);
        if (ts.isJsxAttribute(node) && /^(aria-label|title|label|description|placeholder|emptyLabel)$/.test(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
          if (!["/Users/.../project", "my-new-project"].includes(node.initializer.text)) report(node);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(missing).toEqual([]);
  });

  it("defines both translations for every static t() call", () => {
    const missing: string[] = [];
    for (const source of sources) {
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "t" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          if (!korean[key] || !english[key]) missing.push(key);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(missing).toEqual([]);
  });
});
