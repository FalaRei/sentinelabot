// Gráficos da app (TradingView Lightweight Charts). Paleta validada para daltonismo
// sobre o fundo escuro: subida/positivo #1a9a8a, descida/negativo #e0564a, série #3987e5.

import { createChart, CandlestickSeries, BaselineSeries, LineStyle, CrosshairMode } from "lightweight-charts";

// Cores lidas dos tokens CSS (claro/escuro). Paletas validadas para daltonismo nos dois temas.
const lerTokens = () => {
  const c = getComputedStyle(document.documentElement);
  const v = (n) => c.getPropertyValue(n).trim();
  return { sobe: v("--sobe"), desce: v("--desce"), serie: v("--serie"), tinta3: v("--tinta-3"), linha: v("--linha"), grelha: v("--grelha"), mira: v("--tinta-3"), etiqueta: v("--tinta-3"), aviso: v("--aviso"), tinta: v("--tinta") };
};
export const COR = lerTokens();
const aoMudarTema = [];
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
  requestAnimationFrame(() => {
    Object.assign(COR, lerTokens());
    aoMudarTema.forEach((f) => f());
  })
);
const opcoesTema = () => ({
  layout: { textColor: COR.tinta3 },
  grid: { vertLines: { color: COR.grelha }, horzLines: { color: COR.grelha } },
  rightPriceScale: { borderColor: COR.linha },
  timeScale: { borderColor: COR.linha },
  crosshair: { vertLine: { color: COR.mira, labelBackgroundColor: COR.etiqueta }, horzLine: { color: COR.mira, labelBackgroundColor: COR.etiqueta } },
});

const base = (extra = {}) => ({
  autoSize: true,
  layout: { background: { color: "transparent" }, textColor: COR.tinta3, fontFamily: "Geist Mono, ui-monospace, monospace", fontSize: 11 },
  grid: { vertLines: { color: COR.grelha }, horzLines: { color: COR.grelha } },
  rightPriceScale: { borderColor: COR.linha },
  timeScale: { borderColor: COR.linha, timeVisible: true, secondsVisible: false },
  crosshair: { mode: CrosshairMode.Normal, vertLine: { color: COR.mira, labelBackgroundColor: COR.etiqueta }, horzLine: { color: COR.mira, labelBackgroundColor: COR.etiqueta } },
  localization: { locale: "pt-PT" },
  ...extra,
});

/** Gráfico de velas do mercado simulado, com as zonas que o copiloto aponta. */
export function criarGraficoMercado(host) {
  const chart = createChart(host, base({ rightPriceScale: { borderColor: COR.linha, scaleMargins: { top: 0.12, bottom: 0.08 } }, timeScale: { borderColor: COR.linha, timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 9 } }));
  let zonas = [];
  const serie = chart.addSeries(CandlestickSeries, {
    upColor: COR.sobe, downColor: COR.desce, borderVisible: false, wickUpColor: COR.sobe, wickDownColor: COR.desce,
    priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
    // as zonas marcadas entram sempre na escala visível
    autoscaleInfoProvider: (original) => {
      const r = original();
      if (!r || !zonas.length) return r;
      for (const z of zonas) {
        r.priceRange.maxValue = Math.max(r.priceRange.maxValue, z + 0.0003);
        r.priceRange.minValue = Math.min(r.priceRange.minValue, z - 0.0003);
      }
      return r;
    },
  });
  let linhas = [];
  let ultimasZonas = [];
  aoMudarTema.push(() => {
    chart.applyOptions(opcoesTema());
    serie.applyOptions({ upColor: COR.sobe, downColor: COR.desce, wickUpColor: COR.sobe, wickDownColor: COR.desce });
    api.definirZonas(ultimasZonas);
  });
  const api = {
    definirVelas(velas) {
      serie.setData(velas);
      chart.timeScale().fitContent();
    },
    atualizar(vela) {
      serie.update(vela);
    },
    /** @param {{tipo:string, preco:string, nota:string}[]} niveis */
    definirZonas(niveis) {
      ultimasZonas = niveis;
      linhas.forEach((l) => serie.removePriceLine(l));
      const validos = niveis.map((n) => ({ ...n, valor: Number(String(n.preco).replace(",", ".")) })).filter((n) => Number.isFinite(n.valor) && n.valor > 0);
      zonas = validos.map((n) => n.valor);
      linhas = validos.map((n) =>
        serie.createPriceLine({
          price: n.valor,
          color: n.tipo === "suporte" ? COR.sobe : n.tipo === "resistencia" ? COR.desce : n.tipo === "invalidacao" ? COR.aviso : COR.serie,
          lineWidth: 1,
          lineStyle: n.tipo === "invalidacao" ? LineStyle.Dotted : LineStyle.Dashed,
          axisLabelVisible: true,
          title: n.tipo === "resistencia" ? "resistência" : n.tipo === "invalidacao" ? "invalidação" : n.tipo,
        })
      );
    },
    destruir() {
      chart.remove();
    },
  };
  return api;
}

