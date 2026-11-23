import { SoundMaterial } from './blocks';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public volume = 0.6;

  private ensureContext(): AudioContext | null {
    if (this.volume <= 0.01) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer) {
      const length = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  private playFilteredNoise(freq: number, q: number, duration: number, gainVal: number, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    filter.Q.setValueAtTime(q, ctx.currentTime);

    const gain = ctx.createGain();
    const g = gainVal * this.volume;
    gain.gain.setValueAtTime(g, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(ctx.currentTime, Math.random() * 0.5, duration);
  }

  playStep(mat: SoundMaterial) {
    const pitchJitter = 0.9 + Math.random() * 0.2;
    switch (mat) {
      case 'stone':
        this.playFilteredNoise(680 * pitchJitter, 2.5, 0.07, 0.14);
        break;
      case 'wood':
        this.playFilteredNoise(420 * pitchJitter, 3.0, 0.08, 0.16);
        break;
      case 'sand':
        this.playFilteredNoise(1400 * pitchJitter, 1.2, 0.09, 0.12);
        break;
      case 'water':
        this.playFilteredNoise(900 * pitchJitter, 0.9, 0.16, 0.18, 'lowpass');
        break;
      default:
        this.playFilteredNoise(540 * pitchJitter, 1.4, 0.08, 0.13);
    }
  }

  playDig(mat: SoundMaterial) {
    const pitchJitter = 0.85 + Math.random() * 0.3;
    if (mat === 'stone') {
      this.playFilteredNoise(950 * pitchJitter, 3.2, 0.07, 0.22);
    } else if (mat === 'wood') {
      this.playFilteredNoise(360 * pitchJitter, 2.4, 0.08, 0.24);
    } else {
      this.playFilteredNoise(620 * pitchJitter, 1.5, 0.07, 0.2);
    }
  }

  playBreak(mat: SoundMaterial) {
    const pitchJitter = 0.9 + Math.random() * 0.2;
    if (mat === 'glass') {
      this.playFilteredNoise(3200 * pitchJitter, 3.0, 0.18, 0.32, 'highpass');
      return;
    }
    if (mat === 'stone') {
      this.playFilteredNoise(480 * pitchJitter, 1.8, 0.14, 0.35);
    } else if (mat === 'wood') {
      this.playFilteredNoise(310 * pitchJitter, 2.0, 0.14, 0.35);
    } else {
      this.playFilteredNoise(450 * pitchJitter, 1.1, 0.13, 0.3);
    }
  }

  playPlace(mat: SoundMaterial) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = mat === 'stone' ? 190 : mat === 'wood' ? 140 : 120;
    osc.frequency.setValueAtTime(base * (0.95 + Math.random() * 0.1), ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.24 * this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playPickup() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.07);
    gain.gain.setValueAtTime(0.14 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  playExplode() {
    this.playFilteredNoise(180, 0.6, 0.65, 0.65, 'lowpass');
  }

  playSplash() {
    this.playFilteredNoise(780, 0.8, 0.24, 0.28, 'bandpass');
  }

  playPlayerHurt() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFilteredNoise(320, 1.2, 0.14, 0.36, 'lowpass');
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    gain.gain.setValueAtTime(0.24 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playMobHurt() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(240 + Math.random() * 40, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
    gain.gain.setValueAtTime(0.2 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playZombieGroan() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 92 + Math.random() * 26;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.72, now + 0.55);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now);
    filter.Q.setValueAtTime(2.8, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16 * this.volume, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  playClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.06 * this.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.035);
  }

  playCoin() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(988, now);
    osc.frequency.setValueAtTime(1318, now + 0.06);
    gain.gain.setValueAtTime(0.16 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  playTrainChug() {
    this.playFilteredNoise(240 + Math.random() * 60, 1.8, 0.11, 0.15, 'bandpass');
  }

  playTrainWhistle() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const freq of [440, 554]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12 * this.volume, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  }

  playDoor(opening: boolean) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    if (opening) {
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.11);
    } else {
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(105, now + 0.12);
    }
    gain.gain.setValueAtTime(0.24 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
    this.playFilteredNoise(opening ? 480 : 320, 2.2, 0.08, 0.18);
  }
}

export const soundEngine = new SoundEngine();
