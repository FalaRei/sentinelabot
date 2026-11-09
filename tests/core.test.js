import { test } from "node:test";
import assert from "node:assert/strict";

import { calcularPosicao, riscoDoTrade, taxaAcertoMinima } from "../src/core/risk.js";
import { avaliar, verificarNovoTrade, perdasSeguidas, CONFIG_PADRAO } from "../src/core/rules.js";
import { novoTrade, estatisticas, relatorioDiario, exportarCSV } from "../src/core/journal.js";
import { validarAnalise, decidirFala, custoChamada, construirSistema, SCHEMA_ANALISE } from "../src/core/analysis.js";
import { gerarChave, validarChave } from "../src/core/license.js";

const MIN = 60_000;
const AGORA = new Date("2026-11-08T15:00:00").getTime();
const cfg = { ...CONFIG_PADRAO, saldo: 1000, riscoMaxPct: 1, perdaDiariaMaxPct: 3, maxTradesDia: 5, pausaAposPerdas: 2, minutosPausa: 15 };

const fechado = (resultado, minutosAtras, extra = {}) =>
  novoTrade({ ativo: "eurusd", entrada: 1.1, stop: 1.09, quantidade: 1000, resultado, abertoEm: AGORA - (minutosAtras + 5) * MIN, fechadoEm: AGORA - minutosAtras * MIN, ...extra });

// ---------- risco ----------
test("posição: compra com 1% de risco numa conta de 1000 €", () => {
  const r = calcularPosicao({ saldo: 1000, riscoPct: 1, entrada: 100, stop: 98, alvo: 106 });
  assert.equal(r.ok, true);
  assert.equal(r.direcao, "compra");
  assert.equal(r.riscoEuros, 10);
  assert.equal(r.quantidade, 5);
  assert.equal(r.valorPosicao, 500);
  assert.equal(r.rr, 3);
  assert.equal(r.lucroPotencial, 30);
});

test("posição: venda e alvo do lado errado gera erro", () => {
  const r = calcularPosicao({ saldo: 1000, riscoPct: 1, entrada: 100, stop: 102, alvo: 105 });
  assert.equal(r.direcao, "venda");
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /abaixo da entrada/);
});

test("posição: entradas inválidas", () => {
  assert.equal(calcularPosicao({ saldo: 0, riscoPct: 1, entrada: 1, stop: 1 }).ok, false);
  assert.ok(calcularPosicao({ saldo: 100, riscoPct: 1, entrada: 5, stop: 5 }).erros.some((e) => /igual/.test(e)));
});

test("posição: avisa R:R baixo e alavancagem", () => {
  const r = calcularPosicao({ saldo: 1000, riscoPct: 2, entrada: 100, stop: 99.9, alvo: 100.05 });
  assert.ok(r.avisos.some((a) => /risco\/retorno/.test(a)));
  assert.ok(r.avisos.some((a) => /alavancagem/.test(a)));
});

test("risco do trade e taxa de acerto mínima", () => {
  assert.equal(riscoDoTrade({ saldo: 1000, entrada: 100, stop: 98, quantidade: 10 }), 2);
  assert.equal(taxaAcertoMinima(2), 33.3);
  assert.equal(taxaAcertoMinima(1), 50);
});

// ---------- regras ----------
test("sem trades: sem alertas nem bloqueio", () => {
  const r = avaliar(cfg, [], AGORA);
  assert.deepEqual(r.alertas, []);
  assert.equal(r.bloqueio, null);
});

test("perda diária máxima bloqueia até ao fim do dia", () => {
  const trades = [fechado(-20, 120), fechado(5, 90), fechado(-16, 60)]; // -31 € > limite de 30 €
  const r = avaliar(cfg, trades, AGORA);
  assert.ok(r.bloqueio);
  assert.equal(new Date(r.bloqueio.ate).getHours(), 23);
  assert.ok(r.alertas.some((a) => a.codigo === "perda_diaria" && a.gravidade === "critico"));
});

