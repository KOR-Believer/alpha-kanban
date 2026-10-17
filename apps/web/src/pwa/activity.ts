export class AppActivity {
  private drafts = new Set<object>();
  private pending = 0;
  private fileWrites = 0;
  private paused = false;
  get busy() { return this.pending > 0 || this.drafts.size > 0; }
  get frozen() { return this.paused; }
  get unloadRisk() { return this.fileWrites > 0 || this.drafts.size > 0; }
  setDraft(owner: object, dirty: boolean) { if (dirty) this.drafts.add(owner); else this.drafts.delete(owner); }
  assertWritable() { if (this.paused) throw new Error("The app is updating. Wait before making changes."); }
  async run<T>(action: () => Promise<T>, protectUnload = false): Promise<T> {
    this.assertWritable();
    this.pending++;
    if (protectUnload) this.fileWrites++;
    try { return await action(); }
    finally { this.pending--; if (protectUnload) this.fileWrites--; }
  }
  prepare(): boolean {
    if (this.busy) return false;
    this.paused = true;
    return true;
  }
  resume() { this.paused = false; }
}

export const appActivity = new AppActivity();
