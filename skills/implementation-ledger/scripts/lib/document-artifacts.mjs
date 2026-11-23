import { ContextError } from "./context-error.mjs";
import { DEFAULT_DOCUMENT_ROOT, withinDocumentRoot } from "./document-root.mjs";

// The document set, its attachments and its smoke runs use the same filename slug.
export function inferSlug(filePath) {
  return (filePath.split(/[\\/]/).at(-1) ?? filePath).replace(/\.md$/, "")
    .replace(/^\d+_/, "").replace(/_(smoke_run|smoke|tickets|plan|inventory)$/, "");
}

const assetCategories = new Set(["fixtures", "references", "runs"]);
const OUTPUT_ROOT = ".output/alpha-kanban";

export function isDocumentAssetPath(relativePath, documentRoot = DEFAULT_DOCUMENT_ROOT) {
  if (!withinDocumentRoot(relativePath, documentRoot)) return false;
  const parts = relativePath.slice(documentRoot.length + 1).split("/");
  return parts.some((part, i) => part === "assets" && parts[i + 1] && assetCategories.has(parts[i + 2]));
}

export function isArtifactOutputPath(relativePath) {
  return relativePath === ".output" || relativePath.startsWith(".output/");
}

export function artifactDirectories(relativePath, documentRoot) {
  if (documentRoot && isArtifactOutputPath(documentRoot)) {
    throw new ContextError("ARTIFACT_ROOT_CONFLICT", "The document root overlaps the ignored output directory. Keep tracked documents outside .output/.", { source: documentRoot });
  }
  if (!withinDocumentRoot(relativePath, documentRoot) || relativePath === documentRoot ||
      !relativePath.endsWith(".md") || isDocumentAssetPath(relativePath, documentRoot) || isArtifactOutputPath(relativePath)) {
    throw new ContextError("ARTIFACT_SOURCE", "Select a work Markdown file inside the configured document root.", { source: relativePath });
  }
  const filename = relativePath.split("/").at(-1);
  const slug = inferSlug(filename);
  // A legacy filename can be readable Markdown without providing a portable directory name.
  if (!slug || slug === "." || slug === ".." || /[. ]$|[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(slug)
      || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(slug) || filename.includes("\\")) {
    throw new ContextError("ARTIFACT_SLUG", "The filename does not yield a safe cross-platform folder name.", { source: relativePath });
  }
  const assets = relativePath.slice(0, -filename.length) + "assets/" + slug;
  return { slug, fixtures: assets + "/fixtures", references: assets + "/references",
    runEvidence: filename.endsWith("_smoke_run.md") ? assets + "/runs/" + filename.slice(0, -3) : null };
}

export function artifactOutput(slug, documentId) {
  return documentId ? OUTPUT_ROOT + "/" + slug + "/" + documentId : null;
}