test("perto do limite diário dá aviso", () => {
  const r = avaliar(cfg, [fechado(-22, 60)], AGORA);
  assert.ok(r.alertas.some((a) => a.codigo === "perda_diaria_perto"));
  assert.equal(r.bloqueio, null);
});

test("2 perdas seguidas obrigam a pausa, que expira", () => {
  const trades = [fechado(-5, 20), fechado(-5, 5)];
  assert.equal(perdasSeguidas(trades), 2);
  const r = avaliar(cfg, trades, AGORA);
  assert.ok(r.bloqueio);
  assert.equal(r.bloqueio.ate, AGORA - 5 * MIN + 15 * MIN);
  assert.equal(avaliar(cfg, trades, AGORA + 11 * MIN).bloqueio, null);
});

test("ganho a meio quebra a sequência de perdas", () => {
  assert.equal(perdasSeguidas([fechado(-5, 30), fechado(5, 20), fechado(-5, 5)]), 1);
});

test("trades de ontem não contam", () => {
  const ontem = [fechado(-500, 24 * 60)];
  assert.equal(avaliar(cfg, ontem, AGORA).bloqueio, null);
});

test("overtrading e trades abertos sem stop ou com risco alto", () => {
  const abertos = [
    novoTrade({ ativo: "btc", entrada: 100, stop: null, quantidade: 1, abertoEm: AGORA - MIN }),
    novoTrade({ ativo: "eth", entrada: 100, stop: 95, quantidade: 4, abertoEm: AGORA - MIN }),
  ];
  const trades = [fechado(3, 100), fechado(3, 90), fechado(3, 80), ...abertos];
  const codigos = avaliar(cfg, trades, AGORA).alertas.map((a) => a.codigo);
  assert.ok(codigos.includes("overtrading"));
  assert.ok(codigos.includes("sem_stop"));
  assert.ok(codigos.includes("risco_alto"));
});

test("verificar novo trade: bom trade passa", () => {
  const v = verificarNovoTrade(cfg, [], { entrada: 100, stop: 98, quantidade: 5 }, AGORA);
  assert.equal(v.podeEntrar, true);
  assert.deepEqual(v.alertas, []);
});

test("verificar novo trade: sem stop, risco alto e vingança", () => {
  const semStop = verificarNovoTrade(cfg, [], { entrada: 100, stop: null, quantidade: 5 }, AGORA);
  assert.equal(semStop.podeEntrar, false);
  const grande = verificarNovoTrade(cfg, [], { entrada: 100, stop: 98, quantidade: 50 }, AGORA);
  assert.equal(grande.podeEntrar, false);
  const vinganca = verificarNovoTrade(cfg, [fechado(-5, 2)], { entrada: 100, stop: 98, quantidade: 5 }, AGORA);
  assert.ok(vinganca.alertas.some((a) => a.codigo === "vinganca"));
  assert.equal(vinganca.podeEntrar, true);
});

test("verificar novo trade: bloqueado durante a pausa", () => {
  const v = verificarNovoTrade(cfg, [fechado(-5, 20), fechado(-5, 3)], { entrada: 100, stop: 98, quantidade: 5 }, AGORA);
  assert.equal(v.podeEntrar, false);
  assert.ok(v.bloqueio);
});

// ---------- diário ----------
test("novoTrade normaliza campos", () => {
  const t = novoTrade({ ativo: " btcusdt ", direcao: "venda", entrada: "100", stop: "", resultado: "" }, AGORA);
  assert.equal(t.ativo, "BTCUSDT");
  assert.equal(t.direcao, "venda");
  assert.equal(t.entrada, 100);
  assert.equal(t.stop, null);
  assert.equal(t.resultado, null);
  assert.equal(t.fechadoEm, null);
  assert.equal(t.seguiuPlano, true);
});

