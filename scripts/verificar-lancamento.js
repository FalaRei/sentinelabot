// Antes de publicar: verifica se está tudo preenchido para poderes vender.
// Uso: npm run verificar   (sai com erro se faltar alguma coisa obrigatória)
import { readFile, readdir, stat } from "node:fs/promises";
import { VENDA, APOIO } from "../src/config.js";

const resultados = [];
const ok = (texto) => resultados.push({ nivel: "ok", texto });
const falta = (texto, como) => resultados.push({ nivel: "falta", texto, como });
const aviso = (texto, como) => resultados.push({ nivel: "aviso", texto, como });
const eLink = (v) => /^https:\/\/\S+$/.test(String(v ?? ""));
const existe = (f) => stat(f).then(() => true, () => false);

// 1. Pagamentos
if (eLink(VENDA.checkout.licenca)) ok("Link de pagamento da licença");
else falta("Link de pagamento da licença", "Cria o produto no Lemon Squeezy (ou Gumroad) e cola o link em src/config.js → VENDA.checkout.licenca.");
if (eLink(VENDA.checkout.mentoria)) ok("Link de pagamento da mentoria");
else aviso("Sem link para a mentoria", "Se não vais vender mentoria já, podes ignorar. Senão, preenche VENDA.checkout.mentoria.");
if (/^\S+@\S+\.\S+$/.test(VENDA.contacto)) ok("Email de contacto");
else falta("Email de contacto", "Preenche VENDA.contacto em src/config.js (ex: ola@o-teu-dominio.pt). Aparece no site e é obrigatório para reembolsos.");
if (VENDA.vagasVendidas >= 0 && VENDA.vagasVendidas <= VENDA.vagasFundador) ok(`Vagas de fundador: ${VENDA.vagasFundador - VENDA.vagasVendidas} de ${VENDA.vagasFundador} disponíveis`);
else falta("Número de vagas incoerente", "VENDA.vagasVendidas tem de estar entre 0 e VENDA.vagasFundador.");
if (Object.values(APOIO).some(eLink)) ok("Pelo menos uma forma de apoio voluntário");
else aviso("Sem formas de apoio", "Opcional. Para aparecer o botão Apoiar, preenche um link em APOIO.");

// 2. Textos legais
const termos = await readFile("termos.html", "utf8");
const buracos = [...new Set(termos.match(/\[[A-ZÀ-Ú ]{3,}\]/g) ?? [])];
if (!buracos.length) ok("Termos e privacidade preenchidos");
else falta(`Termos com campos por preencher: ${buracos.join(", ")}`, "Abre termos.html e substitui cada [CAMPO] pelos teus dados. A entidade RAL é obrigatória em Portugal (lista em consumidor.gov.pt).");

// 3. Licenças
const ficheiros = await readdir(".");
const listas = ficheiros.filter((f) => /^licencas-.*\.txt$/.test(f));
if (listas.length) ok(`Lista de licenças gerada (${listas.join(", ")})`);
else falta("Ainda não geraste licenças", "Corre: npm run licencas -- 100  e carrega o ficheiro na plataforma de pagamento.");
const gitignore = await readFile(".gitignore", "utf8").catch(() => "");
if (gitignore.includes("licencas-*.txt")) ok("As listas de licenças não vão para o Git");
else falta("As listas de licenças podem ir parar ao Git", "Junta a linha licencas-*.txt ao .gitignore.");

// 4. Site compilado
if (await existe("dist/index.html") && await existe("dist/app/index.html") && await existe("dist/_headers")) {
  const [dSite, dConfig] = await Promise.all([stat("dist/index.html"), stat("src/config.js")]);
  if (dSite.mtimeMs >= dConfig.mtimeMs) ok("Pasta dist/ pronta e atualizada");
  else falta("A pasta dist/ é mais antiga do que o src/config.js", "Corre: npm run site");
} else falta("O site ainda não foi compilado", "Corre: npm run site");

// 5. O que o script não consegue verificar sozinho
aviso("Teste com uma chave real da IA", 'PowerShell: $env:GEMINI_API_KEY="AIza..."; npm run testar-api  (custa menos de 1 cêntimo)');

const simbolo = { ok: "✓", falta: "✕", aviso: "!" };
console.log("\nVerificação de lançamento do Sentinela\n");
for (const r of resultados) {
  console.log(`  ${simbolo[r.nivel]} ${r.texto}`);
  if (r.como) console.log(`      → ${r.como}`);
}
const emFalta = resultados.filter((r) => r.nivel === "falta").length;
console.log(emFalta ? `\nFaltam ${emFalta} coisa(s) obrigatória(s) antes de vender.\n` : "\nPronto para publicar. Boas vendas!\n");
process.exit(emFalta ? 1 : 0);
