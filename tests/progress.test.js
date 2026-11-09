import { test } from "node:test";
import assert from "node:assert/strict";

import { calcularProgresso, nivelDe, novidades, pontuacaoDia, XP, NIVEIS } from "../src/core/gamification.js";
import { simularTraders, expectativaR, perdasSeguidas } from "../src/core/montecarlo.js";
import { gerarHistorico, avancar, rsi, prng, RESISTENCIA } from "../src/core/market-sim.js";
import { novoTrade } from "../src/core/journal.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
const AGORA = new Date("2026-11-08T18:00:00").getTime();
const cfg = { ...CONFIG_PADRAO, saldo: 1000, perdaDiariaMaxPct: 3, pausaAposPerdas: 2, minutosPausa: 15, maxTradesDia: 5 };

// trade aberto em `aberto` (ms) e fechado 5 min depois
const T = (aberto, resultado, extra = {}) =>
  novoTrade({ ativo: "EURUSD", entrada: 1.1, stop: 1.099, quantidade: 1000, resultado, abertoEm: aberto, fechadoEm: aberto + 5 * MIN, ...extra });

// ---------- níveis ----------
test("níveis e progresso", () => {
  assert.equal(nivelDe(0).nome, "Recruta");
  assert.equal(nivelDe(99).nome, "Recruta");
  const n = nivelDe(200);
  assert.equal(n.nome, "Cadete");
  assert.equal(n.progresso, 0.5);
  assert.equal(n.faltam, 100);
  const max = nivelDe(99999);
  assert.equal(max.nome, NIVEIS[NIVEIS.length - 1].nome);
  assert.equal(max.proximo, null);
  assert.equal(max.progresso, 1);
});

// ---------- XP ----------
test("XP vem da disciplina, não do lucro", () => {
  const base = AGORA - 3 * 60 * MIN;
  const ganhou = calcularProgresso([T(base, 500)], cfg, AGORA);
  const perdeu = calcularProgresso([T(base, -5)], cfg, AGORA);
  assert.equal(ganhou.xp, perdeu.xp); // lucro não dá XP
  assert.equal(ganhou.xp, XP.comStop + XP.noPlano);
  const semStop = calcularProgresso([T(base, 500, { stop: null, seguiuPlano: false })], cfg, AGORA);
  assert.equal(semStop.xp, 0);
  const comNota = calcularProgresso([T(base, 5, { nota: "setup A" })], cfg, AGORA);
  assert.equal(comNota.xp, XP.comStop + XP.noPlano + XP.comNota);
});

test("entrar durante a pausa: zero XP e pontuação cai", () => {
  const b = AGORA - 3 * 60 * MIN;
  const trades = [T(b, -5), T(b + 10 * MIN, -5), T(b + 20 * MIN, 5)]; // 3.º entra 5 min após a 2.ª perda (pausa de 15)
  const p = calcularProgresso(trades, cfg, AGORA);
  assert.equal(p.xp, 2 * (XP.comStop + XP.noPlano));
  assert.equal(p.hoje, 70);
  assert.equal(p.conquistas.find((c) => c.id === "pausa").desbloqueada, false);
});

test("cumprir a pausa dá bónus e conquista", () => {
  const b = AGORA - 3 * 60 * MIN;
  const trades = [T(b, -5), T(b + 10 * MIN, -5), T(b + 40 * MIN, 5)]; // entra 25 min depois
  const p = calcularProgresso(trades, cfg, AGORA);
  assert.equal(p.xp, 3 * (XP.comStop + XP.noPlano) + XP.pausaRespeitada);
  assert.equal(p.hoje, 100);
  assert.equal(p.conquistas.find((c) => c.id === "pausa").desbloqueada, true);
});

test("dia limpo dá bónus só depois de o dia acabar; sequência de dias", () => {
  const trades = [];
  for (let d = 5; d >= 1; d--) trades.push(T(AGORA - d * DIA, 3));
  const p = calcularProgresso(trades, cfg, AGORA);
  assert.equal(p.sequencia, 5);
  assert.equal(p.porDia.length, 5);
  assert.equal(p.xp, 5 * (XP.comStop + XP.noPlano + XP.diaLimpo));
  assert.equal(p.conquistas.find((c) => c.id === "sequencia_5").desbloqueada, true);
  assert.equal(p.conquistas.find((c) => c.id === "dia_limpo").desbloqueada, true);
  // hoje com trade sem stop quebra a sequência
  const p2 = calcularProgresso([...trades, T(AGORA - 60 * MIN, 3, { stop: null, seguiuPlano: false })], cfg, AGORA);
  assert.equal(p2.sequencia, 0);
  assert.equal(p2.hoje, 60);
});

