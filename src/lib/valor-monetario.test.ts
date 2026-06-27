import { describe, it, expect } from "vitest";
import { normalizarValorMonetario, validarValorExtraInput, coalesceValorMonetario } from "./valor-monetario";

describe("valor-monetario", () => {
  it("aceita zero", () => {
    expect(normalizarValorMonetario(0)).toBe(0);
    expect(normalizarValorMonetario("0")).toBe(0);
    expect(normalizarValorMonetario("0.00")).toBe(0);
    expect(validarValorExtraInput("0")).toBe(0);
  });

  it("aceita valores positivos", () => {
    expect(normalizarValorMonetario(150.5)).toBe(150.5);
  });

  it("rejeita negativos", () => {
    expect(() => normalizarValorMonetario(-0.01)).toThrow(/negativo/i);
    expect(() => validarValorExtraInput("-1")).toThrow(/negativo/i);
  });

  it("rejeita inválidos", () => {
    expect(() => normalizarValorMonetario(NaN)).toThrow(/inválido/i);
    expect(() => validarValorExtraInput("")).toThrow(/informe/i);
  });

  it("coalesce trata null/undefined como zero", () => {
    expect(coalesceValorMonetario(null)).toBe(0);
    expect(coalesceValorMonetario(undefined)).toBe(0);
  });
});
