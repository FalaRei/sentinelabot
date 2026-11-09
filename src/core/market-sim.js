// Mercado simulado para a demonstração: velas de EURUSD (5 min) com um guião que bate
// certo com o que o copiloto diz: subida até à resistência, esticão, lateralização.

export function prng(semente = 1) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RESISTENCIA = 1.095;
export const SUPORTE = 1.0912;
const PIP = 0.0001;
const r5 = (n) => Math.round(n * 1e5) / 1e5;

/** Fases do guião: deriva por vela (em pips) e volatilidade. */
export const FASES = [
  { nome: "subida", velas: 46, deriva: 1.15, vol: 4.2 },
  { nome: "esticao", velas: 10, deriva: 2.4, vol: 5.5 },
  { nome: "lateral", velas: 40, deriva: 0, vol: 3.4, centro: 1.094 },
];

function faseDe(indice) {
  let acumulado = 0;
  for (const f of FASES) {
    acumulado += f.velas;
    if (indice < acumulado) return f;
  }
  return FASES[FASES.length - 1];
}

/** Próximo fecho a partir do anterior, respeitando a resistência (o preço "bate e recua"). */
export function proximoFecho(anterior, indice, aleatorio) {
  const f = faseDe(indice);
  const ruido = (aleatorio() + aleatorio() + aleatorio() - 1.5) * f.vol * PIP;
  let alvo = anterior + f.deriva * PIP + ruido;
  if (f.centro != null) alvo += (f.centro - anterior) * 0.18; // volta ao centro na lateral
  if (alvo > RESISTENCIA) alvo = RESISTENCIA - (alvo - RESISTENCIA) * 0.6 - aleatorio() * 2 * PIP;
  return r5(alvo);
}

export function construirVela(time, abre, fecha, aleatorio, vol = 3) {
  const corpoTopo = Math.max(abre, fecha);
  const corpoBase = Math.min(abre, fecha);
  let alto = corpoTopo + aleatorio() * vol * 0.6 * PIP;
  if (alto > RESISTENCIA + 1.5 * PIP) alto = RESISTENCIA + aleatorio() * 1.5 * PIP; // pavios a furar ligeiramente
  return { time, open: r5(abre), high: r5(Math.max(alto, corpoTopo)), low: r5(corpoBase - aleatorio() * vol * 0.6 * PIP), close: r5(fecha) };
}

/**
 * Gera o histórico inicial.
 * @returns {{velas: {time:number, open:number, high:number, low:number, close:number}[], estado: {indice:number, ultimo:number, time:number, aleatorio:Function}}}
 */
export function gerarHistorico({ semente = 42, n = 60, inicio = 1.0868, time0 = Math.floor(Date.UTC(2026, 10, 9, 8, 0) / 1000), passo = 300 } = {}) {
  const aleatorio = prng(semente);
  const velas = [];
  let preco = inicio;
  for (let i = 0; i < n; i++) {
    const fecha = proximoFecho(preco, i, aleatorio);
    velas.push(construirVela(time0 + i * passo, preco, fecha, aleatorio, faseDe(i).vol));
    preco = fecha;
  }
  return { velas, estado: { indice: n, ultimo: preco, time: time0 + (n - 1) * passo, passo, aleatorio } };
}

/** Avança uma vela (a demo chama isto a cada poucos segundos). */
export function avancar(estado) {
  const fecha = proximoFecho(estado.ultimo, estado.indice, estado.aleatorio);
  const time = estado.time + estado.passo;
  const vela = construirVela(time, estado.ultimo, fecha, estado.aleatorio, faseDe(estado.indice).vol);
  return { vela, estado: { ...estado, indice: estado.indice + 1, ultimo: fecha, time } };
}

/** RSI(14) simples para mostrar na demo. */
export function rsi(fechos, periodo = 14) {
  if (fechos.length <= periodo) return null;
  let ganhos = 0;
  let perdas = 0;
  for (let i = fechos.length - periodo; i < fechos.length; i++) {
    const d = fechos[i] - fechos[i - 1];
    if (d > 0) ganhos += d;
    else perdas -= d;
  }
  if (perdas === 0) return 100;
  return Math.round(100 - 100 / (1 + ganhos / perdas));
}
