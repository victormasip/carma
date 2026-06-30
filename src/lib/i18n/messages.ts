// Dashboard UI dictionaries. Keys are flat dot-paths; add a key to every locale.
// This is the pattern to extend for full dashboard localization — components call
// useT() and look up keys instead of hardcoding strings.

import { uiLocale, type Locale, type UiLocale } from './config'

export type Dict = Record<string, string>

const en: Dict = {
  'nav.allSites': 'All Sites',
  'nav.mySites': 'My Sites',
  'nav.yourSites': 'Your sites',
  'nav.settings': 'Settings',
  'nav.openMenu': 'Open menu',
  'nav.closeMenu': 'Close menu',
  'nav.language': 'Language',
  'role.superadmin': 'Superadmin',
  'role.client': 'Client',
  'common.signOut': 'Sign out',
  'nav.theme': 'Theme',
  'nav.theme.light': 'Light',
  'nav.theme.dark': 'Dark',
  'nav.theme.system': 'System',
  // Public render/embed status strings (visitor-facing, served by the /render
  // routes and the /embed loader). Localised so a non-Catalan site/host does not
  // surface Catalan to its visitors.
  'render.siteNotFound': 'Site not found',
  'render.articleNotFound': 'Article not found',
  'embed.loading': 'Loading…',
  'embed.loadError': 'Could not load the blog.',
}

const es: Dict = {
  'nav.allSites': 'Todos los sitios',
  'nav.mySites': 'Mis sitios',
  'nav.yourSites': 'Tus sitios',
  'nav.settings': 'Configuración',
  'nav.openMenu': 'Abrir menú',
  'nav.closeMenu': 'Cerrar menú',
  'nav.language': 'Idioma',
  'role.superadmin': 'Superadmin',
  'role.client': 'Cliente',
  'common.signOut': 'Cerrar sesión',
  'nav.theme': 'Tema',
  'nav.theme.light': 'Claro',
  'nav.theme.dark': 'Oscuro',
  'nav.theme.system': 'Sistema',
  'render.siteNotFound': 'Sitio no encontrado',
  'render.articleNotFound': 'Artículo no encontrado',
  'embed.loading': 'Cargando…',
  'embed.loadError': 'No se ha podido cargar el blog.',
}

const ca: Dict = {
  'nav.allSites': 'Tots els Llocs',
  'nav.mySites': 'Els meus Llocs',
  'nav.yourSites': 'Els teus llocs',
  'nav.settings': 'Configuració',
  'nav.openMenu': 'Obrir menú',
  'nav.closeMenu': 'Tancar menú',
  'nav.language': 'Idioma',
  'role.superadmin': 'Superadmin',
  'role.client': 'Client',
  'common.signOut': 'Tancar sessió',
  'nav.theme': 'Tema',
  'nav.theme.light': 'Clar',
  'nav.theme.dark': 'Fosc',
  'nav.theme.system': 'Sistema',
  'render.siteNotFound': 'Lloc no trobat',
  'render.articleNotFound': 'Article no trobat',
  'embed.loading': 'Carregant…',
  'embed.loadError': 'No s\'ha pogut carregar el blog.',
}

// Keyed by UI locale only — these are the languages with a hand-written
// dictionary. Content locales beyond ca/es/en (fr, de, …) map onto the closest
// UI locale via uiLocale() so the chrome still renders in a real language.
export const MESSAGES: Record<UiLocale, Dict> = { en, es, ca }

// Server-safe lookup for non-React contexts (route handlers, the embed loader
// builder). Clamps any content locale to a UI locale, then falls back to the
// raw key, so a missing translation degrades gracefully instead of "undefined".
export function tr(locale: Locale, key: string): string {
  const ui = uiLocale(locale)
  return MESSAGES[ui]?.[key] ?? MESSAGES.ca[key] ?? key
}