test("estatísticas e disciplina", () => {
  const trades = [fechado(30, 100), fechado(-10, 90), fechado(-20, 80, { seguiuPlano: false }), fechado(20, 70), novoTrade({ ativo: "x", abertoEm: AGORA })];
  const e = estatisticas(trades);
  assert.equal(e.total, 4);
  assert.equal(e.abertos, 1);
  assert.equal(e.winRate, 50);
  assert.equal(e.pnl, 20);
  assert.equal(e.payoff, 1.67);
  assert.equal(e.expectativa, 5);
  assert.equal(e.disciplina, 75);
  assert.equal(e.pnlSemPlano, -20);
  assert.equal(e.pnlComPlano, 40);
  assert.equal(e.maiorSeqPerdas, 2);
});

test("relatório diário destaca o custo de fugir ao plano", () => {
  const trades = [fechado(30, 100), fechado(-20, 80, { seguiuPlano: false })];
  const { linhas } = relatorioDiario(trades, cfg, AGORA);
  assert.ok(linhas.some((l) => /fora do plano custaram-te 20/.test(l)));
  assert.match(relatorioDiario([], cfg, AGORA).linhas[1], /Sem trades/);
});

test("CSV escapa separadores", () => {
  const csv = exportarCSV([fechado(5, 10, { nota: 'entrada "boa"; sem pressa' })]);
  const [cab, linha] = csv.split("\n");
  assert.match(cab, /^data;ativo/);
  assert.match(linha, /"entrada ""boa""; sem pressa"$/);
});

// ---------- análise IA ----------
const analiseValida = {
  ha_grafico: true, ativo: "EURUSD", timeframe: "5m", tendencia: "alta",
  fala: "O preço está a fazer fundos mais altos.", observacoes: ["RSI em 72"],
  niveis: [{ tipo: "resistencia", preco: "1.0950", nota: "rejeitou 3 vezes" }],
  alertas: [], checklist: [], mudou: true,
};

test("validarAnalise aceita objeto e string JSON", () => {
  assert.equal(validarAnalise(analiseValida).tendencia, "alta");
  assert.equal(validarAnalise(JSON.stringify(analiseValida)).ativo, "EURUSD");
});

test("validarAnalise corrige lixo e não lança", () => {
  assert.equal(validarAnalise("não é json"), null);
  assert.equal(validarAnalise(null), null);
  const a = validarAnalise({ tendencia: "foguete", alertas: [{ gravidade: "x", mensagem: "m" }, { mensagem: "" }], observacoes: "x" });
  assert.equal(a.tendencia, "indefinida");
  assert.equal(a.alertas.length, 1);
  assert.equal(a.alertas[0].gravidade, "info");
  assert.deepEqual(a.observacoes, []);
});

test("decidirFala: crítico fala sempre, sem mudanças fica calado", () => {
  const critico = validarAnalise({ ...analiseValida, mudou: false, alertas: [{ gravidade: "critico", mensagem: "Posição sem stop." }] });
  assert.equal(decidirFala(critico), "Atenção. Posição sem stop.");
  assert.equal(decidirFala(validarAnalise({ ...analiseValida, mudou: false }), "explicar"), null);
  assert.equal(decidirFala(validarAnalise(analiseValida), "explicar"), analiseValida.fala);
});

test("decidirFala no modo 'só o importante': calado salvo aviso, mudança de estrutura ou regras cumpridas", () => {
  const a = validarAnalise({ ...analiseValida, alertas: [] });
  assert.equal(decidirFala(a), null); // primeira leitura sem nada de especial: silêncio
  assert.equal(decidirFala(a, "importante", { ...a, tendencia: "lateral" }), a.fala); // a estrutura mudou
  assert.equal(decidirFala(a, "importante", a), null); // nada mudou de importante
  const aviso = validarAnalise({ ...analiseValida, alertas: [{ gravidade: "aviso", mensagem: "Volatilidade alta." }] });
  assert.equal(decidirFala(aviso), "Volatilidade alta.");
});

