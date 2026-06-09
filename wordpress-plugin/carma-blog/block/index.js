/**
 * Carma Blog — Gutenberg block (no-build, plain wp.element).
 *
 * This is the hero install path (plan DX1): a native block instead of typing a
 * shortcode. To keep ONE renderer, the block is STATIC and its save() emits the
 * exact same `[carma_blog ...]` shortcode that T1 already handles — WordPress
 * runs it through do_shortcode() on the front end, so the block and the manual
 * shortcode share a single code path (carma_blog_shortcode in carma-blog.php).
 *
 * The editor shows a branded placeholder (a visual stand-in for the live feed)
 * plus an inspector panel for the most common options. Everything is validated
 * again server-side by the shortcode handler, so the controls here only need to
 * produce a clean shortcode string.
 *
 * @package CarmaBlog
 */
( function ( wp ) {
	'use strict';

	var registerBlockType = wp.blocks.registerBlockType;
	var el = wp.element.createElement;
	var Fragment = wp.element.Fragment;
	var RawHTML = wp.element.RawHTML;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var PanelBody = wp.components.PanelBody;
	var TextControl = wp.components.TextControl;
	var SelectControl = wp.components.SelectControl;
	var Placeholder = wp.components.Placeholder;
	var __ = wp.i18n.__;

	// Mirrors the constrained allowlists in carma_blog_build_params() / embedParams.ts.
	// Keeping the editor choices identical to what the server accepts means a saved
	// block can never produce a value the shortcode would silently drop.
	var FEED_OPTIONS = [
		{ label: __( 'Default (theme setting)', 'carma-blog' ), value: '' },
		{ label: __( 'Standard', 'carma-blog' ), value: 'standard' },
		{ label: __( 'Editorial', 'carma-blog' ), value: 'editorial' },
		{ label: __( 'Magazine', 'carma-blog' ), value: 'magazine' },
		{ label: __( 'Minimal', 'carma-blog' ), value: 'minimal' },
		{ label: __( 'Grid XL', 'carma-blog' ), value: 'gridxl' },
		{ label: __( 'Overlay', 'carma-blog' ), value: 'overlay' },
		{ label: __( 'Compact', 'carma-blog' ), value: 'compact' },
	];

	var LAYOUT_OPTIONS = [
		{ label: __( 'Default', 'carma-blog' ), value: '' },
		{ label: __( 'Grid', 'carma-blog' ), value: 'grid' },
		{ label: __( 'List', 'carma-blog' ), value: 'list' },
	];

	var COLS_OPTIONS = [
		{ label: __( 'Default', 'carma-blog' ), value: '' },
		{ label: __( '2 columns', 'carma-blog' ), value: '2' },
		{ label: __( '3 columns', 'carma-blog' ), value: '3' },
		{ label: __( '4 columns', 'carma-blog' ), value: '4' },
	];

	/**
	 * Strip any character that could break out of a shortcode attribute. The server
	 * sanitises again, but a malformed string here would corrupt the saved markup.
	 *
	 * @param {*} value Raw attribute value.
	 * @return {string} Safe value (may be empty).
	 */
	function cleanValue( value ) {
		if ( value === undefined || value === null ) {
			return '';
		}
		return String( value ).replace( /["\[\]<>]/g, '' ).trim();
	}

	/**
	 * Build the `[carma_blog ...]` shortcode from the block attributes. Only emits
	 * attributes the user actually set, so an unconfigured block saves a bare
	 * [carma_blog] that falls back to the site-wide settings.
	 *
	 * @param {Object} attributes Block attributes.
	 * @return {string} Shortcode string.
	 */
	function buildShortcode( attributes ) {
		var pairs = [
			[ 'site_id', attributes.siteId ],
			[ 'feed', attributes.feed ],
			[ 'layout', attributes.layout ],
			[ 'cols', attributes.cols ],
		];
		var parts = [ 'carma_blog' ];
		for ( var i = 0; i < pairs.length; i++ ) {
			var key = pairs[ i ][ 0 ];
			var val = cleanValue( pairs[ i ][ 1 ] );
			if ( val !== '' ) {
				parts.push( key + '="' + val + '"' );
			}
		}
		return '[' + parts.join( ' ' ) + ']';
	}

	registerBlockType( 'carma/blog', {
		edit: function ( props ) {
			var attributes = props.attributes;
			var setAttributes = props.setAttributes;
			var blockProps = useBlockProps();

			var summary = attributes.siteId
				? /* translators: %s: the Carma site ID. */
				  wp.i18n.sprintf( __( 'Site: %s', 'carma-blog' ), attributes.siteId )
				: __( 'Using the site from Settings → Carma Blog.', 'carma-blog' );

			var inspector = el(
				InspectorControls,
				{ key: 'inspector' },
				el(
					PanelBody,
					{ title: __( 'Blog settings', 'carma-blog' ), initialOpen: true },
					el( TextControl, {
						label: __( 'Site ID (optional)', 'carma-blog' ),
						help: __( 'Leave blank to use the site set in Settings → Carma Blog. Lowercase letters, numbers and hyphens only.', 'carma-blog' ),
						value: attributes.siteId,
						autoComplete: 'off',
						spellCheck: false,
						onChange: function ( value ) {
							setAttributes( { siteId: value } );
						},
					} ),
					el( SelectControl, {
						label: __( 'Feed layout', 'carma-blog' ),
						value: attributes.feed,
						options: FEED_OPTIONS,
						onChange: function ( value ) {
							setAttributes( { feed: value } );
						},
					} ),
					el( SelectControl, {
						label: __( 'Card layout', 'carma-blog' ),
						value: attributes.layout,
						options: LAYOUT_OPTIONS,
						onChange: function ( value ) {
							setAttributes( { layout: value } );
						},
					} ),
					el( SelectControl, {
						label: __( 'Columns', 'carma-blog' ),
						value: attributes.cols,
						options: COLS_OPTIONS,
						onChange: function ( value ) {
							setAttributes( { cols: value } );
						},
					} )
				)
			);

			var placeholder = el(
				Placeholder,
				{
					icon: 'rss',
					label: __( 'Carma Blog', 'carma-blog' ),
					instructions: __( 'Your blog will appear here on the published page.', 'carma-blog' ),
					className: 'carma-blog-block-placeholder',
				},
				el( 'p', { className: 'carma-blog-block-summary' }, summary )
			);

			return el( Fragment, null, inspector, el( 'div', blockProps, placeholder ) );
		},

		// STATIC save → the literal shortcode lands in post_content and is rendered
		// by carma_blog_shortcode() via do_shortcode(). RawHTML keeps the brackets
		// and quotes verbatim (the pattern WordPress core's Shortcode block uses).
		save: function ( props ) {
			return el( RawHTML, null, buildShortcode( props.attributes ) );
		},
	} );
} )( window.wp );
