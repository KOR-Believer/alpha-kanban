export interface BrowserStorage {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  entries<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
}

export class IndexedDbStorage implements BrowserStorage {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly name = "alpha-kanban.browser.v1") {}

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("records");
      request.onerror = () => { this.database = undefined; reject(request.error); };
      request.onblocked = () => { this.database = undefined; reject(new Error("Browser storage is blocked by another tab.")); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = undefined; };
        resolve(db);
      };
    });
    return this.database;
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("records", mode);
      const request = operation(transaction.objectStore("records"));
      // Wait for commit, not request success: quota or I/O can abort the transaction afterwards.
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage transaction aborted."));
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.transaction("readonly", (store) => store.get(key));
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.transaction("readwrite", (store) => store.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.transaction("readwrite", (store) => store.delete(key));
  }
  async entries<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("records", "readonly");
      const rows: Array<{ key: string; value: T }> = [];
      const cursor = transaction.objectStore("records").openCursor(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        rows.push({ key: String(cursor.result.key), value: cursor.result.value as T });
        cursor.result.continue();
      };
      transaction.oncomplete = () => resolve(rows);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}
