// Captura do ecrã partilhado (separador do TradingView, janela da corretora, etc.).

import { paraCinzento } from "../core/frames.js";

/** @param {"browser"|"window"|null} superficie sugere ao browser o separador ou a janela (Chrome/Edge) */
export async function iniciarCaptura(onTerminar, { superficie = null } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Este browser não permite partilhar o ecrã. Usa o Chrome ou o Edge num computador.");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 2, ...(superficie ? { displaySurface: superficie } : {}) }, audio: false });
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  stream.getVideoTracks()[0].addEventListener("ended", () => onTerminar?.());
  return {
    video,
    parar() {
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** Frame atual em JPEG (base64 sem prefixo) reduzido para poupar tokens, e uma miniatura para comparar. */
export function capturarFrame(video, maxLado = 1568, qualidade = 0.8) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const escala = Math.min(1, maxLado / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", qualidade);

  const mini = document.createElement("canvas");
  mini.width = 64;
  mini.height = 36;
  const mctx = mini.getContext("2d", { willReadFrequently: true });
  mctx.drawImage(canvas, 0, 0, 64, 36);
  const miniatura = paraCinzento(mctx.getImageData(0, 0, 64, 36).data);

  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), dataUrl, miniatura };
}
