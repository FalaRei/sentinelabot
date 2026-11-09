// fal.ai: visão (OpenRouter -> Gemini) e voz (ElevenLabs v3). Só corre no servidor: a chave nunca vai
// para o browser. Endpoints documentados em fal.ai/models/openrouter/router/vision e
// fal.ai/models/fal-ai/elevenlabs/tts/eleven-v3.

import { construirSistema, construirMensagemUtilizador, validarAnalise } from "../core/analysis.js";
import { FORMATO_JSON, extrairJSON } from "./deepseek.js";
import { ErroAnalise } from "./erros.js";

const URL_VISAO = "https://fal.run/openrouter/router/vision";
const URL_VOZ = "https://fal.run/fal-ai/elevenlabs/tts/eleven-v3";
export const MODELO_FAL = "google/gemini-3.8-flash";

async function pedir({ chave, url, corpo, signal, fetchFn = globalThis.fetch }) {
  let resposta;
  try {
    resposta = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Key ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new ErroAnalise("Pedido cancelado.");
    throw new ErroAnalise("Sem ligação à IA.");
  }
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhe = typeof dados?.detail === "string" ? dados.detail : JSON.stringify(dados?.detail ?? "");
    if (resposta.status === 401 || resposta.status === 403) throw new ErroAnalise("Chave da fal inválida.", { fatal: true });
    if (resposta.status === 402 || /balance|credit|billing/i.test(detalhe)) throw new ErroAnalise("A conta da fal ficou sem saldo.", { fatal: true });
    if (resposta.status === 429) throw new ErroAnalise("Muitos pedidos ao mesmo tempo. Tento na próxima vela.");
    if (resposta.status >= 500) throw new ErroAnalise("A IA está com problemas. Tento na próxima vela.");
    throw new ErroAnalise(`Pedido recusado pela IA: ${detalhe.slice(0, 160) || `erro ${resposta.status}`}`);
  }
  return dados;
}

export const usoFal = (d) => ({ entrada: d?.usage?.prompt_tokens ?? 0, saida: d?.usage?.completion_tokens ?? 0, custoUSD: d?.usage?.cost ?? 0 });

export async function analisarEcraFal({ chave, modelo = MODELO_FAL, config, imagemBase64, mediaType = "image/jpeg", analiseAnterior, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    url: URL_VISAO,
    signal,
    fetchFn,
    corpo: {
      model: modelo,
      image_urls: [`data:${mediaType};base64,${imagemBase64}`],
      system_prompt: `${construirSistema(config)}\n\n${FORMATO_JSON}`,
      prompt: `${construirMensagemUtilizador(analiseAnterior)} Responde só com o JSON.`,
      reasoning: true, // obrigatório neste endpoint para este modelo
      max_tokens: 3000,
    },
  });
  const analise = validarAnalise(extrairJSON(dados?.output));
  if (!analise) throw new ErroAnalise("Resposta da IA ilegível. Tento na próxima vela.");
  return { analise, usage: usoFal(dados) };
}

/** Chat: o endpoint de visão aceita texto sem imagem; a última captura vai junto, se houver. */
export async function perguntarFal({ chave, modelo = MODELO_FAL, sistema, mensagens, aoReceber, signal, fetchFn }) {
  const imagens = [];
  const linhas = [];
  for (const m of mensagens) {
    const blocos = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    for (const b of blocos) {
      if (b.type === "image") imagens.splice(0, imagens.length, `data:${b.source.media_type};base64,${b.source.data}`);
      else if (b.type === "text") linhas.push(`${m.role === "user" ? "Trader" : "Sentinela"}: ${b.text}`);
    }
  }
  const dados = await pedir({
    chave,
    url: URL_VISAO,
    signal,
    fetchFn,
    corpo: { model: modelo, image_urls: imagens, system_prompt: sistema, prompt: `${linhas.join("\n\n")}\n\nResponde ao último pedido do Trader.`, reasoning: true, max_tokens: 2000 },
  });
  const texto = String(dados?.output ?? "").trim();
  if (!texto) throw new ErroAnalise("A IA não respondeu. Reformula a pergunta.");
  aoReceber?.(texto, texto);
  return { texto, usage: usoFal(dados) };
}

/** Voz natural: devolve os bytes do MP3 (o servidor serve-os ao browser, por isso não precisa de mudar a CSP). */
export async function vozFal({ chave, texto, voz = "George", signal, fetchFn = globalThis.fetch }) {
  const dados = await pedir({ chave, url: URL_VOZ, signal, fetchFn, corpo: { text: String(texto).slice(0, 800), voice: voz, language_code: "pt" } });
  const url = dados?.audio?.url;
  if (!url || !/^https:\/\/[a-z0-9.-]*fal\.media\//.test(url)) throw new ErroAnalise("A voz não respondeu.");
  const audio = await fetchFn(url, { signal });
  if (!audio.ok) throw new ErroAnalise("A voz não respondeu.");
  return audio.arrayBuffer();
}
