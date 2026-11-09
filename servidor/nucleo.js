// Núcleo do servidor de teste: usado pelo servidor local (scripts/servidor-teste.js) e pelas funções
// da Vercel (api/[acao].js). As chaves vêm das variáveis de ambiente e nunca saem daqui.
//
// IA escolhida pelas chaves disponíveis: FAL_KEY (Gemini + voz ElevenLabs) > DEEPSEEK_API_KEY > OPENAI_API_KEY.
// Proteções: código de acesso (CODIGO_TESTE), tamanhos limitados e limites por pessoa e por dia.
// Nota: na Vercel cada instância tem a sua memória, por isso os limites são aproximados. Chega para testes.

import { CONFIG_PADRAO } from "../src/core/rules.js";
import { construirSistemaChat } from "../src/core/chat.js";
import { analisarEcraFal, perguntarFal, vozFal, MODELO_FAL } from "../src/services/fal.js";
import { analisarEcraDeepSeek, perguntarDeepSeek } from "../src/services/deepseek.js";
import { analisarEcraOpenAI, perguntarOpenAI, vozOpenAI } from "../src/services/openai.js";
import { ErroAnalise } from "../src/services/erros.js";

export function escolherIA(env = process.env) {
  if (env.FAL_KEY) return { nome: "Gemini", chave: env.FAL_KEY, modelo: MODELO_FAL, analisar: analisarEcraFal, perguntar: perguntarFal };
  if (env.DEEPSEEK_API_KEY) return { nome: "DeepSeek", chave: env.DEEPSEEK_API_KEY, modelo: "deepseek-flash", analisar: analisarEcraDeepSeek, perguntar: perguntarDeepSeek };
  if (env.OPENAI_API_KEY) return { nome: "OpenAI", chave: env.OPENAI_API_KEY, modelo: "gpt-6.1-terra", analisar: analisarEcraOpenAI, perguntar: perguntarOpenAI };
  return null;
}

export function escolherVoz(env = process.env) {
  if (env.FAL_KEY) return (texto) => vozFal({ chave: env.FAL_KEY, texto });
  if (env.VOZ_OPENAI === "1" && env.OPENAI_API_KEY) return (texto) => vozOpenAI({ chave: env.OPENAI_API_KEY, texto });
  return null;
}

// ---------- limites ----------
const LIMITE_DIA = { analisar: 1500, perguntar: 500, voz: 1500 };
const INTERVALO_MIN_MS = { analisar: 6000, perguntar: 2500, voz: 500 };
const contagem = { dia: "", analisar: 0, perguntar: 0, voz: 0 };
const ultimoPedido = new Map();
export function podePedir(ip, tipo, agora = Date.now(), env = process.env) {
  const hoje = new Date(agora).toDateString();
  if (contagem.dia !== hoje) Object.assign(contagem, { dia: hoje, analisar: 0, perguntar: 0, voz: 0 });
  const limite = Number(env[`LIMITE_${tipo.toUpperCase()}`]) || LIMITE_DIA[tipo];
  if (contagem[tipo] >= limite) return "Chegámos ao limite de teste de hoje. Volta amanhã!";
  const chave = `${ip}|${tipo}`;
  if (agora - (ultimoPedido.get(chave) ?? 0) < INTERVALO_MIN_MS[tipo]) return "Calma, um pedido de cada vez.";
  ultimoPedido.set(chave, agora);
  if (ultimoPedido.size > 5000) ultimoPedido.clear();
  contagem[tipo]++;
  return null;
}

