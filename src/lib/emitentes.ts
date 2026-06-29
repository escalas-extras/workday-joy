import { supabase } from "@/integrations/supabase/client";

/**
 * Enriquece registros que possuem `emitente_id` (usuário que lançou) com `emitente_nome`,
 * buscando os nomes em `profiles` (auth.users.id == profiles.id).
 * Não há FK entre extras.emitente_id e profiles, por isso o join é feito client-side.
 */
export async function enrichEmitentes<T extends { emitente_id?: string | null }>(
  rows: T[],
): Promise<(T & { emitente_nome: string })[]> {
  if (!rows.length) return rows.map((r) => ({ ...r, emitente_nome: "" }));
  const ids = Array.from(new Set(rows.map((r) => r.emitente_id).filter(Boolean) as string[]));
  const nameById: Record<string, string> = {};
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id, nome").in("id", ids);
    for (const p of (data ?? []) as { id: string; nome: string }[]) nameById[p.id] = p.nome;
  }
  return rows.map((r) => ({
    ...r,
    emitente_nome: r.emitente_id ? (nameById[r.emitente_id] ?? "") : "",
  }));
}
