// Chaves de licença no formato SENT-XXXX-XXXX-XXXX-CCCC (CCCC = verificação).
// Verificação offline: trava partilhas casuais. Para controlo forte (revogar chaves,
// limitar dispositivos) usar a API de licenças da plataforma de venda.

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I para evitar confusões
const SAL = "sentinela-v1"; // mudar isto invalida todas as chaves antigas

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function verificacao(corpo) {
  let h = fnv1a(`${SAL}|${corpo}`);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALFABETO[h % ALFABETO.length];
    h = Math.floor(h / ALFABETO.length) ^ fnv1a(out + corpo);
    h >>>= 0;
  }
  return out;
}

export function gerarChave(aleatorio = Math.random) {
  let corpo = "";
  for (let i = 0; i < 12; i++) corpo += ALFABETO[Math.floor(aleatorio() * ALFABETO.length)];
  const blocos = corpo.match(/.{4}/g);
  return `SENT-${blocos.join("-")}-${verificacao(corpo)}`;
}

export function validarChave(chave) {
  const limpa = String(chave ?? "").trim().toUpperCase();
  const m = limpa.match(/^SENT-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/);
  if (!m) return false;
  const corpo = m[1] + m[2] + m[3];
  if ([...corpo].some((c) => !ALFABETO.includes(c))) return false;
  return verificacao(corpo) === m[4];
}
