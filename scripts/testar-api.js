// Teste real da IA com a tua chave: desenha um gráfico de velas e pede a análise.
// Uso (PowerShell):
//   Google:    $env:GEMINI_API_KEY="AIza...";    npm run testar-api
//   Anthropic: $env:ANTHROPIC_API_KEY="sk-ant-..."; npm run testar-api
// Opcional: o modelo como argumento (npm run testar-api -- claude-opus-5-5). Custo: menos de 1 cêntimo.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { ligarIA } from "../src/services/ia.js";
import { analisarEcraOpenAI } from "../src/services/openai.js";
import { CONFIG_PADRAO } from "../src/core/rules.js";
import { modeloParaChave } from "../src/core/analysis.js";

const W = 1280, H = 720;
const px = Buffer.alloc(W * H * 3, 0);
const pintar = (x0, y0, x1, y1, [r, g, b]) => {
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
      const i = (y * W + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
};
pintar(0, 0, W, H, [19, 23, 34]);
for (let y = 60; y < H; y += 80) pintar(0, y, W, y + 1, [40, 46, 60]);
// Tendência de alta com recuos, a bater numa resistência perto do topo.
let preco = 520, semente = 7;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 60; i++) {
  const abre = preco;
  const fecha = Math.max(140, abre - (rnd() * 26 - 9) - (i % 12 > 8 ? -14 : 4));
  const alto = Math.min(abre, fecha) - rnd() * 14, baixo = Math.max(abre, fecha) + rnd() * 14;
  const x = 40 + i * 20, cor = fecha < abre ? [38, 166, 154] : [239, 83, 80];
  pintar(x + 7, Math.round(alto), x + 9, Math.round(baixo), cor);
  pintar(x + 2, Math.round(Math.min(abre, fecha)), x + 14, Math.round(Math.max(abre, fecha)) + 2, cor);
  preco = fecha;
}
pintar(0, 150, W, 152, [239, 83, 80]); // linha de resistência

function png(w, h, rgb) {
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo), len = Buffer.alloc(4), c = Buffer.alloc(4);
    len.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linhas = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(linhas, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhas)), bloco("IEND", Buffer.alloc(0))]);
}

const imagem = png(W, H, px);
writeFileSync("grafico-teste.png", imagem);

const chave = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
if (!chave) {
  console.log("Gráfico de teste gravado em grafico-teste.png. Define GEMINI_API_KEY ou ANTHROPIC_API_KEY para testar a IA.");
  process.exit(0);
}
const eOpenAI = chave === process.env.OPENAI_API_KEY;
const modelo = eOpenAI ? process.argv[2] || "gpt-6.1-terra" : modeloParaChave(chave, process.argv[2]);
console.log(`A pedir análise a ${modelo}...`);
const inicio = Date.now();
const analisar = eOpenAI ? (p) => analisarEcraOpenAI({ ...p, chave, modelo }) : ligarIA(chave, modelo).analisar;
const r = await analisar({
  config: { ...CONFIG_PADRAO, regrasPessoais: "- Só opero a favor da tendência" },
  imagemBase64: imagem.toString("base64"),
  mediaType: "image/png",
  analiseAnterior: null,
});
console.log(JSON.stringify(r.analise, null, 2));
console.log(`\nOK em ${((Date.now() - inicio) / 1000).toFixed(1)} s · tokens: ${r.usage.input_tokens ?? r.usage.entrada} entrada / ${r.usage.output_tokens ?? r.usage.saida} saída · custo: $${r.custo.toFixed(4)}`);
