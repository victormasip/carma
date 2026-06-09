<?php
/**
 * Plugin Name:       Carma Blog
 * Plugin URI:        https://carma.cat
 * Description:        Drop your Carma blog onto any WordPress page with the Carma Blog block or the [carma_blog] shortcode. The blog renders in an isolated Shadow DOM, so it looks perfect regardless of your theme's CSS.
 * Version:           0.1.0
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Carma
 * Author URI:        https://carma.cat
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       carma-blog
 *
 * T1 + T2 of the Headless/WordPress pivot (docs/plans/2026-06-09-headless-decoupling.md):
 * a THIN client of the already-shipped Carma /embed contract. It never fetches or
 * renders Carma HTML server-side — the visitor's browser loads the isolated blog —
 * so there is NO SSRF / admin-HTML-injection surface (see plan finding E3).
 *
 * Two authoring entry points, ONE renderer: the [carma_blog] shortcode and the Carma
 * Blog Gutenberg block (block/). The block is static — its save() emits the same
 * shortcode, which do_shortcode() runs through carma_blog_shortcode() below.
 *
 * Security model (E2): the two stored settings (site ID + origin) are sanitised on
 * save AND escaped on every output, the origin is pinned to an allowlist, and the
 * settings form rides the WordPress Settings API (nonce + manage_options cap).
 *
 * Mounting (E1): the shortcode emits an EXPLICIT mount div with data-carma-embed;
 * the loader renders into it without relying on document.currentScript, so it does
 * not break under optimizer/defer plugins that move or combine <script> tags.
 *
 * @package CarmaBlog
 */

defined( 'ABSPATH' ) || exit;

define( 'CARMA_BLOG_VERSION', '0.1.0' );

/* -------------------------------------------------------------------------- *
 * Origin resolution + allowlist (E2)
 * -------------------------------------------------------------------------- */

/**
 * The default Carma origin the plugin talks to. Filterable so a self-hosted Carma
 * deployment can point at its own domain.
 *
 * @return string Origin with scheme + host, no trailing slash.
 */
function carma_blog_default_origin() {
	return carma_blog_normalize_origin( apply_filters( 'carma_blog_default_origin', 'https://carma.cat' ) );
}

/**
 * Origins the plugin is allowed to load the blog script from. Defaults to just the
 * Carma origin; extendable via the `carma_blog_allowed_origins` filter for
 * self-hosters. Anything not on this list is rejected (E2) and the default is used.
 *
 * @return string[]
 */
function carma_blog_allowed_origins() {
	$origins = apply_filters( 'carma_blog_allowed_origins', array( carma_blog_default_origin() ) );
	$out     = array();
	foreach ( (array) $origins as $o ) {
		$n = carma_blog_normalize_origin( $o );
		if ( '' !== $n ) {
			$out[] = $n;
		}
	}
	return array_values( array_unique( $out ) );
}

/**
 * Reduce a URL to a bare `scheme://host[:port]` origin (no path/query/fragment).
 * Returns '' for anything that is not a well-formed http(s) URL.
 *
 * @param string $url Raw URL.
 * @return string
 */
function carma_blog_normalize_origin( $url ) {
	$url = esc_url_raw( trim( (string) $url ), array( 'http', 'https' ) );
	if ( '' === $url ) {
		return '';
	}
	$p = wp_parse_url( $url );
	if ( empty( $p['scheme'] ) || empty( $p['host'] ) ) {
		return '';
	}
	$origin = $p['scheme'] . '://' . $p['host'];
	if ( ! empty( $p['port'] ) ) {
		$origin .= ':' . $p['port'];
	}
	return $origin;
}

/**
 * The effective origin to use at render time. Re-validated against the allowlist on
 * EVERY output (defence in depth — never trust the stored value blindly), falling
 * back to the default when the saved origin is empty or no longer allowed.
 *
 * @return string
 */
function carma_blog_origin() {
	$saved = carma_blog_normalize_origin( (string) get_option( 'carma_blog_origin', '' ) );
	if ( '' !== $saved && in_array( $saved, carma_blog_allowed_origins(), true ) ) {
		return $saved;
	}
	return carma_blog_default_origin();
}

