// The Quantity column of the cost-by-heading report (req §18.3, 2026-10-19), from
// report_heading_quantities. Units are never added across kinds: "2 trip · 150 cft". A heading with
// more than two units of material (Hardware: kg, piece, bundle...) shows nothing rather than a
// list too long to read. Labour shows hours (attendance only) and person-days.

export type HeadingQty = { project_id: string; heading_id: string; kind: string; unit: string | null; qty: number }

const MAX_UNITS = 2

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** Quantity text for each "project:heading", e.g. "60 bag" or "85 h · 10.63 person-days". */
export function quantityText(rows: HeadingQty[]): Map<string, string> {
  const by = new Map<string, HeadingQty[]>()
  for (const r of rows) {
    const key = `${r.project_id}:${r.heading_id}`
    by.set(key, [...(by.get(key) ?? []), r])
  }
  const out = new Map<string, string>()
  for (const [key, list] of by) {
    // The server sends the largest quantity of each unit first.
    const material = list.filter((r) => r.kind === 'material')
    const parts = material.length > MAX_UNITS ? [] : material.map((r) => `${num(Number(r.qty))} ${r.unit}`)
    const hours = list.find((r) => r.kind === 'hours')
    const days = list.find((r) => r.kind === 'person_days')
    if (hours) parts.push(`${num(Number(hours.qty))} h`)
    if (days) parts.push(`${num(Number(days.qty))} person-${Number(days.qty) === 1 ? 'day' : 'days'}`)
    if (parts.length) out.set(key, parts.join(' · '))
  }
  return out
}
