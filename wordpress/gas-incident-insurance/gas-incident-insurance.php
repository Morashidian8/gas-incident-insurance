<?php
/**
 * Plugin Name:       بیمه حوادث مشترکین گاز
 * Description:       سامانه تشکیل، تکمیل و پیگیری پرونده خسارت حوادث گاز طبیعی برای مشترک، شرکت گاز و بیمه‌گر؛ با نسخه سایت و اپ موبایل قابل نصب.
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Morashidian8
 * License:           GPL-2.0-or-later
 * Text Domain:       gas-incident-insurance
 */

defined( 'ABSPATH' ) || exit;

define( 'GII_VERSION', '1.0.0' );
define( 'GII_FILE', __FILE__ );
define( 'GII_DIR', plugin_dir_path( __FILE__ ) );
define( 'GII_URL', plugin_dir_url( __FILE__ ) );

require_once GII_DIR . 'includes/workflow.php';
require_once GII_DIR . 'includes/store.php';
require_once GII_DIR . 'includes/sms.php';
require_once GII_DIR . 'includes/rest.php';
require_once GII_DIR . 'includes/seed.php';
require_once GII_DIR . 'includes/admin.php';

class GII_Plugin {

	public static function init() {
		register_activation_hook( GII_FILE, array( __CLASS__, 'activate' ) );
		add_action( 'init', array( 'GII_Store', 'register_types' ) );
		add_action( 'init', array( __CLASS__, 'pwa_routes' ), 1 );
		add_action( 'rest_api_init', array( 'GII_REST', 'routes' ) );
		add_shortcode( 'gii_site', array( __CLASS__, 'shortcode' ) );
		add_shortcode( 'gii_app', array( __CLASS__, 'shortcode' ) );
		add_filter( 'template_include', array( __CLASS__, 'template' ), 99 );
		// تا nonce ساخته‌شده در همان درخواست ورود، با کوکی تازه معتبر باشد
		add_action( 'set_logged_in_cookie', function ( $cookie ) { $_COOKIE[ LOGGED_IN_COOKIE ] = $cookie; } );
		add_filter( 'authenticate', array( __CLASS__, 'block_inactive' ), 30 );
		add_filter( 'show_admin_bar', array( __CLASS__, 'admin_bar' ) );
		add_action( 'admin_init', array( __CLASS__, 'keep_out_of_admin' ) );
		add_filter( 'login_redirect', array( __CLASS__, 'login_redirect' ), 10, 3 );
		GII_Admin::init();
	}

	public static function activate() {
		GII_Store::add_roles();
		GII_Store::register_types();
		GII_Store::files_dir();
		if ( false === get_option( 'gii_settings' ) ) {
			add_option( 'gii_settings', array( 'sms_provider' => 'log', 'demo' => false ), '', false );
		}
		foreach ( array( 'site' => array( 'gii-site', 'سامانه بیمه حوادث مشترکین گاز', '[gii_site]' ), 'app' => array( 'gii-app', 'اپ بیمه حوادث گاز', '[gii_app]' ) ) as $k => $p ) {
			$id = (int) get_option( "gii_page_$k" );
			if ( ! $id || ! get_post( $id ) ) {
				$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_name' => $p[0], 'post_title' => $p[1], 'post_content' => $p[2] ) );
				update_option( "gii_page_$k", $id );
			}
		}
		flush_rewrite_rules();
	}

	public static function page_url( $k ) {
		$id = (int) get_option( "gii_page_$k" );
		return $id ? get_permalink( $id ) : home_url( '/' );
	}

	public static function shortcode() {
		// معمولاً قالب تمام‌صفحه افزونه جای این را می‌گیرد؛ این فقط برای قالب‌هایی است که template_include را دور می‌زنند
		return '<p><a href="' . esc_url( self::page_url( 'site' ) ) . '">ورود به سامانه بیمه حوادث مشترکین گاز</a></p>';
	}

	public static function template( $template ) {
		if ( ! is_singular( 'page' ) ) {
			return $template;
		}
		$content = (string) get_post_field( 'post_content', get_queried_object_id() );
		if ( has_shortcode( $content, 'gii_site' ) ) {
			$GLOBALS['gii_mode'] = 'site';
		} elseif ( has_shortcode( $content, 'gii_app' ) ) {
			$GLOBALS['gii_mode'] = 'app';
		} else {
			return $template;
		}
		return GII_DIR . 'templates/canvas.php';
	}

	/** سرویس‌ورکر و manifest از ریشه سایت سرو می‌شوند تا اپ کل سایت را در محدوده داشته باشد */
	public static function pwa_routes() {
		if ( isset( $_GET['gii-sw'] ) ) {
			header( 'Content-Type: application/javascript; charset=utf-8' );
			header( 'Service-Worker-Allowed: /' );
			header( 'Cache-Control: no-cache' );
			$app = wp_json_encode( self::page_url( 'app' ) );
			echo "const CACHE='gii-wp-" . esc_js( GII_VERSION ) . "';const APP=$app;\n";
			echo "self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.add(APP)).then(()=>self.skipWaiting())));\n";
			echo "self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));\n";
			// داده‌ها همیشه از سرور؛ فقط پوسته اپ و فایل‌های افزونه برای حالت آفلاین نگه داشته می‌شوند
			echo "self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/wp-json/')||u.search.includes('rest_route'))return;\n";
			echo "const keep=e.request.mode==='navigate'||u.pathname.includes('/gas-incident-insurance/assets/');if(!keep)return;\n";
			echo "e.respondWith(fetch(e.request).then(r=>{const c=r.clone();if(r.ok)caches.open(CACHE).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match(APP))));});\n";
			exit;
		}
		if ( isset( $_GET['gii-manifest'] ) ) {
			header( 'Content-Type: application/manifest+json; charset=utf-8' );
			echo wp_json_encode( array(
				'id' => self::page_url( 'app' ), 'name' => 'بیمه حوادث مشترکین گاز', 'short_name' => 'حوادث گاز', 'lang' => 'fa', 'dir' => 'rtl',
				'start_url' => self::page_url( 'app' ), 'scope' => home_url( '/' ), 'display' => 'standalone', 'orientation' => 'portrait',
				'background_color' => '#3a8cc3', 'theme_color' => '#3a8cc3',
				'icons' => array(
					array( 'src' => GII_URL . 'assets/icons/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any' ),
					array( 'src' => GII_URL . 'assets/icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any' ),
					array( 'src' => GII_URL . 'assets/icons/maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable' ),
				),
			), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
			exit;
		}
	}

	public static function block_inactive( $user ) {
		if ( $user instanceof WP_User && ! GII_Store::is_active( $user->ID ) ) {
			return new WP_Error( 'gii_inactive', 'این حساب غیرفعال شده است.' );
		}
		return $user;
	}
	private static function app_only( $user ) {
		$role = GII_Store::role_of( $user );
		return $role && ! in_array( 'administrator', (array) $user->roles, true );
	}
	public static function admin_bar( $show ) {
		return is_user_logged_in() && self::app_only( wp_get_current_user() ) ? false : $show;
	}
	public static function keep_out_of_admin() {
		if ( wp_doing_ajax() || ! is_user_logged_in() ) {
			return;
		}
		if ( self::app_only( wp_get_current_user() ) ) {
			wp_safe_redirect( self::page_url( 'site' ) );
			exit;
		}
	}
	public static function login_redirect( $to, $requested, $user ) {
		return ( $user instanceof WP_User && self::app_only( $user ) ) ? self::page_url( 'site' ) : $to;
	}
}

GII_Plugin::init();
