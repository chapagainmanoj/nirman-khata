// The order of the material picker on slips, deliveries and bills: materials of one heading side by
// side, the headings the user used most recently first, the rest in their usual order; A–Z inside.
// Nothing is listed twice (product owner, 2026-10-19).

type Material = { id: string; name: string; local_name: string | null; default_heading_id: string | null; active: boolean }
type Heading = { id: string; name: string; sort_order: number }

export type MaterialGroup = { key: string; label: string | null; items: Array<{ id: string; label: string }> }

/** "Rod (TMT rebar) · Chhad"; the local name only when it adds something ("Tile", not "Tile · Tile"). */
export function materialLabel(m: { name: string; local_name: string | null }): string {
  const local = m.local_name?.trim()
  return local && !m.name.toLowerCase().includes(local.toLowerCase()) ? `${m.name} · ${local}` : m.name
}

/** `recent`: material ids, newest first. A material with no heading goes in a last, unnamed group. */
export function materialGroups(materials: Material[], headings: Heading[], recent: string[] = []): MaterialGroup[] {
  const heading = new Map(headings.map((h) => [h.id, h]))
  const used = new Map(recent.map((id, i) => [id, i]))
  const groups = new Map<string, MaterialGroup & { used: number; order: number }>()
  for (const m of materials) {
    if (!m.active) continue
    const h = m.default_heading_id ? heading.get(m.default_heading_id) : undefined
    const key = h?.id ?? ''
    const g = groups.get(key) ?? { key, label: h?.name ?? null, items: [], used: Infinity, order: h?.sort_order ?? Infinity }
    g.items.push({ id: m.id, label: materialLabel(m) })
    g.used = Math.min(g.used, used.get(m.id) ?? Infinity)
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.used - b.used || a.order - b.order || (a.label ?? '').localeCompare(b.label ?? ''))
    .map(({ key, label, items }) => ({ key, label, items: items.sort((a, b) => a.label.localeCompare(b.label)) }))
}
