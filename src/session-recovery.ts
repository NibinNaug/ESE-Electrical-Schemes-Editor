import { invoke, isTauri } from "@tauri-apps/api/core";

export type RecoverySessionData = {
  archiveBytes: Uint8Array;
  currentPath: string | null;
  currentPageId: string;
  dirty: boolean;
  editMode: boolean;
  selectedCircuitId: string | null;
};

type StoredRecoverySession = Omit<RecoverySessionData, "archiveBytes"> & {
  id: "latest";
  archiveBytes: ArrayBuffer;
};

type NativeRecoverySession = Omit<RecoverySessionData, "archiveBytes"> & {
  archiveBytes: number[];
};

const DATABASE_NAME = "ese-private-session";
const DATABASE_VERSION = 1;
const STORE_NAME = "recovery";

const openRecoveryDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("Base privée de récupération inaccessible."));
});

const withRecoveryStore = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const database = await openRecoveryDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Récupération privée impossible."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Récupération privée annulée."));
    });
  } finally {
    database.close();
  }
};

const copyArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

export const saveRecoverySession = async (session: RecoverySessionData): Promise<void> => {
  if (isTauri()) {
    await invoke("save_recovery_session", {
      archiveBytes: Array.from(session.archiveBytes),
      currentPath: session.currentPath,
      currentPageId: session.currentPageId,
      dirty: session.dirty,
      editMode: session.editMode,
      selectedCircuitId: session.selectedCircuitId
    });
    return;
  }

  const stored: StoredRecoverySession = {
    id: "latest",
    archiveBytes: copyArrayBuffer(session.archiveBytes),
    currentPath: session.currentPath,
    currentPageId: session.currentPageId,
    dirty: session.dirty,
    editMode: session.editMode,
    selectedCircuitId: session.selectedCircuitId
  };
  await withRecoveryStore("readwrite", (store) => store.put(stored));
};

export const loadRecoverySession = async (): Promise<RecoverySessionData | null> => {
  if (isTauri()) {
    const session = await invoke<NativeRecoverySession | null>("load_recovery_session");
    return session ? { ...session, archiveBytes: Uint8Array.from(session.archiveBytes) } : null;
  }

  const stored = await withRecoveryStore<StoredRecoverySession | undefined>(
    "readonly",
    (store) => store.get("latest")
  );
  return stored ? { ...stored, archiveBytes: new Uint8Array(stored.archiveBytes) } : null;
};

export const clearRecoverySession = async (): Promise<void> => {
  if (isTauri()) {
    await invoke("clear_recovery_session");
    return;
  }
  await withRecoveryStore("readwrite", (store) => store.delete("latest"));
};
