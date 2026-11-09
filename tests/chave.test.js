import { test } from "node:test";
import assert from "node:assert/strict";
import { testarChave } from "../src/services/ia.js";
import { ErroAnalise } from "../src/services/erros.js";

test("testarChave: formato desconhecido nem chega a chamar a IA", async () => {
  let chamou = false;
  const r = await testarChave("abc123", () => ({ perguntar: async () => (chamou = true) }));
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /AIza/);
  assert.equal(chamou, false);
});

test("testarChave: escolhe o modelo pelo provedor e diz qual vai usar", async () => {
  const usados = [];
  const ligar = (chave, modelo) => ({ perguntar: async () => usados.push(modelo) });
  const g = await testarChave("  AIzaXYZ ", ligar);
  assert.deepEqual([g.ok, g.modelo], [true, "gemini-3.8-flash"]);
  assert.match(g.mensagem, /Gemini 3.8 Flash/);
  const a = await testarChave("sk-ant-xyz", ligar);
  assert.equal(a.modelo, "claude-sonnet-5-5");
  assert.deepEqual(usados, ["gemini-3.8-flash", "claude-sonnet-5-5"]);
});

test("testarChave: devolve a mensagem de erro da IA (ex.: chave inválida)", async () => {
  const r = await testarChave("AIzaMA", () => ({ perguntar: async () => { throw new ErroAnalise("Chave da Google inválida.", { fatal: true }); } }));
  assert.equal(r.ok, false);
  assert.equal(r.mensagem, "Chave da Google inválida.");
});
