import { NativeModule, requireNativeModule } from 'expo';

export type ProgressEvent = { id: string; progress: number; eta: number };
export type DownloadResult = { uri: string; thumbnailPath: string | null; size: number };
export type MediaKind = 'audio' | 'video';

export type SearchResult = {
  id: string;
  title: string;
  artist: string;
  duration: number | null;
  thumbnail: string;
};

export type DownloadOption = {
  kind: MediaKind;
  /** Max video height; 0 for audio. */
  height: number;
  label: string;
  /** Approximate size in bytes, if YouTube reports it. */
  size: number | null;
};

type Events = { onProgress: (e: ProgressEvent) => void };

declare class YtDlpNative extends NativeModule<Events> {
  init(): Promise<void>;
  version(): Promise<string | null>;
  update(): Promise<string>;
  search(query: string, limit: number): Promise<string>;
  formats(id: string): Promise<string>;
  download(key: string, id: string, kind: MediaKind, height: number, baseName: string): Promise<DownloadResult>;
  cancel(key: string): boolean;
  deleteMedia(uri: string): Promise<boolean>;
  exists(uri: string): Promise<boolean>;
  writePlaylistFile(existingUri: string | null, name: string, content: string): Promise<string>;
  mediaPaths(uris: string[]): Promise<(string | null)[]>;
  mediaSizes(uris: string[]): Promise<(number | null)[]>;
}

const YtDlp = requireNativeModule<YtDlpNative>('YtDlp');

export default YtDlp;

export const VIDEO_HEIGHTS = [360, 720, 1080];

/** Stable key for one downloaded variant of a video, e.g. "abc123:audio" or "abc123:video720". */
export function downloadKey(id: string, kind: MediaKind, height = 0) {
  return kind === 'audio' ? `${id}:audio` : `${id}:video${height}`;
}

export function thumbnailFor(id: string) {
  return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}

function toResult(e: any): SearchResult {
  return {
    id: e.id,
    title: e.title ?? 'Unknown title',
    artist: e.artists?.[0] ?? e.artist ?? e.channel ?? e.uploader ?? 'Unknown artist',
    duration: typeof e.duration === 'number' ? e.duration : null,
    thumbnail: thumbnailFor(e.id),
  };
}

const isVideoId = (id: unknown) => typeof id === 'string' && id.length === 11;

export type SearchResponse = {
  results: SearchResult[];
  /** Set when the query was a YouTube playlist link. */
  playlist: { id: string; title: string } | null;
};

/** Searches YouTube. Also accepts a pasted video or playlist link. */
export async function search(query: string, limit = 25): Promise<SearchResponse> {
  const isUrl = /^https?:\/\//i.test(query);
  const json = JSON.parse(await YtDlp.search(query, isUrl ? 200 : limit));
  // A single-video link returns the video itself rather than a list of entries.
  const entries: any[] = json.entries ?? (json.id ? [json] : []);
  const results = entries.filter((e) => isVideoId(e?.id)).map(toResult); // drop channels/playlists
  const playlist =
    isUrl && json._type === 'playlist' && json.entries
      ? { id: String(json.id), title: json.title ?? 'YouTube playlist' }
      : null;
  return { results, playlist };
}

const sizeOf = (f: any): number => f?.filesize ?? f?.filesize_approx ?? 0;

/** Download choices for a video with approximate sizes (same format rules as the native side). */
export async function downloadOptions(id: string): Promise<DownloadOption[]> {
  const info = JSON.parse(await YtDlp.formats(id));
  const formats: any[] = info.formats ?? [];
  const audioOnly = formats.filter((f) => f.vcodec === 'none' && f.acodec && f.acodec !== 'none');
  const bestAudio = audioOnly
    .filter((f) => f.ext === 'm4a')
    .concat(audioOnly)
    .sort((a, b) => (b.ext === 'm4a' ? 1 : 0) - (a.ext === 'm4a' ? 1 : 0) || (b.abr ?? 0) - (a.abr ?? 0))[0];

  const videoOnly = formats.filter((f) => f.vcodec && f.vcodec !== 'none' && f.height);
  const maxHeight = Math.max(0, ...videoOnly.map((f) => f.height));
  const m4aSize = sizeOf(audioOnly.filter((f) => f.ext === 'm4a').sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0]);

  const options: DownloadOption[] = [
    { kind: 'audio', height: 0, label: `Audio · ${bestAudio?.ext ?? 'm4a'}`, size: sizeOf(bestAudio) || null },
  ];
  for (const h of VIDEO_HEIGHTS) {
    // Offer a height if the video has it, and always offer the lowest one.
    if (maxHeight < h && h !== VIDEO_HEIGHTS[0]) continue;
    const candidates = videoOnly.filter((f) => f.height <= h);
    const pick =
      candidates.filter((f) => String(f.vcodec).startsWith('avc1')).sort((a, b) => b.height - a.height)[0] ??
      candidates.filter((f) => f.ext === 'mp4').sort((a, b) => b.height - a.height)[0];
    const size = pick && sizeOf(pick) ? sizeOf(pick) + m4aSize : null;
    options.push({ kind: 'video', height: h, label: `Video · ${h}p`, size });
  }
  return options;
}
