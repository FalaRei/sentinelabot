// Serve a pasta dist/ localmente para veres o site completo antes de publicar.
// Uso: npm run site && npm run servir   → http://localhost:4173
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const RAIZ = join(process.cwd(), "dist");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
const porta = Number(process.env.PORT) || 4173;

// Aplica os mesmos cabeçalhos que o Netlify (dist/_headers, bloco "/*"), para testares a segurança em casa.
async function lerCabecalhos() {
  try {
    const texto = await readFile(join(RAIZ, "_headers"), "utf8");
    const cab = {};
    let dentro = false;
    for (const linha of texto.split(/\r?\n/)) {
      if (linha.startsWith("#") || !linha.trim()) continue;
      if (/^\S/.test(linha)) dentro = linha.trim() === "/*";
      else if (dentro && linha.includes(":")) {
        const i = linha.indexOf(":");
        cab[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
      }
    }
    return cab;
  } catch {
    return {};
  }
}
const CABECALHOS = await lerCabecalhos();

createServer(async (req, res) => {
  let caminho = normalize(join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!caminho.startsWith(RAIZ)) return res.writeHead(403).end();
  try {
    if ((await stat(caminho)).isDirectory()) caminho = join(caminho, "index.html");
    res.writeHead(200, { ...CABECALHOS, "Content-Type": TIPOS[extname(caminho)] ?? "application/octet-stream" }).end(await readFile(caminho));
  } catch {
    res.writeHead(404).end("Não encontrado");
  }
}).listen(porta, () => console.log(`Site em http://localhost:${porta}`));
