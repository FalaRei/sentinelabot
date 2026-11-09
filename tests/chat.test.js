import { test } from "node:test";
import assert from "node:assert/strict";
import { construirSistemaChat, contextoDoMomento, construirMensagensChat, respostaDemo, MAX_HISTORICO } from "../src/core/chat.js";
import { perguntarCopiloto, ErroAnalise } from "../src/services/claude.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";
import { ANALISES_DEMO } from "../src/core/demo.js";
import { validarAnalise } from "../src/core/analysis.js";

const analise = validarAnalise(ANALISES_DEMO[0]);

test("o sistema do chat proíbe ordens e manda devolver a checklist", () => {
  const s = construirSistemaChat({ ...CONFIG_PADRAO, regrasPessoais: "- só a favor da tendência" });
  assert.match(s, /Nunca dizes para comprar, vender/);
  assert.match(s, /a decisão é tua/);
  assert.match(s, /só a favor da tendência/);
  assert.match(s, /09:00–17:30/);
});

test("contexto do momento inclui dia, avisos e leitura", () => {
  const c = contextoDoMomento({ analise, pnlHoje: -12.5, perdasSeguidas: 2, alertas: [{ gravidade: "critico", mensagem: "Pausa obrigatória" }, { gravidade: "info", mensagem: "ignorar" }], sessao: { dentro: true, noticia: { hora: "14:30", nome: "NFP" } } });
  assert.match(c, /-12.50 €/);
  assert.match(c, /Pausa obrigatória/);
  assert.doesNotMatch(c, /ignorar/);
  assert.match(c, /NFP/);
  assert.match(c, /Zona de invalidação: 1.0912/);
});

test("mensagens: histórico curto, começa no utilizador, imagem na pergunta nova", () => {
  const historico = Array.from({ length: 20 }, (_, i) => ({ papel: i % 2 ? "copiloto" : "trader", texto: `m${i}` }));
  const m = construirMensagensChat({ historico, pergunta: "e agora?", contexto: "ctx", imagemBase64: "AAA" });
  assert.equal(m[0].role, "user");
  assert.ok(m.length <= MAX_HISTORICO + 1);
  const ultima = m[m.length - 1];
  assert.equal(ultima.content[0].type, "image");
  assert.match(ultima.content[1].text, /Pergunta: e agora\?/);
  for (let i = 1; i < m.length; i++) assert.notEqual(m[i].role, m[i - 1].role);
});

test("demo: pedido de ordem recebe checklist e nunca uma ordem", () => {
  for (const p of ["Compro agora?", "devo entrar?", "vendo ou não?"]) {
    const r = respostaDemo(p, analise);
    assert.match(r, /Não te digo para entrar/);
    assert.match(r, /a decisão é tua/);
    assert.doesNotMatch(r, /\b(compra|vende) agora\b/i);
  }
  assert.match(respostaDemo("o que é o RSI?", analise), /0 a 100/);
  assert.match(respostaDemo("onde ponho o stop?", analise), /1.0912/);
  assert.match(respostaDemo("perdi outra vez", analise), /pausa/);
});

test("perguntarCopiloto faz streaming, envia fallback e trata recusa", async () => {
  const eventos = {};
  const cliente = {
    chamada: null,
    beta: { messages: { stream(params, opts) {
      cliente.chamada = params;
      return {
        on(ev, fn) { eventos[ev] = fn; return this; },
        async finalMessage() {
          eventos.text?.("Olá ", "Olá ");
          eventos.text?.("trader", "Olá trader");
          return { stop_reason: "end_turn", content: [{ type: "text", text: "Olá trader" }], usage: { input_tokens: 100, output_tokens: 20 } };
        },
      };
    } } },
  };
  const recebido = [];
  const r = await perguntarCopiloto({ cliente, modelo: "claude-opus-5-5", sistema: "s", mensagens: [{ role: "user", content: "x" }], aoReceber: (d, t) => recebido.push(t) });
  assert.equal(r.texto, "Olá trader");
  assert.deepEqual(recebido, ["Olá ", "Olá trader"]);
  assert.equal(cliente.chamada.fallbacks, "default");
  assert.ok(r.custo > 0);

  const recusa = { beta: { messages: { stream: () => ({ on() { return this; }, finalMessage: async () => ({ stop_reason: "refusal", content: [], usage: {} }) }) } } };
  await assert.rejects(perguntarCopiloto({ cliente: recusa, modelo: "claude-opus-5-5", sistema: "s", mensagens: [] }), (e) => e instanceof ErroAnalise);
});
