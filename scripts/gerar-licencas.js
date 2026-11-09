// Gera chaves de licença para vender. Uso: npm run licencas -- 50
// Guarda o ficheiro gerado em sítio seguro e entrega uma chave por cliente.
import { writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { gerarChave, validarChave } from "../src/core/license.js";

const quantidade = Math.max(1, Number(process.argv[2]) || 10);
const aleatorio = () => randomInt(0, 2 ** 32) / 2 ** 32; // aleatoriedade criptográfica
const chaves = new Set();
while (chaves.size < quantidade) chaves.add(gerarChave(aleatorio));
for (const k of chaves) if (!validarChave(k)) throw new Error(`Chave inválida gerada: ${k}`);

const ficheiro = `licencas-${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}.txt`;
writeFileSync(ficheiro, [...chaves].join("\n") + "\n");
console.log(`${quantidade} chaves gravadas em ${ficheiro}`);
