import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn-style `cn` for 21st.dev / shadcn components: merges Tailwind classes so a
 * trailing `className` reliably overrides earlier variant classes. Carma's own
 * components use the lighter `@/lib/cn`; this lives alongside it for the imported
 * component ecosystem (which all import `cn` from `@/lib/utils`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
