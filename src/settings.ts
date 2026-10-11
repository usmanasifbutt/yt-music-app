import { getSetting, setSetting } from './library';
import { createStore } from './store';

export type DefaultFormat = 'ask' | 'audio' | 'video720';

export type AppSettings = {
  /** Update yt-dlp once a day at launch. */
  autoUpdate: boolean;
  /** What the download button does: open the format menu, or download straight away. */
  defaultFormat: DefaultFormat;
  /** Simultaneous downloads (1–3). */
  maxParallel: number;
  /** First-launch personal-use notice accepted. */
  consentAccepted: boolean;
};

const DEFAULTS: AppSettings = {
  autoUpdate: true,
  defaultFormat: 'ask',
  maxParallel: 2,
  consentAccepted: false,
};

export const settingsStore = createStore<AppSettings>(DEFAULTS);

export function loadSettings() {
  settingsStore.set({ ...DEFAULTS, ...getSetting<Partial<AppSettings>>('app', {}) });
}

export function updateSettings(patch: Partial<AppSettings>) {
  const next = { ...settingsStore.get(), ...patch };
  settingsStore.set(next);
  setSetting('app', next);
}
