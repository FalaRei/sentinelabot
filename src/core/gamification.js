// Progressão: recompensa DISCIPLINA, nunca lucro nem número de trades.
// Se recompensássemos trades, estaríamos a empurrar o cliente para o overtrading.
// Tudo é calculado a partir do diário (idempotente): apagar um trade recalcula tudo.

import { avaliar, CONFIG_PADRAO, mesmoDia } from "./rules.js";

export const NIVEIS = [
  { nome: "Recruta", xp: 0 },
  { nome: "Cadete", xp: 100 },
  { nome: "Copiloto", xp: 300 },
  { nome: "Piloto", xp: 600 },
  { nome: "Comandante", xp: 1000 },
  { nome: "Ás", xp: 1600 },
  { nome: "Sentinela", xp: 2500 },
];

export const XP = { comStop: 10, noPlano: 20, comNota: 5, diaLimpo: 30, pausaRespeitada: 15 };

export const CONQUISTAS = [
  { id: "primeiro_stop", nome: "Rede de segurança", desc: "Primeiro trade com stop loss" },
  { id: "plano_5", nome: "Piloto automático", desc: "5 trades seguidos dentro do plano" },
  { id: "pausa", nome: "Sangue frio", desc: "Cumpriste uma pausa obrigatória" },
  { id: "dia_limpo", nome: "Voo limpo", desc: "Um dia com 100 de disciplina" },
  { id: "sobrevivente", nome: "Saber parar", desc: "Bateste no limite diário e paraste" },
  { id: "notas_10", nome: "Caixa negra", desc: "10 trades registados com nota" },
  { id: "sequencia_5", nome: "Esquadrilha", desc: "5 dias de trading seguidos com disciplina ≥ 80" },
];

const fechadoAte = (t, momento) => typeof t.resultado === "number" && (t.fechadoEm ?? t.abertoEm) <= momento;

/** Como estava o diário no instante em que o trade foi aberto. */
function snapshotAntes(trades, momento) {
  return trades
    .filter((t) => t.abertoEm < momento)
    .map((t) => (fechadoAte(t, momento) ? t : { ...t, resultado: null }));
}

function chaveDia(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Analisa cada trade no momento em que foi aberto: entrou durante uma pausa/bloqueio? */
export function anotarTrades(trades, config) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const ordenados = [...trades].sort((a, b) => a.abertoEm - b.abertoEm);
  return ordenados.map((t) => {
    const antes = snapshotAntes(ordenados, t.abertoEm);
    const { bloqueio, alertas } = avaliar(cfg, antes, t.abertoEm);
    const tradesHojeAntes = antes.filter((x) => mesmoDia(x.abertoEm, t.abertoEm)).length;
    return {
      trade: t,
      duranteBloqueio: !!bloqueio,
      motivoBloqueio: bloqueio?.motivo ?? null,
      excedeuMaxTrades: tradesHojeAntes >= cfg.maxTradesDia,
      depoisDePerdaDiaria: alertas.some((a) => a.codigo === "perda_diaria"),
      houvePausaAntes: antes.length > 0 && wasPausaRecente(cfg, antes, t.abertoEm),
    };
  });
}

// Houve uma pausa obrigatória ativada hoje que já tinha expirado quando este trade abriu?
function wasPausaRecente(cfg, antes, momento) {
  const hoje = antes.filter((x) => mesmoDia(x.abertoEm, momento) && typeof x.resultado === "number");
  let seguidas = 0;
  for (const t of hoje.sort((a, b) => (a.fechadoEm ?? a.abertoEm) - (b.fechadoEm ?? b.abertoEm))) {
    seguidas = t.resultado < 0 ? seguidas + 1 : 0;
  }
  return seguidas >= cfg.pausaAposPerdas;
}

/** Pontuação de disciplina (0-100) de um conjunto de trades anotados do mesmo dia. */
export function pontuacaoDia(anotados) {
  if (!anotados.length) return null;
  let p = 100;
  for (const a of anotados) {
    if (!(a.trade.stop > 0)) p -= 25;
    if (!a.trade.seguiuPlano) p -= 15;
    if (a.duranteBloqueio) p -= 30;
    if (a.excedeuMaxTrades) p -= 20;
  }
  return Math.max(0, p);
}

export function nivelDe(xp) {
  let i = 0;
  while (i + 1 < NIVEIS.length && xp >= NIVEIS[i + 1].xp) i++;
  const atual = NIVEIS[i];
  const proximo = NIVEIS[i + 1] ?? null;
  const progresso = proximo ? (xp - atual.xp) / (proximo.xp - atual.xp) : 1;
  return { indice: i, nome: atual.nome, xp, proximo, progresso: Math.round(progresso * 1000) / 1000, faltam: proximo ? proximo.xp - xp : 0 };
}

