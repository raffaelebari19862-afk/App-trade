import type { AlertSoundPreset } from "../types/trading";

export interface SoundPresetMeta {
  id: AlertSoundPreset;
  label: string;
  description: string;
}

export const ALERT_SOUND_PRESETS: SoundPresetMeta[] = [
  {
    id: "bell",
    label: "Campanella Trading",
    description: "Tono nitido a doppia armonica",
  },
  {
    id: "chime",
    label: "Accordo Smeraldo",
    description: "Arpeggio ascendente a 3 note",
  },
  {
    id: "sonar",
    label: "Radar Breakout",
    description: "Impulso profondo con eco acuto",
  },
  {
    id: "pulse",
    label: "Doppio Beep",
    description: "Doppio segnale rapido da sala operativa",
  },
  {
    id: "siren",
    label: "Sirena Urgenza",
    description: "Modulazione continua ad alta priorità",
  },
];

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

export async function unlockAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return ctx.state === "running";
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  type: OscillatorType,
  gainPeak: number,
  freqEnd?: number
) {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqEnd && freqEnd !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.001, gainPeak), now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export async function playAlarmSound(
  preset: AlertSoundPreset,
  volume = 0.8
): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  const vol = Math.max(0.05, Math.min(1, volume));

  try {
    switch (preset) {
      case "bell": {
        scheduleTone(ctx, 880, 0, 0.55, "sine", 0.35 * vol);
        scheduleTone(ctx, 1320, 0, 0.45, "triangle", 0.18 * vol);
        scheduleTone(ctx, 880, 0.32, 0.65, "sine", 0.32 * vol);
        scheduleTone(ctx, 1320, 0.32, 0.5, "triangle", 0.16 * vol);
        break;
      }
      case "chime": {
        scheduleTone(ctx, 523.25, 0, 0.35, "sine", 0.28 * vol);
        scheduleTone(ctx, 659.25, 0.13, 0.38, "sine", 0.3 * vol);
        scheduleTone(ctx, 783.99, 0.26, 0.55, "sine", 0.34 * vol);
        scheduleTone(ctx, 1046.5, 0.4, 0.65, "triangle", 0.22 * vol);
        break;
      }
      case "sonar": {
        scheduleTone(ctx, 540, 0, 0.28, "sine", 0.36 * vol, 480);
        scheduleTone(ctx, 1080, 0.22, 0.55, "sine", 0.28 * vol, 960);
        break;
      }
      case "pulse": {
        scheduleTone(ctx, 1046.5, 0, 0.14, "square", 0.16 * vol);
        scheduleTone(ctx, 1046.5, 0.2, 0.14, "square", 0.16 * vol);
        scheduleTone(ctx, 1318.5, 0.42, 0.26, "square", 0.18 * vol);
        break;
      }
      case "siren": {
        scheduleTone(ctx, 660, 0, 0.32, "sawtooth", 0.16 * vol, 990);
        scheduleTone(ctx, 990, 0.32, 0.32, "sawtooth", 0.16 * vol, 660);
        scheduleTone(ctx, 660, 0.64, 0.32, "sawtooth", 0.16 * vol, 990);
        break;
      }
    }
    return true;
  } catch {
    return false;
  }
}
