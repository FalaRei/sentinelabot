// Afiliados: guarda o código ?ref= de quem trouxe o visitante e passa-o para o link de pagamento.

const CODIGO_VALIDO = /^[a-z0-9_-]{2,32}$/i;

export function lerCodigo(search) {
  const ref = new URLSearchParams(search).get("ref");
  return ref && CODIGO_VALIDO.test(ref) ? ref.toLowerCase() : null;
}

/** Junta o código ao link de pagamento sem estragar parâmetros que já existam. */
export function comAfiliado(link, codigo, parametro = "aff") {
  if (!link || !codigo || !CODIGO_VALIDO.test(codigo)) return link;
  try {
    const url = new URL(link);
    url.searchParams.set(parametro, codigo);
    return url.toString();
  } catch {
    return link;
  }
}
