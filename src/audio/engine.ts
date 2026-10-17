import workletUrl from './analysis-worklet.js?url';
import { FeatureAnalyzer, emptyFeatures, type Features } from './dsp';
export class AudioEngine extends EventTarget {
  readonly audio = new Audio();
  context?: AudioContext;
  private gain?: GainNode;
  private capture?: AudioWorkletNode;
  private analyzer = new FeatureAnalyzer();
  private initializing?: Promise<void>;
  private epoch = 0;
  features: Features = emptyFeatures();
  volume = 0.7;
  analysisError = false;
  sourceChannels?: number;
  constructor() {
    super();
    this.audio.preload = 'metadata';
    this.audio.volume = 1;
    this.audio.addEventListener('seeking', () => this.reset());
  }
  async init() {
    if (!this.initializing) this.initializing = this.setup();
    await this.initializing;
    await this.context!.resume();
  }
  private async setup() {
    this.context = new AudioContext({ sampleRate: 48000 });
    const source = this.context.createMediaElementSource(this.audio);
    this.gain = this.context.createGain();
    this.gain.gain.value = this.volume;
    source.connect(this.gain).connect(this.context.destination);
    try {
      await this.context.audioWorklet.addModule(workletUrl);
      this.capture = new AudioWorkletNode(this.context, 'stereo-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCountMode: 'max',
      });
      source.connect(this.capture).connect(this.context.destination);
      this.capture.port.onmessage = ({ data }) => {
        if (data.epoch === this.epoch && !this.audio.paused && !this.audio.seeking) {
          this.features = this.analyzer.analyze(
            data.l,
            data.r,
            this.context!.sampleRate,
            data.time,
            this.sourceChannels === 1 || data.mono,
          );
          this.dispatchEvent(new Event('features'));
        }
        this.capture!.port.postMessage({ type: 'recycle', l: data.l, r: data.r }, [
          data.l.buffer,
          data.r.buffer,
        ]);
      };
      this.capture.port.postMessage({ type: 'reset', epoch: this.epoch });
    } catch (error) {
      this.analysisError = true;
      this.dispatchEvent(new CustomEvent('analysiserror', { detail: error }));
    }
  }
  reset() {
    this.epoch++;
    this.analyzer.reset();
    this.features = emptyFeatures();
    this.capture?.port.postMessage({ type: 'reset', epoch: this.epoch });
    this.dispatchEvent(new Event('reset'));
  }
  async play() {
    await this.init();
    await this.audio.play();
  }
  pause() {
    this.audio.pause();
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(value, this.context.currentTime, 0.025);
  }
  dispose() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.capture?.disconnect();
    void this.context?.close();
  }
}
