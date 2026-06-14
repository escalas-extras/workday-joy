import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { getRecidivismAlert } from "@/lib/disciplinary-audit.functions";

interface Props { employeeId: string; reasonId?: string | null }

export function RecidivismAlert({ employeeId, reasonId }: Props) {
  const fn = useServerFn(getRecidivismAlert);
  const { data, isLoading } = useQuery({
    queryKey: ["recidivism", employeeId, reasonId ?? null],
    queryFn: () => fn({ data: { employee_id: employeeId, reason_id: reasonId ?? null } }),
    enabled: !!employeeId,
  });
  if (!employeeId || isLoading || !data) return null;
  const d = data as Record<string, number>;
  const total = (d.d30 ?? 0) + (d.d90 ?? 0);
  if (total === 0 && !reasonId) return null;
  const Same = ({ n, label }: { n: number; label: string }) => (
    <div className="flex items-center gap-2">
      <Badge variant={n > 0 ? "destructive" : "secondary"}>{n}</Badge>
      <span className="text-xs">{label}</span>
    </div>
  );
  return (
    <Alert variant={d.d30 > 0 ? "destructive" : "default"}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Alerta de Reincidência</AlertTitle>
      <AlertDescription>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <Same n={d.d30 ?? 0} label="Últimos 30 dias" />
          <Same n={d.d90 ?? 0} label="Últimos 90 dias" />
          <Same n={d.d180 ?? 0} label="Últimos 180 dias" />
          <Same n={d.d365 ?? 0} label="Últimos 365 dias" />
        </div>
        {reasonId && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-semibold mb-2">Mesmo motivo:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Same n={d.d30_same ?? 0} label="30 dias" />
              <Same n={d.d90_same ?? 0} label="90 dias" />
              <Same n={d.d180_same ?? 0} label="180 dias" />
              <Same n={d.d365_same ?? 0} label="365 dias" />
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
