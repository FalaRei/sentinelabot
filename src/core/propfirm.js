// Modelos de regras de desafio. São valores típicos do mercado, não as regras oficiais de
// nenhuma empresa: cada prop firm tem as suas e mudam com o tempo. O trader confirma e ajusta.

export const MODELOS_CONTA = [
  {
    id: "propria",
    nome: "Conta própria",
    desc: "Opero o meu dinheiro com as minhas regras.",
    regras: { modoConta: "propria", perdaDiariaMaxPct: 3, perdaTotalMaxPct: 0, metaDesafioPct: 0, riscoMaxPct: 1 },
  },
  {
    id: "classico",
    nome: "Desafio clássico",
    desc: "Perda diária 5%, perda total 10%, meta 10%.",
    regras: { modoConta: "desafio", perdaDiariaMaxPct: 5, perdaTotalMaxPct: 10, metaDesafioPct: 10, riscoMaxPct: 1 },
  },
  {
    id: "rigoroso",
    nome: "Desafio rigoroso",
    desc: "Perda diária 4%, perda total 8%, meta 8%.",
    regras: { modoConta: "desafio", perdaDiariaMaxPct: 4, perdaTotalMaxPct: 8, metaDesafioPct: 8, riscoMaxPct: 0.75 },
  },
  {
    id: "financiada",
    nome: "Conta financiada",
    desc: "Já passei o desafio: perda diária 3%, total 6%, sem meta.",
    regras: { modoConta: "desafio", perdaDiariaMaxPct: 3, perdaTotalMaxPct: 6, metaDesafioPct: 0, riscoMaxPct: 0.5 },
  },
];

/** Aplica um modelo à configuração. Ao começar um desafio novo, o limite total passa a contar a partir de agora. */
export function aplicarModelo(config, id, { saldo, agora = Date.now() } = {}) {
  const m = MODELOS_CONTA.find((x) => x.id === id) ?? MODELOS_CONTA[0];
  return {
    ...config,
    ...m.regras,
    saldo: saldo > 0 ? saldo : config.saldo,
    inicioDesafio: m.regras.modoConta === "desafio" ? agora : 0,
    modeloConta: m.id,
  };
}
