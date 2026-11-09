// Ponto único de entrada para a IA: escolhe Anthropic ou Google pelo modelo.
// O resto da app não precisa de saber qual está a ser usada.

import { MODELOS, provedorDaChave, modeloParaChave } from "../core/analysis.js";
import { criarCliente, analisarEcra as analisarClaude, perguntarCopiloto as perguntarClaude } from "./claude.js";
import { analisarEcraGemini, perguntarGemini } from "./gemini.js";

/** Cria a ligação para uma chave e um modelo. */
export function ligarIA(chave, modelo) {
  const provedor = MODELOS[modelo]?.provedor ?? "anthropic";
  const cliente = provedor === "anthropic" ? criarCliente(chave) : null;
  return {
    provedor,
    modelo,
    analisar: (p) => (provedor === "google" ? analisarEcraGemini({ ...p, chave, modelo }) : analisarClaude({ ...p, cliente, modelo })),
    perguntar: (p) => (provedor === "google" ? perguntarGemini({ ...p, chave, modelo }) : perguntarClaude({ ...p, cliente, modelo })),
  };
}

/**
 * Confirma que uma chave funciona com um pedido mínimo (custa uma fração de cêntimo).
 * @returns {Promise<{ok: boolean, mensagem: string, modelo?: string}>}
 */
export async function testarChave(chave, ligar = ligarIA) {
  chave = String(chave ?? "").trim();
  const provedor = provedorDaChave(chave);
  if (!provedor) return { ok: false, mensagem: "Esta chave não parece da Google (começa por AIza) nem da Anthropic (começa por sk-ant-). Copia-a outra vez, completa." };
  const modelo = modeloParaChave(chave);
  try {
    await ligar(chave, modelo).perguntar({ sistema: "Responde apenas: OK", mensagens: [{ role: "user", content: "Teste de ligação." }] });
    return { ok: true, modelo, mensagem: `Funciona. O Sentinela vai usar ${MODELOS[modelo].nome.split(" (")[0]}.` };
  } catch (e) {
    return { ok: false, modelo, mensagem: e?.message || "Não foi possível ligar à IA." };
  }
}
