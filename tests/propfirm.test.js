import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_PADRAO, folgas, avaliar, verificarNovoTrade } from "../src/core/rules.js";
import { MODELOS_CONTA, aplicarModelo } from "../src/core/propfirm.js";
import { msAteFechoVela, leiturasPorHora } from "../src/core/cadencia.js";
import { provedorDaChave, modeloParaChave, MODELOS, custoChamada, construirSistema } from "../src/core/analysis.js";
import { textoDaInteracao, usoDaInteracao, paraInputGemini, analisarEcraGemini, perguntarGemini } from "../src/services/gemini.js";
import { pontuarVoz, melhorVoz } from "../src/services/voice.js";
import { novoTrade } from "../src/core/journal.js";

const MIN = 60_000;
const as = (hhmm, dia = "09") => new Date(`2026-11-${dia}T${hhmm}:00`).getTime();
const desafio = aplicarModelo({ ...CONFIG_PADRAO, horaInicio: "00:00", horaFim: "00:00" }, "classico", { saldo: 10000, agora: as("08:00", "02") });
const T = (aberto, resultado, extra = {}) =>
  novoTrade({ ativo: "EURUSD", entrada: 1.1, stop: 1.099, quantidade: 100000, resultado, abertoEm: aberto, fechadoEm: resultado == null ? null : aberto + 5 * MIN, ...extra });
const codigos = (r) => r.alertas.map((a) => a.codigo);

test("aplicarModelo: regras do desafio, saldo e início da contagem", () => {
  assert.equal(desafio.modoConta, "desafio");
  assert.equal(desafio.perdaDiariaMaxPct, 5);
  assert.equal(desafio.perdaTotalMaxPct, 10);
  assert.equal(desafio.saldo, 10000);
  assert.equal(desafio.inicioDesafio, as("08:00", "02"));
  const propria = aplicarModelo(desafio, "propria");
  assert.equal(propria.modoConta, "propria");
  assert.equal(propria.perdaTotalMaxPct, 0);
  assert.equal(propria.inicioDesafio, 0);
  assert.ok(MODELOS_CONTA.every((m) => m.nome && m.desc));
});

test("folgas: o lucro de hoje dá margem, as perdas tiram; trades antes do desafio não contam", () => {
  const trades = [T(as("10:00", "01"), -900), T(as("10:00", "05"), -300), T(as("10:00"), 200)];
  const f = folgas(desafio, trades, as("12:00"));
  assert.deepEqual(f.dia, { limite: 500, usado: 0, resta: 700 });
  assert.deepEqual(f.total, { limite: 1000, usado: 100, resta: 900 }); // −300 + 200; o −900 é de antes do desafio
  assert.equal(f.meta.alvo, 1000);
  assert.equal(f.meta.progresso, 0);
  const comAberto = folgas(desafio, [...trades, T(as("11:00"), null)], as("12:00"));
  assert.equal(comAberto.riscoAberto, 100); // 0.001 × 100 000
});

test("perda total do desafio: aviso perto e bloqueio ao atingir", () => {
  const perto = [T(as("10:00", "05"), -400), T(as("10:00", "06"), -400)];
  assert.ok(codigos(avaliar(desafio, perto, as("12:00"))).includes("perda_total_perto"));
  const fim = [...perto, T(as("10:00", "07"), -250)];
  const r = avaliar(desafio, fim, as("12:00"));
  assert.ok(codigos(r).includes("perda_total"));
  assert.ok(r.bloqueio);
  assert.match(r.alertas.find((a) => a.codigo === "perda_total").mensagem, /conta está perdida/);
});

