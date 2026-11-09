import { createChart, CandlestickSeries, LineStyle, CrosshairMode } from "lightweight-charts";
import { gerarHistorico, avancar, rsi, prng, RESISTENCIA, SUPORTE } from "../core/market-sim.js";
import { simularTraders } from "../core/montecarlo.js";
import { NIVEIS, CONQUISTAS } from "../core/gamification.js";
import { ANALISES_DEMO } from "../core/demo.js";
import { PERGUNTAS, avaliarTeste } from "./quiz.js";
import { VENDA, APOIO } from "../config.js";
import { lerCodigo, comAfiliado } from "./afiliados.js";
import { iniciarAnimacoes } from "./animacoes.js";

// Cores lidas dos tokens CSS, para os gráficos seguirem o tema claro/escuro.
const tokens = () => {
  const c = getComputedStyle(document.documentElement);
  const v = (n) => c.getPropertyValue(n).trim();
  return { sobe: v("--sobe"), desce: v("--desce"), serie: v("--serie"), tinta3: v("--tinta-3"), linha: v("--linha"), grelha: v("--grelha") };
};
let COR = tokens();
const $ = (id) => document.getElementById(id);
const eur = (v) => `${Math.round(v).toLocaleString("pt-PT")} €`;
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, texto) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (texto != null) el.textContent = texto;
  return el;
}

// ======================= venda: preços, vagas, afiliados, apoio =======================
let codigoAfiliado = lerCodigo(location.search);
try {
  if (codigoAfiliado) localStorage.setItem("sentinela:ref", codigoAfiliado);
  else codigoAfiliado = localStorage.getItem("sentinela:ref");
} catch {
  /* sem armazenamento: o código vale só para esta visita */
}
document.querySelectorAll("[data-checkout]").forEach((a) => {
  const link = VENDA.checkout[a.dataset.checkout];
  a.href = link ? comAfiliado(link, codigoAfiliado, VENDA.parametroAfiliado) : "#preco";
});
$("ano").textContent = new Date().getFullYear();
const vendidas = Math.min(VENDA.vagasVendidas, VENDA.vagasFundador);
const fundadorAberto = vendidas < VENDA.vagasFundador;
$("vagas-restantes").textContent = VENDA.vagasFundador - vendidas;
$("vagas-total").textContent = VENDA.vagasFundador;
$("preco-normal-txt").textContent = `${VENDA.precoNormal} €`;
$("preco-normal").textContent = `${VENDA.precoNormal} €`;
$("preco-fundador").textContent = `${fundadorAberto ? VENDA.precoFundador : VENDA.precoNormal} €`;
if (!fundadorAberto) {
  $("preco-normal").hidden = true;
  document.querySelector(".plano-destaque .plano-selo").textContent = "Mais escolhido";
}
requestAnimationFrame(() => ($("vagas-barra").style.width = `${(vendidas / VENDA.vagasFundador) * 100}%`));
if (VENDA.contacto) {
  const a = Object.assign(document.createElement("a"), { href: `mailto:${VENDA.contacto}`, textContent: VENDA.contacto });
  $("contacto-rodape").append(" · ", a);
}

const OPCOES_APOIO = [
  { chave: "kofi", nome: "Ko-fi", nota: "cartão ou PayPal" },
  { chave: "buymeacoffee", nome: "Buy Me a Coffee", nota: "cartão" },
  { chave: "paypal", nome: "PayPal", nota: "escolhes o valor" },
  { chave: "stripe", nome: "cartão", nota: "escolhes o valor" },
];
const apoios = OPCOES_APOIO.filter((o) => APOIO[o.chave]);
if (apoios.length) {
  $("apoiar").hidden = false;
  $("apoiar-botoes").replaceChildren(
    ...apoios.map((o) => {
      const a = document.createElement("a");
      a.className = "btn btn-secundario btn-apoio";
      a.href = APOIO[o.chave];
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-cafe" /></svg>';
      a.append(`Apoiar com ${o.nome}`, Object.assign(document.createElement("small"), { textContent: o.nota }));
      return a;
    })
  );
}

