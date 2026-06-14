import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload, Download, Loader2, Image as ImageIcon, Video, Mic, FileText, Camera, Monitor,
  Pencil, Filter as FilterIcon, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { InactivateButton } from "@/components/disciplinary/inactivate-button";
import { logPrintAction } from "@/lib/disciplinary-audit.functions";
import {
  CATEGORY_LABEL, CATEGORY_OPTIONS, decodeMeta, encodeMeta, isImageMime,
  inferCategoryFromMime, type EvidenceCategory, type EvidenceMeta,
} from "@/lib/evidence-meta";

interface EvidenceRow {
  id: string; case_id: string; file_path: string; file_name: string;
  mime_type: string; size_bytes: number | null; descricao: string | null;
  uploaded_by: string | null; created_at: string;
}

function CategoryIcon({ cat, className }: { cat: EvidenceCategory; className?: string }) {
  const cls = className ?? "h-4 w-4";
  switch (cat) {
    case "foto": return <ImageIcon className={cls} />;
    case "cftv": return <Camera className={cls} />;
    case "print": return <Monitor className={cls} />;
    case "video": return <Video className={cls} />;
    case "audio": return <Mic className={cls} />;
    case "documento": return <FileText className={cls} />;
    default: return <FileText className={cls} />;
  }
}

