// Onde o trader tem o gráfico, e como o partilhar. Plataformas no browser partilham-se como
// separador (imagem mais limpa); programas instalados partilham-se como janela.

export const PLATAFORMAS = [
  { id: "tradingview", nome: "TradingView", superficie: "browser" },
  { id: "corretora-web", nome: "Corretora no browser", exemplos: "XTB, eToro, Binance…", superficie: "browser" },
  { id: "metatrader", nome: "MetaTrader 4 / 5", superficie: "window" },
  { id: "programa", nome: "Outro programa", exemplos: "cTrader, NinjaTrader…", superficie: "window" },
];

/** Instrução curta para o passo 1, conforme a plataforma. */
export function dicaPartilha(id) {
  const p = PLATAFORMAS.find((x) => x.id === id);
  if (!p) return "Diz-me onde tens o gráfico e depois carrega no 1.";
  if (p.superficie === "browser") {
    return `Escolhe o separador (aba) do ${p.id === "tradingview" ? "TradingView" : "gráfico"} e carrega em Partilhar.`;
  }
  return `Abre o ${p.id === "metatrader" ? "MetaTrader" : "programa"}. Depois escolhe Janela e carrega nele.`;
}

export const superficieDe = (id) => PLATAFORMAS.find((x) => x.id === id)?.superficie ?? null;
