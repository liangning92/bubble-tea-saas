/** Keep response metadata independent of name filtering and preserve each row window. */
export function usageCoverage(rows: {observationCount?:number;windowStart:string;windowEnd:string}[]) {
  const observed = rows.filter(r => r.observationCount === 2)
  return {start: observed.map(r => r.windowStart).sort()[0] || null,
    end: observed.map(r => r.windowEnd).sort().slice(-1)[0] || null,
    mixed: new Set(observed.map(r => `${r.windowStart}/${r.windowEnd}`)).size > 1}
}
