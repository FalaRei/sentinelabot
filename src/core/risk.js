// Calculadora de risco: quanto comprar/vender para arriscar só o que a regra permite.

const arredondar = (n, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
const fmt = (n) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

/**
 * @param {{saldo:number, riscoPct:number, entrada:number, stop:number, alvo?:number|null}} p
 */
export function calcularPosicao({ saldo, riscoPct, entrada, stop, alvo = null }) {
  const erros = [];
  if (!(saldo > 0)) erros.push("Indica um saldo de conta maior que zero.");
  if (!(riscoPct > 0)) erros.push("Indica o risco por trade (%) maior que zero.");
  if (!(entrada > 0)) erros.push("Indica o preço de entrada.");
  if (!(stop > 0)) erros.push("Indica o preço do stop loss.");
  if (entrada > 0 && stop > 0 && entrada === stop) erros.push("O stop não pode ser igual à entrada.");
  if (erros.length) return { ok: false, erros };

  const direcao = stop < entrada ? "compra" : "venda";
  const distanciaStop = Math.abs(entrada - stop);
  const riscoEuros = saldo * (riscoPct / 100);
  const quantidade = riscoEuros / distanciaStop;
  const valorPosicao = quantidade * entrada;

  let rr = null;
  let lucroPotencial = null;
  if (alvo != null && alvo > 0) {
    const alvoNoLadoCerto = direcao === "compra" ? alvo > entrada : alvo < entrada;
    if (!alvoNoLadoCerto) {
      erros.push(
        direcao === "compra"
          ? "Numa compra o alvo tem de estar acima da entrada."
          : "Numa venda o alvo tem de estar abaixo da entrada."
      );
    } else {
      const distanciaAlvo = Math.abs(alvo - entrada);
      rr = arredondar(distanciaAlvo / distanciaStop);
      lucroPotencial = arredondar(quantidade * distanciaAlvo);
    }
  }

  const avisos = [];
  if (rr != null && rr < 1) avisos.push(`Relação risco/retorno de 1:${fmt(rr)}. Arriscas mais do que podes ganhar.`);
  if (valorPosicao > saldo) {
    avisos.push(
      `A posição (${fmt(arredondar(valorPosicao))} €) é maior que a conta: precisas de alavancagem ${fmt(arredondar(valorPosicao / saldo, 1))}x.`
    );
  }

  return {
    ok: erros.length === 0,
    erros,
    avisos,
    direcao,
    riscoEuros: arredondar(riscoEuros),
    distanciaStop: arredondar(distanciaStop, 6),
    quantidade: arredondar(quantidade, 4),
    valorPosicao: arredondar(valorPosicao),
    rr,
    lucroPotencial,
  };
}

/** Risco real (em % da conta) de um trade já definido. */
export function riscoDoTrade({ saldo, entrada, stop, quantidade }) {
  if (!(saldo > 0) || !(quantidade > 0) || !(stop > 0)) return null;
  return arredondar(((Math.abs(entrada - stop) * quantidade) / saldo) * 100);
}

/** Probabilidade mínima de acerto para não perder dinheiro com um dado R:R. */
export function taxaAcertoMinima(rr) {
  if (!(rr > 0)) return null;
  return arredondar((1 / (1 + rr)) * 100, 1);
}
