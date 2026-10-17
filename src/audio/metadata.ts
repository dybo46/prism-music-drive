import { parseBlob, selectCover } from 'music-metadata';
import type { Track } from '../queue/queue';
export async function readMetadata(track: Track): Promise<Partial<Track>> {
  const data = await parseBlob(track.file, { duration: false, skipPostHeaders: true });
  const result: Partial<Track> = {
    title: data.common.title || track.title,
    artist: data.common.artist || track.artist,
    album: data.common.album,
    sampleRate: data.format.sampleRate,
    channels: data.format.numberOfChannels,
  };
  const picture = selectCover(data.common.picture);
  if (picture && picture.data.byteLength < 20 * 1024 * 1024) {
    try {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(picture.data)], { type: picture.format }),
      );
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.85),
      );
      if (blob) result.cover = URL.createObjectURL(blob);
    } catch {
      /* A malformed cover must not prevent playback. */
    }
  }
  return result;
}
