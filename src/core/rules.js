// Motor de disciplina: aplica as regras do trader ao seu diário e devolve alertas.
// É aqui que o produto "aumenta as chances": trava os erros que fazem perder dinheiro.

import { riscoDoTrade } from "./risk.js";

export const CONFIG_PADRAO = {
  saldo: 1000,
  riscoMaxPct: 1, // risco máximo por trade (% da conta)
  perdaDiariaMaxPct: 3, // parar o dia quando a perda chega a isto
  maxTradesDia: 5,
  pausaAposPerdas: 2, // perdas seguidas que obrigam a uma pausa
  minutosPausa: 15,
  minutosAntiVinganca: 5, // entrar logo a seguir a uma perda = trade de vingança
  regrasPessoais: "",
  // --- day trade ---
  horaInicio: "09:00", // janela de operação (hora local); fora dela não se abrem trades
  horaFim: "17:30",
  minutosFimSessao: 15, // aviso para gerir posições abertas antes do fim da sessão
  metaDiariaPct: 2, // lucro do dia a partir do qual o Sentinela sugere proteger o dia (0 = desligado)
  avisoAposGanhos: 3, // ganhos seguidos que disparam o aviso de euforia
  noticias: "", // uma por linha: "14:30 NFP"
  minutosNoticia: 15, // janela sem trades antes e depois de cada notícia
  // --- desafio de prop firm ---
  modoConta: "propria", // "propria" | "desafio"
  perdaTotalMaxPct: 0, // perda máxima total da conta/desafio (0 = sem limite total)
  metaDesafioPct: 0, // lucro que faz passar o desafio (0 = sem meta)
  inicioDesafio: 0, // trades antes desta data não contam para o limite total
  // --- copiloto ---
  timeframeMin: 5, // a IA lê o gráfico no fecho de cada vela deste timeframe
};

const somaResultados = (lista) => lista.reduce((s, t) => s + t.resultado, 0);
const riscoEurosDe = (t) => (t.stop > 0 && t.quantidade > 0 && t.entrada > 0 ? Math.abs(t.entrada - t.stop) * t.quantidade : 0);
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Quanto ainda podes perder hoje e no total antes de quebrares os limites (o "espaço" do desafio).
 * Nas prop firms o limite diário conta a partir do saldo do início do dia: o lucro de hoje dá mais margem.
 */
export function folgas(config, trades, agora = Date.now()) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const pnlHoje = somaResultados(fechados(tradesDoDia(trades, agora)));
  const abertos = tradesDoDia(trades, agora).filter((t) => typeof t.resultado !== "number");
  const riscoAberto = r2(abertos.reduce((s, t) => s + riscoEurosDe(t), 0));
  const limiteDia = (cfg.saldo * cfg.perdaDiariaMaxPct) / 100;
  const dia = { limite: r2(limiteDia), usado: r2(Math.max(0, -pnlHoje)), resta: r2(Math.max(0, limiteDia + pnlHoje)) };
  let total = null;
  let meta = null;
  const doDesafio = trades.filter((t) => t.abertoEm >= (cfg.inicioDesafio || 0));
  const pnlTotal = somaResultados(fechados(doDesafio));
  if (cfg.perdaTotalMaxPct > 0) {
    const limite = (cfg.saldo * cfg.perdaTotalMaxPct) / 100;
    total = { limite: r2(limite), usado: r2(Math.max(0, -pnlTotal)), resta: r2(Math.max(0, limite + pnlTotal)) };
  }
  if (cfg.metaDesafioPct > 0) {
    const alvo = (cfg.saldo * cfg.metaDesafioPct) / 100;
    meta = { alvo: r2(alvo), feito: r2(pnlTotal), progresso: Math.max(0, Math.min(1, pnlTotal / alvo)) };
  }
  return { dia, total, meta, riscoAberto, pnlHoje: r2(pnlHoje), pnlTotal: r2(pnlTotal) };
}