test("pré-trade: avisa ANTES se o stop fizer passar o limite diário", () => {
  const hoje = [T(as("09:30"), -350)]; // restam 150 € hoje
  const grande = verificarNovoTrade(desafio, hoje, { entrada: 1.1, stop: 1.098, quantidade: 100000 }, as("12:00")); // arrisca 200 €
  assert.equal(grande.podeEntrar, false);
  const a = grande.alertas.find((x) => x.codigo === "passa_limite_dia");
  assert.equal(a.gravidade, "critico");
  assert.match(a.mensagem, /No desafio, isso é perder a conta/);
  // na conta própria a mensagem não fala de desafio
  const propria = { ...desafio, modoConta: "propria", perdaTotalMaxPct: 0, riscoMaxPct: 100 };
  const msg = verificarNovoTrade(propria, hoje, { entrada: 1.1, stop: 1.098, quantidade: 100000 }, as("12:00")).alertas.find((x) => x.codigo === "passa_limite_dia").mensagem;
  assert.doesNotMatch(msg, /desafio/);
  // um trade pequeno cabe
  const pequeno = verificarNovoTrade({ ...desafio, riscoMaxPct: 5 }, hoje, { entrada: 1.1, stop: 1.099, quantidade: 50000 }, as("12:00"));
  assert.ok(!pequeno.alertas.some((x) => x.codigo.startsWith("passa_limite")));
});

test("o prompt sabe que é um desafio", () => {
  assert.match(construirSistema(desafio), /desafio de prop firm com perda máxima total de 10%/);
  assert.doesNotMatch(construirSistema(CONFIG_PADRAO), /prop firm/);
});

test("cadência: a leitura acontece no fecho da vela", () => {
  const base = Date.UTC(2026, 10, 9, 10, 0, 0);
  assert.equal(msAteFechoVela(5, base + 2 * MIN, 0), 3 * MIN);
  assert.equal(msAteFechoVela(5, base, 3000), 5 * MIN + 3000); // mesmo em cima do fecho, espera pela próxima
  assert.equal(msAteFechoVela(60, base + 59 * MIN + 30_000, 0), 30_000);
  assert.equal(leiturasPorHora(5), 12);
  assert.equal(leiturasPorHora(15), 4);
});

test("a chave diz qual é a IA", () => {
  assert.equal(provedorDaChave("sk-ant-api03-xyz"), "anthropic");
  assert.equal(provedorDaChave("  AIzaSyABC "), "google");
  assert.equal(provedorDaChave("qualquer"), null);
  assert.equal(modeloParaChave("AIzaX", "claude-opus-5-5"), "gemini-3.8-flash");
  assert.equal(modeloParaChave("sk-ant-x", "claude-opus-5-5"), "claude-opus-5-5");
  assert.equal(modeloParaChave("sk-ant-x", "gemini-3.8-flash"), "claude-sonnet-5-5");
  assert.equal(MODELOS["gemini-3.8-flash"].provedor, "google");
  assert.ok(custoChamada({ entrada: 3500, saida: 400 }, "gemini-3.8-flash") < custoChamada({ entrada: 3500, saida: 400 }, "claude-sonnet-5-5"));
});

test("Gemini: lê o texto e os tokens nos formatos possíveis", () => {
  assert.equal(textoDaInteracao({ output_text: "olá" }), "olá");
  assert.equal(textoDaInteracao({ outputs: [{ type: "text", text: "a" }, { type: "thought" }, { type: "text", text: "b" }] }), "ab");
  assert.deepEqual(usoDaInteracao({ usage: { total_input_tokens: 10, total_output_tokens: 3 } }), { entrada: 10, saida: 3 });
  assert.deepEqual(usoDaInteracao({}), { entrada: 0, saida: 0 });
  const input = paraInputGemini([
    { role: "user", content: "olá" },
    { role: "assistant", content: "viva" },
    { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } }, { type: "text", text: "e agora?" }] },
  ]);
  assert.deepEqual(input[1], { type: "text", text: "Sentinela: viva" });
  assert.deepEqual(input[2], { type: "image", data: "QUJD", mime_type: "image/jpeg" });
});

