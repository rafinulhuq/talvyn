<?php
/**
 * Append to your CHILD THEME's functions.php (not the parent theme — parent
 * theme edits are overwritten on update). Do not add the opening <?php tag
 * again if the file already has one.
 *
 * Copy landing.min.css and landing.js into the same folder as functions.php.
 *
 * Change 'landing' below to your landing page's actual slug. To load on the
 * site's front page instead, swap is_page('landing') for is_front_page().
 */
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_page( 'landing' ) ) {
		return;
	}

	$dir = get_stylesheet_directory_uri();
	$ver = '1.0.0'; // bump this whenever you replace either file, or browsers keep the old copy

	wp_enqueue_style( 'talvyn-landing', $dir . '/landing.min.css', array(), $ver );
	wp_enqueue_script( 'talvyn-landing', $dir . '/landing.js', array(), $ver, true );
} );
