<?php
/**
 * قالب تمام‌صفحه سامانه؛ قالب پوسته وردپرس را کنار می‌گذارد تا ظاهر سایت و اپ دست‌نخورده بماند.
 * data-mode: site (سایت رومیزی) یا app (اپ موبایل قابل نصب).
 */
defined( 'ABSPATH' ) || exit;
$gii_mode  = 'app' === ( $GLOBALS['gii_mode'] ?? 'site' ) ? 'app' : 'site';
$gii_other = GII_Plugin::page_url( 'site' === $gii_mode ? 'app' : 'site' );
$gii_cfg   = array(
	'rest'  => esc_url_raw( rest_url( GII_REST::NS . '/' ) ),
	'nonce' => wp_create_nonce( 'wp_rest' ),
	'sw'    => add_query_arg( 'gii-sw', '1', home_url( '/' ) ),
);
$gii_ver   = GII_VERSION . '-' . filemtime( GII_DIR . 'assets/app.js' );
nocache_headers();
?><!doctype html>
<html lang="fa" dir="rtl" data-mode="<?php echo esc_attr( $gii_mode ); ?>" data-other-url="<?php echo esc_url( $gii_other ); ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?php echo esc_html( 'site' === $gii_mode ? 'سامانه بیمه حوادث مشترکین گاز' : 'بیمه حوادث مشترکین گاز' ); ?></title>
<meta name="theme-color" content="<?php echo 'site' === $gii_mode ? '#0b2340' : '#3a8cc3'; ?>">
<meta name="robots" content="noindex">
<?php if ( 'app' === $gii_mode ) : ?>
<link rel="manifest" href="<?php echo esc_url( add_query_arg( 'gii-manifest', '1', home_url( '/' ) ) ); ?>">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="حوادث گاز">
<?php endif; ?>
<link rel="icon" href="<?php echo esc_url( GII_URL . 'assets/icons/icon-192.png' ); ?>" type="image/png">
<link rel="apple-touch-icon" href="<?php echo esc_url( GII_URL . 'assets/icons/apple-touch-icon.png' ); ?>">
<link rel="stylesheet" href="<?php echo esc_url( GII_URL . 'assets/fonts/fonts.css?ver=' . $gii_ver ); ?>">
<link rel="stylesheet" href="<?php echo esc_url( GII_URL . 'assets/app.css?ver=' . $gii_ver ); ?>">
<script>window.GII_WP = <?php echo wp_json_encode( $gii_cfg, JSON_UNESCAPED_SLASHES ); ?>;</script>
</head>
<body>
<div id="app" aria-live="polite"></div>
<noscript>برای استفاده از سامانه، جاوااسکریپت مرورگر را فعال کنید.</noscript>
<script src="<?php echo esc_url( GII_URL . 'assets/app.js?ver=' . $gii_ver ); ?>"></script>
</body>
</html>
