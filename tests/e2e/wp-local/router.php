<?php
// سرور داخلی PHP برای وردپرس: فایل‌های واقعی مستقیم، بقیه از index.php (پیوندهای یکتا و REST)
$root = __DIR__ . '/wp';
$path = urldecode( parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH ) );
$file = $root . $path;
if ( $path !== '/' && is_file( $file ) ) {
	if ( substr( $file, -4 ) === '.php' ) { chdir( dirname( $file ) ); $_SERVER['SCRIPT_FILENAME'] = $file; require $file; return true; }
	return false;
}
if ( is_dir( $file ) && is_file( $file . '/index.php' ) ) { chdir( $file ); require $file . '/index.php'; return true; }
chdir( $root ); $_SERVER['SCRIPT_FILENAME'] = $root . '/index.php'; require $root . '/index.php';
