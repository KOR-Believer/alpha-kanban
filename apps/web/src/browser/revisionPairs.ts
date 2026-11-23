import { formatRevisionLink, parseRevisionLink } from "@alpha-kanban/shared/revisionLinks";

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] };
function link(node: Node | undefined) {
  return node?.tagName === "a" && typeof node.properties?.href === "string" ? node.properties.href : "";
}

// Run after Markdown resolves reference definitions. Collapse only the exact pair
// emitted by the authoring tool, leaving unrelated links and prose in place.
export function rehypeRevisionPairs() {
  function visit(node: Node) {
    const children = node.children;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const first = children[i]!;
      const separator = children[i + 1];
      if (separator?.type === "text" && /^\s+·\s+$/.test(separator.value ?? "")) {
        const custom = link(first), web = link(children[i + 2]);
        if (/^web\+akgit:/i.test(custom) && /^https:\/\//i.test(web)) {
          const a = parseRevisionLink(custom), b = parseRevisionLink(web);
          if (a && b && formatRevisionLink(a) === formatRevisionLink(b)) {
            first.properties!.dataRevisionWeb = "true";
            children.splice(i + 1, 2);
          }
        }
      }
      visit(first);
    }
  }
  return visit;
}
