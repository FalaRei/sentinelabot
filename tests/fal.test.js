import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarEcraFal, perguntarFal, vozFal } from "../src/services/fal.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";

const ANALISE = { ha_grafico: true, ativo: "", timeframe: "", tendencia: "alta", fala: "Fundos mais altos.", observacoes: [], niveis: [], cenarios: [], invalidacao: { preco: "", razao: "" }, alertas: [], checklist: [], mudou: true };

test("fal visão: imagem, reasoning obrigatório e JSON lido", async () => {
  let corpo, cab;
  const fetchFn = async (_u, o) => ((corpo = JSON.parse(o.body)), (cab = o.headers), { ok: true, status: 200, json: async () => ({ output: "```json\n" + JSON.stringify(ANALISE) + "\n```", usage: { prompt_tokens: 1100, completion_tokens: 500, cost: 0.005 } }) });
  const r = await analisarEcraFal({ chave: "k:s", config: CONFIG_PADRAO, imagemBase64: "QUJD", fetchFn });
  assert.equal(cab.Authorization, "Key k:s");
  assert.equal(corpo.reasoning, true);
  assert.equal(corpo.model, "google/gemini-3.8-flash");
  assert.match(corpo.image_urls[0], /^data:image\/jpeg;base64,QUJD$/);
  assert.equal(r.analise.tendencia, "alta");
  assert.equal(r.usage.custoUSD, 0.005);
});

test("fal chat junta a conversa e manda a última captura", async () => {
  let corpo;
  const fetchFn = async (_u, o) => ((corpo = JSON.parse(o.body)), { ok: true, status: 200, json: async () => ({ output: " Olá " }) });
  const r = await perguntarFal({ chave: "k", sistema: "S", mensagens: [{ role: "user", content: [{ type: "image", source: { media_type: "image/jpeg", data: "QQ" } }, { type: "text", text: "e agora?" }] }], fetchFn });
  assert.equal(r.texto, "Olá");
  assert.equal(corpo.image_urls.length, 1);
  assert.match(corpo.prompt, /Trader: e agora\?/);
});

test("fal voz só aceita áudio dos servidores da fal; sem saldo é fatal", async () => {
  const fetchFn = async (u) => (u.includes("elevenlabs") ? { ok: true, json: async () => ({ audio: { url: "https://evil.example/x.mp3" } }) } : { ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await assert.rejects(vozFal({ chave: "k", texto: "olá", fetchFn }), /voz não respondeu/);
  const semSaldo = async () => ({ ok: false, status: 403, json: async () => ({ detail: "Exhausted balance" }) });
  await assert.rejects(analisarEcraFal({ chave: "k", config: CONFIG_PADRAO, imagemBase64: "QQ", fetchFn: semSaldo }), (e) => e.fatal === true);
});
