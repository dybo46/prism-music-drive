class StereoCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048;
    this.offset = 0;
    this.epoch = 0;
    this.l = new Float32Array(this.size);
    this.r = new Float32Array(this.size);
    this.pool = [
      { l: new Float32Array(this.size), r: new Float32Array(this.size) },
      { l: new Float32Array(this.size), r: new Float32Array(this.size) },
    ];
    this.port.onmessage = ({ data }) => {
      if (data.type === 'reset') {
        this.epoch = data.epoch;
        this.offset = 0;
      }
      if (data.type === 'recycle') this.pool.push({ l: data.l, r: data.r });
    };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const left = channels[0],
      right = channels[1] || left;
    for (let i = 0; i < left.length; i++) {
      this.l[this.offset] = left[i];
      this.r[this.offset] = right[i];
      this.offset++;
      if (this.offset === this.size) {
        const block = this.pool.pop();
        if (block) {
          block.l.set(this.l);
          block.r.set(this.r);
          this.port.postMessage(
            {
              l: block.l,
              r: block.r,
              time: (currentFrame + i + 1) / sampleRate,
              mono: channels.length === 1,
              epoch: this.epoch,
            },
            [block.l.buffer, block.r.buffer],
          );
        }
        this.offset = 0;
      }
    }
    return true; // Output stays silent; audible path bypasses this processor.
  }
}
registerProcessor('stereo-capture', StereoCapture);
