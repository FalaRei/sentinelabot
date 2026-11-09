// Tudo o que a IA recebe e devolve ao analisar o ecrã: prompt, formato da resposta,
// validação e a decisão do que dizer em voz alta.

// Preços em USD por milhão de tokens (Anthropic e Google, novembro de 2026). Confirma antes de vender.
export const MODELOS = {
  "gemini-3.8-flash": { nome: "Gemini 3.8 Flash (mais barato)", provedor: "google", entradaPorM: 0.75, saidaPorM: 3.75 },
  "claude-sonnet-5-5": { nome: "Claude Sonnet 5.5 (equilibrado)", provedor: "anthropic", entradaPorM: 2, saidaPorM: 10 },
  "claude-opus-5-5": { nome: "Claude Opus 5.5 (máxima qualidade)", provedor: "anthropic", entradaPorM: 4, saidaPorM: 20 },
  "gpt-6.1-terra": { nome: "GPT-6.1 Terra (OpenAI)", provedor: "openai", entradaPorM: 1, saidaPorM: 5 },
};
export const MODELO_PADRAO = "gemini-3.8-flash"; // o mais barato; a chave decide o provedor
export const MODELO_POR_PROVEDOR = { anthropic: "claude-sonnet-5-5", google: "gemini-3.8-flash" };

/** Descobre de quem é a chave pelo formato: "sk-ant-..." é da Anthropic, "AIza..." é da Google. */
export function provedorDaChave(chave) {
  const c = String(chave ?? "").trim();
  if (c.startsWith("sk-ant-")) return "anthropic";
  if (c.startsWith("AIza")) return "google";
  return null;
}

/** Modelo a usar: o escolhido, se for do provedor da chave; senão, o padrão desse provedor. */
export function modeloParaChave(chave, escolhido) {
  const p = provedorDaChave(chave);
  if (!p) return escolhido && MODELOS[escolhido] ? escolhido : MODELO_PADRAO;
  return MODELOS[escolhido]?.provedor === p ? escolhido : MODELO_POR_PROVEDOR[p];
}

const GRAVIDADES = ["info", "aviso", "critico"];
const TENDENCIAS = ["alta", "baixa", "lateral", "indefinida"];
const CUMPRIDA = ["sim", "nao", "incerto"];

export const SCHEMA_ANALISE = {
  type: "object",
  additionalProperties: false,
  required: ["ha_grafico", "ativo", "timeframe", "tendencia", "fala", "observacoes", "niveis", "cenarios", "invalidacao", "alertas", "checklist", "mudou"],
  properties: {
    ha_grafico: { type: "boolean", description: "Se o ecrã mostra um gráfico de preço legível." },
    ativo: { type: "string", description: "Ativo visível (ex: EURUSD, BTCUSDT) ou vazio." },
    timeframe: { type: "string", description: "Timeframe visível (ex: 5m, 1H) ou vazio." },
    tendencia: { type: "string", enum: TENDENCIAS, description: "Estrutura ATUAL do preço no gráfico visível (não é previsão)." },
    fala: { type: "string", description: "1 a 2 frases curtas para ler em voz alta ao trader." },
    observacoes: { type: "array", items: { type: "string" }, description: "Até 4 observações objetivas do que se vê." },
    niveis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "preco", "nota"],
        properties: {
          tipo: { type: "string", enum: ["suporte", "resistencia", "outro"] },
          preco: { type: "string" },
          nota: { type: "string" },
        },
      },
    },
    cenarios: {
      type: "array",
      description: "Exatamente 2 cenários condicionais e simétricos: um se o preço subir além de uma zona, outro se cair abaixo de outra. Descrevem o que a estrutura passaria a mostrar, nunca o que o trader deve fazer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["condicao", "leitura"],
        properties: {
          condicao: { type: "string", description: "Ex: 'Fecho acima de 1.0950'" },
          leitura: { type: "string", description: "O que isso significaria para a estrutura visível, em linguagem neutra." },
        },
      },
    },
    invalidacao: {
      type: "object",
      additionalProperties: false,
      required: ["preco", "razao"],
      description: "Zona onde a leitura atual da estrutura deixa de ser válida. Serve de referência de risco para o trader decidir o próprio stop.",
      properties: { preco: { type: "string" }, razao: { type: "string" } },
    },
    alertas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["gravidade", "mensagem"],
        properties: { gravidade: { type: "string", enum: GRAVIDADES }, mensagem: { type: "string" } },
      },
    },
    checklist: {
      type: "array",
      description: "Uma entrada por regra pessoal do trader, se houver.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["regra", "cumprida"],
        properties: { regra: { type: "string" }, cumprida: { type: "string", enum: CUMPRIDA } },
      },
    },
    mudou: { type: "boolean", description: "Se algo relevante mudou desde a análise anterior." },
  },
};

