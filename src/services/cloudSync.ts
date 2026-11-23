import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  clearGmailAccessToken,
  db,
  getGmailAccessToken,
  handleFirestoreError,
  OperationType,
} from "../firebase";
import type {
  BotCycleSnapshot,
  BotEngineState,
  EmailAlertDispatchRecord,
} from "../types/trading";

export interface CloudTerminalSummaryInput {
  selectedPair: string;
  equityEur: number;
  realizedPnlEur: number;
  botState: BotEngineState | null;
}

export interface CloudTerminalSummaryRecord {
  selectedPair: string;
  equityEur: number;
  realizedPnlEur: number;
  botActive: boolean;
  botVaultEur: number;
  botActiveCapitalEur: number;
  botMonthlyGoalPct: number;
  botCyclesCount: number;
}

// Track documents known to exist in Firestore this session so updates skip redundant getDoc reads
const knownDocPaths = new Set<string>();
const completedCyclePaths = new Set<string>();
const inFlightByPath = new Map<string, Promise<void>>();

function safeFiniteNumber(value: unknown, fallback = 0, decimals = 2): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Number(num.toFixed(decimals));
}

function isDocNotFoundError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes("not-found") || msg.includes("no document to update");
}

function isPermissionDeniedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return msg.includes("permission-denied") || msg.includes("missing or insufficient permissions");
}

async function serializePathWrite(path: string, task: () => Promise<void>): Promise<void> {
  const previous = inFlightByPath.get(path) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  inFlightByPath.set(path, next);
  try {
    await next;
  } finally {
    if (inFlightByPath.get(path) === next) {
      inFlightByPath.delete(path);
    }
  }
}

