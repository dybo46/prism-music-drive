export const recordMarkup = () =>
  `<div class="turntable"><div class="turntable-screw screw-a"></div><div class="turntable-screw screw-b"></div><div class="platter"><div class="vinyl"><div class="record-label"><span>MOTION<br>／ SOUND</span><img alt="アルバムジャケット" hidden></div><i class="spindle"></i></div></div><div class="tonearm"><i></i></div><span class="rpm">33⅓ RPM</span><span class="record-expand">↗</span></div>`;
export class RecordPlayer {
  angle = 0;
  speed = 0;
  private covers: HTMLImageElement[];
  constructor(private elements: HTMLElement[]) {
    this.covers = elements.flatMap((e) =>
      Array.from(e.querySelectorAll<HTMLImageElement>('.record-label img')),
    );
  }
  cover(url?: string) {
    for (const image of this.covers) {
      image.hidden = !url;
      if (url) image.src = url;
      else image.removeAttribute('src');
    }
  }
  update(dt: number, playing: boolean, progress: number, reduced: boolean) {
    this.speed += ((playing && !reduced ? 200 : 0) - this.speed) * (1 - Math.exp(-dt / 0.5));
    this.angle = (this.angle + this.speed * dt) % 360;
    for (const e of this.elements) {
      e.style.setProperty('--rotation', this.angle + 'deg');
      e.style.setProperty('--arm', 10 + Math.max(0, Math.min(1, progress)) * 16 + 'deg');
    }
  }
}
