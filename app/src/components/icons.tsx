// Navigation icons: one family, 24px grid, 1.75 stroke, round joins, drawn in currentColor.
import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  )
}

/** A building under construction: frame, floor lines and an open bay. */
export function ProjectsIcon() {
  return (
    <Icon>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M5 11h14M5 15h14" />
      <path d="M10 21v-3h4v3" />
    </Icon>
  )
}

export function StaffIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M15.5 4.9a3.25 3.25 0 0 1 0 6.2" />
      <path d="M17.5 14.4A6 6 0 0 1 21 20" />
    </Icon>
  )
}

/** A material sack/box: the catalog is materials, units and cost headings. */
export function CatalogIcon() {
  return (
    <Icon>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5" />
      <path d="M12 12v9" />
    </Icon>
  )
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Icon>
  )
}

/** An order slip: a sheet with lines and a folded corner. */
export function SlipIcon() {
  return (
    <Icon>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 11h7M9 15h7M9 19h4" />
    </Icon>
  )
}

/** A supplier: a shop front with an awning. */
export function SupplierIcon() {
  return (
    <Icon>
      <path d="M4 10v10h16V10" />
      <path d="M3 10l2-6h14l2 6z" />
      <path d="M10 20v-5h4v5" />
    </Icon>
  )
}

export function MoreIcon() {
  return (
    <Icon>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </Icon>
  )
}

export function BellIcon() {
  return (
    <Icon>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Icon>
  )
}
