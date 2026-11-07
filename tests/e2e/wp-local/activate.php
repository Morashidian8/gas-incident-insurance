<?php
$_SERVER['HTTP_HOST'] = 'localhost:8888';
require __DIR__ . '/wp/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
update_option( 'timezone_string', 'Asia/Tehran' );
$r = activate_plugin( 'gas-incident-insurance/gas-incident-insurance.php' );
echo is_wp_error( $r ) ? 'ERR ' . $r->get_error_message() . "\n" : "activated\n";
GII_Store::update_settings( array( 'demo' => true ) );
$t = microtime( true );
GII_Seed::reset( 0 );
flush_rewrite_rules();
printf( "seeded in %.1fs: %d claims, %d app users, pages site=%s app=%s\n", microtime( true ) - $t,
	count( get_posts( array( 'post_type' => 'gii_claim', 'numberposts' => -1, 'fields' => 'ids' ) ) ),
	count( GII_Store::app_users() ), GII_Plugin::page_url( 'site' ), GII_Plugin::page_url( 'app' ) );