test("saber parar: bateu no limite e não voltou a entrar", () => {
  const b = AGORA - 5 * 60 * MIN;
  const parou = calcularProgresso([T(b, -20), T(b + 60 * MIN, 5), T(b + 120 * MIN, -16)], cfg, AGORA);
  assert.equal(parou.conquistas.find((c) => c.id === "sobrevivente").desbloqueada, true);
  const naoParou = calcularProgresso([T(b, -20), T(b + 60 * MIN, 5), T(b + 120 * MIN, -16), T(b + 180 * MIN, 2)], cfg, AGORA);
  assert.equal(naoParou.conquistas.find((c) => c.id === "sobrevivente").desbloqueada, false);
});

test("overtrading penaliza a pontuação", () => {
  const b = AGORA - 8 * 60 * MIN;
  const trades = Array.from({ length: 6 }, (_, i) => T(b + i * 60 * MIN, 1));
  assert.equal(calcularProgresso(trades, cfg, AGORA).hoje, 80);
});

test("pontuacaoDia sem trades e mínimo zero", () => {
  assert.equal(pontuacaoDia([]), null);
  const mau = { trade: { stop: null, seguiuPlano: false }, duranteBloqueio: true, excedeuMaxTrades: true };
  assert.equal(pontuacaoDia([mau, mau]), 0);
});

test("novidades deteta XP, nível e conquistas novas", () => {
  const b = AGORA - 60 * MIN;
  const antes = calcularProgresso([], cfg, AGORA);
  const depois = calcularProgresso([T(b, 3)], cfg, AGORA);
  const n = novidades(antes, depois);
  assert.equal(n.xpGanho, 30);
  assert.deepEqual(n.novasConquistas.map((c) => c.id), ["primeiro_stop"]);
  assert.equal(novidades(null, depois).xpGanho, 0);
  const muito = calcularProgresso(Array.from({ length: 4 }, (_, i) => T(b - i * DIA, 3, { nota: "x" })), cfg, AGORA);
  assert.equal(novidades(depois, muito).subiuNivel, true);
});

// ---------- Monte Carlo ----------
test("simulação determinística e risco alto rebenta mais contas", () => {
  const a = simularTraders({ riscoPct: 1, semente: 3 });
  const b = simularTraders({ riscoPct: 1, semente: 3 });
  assert.deepEqual(a.mediana, b.mediana);
  assert.equal(a.caminhos.length, 50);
  assert.equal(a.caminhos[0].length, 101);
  const alto = simularTraders({ riscoPct: 15, semente: 3 });
  assert.ok(alto.percentRebentaram > a.percentRebentaram, `${alto.percentRebentaram} vs ${a.percentRebentaram}`);
  assert.ok(a.percentRebentaram <= 5);
});

test("expectativa e perdas seguidas", () => {
  assert.equal(expectativaR(0.45, 2), 0.35);
  assert.equal(expectativaR(0.3, 2), -0.1);
  const p = perdasSeguidas(10, 10);
  assert.equal(Math.round(p.restante * 1000), 349);
  assert.equal(Math.round(p.recuperar * 100), 187);
});

// ---------- mercado simulado ----------
test("histórico: velas válidas, contínuas e nunca muito acima da resistência", () => {
  const { velas, estado } = gerarHistorico({ n: 96 });
  assert.equal(velas.length, 96);
  for (let i = 0; i < velas.length; i++) {
    const v = velas[i];
    assert.ok(v.high >= Math.max(v.open, v.close) && v.low <= Math.min(v.open, v.close), `vela ${i}`);
    assert.ok(v.high <= RESISTENCIA + 0.0002, `vela ${i} fura demais: ${v.high}`);
    if (i) {
      assert.equal(v.open, velas[i - 1].close);
      assert.equal(v.time - velas[i - 1].time, 300);
    }
  }
  assert.ok(velas[40].close > velas[0].close, "fase de subida sobe");
  const { vela } = avancar(estado);
  assert.equal(vela.open, velas[95].close);
});

test("rsi e prng", () => {
  assert.equal(rsi([1, 2, 3]), null);
  assert.equal(rsi(Array.from({ length: 20 }, (_, i) => i)), 100);
  const r = prng(1);
  const x = r();
  assert.ok(x >= 0 && x < 1);
  assert.equal(prng(1)(), x);
});
