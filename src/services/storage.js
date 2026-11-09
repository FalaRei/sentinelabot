// Tudo fica no browser do cliente. Nunca falha: em modo privado, guarda só em memória.

const memoria = new Map();
const PREFIXO = "sentinela:";

export function ler(chave, padrao) {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v == null ? (memoria.has(chave) ? memoria.get(chave) : padrao) : JSON.parse(v);
  } catch {
    return memoria.has(chave) ? memoria.get(chave) : padrao;
  }
}

export function gravar(chave, valor) {
  memoria.set(chave, valor);
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: fica em memória */
  }
}

export function apagar(chave) {
  memoria.delete(chave);
  try {
    localStorage.removeItem(PREFIXO + chave);
  } catch {
    /* ignorar */
  }
}
