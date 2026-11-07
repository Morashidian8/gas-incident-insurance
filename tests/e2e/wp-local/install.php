<?php
// نصب بی‌صدای وردپرس آزمایشی محلی
define( 'WP_INSTALLING', true );
$_SERVER['HTTP_HOST'] = 'localhost:8888';
require __DIR__ . '/wp/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
if ( ! is_blog_installed() ) {
	$r = wp_install( 'سامانه بیمه حوادث گاز (آزمایشی)', 'admin', 'admin@example.com', true, '', 'admin123' );
	echo "installed user " . $r['user_id'] . "\n";
} else { echo "already installed\n"; }
update_option( 'permalink_structure', '/%postname%/' );