// ---------- validação ----------
const txt = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
export function configSegura(c = {}) {
  const out = { ...CONFIG_PADRAO };
  for (const [k, padrao] of Object.entries(CONFIG_PADRAO)) {
    const v = c?.[k];
    if (typeof padrao === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof padrao === "string" && typeof v === "string") out[k] = v.slice(0, k === "regrasPessoais" ? 1500 : 200);
  }
  return out;
}
const sinalSeguro = (x) => (x && typeof x === "object" && ["compra", "venda"].includes(x.direcao) ? { direcao: x.direcao, entrada: Number(x.entrada) || null, stop: Number(x.stop) || null, alvo: Number(x.alvo) || null } : null);
const analiseAnteriorSegura = (a) => (a && typeof a === "object" ? { tendencia: txt(a.tendencia, 20), fala: txt(a.fala, 300) } : null);
export function mensagensSeguras(lista) {
  if (!Array.isArray(lista)) return [];
  let imagens = 0;
  return lista.slice(-12).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content:
      typeof m?.content === "string"
        ? m.content.slice(0, 4000)
        : (Array.isArray(m?.content) ? m.content : [])
            .filter((b) => b?.type === "text" || (b?.type === "image" && imagens++ < 1 && typeof b?.source?.data === "string" && b.source.data.length < 4_000_000))
            .map((b) => (b.type === "text" ? { type: "text", text: txt(b.text, 4000) } : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.source.data } })),
  }));
}

/**
 * Trata um pedido à API. Devolve { status, json } ou { status, audio, tipoConteudo }.
 * @param {{acao:string, metodo:string, codigo?:string, ip?:string, corpo?:any, env?:Record<string,string>}} p
 */
export async function tratarPedido({ acao, metodo, codigo, ip = "?", corpo = {}, env = process.env }) {
  const ia = escolherIA(env);
  const voz = escolherVoz(env);
  if (acao === "estado") return { status: 200, json: { ativo: !!ia, ia: ia?.nome ?? null, voz: !!voz } };
  if (!ia) return { status: 503, json: { erro: "O servidor de teste não tem nenhuma chave de IA configurada.", fatal: true } };
  if (metodo !== "POST") return { status: 405, json: { erro: "Método não permitido." } };
  if (!env.CODIGO_TESTE || codigo !== env.CODIGO_TESTE) return { status: 403, json: { erro: "Link de teste inválido. Pede o link certo a quem te convidou.", fatal: true } };
  if (!["analisar", "perguntar", "voz"].includes(acao)) return { status: 404, json: { erro: "Não encontrado." } };
  const bloqueio = podePedir(ip, acao, Date.now(), env);
  if (bloqueio) return { status: 429, json: { erro: bloqueio } };
  try {
    if (acao === "analisar") {
      if (typeof corpo?.imagemBase64 !== "string" || !corpo.imagemBase64 || corpo.imagemBase64.length > 4_000_000) return { status: 400, json: { erro: "Imagem em falta ou demasiado grande." } };
      const r = await ia.analisar({ chave: ia.chave, modelo: ia.modelo, config: configSegura(corpo.config), imagemBase64: corpo.imagemBase64, mediaType: "image/jpeg", analiseAnterior: analiseAnteriorSegura(corpo.analiseAnterior), modo: corpo.modo === "ataque" ? "ataque" : "disciplina", sinalAberto: sinalSeguro(corpo.sinalAberto) });
      return { status: 200, json: { analise: r.analise }, uso: r.usage };
    }
    if (acao === "perguntar") {
      const r = await ia.perguntar({ chave: ia.chave, modelo: ia.modelo, sistema: construirSistemaChat(configSegura(corpo?.config)), mensagens: mensagensSeguras(corpo?.mensagens) });
      return { status: 200, json: { texto: r.texto }, uso: r.usage };
    }
    if (!voz) return { status: 503, json: { erro: "Voz natural indisponível." } };
    const audio = await voz(txt(corpo?.texto, 800));
    return { status: 200, audio: Buffer.from(audio), tipoConteudo: "audio/mpeg" };
  } catch (e) {
    if (!(e instanceof ErroAnalise)) console.error(e);
    return { status: e?.fatal ? 503 : 502, json: { erro: e instanceof ErroAnalise ? e.message : "Erro inesperado no servidor de teste.", fatal: !!e?.fatal } };
  }
}
