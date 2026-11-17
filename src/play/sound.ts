// Sound effects, made on the spot with the browser's audio engine so there are no
// sound files to download. Browsers only allow sound after the first click or tap.
let ctx: AudioContext | null = null
let on = true

export function setSound(value: boolean) { on = value }
export function unlockSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

type Wave = OscillatorType
function tone(freq: number, to: number, dur: number, wave: Wave, gain: number, delay = 0) {
  const c = ctx!
  const t = c.currentTime + delay
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = wave
  o.frequency.setValueAtTime(freq, t)
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(c.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}
function noise(dur: number, gain: number, from: number, to: number, delay = 0) {
  const c = ctx!
  const t = c.currentTime + delay
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 0.9
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t)
}

const SOUNDS: Record<string, () => void> = {
  // A card sliding off the deck.
  draw: () => noise(0.12, 0.16, 2600, 5200),
  charge: () => { noise(0.1, 0.12, 1800, 900); tone(520, 780, 0.16, 'sine', 0.07, 0.03) },
  // A card slapped onto the table.
  summon: () => { noise(0.09, 0.3, 900, 220); tone(150, 70, 0.2, 'sine', 0.3) },
  waza: () => { noise(0.3, 0.2, 500, 4200); tone(330, 990, 0.28, 'triangle', 0.09) },
  // A low taiko-style hit for banners.
  drum: () => { tone(120, 48, 0.42, 'sine', 0.5); noise(0.06, 0.2, 500, 200) },
  line: () => { tone(196, 196, 0.16, 'triangle', 0.1); tone(294, 294, 0.2, 'triangle', 0.08, 0.09) },
  clash: () => { noise(0.22, 0.42, 3200, 500); tone(170, 55, 0.36, 'triangle', 0.42); tone(1250, 620, 0.12, 'square', 0.05) },
  down: () => { tone(220, 90, 0.26, 'sawtooth', 0.12); noise(0.1, 0.15, 700, 300) },
  destroy: () => { noise(0.4, 0.38, 2400, 160); tone(110, 38, 0.45, 'sine', 0.36) },
  damage: () => { tone(98, 46, 0.34, 'sine', 0.5); noise(0.12, 0.22, 420, 160) },
  heartbreak: () => { tone(98, 40, 0.5, 'sine', 0.5); noise(0.3, 0.3, 5200, 900, 0.04); tone(880, 220, 0.3, 'triangle', 0.08, 0.05) },
  trigger: () => { [659, 880, 1319].forEach((f, i) => tone(f, f, 0.34, 'sine', 0.12, i * 0.08)) },
  recover: () => { tone(440, 660, 0.22, 'sine', 0.09); tone(660, 880, 0.24, 'sine', 0.07, 0.1) },
  // Volleyball sounds for Haikyu.
  whistle: () => { tone(2350, 2300, 0.32, 'square', 0.035); tone(2480, 2450, 0.32, 'sine', 0.05) },
  serve: () => { noise(0.07, 0.4, 1400, 600); tone(240, 120, 0.12, 'sine', 0.25) },
  spike: () => { noise(0.1, 0.55, 2600, 500); tone(180, 60, 0.22, 'sine', 0.45); noise(0.18, 0.15, 900, 300, 0.12) },
  bump: () => { noise(0.06, 0.3, 700, 300); tone(200, 150, 0.14, 'sine', 0.3) },
  block: () => { noise(0.12, 0.5, 1200, 250); tone(130, 55, 0.3, 'sine', 0.5); tone(90, 50, 0.3, 'triangle', 0.2, 0.05) },
  cheer: () => { noise(0.9, 0.12, 900, 2600); [523, 659, 784].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.08, i * 0.1)) },
  click: () => tone(900, 700, 0.05, 'square', 0.03),
  win: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.5, 'triangle', 0.14, i * 0.13)) },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.55, 'sawtooth', 0.08, i * 0.2)) },
}

export function play(name: string) {
  if (!on || !ctx || ctx.state !== 'running') return
  try {
    SOUNDS[name]?.()
  } catch {
    /* sound is a nicety; the match goes on without it */
  }
}
