import type {
  AccountStats,
  AuditLogEntry,
  BackdropConfig,
  ClosedTrade,
  MarketAsset,
  OkxCopySettings,
  OpenPosition,
  PriceAlert,
  SoundSettings,
  StrategyConfig,
} from "../types/trading";

export const STORAGE_KEY = "scalper_pro_live_v4";
export const LEGACY_KEY = "scalper_pro_live_v3";
const IDB_NAME = "scalper_pro_live_db";
const IDB_STORE = "app_state";
const IDB_RECORD_KEY = "latest";

export interface PersistedAppState {
  version: 4;
  updatedAt: number;
  selectedPair: string;
  stats: AccountStats;
  positions: Record<string, OpenPosition>;
  trades: ClosedTrade[];
  auditLogs: AuditLogEntry[];
  config: StrategyConfig;
  autoTrading: boolean;
  pushEnabled: boolean;
  copySettings: OkxCopySettings;
  customMarkets: MarketAsset[];
  backdrop?: BackdropConfig;
  darkMode?: boolean;
  priceAlerts?: PriceAlert[];
  soundSettings?: SoundSettings;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
  });
}

export async function saveToIndexedDb(state: PersistedAppState): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(state, IDB_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore IDB errors in restricted browser contexts
  }
}

export async function loadFromIndexedDb(): Promise<PersistedAppState | null> {
  try {
    const db = await openIdb();
    const data = await new Promise<PersistedAppState | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_RECORD_KEY);
      req.onsuccess = () => resolve((req.result as PersistedAppState) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data;
  } catch {
    return null;
  }
}

export function saveToLocalStorage(state: PersistedAppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
}

export function loadFromLocalStorage(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loadFromServer(): Promise<PersistedAppState | null> {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.state && typeof json.state === "object") {
      return json.state as PersistedAppState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveToServer(state: PersistedAppState): Promise<boolean> {
  try {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function beaconSaveToServer(state: PersistedAppState): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(state)], { type: "application/json" });
      navigator.sendBeacon("/api/state", blob);
    }
  } catch {
    // Ignore beacon errors
  }
}
