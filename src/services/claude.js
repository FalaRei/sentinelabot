// Chamada à API da Anthropic. A chave do cliente vai diretamente do browser para a
// Anthropic: nunca passa por um servidor nosso.

import Anthropic from "@anthropic-ai/sdk";
import { ErroAnalise } from "./erros.js";
import { SCHEMA_ANALISE, construirSistema, construirMensagemUtilizador, validarAnalise, custoChamada } from "../core/analysis.js";

export { ErroAnalise };

export function criarCliente(apiKey) {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });
}

export async function analisarEcra({ cliente, modelo, config, imagemBase64, mediaType = "image/jpeg", analiseAnterior, signal }) {
  let resposta;
  try {
    resposta = await cliente.beta.messages.create(
      {
        model: modelo,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA_ANALISE } },
        system: construirSistema(config),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imagemBase64 } },
              { type: "text", text: construirMensagemUtilizador(analiseAnterior) },
            ],
          },
        ],
      },
      { signal }
    );
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) throw new ErroAnalise("Análise cancelada.");
    if (e instanceof Anthropic.AuthenticationError) throw new ErroAnalise("Chave da API inválida. Verifica-a nas Definições.", { fatal: true });
    if (e instanceof Anthropic.PermissionDeniedError) throw new ErroAnalise("A tua chave não tem permissão para este modelo.", { fatal: true });
    if (e instanceof Anthropic.RateLimitError) throw new ErroAnalise("Limite de pedidos atingido. Aumenta o intervalo entre análises.");
    if (e instanceof Anthropic.BadRequestError) {
      const msg = String(e.message || "");
      if (/credit|billing|balance/i.test(msg)) throw new ErroAnalise("Sem crédito na conta da Anthropic. Carrega saldo em console.anthropic.com.", { fatal: true });
      throw new ErroAnalise(`Pedido recusado pela API: ${msg.slice(0, 160)}`);
    }
    if (e instanceof Anthropic.InternalServerError) throw new ErroAnalise("A API está com problemas. Tento outra vez na próxima análise.");
    if (e instanceof Anthropic.APIConnectionError) throw new ErroAnalise("Sem ligação à internet ou à API.");
    throw new ErroAnalise(`Erro inesperado: ${String(e?.message || e).slice(0, 160)}`);
  }

  const custo = custoChamada(resposta.usage, modelo);
  if (resposta.stop_reason === "refusal") {
    throw new ErroAnalise("A IA recusou analisar esta captura. Mostra apenas o gráfico no ecrã partilhado.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new ErroAnalise("A resposta ficou incompleta. Tento outra vez na próxima análise.");
  }

  const texto = resposta.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const analise = validarAnalise(texto);
  if (!analise) throw new ErroAnalise("Resposta da IA ilegível. Tento outra vez na próxima análise.");
  return { analise, usage: resposta.usage, custo };
}

/**
 * Pergunta ao copiloto com resposta em streaming (o texto aparece à medida que chega).
 * @param {(delta: string, total: string) => void} aoReceber
 */
export async function perguntarCopiloto({ cliente, modelo, sistema, mensagens, aoReceber, signal }) {
  try {
    const stream = cliente.beta.messages.stream(
      {
        model: modelo,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: sistema,
        messages: mensagens,
      },
      { signal }
    );
    stream.on("text", (delta, total) => aoReceber?.(delta, total));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new ErroAnalise("A IA não respondeu a esta pergunta. Reformula-a sobre o gráfico ou o teu plano.");
    const texto = final.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { texto, custo: custoChamada(final.usage, modelo), usage: final.usage };
  } catch (e) {
    if (e instanceof ErroAnalise) throw e;
    if (e instanceof Anthropic.APIUserAbortError) throw new ErroAnalise("Pergunta cancelada.");
    if (e instanceof Anthropic.AuthenticationError) throw new ErroAnalise("Chave da API inválida. Verifica-a nas Definições.", { fatal: true });
    if (e instanceof Anthropic.RateLimitError) throw new ErroAnalise("Limite de pedidos atingido. Espera uns segundos.");
    if (e instanceof Anthropic.APIConnectionError) throw new ErroAnalise("Sem ligação à internet ou à API.");
    if (e instanceof Anthropic.APIError) throw new ErroAnalise(`A API devolveu um erro: ${String(e.message).slice(0, 140)}`);
    throw new ErroAnalise(`Erro inesperado: ${String(e?.message || e).slice(0, 140)}`);
  }
}
