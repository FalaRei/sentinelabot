import { test } from "node:test";
import assert from "node:assert/strict";
import { probabilidades, contagens, sequencias, probSequencia, sessao, falaBacBo } from "../src/core/bacbo.js";

test("probabilidades exatas de uma ronda de Bac Bo", () => {
  const p = probabilidades();
  assert.equal(p.casos.empate, 146);
  assert.equal(p.casos.azul, 575);
  assert.equal(p.azul, p.vermelho);
  assert.ok(Math.abs(p.azul + p.vermelho + p.empate - 1) < 1e-12);
  assert.equal(Math.round(p.azul * 1000) / 10, 44.4);
  assert.equal(Math.round(p.empate * 1000) / 10, 11.3);
});

test("contagens e sequências (empates não cortam a sequência)", () => {
  const r = ["azul", "azul", "empate", "azul", "vermelho", "vermelho"];
  assert.deepEqual(contagens(r), { azul: 3, vermelho: 2, empate: 1, total: 6 });
  const s = sequencias(r);
  assert.deepEqual(s.atual, { cor: "vermelho", n: 2 });
  assert.deepEqual(s.maior, { cor: "azul", n: 3 });
  assert.deepEqual(sequencias([]).atual, { cor: null, n: 0 });
});

test("sequências longas são normais: com 50 rondas, 5 iguais seguidas é quase certo", () => {
  assert.equal(probSequencia(1, 10), 1);
  assert.equal(probSequencia(2, 2), 0.5);
  assert.ok(probSequencia(5, 50) > 0.75);
  assert.ok(probSequencia(10, 50) < 0.05);
});

test("sessão: resultado e travão no limite de perda", () => {
  assert.deepEqual(sessao({ saldoInicial: 50, saldoAgora: 45, limitePerda: 20 }), { resultado: -5, travar: false, perto: false });
  assert.equal(sessao({ saldoInicial: 50, saldoAgora: 34, limitePerda: 20 }).perto, true);
  assert.equal(sessao({ saldoInicial: 50, saldoAgora: 30, limitePerda: 20 }).travar, true);
  assert.equal(sessao({ saldoInicial: NaN, saldoAgora: 30, limitePerda: 20 }).resultado, null);
  assert.equal(sessao({ saldoInicial: null, saldoAgora: null, limitePerda: 20 }).resultado, null); // campos vazios
});

test("a voz só fala em sequências longas e diz a verdade", () => {
  assert.equal(falaBacBo(["azul", "azul", "azul"]), null);
  assert.match(falaBacBo(["vermelho", "vermelho", "empate", "vermelho", "vermelho"]), /4 vermelhos seguidos.*não se lembram/);
});
