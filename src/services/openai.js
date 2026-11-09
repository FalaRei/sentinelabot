// OpenAI (Responses API + voz). Usado pelo servidor de teste: a chave fica no servidor, nunca no browser.

import { SCHEMA_ANALISE, construirSistema, construirMensagemUtilizador, validarAnalise, custoChamada } from "../core/analysis.js";
import { ErroAnalise } from "./erros.js";

const URL_RESPOSTAS = "https://api.openai.com/v1/responses";
const URL_VOZ = "https://api.openai.com/v1/audio/speech";

/** Texto da resposta: output_text quando existe; senão junta os blocos output_text da lista output. */
export function textoDaResposta(r) {
  if (typeof r?.output_text === "string") return r.output_text;
  return (r?.output ?? [])
    .flatMap((o) => (o?.type === "message" ? o.content ?? [] : []))
    .filter((c) => c?.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

export const usoDaResposta = (r) => ({ entrada: r?.usage?.input_tokens ?? 0, saida: r?.usage?.output_tokens ?? 0 });

/** Mensagens no formato da Anthropic (usadas pelo chat) -> input da Responses API. */
export function paraInputOpenAI(mensagens) {
  return mensagens.map((m) => {
    const blocos = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "assistant") return { role: "assistant", content: blocos.filter((b) => b.type === "text").map((b) => b.text).join("\n") };
    return {
      role: "user",
      content: blocos.map((b) =>
        b.type === "image" ? { type: "input_image", image_url: `data:${b.source.media_type};base64,${b.source.data}` } : { type: "input_text", text: b.text }
      ),
    };
  });
}

async function pedir({ chave, url, corpo, signal, fetchFn = globalThis.fetch, binario = false }) {
  let resposta;
  try {
    resposta = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new ErroAnalise("Pedido cancelado.");
    throw new ErroAnalise("Sem ligação à OpenAI.");
  }
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => null);
    const msg = String(dados?.error?.message ?? "");
    if (resposta.status === 401 || resposta.status === 403) throw new ErroAnalise("Chave da OpenAI inválida ou sem acesso a este modelo.", { fatal: true });
    if (resposta.status === 429) throw new ErroAnalise(/quota|billing/i.test(msg) ? "A conta da OpenAI ficou sem saldo." : "Muitos pedidos à OpenAI. Tento na próxima vela.", { fatal: /quota|billing/i.test(msg) });
    if (resposta.status >= 500) throw new ErroAnalise("A OpenAI está com problemas. Tento na próxima vela.");
    throw new ErroAnalise(`Pedido recusado pela OpenAI: ${msg.slice(0, 160) || `erro ${resposta.status}`}`);
  }
  return binario ? resposta.arrayBuffer() : resposta.json();
}

export async function analisarEcraOpenAI({ chave, modelo, config, imagemBase64, mediaType = "image/jpeg", analiseAnterior, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    url: URL_RESPOSTAS,
    signal,
    fetchFn,
    corpo: {
      model: modelo,
      instructions: construirSistema(config),
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: `data:${mediaType};base64,${imagemBase64}` },
            { type: "input_text", text: construirMensagemUtilizador(analiseAnterior) },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "analise_grafico", schema: SCHEMA_ANALISE, strict: true } },
      max_output_tokens: 4000,
      store: false,
    },
  });
  const usage = usoDaResposta(dados);
  const analise = validarAnalise(textoDaResposta(dados));
  if (!analise) throw new ErroAnalise("Resposta da IA ilegível. Tento na próxima vela.");
  return { analise, usage, custo: custoChamada(usage, modelo) };
}

export async function perguntarOpenAI({ chave, modelo, sistema, mensagens, aoReceber, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    url: URL_RESPOSTAS,
    signal,
    fetchFn,
    corpo: { model: modelo, instructions: sistema, input: paraInputOpenAI(mensagens), max_output_tokens: 1500, store: false },
  });
  const texto = textoDaResposta(dados).trim();
  if (!texto) throw new ErroAnalise("A IA não respondeu. Reformula a pergunta.");
  aoReceber?.(texto, texto);
  const usage = usoDaResposta(dados);
  return { texto, usage, custo: custoChamada(usage, modelo) };
}

/** Voz natural (MP3). instructions dá o tom: calmo, português de Portugal, como um mentor. */
export async function vozOpenAI({ chave, texto, voz = "cedar", signal, fetchFn }) {
  return pedir({
    chave,
    url: URL_VOZ,
    signal,
    fetchFn,
    binario: true,
    corpo: {
      model: "gpt-4o-mini-tts",
      voice: voz,
      input: String(texto).slice(0, 800),
      instructions: "Fala em português de Portugal, com calma e confiança, como um mentor de trading ao lado do aluno. Frases curtas, sem pressa.",
      response_format: "mp3",
    },
  });
}
