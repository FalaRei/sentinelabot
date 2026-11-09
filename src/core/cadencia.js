// Quando ler o gráfico. Ler a cada 30 s num gráfico de 5 min gasta dinheiro sem acrescentar nada:
// a vela ainda não fechou. Por isso a IA lê no fecho de cada vela, alinhado com o relógio.

export const TIMEFRAMES = [
  { min: 1, nome: "1 minuto" },
  { min: 5, nome: "5 minutos" },
  { min: 15, nome: "15 minutos" },
  { min: 60, nome: "1 hora" },
];

/**
 * Milissegundos até ao próximo fecho de vela, mais uma pequena margem para a plataforma desenhar a vela nova.
 * As velas fecham em múltiplos do timeframe contados desde a meia-noite UTC (é assim nas plataformas).
 */
export function msAteFechoVela(timeframeMin, agora = Date.now(), margemMs = 3000) {
  const periodo = Math.max(1, timeframeMin) * 60_000;
  const proximo = Math.floor(agora / periodo) * periodo + periodo;
  return proximo - agora + margemMs;
}

/** Leituras por hora com esta cadência (para a estimativa de custo). */
export const leiturasPorHora = (timeframeMin) => 60 / Math.max(1, timeframeMin);

/**
 * Lê o timeframe que a IA viu no gráfico ("5m", "M5", "15 min", "1H", "H1", "D1") e devolve minutos.
 * Devolve null se não perceber.
 */
export function lerTimeframe(texto) {
  const t = String(texto ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  const unidades = { m: 1, min: 1, h: 60, d: 1440 };
  let m = t.match(/^(\d+)(min|m|h|d)$/);
  if (m) return Number(m[1]) * unidades[m[2]];
  m = t.match(/^(m|h|d)(\d+)$/);
  if (m) return Number(m[2]) * unidades[m[1]];
  if (/^\d+$/.test(t)) return Number(t); // "15" nas plataformas costuma ser minutos
  return null;
}
