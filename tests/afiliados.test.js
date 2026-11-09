import { test } from "node:test";
import assert from "node:assert/strict";
import { lerCodigo, comAfiliado } from "../src/landing/afiliados.js";

test("lê só códigos válidos", () => {
  assert.equal(lerCodigo("?ref=JoaoTrader"), "joaotrader");
  assert.equal(lerCodigo("?x=1&ref=ana_fx-2"), "ana_fx-2");
  assert.equal(lerCodigo("?ref=<script>"), null);
  assert.equal(lerCodigo("?ref="), null);
  assert.equal(lerCodigo(""), null);
});

test("junta o código ao link de pagamento", () => {
  assert.equal(comAfiliado("https://loja.com/buy/abc", "ana"), "https://loja.com/buy/abc?aff=ana");
  assert.equal(comAfiliado("https://loja.com/buy/abc?x=1", "ana", "a"), "https://loja.com/buy/abc?x=1&a=ana");
  assert.equal(comAfiliado("https://loja.com/buy/abc", null), "https://loja.com/buy/abc");
  assert.equal(comAfiliado("", "ana"), "");
  assert.equal(comAfiliado("#preco", "ana"), "#preco");
});
