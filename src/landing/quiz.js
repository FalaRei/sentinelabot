// Teste "Que tipo de trader és?": isco da página de vendas. Cada resposta soma pontos
// a um perfil e tem uma nota de disciplina (0-100).

export const PERFIS = {
  vinganca: {
    id: "vinganca",
    nome: "O Vingativo",
    descricao: "Lidas mal com a perda e tentas recuperá-la logo a seguir. É o padrão que mais transforma um dia mau num desastre.",
    regra: "Depois de 2 perdas seguidas, 15 minutos longe do ecrã. Sem exceções.",
  },
  heroi: {
    id: "heroi",
    nome: "O Herói",
    descricao: "Tens convicção e arriscas grande quando sentes que é a tal. Basta uma sequência normal de perdas para a conta não aguentar.",
    regra: "Nunca arriscar mais de 1% da conta num trade, por mais certeza que tenhas.",
  },
  esperanca: {
    id: "esperanca",
    nome: "O Esperançoso",
    descricao: "Quando o trade corre mal, esperas que volte. Mover ou tirar o stop é o teu ponto fraco.",
    regra: "Define o stop antes de entrar e nunca o afastes. Se não sabes onde está o stop, não há trade.",
  },
  calculista: {
    id: "calculista",
    nome: "O Calculista",
    descricao: "Já tens boa base: pensas no risco antes do lucro. O teu desafio é manter isto nos dias de stress.",
    regra: "Regista cada trade com a razão de entrada. O diário vai mostrar-te onde ainda perdes disciplina.",
  },
};

const o = (texto, perfil, disciplina) => ({ texto, perfil, disciplina });

export const PERGUNTAS = [
  {
    texto: "Acabaste de perder um trade. O que fazes a seguir?",
    opcoes: [o("Entro logo noutro para recuperar", "vinganca", 10), o("Aumento o tamanho no próximo para compensar", "heroi", 5), o("Faço uma pausa e revejo o que correu mal", "calculista", 95), o("Fico a olhar, à espera de que o mercado volte", "esperanca", 40)],
  },
  {
    texto: "Quanto da conta costumas arriscar num trade?",
    opcoes: [o("Nunca fiz essa conta", "esperanca", 15), o("Depende de quão confiante estou", "heroi", 20), o("Entre 1% e 2%", "calculista", 95), o("5% ou mais, para valer a pena", "heroi", 5)],
  },
  {
    texto: "O preço chega perto do teu stop. O que fazes?",
    opcoes: [o("Afasto o stop para lhe dar espaço", "esperanca", 5), o("Deixo o stop onde está", "calculista", 100), o("Tiro o stop, ele vai voltar", "esperanca", 0), o("Fecho e entro do outro lado", "vinganca", 25)],
  },
  {
    texto: "Num dia normal, quantos trades fazes?",
    opcoes: [o("Os que o meu plano mandar, às vezes zero", "calculista", 95), o("Muitos, gosto de estar sempre dentro", "vinganca", 20), o("Poucos mas grandes", "heroi", 35), o("Não conto", "esperanca", 30)],
  },
  {
    texto: "Tiveste uma semana muito boa. E agora?",
    opcoes: [o("Dobro o tamanho, estou com a mão quente", "heroi", 10), o("Mantenho as mesmas regras", "calculista", 95), o("Arrisco mais para chegar ao objetivo do mês", "heroi", 15), o("Começo a operar fora do meu horário", "vinganca", 25)],
  },
  {
    texto: "Registas os teus trades num diário?",
    opcoes: [o("Sim, todos, com a razão da entrada", "calculista", 100), o("Só os que correm bem", "esperanca", 30), o("Não, está tudo na minha cabeça", "heroi", 20), o("Já comecei várias vezes e desisti", "vinganca", 40)],
  },
];

/** @param {number[]} respostas índice da opção escolhida em cada pergunta */
export function avaliarTeste(respostas) {
  const pontos = { vinganca: 0, heroi: 0, esperanca: 0, calculista: 0 };
  let soma = 0;
  let n = 0;
  respostas.forEach((r, i) => {
    const opcao = PERGUNTAS[i]?.opcoes[r];
    if (!opcao) return;
    pontos[opcao.perfil]++;
    soma += opcao.disciplina;
    n++;
  });
  const pontuacao = n ? Math.round(soma / n) : 0;
  // O ponto fraco é o perfil de risco com mais respostas; só és "Calculista" se dominar claramente.
  const fracos = ["vinganca", "heroi", "esperanca"].sort((a, b) => pontos[b] - pontos[a]);
  const perfilId = pontos.calculista >= 4 || (pontuacao >= 80 && pontos.calculista > pontos[fracos[0]]) ? "calculista" : fracos[0];
  return { perfil: PERFIS[perfilId], pontuacao, pontos };
}
