// Ligação ao servidor de teste (npm run teste). Se existir, a app não pede licença nem chave:
// o servidor tem as chaves e o código de acesso vem no link (?codigo=...).

import { ErroAnalise } from "./erros.js";

// Caminho relativo à página da app (…/app/): funciona tanto na raiz do domínio como debaixo de
// falarei.online/apps/sentinelabot/, onde a plataforma reencaminha os pedidos para este projeto.
export const urlApi = (nome, pagina = globalThis.location?.href) => (pagina ? new URL(`../api/${nome}`, pagina).href : `/api/${nome}`);

/** Procura o servidor de teste no mesmo endereço do site. Devolve null se não houver (site normal). */
export async function detetarServidor({ fetchFn = globalThis.fetch, ms = 1500 } = {}) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetchFn(urlApi("estado"), { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return null;
    const dados = await r.json();
    return dados?.ativo ? { ia: String(dados.ia ?? "IA"), voz: !!dados.voz } : null;
  } catch {
    return null;
  }
}

async function chamar(caminho, codigo, corpo, { signal, fetchFn = globalThis.fetch, binario = false } = {}) {
  let r;
  try {
    r = await fetchFn(caminho, { method: "POST", headers: { "Content-Type": "application/json", "x-codigo": codigo }, body: JSON.stringify(corpo), signal });
  } catch (e) {
    if (e?.name === "AbortError") throw new ErroAnalise("Pedido cancelado.");
    throw new ErroAnalise("Perdi a ligação ao servidor de teste.");
  }
  if (!r.ok) {
    const dados = await r.json().catch(() => ({}));
    throw new ErroAnalise(dados.erro || `O servidor respondeu com erro ${r.status}.`, { fatal: !!dados.fatal });
  }
  return binario ? r.blob() : r.json();
}

export function ligarServidor(codigo, info, { fetchFn } = {}) {
  return {
    provedor: "servidor",
    modelo: info.ia,
    analisar: async ({ config, imagemBase64, analiseAnterior, modo, sinalAberto, signal }) => {
      const { analise } = await chamar(urlApi("analisar"), codigo, { config, imagemBase64, analiseAnterior, modo, sinalAberto }, { signal, fetchFn });
      return { analise, custo: 0 };
    },
    perguntar: async ({ config, mensagens, aoReceber, signal }) => {
      const { texto } = await chamar(urlApi("perguntar"), codigo, { config, mensagens }, { signal, fetchFn });
      aoReceber?.(texto, texto);
      return { texto, custo: 0 };
    },
    voz: (texto) => chamar(urlApi("voz"), codigo, { texto }, { fetchFn, binario: true }),
  };
}
