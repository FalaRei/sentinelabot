// Animações da página de vendas: entrada do hero, revelação ao fazer scroll, contadores.
// Tudo respeita "reduzir movimento" e a página fica completa mesmo que o JS falhe.

const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
const raiz = document.documentElement;

export function marcarPronto() {
  raiz.classList.add("anim-pronta");
}

/** Elementos que entram ao aparecer no ecrã, com um pequeno atraso em cascata por grupo. */
const GRUPOS = [
  ".secao .sobretitulo, .secao h2, .secao > .largura > .lead",
  ".falha",
  ".cartao-ind",
  ".sim-controlos > *, .sim-figura",
  ".barras-figura",
  ".patente",
  ".conquista",
  ".teste",
  ".tabela-wrap",
  ".plano, .vagas, .garantia",
  "#faq details",
  ".final h2, .final .botoes",
  ".faixa-in > *",
  ".compativel",
  ".prop-passos li, .prop-cartao",
];

function prepararRevelacoes() {
  for (const seletor of GRUPOS) {
    document.querySelectorAll(seletor).forEach((el, i) => {
      el.classList.add("revelar");
      el.style.setProperty("--atraso", `${Math.min(i, 8) * 70}ms`);
    });
  }
  const obs = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("visivel");
        obs.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );
  const pendentes = new Set(document.querySelectorAll(".revelar"));
  pendentes.forEach((el) => obs.observe(el));
  // Reserva: se o IntersectionObserver atrasar (separador em segundo plano, browsers antigos),
  // verifica também no scroll, para nenhum bloco ficar escondido.
  let agendado = false;
  const verificar = () => {
    agendado = false;
    const limite = innerHeight * 0.95;
    for (const el of pendentes) {
      const r = el.getBoundingClientRect();
      if (r.top < limite && r.bottom > 0) {
        el.classList.add("visivel");
        pendentes.delete(el);
        obs.unobserve(el);
      }
    }
    if (!pendentes.size) removeEventListener("scroll", aoScroll);
  };
  const aoScroll = () => {
    if (!agendado) {
      agendado = true;
      requestAnimationFrame(verificar);
    }
  };
  addEventListener("scroll", aoScroll, { passive: true });
  addEventListener("resize", aoScroll, { passive: true });
  verificar();
  setTimeout(verificar, 400);
}

/** Conta um número de 0 até ao valor (ex.: "74–89%"). */
function contar(el, duracao = 1200) {
  const original = el.textContent;
  const partes = original.match(/\d+/g);
  if (!partes) return;
  const alvo = partes.map(Number);
  const inicio = performance.now();
  (function passo(t) {
    const p = Math.min(1, (t - inicio) / duracao);
    const suave = 1 - Math.pow(1 - p, 3);
    let i = 0;
    el.textContent = original.replace(/\d+/g, () => Math.round(alvo[i++] * suave));
    if (p < 1) requestAnimationFrame(passo);
    else el.textContent = original;
  })(inicio);
}

function quandoVisivel(el, fn, threshold = 0.35) {
  if (!el) return;
  const o = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) {
      o.disconnect();
      fn();
    }
  }, { threshold });
  o.observe(el);
}

export function iniciarAnimacoes() {
  // Com "reduzir movimento" as revelações continuam, só que apenas com opacidade (ver o CSS).
  prepararRevelacoes();
  quandoVisivel(document.querySelector(".numero-heroi"), () => contar(document.querySelector(".numero-heroi")));
  // o simulador traça as linhas e as barras crescem só na primeira vez que aparecem
  quandoVisivel(document.getElementById("sim-grafico"), () => {
    const g = document.getElementById("sim-grafico");
    g.classList.add("desenhar");
    setTimeout(() => g.classList.remove("desenhar"), 2200);
  }, 0.25);
  quandoVisivel(document.getElementById("seq-grafico"), () => {
    const g = document.getElementById("seq-grafico");
    g.classList.add("crescer");
    setTimeout(() => g.classList.remove("crescer"), 1600);
  }, 0.3);
  // patentes acendem em sequência até à atual
  quandoVisivel(document.getElementById("patentes"), () => document.getElementById("patentes").classList.add("acender"), 0.4);
  marcarPronto();
}

export const movimentoReduzido = reduz;