/* -------------------------------------------------------------------------- *
 * Settings (Settings API → nonce + capability for free) (E2)
 * -------------------------------------------------------------------------- */

add_action( 'admin_init', 'carma_blog_register_settings' );
add_action( 'admin_menu', 'carma_blog_settings_page' );
add_action( 'init', 'carma_blog_boot' );

/**
 * Late-bind the shortcode + block + load translations.
 */
function carma_blog_boot() {
	load_plugin_textdomain( 'carma-blog', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
	add_shortcode( 'carma_blog', 'carma_blog_shortcode' );
	carma_blog_register_block();
}

/**
 * Register the Carma Blog Gutenberg block (T2 — DX1 hero path).
 *
 * The block is STATIC: its save() emits the very same `[carma_blog ...]` shortcode
 * handled above, so there is exactly one front-end renderer (the shortcode runs via
 * do_shortcode()). No render_callback, no server-side fetch — the SSRF-free contract
 * from T1 (finding E3) is unchanged. block.json carries all metadata + the editor
 * script/style; register_block_type reads it from the /block directory.
 */
function carma_blog_register_block() {
	// register_block_type() with a block.json directory needs WP 5.8+ (our floor).
	if ( function_exists( 'register_block_type' ) && file_exists( __DIR__ . '/block/block.json' ) ) {
		register_block_type( __DIR__ . '/block' );
	}
}

function carma_blog_register_settings() {
	register_setting(
		'carma_blog',
		'carma_blog_site_id',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'carma_blog_sanitize_site_id',
			'default'           => '',
		)
	);
	register_setting(
		'carma_blog',
		'carma_blog_origin',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'carma_blog_sanitize_origin',
			'default'           => '',
		)
	);

	add_settings_section( 'carma_blog_main', '', '__return_false', 'carma_blog' );
	add_settings_field( 'carma_blog_site_id', __( 'Site ID', 'carma-blog' ), 'carma_blog_field_site_id', 'carma_blog', 'carma_blog_main' );
	add_settings_field( 'carma_blog_origin', __( 'Carma origin', 'carma-blog' ), 'carma_blog_field_origin', 'carma_blog', 'carma_blog_main' );
}

function carma_blog_settings_page() {
	add_options_page(
		__( 'Carma Blog', 'carma-blog' ),
		__( 'Carma Blog', 'carma-blog' ),
		'manage_options',
		'carma-blog',
		'carma_blog_render_settings'
	);
}

function carma_blog_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	echo '<div class="wrap">';
	echo '<h1>' . esc_html__( 'Carma Blog', 'carma-blog' ) . '</h1>';
	echo '<p>' . esc_html__( 'Show your Carma blog on this site with the [carma_blog] shortcode (or the Carma Blog block).', 'carma-blog' ) . '</p>';
	echo '<form action="options.php" method="post">';
	settings_fields( 'carma_blog' );        // nonce + option_page + _wp_http_referer.
	do_settings_sections( 'carma_blog' );
	submit_button();
	echo '</form></div>';
}

function carma_blog_field_site_id() {
	$value = (string) get_option( 'carma_blog_site_id', '' );
	printf(
		'<input type="text" class="regular-text" id="carma_blog_site_id" name="carma_blog_site_id" value="%s" placeholder="%s" autocomplete="off" spellcheck="false" />',
		esc_attr( $value ),
		esc_attr__( 'elmeublog', 'carma-blog' )
	);
	echo '<p class="description">' . esc_html__( "Your blog's subdomain label (e.g. \"elmeublog\") or its site UUID — copy it from your Carma dashboard. Lowercase letters, numbers and hyphens only.", 'carma-blog' ) . '</p>';
}

function carma_blog_field_origin() {
	$value   = (string) get_option( 'carma_blog_origin', '' );
	$default = carma_blog_default_origin();
	printf(
		'<input type="url" class="regular-text" id="carma_blog_origin" name="carma_blog_origin" value="%s" placeholder="%s" autocomplete="off" spellcheck="false" />',
		esc_attr( $value ),
		esc_attr( $default )
	);
	echo '<p class="description">' . sprintf(
		/* translators: %s: the default Carma origin URL. */
		esc_html__( 'Leave blank to use the default (%s). Change this only for a self-hosted Carma.', 'carma-blog' ),
		'<code>' . esc_html( $default ) . '</code>'
	) . '</p>';
}

