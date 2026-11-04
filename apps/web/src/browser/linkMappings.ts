import type { BrowserStorage } from "./storage";
import { RepoDiscovery, inspectRepo, type GrantedRoot, type RepoCandidate, type RepoScan } from "./gitDiscovery";
import { LocalLinkError, folderPrefixes, normalizeLink, readLinkedFile, relativeToPrefix, type LinkPath } from "./linkPaths";

export type LinkContext = { scopeId: string; label: string; root: FileSystemDirectoryHandle; path: string; documentId: string;
  origin?: { scopeId: string; label: string }; connection?: LinkMapping };
export type LinkTarget = { handle: FileSystemDirectoryHandle; label: string; repo?: RepoCandidate };
export type LinkProposal = { prefix: string; relative: string };
export type LinkPreview = { target: LinkTarget; prefix: string; relative: string; overlap?: LinkMapping; expected?: LinkMapping };
export type LinkMapping = {
  id: string; revision: string; scopeId: string; sourceLabel: string; prefix: string; example: string;
  handle: FileSystemDirectoryHandle; label: string; remotes: string[]; method: "manual" | "repo" | "git-path";
};
export type LinkedResource = {
  file: File; handle: FileSystemFileHandle; path: string; fragment: string; context: LinkContext; mapping?: LinkMapping;
};
export type LinkAttempt = { location: LinkPath; resource?: LinkedResource; mapping?: LinkMapping; error?: LocalLinkError };
type LinkRecord = { id: string; handle: FileSystemFileHandle };
export type LinkedDocumentRecord = LinkRecord & { context: LinkContext };
type Lock = <T>(name: string, fn: () => Promise<T>) => Promise<T>;
const lock: Lock = (name, fn) => navigator.locks.request("alpha-kanban:" + name, fn);

export class LinkMappings {
  readonly discovery = new RepoDiscovery();
  private readonly prefix: string;
  readonly autoDiscover: boolean;
  constructor(private readonly storage: BrowserStorage, private readonly roots: () => Promise<GrantedRoot[]>,
    options: { experiment?: { namespace: string; autoDiscover: boolean }; lock?: Lock } = {}) {
    // This seam is for isolated A/B fixtures, never a query parameter or a public mode.
    this.prefix = options.experiment ? "link-experiment:" + encodeURIComponent(options.experiment.namespace) + ":" : "link-mapping:v1:";
    this.autoDiscover = options.experiment?.autoDiscover ?? true;
    this.withLock = options.lock ?? lock;
  }
  private readonly withLock: Lock;
  scope(context: LinkContext, location: LinkPath) { return location.absolute ? context.origin ?? context : context; }
  private key(scope: string, prefix: string) { return this.prefix + "map:" + encodeURIComponent(scope) + ":" + encodeURIComponent(prefix); }
  private async get<T>(key: string) {
    try { return await this.storage.get<T>(key); }
    catch { throw new LocalLinkError("storage", "Saved link connections could not be read. Try again before changing a connection."); }
  }

  async list(scopeId?: string): Promise<LinkMapping[]> {
    try { return (await this.storage.entries<LinkMapping>(this.prefix + "map:" + (scopeId ? encodeURIComponent(scopeId) + ":" : ""))).map((row) => row.value); }
    catch { throw new LocalLinkError("storage", "Saved link connections could not be read. Try again before changing a connection."); }
  }
  async remove(mapping: LinkMapping) {
    await this.withLock(this.prefix + "scope:" + mapping.scopeId, () => this.withLock(this.key(mapping.scopeId, mapping.prefix), async () => {
      const key = this.key(mapping.scopeId, mapping.prefix);
      const current = await this.get<LinkMapping>(key);
      if (current?.revision !== mapping.revision) throw new LocalLinkError("changed", "This connection changed in another window. Open the link again.");
      try { await this.storage.delete(key); }
      catch { throw new LocalLinkError("storage", "The link connection could not be saved. Your previous connection is unchanged."); }
    }));
  }
  async scan(options: NonNullable<Parameters<RepoDiscovery["scan"]>[1]> & { preferred?: LinkContext } = {}): Promise<RepoScan> {
    if (!this.autoDiscover) return { repos: [], complete: false, visited: 0, reasons: ["disabled"] };
    const roots = await this.roots();
    if (options.preferred) {
      const context = options.preferred;
      const others = [];
      for (const root of roots) if (!await root.handle.isSameEntry(context.root)) others.push(root);
      return this.discovery.scan([{ id: "scope:" + context.scopeId, name: context.label, handle: context.root }, ...others], options);
    }
    return this.discovery.scan(roots, options);
  }

