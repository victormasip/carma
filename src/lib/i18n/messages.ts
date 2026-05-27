// Dashboard UI dictionaries. Keys are flat dot-paths; add a key to every locale.
// This is the pattern to extend for full dashboard localization — components call
// useT() and look up keys instead of hardcoding strings.

import type { Locale } from './config'

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
}

export const MESSAGES: Record<Locale, Dict> = { en, es, ca }
