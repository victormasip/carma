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
// Bust the cached connectivity result whenever the ID or origin changes, so the
// settings screen re-tests against the new value instead of showing a stale badge.
add_action( 'update_option_carma_blog_site_id', 'carma_blog_flush_conn_cache' );
add_action( 'update_option_carma_blog_origin', 'carma_blog_flush_conn_cache' );
// Bust the cached account-sites list when the token or origin changes, so the
// "Connect to Carma" dropdown re-fetches instead of showing a stale list (T6).
add_action( 'update_option_carma_blog_api_token', 'carma_blog_flush_sites_cache' );
add_action( 'update_option_carma_blog_origin', 'carma_blog_flush_sites_cache' );

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
		'carma_blog_api_token',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'carma_blog_sanitize_api_token',
			'default'           => '',
		)
	);
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
	add_settings_field( 'carma_blog_api_token', __( 'Account API Token', 'carma-blog' ), 'carma_blog_field_api_token', 'carma_blog', 'carma_blog_main' );
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

	// Forced re-check (nonce-protected): drop the cached result before rendering
	// the badge so the admin gets a fresh probe. check_admin_referer() dies on a
	// bad/missing nonce, so this cannot be triggered cross-site.
	if ( isset( $_GET['carma_recheck'] ) && check_admin_referer( 'carma_blog_recheck' ) ) {
		carma_blog_flush_conn_cache();
	}

	echo '<div class="wrap">';
	echo '<h1>' . esc_html__( 'Carma Blog', 'carma-blog' ) . '</h1>';
	echo '<p>' . esc_html__( 'Show your Carma blog on this site with the [carma_blog] shortcode (or the Carma Blog block).', 'carma-blog' ) . '</p>';
	carma_blog_render_conn_status();
	echo '<form action="options.php" method="post">';
	settings_fields( 'carma_blog' );        // nonce + option_page + _wp_http_referer.
	do_settings_sections( 'carma_blog' );
	submit_button();
	echo '</form>';
	carma_blog_render_csp_info();
	echo '</div>';
}

/**
 * Render the Content Security Policy guidance on the settings screen (E4 / DX4).
 *
 * Hosts that send a Content-Security-Policy header (security plugins, managed
 * hosts, reverse proxies) will block the embed unless the Carma origin is
 * allowed. We can't set the host's CSP for them — and WP per-render nonces can't
 * cover a cross-origin script — so we surface the EXACT directives to add, with
 * the live configured origin filled in. Tucked in a <details> so it stays out of
 * the way until needed.
 */
function carma_blog_render_csp_info() {
	$origin = carma_blog_origin();
	// scheme://host of the origin, used for font/img examples.
	$o = esc_html( $origin );

	$directives = sprintf(
		"script-src  %1\$s;\nconnect-src %1\$s;\nstyle-src   'unsafe-inline' %1\$s;\nfont-src    %1\$s data:;\nimg-src     %1\$s data:;",
		$o
	);

	echo '<details class="carma-blog-csp" style="margin-top:20px;max-width:48rem">';
	echo '<summary style="cursor:pointer;font-weight:600">' . esc_html__( 'Content Security Policy (CSP) requirements', 'carma-blog' ) . '</summary>';
	echo '<div style="margin-top:8px">';
	echo '<p>' . esc_html__( "If your site sends a Content-Security-Policy header, allow the Carma origin so visitors' browsers don't block the embed. Add (or merge) these directives:", 'carma-blog' ) . '</p>';
	// $directives is built only from esc_html($origin) + static literals — safe.
	echo '<pre style="padding:12px;background:#f6f7f7;border:1px solid #dcdcde;border-radius:4px;overflow:auto"><code>' . $directives . '</code></pre>';
	echo '<p class="description">' . wp_kses(
		__( "<code>style-src 'unsafe-inline'</code> is required — the loader injects the blog's styles inline in its Shadow DOM. <code>font-src</code> and <code>img-src</code> may also need your design's asset hosts (e.g. <code>https://fonts.gstatic.com</code> for Google Fonts, or wherever your post images live).", 'carma-blog' ),
		array( 'code' => array() )
	) . '</p>';
	echo '</div></details>';
}

