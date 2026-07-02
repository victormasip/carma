// Pure, dependency-free publishing-method recommendation for the onboarding +
// Connexió surfaces. It adapts to the detected CMS AND the user's plan so the
// product never shows a generic "here's an API key" wall:
//
//   · Free users are guided to the effortless Carma subdomain — the natural
//     default. Their blog is served whole (cloned header + footer), so it looks
//     consistent with the rest of their site with zero setup.
//   · Premium users on WordPress are pointed at the one-click plugin, which
//     inserts the blog INTO their existing site. The embed ships only the feed;
//     their WordPress theme supplies the header, footer and navigation.
//
// Kept string-only + side-effect-free so it's safe to import from client
// components, server components and the render layer alike.

export type PublishMethod = 'subdomain' | 'wordpress-plugin'

export function isWordPress(framework: string | null | undefined): boolean {
  return (framework ?? '').toLowerCase() === 'wordpress'
}

/**
 * The recommended primary way to take this blog live, given the captured
 * framework and whether the user is on a paid plan.
 *
 *   Premium + WordPress → 'wordpress-plugin' (native, inserts into their site).
 *   Everyone else       → 'subdomain'        (zero-setup, cloned chrome included).
 *
 * The WordPress plugin is intentionally a Premium capability: a free WordPress
 * user is still recommended the subdomain (and separately offered the plugin as
 * an upgrade), never left without a path to publish.
 */
export function recommendPublishMethod(
  framework: string | null | undefined,
  isPremium: boolean,
): PublishMethod {
  if (isPremium && isWordPress(framework)) return 'wordpress-plugin'
  return 'subdomain'
}

/**
 * One-line, plan-aware note on how the blog goes live AND what happens to the
 * header/footer — reused by the capture-success modals so the "magic" moment
 * already answers "…and how does this reach my site?". Catalan (app default).
 */
export function captureChromeNote(
  framework: string | null | undefined,
  isPremium: boolean,
): string {
  return recommendPublishMethod(framework, isPremium) === 'wordpress-plugin'
    ? 'S’inserirà a WordPress amb el nostre plugin: el teu tema hi posa la capçalera i el peu.'
    : 'Es publicarà al teu subdomini i heretarà la capçalera i el peu del teu lloc.'
}
