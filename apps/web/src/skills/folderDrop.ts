import { verifySkillDirectory } from "./repository";

export const SINGLE_FOLDER = "Drop one implementation-ledger folder at a time. Your existing connection is unchanged.";
export const FOLDER_REQUIRED = "Drop the implementation-ledger folder itself, not a file or link.";
export const DROP_UNAVAILABLE = "Folder drop is unavailable here. Use Choose folder instead.";

export function supportsSkillFolderDrop() {
  return typeof DataTransferItem !== "undefined" && typeof DataTransferItem.prototype.getAsFileSystemHandle === "function";
}

// Invoke getAsFileSystemHandle inside the drop event's synchronous turn. Await later.
export function droppedSkillFolder(items: ArrayLike<Pick<DataTransferItem, "kind"> & Partial<Pick<DataTransferItem, "getAsFileSystemHandle">>>): Promise<FileSystemDirectoryHandle> {
  if (items.length !== 1) return Promise.reject(new Error(SINGLE_FOLDER));
  const item = items[0]!;
  if (item.kind !== "file") return Promise.reject(new Error(FOLDER_REQUIRED));
  if (!item.getAsFileSystemHandle) return Promise.reject(new Error(DROP_UNAVAILABLE));
  let result: Promise<FileSystemHandle | null>;
  try { result = item.getAsFileSystemHandle(); }
  catch (error) { return Promise.reject(error); }
  return result.then(async (handle) => {
    if (!handle || handle.kind !== "directory") throw new Error(FOLDER_REQUIRED);
    const directory = handle as FileSystemDirectoryHandle;
    await verifySkillDirectory(directory);
    return directory;
  });
}
