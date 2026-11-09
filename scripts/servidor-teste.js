// Servidor de TESTE local: serve o site (dist/) e a mesma API que corre na Vercel (servidor/nucleo.js),
// com as chaves do .env.local. Quem abre o link não precisa de licença nem de chave.
// Uso: npm run teste   → mostra o link.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import { tratarPedido, escolherIA, escolherVoz } from "../servidor/nucleo.js";

const PORTA = Number(process.env.PORT) || 8787;
const RAIZ = join(process.cwd(), "dist");
process.env.CODIGO_TESTE ||= randomBytes(4).toString("hex");
const IA = escolherIA();
if (!IA) {
  console.error("Falta uma chave no .env.local (FAL_KEY, DEEPSEEK_API_KEY ou OPENAI_API_KEY).");
  process.exit(1);
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };
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

async function lerCorpo(req, max = 6_000_000) {
  let tamanho = 0;
  const partes = [];
  for await (const p of req) {
    tamanho += p.length;
    if (tamanho > max) return null;
    partes.push(p);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const corpo = req.method === "POST" ? await lerCorpo(req) : {};
    const r = corpo === null
      ? { status: 413, json: { erro: "Imagem demasiado grande." } }
      : await tratarPedido({ acao: url.pathname.slice(5), metodo: req.method, codigo: req.headers["x-codigo"], ip: req.socket.remoteAddress, corpo });
    const cab = { ...CABECALHOS, "Cache-Control": "no-store" };
    if (r.audio) return res.writeHead(r.status, { ...cab, "Content-Type": r.tipoConteudo }).end(r.audio);
    return res.writeHead(r.status, { ...cab, "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(r.json));
  }
  let caminho = normalize(join(RAIZ, decodeURIComponent(url.pathname)));
  if (!caminho.startsWith(RAIZ)) return res.writeHead(403).end();
  try {
    if ((await stat(caminho)).isDirectory()) caminho = join(caminho, "index.html");
    res.writeHead(200, { ...CABECALHOS, "Content-Type": TIPOS[extname(caminho)] ?? "application/octet-stream" }).end(await readFile(caminho));
  } catch {
    res.writeHead(404).end("Não encontrado");
  }
}).listen(PORTA, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log(`\nServidor de teste do Sentinela ligado · IA: ${IA.nome} (${IA.modelo})${escolherVoz() ? " · voz natural" : ""}`);
  console.log(`\n  Neste PC:        http://localhost:${PORTA}/app/?codigo=${process.env.CODIGO_TESTE}`);
  for (const ip of ips) console.log(`  Na mesma rede:   http://${ip}:${PORTA}/app/?codigo=${process.env.CODIGO_TESTE}   (a partilha de ecrã só funciona com https)`);
  console.log("\n  Ctrl+C para desligar.\n");
});