export function EvidenceGallery({
  caseId, userId, canWrite, onCountChange,
}: {
  caseId: string; userId?: string; canWrite: boolean; onCountChange?: (n: number) => void;
}) {
  const log = useServerFn(logPrintAction);
  const [filterCat, setFilterCat] = useState<EvidenceCategory | "all">("all");
  const [refreshTick, setRefreshTick] = useState(0);

  const q = useQuery({
    queryKey: ["proc-evid-gallery", caseId, refreshTick],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("disciplinary_case_evidences")
        .select("*").eq("case_id", caseId).eq("active", true)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as EvidenceRow[];
    },
  });

  const items = useMemo(() => (q.data ?? []).map((e) => {
    const meta = decodeMeta(e.descricao) ?? { v: 1 as const, cat: inferCategoryFromMime(e.mime_type) };
    return { ev: e, meta };
  }), [q.data]);

  useEffect(() => { onCountChange?.(items.length); }, [items.length, onCountChange]);

  const filtered = items.filter((i) => filterCat === "all" ? true : i.meta.cat === filterCat);

  const reload = () => setRefreshTick((t) => t + 1);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {canWrite && (
          <UploadBox caseId={caseId} userId={userId} onUploaded={reload} />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          <Button size="sm" variant={filterCat === "all" ? "default" : "outline"} onClick={() => setFilterCat("all")}>
            Todas ({items.length})
          </Button>
          {CATEGORY_OPTIONS.map((c) => {
            const n = items.filter((i) => i.meta.cat === c).length;
            if (n === 0) return null;
            return (
              <Button key={c} size="sm" variant={filterCat === c ? "default" : "outline"} onClick={() => setFilterCat(c)}>
                <CategoryIcon cat={c} className="h-3.5 w-3.5 mr-1" />{CATEGORY_LABEL[c]} ({n})
              </Button>
            );
          })}
        </div>

        {q.isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma evidência nesta categoria.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filtered.map(({ ev, meta }) => (
              <Thumb key={ev.id} ev={ev} meta={meta} canWrite={canWrite}
                onLog={() => { void log({ data: { entity_type: "case", entity_id: caseId, action: "view" } }); }}
                onChanged={reload}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UploadBox({ caseId, userId, onUploaded }: { caseId: string; userId?: string; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<EvidenceCategory>("foto");
  const [desc, setDesc] = useState("");
  const [local, setLocal] = useState("");
  const [dataOc, setDataOc] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useServerFn(logPrintAction);

  async function send() {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast.error("Selecione um arquivo.");
    if (!userId) return;
    setBusy(true);
    const ext = f.name.split(".").pop() ?? "bin";
    const path = `${caseId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("disciplinary-evidences").upload(path, f, {
      contentType: f.type || "application/octet-stream", upsert: false,
    });
    if (upErr) { setBusy(false); return toast.error(upErr.message); }
    const meta: EvidenceMeta = {
      v: 1, cat,
      desc: desc.trim() || undefined,
      local: local.trim() || undefined,
      dataOc: dataOc || undefined,
      obs: obs.trim() || undefined,
    };
    const { error: insErr } = await supabase.from("disciplinary_case_evidences").insert({
      case_id: caseId, file_path: path, file_name: f.name,
      mime_type: f.type || "application/octet-stream", size_bytes: f.size,
      descricao: encodeMeta(meta), uploaded_by: userId,
    });
    setBusy(false);
    if (insErr) return toast.error(insErr.message);
    try { await log({ data: { entity_type: "case", entity_id: caseId, action: "print" } }); } catch { /* noop */ }
    toast.success("Evidência enviada.");
    setDesc(""); setLocal(""); setDataOc(""); setObs("");
    if (fileRef.current) fileRef.current.value = "";
    onUploaded();
  }

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Arquivo</Label>
          <Input ref={fileRef} type="file" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) setCat(inferCategoryFromMime(f.type));
          }} />
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={cat} onValueChange={(v) => setCat(v as EvidenceCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Data da ocorrência</Label>
          <Input type="date" value={dataOc} onChange={(e) => setDataOc(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: câmera 2 — entrada do posto" />
        </div>
        <div>
          <Label>Local</Label>
          <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Local da ocorrência" />
        </div>
        <div className="md:col-span-3">
          <Label>Observações</Label>
          <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={send} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Enviar evidência
        </Button>
      </div>
    </div>
  );
}

function Thumb({
  ev, meta, canWrite, onLog, onChanged,
}: {
  ev: EvidenceRow; meta: EvidenceMeta; canWrite: boolean; onLog: () => void; onChanged: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const isImg = isImageMime(ev.mime_type);

  useEffect(() => {
    let cancel = false;
    if (!isImg) return;
    (async () => {
      const { data } = await supabase.storage.from("disciplinary-evidences").createSignedUrl(ev.file_path, 300);
      if (!cancel) setThumb(data?.signedUrl ?? null);
    })();
    return () => { cancel = true; };
  }, [ev.file_path, isImg]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); onLog(); }}
        className="group relative aspect-square w-full overflow-hidden rounded-md border bg-muted hover:ring-2 hover:ring-primary transition"
        title={meta.desc ?? ev.file_name}
      >
        {isImg && thumb ? (
          <img src={thumb} alt={ev.file_name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
            <CategoryIcon cat={meta.cat} className="h-8 w-8 text-muted-foreground" />
            <span className="text-[10px] line-clamp-2 break-all">{ev.file_name}</span>
          </div>
        )}
        <Badge variant="secondary" className="absolute left-1 top-1 text-[10px] gap-1">
          <CategoryIcon cat={meta.cat} className="h-3 w-3" />{CATEGORY_LABEL[meta.cat]}
        </Badge>
        {meta.annotated && (
          <Badge className="absolute right-1 top-1 text-[10px]">Anotada</Badge>
        )}
      </button>
      {open && (
        <EvidenceDialog
          ev={ev} meta={meta} thumb={thumb}
          isImg={isImg}
          canWrite={canWrite}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function EvidenceDialog({
  ev, meta, thumb, isImg, canWrite, onClose, onChanged,
}: {
  ev: EvidenceRow; meta: EvidenceMeta; thumb: string | null; isImg: boolean;
  canWrite: boolean; onClose: () => void; onChanged: () => void;
}) {
  const log = useServerFn(logPrintAction);
  const [annotating, setAnnotating] = useState(false);

  async function download() {
    const { data, error } = await supabase.storage.from("disciplinary-evidences").createSignedUrl(ev.file_path, 60);
    if (error) return toast.error(error.message);
    try { await log({ data: { entity_type: "case", entity_id: ev.case_id, action: "download" } }); } catch { /* noop */ }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CategoryIcon cat={meta.cat} /> {ev.file_name}
            {meta.annotated && <Badge>Anotada</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-[2fr_1fr] gap-4">
          <div className="bg-muted rounded-md overflow-hidden min-h-[300px] flex items-center justify-center">
            {isImg && thumb
              ? <img src={thumb} alt={ev.file_name} className="max-h-[60vh] object-contain" />
              : <div className="text-muted-foreground text-sm p-6 text-center">
                  Pré-visualização não disponível. Use "Baixar" para abrir o arquivo.
                </div>}
          </div>
          <div className="space-y-2 text-sm">
            <Field label="Categoria"><Badge variant="outline">{CATEGORY_LABEL[meta.cat]}</Badge></Field>
            <Field label="Descrição">{meta.desc || "—"}</Field>
            <Field label="Local">{meta.local || "—"}</Field>
            <Field label="Data da ocorrência">{meta.dataOc ? meta.dataOc.split("-").reverse().join("/") : "—"}</Field>
            <Field label="Observações">{meta.obs || "—"}</Field>
            <Field label="Enviado em">{new Date(ev.created_at).toLocaleString("pt-BR")}</Field>
            <Field label="Anexado por">{ev.uploaded_by ?? "—"}</Field>
            <Field label="Tipo MIME"><span className="text-xs">{ev.mime_type}</span></Field>
          </div>
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          {canWrite && (
            <InactivateButton
              table="disciplinary_case_evidences"
              id={ev.id}
              invalidateKeys={[["proc-evid-gallery", ev.case_id]]}
              onDone={() => { onChanged(); onClose(); }}
            />
          )}
          {isImg && canWrite && (
            <Button variant="outline" onClick={() => setAnnotating(true)}>
              <Pencil className="h-4 w-4 mr-2" />Anotar imagem
            </Button>
          )}
          <Button onClick={download}><Download className="h-4 w-4 mr-2" />Baixar</Button>
          <Button variant="secondary" onClick={onClose}><X className="h-4 w-4 mr-2" />Fechar</Button>
        </DialogFooter>
        {annotating && thumb && (
          <AnnotateDialog
            ev={ev} meta={meta} sourceUrl={thumb}
            onClose={() => setAnnotating(false)}
            onSaved={() => { setAnnotating(false); onClose(); onChanged(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

type AnnoTool = "seta" | "circulo" | "destaque";

function AnnotateDialog({
  ev, meta, sourceUrl, onClose, onSaved,
}: {
  ev: EvidenceRow; meta: EvidenceMeta; sourceUrl: string;
  onClose: () => void; onSaved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<AnnoTool>("seta");
  const [color, setColor] = useState("#e11d48");
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const baseRef = useRef<ImageData | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current; if (!canvas) return;
      const maxW = 900;
      const scale = Math.min(1, maxW / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      baseRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    img.src = sourceUrl;
  }, [sourceUrl]);

  function pos(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }

  function draw(end: { x: number; y: number }) {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    if (baseRef.current) ctx.putImageData(baseRef.current, 0, 0);
    const start = dragging.current!;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 4; ctx.lineCap = "round";
    if (tool === "seta") {
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      const ang = Math.atan2(end.y - start.y, end.x - start.x);
      const h = 14;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - h * Math.cos(ang - Math.PI / 6), end.y - h * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(end.x - h * Math.cos(ang + Math.PI / 6), end.y - h * Math.sin(ang + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    } else if (tool === "circulo") {
      const rx = Math.abs(end.x - start.x), ry = Math.abs(end.y - start.y);
      const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx / 2, ry / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
      ctx.globalAlpha = 1;
    }
  }

  function commit() {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    baseRef.current = ctx.getImageData(0, 0, c.width, c.height);
  }

  function reset() {
    const img = imgRef.current; const c = canvasRef.current; if (!img || !c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    baseRef.current = ctx.getImageData(0, 0, c.width, c.height);
  }

  async function save() {
    const c = canvasRef.current; if (!c) return;
    setSaving(true);
    const blob: Blob | null = await new Promise((r) => c.toBlob((b) => r(b), "image/png"));
    if (!blob) { setSaving(false); return toast.error("Falha ao gerar imagem."); }
    const path = `${ev.case_id}/${crypto.randomUUID()}-annotated.png`;
    const { error: upErr } = await supabase.storage.from("disciplinary-evidences")
      .upload(path, blob, { contentType: "image/png", upsert: false });
    if (upErr) { setSaving(false); return toast.error(upErr.message); }
    const newMeta: EvidenceMeta = {
      v: 1, cat: meta.cat, desc: (meta.desc ?? "") + " (anotada)",
      local: meta.local, dataOc: meta.dataOc, obs: meta.obs,
      parentId: ev.id, annotated: true,
    };
    const fileName = ev.file_name.replace(/\.(\w+)$/, "-annotated.png");
    const { error: insErr } = await supabase.from("disciplinary_case_evidences").insert({
      case_id: ev.case_id, file_path: path, file_name: fileName,
      mime_type: "image/png", size_bytes: blob.size,
      descricao: encodeMeta(newMeta), uploaded_by: ev.uploaded_by,
    });
    setSaving(false);
    if (insErr) return toast.error(insErr.message);
    toast.success("Versão anotada salva. Original preservado.");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Anotar imagem (original preservado)</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={tool === "seta" ? "default" : "outline"} onClick={() => setTool("seta")}>Seta</Button>
          <Button size="sm" variant={tool === "circulo" ? "default" : "outline"} onClick={() => setTool("circulo")}>Círculo</Button>
          <Button size="sm" variant={tool === "destaque" ? "default" : "outline"} onClick={() => setTool("destaque")}>Destaque</Button>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 border rounded" />
          <Button size="sm" variant="ghost" onClick={reset}>Limpar</Button>
        </div>
        <div className="overflow-auto border rounded bg-black/5 max-h-[60vh] flex justify-center">
          <canvas
            ref={canvasRef}
            className="max-w-full cursor-crosshair"
            onMouseDown={(e) => { dragging.current = pos(e); }}
            onMouseMove={(e) => { if (dragging.current) draw(pos(e)); }}
            onMouseUp={(e) => { if (dragging.current) { draw(pos(e)); commit(); } dragging.current = null; }}
            onMouseLeave={() => { dragging.current = null; }}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar versão anotada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
