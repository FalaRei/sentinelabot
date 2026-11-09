// Voz: usa as vozes do sistema (grátis). No Edge há vozes neurais "Natural" muito melhores
// do que as normais; escolhemo-las primeiro, de preferência em português de Portugal.

let voz = null;

/** Pontuação de uma voz: natural > normal; pt-PT > pt-BR > outro português. */
export function pontuarVoz(v) {
  if (!v?.lang?.toLowerCase().startsWith("pt")) return -1;
  const natural = /natural|online|neural/i.test(v.name) ? 10 : 0;
  const lingua = v.lang === "pt-PT" ? 3 : v.lang === "pt-BR" ? 2 : 1;
  return natural + lingua;
}

export function melhorVoz(vozes) {
  return [...vozes].filter((v) => pontuarVoz(v) >= 0).sort((a, b) => pontuarVoz(b) - pontuarVoz(a))[0] ?? null;
}

function escolherVoz() {
  voz = melhorVoz(window.speechSynthesis?.getVoices() ?? []);
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  escolherVoz();
  window.speechSynthesis.addEventListener?.("voiceschanged", escolherVoz);
}

export const vozDisponivel = () => typeof window !== "undefined" && "speechSynthesis" in window;
export const nomeVoz = () => voz?.name ?? "voz padrão do sistema";
/** true quando a voz em uso é uma das neurais (soa natural). */
export const vozNatural = () => !!voz && pontuarVoz(voz) >= 10;

// Voz externa (ex.: voz natural do servidor de teste). Se falhar, volta à voz do sistema sem avisar.
let externa = null;
let fila = Promise.resolve();
let audioAtual = null;
let geracao = 0;
export function usarVozExterna(gerarAudio) {
  externa = gerarAudio;
}
function falarExterna(texto, urgente) {
  if (urgente) {
    geracao++;
    audioAtual?.pause();
    fila = Promise.resolve();
  }
  const minha = geracao;
  const pedido = externa(texto); // pede já, para a próxima frase estar pronta quando a anterior acabar
  pedido.catch(() => {}); // o erro é tratado quando chegar a vez desta frase
  fila = fila.then(async () => {
    if (minha !== geracao) return;
    try {
      const url = URL.createObjectURL(await pedido);
      if (minha !== geracao) return URL.revokeObjectURL(url);
      audioAtual = new Audio(url);
      await new Promise((ok) => {
        audioAtual.onended = audioAtual.onerror = ok;
        audioAtual.play().catch(ok);
      });
      URL.revokeObjectURL(url);
    } catch {
      externa = null;
      falarSistema(texto, urgente);
    }
  });
}

/** @param {boolean} urgente interrompe o que está a ser dito */
export function falar(texto, { urgente = false, velocidade = 1.05 } = {}) {
  if (!texto) return;
  if (externa) return falarExterna(texto, urgente);
  falarSistema(texto, urgente, velocidade);
}

function falarSistema(texto, urgente, velocidade = 1.05) {
  if (!vozDisponivel()) return;
  if (urgente) window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = voz?.lang ?? "pt-PT";
  if (voz) u.voice = voz;
  u.rate = velocidade;
  window.speechSynthesis.speak(u);
}

export function calar() {
  geracao++;
  audioAtual?.pause();
  if (vozDisponivel()) window.speechSynthesis.cancel();
}
