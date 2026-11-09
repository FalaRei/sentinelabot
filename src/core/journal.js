// Diário de trades: estatísticas e relatório do dia.

import { tradesDoDia } from "./rules.js";

const r2 = (n) => Math.round(n * 100) / 100;
const f = (n) => Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function novoTrade(dados, agora = Date.now()) {
  const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const resultado = num(dados.resultado);
  return {
    id: dados.id ?? `t_${agora}_${Math.random().toString(36).slice(2, 7)}`,
    abertoEm: dados.abertoEm ?? agora,
    fechadoEm: resultado != null ? (dados.fechadoEm ?? agora) : null,
    ativo: String(dados.ativo ?? "").trim().toUpperCase(),
    direcao: dados.direcao === "venda" ? "venda" : "compra",
    entrada: num(dados.entrada),
    stop: num(dados.stop),
    alvo: num(dados.alvo),
    quantidade: num(dados.quantidade),
    resultado,
    seguiuPlano: dados.seguiuPlano !== false,
    nota: String(dados.nota ?? "").trim(),
  };
}

export function fecharTrade(trade, resultado, agora = Date.now()) {
  return { ...trade, resultado: Number(resultado), fechadoEm: agora };
}

export function estatisticas(trades) {
  const fechados = trades.filter((t) => typeof t.resultado === "number");
  const ganhos = fechados.filter((t) => t.resultado > 0);
  const perdas = fechados.filter((t) => t.resultado < 0);
  const soma = (l) => l.reduce((s, t) => s + t.resultado, 0);
  const pnl = soma(fechados);
  const mediaGanho = ganhos.length ? soma(ganhos) / ganhos.length : 0;
  const mediaPerda = perdas.length ? Math.abs(soma(perdas)) / perdas.length : 0;
  const winRate = fechados.length ? ganhos.length / fechados.length : 0;

  let maiorSeqPerdas = 0;
  let seq = 0;
  for (const t of [...fechados].sort((a, b) => (a.fechadoEm ?? a.abertoEm) - (b.fechadoEm ?? b.abertoEm))) {
    seq = t.resultado < 0 ? seq + 1 : 0;
    maiorSeqPerdas = Math.max(maiorSeqPerdas, seq);
  }

  const comPlano = fechados.filter((t) => t.seguiuPlano);
  const semPlano = fechados.filter((t) => !t.seguiuPlano);

  return {
    total: fechados.length,
    abertos: trades.length - fechados.length,
    ganhos: ganhos.length,
    perdas: perdas.length,
    winRate: r2(winRate * 100),
    pnl: r2(pnl),
    mediaGanho: r2(mediaGanho),
    mediaPerda: r2(mediaPerda),
    payoff: mediaPerda ? r2(mediaGanho / mediaPerda) : null,
    // Valor esperado por trade: o número que diz se a estratégia ganha a longo prazo.
    expectativa: fechados.length ? r2(pnl / fechados.length) : 0,
    maiorSeqPerdas,
    disciplina: fechados.length ? r2((comPlano.length / fechados.length) * 100) : 100,
    pnlComPlano: r2(soma(comPlano)),
    pnlSemPlano: r2(soma(semPlano)),
  };
}

export function relatorioDiario(trades, config, agora = Date.now()) {
  const hoje = tradesDoDia(trades, agora);
  const e = estatisticas(hoje);
  const linhas = [];
  const data = new Date(agora).toLocaleDateString("pt-PT");
  linhas.push(`Relatório de ${data}`);

  if (!e.total && !e.abertos) {
    linhas.push("Sem trades hoje. Não operar também é uma decisão, e muitas vezes a melhor.");
    return { estatisticas: e, linhas };
  }

  linhas.push(`${plural(e.total, "trade fechado", "trades fechados")} (${plural(e.ganhos, "ganho", "ganhos")}, ${plural(e.perdas, "perda", "perdas")}). Taxa de acerto: ${f(e.winRate)}%.`);
  linhas.push(`Resultado: ${e.pnl >= 0 ? "+" : ""}${f(e.pnl)} € (${f((e.pnl / config.saldo) * 100)}% da conta).`);
  if (e.payoff != null) linhas.push(`Ganho médio ${f(e.mediaGanho)} € vs perda média ${f(e.mediaPerda)} € (payoff ${f(e.payoff)}).`);
  linhas.push(`Disciplina: seguiste o plano em ${f(e.disciplina)}% dos trades.`);

  if (e.pnlSemPlano < 0 && e.pnlComPlano > e.pnlSemPlano) {
    linhas.push(
      `💡 Os trades fora do plano custaram-te ${f(Math.abs(e.pnlSemPlano))} €. Com plano: ${e.pnlComPlano >= 0 ? "+" : ""}${f(e.pnlComPlano)} €. O plano funciona, segue-o.`
    );
  }
  if (e.maiorSeqPerdas >= 3) linhas.push(`⚠️ Tiveste ${e.maiorSeqPerdas} perdas seguidas. Revê se continuaste a operar em tilt.`);
  if (e.abertos) linhas.push(`Tens ${e.abertos} trade(s) ainda aberto(s) no diário.`);
  return { estatisticas: e, linhas };
}

export function exportarCSV(trades) {
  const cab = ["data", "ativo", "direcao", "entrada", "stop", "alvo", "quantidade", "resultado", "seguiu_plano", "nota"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhas = trades.map((t) =>
    [new Date(t.abertoEm).toISOString(), t.ativo, t.direcao, t.entrada, t.stop, t.alvo, t.quantidade, t.resultado, t.seguiuPlano ? "sim" : "nao", t.nota]
      .map(esc)
      .join(";")
  );
  return [cab.join(";"), ...linhas].join("\n");
}
