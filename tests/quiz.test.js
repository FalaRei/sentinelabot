import { test } from "node:test";
import assert from "node:assert/strict";
import { PERGUNTAS, avaliarTeste } from "../src/landing/quiz.js";

const escolher = (perfil) => PERGUNTAS.map((q) => Math.max(0, q.opcoes.findIndex((o) => o.perfil === perfil)));

test("todas as perguntas têm 4 opções válidas", () => {
  for (const q of PERGUNTAS) {
    assert.equal(q.opcoes.length, 4);
    for (const o of q.opcoes) assert.ok(o.disciplina >= 0 && o.disciplina <= 100);
  }
});

test("respostas disciplinadas dão Calculista e pontuação alta", () => {
  const r = avaliarTeste(escolher("calculista"));
  assert.equal(r.perfil.id, "calculista");
  assert.ok(r.pontuacao >= 90);
});

test("respostas de risco dão o perfil certo e pontuação baixa", () => {
  const r = avaliarTeste(escolher("heroi"));
  assert.equal(r.perfil.id, "heroi");
  assert.ok(r.pontuacao < 40);
  assert.equal(avaliarTeste([0, 0, 0, 1, 3, 3]).perfil.id, "vinganca");
});

test("respostas inválidas são ignoradas", () => {
  assert.equal(avaliarTeste([]).pontuacao, 0);
  assert.equal(avaliarTeste([9, 9]).pontuacao, 0);
});
