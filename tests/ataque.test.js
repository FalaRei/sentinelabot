import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPreco, validarSinal, avaliarSinal, placar, falaDoSinal, construirSistemaAtaque } from "../src/core/ataque.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";

test("lê preços em vários formatos", () => {
  assert.equal(lerPreco("1.0950"), 1.095);
  assert.equal(lerPreco("65,432.10"), 65432.1);
  assert.equal(lerPreco("65.432,10"), 65432.1);
  assert.equal(lerPreco("1 234,5"), 1234.5);
  assert.equal(lerPreco("1,0950"), 1.095);
  assert.equal(lerPreco("65,432"), 65432);
  assert.equal(lerPreco(""), null);
  assert.equal(lerPreco("não visível"), null);
});

test("sinal coerente fica; incoerente passa a esperar", () => {
  const ok = validarSinal({ direcao: "compra", confianca: 58.6, entrada: "100", stop: "98", alvo: "104", velas: 4, razoes: ["fundos mais altos"], noticias: [] });
  assert.equal(ok.direcao, "compra");
  assert.equal(ok.confianca, 59);
  assert.equal(ok.rr, 2);
  const mau = validarSinal({ direcao: "venda", confianca: 70, entrada: "100", stop: "98", alvo: "95" }); // stop do lado errado
  assert.equal(mau.direcao, "esperar");
  assert.equal(validarSinal({ direcao: "compra", confianca: 80, entrada: "", stop: "", alvo: "" }).direcao, "esperar");
  assert.equal(validarSinal(null), null);
});

test("o sinal é seguido até ao alvo, ao stop ou a expirar", () => {
  const t0 = 1_000_000;
  const s = { ...validarSinal({ direcao: "compra", confianca: 55, entrada: "100", stop: "98", alvo: "104", velas: 2 }), criadoEm: t0 };
  assert.equal(avaliarSinal(s, 101, t0 + 60_000).resultado, undefined);
  assert.equal(avaliarSinal(s, 104.2, t0 + 60_000).resultado, "acerto");
  assert.equal(avaliarSinal(s, 97.9, t0 + 60_000).resultado, "erro");
  assert.equal(avaliarSinal(s, null, t0 + 2 * 2 * 5 * 60_000).resultado, "expirado");
  const v = { ...validarSinal({ direcao: "venda", confianca: 55, entrada: "100", stop: "102", alvo: "96", velas: 3 }), criadoEm: t0 };
  assert.equal(avaliarSinal(v, 95.5, t0).resultado, "acerto");
});

test("placar conta só sinais decididos e a voz diz sempre o stop", () => {
  const p = placar([{ direcao: "compra", resultado: "acerto" }, { direcao: "venda", resultado: "erro" }, { direcao: "compra", resultado: "expirado" }, { direcao: "compra" }]);
  assert.deepEqual(p, { acertos: 1, erros: 1, expirados: 1, abertos: 1, taxa: 50 });
  assert.match(falaDoSinal(validarSinal({ direcao: "compra", confianca: 60, entrada: "100", stop: "98", alvo: "104" })), /stop 98/);
  assert.equal(falaDoSinal({ direcao: "esperar" }), null);
});

test("o prompt do Modo Ataque mantém o contexto do trader e pede honestidade", () => {
  const s = construirSistemaAtaque({ ...CONFIG_PADRAO, regrasPessoais: "- Só a favor da tendência" });
  assert.match(s, /MODO ATAQUE/);
  assert.match(s, /Esperar é uma resposta válida/);
  assert.match(s, /Nunca escrevas que é garantido/);
  assert.match(s, /Só a favor da tendência/);
  assert.match(s, /Contexto do trader/);
  assert.doesNotMatch(s, /Limites que nunca quebras/);
});
