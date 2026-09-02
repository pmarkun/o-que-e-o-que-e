type IconProps = { size?: number; className?: string }

export function SearchIcon({ size = 22, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.75" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ExternalIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13.5 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19h10.4a1.8 1.8 0 0 0 1.8-1.8v-6.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function EditIcon({ size = 21, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="m14.2 5.3 4.5 4.5M5 19l1-4.7L15.7 4.6a1.5 1.5 0 0 1 2.1 0l1.6 1.6a1.5 1.5 0 0 1 0 2.1L9.7 18 5 19Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

export function HistoryIcon({ size = 22, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.6 8.2A8 8 0 1 1 4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4.5 4.8v3.8h3.8M12 7.5v5l3.2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CloseIcon({ size = 22, className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
