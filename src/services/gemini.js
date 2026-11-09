// Chamada à API da Google (Gemini), pela Interactions API documentada em aistudio.google.com/docs.
// Tal como na Anthropic, a chave do cliente vai diretamente do browser para a Google.
// store: false pede à Google para não guardar a conversa do lado deles.

import { SCHEMA_ANALISE, construirSistema, construirMensagemUtilizador, validarAnalise, custoChamada } from "../core/analysis.js";
import { ErroAnalise } from "./erros.js";

const URL_API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const REVISAO_API = "2026-05-20";

/** Texto da resposta. A API devolve output_text; por segurança aceita também a lista de outputs. */
export function textoDaInteracao(r) {
  if (typeof r?.output_text === "string") return r.output_text;
  const saidas = r?.outputs ?? r?.output ?? [];
  return saidas
    .flatMap((o) => (o?.type === "text" ? [o.text] : (o?.content ?? []).filter((c) => c?.type === "text").map((c) => c.text)))
    .filter((t) => typeof t === "string")
    .join("");
}

/** Tokens de entrada e saída, normalizados para custoChamada. */
export function usoDaInteracao(r) {
  const u = r?.usage ?? r?.usage_metadata ?? {};
  return {
    entrada: u.total_input_tokens ?? u.input_tokens ?? u.prompt_token_count ?? 0,
    saida: u.total_output_tokens ?? u.output_tokens ?? u.candidates_token_count ?? 0,
  };
}

/** Converte as mensagens no formato da Anthropic (usadas pelo chat) para a lista de input da Gemini. */
export function paraInputGemini(mensagens) {
  const itens = [];
  for (const m of mensagens) {
    const blocos = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    for (const b of blocos) {
      if (b.type === "image") itens.push({ type: "image", data: b.source.data, mime_type: b.source.media_type });
      else if (b.type === "text") itens.push({ type: "text", text: `${m.role === "user" ? "Trader" : "Sentinela"}: ${b.text}` });
    }
  }
  return itens;
}

async function pedir({ chave, corpo, signal, fetchFn = globalThis.fetch }) {
  let resposta;
  try {
    resposta = await fetchFn(URL_API, {
      method: "POST",
      headers: { "x-goog-api-key": chave, "Content-Type": "application/json", "Api-Revision": REVISAO_API },
      body: JSON.stringify({ store: false, ...corpo }),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new ErroAnalise("Análise cancelada.");
    throw new ErroAnalise("Sem ligação à internet ou à API da Google.");
  }
  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    dados = null;
  }
  if (!resposta.ok) {
    const msg = String(dados?.error?.message ?? "");
    if (resposta.status === 401 || resposta.status === 403 || /api key not valid|API_KEY_INVALID/i.test(msg)) {
      throw new ErroAnalise("Chave da Google inválida ou sem acesso a este modelo. Verifica-a nas Definições.", { fatal: true });
    }
    if (resposta.status === 429) throw new ErroAnalise("Limite de pedidos da Google atingido. Espera um pouco ou ativa a faturação no Google AI Studio.");
    if (resposta.status >= 500) throw new ErroAnalise("A API da Google está com problemas. Tento outra vez na próxima vela.");
    throw new ErroAnalise(`Pedido recusado pela Google: ${msg.slice(0, 160) || `erro ${resposta.status}`}`);
  }
  return dados;
}

export async function analisarEcraGemini({ chave, modelo, config, imagemBase64, mediaType = "image/jpeg", analiseAnterior, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    signal,
    fetchFn,
    corpo: {
      model: modelo,
      system_instruction: construirSistema(config),
      input: [
        { type: "image", data: imagemBase64, mime_type: mediaType },
        { type: "text", text: construirMensagemUtilizador(analiseAnterior) },
      ],
      response_format: { type: "text", mime_type: "application/json", schema: SCHEMA_ANALISE },
      generation_config: { max_output_tokens: 4000 },
    },
  });
  const usage = usoDaInteracao(dados);
  const analise = validarAnalise(textoDaInteracao(dados));
  if (!analise) throw new ErroAnalise("Resposta da IA ilegível. Tento outra vez na próxima vela.");
  return { analise, usage, custo: custoChamada(usage, modelo) };
}

/** Chat com a Gemini. A resposta chega de uma vez; a app escreve-a com efeito de escrita. */
export async function perguntarGemini({ chave, modelo, sistema, mensagens, aoReceber, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    signal,
    fetchFn,
    corpo: { model: modelo, system_instruction: sistema, input: paraInputGemini(mensagens), generation_config: { max_output_tokens: 1500 } },
  });
  const texto = textoDaInteracao(dados).trim();
  if (!texto) throw new ErroAnalise("A IA não respondeu a esta pergunta. Reformula-a sobre o gráfico ou o teu plano.");
  aoReceber?.(texto, texto);
  const usage = usoDaInteracao(dados);
  return { texto, usage, custo: custoChamada(usage, modelo) };
}
