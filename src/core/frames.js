// Deteção de mudanças no ecrã: se o gráfico não mexeu, não gastamos dinheiro na API.

/** Converte pixels RGBA numa miniatura em tons de cinzento (array de 0-255). */
export function paraCinzento(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) | 0;
  }
  return out;
}

/** Fração (0-1) de píxeis que mudaram de forma visível entre duas miniaturas. */
export function diferenca(a, b, limiar = 12) {
  if (!a || !b || a.length !== b.length || !a.length) return 1;
  let mudados = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > limiar) mudados++;
  return mudados / a.length;
}

/**
 * Decide se vale a pena analisar outra vez.
 * Analisa sempre se passou demasiado tempo, mesmo sem mudanças (para não perder contexto).
 */
export function deveAnalisar({ miniaturaAtual, miniaturaAnterior, msDesdeUltima, minMudanca = 0.004, maxMsSemAnalise = 5 * 60_000 }) {
  if (!miniaturaAnterior) return { analisar: true, motivo: "primeira" };
  if (msDesdeUltima >= maxMsSemAnalise) return { analisar: true, motivo: "tempo" };
  const d = diferenca(miniaturaAtual, miniaturaAnterior);
  return d >= minMudanca ? { analisar: true, motivo: "mudanca", diferenca: d } : { analisar: false, motivo: "igual", diferenca: d };
}
