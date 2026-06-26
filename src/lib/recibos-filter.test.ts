import { describe, it, expect } from "vitest";
import { extrairRecibadasSet, filtrarNaoRecibadas, type ReciboItemRow } from "./recibos-filter";

describe("extrairRecibadasSet", () => {
  it("inclui extras cujo recibo está ativo", () => {
    const rows: ReciboItemRow[] = [
      { extra_id: "a", recibos: { ativo: true } },
      { extra_id: "b", recibos: { ativo: true } },
    ];
    const set = extrairRecibadasSet(rows);
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("ignora extras cujo recibo está INATIVO (cancelado)", () => {
    const rows: ReciboItemRow[] = [
      { extra_id: "a", recibos: { ativo: false } },
      { extra_id: "b", recibos: { ativo: true } },
    ];
    const set = extrairRecibadasSet(rows);
    expect(set.has("a")).toBe(false);
    expect(set.has("b")).toBe(true);
  });

  it("trata recibos como array (forma alternativa do PostgREST)", () => {
    const rows: ReciboItemRow[] = [
      { extra_id: "a", recibos: [{ ativo: true }] },
      { extra_id: "b", recibos: [{ ativo: false }] },
    ];
    const set = extrairRecibadasSet(rows);
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(false);
  });

  it("é resiliente a null/undefined/payloads vazios", () => {
    expect(extrairRecibadasSet(null).size).toBe(0);
    expect(extrairRecibadasSet(undefined).size).toBe(0);
    expect(extrairRecibadasSet([]).size).toBe(0);
    expect(extrairRecibadasSet([{ extra_id: "", recibos: { ativo: true } }]).size).toBe(0);
    expect(extrairRecibadasSet([{ extra_id: "a", recibos: null }]).size).toBe(0);
  });

  it("mantém a extra recibada quando há pelo menos um recibo ATIVO entre vários", () => {
    const rows: ReciboItemRow[] = [
      { extra_id: "a", recibos: [{ ativo: false }, { ativo: true }] },
    ];
    expect(extrairRecibadasSet(rows).has("a")).toBe(true);
  });
});

describe("filtrarNaoRecibadas", () => {
  const extras = [
    { id: "1", valor: 10 },
    { id: "2", valor: 20 },
    { id: "3", valor: 30 },
  ];

  it("retorna a lista intacta quando o toggle está desligado", () => {
    const set = new Set(["1", "2"]);
    expect(filtrarNaoRecibadas(extras, set, false)).toEqual(extras);
  });

  it("exclui extras já recibadas quando o toggle está ligado", () => {
    const set = new Set(["1", "2"]);
    const out = filtrarNaoRecibadas(extras, set, true);
    expect(out.map((e) => e.id)).toEqual(["3"]);
  });

  it("não exclui nada quando o Set está vazio (nenhuma extra recibada)", () => {
    expect(filtrarNaoRecibadas(extras, new Set(), true)).toEqual(extras);
  });

  it("exclui TODAS quando todas estão em recibo ativo", () => {
    expect(filtrarNaoRecibadas(extras, new Set(["1", "2", "3"]), true)).toEqual([]);
  });

  it("integra extrairRecibadasSet + filtrarNaoRecibadas — extras de recibo cancelado voltam a aparecer", () => {
    // extra "1" estava em recibo cancelado, "2" em recibo ativo, "3" sem recibo
    const itens: ReciboItemRow[] = [
      { extra_id: "1", recibos: { ativo: false } },
      { extra_id: "2", recibos: { ativo: true } },
    ];
    const recibadas = extrairRecibadasSet(itens);
    const out = filtrarNaoRecibadas(extras, recibadas, true);
    expect(out.map((e) => e.id).sort()).toEqual(["1", "3"]);
  });
});
