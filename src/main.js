import { CONFIG_PADRAO, avaliar, verificarNovoTrade, tradesDoDia, perdasSeguidas, estadoSessao, folgas } from "./core/rules.js";
import { MODELOS_CONTA, aplicarModelo } from "./core/propfirm.js";
import { PLATAFORMAS, dicaPartilha, superficieDe } from "./core/plataformas.js";
import { TIMEFRAMES, msAteFechoVela, leiturasPorHora, lerTimeframe } from "./core/cadencia.js";
import { construirSistemaChat, contextoDoMomento, construirMensagensChat, respostaDemo } from "./core/chat.js";
import { calcularPosicao, taxaAcertoMinima } from "./core/risk.js";
import { novoTrade, fecharTrade, estatisticas, relatorioDiario, exportarCSV } from "./core/journal.js";
import { MODELOS, validarAnalise, decidirFala, estadoSetup, provedorDaChave, modeloParaChave } from "./core/analysis.js";
import { APOIO } from "./config.js";
import { deveAnalisar } from "./core/frames.js";
import { validarChave } from "./core/license.js";
import { ANALISES_DEMO } from "./core/demo.js";
import { gerarHistorico, avancar } from "./core/market-sim.js";
import { calcularProgresso, novidades } from "./core/gamification.js";
import { tradesExemplo, eExemplo } from "./core/exemplo.js";
import { ligarIA, testarChave } from "./services/ia.js";
import { detetarServidor, ligarServidor } from "./services/servidor.js";
import { holofote, limparHolofote } from "./ui/holofote.js";
import { iniciarCaptura, capturarFrame } from "./services/capture.js";
import { falar, calar, vozDisponivel, nomeVoz, vozNatural, usarVozExterna } from "./services/voice.js";
import { ler, gravar, apagar } from "./services/storage.js";
import { criarGraficoMercado, criarCurvaCapital, criarGraficoDisciplina } from "./ui/graficos.js";
import { sons } from "./ui/sons.js";
import { confetes } from "./ui/confetes.js";