async function enviarFormularioNetlify(form, mensagemOk) {
  const dados = new URLSearchParams(new FormData(form));
  try {
    const resp = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: dados.toString() });
    if (!resp.ok) throw new Error(String(resp.status));
    form.replaceChildren(Object.assign(document.createElement("p"), { className: "form-ok", textContent: mensagemOk }));
  } catch {
    const p = form.querySelector(".form-erro") ?? form.appendChild(Object.assign(document.createElement("p"), { className: "pequeno form-erro" }));
    p.textContent = "Não foi possível enviar agora. Tenta outra vez daqui a pouco.";
  }
}
document.querySelector(".form-espera").addEventListener("submit", (e) => {
  e.preventDefault();
  enviarFormularioNetlify(e.currentTarget, "Estás na lista. Avisamos-te no lançamento do Pro.");
});

// ======================= HERO: gráfico ao vivo + rádio do copiloto =======================
let vozLigada = false;
let vozPt = null;
const carregarVozes = () => {
  const v = speechSynthesis?.getVoices?.() ?? [];
  vozPt = v.find((x) => x.lang === "pt-PT") ?? v.find((x) => x.lang?.startsWith("pt")) ?? null;
};
if ("speechSynthesis" in window) {
  carregarVozes();
  speechSynthesis.addEventListener?.("voiceschanged", carregarVozes);
}
function dizer(texto, urgente = false) {
  if (!vozLigada || !("speechSynthesis" in window)) return;
  if (urgente) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = vozPt?.lang ?? "pt-PT";
  if (vozPt) u.voice = vozPt;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}
$("btn-ouvir").addEventListener("click", (e) => {
  vozLigada = !vozLigada;
  e.currentTarget.setAttribute("aria-pressed", String(vozLigada));
  e.currentTarget.querySelector("span").textContent = vozLigada ? "A ouvir" : "Ouvir";
  if (vozLigada) dizer("Olá. Sou o Sentinela. Vou estar atento ao teu gráfico e às tuas regras.", true);
  else speechSynthesis?.cancel();
});

const grafico = createChart($("hero-grafico"), {
  autoSize: true,
  layout: { background: { color: "transparent" }, textColor: COR.tinta3, fontFamily: "Geist Mono, ui-monospace, monospace", fontSize: 11 },
  grid: { vertLines: { color: COR.grelha }, horzLines: { color: COR.grelha } },
  rightPriceScale: { borderColor: COR.linha, scaleMargins: { top: 0.22, bottom: 0.08 } },
  timeScale: { borderColor: COR.linha, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 9 },
  crosshair: { mode: CrosshairMode.Normal, vertLine: { color: COR.tinta3, labelBackgroundColor: COR.tinta3 }, horzLine: { color: COR.tinta3, labelBackgroundColor: COR.tinta3 } },
  handleScroll: false,
  handleScale: false,
  localization: { locale: "pt-PT" },
});
const velasSerie = grafico.addSeries(CandlestickSeries, {
  upColor: COR.sobe, downColor: COR.desce, borderVisible: false, wickUpColor: COR.sobe, wickDownColor: COR.desce,
  priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
  priceLineVisible: false,
  // a escala inclui sempre a resistência e o suporte, para as linhas ficarem visíveis
  autoscaleInfoProvider: (original) => {
    const r = original();
    if (!r) return r;
    r.priceRange.maxValue = Math.max(r.priceRange.maxValue, RESISTENCIA + 0.0004);
    r.priceRange.minValue = Math.min(r.priceRange.minValue, SUPORTE - 0.0004);
    return r;
  },
});
const linhaRes = velasSerie.createPriceLine({ price: RESISTENCIA, color: COR.desce, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "resistência" });
const linhaSup = velasSerie.createPriceLine({ price: SUPORTE, color: COR.sobe, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "suporte" });
// quando o sistema muda entre claro e escuro, repinta o gráfico com os novos tokens
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  requestAnimationFrame(() => {
    COR = tokens();
    grafico.applyOptions({ layout: { textColor: COR.tinta3 }, grid: { vertLines: { color: COR.grelha }, horzLines: { color: COR.grelha } }, rightPriceScale: { borderColor: COR.linha }, timeScale: { borderColor: COR.linha } });
    velasSerie.applyOptions({ upColor: COR.sobe, downColor: COR.desce, wickUpColor: COR.sobe, wickDownColor: COR.desce });
    linhaRes.applyOptions({ color: COR.desce });
    linhaSup.applyOptions({ color: COR.sobe });
  });
});

