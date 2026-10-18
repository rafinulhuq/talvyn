<?php
/**
 * Talvyn Landing — child theme.
 *
 * landing.min.css / landing.js are loaded ONLY on the landing page. They are
 * a full page-level stylesheet exported from the Next.js app; loading them
 * site-wide would fight the parent theme on every blog post.
 */

// Parent stylesheet first, child second, so child rules win on equal specificity.
add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style(
		'talvyn-landing-style',
		get_stylesheet_uri(),
		array( 'twentytwentyfive-style' ),
		wp_get_theme()->get( 'Version' )
	);
} );

// Page-scoped landing assets. Change the slug if the page slug changes.
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_page( 'landing' ) && ! is_front_page() ) {
		return;
	}

	$dir = get_stylesheet_directory();
	$uri = get_stylesheet_directory_uri();

	// filemtime as the version string = the browser cache busts itself every
	// time you save the file. Never hand-bump a version during development.
	wp_enqueue_style(
		'talvyn-landing',
		$uri . '/landing.min.css',
		array(),
		file_exists( "$dir/landing.min.css" ) ? filemtime( "$dir/landing.min.css" ) : '1.0.0'
	);
	wp_enqueue_script(
		'talvyn-landing',
		$uri . '/landing.js',
		array(),
		file_exists( "$dir/landing.js" ) ? filemtime( "$dir/landing.js" ) : '1.0.0',
		true
	);
} );
