import { getSetting, setSetting } from './library';
import { createStore } from './store';

/** What the download button saves: audio, or video in 720p. Long-press shows every option. */
export type DefaultFormat = 'audio' | 'video';
const FORMATS: DefaultFormat[] = ['audio', 'video'];

export type AppSettings = {
  /** Update yt-dlp once a day at launch. */
  autoUpdate: boolean;
  defaultFormat: DefaultFormat;
  /** Simultaneous downloads (1–3). */
  maxParallel: number;
  /** First-launch personal-use notice accepted. */
  consentAccepted: boolean;
};

const DEFAULTS: AppSettings = {
  autoUpdate: true,
  defaultFormat: 'audio',
  maxParallel: 2,
  consentAccepted: false,
};

export const settingsStore = createStore<AppSettings>(DEFAULTS);

export function loadSettings() {
  const saved = { ...DEFAULTS, ...getSetting<Partial<AppSettings>>('app', {}) };
  if (!FORMATS.includes(saved.defaultFormat)) saved.defaultFormat = DEFAULTS.defaultFormat;
  settingsStore.set(saved);
}

export function updateSettings(patch: Partial<AppSettings>) {
  const next = { ...settingsStore.get(), ...patch };
  settingsStore.set(next);
  setSetting('app', next);
}