// Guião da demo: o que o "trader" faz e o que o Sentinela responde, tick a tick.
const GUIAO = [
  { tick: 1, fala: ANALISES_DEMO[0].fala },
  { tick: 6, hud: { tipo: "aviso", titulo: "ZONA DE RECUO", texto: "Preço a 0,1% de uma resistência testada duas vezes. Entrar aqui é entrar colado a ela." } },
  { tick: 10, hud: { tipo: "critico", titulo: "SEM STOP LOSS", texto: "Posição de compra aberta sem stop. Define já onde estás errado." }, disciplina: 75 },
  { tick: 14, fala: "Stop definido abaixo de 1.0912. Risco de 0,8% da conta: dentro da tua regra.", disciplina: 75 },
  { tick: 17, fala: ANALISES_DEMO[1].fala },
  { tick: 21, fala: "Stop atingido. Perda de 8 euros, exatamente o que tinhas planeado perder.", perdas: 1 },
  { tick: 24, hud: { tipo: "aviso", titulo: "VINGANÇA?", texto: "Acabaste de perder há 2 minutos. Este trade está no teu plano ou é para recuperar?" } },
  { tick: 28, hud: { tipo: "critico", titulo: "PAUSA OBRIGATÓRIA", texto: "2 perdas seguidas. 15 minutos de pausa. Volta com a cabeça fria." }, perdas: 2, disciplina: 70 },
  { tick: 33, fala: ANALISES_DEMO[3].fala },
  { tick: 38, fala: "Resumo: seguiste o plano em 3 de 4 trades. Os trades no plano deram mais 14 euros do que os outros." },
];
const DURACAO = 42;

let mercado;
let tick = 0;
let hudTimer;
let animacaoVelas;
let aAnimarEntrada = false; // enquanto a entrada desenha as velas antigas, o "tempo real" espera
function reiniciarMercado(entrada = false) {
  const h = gerarHistorico({ semente: 42 + Math.floor(Math.random() * 1000), n: 44 });
  mercado = h.estado;
  clearInterval(animacaoVelas);
  if (entrada) {
    aAnimarEntrada = true;
    let n = 4;
    const escala = grafico.timeScale();
    escala.applyOptions({ barSpacing: 9 });
    velasSerie.setData(h.velas.slice(0, n));
    escala.scrollToRealTime();
    animacaoVelas = setInterval(() => {
      velasSerie.update(h.velas[n++]);
      if (n >= h.velas.length) {
        clearInterval(animacaoVelas);
        aAnimarEntrada = false;
        requestAnimationFrame(() => escala.fitContent());
      }
    }, 28);
  } else {
    aAnimarEntrada = false;
    velasSerie.setData(h.velas);
    grafico.timeScale().fitContent();
  }
  $("radio").replaceChildren();
  definirDisciplina(100);
  $("instr-perdas").textContent = "0";
  tick = 0;
  fechos = h.velas.map((v) => v.close);
}
let fechos = [];

function linhaRadio(texto) {
  const li = document.createElement("li");
  const t = document.createElement("time");
  t.textContent = new Date((mercado.time + 300) * 1000).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  li.append(t, document.createTextNode(texto));
  const lista = $("radio");
  lista.prepend(li);
  while (lista.children.length > 3) lista.lastChild.remove();
}

function mostrarHud({ tipo, titulo, texto }) {
  const hud = $("hud");
  const b = document.createElement("b");
  b.textContent = titulo;
  const span = document.createElement("span");
  span.append(b, texto);
  hud.className = `hud ${tipo === "aviso" ? "aviso" : ""}`;
  hud.replaceChildren(span);
  hud.hidden = false;
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => (hud.hidden = true), 5200);
}

function definirDisciplina(v) {
  $("gauge-num").textContent = v;
  const arco = $("gauge-arco");
  arco.setAttribute("stroke-dasharray", `${v} 100`);
  arco.style.stroke = v >= 80 ? "var(--sobe)" : v >= 60 ? "var(--aviso)" : "var(--desce)";
}