// ---------- utilitários ----------
const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}
const icone = (id) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", "ico");
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", `#${id}`);
  s.append(u);
  return s;
};
const hora = (t = Date.now()) => new Date(t).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
const euros = (n) => `${n >= 0 ? "" : "−"}${Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const num = (id) => {
  const v = $(id).value;
  return v === "" ? null : Number(v);
};
const doisDigitos = (n) => String(n).padStart(2, "0");
const iniciais = (nome) => nome.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

// ---------- estado ----------
const estado = {
  licenca: ler("licenca", null),
  config: { ...CONFIG_PADRAO, ...ler("config", {}) },
  apiKey: ler("apikey", ""),
  modelo: ler("modelo", null),
  trades: ler("trades", []),
  captura: null,
  ligado: false,
  timer: null,
  timerMercado: null,
  emCurso: false,
  abort: null,
  ia: null,
  servidor: null, // servidor de teste (npm run teste): a IA já vem ligada, sem licença nem chave
  codigo: ler("codigo", ""),
  proximaEm: 0,
  confirmarLeitura: false, // depois de escolher a janela, a primeira leitura confirma que o gráfico se lê
  analiseAnterior: null,
  miniaturaAnterior: null,
  ultimaAnaliseEm: 0,
  custoSessao: 0,
  demoIdx: 0,
  alertasDisciplinaAtivos: new Set(),
  progresso: null,
  mercado: null,
};
estado.modelo = modeloParaChave(estado.apiKey, estado.modelo);
const ligacaoIA = () => (estado.ia ??= estado.servidor ? ligarServidor(estado.codigo, estado.servidor) : ligarIA(estado.apiKey.trim(), estado.modelo));

const licencaValida = () => validarChave(estado.licenca);
const modoReal = () => !!estado.servidor || (licencaValida() && estado.apiKey.trim().length > 0);

let graficoMercado = null;
let curvaCapital = null;
let graficoDisciplina = null;

// ---------- licença ----------
function mostrarLicenca() {
  $("ecra-licenca").hidden = false;
  $("app").hidden = true;
  $("input-licenca").focus();
}
function entrarApp() {
  $("ecra-licenca").hidden = true;
  $("app").hidden = false;
  if (!graficoMercado) {
    graficoMercado = criarGraficoMercado($("grafico-demo"));
    curvaCapital = criarCurvaCapital($("grafico-capital"));
    graficoDisciplina = criarGraficoDisciplina($("grafico-disciplina"));
    reiniciarMercado();
  }
  atualizarModo();
  estado.progresso = calcularProgresso(estado.trades, estado.config);
  atualizarTudo({ anunciar: false });
  preencherDefinicoes();
  atualizarPassos();
  if (!ler("assistente", false)) abrirAssistente();
}
$("btn-ativar").addEventListener("click", () => {
  const chave = $("input-licenca").value.trim().toUpperCase();
  if (!validarChave(chave)) {
    $("erro-licenca").textContent = "Chave inválida. Confirma que a copiaste completa, com os hífenes.";
    $("erro-licenca").hidden = false;
    return;
  }
  estado.licenca = chave;
  gravar("licenca", chave);
  $("erro-licenca").hidden = true;
  entrarApp();
  if (!estado.apiKey && $("assistente").hidden) {
    mudarSeparador("definicoes");
    abrirGuiaChave();
  }
});
$("input-licenca").addEventListener("keydown", (e) => e.key === "Enter" && $("btn-ativar").click());
$("btn-demo").addEventListener("click", entrarApp);

// ---------- separadores ----------
function mudarSeparador(nome) {
  document.querySelectorAll(".sep").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.sep === nome);
    b.setAttribute("aria-selected", String(b.dataset.sep === nome));
  });
  document.querySelectorAll(".painel").forEach((p) => p.classList.toggle("ativo", p.id === `sep-${nome}`));
  const painel = $(`sep-${nome}`);
  painel.classList.remove("entrar");
  void painel.offsetWidth;
  painel.classList.add("entrar");
  if (nome === "dia") {
    // os gráficos foram desenhados com o separador escondido: reenquadrar depois de aparecer
    requestAnimationFrame(() => requestAnimationFrame(() => {
      curvaCapital?.ajustar();
      graficoDisciplina?.ajustar();
    }));
  }
}
document.querySelectorAll(".sep").forEach((b) => b.addEventListener("click", () => mudarSeparador(b.dataset.sep)));
$("chip-patente").addEventListener("click", () => mudarSeparador("dia"));
$("link-apoio").addEventListener("click", (e) => {
  e.preventDefault();
  mudarSeparador("definicoes");
  $("cartao-apoio").scrollIntoView({ behavior: "smooth", block: "center" });
});

function atualizarModo() {
  const p = $("pilula-modo");
  if (estado.servidor) {
    p.textContent = `Teste · ${estado.servidor.ia}`;
    p.className = "pilula ativa";
  } else if (modoReal()) {
    p.textContent = `IA · ${MODELOS[estado.modelo].nome.split(" (")[0]}`;
    p.className = "pilula ativa";
  } else {
    p.textContent = licencaValida() ? "Demo · falta a chave da API" : "Demonstração";
    p.className = "pilula";
  }
  atualizarPassos();
  const real = modoReal() && estado.captura;
  $("grafico-demo").hidden = !!real;
  $("miniatura").hidden = !real;
  $("etiqueta-fonte").textContent = modoReal() ? (estado.captura ? "o teu ecrã" : "escolhe o ecrã") : "mercado simulado";
}

// ---------- registo (feed) ----------
const ultimasMensagens = [];
function adicionarAlerta(gravidade, mensagem, prefixo) {
  if (ultimasMensagens.includes(mensagem)) return false;
  ultimasMensagens.push(mensagem);
  if (ultimasMensagens.length > 6) ultimasMensagens.shift();
  const feed = $("feed-alertas");
  feed.querySelector(".vazio")?.remove();
  feed.prepend(h("li", { class: gravidade }, h("time", {}, hora()), h("span", {}, prefixo ?? null, mensagem)));
  while (feed.children.length > 60) feed.lastChild.remove();
  if (gravidade === "critico") sons.alerta();
  return true;
}
function feedVazio() {
  $("feed-alertas").replaceChildren(h("li", { class: "vazio" }, "Os avisos do copiloto, das tuas regras e os pontos que ganhas aparecem aqui."));
}
feedVazio();
$("btn-limpar-alertas").addEventListener("click", () => {
  ultimasMensagens.length = 0;
  feedVazio();
});
const vozLigada = () => $("chk-voz").checked;
$("chk-som").addEventListener("change", (e) => (sons.ligado = e.target.checked));

// ---------- toasts, XP e patentes ----------
function toast(conteudo, classe = "") {
  const t = h("div", { class: `toast ${classe}` }, conteudo);
  $("toasts").append(t);
  setTimeout(() => {
    t.classList.add("sai");
    setTimeout(() => t.remove(), 320);
  }, 3200);
}

function celebrar(antes, depois) {
  const n = novidades(antes, depois);
  if (n.xpGanho > 0) {
    const novos = depois.eventos.length - (antes?.eventos.length ?? 0);
    const motivo = depois.eventos.slice(-Math.max(1, Math.min(2, novos))).map((e) => e.texto).join(" · ");
    toast([h("b", {}, `+${n.xpGanho} XP`), h("span", {}, motivo)], "xp");
    adicionarAlerta("xp", ` ${motivo}`, h("b", {}, `+${n.xpGanho} XP`));
    sons.xp();
  }
  n.novasConquistas.forEach((c, i) =>
    setTimeout(() => {
      toast([h("b", {}, "Conquista"), h("span", {}, `${c.nome}: ${c.desc}`)], "conquista");
      sons.conquista();
    }, 450 + i * 500)
  );
  if (n.subiuNivel) {
    setTimeout(() => {
      $("subiu-insignia").textContent = doisDigitos(depois.nivel.indice + 1);
      $("subiu-nome").textContent = depois.nivel.nome;
      $("subiu-txt").textContent = depois.nivel.proximo
        ? `Faltam ${depois.nivel.faltam} XP para ${depois.nivel.proximo.nome}. Continua a seguir o plano.`
        : "Chegaste à patente máxima. Disciplina de profissional.";
      $("subiu").hidden = false;
      $("subiu-ok").focus();
      sons.patente();
      confetes();
      if (vozLigada()) falar(`Parabéns. Subiste para ${depois.nivel.nome}.`, { urgente: true });
    }, 900 + n.novasConquistas.length * 500);
  }
}
$("subiu-ok").addEventListener("click", () => ($("subiu").hidden = true));

function renderProgresso() {
  const p = estado.progresso;
  const n = p.nivel;
  $("chip-nivel").textContent = doisDigitos(n.indice + 1);
  $("chip-nome").textContent = n.nome;
  $("chip-barra").style.width = `${n.progresso * 100}%`;
  const seq = $("chip-seq");
  seq.querySelector("b").textContent = p.sequencia;
  seq.classList.toggle("apagada", p.sequencia === 0);

  $("p-insignia").textContent = doisDigitos(n.indice + 1);
  $("p-nome").textContent = n.nome;
  $("p-barra").style.width = `${n.progresso * 100}%`;
  $("p-xp").textContent = n.proximo ? `${p.xp.toLocaleString("pt-PT")} XP · faltam ${n.faltam} XP para ${n.proximo.nome}` : `${p.xp.toLocaleString("pt-PT")} XP · patente máxima`;
  $("p-seq").textContent = p.sequencia;
  $("p-conq").textContent = `${p.conquistas.filter((c) => c.desbloqueada).length}/${p.conquistas.length}`;
  $("p-conquistas").replaceChildren(
    ...p.conquistas.map((c) => h("li", { class: c.desbloqueada ? "ganha" : "" }, h("i", {}, iniciais(c.nome)), h("div", {}, h("b", {}, c.nome), h("span", {}, c.desc))))
  );
  const evs = [...p.eventos].reverse().slice(0, 8);
  $("p-eventos").replaceChildren(
    ...(evs.length
      ? evs.map((e) => h("li", { class: "xp" }, h("time", {}, hora(e.em)), h("span", {}, h("b", {}, `+${e.xp}`), ` ${e.texto}`)))
      : [h("li", { class: "vazio" }, "Regista o primeiro trade com stop e dentro do plano para ganhares os primeiros pontos.")])
  );

  const v = p.hoje;
  $("gauge-num").textContent = v ?? "—";
  const arco = $("gauge-arco");
  arco.setAttribute("stroke-dasharray", `${v ?? 0} 100`);
  arco.style.stroke = v == null || v >= 80 ? "var(--sobe)" : v >= 60 ? "var(--aviso)" : "var(--desce)";
}

// ---------- disciplina ----------
function atualizarDisciplina() {
  const { alertas, bloqueio } = avaliar(estado.config, estado.trades);
  const pilula = $("estado-disciplina");
  const banner = $("banner-bloqueio");
  const texto = pilula.querySelector("span");
  if (bloqueio) {
    texto.textContent = `Pausa até ${hora(bloqueio.ate)}`;
    pilula.className = "estado critico";
    banner.textContent = `${bloqueio.motivo} O Sentinela recomenda não abrir trades até às ${hora(bloqueio.ate)}.`;
    banner.hidden = false;
  } else {
    const aviso = alertas.some((a) => a.gravidade !== "info");
    texto.textContent = aviso ? "Atenção às regras" : "Livre para operar";
    pilula.className = `estado ${aviso ? "aviso" : "ok"}`;
    banner.hidden = true;
  }
  const ativos = new Set(alertas.map((a) => a.codigo));
  for (const a of alertas) {
    if (estado.alertasDisciplinaAtivos.has(a.codigo)) continue;
    adicionarAlerta(a.gravidade, a.mensagem);
    if (vozLigada() && a.gravidade === "critico") falar(a.mensagem, { urgente: true });
  }
  estado.alertasDisciplinaAtivos = ativos;

  const sessao = estadoSessao(estado.config);
  const chip = $("chip-sessao");
  chip.querySelector("span").textContent = !sessao.dentro
    ? `Fora do horário (${sessao.inicio}–${sessao.fim})`
    : sessao.noticia
      ? `Notícia às ${sessao.noticia.hora}`
      : sessao.minutosParaFim != null
        ? `Sessão · faltam ${Math.floor(sessao.minutosParaFim / 60)}h${String(sessao.minutosParaFim % 60).padStart(2, "0")}`
        : "Sessão aberta";
  chip.className = `chip-sessao mono ${!sessao.dentro || sessao.noticia ? "aviso" : sessao.perto ? "aviso" : "ok"}`;

  const hoje = tradesDoDia(estado.trades, Date.now());
  const pnl = hoje.filter((t) => typeof t.resultado === "number").reduce((s, t) => s + t.resultado, 0);
  const el = $("instr-pnl");
  el.textContent = euros(pnl);
  el.className = `mono ${pnl > 0 ? "pos" : pnl < 0 ? "neg" : ""}`;
  $("instr-perdas").textContent = perdasSeguidas(hoje);
  renderLimites();
}

// ---------- holofote: aponta para o próximo botão (uma vez por passo) ----------
const passosApontados = new Set();
const podeApontar = () => !$("app").hidden && $("assistente").hidden && $("guia-chave").hidden && $("sep-copiloto").classList.contains("ativo");
function apontarProximoPasso(precisaEcra) {
  if (!podeApontar()) return;
  if (!$("sep-copiloto").classList.contains("ativo")) return;
  if (estado.ligado) return limparHolofote();
  const passo = precisaEcra ? (estado.config.plataforma ? "ecra" : "plataforma") : "comecar";
  if (passosApontados.has(passo)) return;
  passosApontados.add(passo);
  const alvo = { plataforma: $("plataformas"), ecra: $("btn-partilhar"), comecar: $("btn-iniciar") }[passo];
  const texto = { plataforma: "Onde está o teu gráfico?", ecra: "Escolhe o gráfico", comecar: "Carrega aqui" }[passo];
  setTimeout(() => (podeApontar() && !estado.ligado ? holofote(alvo, texto) : passosApontados.delete(passo)), 350);
}

// ---------- limites do dia e do desafio ----------
function barraLimite({ rotulo, resta, limite, usado, tipo = "perda" }) {
  const fracao = limite > 0 ? Math.min(1, usado / limite) : 0;
  const nivel = tipo === "meta" ? "meta" : fracao >= 0.7 ? "critico" : fracao >= 0.4 ? "aviso" : "ok";
  return h(
    "div",
    { class: `limite ${nivel}` },
    h("div", { class: "limite-topo" }, h("span", {}, rotulo), h("b", { class: "mono" }, tipo === "meta" ? `${euros(usado)} de ${euros(limite)}` : `restam ${euros(resta)}`)),
    h("div", { class: "limite-barra", role: "meter", "aria-valuemin": 0, "aria-valuemax": limite, "aria-valuenow": Math.max(0, usado), "aria-label": rotulo }, h("i", { style: `width:${Math.max(0, fracao) * 100}%` })),
    tipo !== "meta" && h("small", {}, `perdido ${euros(-usado).replace("−", "")} de ${euros(limite)}`)
  );
}
function renderLimites() {
  const c = estado.config;
  const f = folgas(c, estado.trades);
  const desafio = c.modoConta === "desafio";
  const modelo = MODELOS_CONTA.find((m) => m.id === c.modeloConta);
  $("limites-titulo").textContent = desafio ? `O teu desafio${modelo ? ` · ${modelo.nome}` : ""}` : "Os teus limites";
  $("limites-barras").replaceChildren(
    ...[
    barraLimite({ rotulo: "Podes perder hoje", ...f.dia }),
    f.total && barraLimite({ rotulo: desafio ? "Perda máxima do desafio" : "Perda máxima total", ...f.total }),
    f.meta && barraLimite({ rotulo: "Meta do desafio", tipo: "meta", limite: f.meta.alvo, usado: Math.max(0, f.meta.feito) }),
    f.riscoAberto > 0 && h("p", { class: "pequeno" }, `Em risco agora nos trades abertos: ${euros(f.riscoAberto)}.`),
    ].filter(Boolean)
  );
}
function renderPlataformas() {
  $("plataformas").replaceChildren(
    ...PLATAFORMAS.map((p) =>
      h(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": String(p.id === estado.config.plataforma),
          class: `chip ${p.id === estado.config.plataforma ? "ativa" : ""}`,
          title: p.exemplos ?? null,
          onclick: () => {
            estado.config = { ...estado.config, plataforma: p.id };
            gravar("config", estado.config);
            atualizarPassos();
          },
        },
        p.nome
      )
    )
  );
}
$("btn-mudar-conta").addEventListener("click", () => abrirAssistente());

// ---------- passos guiados: o botão do próximo passo pulsa ----------
function atualizarPassos() {
  const precisaEcra = modoReal() && !estado.captura;
  const bPart = $("btn-partilhar");
  const bIni = $("btn-iniciar");
  bPart.closest("li").hidden = !modoReal();
  bPart.classList.toggle("chamar", precisaEcra);
  bIni.classList.toggle("chamar", !precisaEcra && !estado.ligado);
  bIni.querySelector(".num-passo").hidden = !modoReal();
  $("bloco-plataforma").hidden = !precisaEcra;
  apontarProximoPasso(precisaEcra);
  if (precisaEcra) renderPlataformas();
  $("dica-passo").textContent = estado.ligado
    ? "A vigiar. Só falo quando for importante."
    : precisaEcra
      ? dicaPartilha(estado.config.plataforma)
      : modoReal()
        ? "Tudo pronto. Carrega em Começar."
        : "Carrega em Começar e vê-me a trabalhar.";
}
setInterval(() => !$("app").hidden && atualizarDisciplina(), 15_000);

function atualizarTudo({ anunciar = true } = {}) {
  const antes = estado.progresso;
  estado.progresso = calcularProgresso(estado.trades, estado.config);
  if (anunciar) celebrar(antes, estado.progresso);
  renderProgresso();
  atualizarDisciplina();
  renderDiario();
  renderAbertos();
}

// ---------- mercado simulado (demo) ----------
function reiniciarMercado() {
  const hist = gerarHistorico({ semente: 42 + Math.floor(Math.random() * 1000), n: 44 });
  estado.mercado = hist.estado;
  graficoMercado.definirVelas(hist.velas);
  graficoMercado.definirZonas([]);
}
function tickMercado() {
  const r = avancar(estado.mercado);
  estado.mercado = r.estado;
  graficoMercado.atualizar(r.vela);
  if (estado.mercado.indice > 92) reiniciarMercado();
}

// ---------- copiloto ----------
function estadoCopiloto(texto, ativo = false) {
  $("estado-copiloto").replaceChildren(...(ativo ? [h("span", { class: "ponto" })] : []), texto);
}
function mostrarMiniatura(dataUrl) {
  $("miniatura").replaceChildren(h("img", { src: dataUrl, alt: "Última captura do ecrã partilhado" }));
}

// Efeito de escrita: a fala aparece como se o copiloto a estivesse a dizer.
const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
const escritas = new WeakMap();
function escrever(el, texto, msPorLetra = 14) {
  clearInterval(escritas.get(el));
  let i = 0;
  el.textContent = "";
  el.classList.add("a-escrever");
  const t = setInterval(() => {
    i = Math.min(texto.length, i + 2);
    el.textContent = texto.slice(0, i);
    if (i >= texto.length) {
      clearInterval(t);
      el.classList.remove("a-escrever");
    }
  }, msPorLetra);
  escritas.set(el, t);
}

const NOMES_TENDENCIA = { alta: "estrutura de alta", baixa: "estrutura de baixa", lateral: "lateral", indefinida: "indefinida" };
const MARCA_CHECK = { sim: "SIM", nao: "NÃO", incerto: "?" };

// Primeira leitura depois de escolher a janela: confirma que o Sentinela consegue ler o gráfico.
let temporizadorConfirmacao;
function confirmarLeitura(a) {
  const caixa = $("confirmacao-leitura");
  clearTimeout(temporizadorConfirmacao);
  caixa.hidden = false;
  if (!a.ha_grafico) {
    caixa.className = "conf-leitura erro";
    caixa.replaceChildren(
      h("span", {}, h("b", {}, "Não vejo nenhum gráfico nesta janela. "), "Escolhe a janela ou o separador onde está o gráfico da tua plataforma."),
      h("button", { class: "btn mini primario", type: "button", onclick: () => escolherEcra().then((ok) => ok && ciclo({ forcar: true })) }, "Mudar de janela")
    );
    if (vozLigada()) falar("Não vejo nenhum gráfico nesta janela. Escolhe a janela da tua plataforma.", { urgente: true });
    return;
  }
  const visto = lerTimeframe(a.timeframe);
  const escolhido = estado.config.timeframeMin;
  const conhecido = TIMEFRAMES.find((t) => t.min === visto);
  caixa.className = "conf-leitura ok";
  confetes();
  sons.conquista();
  caixa.replaceChildren(
    h("span", {}, h("b", {}, "✓ Consigo ler o teu gráfico"), `: ${[a.ativo, a.timeframe].filter(Boolean).join(" · ") || "gráfico de preço"}.`),
    conhecido && visto !== escolhido
      ? h("span", { class: "conf-tf" }, `Parece ser de ${conhecido.nome} e escolheste ${escolhido} min. `, h("button", { class: "btn mini secundario", type: "button", onclick: () => usarTimeframe(visto) }, `Usar ${conhecido.nome}`))
      : null
  );
  if (vozLigada()) falar(`Consigo ler o teu gráfico${a.ativo ? `, ${a.ativo}` : ""}. Vou estar atento.`);
  if (!(conhecido && visto !== escolhido)) temporizadorConfirmacao = setTimeout(() => (caixa.hidden = true), 9000);
}
function usarTimeframe(min) {
  estado.config = { ...estado.config, timeframeMin: min };
  gravar("config", estado.config);
  $("sel-tf").value = min;
  agendarLeitura();
  atualizarEstimativa();
  $("confirmacao-leitura").hidden = true;
}

function aplicarAnalise(a) {
  if (estado.confirmarLeitura && modoReal()) {
    estado.confirmarLeitura = false;
    confirmarLeitura(a);
  } else if (!a.ha_grafico && modoReal()) {
    confirmarLeitura(a); // o gráfico desapareceu da janela partilhada
  }
  if (!a.ha_grafico) {
    $("agora-fala").textContent = a.fala || "Não vejo nenhum gráfico no ecrã partilhado.";
    return;
  }
  $("agora-ativo").textContent = a.ativo || "Gráfico";
  $("agora-tf").textContent = a.timeframe || "—";
  const t = $("agora-tendencia");
  t.textContent = NOMES_TENDENCIA[a.tendencia];
  t.className = `tendencia ${a.tendencia}`;
  if (a.fala && a.mudou) escrever($("agora-fala"), a.fala);
  $("agora-obs").replaceChildren(...(a.observacoes.length ? a.observacoes.map((o) => h("li", {}, o)) : [h("li", {}, "—")]));
  $("agora-niveis").replaceChildren(
    ...(a.niveis.length
      ? a.niveis.map((n) => h("li", { class: n.tipo }, h("b", {}, n.preco), ` ${n.tipo === "resistencia" ? "resistência" : n.tipo === "suporte" ? "suporte" : ""}${n.nota ? ` · ${n.nota}` : ""}`))
      : [h("li", {}, "—")])
  );
  $("bloco-checklist").hidden = !a.checklist.length;
  $("agora-checklist").replaceChildren(...a.checklist.map((c) => h("li", {}, h("span", { class: `marca-check ${c.cumprida}` }, MARCA_CHECK[c.cumprida]), c.regra)));
  const setup = estadoSetup(a.checklist);
  const ES = { cumpridas: ["cumpridas", "Todas cumpridas"], parciais: ["parciais", "Por confirmar"], nao_cumpridas: ["nao", "Não cumpridas"], sem_regras: ["", ""] };
  const es = $("estado-setup");
  es.className = `estado-setup ${ES[setup][0]}`;
  es.textContent = ES[setup][1];
  $("bloco-indicacoes").hidden = !a.cenarios.length && !a.invalidacao;
  $("agora-cenarios").replaceChildren(...a.cenarios.map((c) => h("li", {}, h("b", {}, c.condicao), h("span", {}, c.leitura))));
  $("bloco-invalidacao").hidden = !a.invalidacao;
  if (a.invalidacao) {
    $("inv-preco").textContent = a.invalidacao.preco;
    $("inv-razao").textContent = a.invalidacao.razao;
  }
  if (!modoReal()) graficoMercado.definirZonas([...a.niveis, ...(a.invalidacao ? [{ tipo: "invalidacao", preco: a.invalidacao.preco }] : [])]);

  for (const al of a.alertas) adicionarAlerta(al.gravidade, al.mensagem);
  const fala = decidirFala(a, $("sel-modo").value, estado.analiseAnterior);
  if (fala && vozLigada()) falar(fala, { urgente: fala.startsWith("Atenção") });
  estado.analiseAnterior = a;
}

async function escolherEcra() {
  try {
    estado.captura?.parar();
    estado.captura = await iniciarCaptura(() => {
      estado.captura = null;
      atualizarModo();
      if (estado.ligado && modoReal()) {
        pararCopiloto();
        adicionarAlerta("aviso", "A partilha de ecrã terminou e o copiloto parou.");
      }
    }, { superficie: superficieDe(estado.config.plataforma) });
    estado.miniaturaAnterior = null;
    estado.confirmarLeitura = true;
    $("confirmacao-leitura").hidden = true;
    await new Promise((r) => setTimeout(r, 300));
    const f = capturarFrame(estado.captura.video);
    if (f) mostrarMiniatura(f.dataUrl);
    $("btn-partilhar").querySelector(".txt-passo").textContent = "Mudar de janela";
    atualizarModo();
    return true;
  } catch (e) {
    if (e?.name !== "NotAllowedError") adicionarAlerta("aviso", e.message || "Não foi possível partilhar o ecrã.");
    return false;
  }
}
$("btn-partilhar").addEventListener("click", escolherEcra);

async function ciclo({ forcar = false } = {}) {
  if (estado.emCurso || !estado.ligado) return;
  estado.emCurso = true;
  try {
    const frame = estado.captura ? capturarFrame(estado.captura.video) : null;
    if (frame) mostrarMiniatura(frame.dataUrl);

    if (!modoReal()) {
      $("varrimento").classList.add("ativo");
      await new Promise((r) => setTimeout(r, 1100));
      $("varrimento").classList.remove("ativo");
      if (!estado.ligado) return;
      aplicarAnalise(validarAnalise(ANALISES_DEMO[estado.demoIdx++ % ANALISES_DEMO.length]));
      estadoCopiloto(`Demonstração · leitura de exemplo às ${hora()}`, true);
      return;
    }
    if (!frame) {
      estadoCopiloto("À espera da imagem do ecrã…", true);
      return;
    }
    const decisao = deveAnalisar({ miniaturaAtual: frame.miniatura, miniaturaAnterior: estado.miniaturaAnterior, msDesdeUltima: Date.now() - estado.ultimaAnaliseEm });
    if (!forcar && !decisao.analisar) {
      estadoCopiloto(`Ecrã igual desde as ${hora(estado.ultimaAnaliseEm)}. Leitura poupada.`, true);
      return;
    }
    estadoCopiloto("A ler o gráfico…", true);
    $("varrimento").classList.add("ativo");
    estado.abort = new AbortController();
    const r = await ligacaoIA().analisar({
      config: estado.config,
      imagemBase64: frame.base64,
      analiseAnterior: estado.analiseAnterior,
      signal: estado.abort.signal,
    });
    estado.custoSessao += r.custo;
    $("custo-sessao").textContent = `$${estado.custoSessao.toFixed(3)}`;
    estado.miniaturaAnterior = frame.miniatura;
    estado.ultimaAnaliseEm = Date.now();
    if (estado.ligado) {
      aplicarAnalise(r.analise);
      estadoCopiloto(`Última leitura às ${hora()} · próxima no fecho da vela, às ${hora(estado.proximaEm)}`, true);
    }
  } catch (e) {
    if (!estado.ligado) return;
    adicionarAlerta("aviso", e.message);
    estadoCopiloto(e.message, true);
    if (e.fatal) pararCopiloto();
  } finally {
    estado.emCurso = false;
    estado.abort = null;
    $("varrimento").classList.remove("ativo");
  }
}

function botaoIniciar(ligado) {
  const btn = $("btn-iniciar");
  btn.replaceChildren(h("span", { class: "num-passo" }, "2"), icone(ligado ? "i-parar" : "i-play"), h("span", { class: "txt-passo" }, ligado ? "Parar" : "Começar"));
  btn.className = `btn ${ligado ? "parar" : "primario"} largo passo`;
  $("btn-ler-agora").hidden = !ligado || !modoReal();
  $("ao-vivo").hidden = !ligado;
  document.querySelector(".ecra").classList.toggle("a-vigiar", ligado);
}

// A IA lê no fecho de cada vela (alinhado com o relógio), não a cada X segundos.
function agendarLeitura() {
  clearTimeout(estado.timer);
  if (!estado.ligado) return;
  const ms = modoReal() ? msAteFechoVela(estado.config.timeframeMin) : 8000;
  estado.proximaEm = Date.now() + ms;
  estado.timer = setTimeout(async () => {
    await ciclo({ forcar: true });
    agendarLeitura();
  }, ms);
}

async function ligarCopiloto() {
  if (modoReal()) {
    if (!estado.captura && !(await escolherEcra())) return;
    estado.ia = null;
  }
  estado.ligado = true;
  botaoIniciar(true);
  if (!modoReal()) {
    adicionarAlerta("info", "Modo demonstração: mercado simulado e leituras de exemplo. Põe a tua chave da IA nas Definições para o Sentinela ler o teu gráfico real.");
    estado.timerMercado = setInterval(tickMercado, 1500);
  }
  agendarLeitura();
  await ciclo({ forcar: true });
  atualizarPassos();
  if (!passosApontados.has("entrar")) {
    passosApontados.add("entrar");
    setTimeout(() => estado.ligado && holofote($("form-calc"), "Antes de cada trade: entrada e stop aqui"), 4000);
  }
}

function pararCopiloto() {
  estado.ligado = false;
  clearTimeout(estado.timer);
  clearInterval(estado.timerMercado);
  estado.abort?.abort();
  calar();
  botaoIniciar(false);
  estadoCopiloto("Parado.");
  atualizarPassos();
}
$("btn-iniciar").addEventListener("click", () => (estado.ligado ? pararCopiloto() : ligarCopiloto()));
$("btn-ler-agora").addEventListener("click", () => ciclo({ forcar: true }));
for (const t of TIMEFRAMES) $("sel-tf").append(h("option", { value: t.min }, t.nome));
$("sel-tf").addEventListener("change", () => {
  estado.config = { ...estado.config, timeframeMin: Number($("sel-tf").value) };
  gravar("config", estado.config);
  agendarLeitura();
  atualizarEstimativa();
});

// ---------- chat com o copiloto ----------
const historicoChat = [];
let chatEmCurso = false;
function bolha(papel, texto = "") {
  const li = h("li", { class: `msg ${papel}` }, h("span", { class: "msg-texto" }, texto));
  $("chat-mensagens").append(li);
  $("chat-mensagens").scrollTop = $("chat-mensagens").scrollHeight;
  return li.querySelector(".msg-texto");
}
function mensagemBoasVindas() {
  bolha("copiloto", "Pergunta-me o que quiseres sobre o gráfico ou o teu dia. Não te digo para comprar ou vender, mas ajudo-te a decidir com o teu plano.");
}
mensagemBoasVindas();

async function enviarPergunta(pergunta) {
  pergunta = pergunta.trim();
  if (!pergunta || chatEmCurso) return;
  chatEmCurso = true;
  bolha("trader", pergunta);
  historicoChat.push({ papel: "trader", texto: pergunta });
  const alvo = bolha("copiloto");
  alvo.parentElement.classList.add("a-pensar");
  const { alertas, sessao } = avaliar(estado.config, estado.trades);
  const hoje = tradesDoDia(estado.trades, Date.now());
  const pnlHoje = hoje.filter((t) => typeof t.resultado === "number").reduce((a, t) => a + t.resultado, 0);
  const f = folgas(estado.config, estado.trades);
  const limites = `Limites: pode perder ainda ${euros(f.dia.resta)} hoje${f.total ? ` e ${euros(f.total.resta)} no total${estado.config.modoConta === "desafio" ? " do desafio" : ""}` : ""}. Em risco nos trades abertos: ${euros(f.riscoAberto)}.`;
  try {
    let resposta;
    if (/quanto (posso|ainda posso) perder|meu limite|os meus limites/i.test(pergunta)) {
      // pergunta sobre os limites: a resposta vem das contas, não precisa da IA
      await new Promise((r) => setTimeout(r, 350));
      resposta = `${limites.replace("Limites: pode", "Podes")} Se um trade arriscar mais do que isto, aviso-te antes de entrares.`;
      alvo.parentElement.classList.remove("a-pensar");
      escrever(alvo, resposta, 12);
    } else if (!modoReal()) {
      await new Promise((r) => setTimeout(r, 650));
      resposta = respostaDemo(pergunta, estado.analiseAnterior);
      alvo.parentElement.classList.remove("a-pensar");
      escrever(alvo, resposta, 12);
    } else {
      const frame = estado.captura ? capturarFrame(estado.captura.video) : null;
      const contexto = `${contextoDoMomento({ analise: estado.analiseAnterior, pnlHoje, perdasSeguidas: perdasSeguidas(hoje), alertas, sessao })}
