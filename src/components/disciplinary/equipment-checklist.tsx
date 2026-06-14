import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getEquipmentChecklist, saveEquipmentChecklist } from "@/lib/disciplinary-audit.functions";

const DEFAULT_ITEMS = [
  "Uniforme", "Crachá", "Chaves", "Rádio HT", "Celular corporativo", "Notebook", "Veículo", "Outros",
];

interface Item { item: string; returned: boolean; observation?: string }

export function EquipmentChecklist({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getEquipmentChecklist);
  const save = useServerFn(saveEquipmentChecklist);
  const { data } = useQuery({
    queryKey: ["equip-checklist", caseId],
    queryFn: () => get({ data: { case_id: caseId } }),
  });
  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS.map((i) => ({ item: i, returned: false })));
  const [returnDate, setReturnDate] = useState("");
  const [observations, setObservations] = useState("");
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    if (data) {
      setItems((data.items as unknown as Item[]) ?? DEFAULT_ITEMS.map((i) => ({ item: i, returned: false })));
      setReturnDate(data.return_date ?? "");
      setObservations(data.observations ?? "");
      setCompleted(data.completed ?? false);
    }
  }, [data]);
  async function handleSave(markComplete = false) {
    try {
      await save({ data: { case_id: caseId, items, return_date: returnDate || null, observations: observations || null, completed: markComplete || completed } });
      toast.success("Checklist salvo");
      qc.invalidateQueries({ queryKey: ["equip-checklist", caseId] });
    } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Card>
      <CardHeader><CardTitle>Devolução de Uniformes e Equipamentos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 flex items-center gap-2">
                <Checkbox checked={it.returned} onCheckedChange={(v) => { const n = [...items]; n[idx] = { ...n[idx], returned: !!v }; setItems(n); }} />
                <span className="text-sm">{it.item}</span>
              </div>
              <Input className="col-span-8" placeholder="Observação"
                value={it.observation ?? ""} onChange={(e) => { const n = [...items]; n[idx] = { ...n[idx], observation: e.target.value }; setItems(n); }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Data da devolução</Label><Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} /></div>
        </div>
        <div><Label>Observações gerais</Label><Textarea value={observations} onChange={(e) => setObservations(e.target.value)} rows={3} /></div>
        <div className="flex gap-2">
          <Button onClick={() => handleSave(false)}>Salvar</Button>
          <Button variant="default" onClick={() => handleSave(true)}>Marcar como concluído</Button>
          {completed && <span className="text-sm text-green-600 self-center">✓ Concluído</span>}
        </div>
      </CardContent>
    </Card>
  );
}
