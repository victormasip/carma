=== Carma Blog ===
Contributors: carma
Tags: blog, embed, headless, shortcode, gutenberg
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Drop your Carma blog onto any WordPress page with a block or shortcode. It renders in an isolated Shadow DOM, immune to your theme's CSS.

== Description ==

Carma Blog embeds the blog you built on [Carma](https://carma.cat) into your
WordPress site. Add the **Carma Blog** block (or the `[carma_blog]` shortcode)
to any page or post and your articles appear right where you put them.

The feed is rendered inside a Shadow DOM, so it looks exactly like it does on
Carma regardless of your active theme: your theme's CSS cannot bleed into the
blog, and the blog's styles cannot leak out into your site.

**How it works**

The plugin is a thin, privacy-respecting client. It does **not** fetch or render
any Carma content on your server. It only outputs a single `<script>` tag that
loads Carma's embed loader in the visitor's browser; the loader then fetches the
style-isolated blog fragment directly from Carma over HTTPS. Your server never
proxies remote HTML, so there is no server-side request surface to worry about.

**Features**

* Gutenberg block with a live placeholder and inspector controls (feed layout,
  card layout, columns).
* `[carma_blog]` shortcode for Classic Editor, widgets, and page builders.
* Settings screen with a live connection check (Connected / Invalid ID).
* Optional per-embed design-token overrides (colours, fonts, radius, layout).
* Localised status strings (Catalan, Spanish, English), matched to your site.

== Installation ==

1. In WordPress, go to **Plugins → Add New → Upload Plugin** and upload the
   `carma-blog.zip` you downloaded from your Carma dashboard (or install from the
   WordPress.org directory once it is published there).
2. Activate **Carma Blog**.
3. Go to **Settings → Carma Blog** and enter your **Site ID** (the subdomain
   label, e.g. `elmeublog`, or the site UUID) from your Carma dashboard. Save.
4. The settings screen confirms **Connected ✓** when the Site ID is valid.
5. Edit any page, add the **Carma Blog** block (or the `[carma_blog]` shortcode),
   and publish.

== Frequently Asked Questions ==

= Where do I find my Site ID? =

In your Carma dashboard, open the site you want to embed. The Site ID is its
subdomain label (for example `elmeublog`) or its site UUID. The settings screen
shows **Connected ✓** once you enter a valid one.

= The blog is blank or shows "Could not load the blog." =

This almost always means your site enforces a Content Security Policy (CSP) that
blocks the embed, or the Site ID is wrong. Check **Settings → Carma Blog** for
the connection status, and see the "Content Security Policy" section below.

= Does this slow down my server or store my content? =

No. The plugin makes no server-side request to render content; the blog loads in
the visitor's browser straight from Carma. The only server-side request is an
optional admin-only connection check when you open the settings screen.

= Can I change the blog's colours or layout? =

Yes. The block's inspector exposes the common options (feed layout, card layout,
columns). The shortcode accepts the same plus design-token overrides, e.g.
`[carma_blog feed="editorial" cols="3" primary="0b5cff"]`.

== Content Security Policy (CSP) ==

If your site sends a `Content-Security-Policy` header (via a security plugin,
your host, or a reverse proxy), allow the Carma origin so the embed can load.
Replace `https://carma.cat` with your configured origin if you use a self-hosted
Carma. The Settings → Carma Blog screen prints these directives with your actual
origin filled in.

    script-src  https://carma.cat;
    connect-src https://carma.cat;
    style-src   'unsafe-inline' https://carma.cat;
    font-src    https://carma.cat data:;
    img-src     https://carma.cat data:;

Notes:

* `style-src 'unsafe-inline'` is required: the loader injects the blog's styles
  as an inline `<style>` element inside its Shadow DOM.
* `font-src` and `img-src` may also need the hosts your blog's design pulls from
  (for example `https://fonts.gstatic.com` for Google Fonts, or wherever your
  post images live). Add those alongside the Carma origin.
* These extend your existing directives; merge them with what you already allow.

== Changelog ==

= 0.1.0 =
* Initial release: Carma Blog block, `[carma_blog]` shortcode, settings screen
  with live connection check, localised status strings, and CSP guidance.

== Upgrade Notice ==

= 0.1.0 =
Initial release.