/** "09:30" -> 570 minutos; inválido -> null */
export function lerHora(txt) {
  const m = String(txt ?? "").trim().match(/^(\d{1,2})[:h.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export const minutosDoDia = (ms) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

const formatarHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Lista de notícias do dia a partir do texto "14:30 NFP" (uma por linha). */
export function lerNoticias(texto) {
  return String(texto ?? "")
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [hora, ...resto] = l.split(/\s+/);
      const min = lerHora(hora);
      return min == null ? null : { min, hora: formatarHora(min), nome: resto.join(" ") || "notícia" };
    })
    .filter(Boolean)
    .sort((a, b) => a.min - b.min);
}

/** Estado da sessão de day trade no momento: dentro do horário? notícia perto? fim da sessão perto? */
export function estadoSessao(config, agora = Date.now()) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const m = minutosDoDia(agora);
  const ini = lerHora(cfg.horaInicio);
  const fim = lerHora(cfg.horaFim);
  const temJanela = ini != null && fim != null && ini !== fim;
  const dentro = !temJanela || (ini < fim ? m >= ini && m < fim : m >= ini || m < fim);
  const noticia = lerNoticias(cfg.noticias).find((n) => Math.abs(n.min - m) <= cfg.minutosNoticia) ?? null;
  const minutosParaFim = temJanela && dentro ? (fim - m + 1440) % 1440 : null;
  return { dentro, inicio: cfg.horaInicio, fim: cfg.horaFim, noticia, minutosParaFim, perto: minutosParaFim != null && minutosParaFim <= cfg.minutosFimSessao };
}

export function ganhosSeguidos(trades) {
  const lista = trades.filter((t) => typeof t.resultado === "number").sort((a, b) => (a.fechadoEm ?? a.abertoEm) - (b.fechadoEm ?? b.abertoEm));
  let n = 0;
  for (let i = lista.length - 1; i >= 0 && lista[i].resultado > 0; i--) n++;
  return n;
}

const MIN = 60 * 1000;

