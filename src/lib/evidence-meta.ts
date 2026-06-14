// Metadados estruturados embutidos em `descricao` (sem alterar schema).
// Formato: JSON serializado. Versão 1.
export type EvidenceCategory =
  | "foto" | "cftv" | "print" | "documento" | "video" | "audio" | "outro";

export const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  foto: "Foto",
  cftv: "Captura CFTV",
  print: "Print de Tela",
  documento: "Documento",
  video: "Vídeo",
  audio: "Áudio",
  outro: "Outro",
};

export const CATEGORY_OPTIONS: EvidenceCategory[] = [
  "foto", "cftv", "print", "documento", "video", "audio", "outro",
];

export interface EvidenceMeta {
  v: 1;
  cat: EvidenceCategory;
  desc?: string;
  local?: string;
  dataOc?: string; // yyyy-mm-dd
  obs?: string;
  parentId?: string; // id da evidência original (quando anotada)
  annotated?: boolean;
}

const PREFIX = "__META__:";

export function encodeMeta(m: EvidenceMeta): string {
  return PREFIX + JSON.stringify(m);
}

export function decodeMeta(descricao: string | null | undefined): EvidenceMeta | null {
  if (!descricao) return null;
  if (!descricao.startsWith(PREFIX)) {
    // legado: trata como descrição livre, categoria desconhecida
    return { v: 1, cat: "outro", desc: descricao };
  }
  try {
    const obj = JSON.parse(descricao.slice(PREFIX.length)) as EvidenceMeta;
    if (obj && obj.v === 1 && obj.cat) return obj;
  } catch { /* noop */ }
  return { v: 1, cat: "outro", desc: descricao };
}

export function isImageMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return m === "image/jpeg" || m === "image/jpg" || m === "image/png" || m === "image/webp";
}

export function inferCategoryFromMime(mime: string | null | undefined): EvidenceCategory {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "foto";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || m.includes("word") || m.includes("excel") || m.includes("sheet")) return "documento";
  return "outro";
}