/**
 * Estado completo da progressão.
 * @returns {{xp:number, nivel:ReturnType<typeof nivelDe>, porDia:{dia:string, pontuacao:number, trades:number}[], hoje:number|null, sequencia:number, conquistas:{id:string,nome:string,desc:string,desbloqueada:boolean}[], eventos:{tipo:string, xp:number, em:number, texto:string}[]}}
 */
export function calcularProgresso(trades, config, agora = Date.now()) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const anotados = anotarTrades(trades, cfg);
  const eventos = [];
  let xp = 0;
  const ganhar = (tipo, pontos, em, texto) => {
    xp += pontos;
    eventos.push({ tipo, xp: pontos, em, texto });
  };

  for (const a of anotados) {
    const t = a.trade;
    if (a.duranteBloqueio) continue; // entrar durante a pausa não dá nada
    if (t.stop > 0) ganhar("stop", XP.comStop, t.abertoEm, `Stop definido em ${t.ativo || "trade"}`);
    if (t.seguiuPlano) ganhar("plano", XP.noPlano, t.abertoEm, "Trade dentro do plano");
    if (t.nota) ganhar("nota", XP.comNota, t.abertoEm, "Trade registado com nota");
    if (a.houvePausaAntes) ganhar("pausa", XP.pausaRespeitada, t.abertoEm, "Cumpriste a pausa antes de voltar");
  }

  // Agrupar por dia
  const dias = new Map();
  for (const a of anotados) {
    const k = chaveDia(a.trade.abertoEm);
    if (!dias.has(k)) dias.set(k, []);
    dias.get(k).push(a);
  }
  const porDia = [...dias.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dia, lista]) => ({ dia, pontuacao: pontuacaoDia(lista), trades: lista.length, lista }));

  const hojeK = chaveDia(agora);
  for (const d of porDia) {
    if (d.dia !== hojeK && d.pontuacao === 100) ganhar("dia_limpo", XP.diaLimpo, d.lista[d.lista.length - 1].trade.abertoEm, `Dia limpo a ${new Date(d.lista[0].trade.abertoEm).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}`);
  }

  // Sequência: dias de trading consecutivos (dias sem trades não quebram) com pontuação >= 80
  let sequencia = 0;
  for (let i = porDia.length - 1; i >= 0 && porDia[i].pontuacao >= 80; i--) sequencia++;

  const fechadosOrdenados = anotados.map((a) => a.trade).filter((t) => typeof t.resultado === "number");
  let melhorSeqPlano = 0;
  let seqPlano = 0;
  for (const t of fechadosOrdenados) {
    seqPlano = t.seguiuPlano ? seqPlano + 1 : 0;
    melhorSeqPlano = Math.max(melhorSeqPlano, seqPlano);
  }

  // "Saber parar": bateu no limite diário e não abriu mais nenhum trade nesse dia.
  const sobrevivente = porDia.some((d) => {
    const fechados = d.lista.map((a) => a.trade).filter((t) => typeof t.resultado === "number");
    const pnl = fechados.reduce((s, t) => s + t.resultado, 0);
    return pnl <= -(cfg.saldo * cfg.perdaDiariaMaxPct) / 100 && !d.lista.some((a) => a.depoisDePerdaDiaria);
  });

  const desbloqueadas = new Set();
  if (anotados.some((a) => a.trade.stop > 0)) desbloqueadas.add("primeiro_stop");
  if (melhorSeqPlano >= 5) desbloqueadas.add("plano_5");
  if (anotados.some((a) => a.houvePausaAntes && !a.duranteBloqueio)) desbloqueadas.add("pausa");
  // Só conta quando o dia acabou: a meio do dia ainda pode correr mal.
  if (porDia.some((d) => d.dia !== hojeK && d.pontuacao === 100)) desbloqueadas.add("dia_limpo");
  if (sobrevivente) desbloqueadas.add("sobrevivente");
  if (anotados.filter((a) => a.trade.nota).length >= 10) desbloqueadas.add("notas_10");
  if (sequencia >= 5) desbloqueadas.add("sequencia_5");

  const hoje = porDia.find((d) => d.dia === hojeK);
  return {
    xp,
    nivel: nivelDe(xp),
    porDia: porDia.map(({ dia, pontuacao, trades }) => ({ dia, pontuacao, trades })),
    hoje: hoje ? hoje.pontuacao : null,
    sequencia,
    conquistas: CONQUISTAS.map((c) => ({ ...c, desbloqueada: desbloqueadas.has(c.id) })),
    eventos,
  };
}

/** O que mudou entre dois estados (para as animações de "ganhaste XP", "subiste de nível"). */
export function novidades(antes, depois) {
  if (!antes) return { xpGanho: 0, subiuNivel: false, novasConquistas: [] };
  const ja = new Set(antes.conquistas.filter((c) => c.desbloqueada).map((c) => c.id));
  return {
    xpGanho: depois.xp - antes.xp,
    subiuNivel: depois.nivel.indice > antes.nivel.indice,
    novasConquistas: depois.conquistas.filter((c) => c.desbloqueada && !ja.has(c.id)),
  };
}
