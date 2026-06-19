// Utilitários compartilhados para os relatórios:
// - opções de Mês / Semana (semana = sexta..quinta, mês = mês da quarta de referência)
// - agrupamento de linhas por Mês -> Semana, usado nos acordeões de "Arquivos fechados"

const MESES_NOMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const ORD = ["1ª", "2ª", "3ª", "4ª", "5ª", "6ª"];

export type Opt = { v: string; l: string };

/** 14 meses (12 anteriores, atual, próximo) — descendente recente. */
export function buildMesesOpts(): Opt[] {
  const out: Opt[] = [];
  const now = new Date();
  for (let i = 1; i >= -12; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ v, l: `${MESES_NOMES[d.getMonth()]}/${d.getFullYear()}` });
  }
  return out;
}

/** Sextas-feiras cuja quarta de referência cai no mês `YYYY-MM`. */
export function buildSemanasOpts(mesRef: string): Opt[] {
  if (!mesRef) return [];
  const [yy, mm] = mesRef.split("-").map(Number);
  const out: Opt[] = [];
  const ini = new Date(Date.UTC(yy, mm - 1, 1)); ini.setUTCDate(ini.getUTCDate() - 7);
  const fim = new Date(Date.UTC(yy, mm, 7));
  let ord = 0;
  for (let d = new Date(ini); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 5) continue;
    const wed = new Date(d); wed.setUTCDate(wed.getUTCDate() + 5);
    if (wed.getUTCFullYear() !== yy || wed.getUTCMonth() !== mm - 1) continue;
    out.push({ v: d.toISOString().slice(0, 10), l: `${ORD[ord] ?? `${ord + 1}ª`} Semana` });
    ord++;
  }
  return out;
}

/** Período (de/ate) efetivo a partir do par mês+semana. */
export function derivePeriodo(
  mesRef: string,
  semana: string,
  semanasOpts: Opt[],
): { de: string; ate: string } {
  if (semana && semana !== "_all") {
    // semana cobre sexta..quinta (7 dias)
    const ini = new Date(`${semana}T00:00:00Z`);
    const fim = new Date(ini); fim.setUTCDate(fim.getUTCDate() + 6);
    return { de: semana, ate: fim.toISOString().slice(0, 10) };
  }
  if (semanasOpts.length) {
    const primeira = semanasOpts[0].v;
    const ultima = semanasOpts[semanasOpts.length - 1].v;
    const fim = new Date(`${ultima}T00:00:00Z`); fim.setUTCDate(fim.getUTCDate() + 6);
    return { de: primeira, ate: fim.toISOString().slice(0, 10) };
  }
  // fallback: mês civil inteiro
  const [yy, mm] = mesRef.split("-").map(Number);
  const ini = new Date(Date.UTC(yy, mm - 1, 1));
  const fim = new Date(Date.UTC(yy, mm, 0));
  return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}

export type SemanaBucket<T> = { key: string; label: string; rows: T[] };
export type MesBucket<T> = { key: string; label: string; semanas: SemanaBucket<T>[] };

/** Sexta-feira da semana que contém `iso` (datas YYYY-MM-DD); semana = sex..qui. */
export function sextaDaSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=dom..6=sab
  const back = (dow - 5 + 7) % 7; // 5 = sex
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

/** Agrupa linhas por Mês -> Semana usando a data fornecida por `getDate`. */
export function agruparMesSemana<T>(rows: T[], getDate: (r: T) => string): MesBucket<T>[] {
  const meses = new Map<string, MesBucket<T>>();
  const ordinalCache = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const iso = getDate(r);
    if (!iso) continue;
    const sextaIso = sextaDaSemana(iso);
    const [sy, sm, sd] = sextaIso.split("-").map(Number);
    const wed = new Date(Date.UTC(sy, sm - 1, sd)); wed.setUTCDate(wed.getUTCDate() + 5);
    const yy = wed.getUTCFullYear(); const mm = wed.getUTCMonth();
    const mesKey = `${yy}-${String(mm + 1).padStart(2, "0")}`;

    let bucket = meses.get(mesKey);
    if (!bucket) {
      bucket = { key: mesKey, label: `${MESES_NOMES[mm]}/${yy}`, semanas: [] };
      meses.set(mesKey, bucket);
    }
    let ordMap = ordinalCache.get(mesKey);
    if (!ordMap) {
      ordMap = new Map();
      const ini = new Date(Date.UTC(yy, mm, 1)); ini.setUTCDate(ini.getUTCDate() - 7);
      const fim = new Date(Date.UTC(yy, mm + 1, 7));
      let o = 0;
      for (let dd = new Date(ini); dd <= fim; dd.setUTCDate(dd.getUTCDate() + 1)) {
        if (dd.getUTCDay() !== 5) continue;
        const w = new Date(dd); w.setUTCDate(w.getUTCDate() + 5);
        if (w.getUTCFullYear() !== yy || w.getUTCMonth() !== mm) continue;
        ordMap.set(dd.toISOString().slice(0, 10), o++);
      }
      ordinalCache.set(mesKey, ordMap);
    }
    const ord = ordMap.get(sextaIso) ?? 0;
    let sem = bucket.semanas.find((s) => s.key === sextaIso);
    if (!sem) {
      sem = { key: sextaIso, label: `${ORD[ord] ?? `${ord + 1}ª`} Semana (${sextaIso})`, rows: [] };
      bucket.semanas.push(sem);
    }
    sem.rows.push(r);
  }
  const out = [...meses.values()].sort((a, b) => b.key.localeCompare(a.key));
  for (const m of out) m.semanas.sort((a, b) => b.key.localeCompare(a.key));
  return out;
}
