// Sons curtos gerados no browser (sem ficheiros). Só tocam depois de um clique do utilizador.

let ctx = null;
function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function nota(freq, inicio, duracao, volume = 0.12, tipo = "sine") {
  const c = contexto();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.value = freq;
  const t = c.currentTime + inicio;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + duracao + 0.05);
}

export const sons = {
  ligado: true,
  /** pontos ganhos: duas notas a subir */
  xp() {
    if (!this.ligado) return;
    nota(880, 0, 0.18);
    nota(1318.5, 0.08, 0.28);
  },
  /** nova conquista: arpejo */
  conquista() {
    if (!this.ligado) return;
    [659.25, 830.6, 987.8, 1318.5].forEach((f, i) => nota(f, i * 0.07, 0.35, 0.1));
  },
  /** subida de patente: acorde maior com brilho */
  patente() {
    if (!this.ligado) return;
    [523.25, 659.25, 783.99].forEach((f) => nota(f, 0, 0.9, 0.08, "triangle"));
    [1046.5, 1318.5, 1568].forEach((f, i) => nota(f, 0.25 + i * 0.09, 0.6, 0.06));
  },
  /** alerta crítico: dois toques graves */
  alerta() {
    if (!this.ligado) return;
    nota(330, 0, 0.16, 0.14, "square");
    nota(262, 0.2, 0.24, 0.14, "square");
  },
};