${limites}`;
      const ia = ligacaoIA();
      const r = await ia.perguntar({
        config: estado.config,
        sistema: construirSistemaChat(estado.config),
        mensagens: construirMensagensChat({ historico: historicoChat.slice(0, -1), pergunta, contexto, imagemBase64: frame?.base64 }),
        aoReceber: (_, total) => {
          alvo.parentElement.classList.remove("a-pensar");
          if (ia.provedor === "google") escrever(alvo, total, 10); // a Gemini responde de uma vez
          else alvo.textContent = total;
          $("chat-mensagens").scrollTop = $("chat-mensagens").scrollHeight;
        },
      });
      resposta = r.texto;
      estado.custoSessao += r.custo;
      $("custo-sessao").textContent = `${estado.custoSessao.toFixed(3)}`;
    }
    historicoChat.push({ papel: "copiloto", texto: resposta });
    if (vozLigada()) falar(resposta);
  } catch (e) {
    alvo.parentElement.classList.remove("a-pensar");
    alvo.parentElement.classList.add("erro");
    alvo.textContent = e.message;
  } finally {
    chatEmCurso = false;
  }
}
$("form-chat").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("chat-input").value;
  $("chat-input").value = "";
  enviarPergunta(v);
});
document.querySelectorAll(".sugestao").forEach((b) => b.addEventListener("click", () => enviarPergunta(b.textContent)));

// Pergunta por voz (Chrome/Edge): carrega no microfone, fala, a pergunta é enviada sozinha.
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Reconhecimento) $("btn-microfone").hidden = true;
$("btn-microfone").addEventListener("click", () => {
  const rec = new Reconhecimento();
  rec.lang = "pt-PT";
  rec.interimResults = true;
  const btn = $("btn-microfone");
  btn.classList.add("a-ouvir");
  rec.onresult = (ev) => {
    const texto = [...ev.results].map((r) => r[0].transcript).join("");
    $("chat-input").value = texto;
    if (ev.results[ev.results.length - 1].isFinal) {
      $("chat-input").value = "";
      enviarPergunta(texto);
    }
  };
  rec.onerror = () => adicionarAlerta("aviso", "Não consegui ouvir. Verifica a permissão do microfone.");
  rec.onend = () => btn.classList.remove("a-ouvir");
  rec.start();
});

// ---------- antes de entrar: tamanho da posição e verificação das regras ----------
let ultimoCalculo = null;
$("form-calc").addEventListener("submit", (e) => {
  e.preventDefault();
  const { saldo, riscoMaxPct } = estado.config;
  const entrada = num("calc-entrada");
  const stop = num("calc-stop");
  const r = calcularPosicao({ saldo, riscoPct: riscoMaxPct, entrada, stop, alvo: num("calc-alvo") });
  const caixa = $("calc-resultado");
  caixa.hidden = false;
  if (!r.ok && !r.quantidade) {
    caixa.replaceChildren(h("ul", { class: "mensagens" }, r.erros.map((m) => h("li", { class: "critico" }, m))));
    return;
  }
  const v = verificarNovoTrade(estado.config, estado.trades, { entrada, stop, quantidade: r.quantidade });
  const mensagens = [...r.erros.map((m) => ({ gravidade: "critico", mensagem: m })), ...r.avisos.map((m) => ({ gravidade: "aviso", mensagem: m })), ...v.alertas.filter((a) => a.gravidade !== "info")];
  const pode = v.podeEntrar && r.ok;
  ultimoCalculo = { ativo: estado.analiseAnterior?.ativo || "", direcao: r.direcao, entrada, stop, alvo: num("calc-alvo"), quantidade: r.quantidade };
  if (!pode && vozLigada()) falar(mensagens.find((m) => m.gravidade === "critico")?.mensagem ?? v.bloqueio?.motivo, { urgente: true });
  if (!pode) sons.alerta();
  caixa.replaceChildren(
    h("div", { class: `veredito ${pode ? "ok" : "nao"}` }, pode ? "Cumpre as tuas regras." : "Quebra as tuas regras."),
    h(
      "dl",
      { class: "kv" },
      h("dt", {}, `Quantidade (${r.direcao})`), h("dd", {}, r.quantidade.toLocaleString("pt-PT")),
      h("dt", {}, "Perdes se o stop for atingido"), h("dd", { class: "neg" }, euros(-r.riscoEuros)),
      r.rr != null && [h("dt", {}, "Risco / retorno"), h("dd", {}, `1 : ${r.rr.toLocaleString("pt-PT")}`)],
      r.rr != null && [h("dt", {}, "Acerto mínimo para não perder"), h("dd", {}, `${taxaAcertoMinima(r.rr).toLocaleString("pt-PT")}%`)]
    ),
    mensagens.length ? h("ul", { class: "mensagens" }, mensagens.map((m) => h("li", { class: m.gravidade }, m.mensagem))) : null,
    h("p", { class: "pequeno" }, `Calculado para arriscar ${estado.config.riscoMaxPct}% da conta (${euros(r.riscoEuros)}). A decisão de entrar é tua.`),
    h("button", { class: `btn ${pode ? "primario" : "secundario"} largo`, type: "button", onclick: registarAberto }, pode ? "Entrei: registar o trade" : "Entrei mesmo assim: registar")
  );
});
function registarAberto() {
  if (!ultimoCalculo) return;
  const t = novoTrade({ ...ultimoCalculo, seguiuPlano: true });
  const v = verificarNovoTrade(estado.config, estado.trades, t);
  if (!v.podeEntrar) t.seguiuPlano = false; // entrou contra as próprias regras: fica marcado
  estado.trades.push(t);
  $("form-calc").reset();
  $("calc-resultado").hidden = true;
  ultimoCalculo = null;
  guardarTrades();
  toast([h("b", {}, "Trade registado"), h("span", {}, "Quando fechar, carrega em Fechar e escreve o resultado.")]);
}
function renderAbertos() {
  const abertos = estado.trades.filter((t) => typeof t.resultado !== "number").sort((a, b) => b.abertoEm - a.abertoEm);
  $("abertos").hidden = !abertos.length;
  $("lista-abertos").replaceChildren(
    ...abertos.map((t) =>
      h(
        "li",
        {},
        h("span", { class: "mono" }, h("b", { class: t.direcao === "compra" ? "pos" : "neg" }, t.direcao === "compra" ? "▲" : "▼"), ` ${t.ativo || "trade"} · ${t.entrada} · stop ${t.stop ?? "—"}`),
        h("span", { class: "acao-aberto" }, h("button", { class: "btn mini primario", type: "button", onclick: (ev) => fecharTradeUI(t.id, ev.currentTarget) }, "Fechar"))
      )
    )
  );
}

// ---------- diário ----------
function guardarTrades() {
  gravar("trades", estado.trades);
  atualizarTudo();
}


$("form-trade").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = novoTrade({
    ativo: $("t-ativo").value,
    direcao: $("t-direcao").value,
    entrada: $("t-entrada").value,
    stop: $("t-stop").value,
    quantidade: $("t-qtd").value,
    resultado: $("t-resultado").value,
    seguiuPlano: $("t-plano").checked,
    nota: $("t-nota").value,
  });
  if (t.resultado == null) {
    const v = verificarNovoTrade(estado.config, estado.trades, t);
    for (const a of v.alertas) adicionarAlerta(a.gravidade, a.mensagem);
    if (!v.podeEntrar && vozLigada()) falar(v.alertas.find((a) => a.gravidade === "critico")?.mensagem ?? v.bloqueio?.motivo, { urgente: true });
  }
  estado.trades.push(t);
  e.target.reset();
  $("t-plano").checked = true;
  guardarTrades();
});

function renderDiario() {
  const hoje = tradesDoDia(estado.trades, Date.now());
  const e = estatisticas(hoje);
  const cor = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
  const cartao = (rotulo, valor, classe = "") => h("div", { class: "estat" }, h("span", {}, rotulo), h("b", { class: classe }, valor));
  const discHoje = estado.progresso?.hoje;
  $("estatisticas").replaceChildren(
    cartao("Resultado hoje", euros(e.pnl), cor(e.pnl)),
    cartao("Trades hoje", `${e.total}${e.abertos ? ` + ${e.abertos}` : ""}`),
    cartao("Taxa de acerto", e.total ? `${e.winRate.toLocaleString("pt-PT")}%` : "—"),
    cartao("Payoff", e.payoff != null ? e.payoff.toLocaleString("pt-PT") : "—"),
    cartao("Disciplina hoje", discHoje != null ? String(discHoje) : "—", discHoje == null ? "" : discHoje >= 80 ? "pos" : "neg"),
    cartao("Expectativa / trade", e.total ? euros(e.expectativa) : "—", cor(e.expectativa))
  );
  $("relatorio").replaceChildren(...relatorioDiario(estado.trades, estado.config).linhas.slice(1).map((l) => h("p", {}, l)));

  const fechados = estado.trades.filter((t) => typeof t.resultado === "number");
  $("capital-vazio").hidden = fechados.length > 0;
  $("grafico-capital").hidden = !fechados.length;
  curvaCapital?.definir(fechados);
  const dias = estado.progresso?.porDia ?? [];
  $("disciplina-vazio").hidden = dias.length > 0;
  $("grafico-disciplina").hidden = !dias.length;
  graficoDisciplina?.definir(dias);
  requestAnimationFrame(() => {
    curvaCapital?.ajustar();
    graficoDisciplina?.ajustar();
  });

  const linhas = [...estado.trades].sort((a, b) => b.abertoEm - a.abertoEm).slice(0, 200);
  $("tabela-trades").replaceChildren(
    ...(linhas.length
      ? linhas.map((t) =>
          h(
            "tr",
            {},
            h("td", {}, `${new Date(t.abertoEm).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })} ${hora(t.abertoEm)}`),
            h("td", {}, t.ativo, eExemplo(t) ? h("span", { class: "tag-exemplo" }, "exemplo") : null),
            h("td", { class: t.direcao === "compra" ? "pos" : "neg" }, t.direcao === "compra" ? "▲ compra" : "▼ venda"),
            h("td", {}, t.entrada ?? "—"),
            h("td", { class: t.stop ? "" : "neg" }, t.stop ?? "sem stop"),
            h("td", {}, t.quantidade ?? "—"),
            h("td", { class: cor(t.resultado ?? 0) }, t.resultado == null ? "aberto" : euros(t.resultado)),
            h("td", {}, h("span", { class: `tag-plano ${t.seguiuPlano ? "sim" : "nao"}` }, t.seguiuPlano ? "no plano" : "fora")),
            h(
              "td",
              {},
              t.resultado == null && h("button", { class: "btn mini", type: "button", onclick: (ev) => fecharTradeUI(t.id, ev.currentTarget) }, "Fechar"),
              " ",
              h("button", { class: "btn mini secundario", type: "button", title: "Apagar trade", "aria-label": "Apagar trade", onclick: () => apagarTrade(t.id) }, "✕")
            )
          )
        )
      : [h("tr", {}, h("td", { colspan: 9, class: "vazio" }, "Ainda não há trades. Regista o primeiro, ou carrega o diário de exemplo para veres tudo a funcionar."))])
  );
}

function fecharTradeUI(id, botao) {
  const celula = botao.parentElement;
  const input = h("input", { type: "number", step: "any", placeholder: "resultado €", inputmode: "decimal", "aria-label": "Resultado do trade em euros (negativo se perdeste)", style: "width:110px;padding:4px 8px" });
  const ok = h("button", { class: "btn mini primario", type: "button" }, "OK");
  const confirmar = () => {
    const v = Number(String(input.value).replace(",", "."));
    if (input.value === "" || Number.isNaN(v)) return input.focus();
    estado.trades = estado.trades.map((t) => (t.id === id ? fecharTrade(t, v) : t));
    guardarTrades();
  };
  ok.addEventListener("click", confirmar);
  input.addEventListener("keydown", (e) => e.key === "Enter" && confirmar());
  celula.replaceChildren(input, " ", ok);
  input.focus();
}
function apagarTrade(id) {
  estado.trades = estado.trades.filter((t) => t.id !== id);
  gravar("trades", estado.trades);
  atualizarTudo({ anunciar: false });
}
function pedirConfirmacao(texto, rotulo, acao) {
  const caixa = $("confirmacao");
  caixa.replaceChildren(
    h("span", {}, texto),
    h("button", { class: "btn mini perigo", type: "button", onclick: () => { caixa.hidden = true; acao(); } }, rotulo),
    h("button", { class: "btn mini secundario", type: "button", onclick: () => (caixa.hidden = true) }, "Cancelar")
  );
  caixa.hidden = false;
}
$("btn-apagar-diario").addEventListener("click", () =>
  pedirConfirmacao("Apagar todos os trades do diário? Não dá para desfazer.", "Apagar tudo", () => {
    estado.trades = [];
    gravar("trades", estado.trades);
    atualizarTudo({ anunciar: false });
  })
);
$("btn-exemplo").addEventListener("click", () => {
  const reais = estado.trades.filter((t) => !eExemplo(t));
  estado.trades = [...reais, ...tradesExemplo()];
  guardarTrades();
  adicionarAlerta("info", "Diário de exemplo carregado: 11 trades de 6 dias, marcados como exemplo. Vê a curva de capital, a disciplina por dia e as patentes.");
});
$("btn-csv").addEventListener("click", () => {
  const blob = new Blob(["﻿" + exportarCSV(estado.trades)], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `sentinela-diario-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- apoiar ----------
