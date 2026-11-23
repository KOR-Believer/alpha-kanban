import { fromMarkdown } from "mdast-util-from-markdown";
import GithubSlugger from "github-slugger";

export function revisionHeadings(markdown) {
  const slugger = new GithubSlugger();
  const headings = [];
  function text(node) {
    if (node.type === "html") return "";
    return node.value ?? node.children?.map(text).join("") ?? "";
  }
  function visit(node) {
    if (node.type === "heading") {
      const title = text(node);
      headings.push({ title, line: node.position.start.line, level: node.depth, anchor: slugger.slug(title) });
    } else node.children?.forEach(visit);
  }
  visit(fromMarkdown(markdown));
  return headings;
}
