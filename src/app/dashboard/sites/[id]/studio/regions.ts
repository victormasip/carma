// Carma Studio — the map of editable "regions" of the live blog.
//
// Carma renders the blog from design tokens + the cloned header/footer + a
// section title. So the editor is region-based, not a free element tree: the user
// clicks a region in the live preview (or a pill in the inspector) and edits the
// tokens/text that drive it. `selectorMatch` maps a clicked DOM node (inside the
// render's open shadow root) to its region; reliable for the Carma-native parts
// (section title, cards, page). Header/footer ("chrome") is cloned HTML edited as
// source, always reachable via the inspector pill.

export type RegionId = 'global' | 'page' | 'section' | 'cards' | 'chrome'

export type Region = {
  id: RegionId
  label: string
  hint: string
}

export const REGIONS: Record<RegionId, Region> = {
  global:  { id: 'global',  label: 'Global',  hint: 'Colors de marca i tipografia de tot el blog' },
  page:    { id: 'page',    label: 'Pàgina',  hint: 'Fons, color de text i mida base' },
  section: { id: 'section', label: 'Títol',   hint: 'El títol i la capçalera del feed' },
  cards:   { id: 'cards',   label: 'Targetes', hint: 'Disposició del feed i estil de les targetes' },
  chrome:  { id: 'chrome',  label: 'Capçalera i peu', hint: 'El header i footer clonats del teu lloc' },
}

// Inspector pill order (global first = default; chrome last = advanced).
export const REGION_ORDER: RegionId[] = ['global', 'page', 'section', 'cards', 'chrome']

/**
 * Map a clicked element (within the render shadow root) to a region. Walks up via
 * `closest`, so any descendant of a card/section selects the right region;
 * anything else falls back to the page background.
 */
export function regionForElement(el: Element): RegionId {
  if (el.closest('.carma-section-head, .carma-section-title')) return 'section'
  if (el.closest('.carma-card, [class*="carma-card"], .carma-feed, [class*="carma-feed"], [class*="carma-mod-card"]')) return 'cards'
  return 'page'
}

/** The element to outline for a given region (the visual selection target). */
export function highlightTargetFor(root: ParentNode, region: RegionId): Element | null {
  switch (region) {
    case 'section': return root.querySelector('.carma-section-head, .carma-section-title')
    case 'cards':   return root.querySelector('.carma-feed, [class*="carma-feed"], .carma-card, [class*="carma-card"]')
    case 'page':    return root.querySelector('.carma-listing, main, body') ?? (root as Element)
    default:        return null
  }
}