/**
 * Account API Token field (T6). Optional credential that unlocks the
 * "Connect to Carma" site picker: paste your blog's Carma API key, Save, and the
 * Site ID field below resolves and selects your blog for you (no hand-copying).
 *
 * Rendered as a password input so the saved key is not shoulder-surfed on the
 * settings screen. Admin-only (manage_options), so echoing the value is fine.
 */
function carma_blog_field_api_token() {
	$value = (string) get_option( 'carma_blog_api_token', '' );
	printf(
		'<input type="password" class="regular-text" id="carma_blog_api_token" name="carma_blog_api_token" value="%s" placeholder="%s" autocomplete="off" spellcheck="false" />',
		esc_attr( $value ),
		esc_attr__( 'paste your Carma API key', 'carma-blog' )
	);
	echo '<p class="description">' . esc_html__( "Optional. Paste your blog's Carma API key and Save to select your blog automatically below — no need to copy an ID by hand. Find it in your Carma dashboard under \"Clau API d'Accés\". Leave blank to enter a Site ID manually.", 'carma-blog' ) . '</p>';
}

function carma_blog_field_site_id() {
	$value     = (string) get_option( 'carma_blog_site_id', '' );
	$token     = (string) get_option( 'carma_blog_api_token', '' );
	$effective = $value; // What the Site ID input shows; may be auto-filled below.

	// T6 "Connect to Carma": when an account token is saved, resolve the blog it
	// belongs to server-side so the user can confirm/pick it. Admin-only
	// diagnostic, exactly like the connectivity check (T4): targets ONLY the
	// allowlist-pinned Carma origin, never a visitor/attacker URL → no SSRF. The
	// API key is per-site, so this list is normally a single blog; we handle 1 or
	// many uniformly.
	if ( '' !== $token ) {
		$res = carma_blog_fetch_account_sites( carma_blog_origin(), $token );
		if ( $res['ok'] && ! empty( $res['sites'] ) ) {
			$sites  = $res['sites'];
			$single = ( 1 === count( $sites ) );

			// One blog (the normal per-site-key case) → auto-select it so the user
			// just clicks Save. Don't override an existing saved choice.
			if ( $single && '' === $effective ) {
				$effective = $sites[0]['value'];
			}

			echo '<select id="carma_blog_site_picker" class="regular-text" style="margin-bottom:8px">';
			// Only offer the empty placeholder when there is an actual choice to
			// make; a single blog is preselected instead.
			if ( ! $single ) {
				echo '<option value="">' . esc_html__( '— Choose a blog —', 'carma-blog' ) . '</option>';
			}
			foreach ( $sites as $s ) {
				printf(
					'<option value="%1$s"%3$s>%2$s</option>',
					esc_attr( $s['value'] ),
					esc_html( $s['name'] . ' (' . $s['value'] . ')' ),
					selected( $s['value'], $effective, false )
				);
			}
			echo '</select>';
			$pick_hint = $single
				? __( 'We found your blog and selected it below. Just Save.', 'carma-blog' )
				: __( 'Pick the blog to display, then Save. Your choice fills the Site ID below.', 'carma-blog' );
			echo '<p class="description">' . esc_html( $pick_hint ) . '</p>';
			// Sync the picker into the authoritative Site ID input (one source of
			// truth). Static admin-only script, no injected data, so it is safe.
			echo '<script>(function(){var p=document.getElementById("carma_blog_site_picker"),t=document.getElementById("carma_blog_site_id");if(p&&t){p.addEventListener("change",function(){if(p.value){t.value=p.value;}});}})();</script>';
		} elseif ( $res['ok'] ) {
			echo '<p class="description">' . esc_html__( 'No blog found for this API token.', 'carma-blog' ) . '</p>';
		} else {
			echo '<p class="description" style="color:#b32d2e">' . esc_html__( "Couldn't load your blog with that token. Check the Account API Token above, or enter a Site ID manually below.", 'carma-blog' ) . '</p>';
		}
	}

	printf(
		'<input type="text" class="regular-text" id="carma_blog_site_id" name="carma_blog_site_id" value="%s" placeholder="%s" autocomplete="off" spellcheck="false" />',
		esc_attr( $effective ),
		esc_attr__( 'elmeublog', 'carma-blog' )
	);
	echo '<p class="description">' . esc_html__( "Your blog's subdomain label (e.g. \"elmeublog\") or its site UUID — copy it from your Carma dashboard, or pick from the list above. Lowercase letters, numbers and hyphens only.", 'carma-blog' ) . '</p>';
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
 * Connectivity check (T4 / DX3) — admin-only "Connected ✓ / Invalid ID" badge
 * -------------------------------------------------------------------------- */

/**
 * Cache key for a given origin+site_id connectivity result.
 *
 * @param string $origin  Resolved Carma origin.
 * @param string $site_id Cleaned site ID.
 * @return string
 */
function carma_blog_conn_transient_key( $origin, $site_id ) {
	return 'carma_blog_conn_' . md5( $origin . '|' . $site_id );
}

/**
 * Verify that $site_id resolves to a real, reachable Carma site at $origin.
 *
 * SECURITY (re T1 finding E3): E3 forbids a server-side fetch on the FRONT END
 * (the SSRF / remote-HTML-injection surface). This is a different animal — an
 * ADMIN-ONLY diagnostic that (a) runs only on the settings screen behind the
 * manage_options capability, (b) targets ONLY the allowlist-pinned Carma origin,
 * never a visitor- or attacker-supplied URL, and (c) reads ONLY the HTTP status
 * line; the response body is never parsed, stored, or echoed anywhere. So it adds
 * no SSRF surface and never injects remote markup into a page.
 *
 * It hits /render/<id>?format=fragment, NOT /embed/<id>: the embed loader is
 * served for ANY id (it is just a script), whereas the fragment render is what
 * actually 404s for an unknown site — so it is the only honest existence signal.
 *
 * @param string $origin    Resolved Carma origin (already allowlist-validated).
 * @param string $site_id   Cleaned site ID.
 * @param bool   $use_cache Read the cached result when available.
 * @return array{status:string,code:int} status ∈ empty|connected|invalid|unreachable
 */
function carma_blog_check_connection( $origin, $site_id, $use_cache = true ) {
	if ( '' === $site_id ) {
		return array(
			'status' => 'empty',
			'code'   => 0,
		);
	}

	$key = carma_blog_conn_transient_key( $origin, $site_id );
	if ( $use_cache ) {
		$cached = get_transient( $key );
		if ( is_array( $cached ) && isset( $cached['status'] ) ) {
			return $cached;
		}
	}

	$url = esc_url_raw( $origin . '/render/' . rawurlencode( $site_id ) . '?format=fragment' );
	$res = wp_remote_get(
		$url,
		array(
			'timeout'     => 8,
			'redirection' => 2,
			'sslverify'   => true,
			'headers'     => array( 'Accept' => 'application/json' ),
		)
	);

	if ( is_wp_error( $res ) ) {
		$out = array(
			'status' => 'unreachable',
			'code'   => 0,
		);
	} else {
		$code = (int) wp_remote_retrieve_response_code( $res );
		if ( 200 === $code ) {
			$out = array(
				'status' => 'connected',
				'code'   => 200,
			);
		} elseif ( 404 === $code ) {
			$out = array(
				'status' => 'invalid',
				'code'   => 404,
			);
		} else {
			$out = array(
				'status' => 'unreachable',
				'code'   => $code,
			);
		}
	}

	// Cache definitive answers (connected / invalid) for 5 min, but a transient
	// "unreachable" only briefly — so a momentary network blip or Carma restart
	// doesn't pin a scary badge for 5 minutes after things recover.
	$ttl = ( 'unreachable' === $out['status'] ) ? 30 : 5 * MINUTE_IN_SECONDS;
	set_transient( $key, $out, $ttl );
	return $out;
}

/**
 * Clear the cached connectivity result for the CURRENT origin+site_id. Hooked on
 * option updates; any stale entry under a previous value simply expires via TTL.
 */
function carma_blog_flush_conn_cache() {
	delete_transient(
		carma_blog_conn_transient_key( carma_blog_origin(), (string) get_option( 'carma_blog_site_id', '' ) )
	);
}

/* -------------------------------------------------------------------------- *
 * Account sites lookup (T6 / DX) — "Connect to Carma" dropdown
 * -------------------------------------------------------------------------- */

/**
 * Cache key for a given origin+token account-sites result.
 *
 * @param string $origin Resolved Carma origin.
 * @param string $token  Account API token.
 * @return string
 */
function carma_blog_sites_transient_key( $origin, $token ) {
	return 'carma_blog_sites_' . md5( $origin . '|' . $token );
}

/**
 * Clear the cached account-sites list for the CURRENT origin+token. Hooked on
 * option updates; stale entries under a previous value expire via TTL.
 */
function carma_blog_flush_sites_cache() {
	delete_transient(
		carma_blog_sites_transient_key( carma_blog_origin(), (string) get_option( 'carma_blog_api_token', '' ) )
	);
}

/**
 * Resolve the Account API Token to the blog it belongs to, so the settings
 * screen can offer the "Connect to Carma" picker (T6). The endpoint scopes a
 * per-site key to that single site, so this normally returns one blog; the list
 * shape is preserved for forward-compat and handled uniformly by the caller.
 *
 * SECURITY (re T1 finding E3): like the connectivity check, this is an
 * ADMIN-ONLY diagnostic that runs only on the settings screen behind
 * manage_options, targets ONLY the allowlist-pinned Carma origin (never a
 * visitor/attacker URL), and reads ONLY the JSON list of {id,name} pairs which
 * are sanitised before display. No SSRF surface; no remote markup is injected.
 *
 * @param string $origin    Resolved Carma origin (already allowlist-validated).
 * @param string $token     Account API token.
 * @param bool   $use_cache Read the cached result when available.
 * @return array{ok:bool,sites:array<int,array{value:string,name:string}>,code:int}
 */
function carma_blog_fetch_account_sites( $origin, $token, $use_cache = true ) {
	$out = array(
		'ok'    => false,
		'sites' => array(),
		'code'  => 0,
	);

	if ( '' === $token ) {
		return $out;
	}

	$key = carma_blog_sites_transient_key( $origin, $token );
	if ( $use_cache ) {
		$cached = get_transient( $key );
		if ( is_array( $cached ) && isset( $cached['ok'] ) ) {
			return $cached;
		}
	}

	$res = wp_remote_get(
		esc_url_raw( $origin . '/api/account/sites' ),
		array(
			'timeout'     => 8,
			'redirection' => 2,
			'sslverify'   => true,
			'headers'     => array(
				'Accept'    => 'application/json',
				'x-api-key' => $token,
			),
		)
	);

	if ( ! is_wp_error( $res ) ) {
		$out['code'] = (int) wp_remote_retrieve_response_code( $res );
		if ( 200 === $out['code'] ) {
			$body = json_decode( wp_remote_retrieve_body( $res ), true );
			if ( is_array( $body ) && isset( $body['sites'] ) && is_array( $body['sites'] ) ) {
				foreach ( $body['sites'] as $s ) {
					if ( ! is_array( $s ) ) {
						continue;
					}
					// The dropdown value is the same identifier the [carma_blog]
					// shortcode accepts: prefer the subdomain label, fall back to
					// the UUID. Reuse the strict site-ID cleaner for both.
					$raw = '';
					if ( ! empty( $s['label'] ) ) {
						$raw = (string) $s['label'];
					} elseif ( ! empty( $s['subdomain'] ) ) {
						$raw = (string) $s['subdomain'];
					} elseif ( ! empty( $s['id'] ) ) {
						$raw = (string) $s['id'];
					}
					$val = carma_blog_clean_site_id( $raw );
					if ( '' === $val ) {
						continue;
					}
					$name = isset( $s['name'] ) ? sanitize_text_field( (string) $s['name'] ) : '';
					if ( '' === $name ) {
						$name = $val;
					}
					$out['sites'][] = array(
						'value' => $val,
						'name'  => $name,
					);
				}
				$out['ok'] = true;
			}
		}
	}

	// Cache a good list for 5 min; cache failures only briefly so a network blip
	// or bad-token typo self-heals on the next render after it is fixed.
	$ttl = $out['ok'] ? 5 * MINUTE_IN_SECONDS : 30;
	set_transient( $key, $out, $ttl );
	return $out;
}

/**
 * Render the connectivity status badge on the settings screen. Uses WordPress's
 * native admin notice colours (success/error/warning/info) so it reads as a
 * first-class part of the backend, with actionable, localised copy.
 */
function carma_blog_render_conn_status() {
	$site_id = carma_blog_clean_site_id( (string) get_option( 'carma_blog_site_id', '' ) );
	$origin  = carma_blog_origin();
	$conn    = carma_blog_check_connection( $origin, $site_id );

	switch ( $conn['status'] ) {
		case 'connected':
			$class = 'notice-success';
			$label = __( 'Connected ✓', 'carma-blog' );
			$detail = sprintf(
				/* translators: %s: the Carma origin URL. */
				__( 'Your blog is live at %s and ready to embed.', 'carma-blog' ),
				'<code>' . esc_html( $origin ) . '</code>'
			);
			break;
		case 'invalid':
			$class = 'notice-error';
			$label = __( 'Invalid Site ID', 'carma-blog' );
			$detail = __( 'No Carma site matches this ID. Copy the exact subdomain label or site UUID from your Carma dashboard.', 'carma-blog' );
			break;
		case 'unreachable':
			$class = 'notice-warning';
			$label = __( 'Could not reach Carma', 'carma-blog' );
			$detail = sprintf(
				/* translators: %s: the Carma origin URL. */
				__( "Couldn't connect to %s. Check the origin setting and that your server can make outbound requests, then re-check.", 'carma-blog' ),
				'<code>' . esc_html( $origin ) . '</code>'
			);
			break;
		case 'empty':
		default:
			$class = 'notice-info';
			$label = __( 'Not connected yet', 'carma-blog' );
			$detail = __( 'Enter your Site ID below and save to connect your blog.', 'carma-blog' );
			break;
	}

	// Re-check link (only meaningful once an ID is set): nonce-protected GET that
	// busts the cache so the admin can re-test after fixing things on Carma's side.
	$recheck = '';
	if ( '' !== $site_id ) {
		$recheck_url = wp_nonce_url(
			add_query_arg(
				array(
					'page'          => 'carma-blog',
					'carma_recheck' => '1',
				),
				admin_url( 'options-general.php' )
			),
			'carma_blog_recheck'
		);
		$recheck = ' <a href="' . esc_url( $recheck_url ) . '">' . esc_html__( 'Re-check', 'carma-blog' ) . '</a>';
	}

	printf(
		'<div class="notice %1$s inline" style="margin:12px 0;padding:10px 12px"><p style="margin:0"><strong>%2$s</strong> %3$s%4$s</p></div>',
		esc_attr( $class ),
		esc_html( $label ),
		wp_kses( $detail, array( 'code' => array() ) ),
		$recheck // already escaped above (esc_url + esc_html).
	);
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

/**
 * An account API token is an opaque key — we never interpret it, only send it as
 * the x-api-key HTTP header. So we don't constrain its alphabet (it may be a
 * UUID, base64, a JWT, etc.); we only enforce a sane length and reject any
 * whitespace or control characters, which both rules out junk input AND defuses
 * CR/LF header injection. Returns the cleaned value, or '' if it does not match.
 *
 * @param string $value Raw value.
 * @return string
 */
function carma_blog_clean_api_token( $value ) {
	$v = trim( (string) $value );
	if ( '' === $v ) {
		return '';
	}
	if ( strlen( $v ) < 8 || strlen( $v ) > 500 ) {
		return '';
	}
	// Any whitespace (incl. CR/LF) or control/DEL char → reject.
	if ( preg_match( '/[\s\x00-\x1f\x7f]/', $v ) ) {
		return '';
	}
	return $v;
}

function carma_blog_sanitize_api_token( $value ) {
	$clean = carma_blog_clean_api_token( $value );
	if ( '' === $clean && '' !== trim( (string) $value ) ) {
		add_settings_error(
			'carma_blog_api_token',
			'carma_blog_api_token_invalid',
			__( 'Carma: that API token looks malformed; it must be a single token with no spaces.', 'carma-blog' )
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