export async function loadCloudTerminalSummary(
  uid: string
): Promise<CloudTerminalSummaryRecord | null> {
  const path = `users/${uid}/cloudState/main`;
  const ref = doc(db, "users", uid, "cloudState", "main");
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    knownDocPaths.add(path);
    const data = snap.data();
    return {
      selectedPair: String(data.selectedPair || "BTC/USD"),
      equityEur: Number(data.equityEur || 0),
      realizedPnlEur: Number(data.realizedPnlEur || 0),
      botActive: Boolean(data.botActive),
      botVaultEur: Number(data.botVaultEur || 0),
      botActiveCapitalEur: Number(data.botActiveCapitalEur || 1000),
      botMonthlyGoalPct: Number(data.botMonthlyGoalPct || 100),
      botCyclesCount: Number(data.botCyclesCount || 0),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function syncTerminalSummaryToCloud(
  uid: string,
  input: CloudTerminalSummaryInput
): Promise<void> {
  const path = `users/${uid}/cloudState/main`;
  const ref = doc(db, "users", uid, "cloudState", "main");

  const payloadFields = {
    selectedPair: (input.selectedPair || "BTC/USD").trim().slice(0, 40) || "BTC/USD",
    equityEur: safeFiniteNumber(input.equityEur, 0, 2),
    realizedPnlEur: safeFiniteNumber(input.realizedPnlEur, 0, 2),
    botActive: Boolean(input.botState?.active),
    botVaultEur: safeFiniteNumber(input.botState?.vaultEur, 0, 2),
    botActiveCapitalEur: safeFiniteNumber(input.botState?.activeCapitalEur, 1000, 2),
    botMonthlyGoalPct: safeFiniteNumber(input.botState?.config.monthlyGoalPct, 100, 1),
    botCyclesCount: Math.max(0, Math.floor(safeFiniteNumber(input.botState?.history.length, 0, 0))),
    updatedAt: serverTimestamp(),
  };

  await serializePathWrite(path, async () => {
    try {
      if (knownDocPaths.has(path)) {
        try {
          await updateDoc(ref, payloadFields);
          return;
        } catch (err) {
          if (!isDocNotFoundError(err)) throw err;
          knownDocPaths.delete(path);
        }
      }

      const existing = await getDoc(ref);
      if (!existing.exists()) {
        try {
          await setDoc(ref, {
            ownerId: uid,
            ...payloadFields,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            const recheck = await getDoc(ref);
            if (recheck.exists()) {
              knownDocPaths.add(path);
              await updateDoc(ref, payloadFields);
              return;
            }
          }
          throw err;
        }
      } else {
        await updateDoc(ref, payloadFields);
      }
      knownDocPaths.add(path);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export async function syncBotCycleToCloud(
  uid: string,
  cycle: BotCycleSnapshot
): Promise<void> {
  const safeCycleId =
    (cycle.cycleId || `cycle-${Date.now()}`)
      .replace(/[^a-zA-Z0-9_\-]/g, "-")
      .slice(0, 128) || `cycle-${Date.now()}`;
  const path = `users/${uid}/botCycles/${safeCycleId}`;
  const ref = doc(db, "users", uid, "botCycles", safeCycleId);

  const summaryText = (cycle.positions || [])
    .map(
      (p) =>
        `Bot#${p.botIndex} ${p.symbol} ${p.direction === "L" ? "LONG" : "SHORT"} (${p.probabilityPct}%) · ${p.technique} | P&L ${p.livePnlEur >= 0 ? "+" : ""}${safeFiniteNumber(p.livePnlEur, 0, 2).toFixed(2)} EUR | ${p.reasoning}`
    )
    .join("\n")
    .slice(0, 3500);

  const updateFields = {
    status: cycle.status === "completed" ? "completed" : "running",
    netPnlEur: safeFiniteNumber(cycle.netPnlEur, 0, 2),
    vaultAddedEur: safeFiniteNumber(cycle.vaultAddedEur, 0, 2),
    reinvestedEur: safeFiniteNumber(cycle.reinvestedEur, 0, 2),
    vaultTotalEur: safeFiniteNumber(cycle.vaultTotalEur, 0, 2),
    positionsSummary: summaryText || "Ciclo 3 Bot AI",
    updatedAt: serverTimestamp(),
  };

  if (completedCyclePaths.has(path)) {
    return;
  }

  await serializePathWrite(path, async () => {
    if (completedCyclePaths.has(path)) {
      return;
    }

    try {
      if (knownDocPaths.has(path)) {
        try {
          await updateDoc(ref, updateFields);
          if (updateFields.status === "completed") {
            completedCyclePaths.add(path);
          }
          return;
        } catch (err) {
          if (isDocNotFoundError(err)) {
            knownDocPaths.delete(path);
          } else if (isPermissionDeniedError(err)) {
            const recheck = await getDoc(ref);
            if (recheck.exists() && recheck.data()?.status === "completed") {
              completedCyclePaths.add(path);
              return;
            }
            throw err;
          } else {
            throw err;
          }
        }
      }

      const existing = await getDoc(ref);
      if (!existing.exists()) {
        try {
          await setDoc(ref, {
            cycleId: safeCycleId,
            ownerId: uid,
            cycleNumber: Math.max(1, Math.floor(safeFiniteNumber(cycle.cycleNumber, 1, 0))),
            startingCapitalEur: safeFiniteNumber(cycle.startingCapitalEur, 1000, 2),
            ...updateFields,
            createdAt: serverTimestamp(),
          });
          knownDocPaths.add(path);
          if (updateFields.status === "completed") {
            completedCyclePaths.add(path);
          }
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            // Another tab/request may have created this exact cycle concurrently
            const recheck = await getDoc(ref);
            if (recheck.exists()) {
              knownDocPaths.add(path);
              if (recheck.data()?.status === "completed") {
                completedCyclePaths.add(path);
                return;
              }
              await updateDoc(ref, updateFields);
              if (updateFields.status === "completed") {
                completedCyclePaths.add(path);
              }
              return;
            }
          }
          throw err;
        }
      } else {
        knownDocPaths.add(path);
        const existingData = existing.data();
        if (existingData?.status === "completed") {
          completedCyclePaths.add(path);
          return;
        }
        try {
          await updateDoc(ref, updateFields);
          if (updateFields.status === "completed") {
            completedCyclePaths.add(path);
          }
        } catch (err) {
          if (isPermissionDeniedError(err)) {
            const recheck = await getDoc(ref);
            if (recheck.exists() && recheck.data()?.status === "completed") {
              completedCyclePaths.add(path);
              return;
            }
          }
          throw err;
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  });
}

export async function syncAllToCloud(
  uid: string,
  summaryInput: CloudTerminalSummaryInput,
  cyclesToSync: BotCycleSnapshot[]
): Promise<void> {
  const tasks: Promise<void>[] = [syncTerminalSummaryToCloud(uid, summaryInput)];
  for (const c of cyclesToSync) {
    tasks.push(syncBotCycleToCloud(uid, c));
  }
  await Promise.all(tasks);
}

export async function logEmailAlertToCloud(
  uid: string,
  record: EmailAlertDispatchRecord
): Promise<void> {
  const safeAlertId =
    record.alertId.replace(/[^a-zA-Z0-9_\-]/g, "-").slice(0, 128) ||
    `alert-${Date.now()}`;
  const path = `users/${uid}/emailAlerts/${safeAlertId}`;
  const ref = doc(db, "users", uid, "emailAlerts", safeAlertId);

  try {
    await setDoc(ref, {
      alertId: safeAlertId,
      ownerId: uid,
      recipientEmail: record.recipientEmail.trim().slice(0, 160),
      subject: record.subject.trim().slice(0, 240) || "Avviso Scalper Pro LIVE",
      topAsset: record.topAsset.trim().slice(0, 64) || "Crypto Radar",
      signalsCount: Math.max(1, Math.min(50, Math.floor(record.signalsCount || 1))),
      status: "sent",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function loadRecentCloudEmailAlerts(
  uid: string
): Promise<EmailAlertDispatchRecord[]> {
  const path = `users/${uid}/emailAlerts`;
  try {
    const q = query(
      collection(db, "users", uid, "emailAlerts"),
      where("ownerId", "==", uid),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          alertId: String(data.alertId || d.id),
          recipientEmail: String(data.recipientEmail || ""),
          subject: String(data.subject || ""),
          topAsset: String(data.topAsset || ""),
          signalsCount: Number(data.signalsCount || 1),
          sentAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now(),
        };
      })
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, 12);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function encodeUtf8ToBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeMimeSubjectUtf8(subject: string): string {
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export async function sendGmailHtmlBannerEmail(params: {
  to: string;
  subject: string;
  htmlBody: string;
}): Promise<{ id: string }> {
  const token = getGmailAccessToken();
  if (!token) {
    throw new Error(
      "Accedi con Google per autorizzare l'invio dell'email tramite Gmail."
    );
  }

  const mimeLines = [
    `To: ${params.to}`,
    `Subject: ${encodeMimeSubjectUtf8(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    (() => {
      const bytes = new TextEncoder().encode(params.htmlBody);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    })(),
  ].join("\r\n");

  const raw = encodeUtf8ToBase64Url(mimeLines);

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    }
  );

  if (response.status === 401 || response.status === 403) {
    clearGmailAccessToken();
    throw new Error(
      "Sessione Gmail scaduta o permessi mancanti. Effettua di nuovo l'accesso con Google."
    );
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      json?.error?.message || `Errore Gmail API HTTP ${response.status}`
    );
  }

  return { id: String(json.id || `gmail-${Date.now()}`) };
}