  // Probe exact suffix paths only. A suggestion is not evidence of the author's repo identity.
  async propose(location: LinkPath, target: LinkTarget, signal?: AbortSignal): Promise<LinkProposal[]> {
    const proposals: LinkProposal[] = [];
    for (const prefix of folderPrefixes(location.path).reverse()) {
      signal?.throwIfAborted();
      const relative = relativeToPrefix(location.path, prefix);
      if (!relative) continue;
      try { await readLinkedFile(target.handle, relative); proposals.push({ prefix, relative }); }
      catch (error) { if (!(error instanceof LocalLinkError) || error.code !== "missing") throw error; }
    }
    signal?.throwIfAborted();
    return proposals;
  }

  async preview(context: LinkContext, location: LinkPath, prefix: string, target: LinkTarget, expected?: LinkMapping): Promise<LinkPreview> {
    const rows = await this.list(this.scope(context, location).scopeId);
    const current = rows.find((row) => row.prefix === prefix);
    if (current?.revision !== expected?.revision) throw new LocalLinkError("changed", "This connection changed in another window. Open the link again.");
    const overlap = rows.filter((row) => row.prefix.length > prefix.length && relativeToPrefix(location.path, row.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (overlap) {
      await this.validateMapping(overlap, location);
      return { target: { handle: overlap.handle, label: overlap.label }, prefix: overlap.prefix, relative: relativeToPrefix(location.path, overlap.prefix)!, overlap, expected };
    }
    const relative = relativeToPrefix(location.path, prefix);
    if (!relative) throw new LocalLinkError("invalid", "Choose a folder prefix that contains this file.");
    await readLinkedFile(target.handle, relative);
    return { target, prefix, relative, expected };
  }

  private async resource(context: LinkContext, path: string, fragment: string, mapping?: LinkMapping): Promise<LinkedResource> {
    const result = await readLinkedFile(context.root, path);
    const key = this.prefix + "document:" + encodeURIComponent(context.scopeId) + ":" + encodeURIComponent(path);
    const record = await this.withLock(key, async () => {
      const saved = await this.get<LinkRecord>(key);
      if (saved && await saved.handle.isSameEntry(result.handle)) return saved;
      const created = { id: "ld_" + crypto.randomUUID(), handle: result.handle };
      try { await this.storage.set(key, created); }
      catch { throw new LocalLinkError("storage", "The link connection could not be saved. Your previous connection is unchanged."); }
      return created;
    });
    const linkedContext = { ...context, path, documentId: record.id };
    try { await this.storage.set(this.prefix + "page:" + record.id, { ...record, context: linkedContext } satisfies LinkedDocumentRecord); }
    catch { throw new LocalLinkError("storage", "The link connection could not be saved. Your previous connection is unchanged."); }
    return { ...result, path, fragment, context: linkedContext, mapping };
  }

  async document(id: string): Promise<LinkedDocumentRecord | undefined> {
    if (!/^ld_[a-zA-Z0-9-]+$/.test(id)) return;
    return this.get<LinkedDocumentRecord>(this.prefix + "page:" + id);
  }
  async openDocument(record: LinkedDocumentRecord, fragment = ""): Promise<LinkedResource> {
    const { context } = record;
    const binding = context.connection;
    let mapping: LinkMapping | undefined;
    if (binding) {
      mapping = await this.get<LinkMapping>(this.key(binding.scopeId, binding.prefix));
      if (!mapping || mapping.id !== binding.id) throw new LocalLinkError("changed", "This document's connection was removed or changed. Reconnect it to continue.");
      await this.validateMapping(mapping, { path: mapping.prefix.replace(/\/$/, "") + "/" + context.path, fragment, absolute: !mapping.prefix.startsWith(".") });
    }
    const result = await readLinkedFile(context.root, context.path);
    if (!await record.handle.isSameEntry(result.handle)) throw new LocalLinkError("changed", "The linked file was replaced. Reconnect it to confirm the current file.");
    return { ...result, path: context.path, fragment, context, mapping };
  }
  async reconnectDocument(record: LinkedDocumentRecord): Promise<{ context: LinkContext; attempt: LinkAttempt }> {
    const binding = record.context.connection;
    const context = binding ? { ...record.context, scopeId: binding.scopeId, label: binding.sourceLabel, connection: undefined } : record.context;
    const location: LinkPath = binding
      ? { path: binding.prefix.replace(/\/$/, "") + "/" + record.context.path, fragment: "", absolute: !binding.prefix.startsWith(".") }
      : { path: "./" + record.context.path, fragment: "", absolute: false };
    const mapping = (await this.list(this.scope(context, location).scopeId)).find((row) => row.prefix === binding?.prefix);
    return { context, attempt: { location, mapping } };
  }
  private async validateMapping(mapping: LinkMapping, location: LinkPath) {
    const relative = relativeToPrefix(location.path, mapping.prefix);
    if (!relative) throw new LocalLinkError("invalid", "This local link has an unsupported or invalid path.");
    await readLinkedFile(mapping.handle, relative);
    if (mapping.remotes.length) {
      const roots = [...await this.roots(), { id: mapping.id, name: mapping.label, handle: mapping.handle }];
      let valid = false;
      for (const root of roots) {
        const path = await root.handle.resolve(mapping.handle);
        if (!path) continue;
        const current = await inspectRepo(root, mapping.handle, path.join("/"));
        if (current && JSON.stringify(current.remotes) === JSON.stringify(mapping.remotes)) { valid = true; break; }
      }
      if (!valid) throw new LocalLinkError("changed", "The repository changed. Refresh the repository list and select it again.");
    }
    return relative;
  }
  private async mapped(mapping: LinkMapping, location: LinkPath, origin?: LinkContext["origin"]) {
    const relative = await this.validateMapping(mapping, location);
    return this.resource({ scopeId: "linked:" + mapping.id, label: mapping.label, root: mapping.handle, path: relative, documentId: "",
      origin: origin ?? { scopeId: mapping.scopeId, label: mapping.sourceLabel }, connection: mapping }, relative, location.fragment, mapping);
  }

  async attempt(context: LinkContext, href: string, local = true): Promise<LinkAttempt> {
    const location = normalizeLink(href, context.path);
    if (!location.absolute && context.connection) {
      const binding = context.connection;
      const current = await this.get<LinkMapping>(this.key(binding.scopeId, binding.prefix));
      if (current?.id !== binding.id) throw new LocalLinkError("changed", "This document's connection was removed or changed. Reconnect it to continue.");
      await this.validateMapping(current, { path: binding.prefix.replace(/\/$/, "") + "/" + context.path, fragment: "", absolute: !binding.prefix.startsWith(".") });
    }
    // Exact normal relative links take priority. Never broaden image resolution this way.
    if (local && !location.absolute && !location.path.startsWith("./../")) {
      try { return { location, resource: await this.resource(context, location.path.slice(2), location.fragment) }; }
      catch (error) { if (error instanceof LocalLinkError && error.code === "storage") throw error; }
    }
    const mapping = (await this.list(this.scope(context, location).scopeId)).filter((row) => relativeToPrefix(location.path, row.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
    if (!mapping) return { location };
    try { return { location, mapping, resource: await this.mapped(mapping, location, context.origin) }; }
    catch (error) { return { location, mapping, error: this.error(error) }; }
  }

  async retry(mapping: LinkMapping, location: LinkPath): Promise<LinkedResource> {
    const current = (await this.list(mapping.scopeId)).find((row) => row.prefix === mapping.prefix);
    if (current?.revision !== mapping.revision) throw new LocalLinkError("changed", "This connection changed in another window. Open the link again.");
    return this.mapped(current, location);
  }

  async save(context: LinkContext, location: LinkPath, prefix: string, target: LinkTarget,
    expected?: LinkMapping, method: LinkMapping["method"] = target.repo ? "repo" : "manual", signal?: AbortSignal, preview?: LinkPreview): Promise<LinkedResource> {
    const scope = this.scope(context, location);
    const relative = relativeToPrefix(location.path, prefix);
    if (!relative) throw new LocalLinkError("invalid", "Choose a folder prefix that contains this file.");
    // The file and checkout are revalidated at the last moment, including cached candidates.
    await readLinkedFile(target.handle, relative);
    let remotes: string[] = [];
    if (target.repo) {
      for (const root of [{ id: context.scopeId, name: context.label, handle: context.root }, ...await this.roots()]) {
        const path = await root.handle.resolve(target.handle);
        if (!path) continue;
        const current = await inspectRepo(root, target.handle, path.join("/"));
        if (current && JSON.stringify(current.remotes) === JSON.stringify(target.repo.remotes)) { remotes = current.remotes; break; }
      }
      if (target.repo.remotes.length && !remotes.length) throw new LocalLinkError("changed", "The repository changed. Refresh the repository list and select it again.");
    }
    const key = this.key(scope.scopeId, prefix);
    return this.withLock(this.prefix + "scope:" + scope.scopeId, () => this.withLock(key, async () => {
      const current = await this.get<LinkMapping>(key);
      if (current?.revision !== expected?.revision) throw new LocalLinkError("changed", "This connection changed in another window. Open the link again.");
      const sameTarget = current && await current.handle.isSameEntry(target.handle) && JSON.stringify(current.remotes) === JSON.stringify(remotes);
      const mapping: LinkMapping = { id: sameTarget ? current.id : crypto.randomUUID(), revision: crypto.randomUUID(), scopeId: scope.scopeId, sourceLabel: scope.label,
        prefix, example: location.path, handle: target.handle, label: target.label, remotes, method };
      // Construct/read the resource before committing the correspondence. Failed validation
      // or quota must not turn an unverified target into the active mapping.
      const actual = await this.preview(context, location, prefix, target, expected);
      if (actual.overlap?.revision !== preview?.overlap?.revision) throw new LocalLinkError("changed", "The connection used for this file changed. Review the target again.");
      const resource = await this.mapped(actual.overlap ?? mapping, location, context.origin);
      signal?.throwIfAborted();
      try { await this.storage.set(key, mapping); }
      catch { throw new LocalLinkError("storage", "The link connection could not be saved. Your previous connection is unchanged."); }
      return resource;
    }));
  }

  async automatic(context: LinkContext, attempt: LinkAttempt, scan: RepoScan, signal?: AbortSignal): Promise<LinkedResource | undefined> {
    // A failed saved checkout is never replaced. An old absolute address carries no
    // verifiable repo identity, even when discovery happens to return one candidate.
    if (!this.autoDiscover || attempt.mapping || attempt.location.absolute || !scan.complete) return;
    for (const root of await this.roots()) {
      signal?.throwIfAborted();
      const source = await root.handle.resolve(context.root);
      if (!source) continue;
      const target = normalizeLink(attempt.location.path.slice(2), [...source, "__document__"].join("/")).path.slice(2);
      if (target.startsWith("../")) continue;
      let nearest: { repo: RepoCandidate; prefix: string } | undefined;
      for (const repo of scan.repos) {
        const parts = await root.handle.resolve(repo.handle);
        if (!parts) continue;
        const prefix = parts.join("/");
        if ((prefix ? target.startsWith(prefix + "/") : true) && (!nearest || prefix.length > nearest.prefix.length)) nearest = { repo, prefix };
      }
      if (!nearest?.repo.remotes.length) continue;
      const relative = nearest.prefix ? target.slice(nearest.prefix.length + 1) : target;
      const prefix = attempt.location.path.slice(0, -(relative.length + 1));
      if (!prefix || relativeToPrefix(attempt.location.path, prefix) !== relative) continue;
      try { return await this.save(context, attempt.location, prefix, { ...nearest.repo, repo: nearest.repo }, undefined, "git-path", signal); }
      catch (error) { if (error instanceof LocalLinkError && ["storage", "changed"].includes(error.code)) throw error; }
    }
  }

  error(error: unknown): LocalLinkError {
    return error instanceof LocalLinkError ? error : new LocalLinkError("folder", "The saved link folder is unavailable. Choose its new location.");
  }
}
