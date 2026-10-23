<?php
/**
 * لایه داده روی وردپرس.
 * - پرونده: نوع نوشته خصوصی gii_claim؛ کل پرونده به‌صورت JSON در متای _gii_claim و چند متای قابل جستجو کنار آن.
 * - کاربران: کاربران وردپرس با نقش‌های gii_subscriber، gii_gas، gii_insurer و gii_admin (مدیر وردپرس هم «مدیر سامانه» است).
 * - اعلان و گزارش پیامک: نوع‌های نوشته gii_notice و gii_sms.
 * - فایل‌ها: پوشه خصوصی uploads/gii-private-<کلید تصادفی> که مستقیم قابل دانلود نیست و فقط از REST با بررسی دسترسی خوانده می‌شود.
 */
defined( 'ABSPATH' ) || exit;

class GII_Store {

	const CLAIM = 'gii_claim';
	const NOTICE = 'gii_notice';
	const SMS = 'gii_sms';
	const ROLE_MAP = array(
		'gii_subscriber' => 'subscriber',
		'gii_gas'        => 'gas',
		'gii_insurer'    => 'insurer',
		'gii_admin'      => 'admin',
		'administrator'  => 'admin',
	);

	public static function register_types() {
		foreach ( array( self::CLAIM => 'پرونده خسارت', self::NOTICE => 'اعلان', self::SMS => 'پیامک' ) as $type => $label ) {
			register_post_type( $type, array(
				'label'        => $label,
				'public'       => false,
				'show_ui'      => false,
				'show_in_rest' => false,
				'rewrite'      => false,
				'query_var'    => false,
				'supports'     => array( 'title' ),
			) );
		}
	}

	public static function add_roles() {
		add_role( 'gii_subscriber', 'مشترک (بیمه حوادث گاز)', array( 'read' => true ) );
		add_role( 'gii_gas', 'کارشناس شرکت گاز', array( 'read' => true ) );
		add_role( 'gii_insurer', 'کارشناس بیمه‌گر', array( 'read' => true ) );
		add_role( 'gii_admin', 'مدیر سامانه بیمه حوادث گاز', array( 'read' => true ) );
	}

	// ---------- کاربران ----------
	public static function role_of( $user ) {
		$user = $user instanceof WP_User ? $user : get_userdata( (int) $user );
		if ( ! $user ) {
			return null;
		}
		foreach ( self::ROLE_MAP as $wp => $app ) {
			if ( in_array( $wp, (array) $user->roles, true ) ) {
				return $app;
			}
		}
		return null;
	}
	public static function actor( $user = null ) {
		$user = $user ? $user : wp_get_current_user();
		return array( 'id' => (string) $user->ID, 'name' => $user->display_name, 'role' => self::role_of( $user ) );
	}
	public static function is_active( $user_id ) {
		return '0' !== get_user_meta( $user_id, 'gii_active', true );
	}
	public static function user_to_client( WP_User $u ) {
		$m = function ( $k ) use ( $u ) { return (string) get_user_meta( $u->ID, $k, true ); };
		return array(
			'id'                 => (string) $u->ID,
			'role'               => self::role_of( $u ),
			'username'           => $u->user_login,
			'name'               => $u->display_name,
			'nationalId'         => $m( 'gii_national_id' ),
			'subscriptionNo'     => $m( 'gii_subscription_no' ),
			'mobile'             => $m( 'gii_mobile' ),
			'address'            => $m( 'gii_address' ),
			'org'                => $m( 'gii_org' ),
			'active'             => self::is_active( $u->ID ),
			'mustChangePassword' => '1' === $m( 'gii_must_change' ),
			'lastLoginAt'        => $m( 'gii_last_login' ),
			'createdAt'          => GII_WF::iso( strtotime( $u->user_registered . ' UTC' ) ),
		);
	}
	public static function app_users( $args = array() ) {
		return get_users( array_merge( array( 'role__in' => array_keys( self::ROLE_MAP ), 'number' => 2000 ), $args ) );
	}
	/** @return WP_User|null */
	public static function find_subscriber( $national_id, $subscription_no ) {
		foreach ( array( array( 'gii_national_id', $national_id ), array( 'gii_subscription_no', $subscription_no ) ) as $q ) {
			$found = get_users( array( 'role' => 'gii_subscriber', 'meta_key' => $q[0], 'meta_value' => $q[1], 'number' => 1 ) );
			if ( $found ) {
				return $found[0];
			}
		}
		return null;
	}
	public static function temp_password() {
		return (string) random_int( 100000, 999999 );
	}
	/** کاربر تازه با رمز موقت؛ برمی‌گرداند array( WP_User, password ) */
	public static function create_user( $login, $name, $role, $meta = array(), $password = null ) {
		$password = $password ? $password : self::temp_password();
		$id       = wp_insert_user( array(
			'user_login'   => $login,
			'user_pass'    => $password,
			'display_name' => $name,
			'first_name'   => $name,
			'user_email'   => '',
			'role'         => $role,
		) );
		if ( is_wp_error( $id ) ) {
			throw new GII_WF_Error( 'ساخت کاربر ممکن نشد: ' . $id->get_error_message() );
		}
		foreach ( $meta as $k => $v ) {
			update_user_meta( $id, $k, $v );
		}
		return array( get_userdata( $id ), $password );
	}

