// >>> DEFINIÇÕES DO VENDEDOR — é o único ficheiro que precisas de editar antes de publicar.
// Depois de mudares alguma coisa: npm run site  e volta a publicar a pasta dist/.

export const VENDA = {
  // Links de pagamento da tua plataforma (Lemon Squeezy, Gumroad, Stripe Payment Links...)
  checkout: {
    licenca: "", // ex: "https://sentinela.lemonsqueezy.com/buy/xxxx"
    mentoria: "",
  },
  // Nome do parâmetro de afiliado que a tua plataforma usa (Lemon Squeezy: "aff", Gumroad: "a").
  // Quem chega ao site por https://o-teu-site/?ref=CODIGO leva o código até ao pagamento.
  parametroAfiliado: "aff",
  vagasFundador: 100,
  vagasVendidas: 0, // atualiza à medida que vendes: a escassez tem de ser verdadeira
  precoFundador: 97,
  precoNormal: 197,
  contacto: "", // ex: "ola@sentinela.pt"
};

// Apoio voluntário ("paga-nos um café"). Deixa vazio o que não usares: só aparece o que tiver link.
// Regras para estar dentro da lei: ver marketing/GUIA-DE-VENDA.md, secção "Apoios".
export const APOIO = {
  kofi: "", // ex: "https://ko-fi.com/sentinela"
  buymeacoffee: "", // ex: "https://buymeacoffee.com/sentinela"
  paypal: "", // ex: "https://paypal.me/sentinela"
  stripe: "", // ex: link de pagamento Stripe com "o cliente escolhe o valor"
};
