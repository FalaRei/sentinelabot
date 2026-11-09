// Holofote: escurece o ecrã à volta do próximo botão, com uma seta a apontar e 2 ou 3 palavras.
// Desaparece quando a pessoa clica em qualquer sítio.

let atual = null;

export function limparHolofote() {
  if (!atual) return;
  cancelAnimationFrame(atual.raf);
  document.removeEventListener("pointerdown", atual.aoClicar, true);
  atual.camada.remove();
  atual.balao.remove();
  atual = null;
}

export function holofote(alvo, texto) {
  limparHolofote();
  if (!alvo || !alvo.isConnected) return;
  alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  const camada = document.createElement("div");
  camada.className = "holofote";
  const balao = document.createElement("div");
  balao.className = "holofote-balao";
  const seta = document.createElement("span");
  seta.className = "holofote-seta";
  seta.setAttribute("aria-hidden", "true");
  const rotulo = document.createElement("b");
  rotulo.textContent = texto;
  balao.append(seta, rotulo);
  document.body.append(camada, balao);

  const posicionar = () => {
    const r = alvo.getBoundingClientRect();
    const m = 6;
    Object.assign(camada.style, { left: `${r.left - m}px`, top: `${r.top - m}px`, width: `${r.width + m * 2}px`, height: `${r.height + m * 2}px` });
    // à esquerda do botão se houver espaço (computador); senão por cima (telemóvel)
    const aEsquerda = r.left > 240;
    balao.classList.toggle("esquerda", aEsquerda);
    balao.classList.toggle("cima", !aEsquerda);
    const b = balao.getBoundingClientRect();
    if (aEsquerda) Object.assign(balao.style, { left: `${r.left - b.width - 18}px`, top: `${r.top + r.height / 2 - b.height / 2}px` });
    else Object.assign(balao.style, { left: `${Math.max(8, Math.min(innerWidth - b.width - 8, r.left + r.width / 2 - b.width / 2))}px`, top: `${r.top - b.height - 16}px` });
    atual.raf = requestAnimationFrame(posicionar);
  };
  const aoClicar = () => limparHolofote();
  atual = { camada, balao, aoClicar, raf: 0 };
  document.addEventListener("pointerdown", aoClicar, true);
  posicionar();
}
