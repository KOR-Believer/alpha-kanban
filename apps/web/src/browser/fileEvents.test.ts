// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentFixture, projectFixture } from "../allProjectsFixtures";
import { BrowserFileError, browserRepository } from "./repository";
import { subscribeFileEvents } from "./fileEvents";


describe("local file observations", () => {
  const file = documentFixture(projectFixture("root/project", "bw_test"), "d_test").file;
  let stop: (() => void) | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(browserRepository, "subscribe").mockReturnValue(() => undefined);
    vi.spyOn(browserRepository, "files").mockResolvedValue([file]);
    vi.spyOn(browserRepository, "markdown").mockResolvedValue({ file, markdown: "", outline: [] });
  });
  afterEach(() => { stop?.(); stop = undefined; vi.restoreAllMocks(); vi.useRealTimers(); });

  it("catches changes between opening the document and starting its observer", async () => {
    const fresh = { ...file, hash: "new-hash", mtimeMs: 2 };
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file: fresh, markdown: "new", outline: [] });
    const changed = vi.fn();
    stop = subscribeFileEvents(file.workspaceId, changed, vi.fn(), file);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ eventType: "changed", file: fresh }));
    expect(browserRepository.files).not.toHaveBeenCalled();
  });

  it("reports timestamp-only changes and removals without confusing read failure with deletion", async () => {
    const changed = vi.fn(), unavailable = vi.fn();
    stop = subscribeFileEvents(file.workspaceId, changed, unavailable, file);
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
    vi.mocked(browserRepository.markdown).mockResolvedValue({ file: { ...file, mtimeMs: 2 }, markdown: "", outline: [] });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: "changed", file: expect.objectContaining({ hash: file.hash, mtimeMs: 2 }) }));
    changed.mockClear();
    vi.mocked(browserRepository.markdown).mockRejectedValueOnce(new Error("Permission revoked"));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    vi.mocked(browserRepository.markdown).mockRejectedValue(new BrowserFileError("FILE_NOT_FOUND", "Removed"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ eventType: "removed", fileId: file.id }));
    changed.mockClear();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(changed).not.toHaveBeenCalled();
    expect(browserRepository.files).not.toHaveBeenCalled();
  });

  it("does not poll hidden tabs or publish a delayed read after disposal", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    let finish!: () => void;
    vi.mocked(browserRepository.markdown).mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ file: { ...file, hash: "changed" }, markdown: "changed", outline: [] });
    }));
    const changed = vi.fn();
    stop = subscribeFileEvents(file.workspaceId, changed, vi.fn(), file);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(browserRepository.markdown).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    stop(); stop = undefined;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
  });

  it("does not scan the project when no document is selected", async () => {
    stop = subscribeFileEvents(file.workspaceId, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(browserRepository.files).not.toHaveBeenCalled();
    expect(browserRepository.markdown).not.toHaveBeenCalled();
  });

  it("observes the selected file while sidebar discovery is pending, without overlapping reads", async () => {
    vi.mocked(browserRepository.files).mockImplementation(() => new Promise(() => {}));
    let finish!: () => void;
    vi.mocked(browserRepository.markdown).mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ file: { ...file, hash: "changed" }, markdown: "changed", outline: [] });
    }));
    const changed = vi.fn();
    stop = subscribeFileEvents(file.workspaceId, changed, vi.fn(), file);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(browserRepository.markdown).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ file: expect.objectContaining({ hash: "changed" }) }));
    expect(browserRepository.files).not.toHaveBeenCalled();
  });
});
