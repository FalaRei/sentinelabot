// Diário de exemplo (6 dias) para a demonstração e para gravar vídeos.
// Marcado com nota "[exemplo]" para nunca se confundir com trades reais.

import { novoTrade } from "./journal.js";

const MIN = 60_000;
const DIA = 24 * 60 * MIN;

// [dias atrás, hora, minuto, resultado €, seguiu o plano, tem stop, nota]
const GUIAO = [
  [5, 9, 40, 18, true, true, "pullback na média de 20"],
  [5, 11, 5, -9, true, true, "rompimento falhado"],
  [4, 10, 15, -10, true, true, "entrada cedo demais"],
  [4, 10, 25, -24, false, false, "tentei recuperar"],
  [4, 10, 32, -15, false, true, "fora do plano"],
  [3, 9, 50, 21, true, true, "tendência de 1H a favor"],
  [3, 14, 10, 12, true, true, "pullback"],
  [2, 9, 35, -8, true, true, "stop técnico"],
  [2, 13, 20, 17, true, true, "setup A"],
  [1, 10, 0, 22, true, true, "setup A"],
  [1, 15, 30, -9, true, true, "notícia inesperada"],
];

export function tradesExemplo(agora = Date.now()) {
  return GUIAO.map(([dias, h, m, resultado, plano, stop, nota], i) => {
    const d = new Date(agora - dias * DIA);
    d.setHours(h, m, 0, 0);
    const aberto = d.getTime();
    return novoTrade(
      {
        id: `exemplo_${i}`,
        ativo: i % 3 === 2 ? "BTCUSDT" : "EURUSD",
        direcao: i % 2 ? "venda" : "compra",
        entrada: i % 3 === 2 ? 67250 : 1.0915,
        stop: stop ? (i % 3 === 2 ? 66900 : 1.0898) : null,
        quantidade: i % 3 === 2 ? 0.025 : 5000,
        resultado,
        abertoEm: aberto,
        fechadoEm: aberto + 6 * MIN,
        seguiuPlano: plano,
        nota: `[exemplo] ${nota}`,
      },
      aberto
    );
  });
}

export const eExemplo = (t) => String(t.id).startsWith("exemplo_");