const OPCOES_APOIO = [
  { chave: "kofi", nome: "Ko-fi", nota: "cartão ou PayPal" },
  { chave: "buymeacoffee", nome: "Buy Me a Coffee", nota: "cartão" },
  { chave: "paypal", nome: "PayPal", nota: "escolhes o valor" },
  { chave: "stripe", nome: "cartão", nota: "escolhes o valor" },
];
const apoios = OPCOES_APOIO.filter((o) => APOIO[o.chave]);
$("apoio-vazio").hidden = apoios.length > 0;
$("apoio-botoes").replaceChildren(
  ...apoios.map((o) => h("a", { class: "btn secundario btn-apoio", href: APOIO[o.chave], target: "_blank", rel: "noopener" }, icone("i-cafe"), `Apoiar com ${o.nome}`, h("small", {}, o.nota)))
);

// ---------- definições ----------
const NOMES_PROVEDOR = { anthropic: "Anthropic (Claude)", google: "Google (Gemini)" };
let modeloContaEscolhido = null;

function cartoesConta(alvo, selecionado, aoEscolher) {
  alvo.replaceChildren(
    ...MODELOS_CONTA.map((m) =>
      h(
        "button",
        { type: "button", role: "radio", "aria-checked": String(m.id === selecionado), class: `opcao-conta ${m.id === selecionado ? "ativa" : ""}`, onclick: () => aoEscolher(m.id) },
        h("b", {}, m.nome),
        h("span", {}, m.desc)
      )
    )
  );
}