	// ---------- تنظیمات ----------
	const SECRET_KEYS = array( 'sms_provider', 'sms_key', 'sms_sender', 'sms_user', 'sms_pass', 'demo' );
	public static function settings() {
		$s = array_merge( GII_WF::DEFAULT_SETTINGS, array( 'sms_provider' => 'log', 'demo' => false ), (array) get_option( 'gii_settings', array() ) );
		foreach ( GII_WF::DEFAULT_SETTINGS as $k => $v ) {
			if ( is_int( $v ) ) {
				$s[ $k ] = (int) $s[ $k ];
			}
		}
		return $s;
	}
	public static function public_settings() {
		return array_diff_key( self::settings(), array_flip( self::SECRET_KEYS ) );
	}
	public static function update_settings( $patch ) {
		update_option( 'gii_settings', array_merge( (array) get_option( 'gii_settings', array() ), $patch ), false );
	}
	public static function demo_on() { return ! empty( self::settings()['demo'] ); }

	// ---------- پرونده ----------
	public static function next_seq() {
		$n = (int) get_option( 'gii_seq', 0 ) + 1;
		update_option( 'gii_seq', $n, false );
		return $n;
	}
	public static function get_claim( $id ) {
		$p = get_post( (int) $id );
		if ( ! $p || self::CLAIM !== $p->post_type ) {
			return null;
		}
		$c = json_decode( (string) get_post_meta( $p->ID, '_gii_claim', true ), true );
		if ( ! is_array( $c ) ) {
			return null;
		}
		$c['id'] = (string) $p->ID;
		return $c;
	}
	public static function save_claim( $c ) {
		$id = isset( $c['id'] ) ? (int) $c['id'] : 0;
		if ( ! $id ) {
			$id = wp_insert_post( array( 'post_type' => self::CLAIM, 'post_status' => 'publish', 'post_title' => $c['code'] ), true );
			if ( is_wp_error( $id ) ) {
				throw new GII_WF_Error( 'ذخیره پرونده ممکن نشد.' );
			}
			$c['id'] = (string) $id;
		}
		update_post_meta( $id, '_gii_claim', wp_slash( wp_json_encode( $c, JSON_UNESCAPED_UNICODE ) ) );
		update_post_meta( $id, '_gii_status', $c['status'] );
		update_post_meta( $id, '_gii_subscriber', (string) $c['subscriberId'] );
		update_post_meta( $id, '_gii_forwarded', empty( $c['forwardedAt'] ) ? '0' : '1' );
		return $c;
	}
	/** پرونده‌هایی که این کاربر می‌بیند */
	public static function claims_for( $user_id ) {
		$role = self::role_of( $user_id );
		$args = array( 'post_type' => self::CLAIM, 'post_status' => 'any', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC', 'fields' => 'ids' );
		if ( 'subscriber' === $role ) {
			$args['meta_query'] = array( array( 'key' => '_gii_subscriber', 'value' => (string) $user_id ) );
		} elseif ( 'insurer' === $role ) {
			$args['meta_query'] = array( array( 'key' => '_gii_forwarded', 'value' => '1' ) );
		} elseif ( ! $role ) {
			return array();
		}
		return array_values( array_filter( array_map( array( __CLASS__, 'get_claim' ), get_posts( $args ) ) ) );
	}
	public static function can_view( $c, $user_id ) {
		$role = self::role_of( $user_id );
		if ( 'subscriber' === $role ) {
			return (string) $c['subscriberId'] === (string) $user_id;
		}
		if ( 'insurer' === $role ) {
			return ! empty( $c['forwardedAt'] );
		}
		return in_array( $role, array( 'gas', 'admin' ), true );
	}
	/** شکل ارسالی به مرورگر: یادداشت داخلی برای مشترک حذف و نقشه‌های خالی به‌صورت شیء */
	public static function claim_to_client( $c, $role ) {
		if ( 'subscriber' === $role ) {
			$c['messages'] = array_values( array_filter( (array) $c['messages'], function ( $m ) { return empty( $m['internal'] ); } ) );
		}
		foreach ( array( 'docs', 'files' ) as $k ) {
			if ( empty( $c[ $k ] ) ) {
				$c[ $k ] = new stdClass();
			}
		}
		foreach ( (array) $c['files'] as $id => $f ) {
			unset( $c['files'][ $id ]['path'] );
		}
		return $c;
	}

	// ---------- اعلان، پیامک و خوانده‌شده‌ها ----------
	public static function notify( $to_user, $to_role, $text, $claim_id = null ) {
		$id = wp_insert_post( array( 'post_type' => self::NOTICE, 'post_status' => 'publish', 'post_title' => wp_slash( mb_substr( $text, 0, 180 ) ), 'post_content' => wp_slash( $text ) ) );
		if ( $id && ! is_wp_error( $id ) ) {
			update_post_meta( $id, '_to_user', $to_user ? (string) $to_user : '' );
			update_post_meta( $id, '_to_role', $to_role ? $to_role : '' );
			update_post_meta( $id, '_claim', $claim_id ? (string) $claim_id : '' );
		}
	}
	public static function notices_for( $user_id ) {
		$posts = get_posts( array(
			'post_type'   => self::NOTICE,
			'numberposts' => 60,
			'orderby'     => 'ID',
			'order'       => 'DESC',
			'meta_query'  => array(
				'relation' => 'OR',
				array( 'key' => '_to_user', 'value' => (string) $user_id ),
				array( 'key' => '_to_role', 'value' => (string) self::role_of( $user_id ) ),
			),
		) );
		return array_map( function ( $p ) {
			$read = get_post_meta( $p->ID, '_read_by', true );
			return array(
				'id'      => (string) $p->ID,
				'text'    => $p->post_content,
				'claimId' => get_post_meta( $p->ID, '_claim', true ) ? get_post_meta( $p->ID, '_claim', true ) : null,
				'at'      => GII_WF::iso( strtotime( $p->post_date_gmt . ' UTC' ) ),
				'readBy'  => array_map( 'strval', is_array( $read ) ? $read : array() ),
				'toUser'  => get_post_meta( $p->ID, '_to_user', true ),
				'toRole'  => get_post_meta( $p->ID, '_to_role', true ),
			);
		}, $posts );
	}
	public static function mark_notices_read( $ids, $user_id ) {
		$mine = wp_list_pluck( self::notices_for( $user_id ), 'id' );
		foreach ( array_intersect( array_map( 'strval', (array) $ids ), $mine ) as $id ) {
			$read   = (array) get_post_meta( (int) $id, '_read_by', true );
			$read[] = (string) $user_id;
			update_post_meta( (int) $id, '_read_by', array_values( array_unique( array_filter( $read ) ) ) );
		}
	}
	public static function sms_log( $limit = 200 ) {
		return array_map( function ( $p ) {
			return array(
				'id'     => (string) $p->ID,
				'mobile' => $p->post_title,
				'text'   => $p->post_content,
				'at'     => GII_WF::iso( strtotime( $p->post_date_gmt . ' UTC' ) ),
				'status' => get_post_meta( $p->ID, '_status', true ),
			);
		}, get_posts( array( 'post_type' => self::SMS, 'numberposts' => $limit, 'orderby' => 'ID', 'order' => 'DESC' ) ) );
	}
	public static function reads( $user_id ) {
		$r = get_user_meta( $user_id, 'gii_reads', true );
		return is_array( $r ) ? $r : array();
	}
	public static function mark_read( $user_id, $claim_id ) {
		$r                        = self::reads( $user_id );
		$r[ (string) $claim_id ] = GII_WF::iso();
		update_user_meta( $user_id, 'gii_reads', $r );
	}

	// ---------- فایل‌های خصوصی ----------
	public static function files_dir() {
		// نام پوشه برای هر نصب تصادفی است تا روی سرورهایی که .htaccess را نمی‌خوانند (nginx) هم نشانی فایل قابل حدس نباشد
		$key = get_option( 'gii_files_key' );
		if ( ! $key ) {
			$key = strtolower( wp_generate_password( 20, false, false ) );
			add_option( 'gii_files_key', $key, '', false );
		}
		$up  = wp_upload_dir( null, false );
		$dir = trailingslashit( $up['basedir'] ) . 'gii-private-' . $key;
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		// آپاچی: دسترسی مستقیم بسته؛ روی nginx باید location معادل در پیکربندی افزوده شود (readme.txt)
		if ( ! file_exists( "$dir/.htaccess" ) ) {
			file_put_contents( "$dir/.htaccess", "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n" );
		}
		if ( ! file_exists( "$dir/index.php" ) ) {
			file_put_contents( "$dir/index.php", "<?php // Silence.\n" );
		}
		return $dir;
	}
	public static function file_path( $claim_id, $file_id ) {
		return self::files_dir() . '/' . (int) $claim_id . '/' . preg_replace( '/[^a-z0-9-]/', '', $file_id );
	}
	/** فایل را در پوشه خصوصی می‌گذارد و فراداده‌اش را به پرونده اضافه می‌کند */
	public static function add_file( &$c, $target, $source_path, $name, $mime, $by, $move = true ) {
		$id   = 'f-' . strtolower( wp_generate_password( 12, false ) );
		$path = self::file_path( $c['id'], $id );
		wp_mkdir_p( dirname( $path ) );
		$ok = $move ? @move_uploaded_file( $source_path, $path ) || @rename( $source_path, $path ) : @copy( $source_path, $path );
		if ( ! $ok ) {
			throw new GII_WF_Error( 'ذخیره فایل روی سرور ممکن نشد.' );
		}
		$c['files'] = (array) ( $c['files'] ?? array() );
		$c['files'][ $id ] = array( 'name' => sanitize_file_name( $name ), 'type' => $mime, 'size' => filesize( $path ), 'at' => GII_WF::iso(), 'by' => $by );
		if ( 'photos' === $target ) {
			$c['photos'][] = $id;
		} else {
			$c['docs']              = (array) ( $c['docs'] ?? array() );
			$c['docs'][ $target ][] = $id;
		}
		return $id;
	}
	public static function remove_file( &$c, $file_id ) {
		$c['photos'] = array_values( array_diff( (array) $c['photos'], array( $file_id ) ) );
		foreach ( (array) $c['docs'] as $k => $list ) {
			$c['docs'][ $k ] = array_values( array_diff( (array) $list, array( $file_id ) ) );
		}
		unset( $c['files'][ $file_id ] );
		@unlink( self::file_path( $c['id'], $file_id ) );
	}
	public static function delete_claim_files( $claim_id ) {
		$dir = self::files_dir() . '/' . (int) $claim_id;
		foreach ( (array) glob( "$dir/*" ) as $f ) {
			@unlink( $f );
		}
		@rmdir( $dir );
	}
}
