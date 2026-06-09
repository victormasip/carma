<?php
/**
 * Hand-maintained asset manifest for the Carma Blog editor script.
 *
 * This plugin ships a NO-BUILD Gutenberg block (plain wp.element.createElement,
 * no JSX / bundler), so there is no @wordpress/scripts step to emit this file.
 * WordPress reads it next to `index.js` to wire up script dependencies and the
 * cache-busting version, exactly as it would for a compiled block.
 *
 * Keep `version` in sync with CARMA_BLOG_VERSION in carma-blog.php.
 *
 * @package CarmaBlog
 */

return array(
	'dependencies' => array(
		'wp-blocks',
		'wp-element',
		'wp-block-editor',
		'wp-components',
		'wp-i18n',
	),
	'version'      => '0.1.0',
);
