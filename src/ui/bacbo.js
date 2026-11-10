// Aba Bac Bo (só no teste privado): registo de resultados com um toque, a matemática real e um travão.
import { probabilidades, contagens, sequencias, probSequencia, sessao, falaBacBo } from "../core/bacbo.js";

const pct = (x) => `${(x * 100).toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`;
const euros = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function iniciarBacBo({ $, h, ler, gravar, falar, vozLigada, sons }) {
  const P = probabilidades();
  let dados = { resultados: [], saldoInicial: null, saldoAgora: null, limitePerda: 20, inicio: Date.now(), ...ler("bacbo", {}) };
  const guardar = () => gravar("bacbo", dados);
  const num = (id) => {
    const v = $(id).value.replace(",", ".");
    return v === "" ? null : Number(v);
  };

  $("bb-p-azul").textContent = pct(P.azul);
  $("bb-p-vermelho").textContent = pct(P.vermelho);
  $("bb-p-empate").textContent = pct(P.empate);

  function render() {
    const r = dados.resultados;
    const c = contagens(r);
    const { atual, maior } = sequencias(r);
    const semEmpate = c.azul + c.vermelho;
    $("bb-rondas").textContent = c.total;
    for (const cor of ["azul", "vermelho", "empate"]) {
      $(`bb-n-${cor}`).textContent = c[cor];
      $(`bb-obs-${cor}`).textContent = c.total ? pct(c[cor] / c.total) : "—";
      $(`bb-barra-${cor}`).style.width = c.total ? `${(c[cor] / c.total) * 100}%` : "0%";
    }
    const nome = (cor, n) => (cor === "azul" ? (n === 1 ? "azul" : "azuis") : n === 1 ? "vermelho" : "vermelhos");
    $("bb-seq-atual").textContent = atual.n ? `${atual.n} ${nome(atual.cor, atual.n)}` : "—";
    $("bb-seq-maior").textContent = maior.n ? `${maior.n} ${nome(maior.cor, maior.n)}` : "—";
    $("bb-seq-normal").textContent =
      atual.n >= 3 && semEmpate >= atual.n
        ? `Numa sessão de ${semEmpate} rondas, uma sequência de ${atual.n} ou mais acontece ${pct(probSequencia(atual.n, semEmpate))} das vezes. É normal.`
        : "As sequências longas parecem padrões, mas são normais. Não mudam a próxima ronda.";
    $("bb-historico").replaceChildren(
      ...(r.length ? r.slice(-72).map((x) => h("i", { class: `bola ${x}`, title: x })) : [h("span", { class: "pequeno" }, "Toca na cor que saiu em cada ronda.")])
    );
    // sessão e travão
    const s = sessao(dados);
    const caixa = $("bb-resultado");
    caixa.textContent = s.resultado == null ? "Escreve o saldo inicial e o saldo agora." : euros(s.resultado);
    caixa.className = `bb-resultado mono ${s.resultado == null ? "vazio-bb" : s.resultado > 0 ? "pos" : s.resultado < 0 ? "neg" : ""}`;
    const min = Math.floor((Date.now() - dados.inicio) / 60000);
    $("bb-tempo").textContent = `${min} min`;
    $("bb-aviso").hidden = !s.perto || s.travar;
    $("bb-travao").hidden = !s.travar;
    document.querySelectorAll(".bb-cor").forEach((b) => (b.disabled = s.travar));
  }

  function registar(cor) {
    dados.resultados.push(cor);
    guardar();
    sons.xp();
    render();
    const fala = falaBacBo(dados.resultados);
    if (fala && vozLigada()) falar(fala);
  }

  document.querySelectorAll(".bb-cor").forEach((b) => b.addEventListener("click", () => registar(b.dataset.cor)));
  $("bb-desfazer").addEventListener("click", () => {
    dados.resultados.pop();
    guardar();
    render();
  });
  $("bb-nova").addEventListener("click", () => {
    dados = { resultados: [], saldoInicial: null, saldoAgora: null, limitePerda: dados.limitePerda, inicio: Date.now() };
    for (const id of ["bb-saldo-ini", "bb-saldo-agora"]) $(id).value = "";
    guardar();
    render();
  });
  for (const [id, campo] of [["bb-saldo-ini", "saldoInicial"], ["bb-saldo-agora", "saldoAgora"], ["bb-limite", "limitePerda"]]) {
    if (dados[campo] != null) $(id).value = dados[campo];
    $(id).addEventListener("input", () => {
      const antes = sessao(dados).travar;
      dados[campo] = num(id);
      guardar();
      render();
      if (!antes && sessao(dados).travar) {
        sons.alerta();
        if (vozLigada()) falar("Atingiste o teu limite de perda. Para aqui. O casino ganha a quem fica.", { urgente: true });
      }
    });
  }
  $("bb-continuar").addEventListener("click", () => {
    // decisão consciente: sobe o limite em vez de o ignorar
    dados.limitePerda = Math.round((-(sessao(dados).resultado ?? 0) + 10) * 100) / 100;
    $("bb-limite").value = dados.limitePerda;
    guardar();
    render();
  });
  setInterval(render, 30_000);
  render();
}
