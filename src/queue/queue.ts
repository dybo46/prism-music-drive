export interface Track {
  id: string;
  file: File;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  sampleRate?: number;
  channels?: number;
  failed?: boolean;
}
export class Queue extends EventTarget {
  tracks: Track[] = [];
  currentId: string | null = null;
  get current() {
    return this.tracks.find((t) => t.id === this.currentId);
  }
  add(files: File[]) {
    const added = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'Unknown Artist',
    }));
    this.tracks.push(...added);
    this.changed();
    return added;
  }
  move(id: string, direction: number) {
    const i = this.tracks.findIndex((t) => t.id === id),
      j = i + direction;
    if (i < 0 || j < 0 || j >= this.tracks.length) return;
    [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    this.changed();
  }
  remove(id: string) {
    const i = this.tracks.findIndex((t) => t.id === id);
    if (i < 0) return;
    const [removed] = this.tracks.splice(i, 1);
    if (removed.cover) URL.revokeObjectURL(removed.cover);
    this.changed();
  }
  changed() {
    this.dispatchEvent(new Event('change'));
  }
  dispose() {
    for (const track of this.tracks) if (track.cover) URL.revokeObjectURL(track.cover);
    this.tracks = [];
  }
}
