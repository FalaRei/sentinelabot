// Chat com o copiloto: o trader pergunta (por texto ou voz) sobre o gráfico que está no ecrã.
// Mesmos limites legais da leitura automática: explica, mostra cenários, nunca dá ordens.

import { estadoSetup } from "./analysis.js";

export const MAX_HISTORICO = 8; // últimas mensagens enviadas como contexto (custo controlado)

export function construirSistemaChat(config) {
  const regras = (config.regrasPessoais || "").trim();
  return `És o Sentinela, o copiloto de disciplina de um trader de day trade. Ele está a operar agora e faz-te perguntas sobre o gráfico no ecrã (recebes a captura mais recente) e sobre o dia dele.

Como respondes:
- Português de Portugal, tratamento por tu, frases curtas. Máximo 120 palavras, porque ele está a operar.
- Texto simples, sem markdown: nada de asteriscos, cardinais ou tabelas. A resposta também é lida em voz alta.
- Explicas o que o gráfico mostra, o que significam os indicadores visíveis e como um trader disciplinado pensaria a situação.
- Podes descrever cenários condicionais, sempre dos dois lados, e a zona onde a leitura atual deixa de valer.
- Ajudas com gestão de risco: tamanho da posição, distância ao stop, relação risco/retorno, usando os números que ele te der.
- Lembras as regras dele e o estado do dia quando for relevante (perdas seguidas, limite diário, horário, notícias).

Limites que nunca quebras:
- Nunca dizes para comprar, vender, entrar, sair ou manter. Nunca dizes "deves" nem "recomendo" sobre uma operação.
- Nunca prevês o preço, nunca dás probabilidades de subida ou descida, nunca dás alvos de lucro.
- Se ele perguntar "compro?", "vendo?", "entro agora?" ou parecido, respondes com a checklist: as regras dele estão cumpridas? onde está o stop? qual é o risco em euros? está dentro do horário e longe de notícias? E terminas com "a decisão é tua".
- Se ele estiver em tilt (perdas seguidas, pressa, vontade de recuperar), dizes-lho com calma e lembras a pausa.
- Não inventes valores que não consegues ler na imagem.

Regras de risco do trader: conta de ${config.saldo} €, risco máximo ${config.riscoMaxPct}% por trade, perda máxima diária ${config.perdaDiariaMaxPct}%, horário ${config.horaInicio}–${config.horaFim}.
${regras ? `Estratégia do trader:\n${regras}` : "O trader ainda não escreveu a estratégia dele."}`;
}

/** Resumo do momento (vai como texto junto com a pergunta). */
export function contextoDoMomento({ analise, pnlHoje = 0, perdasSeguidas = 0, alertas = [], sessao = null }) {
  const linhas = [];
  linhas.push(`Resultado de hoje: ${pnlHoje >= 0 ? "+" : ""}${pnlHoje.toFixed(2)} €. Perdas seguidas: ${perdasSeguidas}.`);
  if (sessao) linhas.push(sessao.dentro ? `Dentro do horário de operação.${sessao.noticia ? ` Notícia às ${sessao.noticia.hora} (${sessao.noticia.nome}).` : ""}` : "Fora do horário de operação.");
  const ativos = alertas.filter((a) => a.gravidade !== "info").map((a) => a.mensagem);
  if (ativos.length) linhas.push(`Avisos ativos: ${ativos.join(" | ")}`);
  if (analise) {
    linhas.push(`Última leitura: ${analise.ativo || "gráfico"} ${analise.timeframe || ""}, estrutura ${analise.tendencia}. "${analise.fala}"`);
    if (analise.invalidacao) linhas.push(`Zona de invalidação: ${analise.invalidacao.preco}.`);
    if (analise.checklist?.length) linhas.push(`Regras: ${analise.checklist.map((c) => `${c.regra} = ${c.cumprida}`).join("; ")}.`);
  }
  return linhas.join("\n");
}

/** Mensagens para a API: histórico curto + pergunta nova com a captura (se houver). */
export function construirMensagensChat({ historico = [], pergunta, contexto, imagemBase64 = null, mediaType = "image/jpeg" }) {
  const antigas = historico.slice(-MAX_HISTORICO).map((m) => ({ role: m.papel === "trader" ? "user" : "assistant", content: m.texto }));
  // a conversa tem de começar no utilizador e alternar
  while (antigas.length && antigas[0].role !== "user") antigas.shift();
  const conteudo = [];
  if (imagemBase64) conteudo.push({ type: "image", source: { type: "base64", media_type: mediaType, data: imagemBase64 } });
  conteudo.push({ type: "text", text: `${contexto}\n\nPergunta: ${pergunta}` });
  return [...antigas, { role: "user", content: conteudo }];
}

const PEDE_ORDEM = /\b(compro|vendo|entro|saio|devo (comprar|vender|entrar|sair)|é para (comprar|vender|entrar)|vale a pena entrar|compra ou vende)\b/i;

/** Respostas da demonstração (sem chave da API). */
export function respostaDemo(pergunta, analise) {
  const p = String(pergunta || "").toLowerCase();
  const setup = analise ? estadoSetup(analise.checklist) : "sem_regras";
  if (PEDE_ORDEM.test(p)) {
    const regras = setup === "cumpridas" ? "As tuas regras estão todas cumpridas neste gráfico." : setup === "nao_cumpridas" ? "Pelo menos uma das tuas regras não está cumprida." : "Ainda há regras por confirmar.";
    return `Não te digo para entrar ou não, mas posso ajudar-te a decidir. ${regras} Onde fica o teu stop? ${analise?.invalidacao ? `A estrutura deixa de valer abaixo de ${analise.invalidacao.preco}.` : ""} Quanto perdes em euros se for atingido? Estás dentro do horário e longe de notícias? Se tudo bate certo com o teu plano, a decisão é tua.`;
  }
  if (/rsi|indicador|sobrecompr|sobrevend/.test(p)) return "O RSI mede a força dos últimos movimentos, de 0 a 100. Acima de 70 diz-se sobrecomprado: o preço subiu depressa. Não quer dizer que vá cair, quer dizer que está esticado e que um stop teria de ficar mais longe.";
  if (/stop|onde.*(ponho|meto)|invalida/.test(p)) return analise?.invalidacao ? `A leitura atual deixa de valer abaixo de ${analise.invalidacao.preco} (${analise.invalidacao.razao.toLowerCase()}). Um stop técnico costuma ficar para lá dessa zona. Usa a calculadora para ver quanto podes comprar para arriscar só ${"o teu limite"}.` : "Um stop técnico fica para lá da zona onde a tua ideia deixa de fazer sentido, normalmente o último fundo numa compra. Depois calcula o tamanho para arriscar só o teu limite.";
  if (/tendên|tendenc|estrutura/.test(p)) return analise ? `A estrutura visível é de ${analise.tendencia}. ${analise.fala}` : "Ainda não li nenhum gráfico. Inicia o copiloto primeiro.";
  if (/perdi|perda|recuperar|tilt|raiva/.test(p)) return "Respira. Depois de perder, a vontade de recuperar logo é o erro mais caro do day trade. Cumpre a pausa e volta só quando um setup do teu plano aparecer. O dia não tem de ser salvo hoje.";
  return "Na demonstração respondo a perguntas sobre RSI, tendência, stop, tilt e se deves entrar. Com a tua chave da API, respondo a qualquer pergunta a olhar para o teu gráfico real.";
}
