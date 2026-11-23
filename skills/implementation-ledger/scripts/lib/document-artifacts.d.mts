export function inferSlug(filePath: string): string;
export function isDocumentAssetPath(relativePath: string, documentRoot?: string | null): boolean;
export function isArtifactOutputPath(relativePath: string): boolean;
export function artifactDirectories(relativePath: string, documentRoot: string): { slug: string; fixtures: string; references: string; runEvidence: string | null };
export function artifactOutput(slug: string, documentId: string | null): string | null;