function escolherModeloConta(id) {
  modeloContaEscolhido = id;
  const m = MODELOS_CONTA.find((x) => x.id === id);
  $("d-perda").value = m.regras.perdaDiariaMaxPct;
  $("d-perdatotal").value = m.regras.perdaTotalMaxPct;
  $("d-metadesafio").value = m.regras.metaDesafioPct;
  $("d-risco").value = m.regras.riscoMaxPct;
  $("rotulo-saldo").textContent = m.regras.modoConta === "desafio" ? "Tamanho da conta do desafio (€)" : "Saldo da conta (€)";
  cartoesConta($("d-modelos-conta"), id, escolherModeloConta);
}

function opcoesModelo() {
  const chave = $("d-apikey").value.trim();
  const p = provedorDaChave(chave);
  const sel = $("d-modelo");
  const atual = sel.value || estado.modelo;
  sel.replaceChildren(...Object.entries(MODELOS).filter(([, m]) => !p || m.provedor === p).map(([id, m]) => h("option", { value: id }, m.nome)));
  sel.value = modeloParaChave(chave, atual);
  $("d-provedor").textContent = !chave ? "" : p ? `Chave reconhecida: ${NOMES_PROVEDOR[p]}.` : "Não reconheço esta chave. As chaves da Google começam por AIza e as da Anthropic por sk-ant-.";
  $("d-provedor").className = `ajuda ${chave && !p ? "erro" : chave ? "ok-txt" : ""}`;
  atualizarEstimativa();
}
$("d-apikey").addEventListener("input", opcoesModelo);