export function construirSistema(config) {
  const regras = (config.regrasPessoais || "").trim();
  return `És o Sentinela, um copiloto de disciplina para traders. Recebes capturas do ecrã do trader enquanto ele opera.

O teu trabalho:
1. Descrever de forma objetiva o que o gráfico mostra AGORA: estrutura de topos e fundos, zonas onde o preço reagiu antes, valores de indicadores visíveis (RSI, médias, volume) e o que significam em linguagem simples.
2. Apontar riscos visíveis: posição aberta sem stop loss, volatilidade fora do normal, preço colado a uma zona onde reagiu várias vezes, entrada no meio do nada.
3. Verificar as regras pessoais do trader e dizer se o cenário visível as cumpre.
4. Dar 2 cenários condicionais e simétricos ("se fechar acima de X, a estrutura passa a mostrar...", "se fechar abaixo de Y, ..."), sempre os dois lados, sem dizer qual é mais provável.
5. Indicar a zona de invalidação: o preço onde a leitura atual deixa de ser válida (ex: abaixo do último fundo). É uma referência de risco para o trader decidir o próprio stop.
6. Ensinar: o trader quer perceber o que se passa, não receber ordens.

Limites que nunca quebras:
- Nunca dizes "compra", "vende", "entra", "sai", "deves" ou "recomendo". Nunca prevês o preço futuro, nunca dás alvos de lucro e nunca dizes qual cenário é mais provável.
- Quando as regras do trader estão cumpridas, dizes apenas que estão cumpridas segundo as regras dele. A decisão é sempre dele. Descreves o presente e o histórico visível ("o preço está a fazer fundos mais altos", "o RSI está em 75, zona considerada sobrecomprada").
- Se o ecrã não mostrar um gráfico, diz isso e não inventes.
- Se não conseguires ler um valor, não o inventes.

Estilo da "fala": português de Portugal, tratamento por tu, máximo 2 frases curtas e naturais para ouvir em voz alta. Se nada de importante mudou desde a análise anterior, a fala é uma frase curta ou fica vazia e "mudou" é false.

Contexto do trader: conta de ${config.saldo} €, risco máximo por trade ${config.riscoMaxPct}%, perda máxima diária ${config.perdaDiariaMaxPct}%${config.modoConta === "desafio" ? `. Está num desafio de prop firm${config.perdaTotalMaxPct ? ` com perda máxima total de ${config.perdaTotalMaxPct}%` : ""}: quebrar um limite faz perder a conta, por isso dá prioridade aos riscos` : ""}.
${regras ? `Regras pessoais do trader (avalia cada uma no checklist):\n${regras}` : "O trader ainda não definiu regras pessoais: deixa o checklist vazio."}`;
}

export function construirMensagemUtilizador(analiseAnterior) {
  const anterior = analiseAnterior
    ? `Análise anterior (há poucos segundos): tendência ${analiseAnterior.tendencia}; "${analiseAnterior.fala}".`
    : "Esta é a primeira análise da sessão.";
  return `${anterior}\nAnalisa a captura de ecrã atual.`;
}

const texto = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v) => (Array.isArray(v) ? v : []);

