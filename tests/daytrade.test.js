import { test } from "node:test";
import assert from "node:assert/strict";
import { lerHora, lerNoticias, estadoSessao, ganhosSeguidos, avaliar, verificarNovoTrade, CONFIG_PADRAO } from "../src/core/rules.js";
import { novoTrade } from "../src/core/journal.js";

const MIN = 60_000;
const as = (hhmm) => new Date(`2026-11-09T${hhmm}:00`).getTime();
const cfg = { ...CONFIG_PADRAO, saldo: 1000, horaInicio: "09:00", horaFim: "17:30", noticias: "14:30 NFP\n10:00 BCE", minutosNoticia: 15, metaDiariaPct: 2, avisoAposGanhos: 3 };
const T = (aberto, resultado, extra = {}) =>
  novoTrade({ ativo: "EURUSD", entrada: 1.1, stop: 1.099, quantidade: 1000, resultado, abertoEm: aberto, fechadoEm: resultado == null ? null : aberto + 5 * MIN, ...extra });
const codigos = (r) => r.alertas.map((a) => a.codigo);

test("lerHora aceita vários formatos e rejeita lixo", () => {
  assert.equal(lerHora("09:30"), 570);
  assert.equal(lerHora("9h05"), 545);
  assert.equal(lerHora("14.30"), 870);
  assert.equal(lerHora("25:00"), null);
  assert.equal(lerHora("abc"), null);
});

test("lerNoticias ordena e ignora linhas inválidas", () => {
  const n = lerNoticias("14:30 NFP\nlixo\n10:00 BCE taxa de juro");
  assert.deepEqual(n.map((x) => x.hora), ["10:00", "14:30"]);
  assert.equal(n[0].nome, "BCE taxa de juro");
});

test("estado da sessão: dentro, fora, notícia e fim", () => {
  assert.equal(estadoSessao(cfg, as("08:30")).dentro, false);
  assert.equal(estadoSessao(cfg, as("11:00")).dentro, true);
  assert.equal(estadoSessao(cfg, as("14:20")).noticia.nome, "NFP");
  assert.equal(estadoSessao(cfg, as("15:00")).noticia, null);
  const fim = estadoSessao(cfg, as("17:20"));
  assert.equal(fim.minutosParaFim, 10);
  assert.equal(fim.perto, true);
  // janela que passa a meia-noite (cripto à noite)
  assert.equal(estadoSessao({ ...cfg, horaInicio: "22:00", horaFim: "02:00" }, as("23:30")).dentro, true);
});

test("fora do horário e perto de notícias: aviso no estado, bloqueio no pré-trade", () => {
  assert.ok(codigos(avaliar(cfg, [], as("08:30"))).includes("fora_horario"));
  const v = verificarNovoTrade(cfg, [], { entrada: 1.1, stop: 1.099, quantidade: 1000 }, as("14:25"));
  assert.equal(v.podeEntrar, false);
  assert.equal(v.alertas.find((a) => a.codigo === "noticia").gravidade, "critico");
  assert.equal(verificarNovoTrade(cfg, [], { entrada: 1.1, stop: 1.099, quantidade: 1000 }, as("11:00")).podeEntrar, true);
});

test("meta diária, euforia e fim de sessão com trades abertos", () => {
  const ganhos = [T(as("09:30"), 8), T(as("10:30"), 7), T(as("11:30"), 6)];
  const c = codigos(avaliar(cfg, ganhos, as("12:00")));
  assert.ok(c.includes("meta_diaria"));
  assert.ok(c.includes("euforia"));
  assert.equal(ganhosSeguidos([...ganhos, T(as("12:30"), -2)]), 0);
  assert.ok(codigos(avaliar(cfg, [T(as("17:00"), null)], as("17:20"))).includes("fim_sessao"));
  assert.ok(!codigos(avaliar(cfg, [], as("17:20"))).includes("fim_sessao"));
  assert.ok(!codigos(avaliar({ ...cfg, metaDiariaPct: 0 }, ganhos, as("12:00"))).includes("meta_diaria"));
});