function preencherDefinicoes() {
  const c = estado.config;
  modeloContaEscolhido = c.modeloConta ?? (c.modoConta === "desafio" ? "classico" : "propria");
  cartoesConta($("d-modelos-conta"), modeloContaEscolhido, escolherModeloConta);
  $("rotulo-saldo").textContent = c.modoConta === "desafio" ? "Tamanho da conta do desafio (€)" : "Saldo da conta (€)";
  $("d-saldo").value = c.saldo;
  $("d-risco").value = c.riscoMaxPct;
  $("d-perda").value = c.perdaDiariaMaxPct;
  $("d-perdatotal").value = c.perdaTotalMaxPct;
  $("d-metadesafio").value = c.metaDesafioPct;
  $("d-maxtrades").value = c.maxTradesDia;
  $("d-pausaperdas").value = c.pausaAposPerdas;
  $("d-minpausa").value = c.minutosPausa;
  $("d-regras").value = c.regrasPessoais;
  $("d-hini").value = c.horaInicio;
  $("d-hfim").value = c.horaFim;
  $("d-meta").value = c.metaDiariaPct;
  $("d-euforia").value = c.avisoAposGanhos;
  $("d-noticias").value = c.noticias;
  $("d-minnoticia").value = c.minutosNoticia;
  $("sel-tf").value = c.timeframeMin;
  $("d-apikey").value = estado.apiKey;
  $("d-modelo").value = estado.modelo;
  $("info-licenca").replaceChildren(
    licencaValida()
      ? `Licença ativa: ${estado.licenca.slice(0, 9)}…`
      : h("span", {}, "Sem licença: só a demonstração está disponível. ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); mostrarLicenca(); } }, "Ativar licença"))
  );
  $("d-apikey").disabled = !licencaValida();
  document.querySelectorAll(".so-chave").forEach((el) => (el.hidden = !!estado.servidor));
  $("aviso-teste").hidden = !estado.servidor;
  if (estado.servidor) $("info-licenca").textContent = "Modo de teste: não precisas de licença.";
  opcoesModelo();
  $("info-voz").textContent = !vozDisponivel()
    ? "Este browser não tem voz. Usa o Microsoft Edge ou o Chrome."
    : vozNatural()
      ? `Voz em uso: ${nomeVoz()}. É uma voz natural.`
      : `Voz em uso: ${nomeVoz()}. Para uma voz muito mais natural, abre o Sentinela no Microsoft Edge: tem vozes neurais grátis em português.`;
}

function atualizarEstimativa() {
  const m = MODELOS[$("d-modelo").value] ?? MODELOS[estado.modelo];
  const tf = estado.config.timeframeMin;
  // ~3.500 tokens de entrada (imagem + instruções) e ~400 de saída por leitura.
  const porLeitura = (3500 * m.entradaPorM + 400 * m.saidaPorM) / 1e6;
  const porHora = porLeitura * leiturasPorHora(tf);
  $("estimativa-custo").textContent =
    `Custo estimado com ${m.nome.split(" (")[0]}: ~$${porLeitura.toFixed(4)} por leitura. Com velas de ${tf} min, ~$${porHora.toFixed(2)} por hora de sessão (~$${(porHora * 4 * 21).toFixed(0)} por mês a 4 h por dia). ` +
    "As perguntas no chat são cobradas à parte.";
}
$("d-modelo").addEventListener("change", atualizarEstimativa);

$("form-defs").addEventListener("submit", (e) => {
  e.preventDefault();
  const positivo = (id, padrao) => {
    const v = num(id);
    return v != null && v > 0 ? v : padrao;
  };
  const naoNegativo = (id, padrao) => Math.max(0, num(id) ?? padrao);
  const mudouConta = modeloContaEscolhido !== estado.config.modeloConta;
  const base = mudouConta ? aplicarModelo(estado.config, modeloContaEscolhido) : estado.config;
  estado.config = {
    ...base,
    saldo: positivo("d-saldo", CONFIG_PADRAO.saldo),
    riscoMaxPct: positivo("d-risco", CONFIG_PADRAO.riscoMaxPct),
    perdaDiariaMaxPct: positivo("d-perda", CONFIG_PADRAO.perdaDiariaMaxPct),
    perdaTotalMaxPct: naoNegativo("d-perdatotal", 0),
    metaDesafioPct: naoNegativo("d-metadesafio", 0),
    maxTradesDia: Math.round(positivo("d-maxtrades", CONFIG_PADRAO.maxTradesDia)),
    pausaAposPerdas: Math.round(positivo("d-pausaperdas", CONFIG_PADRAO.pausaAposPerdas)),
    minutosPausa: positivo("d-minpausa", CONFIG_PADRAO.minutosPausa),
    regrasPessoais: $("d-regras").value.trim(),
    horaInicio: $("d-hini").value || CONFIG_PADRAO.horaInicio,
    horaFim: $("d-hfim").value || CONFIG_PADRAO.horaFim,
    metaDiariaPct: naoNegativo("d-meta", CONFIG_PADRAO.metaDiariaPct),
    avisoAposGanhos: Math.round(naoNegativo("d-euforia", CONFIG_PADRAO.avisoAposGanhos)),
    noticias: $("d-noticias").value.trim(),
    minutosNoticia: naoNegativo("d-minnoticia", CONFIG_PADRAO.minutosNoticia),
  };
  gravar("config", estado.config);
  if (licencaValida()) {
    estado.apiKey = $("d-apikey").value.trim();
    estado.apiKey ? gravar("apikey", estado.apiKey) : apagar("apikey");
  }
  estado.modelo = modeloParaChave(estado.apiKey, $("d-modelo").value);
  gravar("modelo", estado.modelo);
  if (estado.ligado) pararCopiloto();
  estado.ia = null;
  atualizarModo();
  atualizarTudo({ anunciar: false });
  preencherDefinicoes();
  $("defs-ok").hidden = false;
  setTimeout(() => ($("defs-ok").hidden = true), 2500);
});

$("btn-testar-voz").addEventListener("click", () => {
  if (!vozDisponivel()) return adicionarAlerta("aviso", "Este browser não suporta voz. Usa o Edge ou o Chrome.");
  falar("Olá, sou o Sentinela. Vou estar atento ao teu gráfico e às tuas regras. Só falo quando for importante.", { urgente: true });
});
$("btn-assistente").addEventListener("click", () => abrirAssistente());

/// ---------- criar e testar a chave da IA ----------
function mostrarResultadoChave(el, r) {
  el.hidden = false;
  el.className = `resultado-chave ${r.ok ? "ok" : r.aTestar ? "" : "erro"}`;
  el.textContent = r.aTestar ? "A testar a ligação…" : `${r.ok ? "✓" : "✕"} ${r.mensagem}`;
}

$("btn-testar-chave").addEventListener("click", async () => {
  const el = $("resultado-chave");
  if (!licencaValida()) return mostrarResultadoChave(el, { ok: false, mensagem: "Ativa primeiro a tua licença para usares a tua chave." });
  mostrarResultadoChave(el, { aTestar: true });
  mostrarResultadoChave(el, await testarChave($("d-apikey").value));
});

function abrirGuiaChave() {
  $("gc-chave").value = $("d-apikey").value || estado.apiKey;
  $("gc-resultado").hidden = true;
  $("guia-chave").hidden = false;
}
$("btn-guia-chave").addEventListener("click", abrirGuiaChave);
$("gc-fechar").addEventListener("click", () => ($("guia-chave").hidden = true));
document.querySelectorAll(".gc-aba").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".gc-aba").forEach((x) => {
      x.classList.toggle("ativa", x === b);
      x.setAttribute("aria-selected", String(x === b));
    });
    $("gc-google").hidden = b.dataset.gc !== "google";
    $("gc-anthropic").hidden = b.dataset.gc !== "anthropic";
  })
);
$("gc-testar").addEventListener("click", async () => {
  const el = $("gc-resultado");
  if (!licencaValida()) return mostrarResultadoChave(el, { ok: false, mensagem: "Estás na demonstração. Ativa a tua licença para usares a tua chave." });
  const chave = $("gc-chave").value.trim();
  const botao = $("gc-testar");
  botao.disabled = true;
  mostrarResultadoChave(el, { aTestar: true });
  const r = await testarChave(chave);
  botao.disabled = false;
  mostrarResultadoChave(el, r);
  if (!r.ok) return;
  estado.apiKey = chave;
  gravar("apikey", chave);
  estado.modelo = r.modelo;
  gravar("modelo", r.modelo);
  estado.ia = null;
  preencherDefinicoes();
  atualizarModo();
  setTimeout(() => {
    $("guia-chave").hidden = true;
    mudarSeparador("copiloto");
    toast([h("b", {}, "Chave guardada"), h("span", {}, "Agora carrega em 1 e escolhe a janela do teu gráfico.")]);
  }, 1200);
});