test("custo por chamada", () => {
  const usd = custoChamada({ input_tokens: 2000, output_tokens: 300 }, "claude-opus-5-5");
  assert.equal(Math.round(usd * 1e6), 14000); // 2000*4 + 300*20 = 14000 / 1e6
  assert.ok(custoChamada({ input_tokens: 2000, output_tokens: 300 }, "claude-sonnet-5-5") < usd);
});

test("sistema inclui regras pessoais e proíbe ordens", () => {
  const s = construirSistema({ ...cfg, regrasPessoais: "- Só opero a favor da média de 200" });
  assert.match(s, /média de 200/);
  assert.match(s, /Nunca dizes "compra"/);
});

test("schema: todos os objetos fecham propriedades extra", () => {
  const verificar = (s) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(verificar);
    }
    if (s.type === "array") verificar(s.items);
  };
  verificar(SCHEMA_ANALISE);
});

// ---------- licenças ----------
test("licenças geradas validam; adulteradas não", () => {
  for (let i = 0; i < 200; i++) {
    const k = gerarChave();
    assert.ok(validarChave(k), k);
    assert.ok(validarChave(k.toLowerCase()));
    const trocada = k.slice(0, 5) + (k[5] === "A" ? "B" : "A") + k.slice(6);
    assert.equal(validarChave(trocada), false, trocada);
  }
  assert.equal(validarChave("SENT-AAAA-AAAA-AAAA-AAAA"), false);
  assert.equal(validarChave(""), false);
});

// ---------- indicações dentro da lei ----------
import { estadoSetup } from "../src/core/analysis.js";
import { ANALISES_DEMO as DEMOS } from "../src/core/demo.js";

test("cenários e invalidação são validados e limitados", () => {
  const a = validarAnalise({
    ...analiseValida,
    cenarios: [{ condicao: "Fecho acima de 1.0950", leitura: "x" }, { condicao: "Fecho abaixo de 1.0900", leitura: "y" }, { condicao: "terceiro", leitura: "z" }, { leitura: "sem condição" }],
    invalidacao: { preco: "1.0900", razao: "último fundo" },
  });
  assert.equal(a.cenarios.length, 2);
  assert.equal(a.invalidacao.preco, "1.0900");
  assert.equal(validarAnalise({ ...analiseValida, invalidacao: { preco: "" } }).invalidacao, null);
  assert.deepEqual(validarAnalise(analiseValida).cenarios, []);
});

test("estado do setup segundo as regras do trader", () => {
  assert.equal(estadoSetup([]), "sem_regras");
  assert.equal(estadoSetup([{ cumprida: "sim" }, { cumprida: "sim" }]), "cumpridas");
  assert.equal(estadoSetup([{ cumprida: "sim" }, { cumprida: "incerto" }]), "parciais");
  assert.equal(estadoSetup([{ cumprida: "sim" }, { cumprida: "nao" }]), "nao_cumpridas");
});

test("com as regras cumpridas a voz diz-o e devolve a decisão ao trader", () => {
  const fala = decidirFala(validarAnalise(DEMOS[4]), "explicar");
  assert.match(decidirFala(validarAnalise(DEMOS[4])), /A decisão é tua/); // também no modo silencioso, na primeira vez
  assert.match(fala, /regras de entrada estão todas cumpridas/);
  assert.match(fala, /A decisão é tua/);
});

test("nenhum texto da demo contém ordens ou promessas", () => {
  const proibido = /\b(compra agora|vende agora|deves (comprar|vender|entrar)|recomendo|lucro garantido|vai subir|vai descer)\b/i;
  for (const d of DEMOS) assert.doesNotMatch(JSON.stringify(d), proibido);
});

test("o prompt pede cenários dos dois lados e proíbe recomendações", () => {
  const s = construirSistema(cfg);
  assert.match(s, /sempre os dois lados/);
  assert.match(s, /"recomendo"/);
  assert.match(s, /nunca dás alvos de lucro/);
});
