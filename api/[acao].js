// Função da Vercel: /api/estado, /api/analisar, /api/perguntar e /api/voz.
// As chaves (FAL_KEY, DEEPSEEK_API_KEY...) e o CODIGO_TESTE vêm das variáveis de ambiente do projeto na Vercel.
import { tratarPedido } from "../servidor/nucleo.js";

function lerCorpo(req) {
  if (typeof req.body !== "string") return req.body ?? {};
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  const r = await tratarPedido({
    acao: String(req.query.acao ?? ""),
    metodo: req.method,
    codigo: req.headers["x-codigo"],
    ip: String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress,
    corpo: lerCorpo(req),
  });
  res.setHeader("Cache-Control", "no-store");
  if (r.audio) {
    res.setHeader("Content-Type", r.tipoConteudo);
    return res.status(r.status).send(r.audio);
  }
  return res.status(r.status).json(r.json);
}
