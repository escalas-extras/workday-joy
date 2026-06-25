import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface CrudColumn<T> { key: keyof T | string; label: string; render?: (row: T) => ReactNode; searchValue?: (row: T) => string }

export interface CrudConfig<T extends { id: string }> {
  table: string;
  title: string;
  description?: string;
  columns: CrudColumn<T>[];
  defaultValues: Partial<T>;
  renderForm: (values: any, setValues: (v: any) => void) => ReactNode;
  prepareSubmit?: (values: any) => any;
  orderBy?: string;
  canDelete?: boolean;
}

export function Crud<T extends { id: string }>(cfg: CrudConfig<T>) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<any>(cfg.defaultValues);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: [cfg.table],
    queryFn: async () => {
      const q = supabase.from(cfg.table as any).select("*");
      if (cfg.orderBy) q.order(cfg.orderBy);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });

  const save = useMutation({
    mutationFn: async (vals: any) => {
      const payload = cfg.prepareSubmit ? cfg.prepareSubmit(vals) : vals;
      if (editing) {
        const { error } = await supabase.from(cfg.table as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(cfg.table as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [cfg.table] });
      toast.success("Salvo com sucesso");
      setOpen(false);
      setEditing(null);
      setValues(cfg.defaultValues);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(cfg.table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [cfg.table] });
      toast.success("Excluído");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setValues(cfg.defaultValues); setOpen(true); };
  const openEdit = (row: T) => { setEditing(row); setValues(row); setOpen(true); };

  return (
    <div>
      <div className="flex justify-between items-start mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold">{cfg.title}</h1>
          {cfg.description && <p className="text-sm text-muted-foreground">{cfg.description}</p>}
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(values); }} className="space-y-3">
                {cfg.renderForm(values, setValues)}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {cfg.columns.map((c) => <TableHead key={String(c.key)}>{c.label}</TableHead>)}
              {isAdmin && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={cfg.columns.length + 1} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>}
            {!isLoading && (data ?? []).length === 0 && <TableRow><TableCell colSpan={cfg.columns.length + 1} className="text-center py-6 text-muted-foreground">Nenhum registro</TableCell></TableRow>}
            {(data ?? []).map((row) => (
              <TableRow key={row.id}>
                {cfg.columns.map((c) => (
                  <TableCell key={String(c.key)}>{c.render ? c.render(row) : String((row as any)[c.key] ?? "")}</TableCell>
                ))}
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)}><Pencil className="h-3 w-3" /></Button>
                      {cfg.canDelete !== false && (
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir?")) del.mutate(row.id); }}><Trash2 className="h-3 w-3" /></Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