export function mesmoDia(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function tradesDoDia(trades, agora) {
  return trades.filter((t) => mesmoDia(t.abertoEm, agora));
}

function fechados(trades) {
  return trades.filter((t) => typeof t.resultado === "number").sort((a, b) => (a.fechadoEm ?? a.abertoEm) - (b.fechadoEm ?? b.abertoEm));
}

export function perdasSeguidas(trades) {
  const lista = fechados(trades);
  let n = 0;
  for (let i = lista.length - 1; i >= 0 && lista[i].resultado < 0; i--) n++;
  return n;
}

function fimDoDia(agora) {
  const d = new Date(agora);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Estado atual da disciplina.
 * @returns {{alertas: {gravidade:"info"|"aviso"|"critico", codigo:string, mensagem:string}[], bloqueio: null | {ate:number, motivo:string}}}
 */
export function avaliar(config, trades, agora = Date.now()) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const hoje = tradesDoDia(trades, agora);
  const fechadosHoje = fechados(hoje);
  const alertas = [];
  let bloqueio = null;

  const pnlHoje = fechadosHoje.reduce((s, t) => s + t.resultado, 0);
  const limitePerda = (cfg.saldo * cfg.perdaDiariaMaxPct) / 100;
  if (pnlHoje <= -limitePerda) {
    bloqueio = { ate: fimDoDia(agora), motivo: `Atingiste a perda máxima do dia (${cfg.perdaDiariaMaxPct}% = ${limitePerda.toFixed(2)} €).` };
    alertas.push({ gravidade: "critico", codigo: "perda_diaria", mensagem: `${bloqueio.motivo} Para por hoje. Amanhã há mercado.` });
  } else if (pnlHoje <= -limitePerda * 0.7) {
    alertas.push({
      gravidade: "aviso",
      codigo: "perda_diaria_perto",
      mensagem: `Já perdeste ${Math.abs(pnlHoje).toFixed(2)} € hoje, perto do limite de ${limitePerda.toFixed(2)} €. Reduz o tamanho ou para.`,
    });
  }

  const desafio = cfg.modoConta === "desafio";
  if (cfg.perdaTotalMaxPct > 0) {
    const f = folgas(cfg, trades, agora);
    if (f.total.resta <= 0) {
      bloqueio = { ate: fimDoDia(agora), motivo: `Atingiste a perda máxima total (${cfg.perdaTotalMaxPct}% = ${f.total.limite.toFixed(2)} €).` };
      alertas.push({ gravidade: "critico", codigo: "perda_total", mensagem: `${bloqueio.motivo} ${desafio ? "Segundo as regras do desafio, a conta está perdida." : "Para e revê o teu plano antes de voltar."}` });
    } else if (f.total.usado >= f.total.limite * 0.7) {
      alertas.push({ gravidade: "aviso", codigo: "perda_total_perto", mensagem: `Restam só ${f.total.resta.toFixed(2)} € até à perda máxima total${desafio ? " do desafio" : ""}. Cada trade conta: reduz o tamanho.` });
    }
    if (f.meta && f.meta.progresso >= 1) {
      alertas.push({ gravidade: "info", codigo: "meta_desafio", mensagem: `Chegaste à meta${desafio ? " do desafio" : ""} (+${f.pnlTotal.toFixed(2)} €). Confirma as condições da tua prop firm antes de arriscar mais.` });
    }
  }

  const seguidas = perdasSeguidas(hoje);
  if (seguidas >= cfg.pausaAposPerdas && fechadosHoje.length) {
    const ultima = fechadosHoje[fechadosHoje.length - 1];
    const ate = (ultima.fechadoEm ?? ultima.abertoEm) + cfg.minutosPausa * MIN;
    if (ate > agora) {
      const motivo = `${seguidas} perdas seguidas. Pausa obrigatória de ${cfg.minutosPausa} minutos.`;
      // O bloqueio da perda diária (até ao fim do dia) prevalece sobre a pausa.
      if (!bloqueio) bloqueio = { ate, motivo };
      alertas.push({ gravidade: "critico", codigo: "pausa_perdas", mensagem: `${motivo} Levanta-te, bebe água, volta com a cabeça fria.` });
    }
  }

  if (hoje.length >= cfg.maxTradesDia) {
    alertas.push({
      gravidade: "aviso",
      codigo: "overtrading",
      mensagem: `Já fizeste ${hoje.length} trades hoje (limite: ${cfg.maxTradesDia}). Mais trades raramente significa mais lucro.`,
    });
  }

  for (const t of hoje.filter((t) => typeof t.resultado !== "number")) {
    if (!(t.stop > 0)) {
      alertas.push({ gravidade: "critico", codigo: "sem_stop", mensagem: `O trade em ${t.ativo || "aberto"} não tem stop loss. Define-o já.` });
    } else {
      const risco = riscoDoTrade({ saldo: cfg.saldo, entrada: t.entrada, stop: t.stop, quantidade: t.quantidade });
      if (risco != null && risco > cfg.riscoMaxPct) {
        alertas.push({
          gravidade: "aviso",
          codigo: "risco_alto",
          mensagem: `O trade em ${t.ativo || "aberto"} arrisca ${risco}% da conta (o teu limite é ${cfg.riscoMaxPct}%).`,
        });
      }
    }
  }

  // --- day trade ---
  const sessao = estadoSessao(cfg, agora);
  if (!sessao.dentro) {
    alertas.push({ gravidade: "aviso", codigo: "fora_horario", mensagem: `Estás fora do teu horário de operação (${cfg.horaInicio}–${cfg.horaFim}). Fora do horário, o plano diz para não abrir trades.` });
  }
  if (sessao.noticia) {
    alertas.push({ gravidade: "aviso", codigo: "noticia", mensagem: `Notícia às ${sessao.noticia.hora} (${sessao.noticia.nome}). A tua regra: nada de trades ${cfg.minutosNoticia} minutos antes e depois.` });
  }
  const abertosHoje = hoje.filter((t) => typeof t.resultado !== "number");
  if (sessao.perto && abertosHoje.length) {
    alertas.push({ gravidade: "aviso", codigo: "fim_sessao", mensagem: `Faltam ${sessao.minutosParaFim} minutos para o fim da tua sessão e tens ${abertosHoje.length} trade(s) aberto(s). Decide agora como os vais gerir.` });
  }
  const meta = (cfg.saldo * cfg.metaDiariaPct) / 100;
  if (cfg.metaDiariaPct > 0 && pnlHoje >= meta) {
    alertas.push({ gravidade: "info", codigo: "meta_diaria", mensagem: `Atingiste a tua meta do dia (+${pnlHoje.toFixed(2)} €). Os profissionais protegem dias bons: considera parar ou reduzir o tamanho.` });
  }
  const ganhos = ganhosSeguidos(hoje);
  if (cfg.avisoAposGanhos > 0 && ganhos >= cfg.avisoAposGanhos) {
    alertas.push({ gravidade: "aviso", codigo: "euforia", mensagem: `${ganhos} ganhos seguidos. É aqui que muitos traders aumentam o tamanho e devolvem tudo. Mantém o mesmo risco.` });
  }

  return { alertas, bloqueio, sessao };
}

/**
 * Verificação ANTES de entrar num trade novo.
 * @returns {{podeEntrar:boolean, alertas:{gravidade:string, codigo:string, mensagem:string}[]}}
 */
export function verificarNovoTrade(config, trades, novo, agora = Date.now()) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const { alertas: estado, bloqueio } = avaliar(cfg, trades, agora);
  const alertas = estado.filter((a) => a.codigo !== "sem_stop" && a.codigo !== "risco_alto");

  if (!(novo.stop > 0)) {
    alertas.push({ gravidade: "critico", codigo: "sem_stop", mensagem: "Não entres sem stop loss. Define onde estás errado antes de entrar." });
  } else {
    const risco = riscoDoTrade({ saldo: cfg.saldo, entrada: novo.entrada, stop: novo.stop, quantidade: novo.quantidade });
    if (risco != null && risco > cfg.riscoMaxPct) {
      alertas.push({
        gravidade: "critico",
        codigo: "risco_alto",
        mensagem: `Este trade arrisca ${risco}% da conta. O teu limite é ${cfg.riscoMaxPct}%. Reduz a quantidade.`,
      });
    }
  }

  // O que acontece se o stop deste trade (e dos abertos) for atingido: ainda cabe nos limites?
  const riscoNovo = riscoEurosDe(novo);
  if (riscoNovo > 0) {
    const f = folgas(cfg, trades, agora);
    const desafio = cfg.modoConta === "desafio";
    const pior = riscoNovo + f.riscoAberto;
    if (pior > f.dia.resta) {
      alertas.push({
        gravidade: "critico",
        codigo: "passa_limite_dia",
        mensagem: `Se o stop for atingido perdes ${r2(riscoNovo).toFixed(2)} € e passas o limite diário (restam ${f.dia.resta.toFixed(2)} €${f.riscoAberto ? `, com ${f.riscoAberto.toFixed(2)} € já em risco nos trades abertos` : ""}).${desafio ? " No desafio, isso é perder a conta." : ""} Reduz a quantidade.`,
      });
    } else if (f.total && pior > f.total.resta) {
      alertas.push({
        gravidade: "critico",
        codigo: "passa_limite_total",
        mensagem: `Se o stop for atingido passas a perda máxima total (restam ${f.total.resta.toFixed(2)} €).${desafio ? " No desafio, isso é perder a conta." : ""} Reduz a quantidade.`,
      });
    }
  }

  const ultimaPerda = fechados(tradesDoDia(trades, agora)).filter((t) => t.resultado < 0).pop();
  if (ultimaPerda && agora - (ultimaPerda.fechadoEm ?? ultimaPerda.abertoEm) < cfg.minutosAntiVinganca * MIN) {
    alertas.push({
      gravidade: "aviso",
      codigo: "vinganca",
      mensagem: "Acabaste de perder há poucos minutos. Este trade está no teu plano ou é para recuperar?",
    });
  }

  // No pré-trade, horário e notícias são regras do trader: passam a bloqueantes.
  for (const a of alertas) if (a.codigo === "fora_horario" || a.codigo === "noticia") a.gravidade = "critico";

  const podeEntrar = !bloqueio && !alertas.some((a) => a.gravidade === "critico");
  return { podeEntrar, alertas, bloqueio };
}