const MIN_SEG = 60;
/** Curva de capital: verde-água acima de zero, coral abaixo. */
export function criarCurvaCapital(host) {
  const chart = createChart(host, base({ handleScroll: false, handleScale: false }));
  const serie = chart.addSeries(BaselineSeries, {
    baseValue: { type: "price", price: 0 },
    topLineColor: COR.sobe, topFillColor1: "rgba(26, 154, 138, .28)", topFillColor2: "rgba(26, 154, 138, .02)",
    bottomLineColor: COR.desce, bottomFillColor1: "rgba(224, 86, 74, .02)", bottomFillColor2: "rgba(224, 86, 74, .28)",
    lineWidth: 2,
    priceFormat: { type: "custom", formatter: (v) => `${v.toLocaleString("pt-PT", { maximumFractionDigits: 0 })} €` },
    lastValueVisible: true,
    priceLineVisible: false,
  });
  aoMudarTema.push(() => {
    chart.applyOptions(opcoesTema());
    serie.applyOptions({ topLineColor: COR.sobe, bottomLineColor: COR.desce });
  });
  return {
    /** @param {{fechadoEm:number, abertoEm:number, resultado:number}[]} fechados */
    definir(fechados) {
      const ordenados = [...fechados].sort((a, b) => (a.fechadoEm ?? a.abertoEm) - (b.fechadoEm ?? b.abertoEm));
      let acumulado = 0;
      let ultimoT = 0;
      const pontos = [];
      if (ordenados.length) {
        ultimoT = Math.floor((ordenados[0].fechadoEm ?? ordenados[0].abertoEm) / 1000) - 10 * MIN_SEG;
        pontos.push({ time: ultimoT, value: 0 });
      }
      for (const t of ordenados) {
        acumulado += t.resultado;
        // os tempos têm de ser estritamente crescentes
        const tt = Math.max(Math.floor((t.fechadoEm ?? t.abertoEm) / 1000), ultimoT + 1);
        ultimoT = tt;
        pontos.push({ time: tt, value: Math.round(acumulado * 100) / 100 });
      }
      serie.setData(pontos);
      chart.timeScale().fitContent();
    },
    ajustar() {
      chart.timeScale().fitContent();
    },
  };
}

/** Disciplina por dia (0-100) em SVG: barras finas com topo arredondado, meta dos 80 e tooltip. */
export function criarGraficoDisciplina(host) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, texto) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (texto != null) e.textContent = texto;
    return e;
  };
  let dados = [];
  const tip = document.createElement("div");
  tip.className = "tooltip-app";
  tip.hidden = true;
  function desenhar() {
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    const m = { t: 18, r: 44, b: 26, l: 8 };
    const y = (v) => m.t + (1 - v / 100) * (H - m.t - m.b);
    const ultimos = dados.slice(-30);
    const banda = (W - m.l - m.r) / Math.max(ultimos.length, 7);
    const largura = Math.max(6, Math.min(26, banda - 8));
    const raiz = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Pontuação de disciplina por dia" });
    for (const v of [0, 50, 100]) {
      raiz.append(el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: COR.grelha }));
      raiz.append(el("text", { x: W - m.r + 8, y: y(v) + 4, fill: COR.tinta3, "font-size": 11, "font-family": "Geist Mono, monospace" }, v));
    }
    raiz.append(el("line", { x1: m.l, x2: W - m.r, y1: y(80), y2: y(80), stroke: COR.tinta3, "stroke-dasharray": "4 4" }));
    raiz.append(el("text", { x: W - m.r + 8, y: y(80) + 4, fill: COR.tinta, "font-size": 11, "font-weight": 600, "font-family": "Geist Mono, monospace" }, "80"));
    const inicio = m.l + (W - m.l - m.r) - banda * ultimos.length; // alinhado à direita (mais recente)
    ultimos.forEach((d, i) => {
      const cx = inicio + banda * i + banda / 2;
      const topo = y(Math.max(d.pontuacao, 1));
      const base = H - m.b;
      const r = Math.min(4, (base - topo) / 2, largura / 2);
      const x0 = cx - largura / 2;
      const x1 = cx + largura / 2;
      const atingiu = d.pontuacao >= 80;
      const barra = el("path", {
        d: `M${x0},${base}V${topo + r}Q${x0},${topo} ${x0 + r},${topo}H${x1 - r}Q${x1},${topo} ${x1},${topo + r}V${base}Z`,
        fill: COR.serie, "fill-opacity": atingiu ? 1 : 0.4,
      });
      raiz.append(barra);
      const [, mes, dia] = d.dia.split("-");
      if (ultimos.length <= 10 || i % Math.ceil(ultimos.length / 8) === 0) {
        raiz.append(el("text", { x: cx, y: H - 8, "text-anchor": "middle", fill: COR.tinta3, "font-size": 11, "font-family": "Geist Mono, monospace" }, `${+dia}/${+mes}`));
      }
      const alvo = el("rect", { x: inicio + banda * i, y: m.t, width: banda, height: H - m.t - m.b, fill: "transparent" });
      alvo.addEventListener("pointerenter", () => {
        barra.setAttribute("opacity", ".8");
        tip.textContent = `${+dia}/${+mes} · disciplina ${d.pontuacao} · ${d.trades} trade${d.trades > 1 ? "s" : ""}`;
        tip.hidden = false;
        tip.hidden = false;
        tip.style.left = `${Math.max(0, Math.min(cx + 10, W - tip.offsetWidth - 4))}px`;
        tip.style.top = `${Math.max(0, topo - 34)}px`;
      });
      alvo.addEventListener("pointerleave", () => {
        barra.removeAttribute("opacity");
        tip.hidden = true;
      });
      raiz.append(alvo);
    });
    host.replaceChildren(raiz, tip);
  }
  new ResizeObserver(() => desenhar()).observe(host);
  return {
    /** @param {{dia:string, pontuacao:number, trades:number}[]} dias  dia = "AAAA-MM-DD" */
    definir(dias) {
      dados = dias;
      desenhar();
    },
    ajustar: desenhar,
  };
}
