import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import type { User } from "firebase/auth";
import type {
  EmailAlertDispatchRecord,
  GlobalCryptoSentiment,
  PreBreakoutSignal,
} from "../types/trading";
import { formatPrice } from "../data/markets";
import { signInWithGoogleForCloudAndGmail } from "../firebase";
import {
  loadRecentCloudEmailAlerts,
  logEmailAlertToCloud,
  sendGmailHtmlBannerEmail,
} from "../services/cloudSync";

interface EmailAlertBannerModalProps {
  open: boolean;
  onClose: () => void;
  signals: PreBreakoutSignal[];
  globalContext: GlobalCryptoSentiment | null;
  firebaseUser: User | null;
  hasGmailToken: boolean;
  onAuthUpdated: (user: User, hasToken: boolean) => void;
  onNotify: (title: string, body: string, tone?: "up" | "dn" | "neutral") => void;
}

const DEFAULT_RECIPIENT = "raffaelebari19862@gmail.com";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailBannerHtml(
  signals: PreBreakoutSignal[],
  globalContext: GlobalCryptoSentiment | null,
  customNote: string
): string {
  const generatedStr = new Date().toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const regime = globalContext?.globalRegime || "ROTAZIONE ATTIVA";
  const fgText =
    globalContext?.fearGreedValue !== null && globalContext?.fearGreedValue !== undefined
      ? `${globalContext.fearGreedValue}/100 (${globalContext.fearGreedLabel})`
      : "Live";
  const breadthText = globalContext ? `${globalContext.okxBullishBreadthPct}% positivi` : "OKX Live";

  const rowsHtml = signals
    .slice(0, 6)
    .map((s) => {
      const isLong = s.direction === "L";
      const dirColor = isLong ? "#10b981" : "#ef4444";
      const dirBg = isLong ? "#064e3b" : "#7f1d1d";
      const sectorLabel =
        s.sector === "memecoin" ? "MEMECOIN" : s.sector === "major" ? "MAJOR" : "ALTCOIN";
      return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #1e293b;vertical-align:top;">
          <div style="font-size:15px;font-weight:800;color:#f8fafc;">${escapeHtml(s.name)} <span style="font-size:12px;color:#94a3b8;font-weight:600;">(${escapeHtml(s.baseSymbol)})</span></div>
          <div style="margin-top:4px;font-size:11px;color:#fbbf24;font-weight:700;letter-spacing:0.4px;">${sectorLabel} · ${escapeHtml(s.urgency)} · ${escapeHtml(s.technique)}</div>
          <div style="margin-top:4px;font-size:12px;color:#cbd5e1;line-height:1.45;">${escapeHtml(s.triggerNote)}</div>
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid #1e293b;text-align:right;vertical-align:top;white-space:nowrap;">
          <span style="display:inline-block;padding:4px 10px;border-radius:6px;background:${dirBg};color:${dirColor};font-family:monospace;font-size:12px;font-weight:800;">
            ${isLong ? "LONG ▲" : "SHORT ▼"} ${s.probabilityPct}%
          </span>
          <div style="margin-top:6px;font-family:monospace;font-size:13px;font-weight:700;color:#ffffff;">${escapeHtml(formatPrice(s.lastPrice))}</div>
          <div style="margin-top:2px;font-family:monospace;font-size:11px;color:#34d399;">Potenziale +${s.potentialMovePct}%</div>
        </td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:24px 12px;background-color:#070b12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background-color:#0f172a;border:1px solid #f59e0b;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:22px 24px;background:linear-gradient(135deg,#111827 0%,#064e3b 100%);border-bottom:2px solid #f59e0b;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#fbbf24;">AVVISO OPERATIVO PRE-ESPLOSIONE · SCALPER PRO LIVE</div>
        <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.25;color:#ffffff;font-weight:800;">Migliori Setup Memecoin &amp; Crypto Prima del Breakout</h1>
        <p style="margin:0;font-size:12px;color:#cbd5e1;">Generato il ${escapeHtml(generatedStr)} · Regime: <strong>${escapeHtml(regime)}</strong> · Fear &amp; Greed: <strong>${escapeHtml(fgText)}</strong> · Ampiezza OKX: <strong>${escapeHtml(breadthText)}</strong></p>
      </td>
    </tr>
    ${
      customNote.trim()
        ? `<tr><td style="padding:12px 24px;background-color:#1e293b;border-bottom:1px solid #334155;font-size:13px;color:#f8fafc;"><strong>Nota Operativa:</strong> ${escapeHtml(customNote.trim())}</td></tr>`
        : ""
    }
    <tr>
      <td style="padding:0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${rowsHtml}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 24px;background-color:#0b1120;font-size:11px;color:#94a3b8;line-height:1.5;">
        Dati live estratti da OKX Perpetual Swap (candele 1m, Bollinger Squeeze, EMA 9/21, Fibonacci Golden Zone e Fear &amp; Greed globale). Gestisci sempre leva e stop loss prima dell'esecuzione.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const EmailAlertBannerModal: React.FC<EmailAlertBannerModalProps> = ({
  open,
  onClose,
  signals,
  globalContext,
  firebaseUser,
  hasGmailToken,
  onAuthUpdated,
  onNotify,
}) => {
  const [recipient, setRecipient] = useState<string>(DEFAULT_RECIPIENT);
  const [customNote, setCustomNote] = useState<string>("");
  const [confirmStep, setConfirmStep] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<EmailAlertDispatchRecord[]>([]);

  const topSignal = signals[0];
  const subject = useMemo(() => {
    if (!topSignal) {
      return "[AVVISO SCALPER PRO] Radar Pre-Breakout Crypto & Memecoin";
    }
    const dir = topSignal.direction === "L" ? "LONG" : "SHORT";
    return `[AVVISO PRE-ESPLOSIONE] ${topSignal.baseSymbol} (${dir} ${topSignal.probabilityPct}%) + ${Math.max(0, signals.length - 1)} Setup Crypto/Meme`;
  }, [topSignal, signals.length]);

  useEffect(() => {
    if (!open || !firebaseUser || !firebaseUser.emailVerified) return;
    let active = true;
    loadRecentCloudEmailAlerts(firebaseUser.uid)
      .then((rows) => {
        if (active) setRecentLogs(rows);
      })
      .catch(() => {
        // non-fatal when offline/first run
      });
    return () => {
      active = false;
    };
  }, [open, firebaseUser]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      const { user } = await signInWithGoogleForCloudAndGmail();
      onAuthUpdated(user, true);
      onNotify("Google & Gmail collegati", `Accesso eseguito come ${user.email || "utente"}.`, "up");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Errore durante l'accesso con Google.");
    } finally {
      setSigningIn(false);
    }
  };

  const handleConfirmedSend = async () => {
    if (!recipient.includes("@")) {
      setErrorMsg("Inserisci un indirizzo email valido.");
      return;
    }
    if (signals.length === 0) {
      setErrorMsg("Nessun segnale pre-breakout disponibile da inviare.");
      return;
    }

    setSending(true);
    setErrorMsg(null);
    try {
      const htmlBody = buildEmailBannerHtml(signals, globalContext, customNote);
      const { id } = await sendGmailHtmlBannerEmail({
        to: recipient.trim(),
        subject,
        htmlBody,
      });

      const record: EmailAlertDispatchRecord = {
        alertId: id,
        recipientEmail: recipient.trim(),
        subject,
        topAsset: topSignal ? topSignal.name : "Crypto Radar",
        signalsCount: Math.min(6, signals.length),
        sentAt: Date.now(),
      };

      if (firebaseUser) {
        await logEmailAlertToCloud(firebaseUser.uid, record);
        setRecentLogs((prev) => [record, ...prev].slice(0, 12));
      }

      setConfirmStep(false);
      onNotify(
        "Banner inviato su Gmail",
        `Avviso pre-breakout spedito a ${recipient.trim()} e salvato su Cloud.`,
        "up"
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Invio Gmail non riuscito.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Invio Banner Pre-Breakout via Gmail"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200/80 dark:border-white/[0.1] bg-white dark:bg-[#0D131F] shadow-2xl">
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#0D131F]/95 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-500 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-white">
                Banner Avviso Pre-Breakout via Gmail
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Anteprima e invio diretto delle migliori occasioni Memecoin &amp; Crypto prima dell&apos;esplosione.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Recipient & Note Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Destinatario Email
              </label>
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Nota Personale (opzionale)
              </label>
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Es. Controlla rottura sui 1m prima di entrare…"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#080C14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
          </div>

          {/* Visual Alert Banner Preview */}
          <div className="rounded-2xl border border-amber-500/50 bg-[#0A101B] text-slate-100 overflow-hidden shadow-lg">
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-[#0A2923] to-[#0E1E2B] border-b border-amber-500/40">
              <div className="text-[10px] font-extrabold tracking-widest uppercase text-amber-400">
                AVVISO OPERATIVO PRE-ESPLOSIONE · ANTEPRIMA EMAIL BANNER
              </div>
              <div className="mt-1 font-display text-lg font-extrabold text-white">
                Migliori Setup Memecoin &amp; Crypto Prima del Breakout
              </div>
              <div className="mt-1 text-xs text-slate-300 font-mono">
                Oggetto: <span className="text-amber-300">{subject}</span>
              </div>
              {globalContext && (
                <div className="mt-1.5 text-[11px] text-slate-300">
                  Regime: <strong>{globalContext.globalRegime}</strong> ·{" "}
                  {globalContext.fearGreedValue !== null
                    ? `Fear & Greed ${globalContext.fearGreedValue}/100 · `
                    : ""}
                  Ampiezza OKX {globalContext.okxBullishBreadthPct}% rialzisti
                </div>
              )}
            </div>

            <div className="divide-y divide-slate-800/80">
              {signals.slice(0, 6).map((s) => (
                <div
                  key={s.instId}
                  className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-white">
                        {s.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {s.baseSymbol}
                      </span>
                      <span className="font-mono text-[10px] font-bold uppercase text-amber-400">
                        {s.sector} · {s.urgency}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-emerald-400 mt-0.5">
                      {s.technique}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {s.triggerNote}
                    </div>
                  </div>

                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div
                      className={`text-xs font-extrabold ${
                        s.direction === "L" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {s.direction === "L" ? "LONG" : "SHORT"} · Prob. {s.probabilityPct}%
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {formatPrice(s.lastPrice)}
                    </div>
                    <div className="text-[11px] text-emerald-300">
                      Spazio stimato +{s.potentialMovePct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Google Sign-In or Explicit Dispatch Confirmation */}
          {!firebaseUser || !hasGmailToken ? (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Autorizza Gmail &amp; Cloud Sync
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Accedi con Google per inviare il banner reale dal tuo account Gmail a{" "}
                  <span className="font-mono">{recipient}</span> e salvare lo storico nel Cloud.
                </p>
              </div>

              {/* Official Google Sign-In Button Styling */}
              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={signingIn}
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#1F1F1F] border border-[#747775] font-medium text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.3 0 6.08-1.09 8.11-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.23 1.18-3.26 0-6.02-2.2-7-5.16H1.01v3.14C3.05 21.2 7.24 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5 14.01c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.15H1.01C.37 7.43 0 8.88 0 11.65s.37 4.22 1.01 5.5l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.8 0 3.41.62 4.68 1.84l3.51-3.51C18.07 1.19 15.3 0 12 0 7.24 0 3.05 2.8 1.01 6.85l3.99 3.14c.98-2.96 3.74-5.24 7-5.24Z"
                  />
                </svg>
                <span>{signingIn ? "Accesso in corso…" : "Accedi con Google"}</span>
              </button>
            </div>
          ) : confirmStep ? (
            <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-500/10 space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-amber-200">
                Confermi l&apos;invio immediato di questa email?
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Verrà inviato un banner HTML con i <strong>{Math.min(6, signals.length)} migliori setup pre-breakout</strong> a{" "}
                <span className="font-mono font-bold">{recipient}</span> tramite Gmail ({firebaseUser.email}).
              </p>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmStep(false)}
                  disabled={sending}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmedSend()}
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sending ? "Invio in corso…" : "Conferma e Invia Email"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  Gmail autorizzato ({firebaseUser.email})
                </span>
              </div>

              <button
                type="button"
                onClick={() => setConfirmStep(true)}
                disabled={signals.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm cursor-pointer disabled:opacity-40"
              >
                <Mail className="w-4 h-4" />
                Prepara Invio a {recipient}
              </button>
            </div>
          )}

          {/* Cloud Dispatch History */}
          {recentLogs.length > 0 && (
            <div className="pt-3 border-t border-slate-200/70 dark:border-white/[0.07]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Ultimi Banner Salvati in Cloud
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {recentLogs.map((log) => (
                  <div
                    key={log.alertId}
                    className="flex items-center justify-between gap-3 text-xs px-3 py-2 rounded-lg bg-slate-100/70 dark:bg-white/[0.03]"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {log.topAsset}
                      </span>{" "}
                      <span className="text-slate-500 dark:text-slate-400">
                        ({log.signalsCount} setup → {log.recipientEmail})
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {new Date(log.sentAt).toLocaleTimeString("it-IT")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