function passo() {
  if (aAnimarEntrada) return;
  const r = avancar(mercado);
  mercado = r.estado;
  velasSerie.update(r.vela);
  fechos.push(r.vela.close);
  const valorRsi = rsi(fechos);
  $("instr-rsi").textContent = valorRsi ?? "—";
  tick++;
  for (const ev of GUIAO.filter((g) => g.tick === tick)) {
    if (ev.fala) {
      linhaRadio(ev.fala);
      dizer(ev.fala);
    }
    if (ev.hud) {
      mostrarHud(ev.hud);
      linhaRadio(`${ev.hud.titulo.charAt(0)}${ev.hud.titulo.slice(1).toLowerCase()}: ${ev.hud.texto}`);
      dizer(ev.hud.texto, ev.hud.tipo === "critico");
    }
    if (ev.disciplina != null) definirDisciplina(ev.disciplina);
    if (ev.perdas != null) $("instr-perdas").textContent = ev.perdas;
  }
  if (tick >= DURACAO) reiniciarMercado();
}

reiniciarMercado(true);
setTimeout(passo, 1300); // a primeira fala chega quando o gráfico acaba de se desenhar
let intervalo = setInterval(passo, 1800);
document.addEventListener("visibilitychange", () => {
  clearInterval(intervalo);
  if (!document.hidden) intervalo = setInterval(passo, 1800);
});

