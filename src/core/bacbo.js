// Bac Bo honesto: regista resultados e mostra a matemática real. Não dá sinais de aposta porque não
// existem: cada ronda são dados novos, independentes das anteriores.
//
// Cada lado (Jogador/azul, Banca/vermelho) lança 2 dados e ganha a soma mais alta.

export const CORES = ["azul", "vermelho", "empate"];

/** Distribuição da soma de 2 dados: 2..12 com 1,2,3,4,5,6,5,4,3,2,1 hipóteses em 36. */
const FORMAS = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

/** Probabilidades exatas de cada resultado numa ronda. */
export function probabilidades() {
  const total = 36 * 36;
  const empate = FORMAS.reduce((s, f) => s + f * f, 0); // 146
  const cada = (total - empate) / 2; // 575, por simetria
  return { azul: cada / total, vermelho: cada / total, empate: empate / total, casos: { total, azul: cada, vermelho: cada, empate } };
}

export function contagens(resultados) {
  const c = { azul: 0, vermelho: 0, empate: 0 };
  for (const r of resultados) if (r in c) c[r]++;
  return { ...c, total: resultados.length };
}

/** Sequência atual (ignorando empates, como nos quadros das mesas) e a maior da sessão. */
export function sequencias(resultados) {
  const cores = resultados.filter((r) => r !== "empate");
  let atual = { cor: null, n: 0 };
  let maior = { cor: null, n: 0 };
  for (const r of cores) {
    atual = r === atual.cor ? { cor: r, n: atual.n + 1 } : { cor: r, n: 1 };
    if (atual.n > maior.n) maior = { ...atual };
  }
  return { atual, maior };
}

/**
 * Probabilidade de haver pelo menos uma sequência de k (ou mais) da mesma cor em n rondas sem empate.
 * Serve para mostrar que sequências longas são normais. Cada ronda sem empate é 50/50 entre as cores.
 */
export function probSequencia(k, n) {
  if (k <= 1) return n >= 1 ? 1 : 0;
  // dp[j] = probabilidade de estar com uma sequência atual de j sem ainda ter chegado a k
  let dp = new Array(k).fill(0);
  dp[1] = 1;
  for (let i = 2; i <= n; i++) {
    const novo = new Array(k).fill(0);
    for (let j = 1; j < k; j++) {
      novo[1] += dp[j] * 0.5; // muda de cor
      if (j + 1 < k) novo[j + 1] += dp[j] * 0.5; // repete (se chegar a k, sai da conta)
    }
    dp = novo;
  }
  return 1 - dp.reduce((s, p) => s + p, 0);
}

/** Resultado da sessão a partir dos saldos que o jogador escreve, e se o limite de perda foi atingido. */
export function sessao({ saldoInicial, saldoAgora, limitePerda }) {
  const valido = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!valido(saldoInicial) || !valido(saldoAgora)) return { resultado: null, travar: false, perto: false };
  const resultado = Math.round((saldoAgora - saldoInicial) * 100) / 100;
  return { resultado, travar: limitePerda > 0 && -resultado >= limitePerda, perto: limitePerda > 0 && -resultado >= limitePerda * 0.7 };
}

/** Frase para a voz: só quando vale a pena dizer alguma coisa, e sempre a verdade. */
export function falaBacBo(resultados) {
  const { atual } = sequencias(resultados);
  if (atual.n >= 4) {
    const nome = atual.cor === "azul" ? "azuis" : "vermelhos";
    return `${atual.n} ${nome} seguidos. Os dados não se lembram: a próxima ronda continua 44 por cento para cada cor.`;
  }
  return null;
}
