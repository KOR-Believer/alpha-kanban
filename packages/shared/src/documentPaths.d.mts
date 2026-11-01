export class ReferenceError extends Error { code: string; constructor(code: string, message: string); }
export interface PortablePath { style: "posix" | "windows"; root: string; parts: string[]; path: string; }
export interface PathMove { from: string; to: string; }
export interface RootMapping { oldRoot: string; currentRoot: string; }
export function absolutePath(value: string): PortablePath;
export function pathKey(value: string): string;
export function within(root: string, target: string): boolean;
export function relativePath(fromDirectory: string, to: string): string | null;
export function parentPath(value: string): string;
export function resolvePath(base: string, value: string): string;
export function projectPath(value: string): string;
export function localUrlPath(value: string): string | null;
export function mappedPath(value: string, mappings: RootMapping[]): string | null;
export function movePath(value: string, moves: PathMove[]): string;
export function encodedPath(value: string, originalRaw?: string, originalDecoded?: string): string;
export function fileUrl(value: string): string;