/* -------------------------------------------------------------------------- *
 * Sanitisers (E2 — strict on save; render also re-validates)
 * -------------------------------------------------------------------------- */

/**
 * A Carma site ID is a UUID or a subdomain label: lowercase [a-z0-9-], 1–100 chars.
 * Returns the cleaned value, or '' if it does not match (no side effects).
 *
 * @param string $value Raw value.
 * @return string
 */
function carma_blog_clean_site_id( $value ) {
	$v = strtolower( trim( (string) $value ) );
	if ( '' === $v ) {
		return '';
	}
	return preg_match( '/^[a-z0-9-]{1,100}$/', $v ) ? $v : '';
}

function carma_blog_sanitize_site_id( $value ) {
	$clean = carma_blog_clean_site_id( $value );
	if ( '' === $clean && '' !== trim( (string) $value ) ) {
		add_settings_error(
			'carma_blog_site_id',
			'carma_blog_site_id_invalid',
			__( 'Carma: the site ID may only contain lowercase letters, numbers and hyphens.', 'carma-blog' )
		);
	}
	return $clean;
}

function carma_blog_sanitize_origin( $value ) {
	$raw  = trim( (string) $value );
	$norm = carma_blog_normalize_origin( $raw );

	if ( '' === $norm ) {
		if ( '' !== $raw ) {
			add_settings_error(
				'carma_blog_origin',
				'carma_blog_origin_invalid',
				__( 'Carma: that origin URL is invalid; the default will be used.', 'carma-blog' )
			);
		}
		return '';
	}

	if ( ! in_array( $norm, carma_blog_allowed_origins(), true ) ) {
		add_settings_error(
			'carma_blog_origin',
			'carma_blog_origin_blocked',
			__( 'Carma: that origin is not on the allowlist; the default will be used. Self-hosters can allow it via the carma_blog_allowed_origins filter.', 'carma-blog' )
		);
		return '';
	}

	return $norm;
}

/**
 * Map the WordPress UI locale to a Carma-supported locale for the loader's
 * status strings ("Loading…", "Could not load…") and the render 404s. Mirrors
 * src/lib/i18n/config.ts LOCALES; anything unsupported returns '' so Carma falls
 * back to its own default (Catalan) instead of guessing.
 *
 * @return string 'ca' | 'es' | 'en' | '' (unsupported).
 */
function carma_blog_ui_locale() {
	$supported = array( 'ca', 'es', 'en' );
	// get_locale() is like 'ca', 'es_ES', 'en_US' — reduce to the base language.
	$base = strtolower( substr( (string) get_locale(), 0, 2 ) );
	return in_array( $base, $supported, true ) ? $base : '';
}

/* -------------------------------------------------------------------------- *
 * Token-override params — mirrors src/lib/render/embedParams.ts PARAM_MAP
 * -------------------------------------------------------------------------- */

/**
 * Lowercased shortcode-attribute name → /render query-param name. WordPress lowercases
 * shortcode attribute keys, so `radiusLg` arrives as `radiuslg`; we map it back.
 *
 * @return array<string,string>
 */
function carma_blog_param_map() {
	return array(
		'primary'  => 'primary',
		'accent'   => 'accent',
		'bg'       => 'bg',
		'surface'  => 'surface',
		'text'     => 'text',
		'muted'    => 'muted',
		'border'   => 'border',
		'fonth'    => 'fonth',
		'fontb'    => 'fontb',
		'size'     => 'size',
		'radius'   => 'radius',
		'radiuslg' => 'radiusLg',
		'maxw'     => 'maxw',
		'layout'   => 'layout',
		'cols'     => 'cols',
		'feed'     => 'feed',
	);
}

/**
 * Build the token-override query string from validated shortcode attributes. Mirrors
 * the server-side allowlist in embedParams.ts (constrained keys validated, others
 * length/character-checked). Unknown attributes are already dropped by shortcode_atts.
 *
 * @param array<string,string> $atts Parsed shortcode attributes.
 * @return string Query string (no leading '?'/'&'), RFC3986-encoded.
 */