test("Gemini: envia imagem, schema e store:false; devolve análise e custo", async () => {
  let pedido;
  const fetchFn = async (url, opts) => {
    pedido = { url, opts, corpo: JSON.parse(opts.body) };
    const analise = { ha_grafico: true, ativo: "EURUSD", timeframe: "5m", tendencia: "alta", fala: "Fundos mais altos.", observacoes: [], niveis: [], cenarios: [], invalidacao: { preco: "1.09", razao: "último fundo" }, alertas: [], checklist: [], mudou: true };
    return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(analise), usage: { total_input_tokens: 3000, total_output_tokens: 300 } }) };
  };
  const r = await analisarEcraGemini({ chave: "AIzaTESTE", modelo: "gemini-3.8-flash", config: CONFIG_PADRAO, imagemBase64: "QUJD", analiseAnterior: null, fetchFn });
  assert.match(pedido.url, /generativelanguage\.googleapis\.com\/v1beta\/interactions$/);
  assert.equal(pedido.opts.headers["x-goog-api-key"], "AIzaTESTE");
  assert.equal(pedido.corpo.store, false);
  assert.equal(pedido.corpo.model, "gemini-3.8-flash");
  assert.equal(pedido.corpo.input[0].type, "image");
  assert.equal(pedido.corpo.response_format.mime_type, "application/json");
  assert.equal(r.analise.tendencia, "alta");
  assert.ok(r.custo > 0);
});

test("Gemini: chave inválida é fatal; limite de pedidos não é", async () => {
  const resp = (status, message) => async () => ({ ok: false, status, json: async () => ({ error: { message } }) });
  await assert.rejects(analisarEcraGemini({ chave: "x", modelo: "gemini-3.8-flash", config: CONFIG_PADRAO, imagemBase64: "", fetchFn: resp(400, "API key not valid. Please pass a valid API key.") }), (e) => e.fatal === true);
  await assert.rejects(perguntarGemini({ chave: "x", modelo: "gemini-3.8-flash", sistema: "s", mensagens: [], fetchFn: resp(429, "quota") }), (e) => !e.fatal && /Limite/.test(e.message));
  await assert.rejects(perguntarGemini({ chave: "x", modelo: "gemini-3.8-flash", sistema: "s", mensagens: [], fetchFn: async () => { throw new TypeError("Failed to fetch"); } }), /Sem ligação/);
});

test("voz: prefere as vozes naturais em português de Portugal", () => {
  const vozes = [
    { name: "Microsoft Helia - Portuguese (Portugal)", lang: "pt-PT" },
    { name: "Microsoft Francisca Online (Natural) - Portuguese (Brazil)", lang: "pt-BR" },
    { name: "Microsoft Raquel Online (Natural) - Portuguese (Portugal)", lang: "pt-PT" },
    { name: "Google US English", lang: "en-US" },
  ];
  assert.equal(melhorVoz(vozes).name, "Microsoft Raquel Online (Natural) - Portuguese (Portugal)");
  assert.equal(melhorVoz(vozes.filter((v) => !/Raquel/.test(v.name))).name, "Microsoft Francisca Online (Natural) - Portuguese (Brazil)");
  assert.equal(pontuarVoz(vozes[3]), -1);
  assert.equal(melhorVoz([vozes[3]]), null);
});

test("lerTimeframe percebe os formatos das plataformas", async () => {
  const { lerTimeframe } = await import("../src/core/cadencia.js");
  assert.equal(lerTimeframe("5m"), 5);
  assert.equal(lerTimeframe("M15"), 15);
  assert.equal(lerTimeframe("1H"), 60);
  assert.equal(lerTimeframe("H1"), 60);
  assert.equal(lerTimeframe("15 min"), 15);
  assert.equal(lerTimeframe("5"), 5);
  assert.equal(lerTimeframe("D1"), 1440);
  assert.equal(lerTimeframe(""), null);
  assert.equal(lerTimeframe("semanal"), null);
});

test("dicas por plataforma: separador para o browser, janela para programas", async () => {
  const { PLATAFORMAS, dicaPartilha, superficieDe } = await import("../src/core/plataformas.js");
  assert.equal(superficieDe("tradingview"), "browser");
  assert.equal(superficieDe("metatrader"), "window");
  assert.equal(superficieDe("nada"), null);
  assert.match(dicaPartilha("tradingview"), /separador/);
  assert.match(dicaPartilha("metatrader"), /Janela/);
  assert.match(dicaPartilha(undefined), /onde tens o gráfico/);
  assert.ok(PLATAFORMAS.every((p) => dicaPartilha(p.id).length > 40));
});
