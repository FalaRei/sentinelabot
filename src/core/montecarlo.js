// Simulador: N traders com a MESMA estratégia, só muda o risco por trade.
// Mostra porque é que a gestão de risco decide quem sobrevive.

import { prng } from "./market-sim.js";

/**
 * @param {{traders?:number, trades?:number, acerto?:number, rr?:number, riscoPct?:number, semente?:number, limiteRuina?:number}} p
 * @returns {{caminhos:number[][], mediana:number[], rebentaram:number, percentRebentaram:number, finalMediano:number, piorFinal:number, melhorFinal:number}}
 */
// Padrão: uma estratégia com vantagem pequena mas real (+0,06 R por trade), como as que funcionam na prática.
export function simularTraders({ traders = 50, trades = 100, acerto = 0.38, rr = 1.8, riscoPct = 2, semente = 7, limiteRuina = 0.5 } = {}) {
  const aleatorio = prng(semente);
  const r = riscoPct / 100;
  const caminhos = [];
  let rebentaram = 0;
  for (let k = 0; k < traders; k++) {
    let saldo = 1;
    let rebentou = false;
    const c = [1];
    for (let i = 0; i < trades; i++) {
      // risco sobre o saldo atual (juros compostos), como faz quem segue a regra dos X%
      saldo += aleatorio() < acerto ? saldo * r * rr : -saldo * r;
      if (saldo < limiteRuina) rebentou = true;
      c.push(Math.round(saldo * 10000) / 10000);
    }
    if (rebentou) rebentaram++;
    caminhos.push(c);
  }
  const mediana = caminhos[0].map((_, i) => {
    const col = caminhos.map((c) => c[i]).sort((a, b) => a - b);
    const m = col.length >> 1;
    return col.length % 2 ? col[m] : (col[m - 1] + col[m]) / 2;
  });
  const finais = caminhos.map((c) => c[c.length - 1]);
  return {
    caminhos,
    mediana,
    rebentaram,
    percentRebentaram: Math.round((rebentaram / traders) * 100),
    finalMediano: mediana[mediana.length - 1],
    piorFinal: Math.min(...finais),
    melhorFinal: Math.max(...finais),
  };
}

/** Expectativa matemática por trade, em múltiplos do risco (R). */
export const expectativaR = (acerto, rr) => Math.round((acerto * rr - (1 - acerto)) * 100) / 100;

/** Saldo depois de N perdas seguidas e ganho necessário para recuperar. */
export function perdasSeguidas(riscoPct, n) {
  const restante = Math.pow(1 - riscoPct / 100, n);
  return { restante, recuperar: 1 / restante - 1 };
}
