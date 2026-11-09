import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";

import { paraCinzento, diferenca, deveAnalisar } from "../src/core/frames.js";
import { analisarEcra, ErroAnalise } from "../src/services/claude.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";
import { ANALISES_DEMO } from "../src/core/demo.js";
import { validarAnalise, SCHEMA_ANALISE } from "../src/core/analysis.js";

// ---------- frames ----------
test("cinzento e diferença entre miniaturas", () => {
  const branco = paraCinzento(new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]));
  assert.deepEqual([...branco], [255, 255]);
  const a = new Uint8Array(100).fill(100);
  const b = a.slice();
  assert.equal(diferenca(a, b), 0);
  b.fill(200, 0, 10);
  assert.equal(diferenca(a, b), 0.1);
  assert.equal(diferenca(a, new Uint8Array(5)), 1);
});

test("deveAnalisar poupa chamadas quando o ecrã não muda", () => {
  const a = new Uint8Array(2304).fill(50);
  assert.equal(deveAnalisar({ miniaturaAtual: a, miniaturaAnterior: null, msDesdeUltima: 0 }).analisar, true);
  assert.equal(deveAnalisar({ miniaturaAtual: a, miniaturaAnterior: a.slice(), msDesdeUltima: 30_000 }).analisar, false);
  assert.equal(deveAnalisar({ miniaturaAtual: a, miniaturaAnterior: a.slice(), msDesdeUltima: 6 * 60_000 }).motivo, "tempo");
  const b = a.slice();
  b.fill(255, 0, 50);
  assert.equal(deveAnalisar({ miniaturaAtual: b, miniaturaAnterior: a, msDesdeUltima: 1000 }).motivo, "mudanca");
});

// ---------- serviço Claude (API simulada) ----------
function clienteFalso(resposta) {
  const chamadas = [];
  return {
    chamadas,
    beta: {
      messages: {
        create: async (params, opts) => {
          chamadas.push({ params, opts });
          if (resposta instanceof Error) throw resposta;
          return resposta;
        },
      },
    },
  };
}

const respostaOk = (analise, extra = {}) => ({
  stop_reason: "end_turn",
  content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(analise) }],
  usage: { input_tokens: 1800, output_tokens: 250 },
  ...extra,
});

test("analisarEcra envia imagem, schema, fallback e devolve análise + custo", async () => {
  const cliente = clienteFalso(respostaOk(ANALISES_DEMO[0]));
  const r = await analisarEcra({
    cliente, modelo: "claude-opus-5-5", config: CONFIG_PADRAO, imagemBase64: "AAAA", analiseAnterior: null,
  });
  assert.equal(r.analise.ativo, "EURUSD");
  assert.ok(r.custo > 0);
  const p = cliente.chamadas[0].params;
  assert.equal(p.model, "claude-opus-5-5");
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(p.output_config.format.type, "json_schema");
  assert.equal(p.output_config.format.schema, SCHEMA_ANALISE);
  assert.equal(p.output_config.effort, "low");
  assert.equal(p.thinking, undefined);
  assert.equal(p.messages[0].content[0].type, "image");
  assert.equal(p.messages[0].content[0].source.data, "AAAA");
});

test("analisarEcra trata recusa, truncagem e JSON inválido", async () => {
  const base = { cliente: null, modelo: "claude-opus-5-5", config: CONFIG_PADRAO, imagemBase64: "A" };
  await assert.rejects(analisarEcra({ ...base, cliente: clienteFalso(respostaOk({}, { stop_reason: "refusal", content: [] })) }), /recusou/);
  await assert.rejects(analisarEcra({ ...base, cliente: clienteFalso(respostaOk({}, { stop_reason: "max_tokens" })) }), /incompleta/);
  await assert.rejects(
    analisarEcra({ ...base, cliente: clienteFalso({ stop_reason: "end_turn", content: [{ type: "text", text: "{oops" }], usage: {} }) }),
    /ilegível/
  );
});

test("analisarEcra traduz erros da API e marca os fatais", async () => {
  const base = { modelo: "claude-opus-5-5", config: CONFIG_PADRAO, imagemBase64: "A" };
  const auth = new Anthropic.AuthenticationError(401, { error: { message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
  await assert.rejects(analisarEcra({ ...base, cliente: clienteFalso(auth) }), (e) => e instanceof ErroAnalise && e.fatal && /Chave/.test(e.message));
  const rate = new Anthropic.RateLimitError(429, {}, "rate", new Headers());
  await assert.rejects(analisarEcra({ ...base, cliente: clienteFalso(rate) }), (e) => !e.fatal && /intervalo/.test(e.message));
  const conn = new Anthropic.APIConnectionError({ message: "offline" });
  await assert.rejects(analisarEcra({ ...base, cliente: clienteFalso(conn) }), /ligação/);
});

test("todas as análises demo passam a validação sem perdas", () => {
  for (const d of ANALISES_DEMO) assert.deepEqual(validarAnalise(d), d);
});