// ======================= SIMULADOR: 50 traders =======================
let semente = 7;
function desenharSimulacao() {
  const risco = Number($("sim-risco").value);
  $("sim-risco-txt").textContent = `${risco.toLocaleString("pt-PT")}%`;
  const s = simularTraders({ riscoPct: risco, semente });
  const reb = $("sim-rebentaram");
  reb.textContent = `${s.percentRebentaram}%`;
  reb.className = `mono ${s.percentRebentaram >= 20 ? "mau" : s.percentRebentaram === 0 ? "bom" : ""}`;
  $("sim-mediana").textContent = eur(s.finalMediano * 1000);
  $("sim-pior").textContent = eur(s.piorFinal * 1000);

  const host = $("sim-grafico");
  const W = host.clientWidth || 700;
  const H = host.clientHeight || 380;
  const m = { t: 14, r: 92, b: 30, l: 62 };
  const n = s.mediana.length - 1;
  const todos = s.caminhos.flat();
  // Escala até ao percentil 90 (no máx. 3×): os raros caminhos acima saem pelo topo, recortados.
  const p90 = [...todos].sort((a, b) => a - b)[Math.floor(todos.length * 0.9)];
  const yMax = Math.min(3, Math.max(1.5, Math.ceil(p90 * 2) / 2));
  const x = (i) => m.l + (i / n) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - v / yMax) * (H - m.t - m.b);

  const raiz = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
  const passoY = yMax <= 2 ? 0.25 : yMax <= 3 ? 0.5 : 1;
  const eixo = svg("g", { class: "eixo" });
  for (let v = 0; v <= yMax + 1e-9; v += passoY) {
    eixo.append(svg("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grelha-linha" }));
    eixo.append(svg("text", { x: m.l - 10, y: y(v) + 4, "text-anchor": "end" }, eur(v * 1000)));
  }
  for (const i of [0, 25, 50, 75, 100]) eixo.append(svg("text", { x: x(i), y: H - 8, "text-anchor": "middle" }, i === 0 ? "trade 0" : i));
  raiz.append(eixo);
  // Linhas de referência com o rótulo à esquerda, por cima da linha (o lado direito é da mediana).
  for (const [v, nome] of [[0.5, "metade da conta"], [1, "saldo inicial"]]) {
    raiz.append(svg("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "ref-linha" }));
  }
  const corte = svg("clipPath", { id: "corte-sim" });
  corte.append(svg("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }));
  const defs = svg("defs");
  defs.append(corte);
  raiz.append(defs);

  const caminhoD = (c) => c.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const primeiraRuina = s.caminhos.map((c) => c.findIndex((v) => v < 0.5));
  const gCaminhos = svg("g", { "clip-path": "url(#corte-sim)" });
  // vivos por baixo, arruinados por cima, mediana no topo
  s.caminhos.forEach((c, k) => primeiraRuina[k] < 0 && gCaminhos.append(svg("path", { d: caminhoD(c), class: "caminho vivo", pathLength: 1 })));
  s.caminhos.forEach((c, k) => primeiraRuina[k] >= 0 && gCaminhos.append(svg("path", { d: caminhoD(c), class: "caminho ruina", pathLength: 1 })));
  gCaminhos.append(svg("path", { d: caminhoD(s.mediana), class: "caminho mediana", pathLength: 1 }));
  raiz.append(gCaminhos);
  for (const [v, nome] of [[0.5, "metade da conta"], [1, "saldo inicial"]]) raiz.append(svg("text", { x: m.l + 6, y: y(v) - 6, class: "rotulo rotulo-ref" }, nome));
  const fimY = y(s.finalMediano);
  raiz.append(svg("circle", { cx: x(n), cy: Math.max(m.t, Math.min(H - m.b, fimY)), r: 4, class: "ponto-mira" }));
  const etiqueta = svg("text", { x: W - m.r + 10, y: Math.max(m.t + 10, Math.min(H - m.b, fimY + 4)), class: "rotulo-mediana" });
  etiqueta.append(svg("tspan", { x: W - m.r + 10 }, eur(s.finalMediano * 1000)), svg("tspan", { x: W - m.r + 10, dy: 14, class: "rotulo" }, "mediano"));
  raiz.append(etiqueta);

  // camada de hover: mira + tooltip
  const mira = svg("line", { y1: m.t, y2: H - m.b, class: "mira", visibility: "hidden" });
  const ponto = svg("circle", { r: 5, class: "ponto-mira", visibility: "hidden" });
  raiz.append(mira, ponto);
  const alvo = svg("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" });
  raiz.append(alvo);
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.hidden = true;
  const mover = (ev) => {
    const caixa = raiz.getBoundingClientRect();
    const px = ((ev.clientX - caixa.left) / caixa.width) * W;
    const i = Math.max(0, Math.min(n, Math.round(((px - m.l) / (W - m.l - m.r)) * n)));
    const arruinados = primeiraRuina.filter((p) => p >= 0 && p <= i).length;
    mira.setAttribute("x1", x(i));
    mira.setAttribute("x2", x(i));
    ponto.setAttribute("cx", x(i));
    ponto.setAttribute("cy", y(s.mediana[i]));
    mira.setAttribute("visibility", "visible");
    ponto.setAttribute("visibility", "visible");
    tip.replaceChildren();
    const sm = document.createElement("small");
    sm.textContent = `depois de ${i} trades`;
    tip.append(sm, `Mediano: ${eur(s.mediana[i] * 1000)}`, document.createElement("br"), `Perderam metade: ${arruinados} de 50`);
    tip.hidden = false;
    const esquerda = (x(i) / W) * caixa.width;
    tip.style.left = `${Math.min(esquerda + 14, caixa.width - 190)}px`;
    tip.style.top = `${Math.max(0, (y(s.mediana[i]) / H) * caixa.height - 60)}px`;
  };
  alvo.addEventListener("pointermove", mover);
  alvo.addEventListener("pointerleave", () => {
    tip.hidden = true;
    mira.setAttribute("visibility", "hidden");
    ponto.setAttribute("visibility", "hidden");
  });
  host.replaceChildren(raiz, tip);
}
$("sim-risco").addEventListener("input", desenharSimulacao);
$("sim-nova").addEventListener("click", () => {
  semente = Math.floor(Math.random() * 1e6);
  desenharSimulacao();
});

// ======================= SEQUÊNCIAS DE PERDAS =======================
function probabilidadesSequencia({ execucoes = 5000, trades = 100, perda = 0.62, ks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] } = {}) {
  const aleatorio = prng(2026);
  const maximos = new Array(execucoes);
  for (let e = 0; e < execucoes; e++) {
    let seq = 0;
    let max = 0;
    for (let i = 0; i < trades; i++) {
      seq = aleatorio() < perda ? seq + 1 : 0;
      if (seq > max) max = seq;
    }
    maximos[e] = max;
  }
  return ks.map((k) => ({ k, p: maximos.filter((m) => m >= k).length / execucoes }));
}
const dadosSeq = probabilidadesSequencia();
function desenharSequencias() {
  const host = $("seq-grafico");
  const W = host.clientWidth || 560;
  const H = host.clientHeight || 290;
  const m = { t: 22, r: 8, b: 30, l: 44 };
  const banda = (W - m.l - m.r) / dadosSeq.length;
  const largura = Math.max(8, banda - 2 - Math.min(18, banda * 0.3));
  const y = (p) => m.t + (1 - p) * (H - m.t - m.b);
  const raiz = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none" });
  const eixo = svg("g", { class: "eixo" });
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    eixo.append(svg("line", { x1: m.l, x2: W - m.r, y1: y(p), y2: y(p), class: "grelha-linha" }));
    eixo.append(svg("text", { x: m.l - 8, y: y(p) + 4, "text-anchor": "end" }, `${p * 100}%`));
  }
  raiz.append(eixo);
  const tip = document.createElement("div");
  tip.className = "tooltip";
  tip.hidden = true;
  dadosSeq.forEach((d, i) => {
    const cx = m.l + banda * i + banda / 2;
    const topo = y(d.p);
    const altura = Math.max(1, H - m.b - topo);
    // ponta superior arredondada (4px), base reta encostada ao eixo
    const r = Math.min(4, altura, largura / 2);
    const x0 = cx - largura / 2;
    const x1 = cx + largura / 2;
    const base = H - m.b;
    const dPath = `M${x0},${base}V${topo + r}Q${x0},${topo} ${x0 + r},${topo}H${x1 - r}Q${x1},${topo} ${x1},${topo + r}V${base}Z`;
    const barra = svg("path", { d: dPath, class: `barra ${d.k === 7 ? "realce" : ""}`, style: `--i:${i}` });
    raiz.append(barra);
    raiz.append(svg("text", { x: cx, y: H - 10, "text-anchor": "middle", class: "rotulo" }, `${d.k}+`));
    if ([5, 7, 10].includes(d.k)) raiz.append(svg("text", { x: cx, y: topo - 7, "text-anchor": "middle", class: "valor-barra" }, `${Math.round(d.p * 100)}%`));
    const alvo = svg("rect", { x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: "transparent" });
    alvo.addEventListener("pointerenter", () => {
      barra.style.opacity = "0.8";
      const caixa = raiz.getBoundingClientRect();
      tip.replaceChildren();
      const sm = document.createElement("small");
      sm.textContent = `${d.k} ou mais perdas seguidas`;
      tip.append(sm, `${(d.p * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}% dos traders`);
      tip.hidden = false;
      tip.style.left = `${Math.min((cx / W) * caixa.width + 10, caixa.width - 200)}px`;
      tip.style.top = `${Math.max(0, (topo / H) * caixa.height - 54)}px`;
    });
    alvo.addEventListener("pointerleave", () => {
      barra.style.opacity = "";
      tip.hidden = true;
    });
    raiz.append(alvo);
  });
  host.replaceChildren(raiz, tip);
}
$("seq-tabela").replaceChildren(
  (() => {
    const tr = document.createElement("tr");
    for (const t of ["Perdas seguidas", "Probabilidade"]) {
      const th = document.createElement("th");
      th.textContent = t;
      tr.append(th);
    }
    return tr;
  })(),
  ...dadosSeq.map((d) => {
    const tr = document.createElement("tr");
    const a = document.createElement("td");
    a.textContent = `${d.k} ou mais`;
    const b = document.createElement("td");
    b.textContent = `${(d.p * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;
    tr.append(a, b);
    return tr;
  })
);

// ======================= PATENTES E CONQUISTAS =======================
const ATUAL_EXEMPLO = 2;
$("patentes").replaceChildren(
  ...NIVEIS.map((n, i) => {
    const li = document.createElement("li");
    li.className = `patente ${i < ATUAL_EXEMPLO ? "ganha" : ""} ${i === ATUAL_EXEMPLO ? "atual" : ""}`;
    const ins = document.createElement("div");
    ins.className = "insignia";
    ins.textContent = String(i + 1).padStart(2, "0");
    const b = document.createElement("b");
    b.textContent = n.nome;
    const s = document.createElement("span");
    s.textContent = `${n.xp.toLocaleString("pt-PT")} XP`;
    li.append(ins, b, s);
    return li;
  })
);
$("conquistas").replaceChildren(
  ...CONQUISTAS.map((c) => {
    const d = document.createElement("div");
    d.className = "conquista";
    const i = document.createElement("i");
    i.textContent = c.nome.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
    const t = document.createElement("span");
    const small = document.createElement("small");
    small.textContent = ` · ${c.desc}`;
    t.append(c.nome, small);
    d.append(i, t);
    return d;
  })
);

// ======================= TESTE =======================
let respostas = [];
function mostrarPergunta() {
  const corpo = $("teste-corpo");
  const i = respostas.length;
  if (i >= PERGUNTAS.length) return mostrarResultado();
  const q = PERGUNTAS[i];
  const prog = document.createElement("div");
  prog.className = "progresso-teste";
  PERGUNTAS.forEach((_, k) => {
    const b = document.createElement("i");
    if (k < i) b.className = "feito";
    prog.append(b);
  });
  const p = document.createElement("p");
  p.className = "pergunta";
  p.textContent = q.texto;
  const opcoes = document.createElement("div");
  opcoes.className = "opcoes";
  q.opcoes.forEach((o, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opcao";
    b.textContent = o.texto;
    b.addEventListener("click", () => {
      respostas.push(k);
      mostrarPergunta();
      $("teste-corpo").querySelector(".opcao")?.focus({ preventScroll: true });
    });
    opcoes.append(b);
  });
  const contador = document.createElement("p");
  contador.className = "mono pequeno";
  contador.textContent = `Pergunta ${i + 1} de ${PERGUNTAS.length}`;
  corpo.replaceChildren(prog, contador, p, opcoes);
}
function mostrarResultado() {
  const r = avaliarTeste(respostas);
  const corpo = $("teste-corpo");
  const caixa = document.createElement("div");
  caixa.className = "resultado-teste";
  caixa.innerHTML = `
    <p class="sobretitulo">O teu perfil</p>
    <h3></h3>
    <div class="pontos"><b class="mono"></b><span class="pequeno">/ 100 de disciplina</span></div>
    <p class="desc"></p>
    <p class="regra"><b>A TUA PRIMEIRA REGRA</b><span class="txt-regra"></span></p>
    <form class="form-email" name="teste-trader" method="POST" data-netlify="true" netlify-honeypot="campo-isco">
      <input type="hidden" name="form-name" value="teste-trader" />
      <input type="hidden" name="perfil" />
      <p hidden><label>Não preencher <input name="campo-isco" /></label></p>
      <label class="pequeno" for="email-teste" style="flex-basis:100%">Recebe o teu plano de 5 regras por email (grátis)</label>
      <input id="email-teste" type="email" name="email" required placeholder="o.teu@email.com" autocomplete="email" />
      <button class="btn btn-primario btn-peq" type="submit">Enviar-me o plano</button>
    </form>
    <div class="botoes"><a class="btn btn-secundario btn-peq" href="app/">Ver o Sentinela a corrigir isto</a><button type="button" class="btn btn-secundario btn-peq" id="repetir-teste">Repetir o teste</button></div>`;
  caixa.querySelector("h3").textContent = r.perfil.nome;
  caixa.querySelector(".pontos b").textContent = r.pontuacao;
  caixa.querySelector(".pontos b").style.color = r.pontuacao >= 75 ? "var(--sobe)" : r.pontuacao >= 50 ? "var(--aviso)" : "var(--desce)";
  caixa.querySelector(".desc").textContent = r.perfil.descricao;
  caixa.querySelector(".txt-regra").textContent = r.perfil.regra;
  caixa.querySelector("[name=perfil]").value = r.perfil.id;
  const form = caixa.querySelector("form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    enviarFormularioNetlify(form, "Feito. Vê o teu email nos próximos minutos.");
  });
  caixa.querySelector("#repetir-teste").addEventListener("click", () => {
    respostas = [];
    mostrarPergunta();
  });
  corpo.replaceChildren(caixa);
}
mostrarPergunta();

// ======================= arranque e redimensionamento =======================
iniciarAnimacoes();
new ResizeObserver(() => grafico.timeScale().fitContent()).observe($("hero-grafico"));
desenharSimulacao();
desenharSequencias();
let rt;
new ResizeObserver(() => {
  clearTimeout(rt);
  rt = setTimeout(() => {
    desenharSimulacao();
    desenharSequencias();
  }, 120);
}).observe(document.body);
