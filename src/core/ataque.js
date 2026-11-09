// Modo Ataque: só no teste privado (link com código). A IA dá uma direção com entrada, stop e alvo,
// diz a confiança e o porquê, e cada sinal é seguido até tocar no alvo ou no stop, para o placar
// mostrar com honestidade quantas vezes acertou. Não entra no produto vendido: dar sinais de compra e
// venda a clientes é aconselhamento financeiro e precisa de licença da CMVM.

import { construirSistema } from "./analysis.js";

export const DIRECOES = ["compra", "venda", "esperar"];

export const SCHEMA_SINAL = {
  type: "object",
  additionalProperties: false,
  required: ["direcao", "confianca", "entrada", "stop", "alvo", "velas", "razoes", "noticias"],
  properties: {
    direcao: { type: "string", enum: DIRECOES },
    confianca: { type: "integer", minimum: 0, maximum: 100 },
    entrada: { type: "string" },
    stop: { type: "string" },
    alvo: { type: "string" },
    velas: { type: "integer", minimum: 1, maximum: 50 },
    razoes: { type: "array", items: { type: "string" } },
    noticias: { type: "array", items: { type: "string" } },
  },
};

export function construirSistemaAtaque(config, sinalAberto = null) {
  // Troca só o bloco de limites do prompt normal pelas regras do Modo Ataque; o contexto e as regras do trader ficam.
  return construirSistema(config).replace(/Limites que nunca quebras:[\s\S]*?(?=Estilo da "fala")/, `${regrasAtaque(sinalAberto)}\n\n`);
}

function regrasAtaque(sinalAberto) {
  return `MODO ATAQUE (teste privado, o trader pediu sinais diretos e sabe que pode perder):
- Além da leitura, dás um SINAL: "compra", "venda" ou "esperar".
- Só dás compra ou venda quando a estrutura visível o justifica. Se não houver vantagem clara, o sinal é "esperar". Esperar é uma resposta válida e frequente.
- Todo o sinal de compra ou venda tem preço de entrada, stop e alvo lidos no eixo do gráfico, com o alvo a pelo menos 1,5 vezes a distância do stop. Sem eixo legível, o sinal é "esperar".
- "confianca" de 0 a 100 é a tua estimativa honesta de que o alvo é atingido antes do stop. Raramente passa de 65. Nunca escrevas que é garantido.
- "velas": quantas velas do gráfico esperas até ao alvo.
- "razoes": 2 a 4 razões curtas e verificáveis no gráfico.
- "noticias": se tiveres pesquisa na web, até 3 notícias recentes que afetem este ativo, cada uma com a data; senão, lista vazia.
- Inclui "preco_atual": o último preço que lês no eixo, só o número, ou "" se não conseguires ler.
${sinalAberto ? `Sinal ainda aberto: ${sinalAberto.direcao} a ${sinalAberto.entrada}, stop ${sinalAberto.stop}, alvo ${sinalAberto.alvo}. Não dês um sinal novo contrário sem razão forte; se mantiveres, repete-o.` : ""}
- Se o ecrã não mostrar um gráfico, diz isso e não inventes. Se não conseguires ler um valor, não o inventes.
- A "fala" começa pelo sinal (ex: "Compra, confiança 58%.").`;
}

/** "1.0950", "65,432.10", "65.432,10", "1 234,5" -> número. Devolve null se não for um preço. */
export function lerPreco(texto) {
  let t = String(texto ?? "").trim().replace(/[\s ]/g, "").replace(/[^\d.,-]/g, "");
  if (!t || !/\d/.test(t)) return null;
  const ultimo = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  if (t.includes(".") && t.includes(",")) {
    t = t.slice(0, ultimo).replace(/[.,]/g, "") + "." + t.slice(ultimo + 1);
  } else if (t.includes(",")) {
    // só vírgulas: decimal se houver uma e não forem exatamente 3 dígitos depois (milhares)
    const partes = t.split(",");
    t = partes.length === 2 && partes[1].length !== 3 ? partes.join(".") : partes.join("");
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normaliza o sinal vindo da IA. Um sinal de compra/venda sem níveis coerentes passa a "esperar". */
export function validarSinal(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const direcao = DIRECOES.includes(bruto.direcao) ? bruto.direcao : "esperar";
  const lista = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 4) : []);
  const s = {
    direcao,
    confianca: Math.max(0, Math.min(100, Math.round(Number(bruto.confianca) || 0))),
    entrada: lerPreco(bruto.entrada),
    stop: lerPreco(bruto.stop),
    alvo: lerPreco(bruto.alvo),
    velas: Math.max(1, Math.min(50, Math.round(Number(bruto.velas) || 3))),
    razoes: lista(bruto.razoes),
    noticias: lista(bruto.noticias).slice(0, 3),
  };
  if (direcao === "esperar") return { ...s, entrada: null, stop: null, alvo: null };
  const { entrada: e, stop: st, alvo: a } = s;
  const coerente = e && st && a && (direcao === "compra" ? st < e && a > e : st > e && a < e);
  if (!coerente) return { ...s, direcao: "esperar", entrada: null, stop: null, alvo: null, razoes: [...s.razoes, "Níveis incoerentes: sinal anulado."].slice(0, 4) };
  return { ...s, rr: Math.round((Math.abs(a - e) / Math.abs(e - st)) * 10) / 10 };
}

/**
 * Segue um sinal aberto com o preço atual: "acerto" (tocou no alvo), "erro" (tocou no stop),
 * "expirado" (passou o tempo previsto mais uma margem) ou "aberto".
 */
export function avaliarSinal(sinal, preco, agora = Date.now(), timeframeMin = 5) {
  if (!sinal || sinal.direcao === "esperar" || sinal.resultado) return sinal;
  if (preco != null) {
    const subiu = (n) => preco >= n;
    const desceu = (n) => preco <= n;
    if (sinal.direcao === "compra" ? subiu(sinal.alvo) : desceu(sinal.alvo)) return { ...sinal, resultado: "acerto", fechadoEm: agora, precoFecho: preco };
    if (sinal.direcao === "compra" ? desceu(sinal.stop) : subiu(sinal.stop)) return { ...sinal, resultado: "erro", fechadoEm: agora, precoFecho: preco };
  }
  const limite = (sinal.criadoEm ?? agora) + sinal.velas * 2 * timeframeMin * 60_000;
  if (agora >= limite) return { ...sinal, resultado: "expirado", fechadoEm: agora, precoFecho: preco };
  return sinal;
}

/** Placar: só conta sinais fechados. */
export function placar(sinais) {
  const fechados = sinais.filter((s) => s.resultado);
  const acertos = fechados.filter((s) => s.resultado === "acerto").length;
  const erros = fechados.filter((s) => s.resultado === "erro").length;
  const decididos = acertos + erros;
  return { acertos, erros, expirados: fechados.length - decididos, abertos: sinais.filter((s) => !s.resultado && s.direcao !== "esperar").length, taxa: decididos ? Math.round((acertos / decididos) * 100) : null };
}

/** O que dizer em voz alta: só quando aparece um sinal novo, e sempre com o stop. */
export function falaDoSinal(s) {
  if (!s || s.direcao === "esperar") return null;
  return `${s.direcao === "compra" ? "Sinal de compra" : "Sinal de venda"}, confiança ${s.confianca} por cento. Entrada ${s.entrada}, stop ${s.stop}, alvo ${s.alvo}.`;
}
