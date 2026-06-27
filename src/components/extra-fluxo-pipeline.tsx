import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  EXTRA_FLUXO_ETAPAS,
  EXTRA_FLUXO_LEGENDA_SEMANA,
  derivarExtraFluxo,
  type ExtraFluxoInput,
  type ExtraFluxoEtapaEstado,
} from "@/lib/extra-fluxo";

function dotClass(estado: ExtraFluxoEtapaEstado): string {
  if (estado === "done") return "bg-primary border-primary";
  if (estado === "pending") return "bg-muted border-muted-foreground/30";
  return "bg-transparent border-muted-foreground/20 opacity-40";
}

function connectorClass(from: ExtraFluxoEtapaEstado, to: ExtraFluxoEtapaEstado): string {
  if (from === "done" && to === "done") return "bg-primary";
  if (from === "done" && to === "pending") return "bg-primary/40";
  return "bg-muted-foreground/15";
}

export function ExtraFluxoPipeline({ extra }: { extra: ExtraFluxoInput }) {
  const { etapas } = derivarExtraFluxo(extra);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center min-w-[140px]" role="img" aria-label="Fluxo da extra">
        {EXTRA_FLUXO_ETAPAS.map((etapa, i) => {
          const estado = etapas[etapa.key];
          const prevEstado = i > 0 ? etapas[EXTRA_FLUXO_ETAPAS[i - 1].key] : null;
          return (
            <div key={etapa.key} className="flex items-center">
              {i > 0 && prevEstado && (
                <div
                  className={`h-0.5 w-1.5 shrink-0 ${connectorClass(prevEstado, estado)}`}
                  aria-hidden
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full border ${dotClass(estado)}`}
                    title={etapa.label}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[200px]">
                  <span className="font-medium">{etapa.label}</span>
                  {estado === "done" && " — concluída"}
                  {estado === "pending" && " — pendente"}
                  {estado === "inactive" && " — ainda não aplicável"}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function ExtraFluxoLegenda() {
  return (
    <TooltipProvider>
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 mb-3 text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Legenda do fluxo"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            <p className="font-medium mb-1">Fluxo da extra</p>
            <ul className="space-y-0.5 list-disc pl-4">
              {EXTRA_FLUXO_ETAPAS.map((e) => (
                <li key={e.key}>{e.label}</li>
              ))}
            </ul>
            <p className="mt-2 pt-2 border-t">{EXTRA_FLUXO_LEGENDA_SEMANA}</p>
          </TooltipContent>
        </Tooltip>
        <div>
          <span className="font-medium text-foreground">Fluxo: </span>
          {EXTRA_FLUXO_ETAPAS.map((e) => e.label).join(" → ")}.
          {" "}{EXTRA_FLUXO_LEGENDA_SEMANA}
        </div>
      </div>
    </TooltipProvider>
  );
}