function carma_blog_build_params( $atts ) {
	$map          = carma_blog_param_map();
	$feed_layouts = array( 'standard', 'editorial', 'magazine', 'minimal', 'gridxl', 'overlay', 'compact' );
	$pairs        = array();

	foreach ( $map as $att_key => $param ) {
		if ( '' === $param || ! isset( $atts[ $att_key ] ) ) {
			continue;
		}
		$val = trim( (string) $atts[ $att_key ] );
		if ( '' === $val ) {
			continue;
		}
		// isSafeValue() parity: short, no stylesheet break-out characters.
		if ( strlen( $val ) > 120 || preg_match( '/[<>{}]/', $val ) ) {
			continue;
		}
		if ( 'layout' === $param && ! in_array( $val, array( 'grid', 'list' ), true ) ) {
			continue;
		}
		if ( 'cols' === $param && ! in_array( $val, array( '2', '3', '4' ), true ) ) {
			continue;
		}
		if ( 'feed' === $param && ! in_array( $val, $feed_layouts, true ) ) {
			continue;
		}
		$pairs[ $param ] = $val;
	}

	if ( empty( $pairs ) ) {
		return '';
	}
	ksort( $pairs ); // stable order → cache-friendly, matches the route's sp.sort().
	return http_build_query( $pairs, '', '&', PHP_QUERY_RFC3986 );
}

/* -------------------------------------------------------------------------- *
 * Shortcode (E1 explicit mount div · E8 refuse-on-empty)
 * -------------------------------------------------------------------------- */

/**
 * [carma_blog] — render the Carma blog where the shortcode sits.
 *
 * Emits an explicit mount div (data-carma-embed) plus the per-site loader script.
 * The loader finds the div and renders into it without document.currentScript, so
 * it survives optimizer/defer plugins (E1). Token tweaks ride on the div, not the
 * script URL, so two embeds of the same site never cross-contaminate.
 *
 * @param array|string $atts Shortcode attributes.
 * @return string HTML.
 */
function carma_blog_shortcode( $atts ) {
	$defaults = array( 'site_id' => '' );
	foreach ( array_keys( carma_blog_param_map() ) as $att_key ) {
		$defaults[ $att_key ] = '';
	}
	$atts = shortcode_atts( $defaults, $atts, 'carma_blog' );

	$site_id = carma_blog_clean_site_id(
		'' !== $atts['site_id'] ? $atts['site_id'] : (string) get_option( 'carma_blog_site_id', '' )
	);

	// E8 — never emit a broken embed. Show an actionable notice to admins only;
	// nothing to ordinary visitors.
	if ( '' === $site_id ) {
		if ( current_user_can( 'manage_options' ) ) {
			return '<div class="carma-blog-notice" style="padding:12px 16px;border:1px solid #dba617;background:#fcf9e8;border-radius:6px;font:14px/1.4 system-ui,sans-serif;color:#674e00">'
				. esc_html__( 'Carma Blog: set your site ID in Settings → Carma Blog to display the blog.', 'carma-blog' )
				. '</div>';
		}
		return '';
	}

	$origin = carma_blog_origin();
	$params = carma_blog_build_params( $atts );
	$uid    = wp_unique_id( 'carma-blog-' );

	// Tell the loader which language to show its status strings in (this WP site's
	// locale), so an ES/EN install never surfaces Carma's default Catalan to
	// visitors. esc_url keeps the final src safe regardless.
	$src_url = $origin . '/embed/' . $site_id;
	$ui      = carma_blog_ui_locale();
	if ( '' !== $ui ) {
		$src_url = add_query_arg( 'ui', $ui, $src_url );
	}
	$src = esc_url( $src_url );

	$html  = '<div class="carma-blog" id="' . esc_attr( $uid ) . '"';
	$html .= ' data-carma-embed="' . esc_attr( $site_id ) . '"';
	$html .= ' data-carma-params="' . esc_attr( $params ) . '"></div>';
	$html .= '<script src="' . $src . '" defer></script>';

	return $html;
}