/** Normaliza a resposta do modelo; nunca lança, para a app continuar a correr. */
export function validarAnalise(bruto) {
  let obj = bruto;
  if (typeof bruto === "string") {
    try {
      obj = JSON.parse(bruto);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  return {
    ha_grafico: obj.ha_grafico === true,
    ativo: texto(obj.ativo, 30),
    timeframe: texto(obj.timeframe, 15),
    tendencia: TENDENCIAS.includes(obj.tendencia) ? obj.tendencia : "indefinida",
    fala: texto(obj.fala, 300),
    observacoes: lista(obj.observacoes).map((o) => texto(o)).filter(Boolean).slice(0, 4),
    niveis: lista(obj.niveis)
      .filter((n) => n && typeof n === "object")
      .map((n) => ({ tipo: ["suporte", "resistencia"].includes(n.tipo) ? n.tipo : "outro", preco: texto(n.preco, 30), nota: texto(n.nota, 120) }))
      .slice(0, 6),
    cenarios: lista(obj.cenarios)
      .filter((c) => c && texto(c.condicao))
      .map((c) => ({ condicao: texto(c.condicao, 120), leitura: texto(c.leitura, 220) }))
      .slice(0, 2),
    invalidacao: obj.invalidacao && texto(obj.invalidacao.preco) ? { preco: texto(obj.invalidacao.preco, 30), razao: texto(obj.invalidacao.razao, 160) } : null,
    alertas: lista(obj.alertas)
      .filter((a) => a && texto(a.mensagem))
      .map((a) => ({ gravidade: GRAVIDADES.includes(a.gravidade) ? a.gravidade : "info", mensagem: texto(a.mensagem) }))
      .slice(0, 5),
    checklist: lista(obj.checklist)
      .filter((c) => c && texto(c.regra))
      .map((c) => ({ regra: texto(c.regra, 150), cumprida: CUMPRIDA.includes(c.cumprida) ? c.cumprida : "incerto" })),
    mudou: obj.mudou !== false,
  };
}

/** Estado das regras do trader no gráfico atual: "cumpridas", "parciais", "nao_cumpridas" ou "sem_regras". */
export function estadoSetup(checklist = []) {
  if (!checklist.length) return "sem_regras";
  if (checklist.every((c) => c.cumprida === "sim")) return "cumpridas";
  if (checklist.some((c) => c.cumprida === "nao")) return "nao_cumpridas";
  return "parciais";
}

/**
 * O que dizer em voz alta. O trader fica horas a ouvir: o silêncio faz parte do produto.
 * - "importante" (padrão): fala os alertas, a mudança de estrutura e quando as regras ficam todas cumpridas.
 * - "explicar": fala também cada leitura nova.
 * Alertas críticos falam sempre.
 * @param {"importante"|"explicar"} modo
 */
export function decidirFala(analise, modo = "importante", anterior = null) {
  if (!analise) return null;
  const critico = analise.alertas.find((a) => a.gravidade === "critico");
  if (critico) return `Atenção. ${critico.mensagem}`;
  if (modo !== "explicar") {
    if (!analise.mudou) return null;
    const aviso = analise.alertas.find((a) => a.gravidade === "aviso");
    if (aviso) return aviso.mensagem;
    const cumpridas = estadoSetup(analise.checklist) === "cumpridas";
    const antesCumpridas = anterior ? estadoSetup(anterior.checklist) === "cumpridas" : false;
    if (cumpridas && !antesCumpridas) return "As tuas regras de entrada estão todas cumpridas neste gráfico. A decisão é tua.";
    if (anterior && anterior.tendencia !== analise.tendencia && analise.fala) return analise.fala;
    return null;
  }
  if (!analise.mudou || !analise.fala) return null;
  if (estadoSetup(analise.checklist) === "cumpridas") return `${analise.fala} As tuas regras de entrada estão todas cumpridas neste gráfico. A decisão é tua.`;
  return analise.fala;
}

/** Custo de uma chamada em USD. Aceita o usage da Anthropic ou { entrada, saida } já normalizado. */
export function custoChamada(usage, modelo) {
  const m = MODELOS[modelo] ?? MODELOS[MODELO_PADRAO];
  if (!usage) return 0;
  if ("entrada" in usage) return ((usage.entrada ?? 0) * m.entradaPorM + (usage.saida ?? 0) * m.saidaPorM) / 1e6;
  const entrada = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (entrada * m.entradaPorM + (usage.output_tokens ?? 0) * m.saidaPorM) / 1e6;
}
