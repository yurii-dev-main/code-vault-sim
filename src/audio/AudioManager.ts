/**
 * Procedural Web Audio API sound generator and cozy ambient music engine.
 * Zero external audio file dependencies - 100% self-contained and instant.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private isUnlocked = false;

  // Master Gain Nodes
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Music state: Off by default on start as requested
  public isMusicEnabled = false;
  public isSfxEnabled = true;
  private musicIntervalId: any = null;
  private currentChordIndex = 0;

  // Throttling for collision clinks
  private lastClinkTime = 0;

  constructor() {
    this.setupUnlockListeners();
  }

  private initContext(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // Dynamics Compressor on Master to give warmth, richness and prevent clipping
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
    this.compressor.connect(this.ctx.destination);

    // Master bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.masterGain.connect(this.compressor);

    // Music bus: Start muted (0.0) since music is off by default
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);

    // SFX bus: 0.70 volume for crisp metallic impact responses
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.70, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
  }

  /**
   * Robust context helper that ensures context exists and automatically resumes
   * if the browser suspended it due to tab switching or power saving.
   */
  private ensureContext(): boolean {
    if (!this.ctx) {
      this.initContext();
    }
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return true;
  }

  private setupUnlockListeners(): void {
    const tryResume = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    };

    // First user gesture unlock
    const unlockFirst = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlockFirst);
      window.removeEventListener('keydown', unlockFirst);
      window.removeEventListener('touchstart', unlockFirst);
    };

    window.addEventListener('pointerdown', unlockFirst, { passive: true });
    window.addEventListener('keydown', unlockFirst, { passive: true });
    window.addEventListener('touchstart', unlockFirst, { passive: true });

    // Persistent resume listeners so AudioContext automatically recovers after tab switch or sleep
    window.addEventListener('pointerdown', tryResume, { passive: true });
    window.addEventListener('touchstart', tryResume, { passive: true });
    window.addEventListener('keydown', tryResume, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        tryResume();
      }
    });
    window.addEventListener('focus', tryResume);
  }

  public unlock(): void {
    this.initContext();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.isUnlocked) {
      this.isUnlocked = true;
      if (this.isMusicEnabled) {
        this.startAmbientMusic();
      }
    }
  }

  // ==========================================
  // 🎶 Procedural Cozy Ambient Music Engine
  // ==========================================

  public startAmbientMusic(): void {
    if (!this.ensureContext()) return;
    this.stopAmbientMusic(); // Clear any existing timer to prevent overlaps

    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0.44, this.ctx.currentTime, 0.2);
    }

    this.playNextBar();
    this.musicIntervalId = setInterval(() => {
      this.playNextBar();
    }, 4800);
  }

  public stopAmbientMusic(): void {
    if (this.musicIntervalId) {
      clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.15);
    }
  }

  public toggleMusic(): boolean {
    this.ensureContext();
    this.isMusicEnabled = !this.isMusicEnabled;

    if (this.isMusicEnabled) {
      this.startAmbientMusic();
    } else {
      this.stopAmbientMusic();
    }

    return this.isMusicEnabled;
  }

  public toggleSfx(): boolean {
    this.ensureContext();
    this.isSfxEnabled = !this.isSfxEnabled;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.isSfxEnabled ? 0.70 : 0.0, this.ctx.currentTime);
    }
    return this.isSfxEnabled;
  }

  private playNextBar(): void {
    if (!this.isMusicEnabled || !this.ensureContext() || !this.ctx || !this.musicGain) return;

    // Warm, uplifting, rewarding chords:
    // Cmaj9 -> Am9 -> Fmaj7 -> Gsus4
    const chords = [
      [130.81, 196.00, 246.94, 293.66, 329.63], // C3, G3, B3, D4, E4 (Cmaj9)
      [110.00, 164.81, 220.00, 261.63, 329.63], // A2, E3, A3, C4, E4 (Am9)
      [174.61, 220.00, 261.63, 329.63, 392.00], // F3, A3, C4, E4, G4 (Fmaj7)
      [196.00, 261.63, 293.66, 392.00, 440.00]  // G3, C4, D4, G4, A4 (Gsus4/add9)
    ];

    const chord = chords[this.currentChordIndex];
    this.currentChordIndex = (this.currentChordIndex + 1) % chords.length;

    const barDuration = 4.8; // seconds per chord
    const now = this.ctx.currentTime;

    // 1. Play Warm Pad Chord
    this.playWarmPad(chord, now, barDuration);

    // 2. Play Dreamy Bell Plucks throughout the bar
    this.scheduleBellMelody(chord, now, barDuration);
  }

  private playWarmPad(frequencies: number[], startTime: number, duration: number): void {
    if (!this.ctx || !this.musicGain) return;

    // Filtered multi-oscillator pad with boosted, rich harmonics
    frequencies.forEach((freq, idx) => {
      const osc1 = this.ctx!.createOscillator();
      const osc2 = this.ctx!.createOscillator();
      const noteGain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      // Subtle detune for lush stereo chorus warmth
      osc1.frequency.setValueAtTime(freq - 0.45, startTime);
      osc2.frequency.setValueAtTime(freq + 0.45, startTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750 + idx * 90, startTime);
      filter.frequency.exponentialRampToValueAtTime(1150 + idx * 80, startTime + duration * 0.5);
      filter.frequency.exponentialRampToValueAtTime(750 + idx * 90, startTime + duration);

      // Warm envelope
      const amp = 0.14 / Math.sqrt(frequencies.length);
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(amp, startTime + 0.9);
      noteGain.gain.setValueAtTime(amp, startTime + duration - 0.9);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.musicGain!);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration);
      osc2.stop(startTime + duration);
    });
  }

  private scheduleBellMelody(chord: number[], startTime: number, duration: number): void {
    if (!this.ctx || !this.musicGain) return;

    // Pentatonic bell arpeggio notes
    const highNotes = chord.map(f => f * 2);
    const step = duration / 4;

    for (let i = 0; i < 4; i++) {
      if (Math.random() > 0.25) {
        const noteTime = startTime + i * step + (Math.random() - 0.5) * 0.15;
        const noteFreq = highNotes[Math.floor(Math.random() * highNotes.length)];
        this.playMusicBoxNote(noteFreq, noteTime);
      }
    }
  }

  private playMusicBoxNote(freq: number, time: number): void {
    if (!this.ctx || !this.musicGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 1.8);
  }

  // ==========================================
  // 🪙 Physical Sound Effects (SFX)
  // ==========================================

  /**
   * Played when an interacted coin lands on the floor or the jar after being dropped/thrown
   */
  public playCoinLand(intensity = 1.0): void {
    if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const now = performance.now();
    if (now - this.lastClinkTime < 60) return;
    this.lastClinkTime = now;

    const t = this.ctx.currentTime;
    const clampedIntensity = Math.min(Math.max(intensity, 0.4), 1.6);

    // Primary impact clink (eigenmodes)
    const baseFreq = 3400 + (Math.random() - 0.5) * 500;
    const overtones = [baseFreq, baseFreq * 1.64, baseFreq * 2.38];

    overtones.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const peakGain = (0.22 / (idx + 1)) * clampedIntensity;
      const decayDuration = 0.16 + (idx === 0 ? 0.10 : 0.04);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decayDuration);

      osc.connect(gain);
      gain.connect(this.sfxGain!);

      osc.start(t);
      osc.stop(t + decayDuration);
    });

    // Secondary micro-bounce clink 55ms later to simulate natural settle bounce
    setTimeout(() => {
      if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;
      const tBounce = this.ctx.currentTime;
      const oscBounce = this.ctx.createOscillator();
      const gainBounce = this.ctx.createGain();

      oscBounce.type = 'sine';
      oscBounce.frequency.setValueAtTime(baseFreq * 1.08, tBounce);

      gainBounce.gain.setValueAtTime(0.0001, tBounce);
      gainBounce.gain.exponentialRampToValueAtTime(0.10 * clampedIntensity, tBounce + 0.002);
      gainBounce.gain.exponentialRampToValueAtTime(0.0001, tBounce + 0.12);

      oscBounce.connect(gainBounce);
      gainBounce.connect(this.sfxGain!);

      oscBounce.start(tBounce);
      oscBounce.stop(tBounce + 0.12);
    }, 55);
  }

  /**
   * Sound when grabbing a coin (crisp contact ping)
   */
  public playCoinPick(): void {
    if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.07);

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  /**
   * Soft whoosh sound when coin is released or thrown
   */
  public playCoinThrow(): void {
    if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.08);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.18);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }

  /**
   * Sound of jar lid rotating on glass threads (friction scrape)
   */
  public playLidUnscrew(): void {
    if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const duration = 0.75;

    // Metallic squeak / friction scrape
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.linearRampToValueAtTime(450, t + duration);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.Q.setValueAtTime(6.0, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Mechanical pop/ring when lid reaches top of thread and flies off
   */
  public playLidPop(): void {
    if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. Bass pop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);

    // 2. High metallic release ring
    const ring = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1850, t);

    ringGain.gain.setValueAtTime(0.14, t);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    ring.connect(ringGain);
    ringGain.connect(this.sfxGain);

    ring.start(t);
    ring.stop(t + 0.35);
  }

  /**
   * Heavy metallic clatter and bounce when the jar lid lands on the floor
   */
  public playLidHitFloor(): void {
    if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. Heavy low body thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.22);

    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.25);

    // 2. Metallic clang ring
    const ping = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(1350, t);
    ping.frequency.linearRampToValueAtTime(1250, t + 0.35);

    pingGain.gain.setValueAtTime(0.18, t);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    ping.connect(pingGain);
    pingGain.connect(this.sfxGain);

    ping.start(t);
    ping.stop(t + 0.35);

    // 3. Secondary rattle 70ms later as lid settles on the floor
    setTimeout(() => {
      if (!this.isSfxEnabled || !this.ensureContext() || !this.ctx || !this.sfxGain) return;
      const tRat = this.ctx.currentTime;
      const rat = this.ctx.createOscillator();
      const ratGain = this.ctx.createGain();

      rat.type = 'sine';
      rat.frequency.setValueAtTime(1100, tRat);

      ratGain.gain.setValueAtTime(0.10, tRat);
      ratGain.gain.exponentialRampToValueAtTime(0.0001, tRat + 0.18);

      rat.connect(ratGain);
      ratGain.connect(this.sfxGain!);

      rat.start(tRat);
      rat.stop(tRat + 0.18);
    }, 70);
  }
}
