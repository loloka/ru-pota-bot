/**
 * Web Audio API Sound Chime Synthesizer
 * Generates lightweight, pleasant amateur radio alert sounds without downloading external audio files.
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Unlock audio context on first user interaction per browser autoplay policy
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
  };
  window.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
}

export const sound = {
  /**
   * Check if sound alerts are enabled
   * @returns {boolean}
   */
  isEnabled() {
    try {
      const val = localStorage.getItem('rupota_sound_alerts');
      return val === null ? true : val === 'true';
    } catch (e) {
      return true;
    }
  },

  /**
   * Toggle sound alerts state
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    try {
      localStorage.setItem('rupota_sound_alerts', String(enabled));
    } catch (e) {}
  },

  /**
   * Play sweet two-tone radio chime alert (880Hz -> 1320Hz)
   */
  playSpotChime() {
    if (!this.isEnabled()) return;

    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Note 1: 880 Hz (A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      // Note 2: 1320 Hz (E6 - perfect fifth higher)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, now + 0.12);
      gain2.gain.setValueAtTime(0.001, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.22, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.40);
    } catch (err) {
      // Audio playback warning - non-critical
    }
  }
};
