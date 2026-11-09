export class ErroAnalise extends Error {
  constructor(mensagem, { fatal = false } = {}) {
    super(mensagem);
    this.fatal = fatal; // fatal = parar o copiloto (ex: chave inválida)
  }
}
