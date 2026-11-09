// DeepSeek (API compatível com a da OpenAI: /chat/completions). Usado pelo servidor de teste:
// a chave fica no servidor. Nota legal: os dados vão para servidores na China. Serve para testes
// privados; para vender na UE, usar Google, Anthropic ou OpenAI (ver marketing/GUIA-DE-VENDA.md).

import { SCHEMA_ANALISE, construirSistema, construirMensagemUtilizador, validarAnalise } from "../core/analysis.js";
import { ErroAnalise } from "./erros.js";

const URL_API = "https://api.deepseek.com/chat/completions";

/** O modo JSON da DeepSeek não aceita um schema: descrevemos o formato no próprio prompt. */
export const FORMATO_JSON = `Responde APENAS com um objeto JSON válido, sem texto antes ou depois, com exatamente estes campos:
${JSON.stringify(SCHEMA_ANALISE.properties, (k, v) => (k === "description" ? undefined : v))}
Campos obrigatórios: ${SCHEMA_ANALISE.required.join(", ")}.
Se um valor não estiver visível (ativo, timeframe, preço), usa uma string vazia "" em vez de o descrever. Nos níveis, "preco" é só o número lido no eixo; se não houver eixo legível, não incluas o nível.`;

/** Mensagens no formato da Anthropic (usadas pelo chat) -> formato chat/completions. */
export function paraMensagensDeepSeek(mensagens) {
  return mensagens.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    if (m.role === "assistant") return { role: "assistant", content: m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") };
    return {
      role: "user",
      content: m.content.map((b) =>
        b.type === "image" ? { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } } : { type: "text", text: b.text }
      ),
    };
  });
}

export const usoDeepSeek = (r) => ({ entrada: r?.usage?.prompt_tokens ?? 0, saida: r?.usage?.completion_tokens ?? 0 });

async function pedir({ chave, corpo, signal, fetchFn = globalThis.fetch }) {
  let resposta;
  try {
    resposta = await fetchFn(URL_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") throw new ErroAnalise("Pedido cancelado.");
    throw new ErroAnalise("Sem ligação à DeepSeek.");
  }
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const msg = String(dados?.error?.message ?? "");
    if (resposta.status === 401) throw new ErroAnalise("Chave da DeepSeek inválida.", { fatal: true });
    if (resposta.status === 402) throw new ErroAnalise("A conta da DeepSeek ficou sem saldo.", { fatal: true });
    if (resposta.status === 429) throw new ErroAnalise("Muitos pedidos ao mesmo tempo. Tento na próxima vela.");
    if (resposta.status >= 500) throw new ErroAnalise("A DeepSeek está com problemas. Tento na próxima vela.");
    throw new ErroAnalise(`Pedido recusado pela DeepSeek: ${msg.slice(0, 160) || `erro ${resposta.status}`}`);
  }
  return dados;
}

const textoDe = (dados) => String(dados?.choices?.[0]?.message?.content ?? "");

/** Tira o JSON mesmo que venha dentro de ```json ... ``` ou com texto à volta. */
export function extrairJSON(texto) {
  const t = String(texto ?? "");
  const ini = t.indexOf("{");
  const fim = t.lastIndexOf("}");
  return ini >= 0 && fim > ini ? t.slice(ini, fim + 1) : t;
}

export async function analisarEcraDeepSeek({ chave, modelo, config, imagemBase64, mediaType = "image/jpeg", analiseAnterior, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    signal,
    fetchFn,
    corpo: {
      model: modelo,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${construirSistema(config)}\n\n${FORMATO_JSON}` },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mediaType};base64,${imagemBase64}` } },
            { type: "text", text: `${construirMensagemUtilizador(analiseAnterior)} Responde em json.` },
          ],
        },
      ],
    },
  });
  const analise = validarAnalise(extrairJSON(textoDe(dados)));
  if (!analise) throw new ErroAnalise("Resposta da IA ilegível. Tento na próxima vela.");
  return { analise, usage: usoDeepSeek(dados) };
}

export async function perguntarDeepSeek({ chave, modelo, sistema, mensagens, aoReceber, signal, fetchFn }) {
  const dados = await pedir({
    chave,
    signal,
    fetchFn,
    corpo: { model: modelo, max_tokens: 2000, messages: [{ role: "system", content: sistema }, ...paraMensagensDeepSeek(mensagens)] },
  });
  const texto = textoDe(dados).trim();
  if (!texto) throw new ErroAnalise("A IA não respondeu. Reformula a pergunta.");
  aoReceber?.(texto, texto);
  return { texto, usage: usoDeepSeek(dados) };
}
