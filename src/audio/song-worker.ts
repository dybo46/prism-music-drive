import { analyzeSong } from './song-map';
self.onmessage = ({ data }) => {
  try {
    const map = analyzeSong(data.l, data.r, data.sr, (value) =>
      self.postMessage({ progress: value }),
    );
    self.postMessage({ map });
  } catch {
    self.postMessage({ error: '解析処理に失敗しました' });
  }
};
