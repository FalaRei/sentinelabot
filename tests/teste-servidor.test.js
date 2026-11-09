import { test } from "node:test";
import assert from "node:assert/strict";
import { extrairJSON, paraMensagensDeepSeek, analisarEcraDeepSeek, FORMATO_JSON } from "../src/services/deepseek.js";
import { textoDaResposta, paraInputOpenAI } from "../src/services/openai.js";
import { ligarServidor, detetarServidor } from "../src/services/servidor.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";

const ANALISE = { ha_grafico: true, ativo: "EURUSD", timeframe: "5m", tendencia: "alta", fala: "Fundos mais altos.", observacoes: [], niveis: [], cenarios: [], invalidacao: { preco: "1.09", razao: "fundo" }, alertas: [], checklist: [], mudou: true };

test("DeepSeek: tira o JSON de dentro de texto ou blocos de código", () => {
  assert.equal(extrairJSON('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extrairJSON('Aqui vai: {"a":{"b":2}} fim'), '{"a":{"b":2}}');
  assert.match(FORMATO_JSON, /ha_grafico/);
  assert.doesNotMatch(FORMATO_JSON, /description/);
});

test("DeepSeek: envia imagem e modo JSON, e lê a análise", async () => {
  let corpo;
  const fetchFn = async (_u, o) => ((corpo = JSON.parse(o.body)), { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(ANALISE) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } }) });
  const r = await analisarEcraDeepSeek({ chave: "sk-x", modelo: "deepseek-flash", config: CONFIG_PADRAO, imagemBase64: "QUJD", fetchFn });
  assert.equal(corpo.response_format.type, "json_object");
  assert.equal(corpo.messages[1].content[0].type, "image_url");
  assert.match(corpo.messages[1].content[1].text, /json/);
  assert.equal(r.analise.tendencia, "alta");
  assert.deepEqual(r.usage, { entrada: 900, saida: 300 });
});

test("formatos de mensagens para DeepSeek e OpenAI", () => {
  const msgs = [{ role: "user", content: "olá" }, { role: "assistant", content: "viva" }, { role: "user", content: [{ type: "image", source: { media_type: "image/jpeg", data: "QQ" } }, { type: "text", text: "e agora?" }] }];
  assert.deepEqual(paraMensagensDeepSeek(msgs)[2].content[0], { type: "image_url", image_url: { url: "data:image/jpeg;base64,QQ" } });
  assert.deepEqual(paraInputOpenAI(msgs)[2].content[0], { type: "input_image", image_url: "data:image/jpeg;base64,QQ" });
  assert.equal(textoDaResposta({ output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] }), "OK");
});

test("servidor de teste: deteta, manda o código e passa os erros", async () => {
  assert.deepEqual(await detetarServidor({ fetchFn: async () => ({ ok: true, json: async () => ({ ativo: true, ia: "DeepSeek", voz: false }) }) }), { ia: "DeepSeek", voz: false });
  assert.equal(await detetarServidor({ fetchFn: async () => ({ ok: false }) }), null);
  assert.equal(await detetarServidor({ fetchFn: async () => { throw new Error("sem servidor"); } }), null);
  let cabecalhos;
  const ok = ligarServidor("abc", { ia: "DeepSeek" }, { fetchFn: async (_u, o) => ((cabecalhos = o.headers), { ok: true, json: async () => ({ texto: "Olá" }) }) });
  assert.equal((await ok.perguntar({ config: CONFIG_PADRAO, mensagens: [] })).texto, "Olá");
  assert.equal(cabecalhos["x-codigo"], "abc");
  const mau = ligarServidor("errado", { ia: "DeepSeek" }, { fetchFn: async () => ({ ok: false, status: 403, json: async () => ({ erro: "Link de teste inválido.", fatal: true }) }) });
  await assert.rejects(mau.analisar({ imagemBase64: "QQ" }), (e) => e.fatal && /inválido/.test(e.message));
});

test("o endereço da API segue a página da app (raiz ou debaixo da plataforma)", async () => {
  const { urlApi } = await import("../src/services/servidor.js");
  assert.equal(urlApi("estado", "https://sentinela.vercel.app/app/"), "https://sentinela.vercel.app/api/estado");
  assert.equal(urlApi("analisar", "https://falarei.online/apps/sentinelabot/app/"), "https://falarei.online/apps/sentinelabot/api/analisar");
  assert.equal(urlApi("voz", undefined), "/api/voz");
});

test("núcleo: escolhe a IA pelas chaves, exige o código e valida", async () => {
  const { escolherIA, tratarPedido, configSegura } = await import("../servidor/nucleo.js");
  assert.equal(escolherIA({ FAL_KEY: "x", DEEPSEEK_API_KEY: "y" }).nome, "Gemini");
  assert.equal(escolherIA({ DEEPSEEK_API_KEY: "y" }).nome, "DeepSeek");
  assert.equal(escolherIA({}), null);
  const env = { FAL_KEY: "x", CODIGO_TESTE: "abc" };
  assert.deepEqual((await tratarPedido({ acao: "estado", metodo: "GET", env })).json, { ativo: true, ia: "Gemini", voz: true });
  assert.equal((await tratarPedido({ acao: "analisar", metodo: "POST", codigo: "errado", env })).status, 403);
  assert.equal((await tratarPedido({ acao: "analisar", metodo: "POST", codigo: "abc", ip: "t1", corpo: {}, env })).status, 400);
  assert.equal((await tratarPedido({ acao: "analisar", metodo: "POST", codigo: "abc", ip: "sem-codigo", env: { FAL_KEY: "x" } })).status, 403); // sem CODIGO_TESTE definido, ninguém entra
  const c = configSegura({ saldo: 5000, regrasPessoais: "x".repeat(5000), injetado: "mau" });
  assert.equal(c.saldo, 5000);
  assert.equal(c.regrasPessoais.length, 1500);
  assert.equal("injetado" in c, false);
});
