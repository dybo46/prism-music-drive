import type { SongMap } from './song-map';
export class SongAnalysis {
  map?: SongMap;
  status = '曲全体を先読み';
  loading = false;
  private finish?: () => void;
  private decoding = Promise.resolve();
  private worker?: Worker;
  private generation = 0;
  private cache = new WeakMap<File, SongMap>();
  cancel() {
    this.loading = false;
    this.finish?.();
    this.finish = undefined;
    this.generation++;
    this.worker?.terminate();
    this.worker = undefined;
    this.map = undefined;
    this.status = '曲全体を先読み';
  }
  remix() {
    if (this.map)
      this.map = { ...this.map, visualSeed: crypto.getRandomValues(new Uint32Array(1))[0] };
  }
  async load(file: File) {
    this.cancel();
    const generation = this.generation;
    const cached = this.cache.get(file);
    if (cached) {
      this.map = cached;
      this.remix();
      this.status = '先読み完了';
      return;
    }
    this.loading = true;
    this.status = '音源を展開中…';
    try {
      if (file.size > 160 * 1024 * 1024) throw Error('160MBを超える音源は瞬間解析で再生');
      const bytes = await file.arrayBuffer();
      if (generation !== this.generation) return;
      // Serialize uninterruptible decodes; stale selections never start another allocation.
      let decoded: AudioBuffer | undefined;
      const job = this.decoding.then(async () => {
        if (generation !== this.generation) return;
        decoded = await new OfflineAudioContext(2, 1, 22050).decodeAudioData(bytes);
      });
      this.decoding = job.catch(() => {});
      await job;
      if (!decoded) return;
      if (generation !== this.generation) return;
      if (decoded.duration > 1200) throw Error('20分を超える音源は瞬間解析で再生');
      const l = decoded.getChannelData(0).slice(),
        r = decoded.getChannelData(Math.min(1, decoded.numberOfChannels - 1)).slice();
      const worker = (this.worker = new Worker(new URL('./song-worker.ts', import.meta.url), {
        type: 'module',
      }));
      await new Promise<void>((resolve) => {
        this.finish = resolve;
        worker.onmessage = ({ data }) => {
          if (generation !== this.generation) return;
          if (data.map) {
            this.map = data.map;
            this.remix();
            this.cache.set(file, data.map);
            this.status = '先読み完了';
            worker.terminate();
            this.worker = undefined;
            resolve();
          } else if (data.error) {
            this.status = data.error + ' · 瞬間解析で再生';
            worker.terminate();
            this.worker = undefined;
            resolve();
          } else this.status = `曲全体を解析中 ${Math.round(data.progress * 100)}%`;
        };
        worker.onerror = () => {
          if (generation === this.generation) this.status = '先読み失敗 · 瞬間解析で再生';
          worker.terminate();
          resolve();
        };
        worker.postMessage({ l, r, sr: decoded!.sampleRate }, [l.buffer, r.buffer]);
      });
    } catch (error) {
      if (generation === this.generation)
        this.status =
          error instanceof Error && !('code' in error)
            ? error.message
            : '先読み不可 · 瞬間解析で再生';
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.finish = undefined;
      }
    }
  }
}