// ---------- configuração inicial em 3 passos ----------
const ass = { passo: 0, conta: "classico", saldo: 10000, tf: 5 };
function abrirAssistente() {
  ass.passo = 0;
  ass.conta = estado.config.modeloConta ?? "classico";
  ass.saldo = !estado.config.modeloConta && estado.config.saldo === CONFIG_PADRAO.saldo ? 10000 : estado.config.saldo;
  ass.tf = estado.config.timeframeMin;
  $("assistente").hidden = false;
  renderAssistente();
}
function renderAssistente() {
  const corpo = $("ass-corpo");
  $("ass-passo").textContent = `Passo ${ass.passo + 1} de 3`;
  document.querySelectorAll(".ass-progresso i").forEach((el, i) => el.classList.toggle("feito", i <= ass.passo));
  $("ass-voltar").hidden = ass.passo === 0;
  $("ass-seguinte").textContent = ass.passo === 2 ? "Começar a usar" : "Seguinte";
  if (ass.passo === 0) {
    $("ass-titulo").textContent = "Como vais operar?";
    const grelha = h("div", { class: "opcoes-conta", role: "radiogroup", "aria-label": "Tipo de conta" });
    cartoesConta(grelha, ass.conta, (id) => {
      const paraDesafio = MODELOS_CONTA.find((m) => m.id === id).regras.modoConta === "desafio";
      if (paraDesafio && ass.saldo === 1000) ass.saldo = 10000; // valores típicos de cada caso
      if (!paraDesafio && ass.saldo === 10000) ass.saldo = 1000;
      ass.conta = id;
      renderAssistente();
    });
    const desafio = MODELOS_CONTA.find((m) => m.id === ass.conta).regras.modoConta === "desafio";
    const saldo = h("input", { type: "number", min: 1, step: "any", value: ass.saldo, inputmode: "decimal", id: "ass-saldo" });
    saldo.addEventListener("input", () => (ass.saldo = Number(saldo.value)));
    corpo.replaceChildren(
      grelha,
      h("label", {}, desafio ? "Tamanho da conta do desafio (€)" : "Saldo da tua conta (€)", saldo),
      h("p", { class: "pequeno" }, "Podes afinar todas as regras depois, nas Definições.")
    );
  } else if (ass.passo === 1) {
    $("ass-titulo").textContent = "De quanto tempo é cada vela do teu gráfico?";
    corpo.replaceChildren(
      h(
        "div",
        { class: "opcoes-tf" },
        ...TIMEFRAMES.map((t) =>
          h("button", { type: "button", class: `opcao-conta ${t.min === ass.tf ? "ativa" : ""}`, onclick: () => { ass.tf = t.min; renderAssistente(); } }, h("b", {}, t.nome))
        )
      ),
      h("p", { class: "pequeno" }, "O Sentinela lê o gráfico sempre que uma vela fecha. É quando há informação nova, e assim a IA custa pouco.")
    );
  } else {
    $("ass-titulo").textContent = "Está tudo pronto";
    corpo.replaceChildren(
      h(
        "ol",
        { class: "ass-resumo" },
        modoReal() && h("li", {}, h("span", { class: "ass-num" }, "1"), h("b", {}, "Escolhe o gráfico")),
        h("li", {}, h("span", { class: "ass-num" }, modoReal() ? "2" : "1"), h("b", {}, "Carrega em Começar")),
        h("li", {}, h("span", { class: "ass-num" }, "✓"), h("b", {}, "Eu aviso-te antes do erro"))
      ),
      modoReal()
        ? ""
        : h("p", { class: "pequeno" }, licencaValida() ? "Falta só a chave da IA. Ao carregares em Começar a usar, mostramos-te como a criar em 2 minutos." : "Estás em demonstração. Para ler o teu gráfico real, ativa a licença e põe a tua chave da IA nas Definições.")
    );
  }
}
$("ass-voltar").addEventListener("click", () => {
  ass.passo = Math.max(0, ass.passo - 1);
  renderAssistente();
});
$("ass-seguinte").addEventListener("click", () => {
  if (ass.passo < 2) {
    ass.passo++;
    return renderAssistente();
  }
  const mudou = ass.conta !== estado.config.modeloConta;
  estado.config = mudou
    ? aplicarModelo(estado.config, ass.conta, { saldo: ass.saldo })
    : { ...estado.config, saldo: ass.saldo > 0 ? ass.saldo : estado.config.saldo };
  estado.config.timeframeMin = ass.tf;
  gravar("config", estado.config);
  gravar("assistente", true);
  $("assistente").hidden = true;
  preencherDefinicoes();
  atualizarTudo({ anunciar: false });
  mudarSeparador("copiloto");
  atualizarPassos();
  if (estado.ligado) agendarLeitura();
  if (licencaValida() && !estado.apiKey) {
    mudarSeparador("definicoes");
    abrirGuiaChave();
  }
});

// ---------- arranque ----------
botaoIniciar(false);
(async () => {
  const servidor = await detetarServidor();
  if (servidor) {
    const doLink = new URLSearchParams(location.search).get("codigo");
    if (doLink) {
      estado.codigo = doLink;
      gravar("codigo", doLink);
      history.replaceState(null, "", location.pathname); // tira o código da barra de endereço
    }
    estado.servidor = servidor;
    if (servidor.voz) usarVozExterna((texto) => ligacaoIA().voz(texto));
    document.querySelector(".custo").hidden = true;
    return entrarApp();
  }
  if (licencaValida()) entrarApp();
  else mostrarLicenca();
})();
