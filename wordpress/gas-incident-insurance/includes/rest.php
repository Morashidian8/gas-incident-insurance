<?php
/**
 * REST API افزونه زیر gii/v1 که js/backend-wp.js از آن استفاده می‌کند.
 * هر مسیر دسترسی، مالکیت پرونده، وضعیت پرونده و ورودی‌ها را روی سرور بررسی می‌کند.
 */
defined( 'ABSPATH' ) || exit;

class GII_REST {

	const NS = 'gii/v1';

	public static function routes() {
		$r = function ( $path, $methods, $cb, $perm = 'member' ) {
			register_rest_route( self::NS, $path, array(
				'methods'             => $methods,
				'callback'            => array( __CLASS__, $cb ),
				'permission_callback' => 'public' === $perm ? '__return_true' : array( __CLASS__, 'is_member' ),
			) );
		};
		$r( '/bootstrap', 'GET', 'bootstrap', 'public' );
		$r( '/auth/login', 'POST', 'login', 'public' );
		$r( '/auth/logout', 'POST', 'logout', 'public' );
		$r( '/auth/password', 'POST', 'password' );
		$r( '/auth/forgot', 'POST', 'forgot', 'public' );
		$r( '/auth/verify', 'POST', 'verify', 'public' );
		$r( '/auth/reset', 'POST', 'reset', 'public' );
		$r( '/claims', 'POST', 'register' );
		$r( '/claims/(?P<id>\d+)', 'PUT', 'update_claim' );
		$r( '/claims/(?P<id>\d+)/action', 'POST', 'action' );
		$r( '/claims/(?P<id>\d+)/finance', 'POST', 'finance' );
		$r( '/claims/(?P<id>\d+)/defects', 'POST', 'add_defect' );
		$r( '/claims/(?P<id>\d+)/defects/(?P<did>[\w-]+)', 'POST', 'defect' );
		$r( '/claims/(?P<id>\d+)/messages', 'POST', 'message' );
		$r( '/claims/(?P<id>\d+)/read', 'POST', 'read' );
		$r( '/claims/(?P<id>\d+)/files', 'POST', 'upload' );
		$r( '/claims/(?P<id>\d+)/files/(?P<fid>[\w-]+)', 'GET', 'file' );
		$r( '/claims/(?P<id>\d+)/files/(?P<fid>[\w-]+)', 'DELETE', 'delete_file' );
		$r( '/notifications/read', 'POST', 'notifications_read' );
		$r( '/settings', 'POST', 'settings' );
		$r( '/users', 'POST', 'add_staff' );
		$r( '/users/(?P<uid>\d+)/reset', 'POST', 'reset_user' );
		$r( '/users/(?P<uid>\d+)/toggle', 'POST', 'toggle_user' );
		$r( '/demo/reset', 'POST', 'demo_reset' );
	}

	// ---------- ابزار ----------
	public static function is_member() {
		$uid = get_current_user_id();
		if ( ! $uid || ! GII_Store::role_of( $uid ) ) {
			return new WP_Error( 'gii_auth', 'برای ادامه دوباره وارد شوید.', array( 'status' => 401 ) );
		}
		if ( ! GII_Store::is_active( $uid ) ) {
			return new WP_Error( 'gii_auth', 'این حساب غیرفعال شده است.', array( 'status' => 403 ) );
		}
		return true;
	}
	private static function err( $msg, $status = 400, $data = array() ) {
		return new WP_Error( 'gii', $msg, array_merge( array( 'status' => $status ), $data ) );
	}
	private static function role() { return GII_Store::role_of( get_current_user_id() ); }
	private static function claim( $req ) {
		$c = GII_Store::get_claim( (int) $req['id'] );
		if ( ! $c || ! GII_Store::can_view( $c, get_current_user_id() ) ) {
			return self::err( 'پرونده پیدا نشد.', 404 );
		}
		return $c;
	}
	private static function txt( $v, $max = 300 ) { return mb_substr( sanitize_text_field( (string) $v ), 0, $max ); }
	private static function area( $v, $max = 3000 ) { return mb_substr( sanitize_textarea_field( (string) $v ), 0, $max ); }
	private static function digits( $v, $max = 30 ) { return mb_substr( preg_replace( '/[^\d\/:.\-]/', '', GII_WF::normalize_digits( (string) $v ) ), 0, $max ); }
	private static function int( $v ) { return max( 0, (int) preg_replace( '/\D/', '', GII_WF::normalize_digits( (string) $v ) ) ); }
	private static function pick( $v, $allowed ) { return in_array( $v, $allowed, true ) ? $v : ''; }
	private static function rate_limit( $key, $max, $window ) {
		$k = 'gii_rl_' . md5( $key );
		$n = (int) get_transient( $k );
		if ( $n >= $max ) {
			return false;
		}
		set_transient( $k, $n + 1, $window );
		return true;
	}
	private static function ip() { return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : ''; }
	private static function ok( $extra = array() ) { return rest_ensure_response( array_merge( array( 'ok' => true ), $extra ) ); }
	private static function save( $c ) {
		try {
			return GII_Store::save_claim( $c );
		} catch ( GII_WF_Error $e ) {
			return self::err( $e->getMessage(), 500 );
		}
	}
	private static function user_name( $id ) {
		$u = get_userdata( (int) $id );
		return $u ? $u->display_name : '';
	}

	// ---------- راه‌اندازی ----------
	public static function bootstrap() {
		$uid  = get_current_user_id();
		$role = $uid ? GII_Store::role_of( $uid ) : null;
		$db   = array(
			'version' => 1, 'demo' => GII_Store::demo_on(), 'settings' => GII_Store::public_settings(),
			'demoAccounts' => GII_Store::demo_on() ? GII_Seed::ACCOUNTS : array(),
			'users' => array(), 'claims' => array(), 'notifications' => array(), 'sms' => array(), 'reads' => new stdClass(), 'seq' => 0,
		);
		if ( ! $role || ! GII_Store::is_active( $uid ) ) {
			return rest_ensure_response( array( 'me' => null, 'nonce' => wp_create_nonce( 'wp_rest' ), 'db' => $db ) );
		}
		$claims = GII_Store::claims_for( $uid );
		if ( 'admin' === $role ) {
			$users = GII_Store::app_users();
		} else {
			$ids = array_unique( array_merge( array( $uid ), array_map( 'intval', wp_list_pluck( $claims, 'subscriberId' ) ) ) );
			$users = array_filter( array_map( 'get_userdata', $ids ) );
		}
		$db['users']         = array_values( array_map( array( 'GII_Store', 'user_to_client' ), $users ) );
		$db['claims']        = array_map( function ( $c ) use ( $role ) { return GII_Store::claim_to_client( $c, $role ); }, $claims );
		$db['notifications'] = GII_Store::notices_for( $uid );
		$db['sms']           = 'admin' === $role ? GII_Store::sms_log() : array();
		$db['reads']         = array( (string) $uid => (object) GII_Store::reads( $uid ) );
		return rest_ensure_response( array( 'me' => (string) $uid, 'nonce' => wp_create_nonce( 'wp_rest' ), 'db' => $db ) );
	}

	// ---------- ورود، خروج و رمز ----------
	public static function login( $req ) {
		$login = sanitize_user( GII_WF::normalize_digits( (string) $req['username'] ) );
		$key   = 'login|' . self::ip() . '|' . strtolower( $login );
		if ( (int) get_transient( 'gii_rl_' . md5( $key ) ) >= 5 ) {
			return self::err( 'تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید.', 429 );
		}
		$user = wp_signon( array( 'user_login' => $login, 'user_password' => (string) $req['password'], 'remember' => true ), is_ssl() );
		if ( is_wp_error( $user ) || ! GII_Store::role_of( $user ) ) {
			if ( ! is_wp_error( $user ) ) {
				wp_logout();
			}
			self::rate_limit( $key, 5, 15 * MINUTE_IN_SECONDS );
			return self::err( 'نام کاربری یا رمز عبور نادرست است.', 401 );
		}
		if ( ! GII_Store::is_active( $user->ID ) ) {
			wp_logout();
			return self::err( 'این حساب غیرفعال شده است. با شرکت گاز تماس بگیرید.', 403 );
		}
		delete_transient( 'gii_rl_' . md5( $key ) );
		wp_set_current_user( $user->ID );
		update_user_meta( $user->ID, 'gii_last_login', GII_WF::iso() );
		return self::ok( array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) );
	}
	public static function logout() {
		wp_logout();
		wp_set_current_user( 0 );
		return self::ok( array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) );
	}
	public static function password( $req ) {
		$u    = wp_get_current_user();
		$next = (string) $req['next'];
		if ( mb_strlen( $next ) < 6 ) {
			return self::err( 'رمز باید دست‌کم ۶ نویسه باشد.' );
		}
		if ( '1' === get_user_meta( $u->ID, 'gii_must_change', true ) ) {
			if ( wp_check_password( $next, $u->user_pass, $u->ID ) ) {
				return self::err( 'رمز جدید نباید با رمز موقت یکی باشد.' );
			}
		} elseif ( ! wp_check_password( (string) $req['current'], $u->user_pass, $u->ID ) ) {
			return self::err( 'رمز فعلی نادرست است.' );
		}
		wp_set_password( $next, $u->ID );
		delete_user_meta( $u->ID, 'gii_must_change' );
		// wp_set_password همه نشست‌ها را می‌بندد؛ نشست همین کاربر دوباره ساخته می‌شود
		wp_set_current_user( $u->ID );
		wp_set_auth_cookie( $u->ID, true, is_ssl() );
		return self::ok( array( 'nonce' => wp_create_nonce( 'wp_rest' ) ) );
	}

	// بازیابی رمز: پاسخ مرحله اول برای حساب موجود و ناموجود یکسان است؛ کد فقط به‌صورت HMAC نگه داشته می‌شود
	const OTP_TTL   = 120;
	const OTP_TRIES = 5;
	public static function forgot( $req ) {
		$login  = sanitize_user( GII_WF::normalize_digits( (string) $req['username'] ) );
		$mobile = trim( GII_WF::normalize_digits( (string) $req['mobile'] ) );
		if ( ! GII_WF::is_valid_mobile( $mobile ) ) {
			return self::err( 'شماره موبایل را ۱۱ رقمی و با ۰۹ وارد کنید.' );
		}
		if ( ! self::rate_limit( 'forgot|' . self::ip(), 5, 10 * MINUTE_IN_SECONDS ) || ! self::rate_limit( 'forgot|' . $mobile, 3, 10 * MINUTE_IN_SECONDS ) ) {
			return self::err( 'درخواست‌ها زیاد بود. چند دقیقه دیگر دوباره امتحان کنید.', 429 );
		}
		$u     = get_user_by( 'login', $login );
		$match = $u && GII_Store::role_of( $u ) && GII_Store::is_active( $u->ID ) && get_user_meta( $u->ID, 'gii_mobile', true ) === $mobile;
		$code  = (string) random_int( 100000, 999999 );
		$rid   = wp_generate_password( 24, false );
		set_transient( 'gii_otp_' . $rid, array(
			'uid'   => $match ? $u->ID : 0,
			'hash'  => hash_hmac( 'sha256', $code, wp_salt( 'auth' ) . $rid ),
			'exp'   => time() + self::OTP_TTL,
			'tries' => 0,
		), 15 * MINUTE_IN_SECONDS );
		$demo = '';
		if ( $match ) {
			$text = "کد بازیابی رمز سامانه بیمه حوادث گاز: $code — این کد را به هیچ‌کس ندهید.";
			GII_SMS::send( $mobile, $text );
			// فقط در حالت نمایشی و وقتی پیامک واقعی فرستاده نمی‌شود، متن پیامک روی صفحه نشان داده می‌شود
			if ( GII_Store::demo_on() && 'log' === ( GII_Store::settings()['sms_provider'] ?? 'log' ) ) {
				$demo = $text;
			}
		}
		return self::ok( array( 'rid' => $rid, 'ttl' => self::OTP_TTL * 1000, 'demoSms' => $demo ) );
	}
	private static function otp( $rid ) {
		$rid = preg_replace( '/[^A-Za-z0-9]/', '', (string) $rid );
		return array( $rid, get_transient( 'gii_otp_' . $rid ) );
	}
	public static function verify( $req ) {
		list( $rid, $o ) = self::otp( $req['rid'] );
		if ( ! $o ) {
			return self::err( 'دوباره از اول شروع کنید.', 400, array( 'restart' => true ) );
		}
		if ( time() > $o['exp'] ) {
			return self::err( 'کد منقضی شده است؛ «ارسال دوباره» را بزنید.' );
		}
		$o['tries']++;
		if ( $o['tries'] > self::OTP_TRIES ) {
			delete_transient( 'gii_otp_' . $rid );
			return self::err( 'تعداد تلاش‌ها زیاد بود. دوباره از اول شروع کنید.', 400, array( 'restart' => true ) );
		}
		$code = trim( GII_WF::normalize_digits( (string) $req['code'] ) );
		if ( ! $o['uid'] || ! hash_equals( $o['hash'], hash_hmac( 'sha256', $code, wp_salt( 'auth' ) . $rid ) ) ) {
			set_transient( 'gii_otp_' . $rid, $o, 15 * MINUTE_IN_SECONDS );
			$left = self::OTP_TRIES - $o['tries'];
			return self::err( "کد نادرست است. $left بار دیگر می‌توانید امتحان کنید." );
		}
		$o['token'] = wp_generate_password( 32, false );
		set_transient( 'gii_otp_' . $rid, $o, 10 * MINUTE_IN_SECONDS );
		return self::ok( array( 'token' => $o['token'] ) );
	}
	public static function reset( $req ) {
		list( $rid, $o ) = self::otp( $req['rid'] );
		if ( ! $o || empty( $o['token'] ) || ! hash_equals( $o['token'], (string) $req['token'] ) ) {
			return self::err( 'دوباره از اول شروع کنید.', 400, array( 'restart' => true ) );
		}
		$pw = (string) $req['password'];
		if ( mb_strlen( $pw ) < 6 ) {
			return self::err( 'رمز باید دست‌کم ۶ نویسه باشد.' );
		}
		$u = get_userdata( $o['uid'] );
		wp_set_password( $pw, $u->ID );
		delete_user_meta( $u->ID, 'gii_must_change' );
		delete_transient( 'gii_otp_' . $rid );
		GII_SMS::send( get_user_meta( $u->ID, 'gii_mobile', true ), 'رمز عبور حساب شما در سامانه بیمه حوادث گاز تغییر کرد. اگر شما این کار را نکرده‌اید، با شرکت گاز تماس بگیرید.' );
		GII_Store::notify( $u->ID, null, 'رمز عبور حساب شما با کد پیامکی بازیابی شد.' );
		return self::ok( array( 'username' => $u->user_login ) );
	}

	// ---------- ثبت مشترک و پرونده (شرکت گاز) ----------
	public static function register( $req ) {
		if ( ! in_array( self::role(), array( 'gas', 'admin' ), true ) ) {
			return self::err( 'فقط کارشناس شرکت گاز پرونده تشکیل می‌دهد.', 403 );
		}
		$f = array(
			'name'           => self::txt( $req['name'], 100 ),
			'nationalId'     => trim( GII_WF::normalize_digits( (string) $req['nationalId'] ) ),
			'subscriptionNo' => trim( GII_WF::normalize_digits( (string) $req['subscriptionNo'] ) ),
			'mobile'         => trim( GII_WF::normalize_digits( (string) $req['mobile'] ) ),
			'date'           => self::digits( $req['date'] ),
			'type'           => isset( GII_WF::INCIDENT_TYPES[ (string) $req['type'] ] ) ? (string) $req['type'] : 'fire',
			'address'        => self::area( $req['address'], 500 ),
			'note'           => self::area( $req['note'], 500 ),
		);
		$errs = array();
		if ( mb_strlen( $f['name'] ) < 3 ) $errs[] = 'نام';
		if ( ! GII_WF::is_valid_national_id( $f['nationalId'] ) ) $errs[] = 'کد ملی معتبر';
		if ( ! preg_match( '/^\d{6,13}$/', $f['subscriptionNo'] ) ) $errs[] = 'شماره اشتراک (فقط رقم)';
		if ( ! GII_WF::is_valid_mobile( $f['mobile'] ) ) $errs[] = 'موبایل ۱۱ رقمی';
		$ts = GII_WF::parse_jalali( $f['date'] );
		if ( ! $ts ) $errs[] = 'تاریخ حادثه شمسی معتبر';
		elseif ( $ts > time() + DAY_IN_SECONDS ) $errs[] = 'تاریخ حادثه در آینده است';
		if ( mb_strlen( $f['address'] ) < 10 ) $errs[] = 'نشانی کامل';
		if ( $errs ) {
			return self::err( 'بررسی کنید: ' . implode( '، ', $errs ) );
		}
		$u        = GII_Store::find_subscriber( $f['nationalId'], $f['subscriptionNo'] );
		$existing = (bool) $u;
		$pw       = null;
		if ( $u && get_user_meta( $u->ID, 'gii_national_id', true ) !== $f['nationalId'] ) {
			return self::err( 'این شماره اشتراک با کد ملی دیگری ثبت شده است.' );
		}
		try {
			if ( ! $u ) {
				if ( username_exists( $f['subscriptionNo'] ) ) {
					return self::err( 'نام کاربری تکراری است.' );
				}
				list( $u, $pw ) = GII_Store::create_user( $f['subscriptionNo'], $f['name'], 'gii_subscriber', array(
					'gii_national_id' => $f['nationalId'], 'gii_subscription_no' => $f['subscriptionNo'], 'gii_mobile' => $f['mobile'],
					'gii_address' => $f['address'], 'gii_must_change' => '1',
				) );
			}
			$s     = GII_Store::settings();
			$now   = GII_WF::iso();
			$staff = GII_Store::actor();
			$late  = GII_WF::days_between( $ts, time() ) > $s['reportWindowDays'];
			$c     = GII_Store::save_claim( array(
				'code' => GII_WF::claim_code( GII_Store::next_seq() ), 'subscriberId' => (string) $u->ID, 'createdBy' => $staff['id'], 'createdAt' => $now,
				'status' => 'draft', 'statusAt' => $now, 'submitCount' => 0,
				'incident' => array( 'date' => GII_WF::jalali_string( $ts ), 'time' => '', 'type' => $f['type'], 'placeType' => 'residential', 'address' => $f['address'], 'postalCode' => '', 'description' => '', 'causeIssuer' => '', 'causeReportNo' => '', 'causeReportDate' => '', 'causeStatesGas' => false, 'policeReportNo' => '' ),
				'damage' => array( 'kinds' => array(), 'items' => array(), 'injured' => array(), 'deceased' => array() ),
				'photos' => array(), 'docs' => array(), 'files' => array(), 'bank' => array( 'sheba' => '', 'holder' => $u->display_name ), 'declaration' => false,
				'deficiencies' => array(), 'messages' => array(), 'assessment' => null, 'payment' => null,
				'timeline' => array( array( 'at' => $now, 'by' => $staff['name'], 'role' => 'gas', 'action' => 'create',
					'label' => $existing ? 'تشکیل پرونده جدید برای مشترک موجود' : 'تشکیل پرونده و ایجاد حساب مشترک',
					'note' => implode( ' — ', array_filter( array( $f['note'], $late ? 'اعلام با تأخیر: بیش از ' . $s['reportWindowDays'] . ' روز پس از حادثه' : '' ) ) ) ) ),
			) );
		} catch ( GII_WF_Error $e ) {
			return self::err( $e->getMessage() );
		}
		$mobile = get_user_meta( $u->ID, 'gii_mobile', true );
		GII_SMS::send( $mobile, $pw ? "مشترک گرامی، پرونده خسارت {$c['code']} تشکیل شد. نام کاربری: {$u->user_login} — رمز موقت: $pw" : "مشترک گرامی، پرونده خسارت {$c['code']} برای شما تشکیل شد. با حساب قبلی وارد شوید." );
		GII_Store::notify( $u->ID, null, "پرونده {$c['code']} تشکیل شد. لطفاً اطلاعات و مدارک را تکمیل کنید.", $c['id'] );
		return self::ok( array( 'claimId' => $c['id'], 'username' => $u->user_login, 'password' => $pw, 'existing' => $existing ) );
	}

	// ---------- ویرایش فیلدهای پرونده ----------
	private static function clean_list( $list, $fn, $max = 100 ) {
		return array_values( array_map( $fn, array_slice( array_filter( (array) $list, 'is_array' ), 0, $max ) ) );
	}
	public static function update_claim( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$role = self::role();
		$in   = (array) $req->get_json_params();
		$st   = $c['status'];
		$did  = false;
		if ( 'subscriber' === $role && in_array( $st, array( 'draft', 'returned' ), true ) ) {
			if ( isset( $in['incident'] ) ) {
				$i             = (array) $in['incident'];
				$c['incident'] = array(
					'date' => self::digits( $i['date'] ?? '' ), 'time' => self::digits( $i['time'] ?? '', 5 ),
					'type' => isset( GII_WF::INCIDENT_TYPES[ $i['type'] ?? '' ] ) ? $i['type'] : '',
					'placeType' => self::pick( $i['placeType'] ?? '', GII_WF::PLACE_TYPES ),
					'address' => self::area( $i['address'] ?? '', 500 ), 'postalCode' => self::digits( $i['postalCode'] ?? '', 10 ),
					'description' => self::area( $i['description'] ?? '' ),
					'causeIssuer' => self::pick( $i['causeIssuer'] ?? '', array_keys( GII_WF::CAUSE_ISSUERS ) ),
					'causeReportNo' => self::txt( GII_WF::normalize_digits( $i['causeReportNo'] ?? '' ), 40 ),
					'causeReportDate' => self::digits( $i['causeReportDate'] ?? '' ),
					'causeStatesGas' => ! empty( $i['causeStatesGas'] ),
					'policeReportNo' => self::txt( GII_WF::normalize_digits( $i['policeReportNo'] ?? '' ), 40 ),
				);
			}
			if ( isset( $in['damage'] ) ) {
				$d           = (array) $in['damage'];
				$c['damage'] = array(
					'kinds'    => array_values( array_intersect( GII_WF::DAMAGE_KINDS, (array) ( $d['kinds'] ?? array() ) ) ),
					'items'    => self::clean_list( $d['items'] ?? array(), function ( $x ) { return array( 'title' => self::txt( $x['title'] ?? '', 200 ), 'qty' => self::digits( $x['qty'] ?? '', 6 ), 'amount' => (string) ( self::int( $x['amount'] ?? '' ) ?: '' ) ); } ),
					'injured'  => self::clean_list( $d['injured'] ?? array(), function ( $x ) { return array( 'name' => self::txt( $x['name'] ?? '', 100 ), 'nationalId' => self::digits( $x['nationalId'] ?? '', 10 ), 'relation' => self::txt( $x['relation'] ?? '', 50 ), 'hospital' => self::txt( $x['hospital'] ?? '', 100 ), 'amount' => (string) ( self::int( $x['amount'] ?? '' ) ?: '' ) ); } ),
					'deceased' => self::clean_list( $d['deceased'] ?? array(), function ( $x ) { return array( 'name' => self::txt( $x['name'] ?? '', 100 ), 'nationalId' => self::digits( $x['nationalId'] ?? '', 10 ), 'relation' => self::txt( $x['relation'] ?? '', 50 ) ); } ),
				);
			}
			if ( isset( $in['bank'] ) ) {
				$b         = (array) $in['bank'];
				$c['bank'] = array( 'sheba' => strtoupper( preg_replace( '/[^A-Za-z0-9]/', '', GII_WF::normalize_digits( $b['sheba'] ?? '' ) ) ), 'holder' => self::txt( $b['holder'] ?? '', 100 ), 'bankName' => self::txt( $b['bankName'] ?? '', 60 ) );
			}
			if ( isset( $in['declaration'] ) ) {
				$c['declaration'] = (bool) $in['declaration'];
			}
			$did = true;
		}
		if ( 'insurer' === $role && in_array( $st, array( 'insurer_review', 'objection' ), true ) && isset( $in['assessment'] ) ) {
			$a               = (array) $in['assessment'];
			$c['assessment'] = array(
				'adjuster' => self::txt( $a['adjuster'] ?? '', 100 ), 'visitDate' => self::digits( $a['visitDate'] ?? '' ), 'note' => self::area( $a['note'] ?? '', 1500 ),
				'items' => self::clean_list( $a['items'] ?? array(), function ( $x ) {
					return array( 'category' => self::pick( $x['category'] ?? '', GII_WF::DAMAGE_KINDS ) ?: 'property', 'title' => self::txt( $x['title'] ?? '', 200 ), 'claimed' => self::int( $x['claimed'] ?? 0 ), 'approved' => self::int( $x['approved'] ?? 0 ) );
				}, 200 ),
			) + ( isset( $c['assessment']['at'] ) ? array( 'at' => $c['assessment']['at'] ) : array() );
			$did = true;
		}
		if ( 'insurer' === $role && 'bank' === GII_WF::fin_stage( $c ) && isset( $in['payment'] ) ) {
			$p              = (array) $in['payment'];
			$c['payment']   = (array) $c['payment'];
			$c['payment']['ref']  = self::txt( GII_WF::normalize_digits( $p['ref'] ?? '' ), 40 );
			$c['payment']['date'] = self::digits( $p['date'] ?? '' );
			$did            = true;
		}
		if ( ! $did ) {
			return self::err( 'در وضعیت فعلی پرونده امکان ویرایش این بخش را ندارید.', 403 );
		}
		$c = self::save( $c );
		if ( is_wp_error( $c ) ) return $c;
		return rest_ensure_response( array( 'claim' => GII_Store::claim_to_client( $c, $role ) ) );
	}

	// ---------- تغییر وضعیت ----------
	public static function action( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$id   = (string) $req['action'];
		$note = self::area( $req['note'], 1500 );
		if ( 'ins_pay' === $id && ! empty( $c['assessment'] ) ) {
			$c['payment']           = (array) $c['payment'];
			$c['payment']['amount'] = $c['payment']['amount'] ?? GII_WF::payable_of( $c, GII_Store::settings() );
		}
		try {
			// ارسال به بیمه‌گر فقط با تأیید صریح کارشناس گاز که علت «گاز» در گزارش آتش‌نشانی یا کارشناس قید شده است
			$c = GII_WF::apply_action( $c, $id, GII_Store::actor(), $note, null, array( 'causeConfirmed' => ! empty( $req['causeConfirmed'] ) ) );
		} catch ( GII_WF_Error $e ) {
			return self::err( $e->getMessage() );
		}
		$c = self::save( $c );
		if ( is_wp_error( $c ) ) return $c;
		self::after_action( $c, $id, $note );
		return self::ok();
	}
	private static function after_action( $c, $id, $note ) {
		$sub    = (int) $c['subscriberId'];
		$mobile = get_user_meta( $sub, 'gii_mobile', true );
		$code   = $c['code'];
		$cid    = $c['id'];
		$t      = function ( $text ) use ( $sub, $cid ) { GII_Store::notify( $sub, null, $text, $cid ); };
		$sms    = function ( $text ) use ( $mobile ) { GII_SMS::send( $mobile, $text ); };
		$role   = function ( $r, $text ) use ( $cid ) { GII_Store::notify( null, $r, $text, $cid ); };
		switch ( $id ) {
			case 'submit': $role( 'gas', "پرونده $code " . ( $c['submitCount'] > 1 ? 'پس از رفع نقص دوباره ' : '' ) . 'ارسال شد.' ); break;
			case 'gas_return': $t( "برای پرونده $code نقص اعلام شد." ); $sms( "مشترک گرامی، پرونده $code نیاز به اصلاح دارد. لطفاً وارد سامانه شوید." ); break;
			case 'gas_forward': $role( 'insurer', "پرونده $code از شرکت گاز دریافت شد." ); $t( "پرونده $code برای بیمه‌گر ارسال شد." ); $sms( "پرونده $code تأیید و برای بیمه‌گر ارسال شد." ); break;
			case 'gas_answer': $role( 'insurer', "شرکت گاز به استعلام پرونده $code پاسخ داد." ); break;
			case 'ins_start': $t( "بیمه‌گر بررسی پرونده $code را آغاز کرد." ); break;
			case 'ins_query': $role( 'gas', "بیمه‌گر برای پرونده $code مدارک تکمیلی خواست." ); break;
			case 'ins_assess': $t( "مبلغ خسارت پرونده $code تعیین شد." ); $sms( "مبلغ خسارت پرونده $code تعیین شد. برای تأیید یا اعتراض وارد سامانه شوید." ); break;
			case 'accept': $role( 'insurer', "مشترک مبلغ پرونده $code را پذیرفت." ); break;
			case 'object': $role( 'insurer', "مشترک به مبلغ پرونده $code اعتراض کرد." ); break;
			case 'ins_pay': $t( "خسارت پرونده $code واریز شد." ); $sms( "خسارت پرونده $code به مبلغ " . number_format( (float) $c['payment']['amount'] ) . " ریال واریز شد. پیگیری: {$c['payment']['ref']}" ); break;
			case 'gas_reject':
			case 'ins_reject': $t( "پرونده $code رد شد." ); $sms( "پرونده $code مشمول پوشش تشخیص داده نشد. دلیل: $note" ); $role( 'gas_reject' === $id ? 'insurer' : 'gas', "پرونده $code رد شد." ); break;
		}
	}

	public static function finance( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$step = (string) $req['step'];
		$d    = (array) $req['data'];
		$s    = GII_Store::settings();
		$data = 'fin_review' === $step ? array( 'reviewer' => self::txt( $d['reviewer'] ?? '', 100 ), 'shebaMatch' => ! empty( $d['shebaMatch'] ), 'note' => self::area( $d['note'] ?? '', 500 ) )
			// مبلغ حواله همیشه از ارزیابی ثبت‌شده محاسبه می‌شود، نه از ورودی مرورگر
			: ( 'fin_voucher' === $step ? array( 'voucherNo' => self::txt( $d['voucherNo'] ?? '', 40 ), 'date' => self::digits( $d['date'] ?? '' ), 'amount' => ! empty( $c['assessment'] ) ? GII_WF::payable_of( $c, $s ) : 0 )
			: array( 'method' => self::pick( $d['method'] ?? '', array_keys( GII_WF::TRANSFER_METHODS ) ), 'ref' => self::txt( $d['ref'] ?? '', 40 ), 'date' => self::digits( $d['date'] ?? '' ) ) );
		try {
			$c = GII_WF::apply_finance( $c, $step, $data, GII_Store::actor() );
		} catch ( GII_WF_Error $e ) {
			return self::err( $e->getMessage() );
		}
		$c = self::save( $c );
		if ( is_wp_error( $c ) ) return $c;
		$msg = 'fin_review' === $step ? "بررسی مالی پرونده {$c['code']} انجام و شبای شما تأیید شد."
			: ( 'fin_voucher' === $step ? "حواله پرداخت خسارت پرونده {$c['code']} به شماره {$data['voucherNo']} و مبلغ " . number_format( $data['amount'] ) . ' ریال صادر شد.'
			: "دستور پرداخت خسارت پرونده {$c['code']} از طریق " . GII_WF::TRANSFER_METHODS[ $data['method'] ] . " به بانک ارسال شد. پیگیری: {$data['ref']}" );
		GII_Store::notify( (int) $c['subscriberId'], null, $msg, $c['id'] );
		if ( 'fin_review' !== $step ) {
			GII_SMS::send( get_user_meta( (int) $c['subscriberId'], 'gii_mobile', true ), $msg );
		}
		return self::ok();
	}

	// ---------- نقص‌ها ----------
	private static function can_flag( $c, $role ) {
		return ( 'gas' === $role && 'gas_review' === $c['status'] ) || ( 'insurer' === $role && in_array( $c['status'], array( 'insurer_review', 'objection' ), true ) );
	}
	public static function add_defect( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$role = self::role();
		if ( ! self::can_flag( $c, $role ) ) {
			return self::err( 'در وضعیت فعلی پرونده امکان ثبت نقص ندارید.', 403 );
		}
		$target = (string) $req['target'];
		if ( ! preg_match( '/^(doc:[a-z_]+|section:[a-z]+|general)$/', $target ) ) {
			$target = 'general';
		}
		$note = self::area( $req['note'], 1000 );
		if ( '' === $note ) {
			return self::err( 'شرح نقص را بنویسید.' );
		}
		$title = self::txt( $req['title'], 200 );
		$me    = GII_Store::actor();
		$c['deficiencies'][] = array(
			'id' => 'd-' . strtolower( wp_generate_password( 10, false ) ), 'target' => $target,
			'title' => '' !== $title ? $title : ( 'insurer' === $role ? 'درخواست بیمه‌گر' : 'نقص عمومی' ),
			'note' => $note, 'by' => $role, 'byName' => $me['name'], 'at' => GII_WF::iso(), 'status' => 'open', 'reply' => '',
		);
		$c = self::save( $c );
		return is_wp_error( $c ) ? $c : self::ok();
	}
	public static function defect( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$role = self::role();
		$op   = (string) $req['op'];
		$idx  = null;
		foreach ( $c['deficiencies'] as $i => $d ) {
			if ( $d['id'] === $req['did'] ) $idx = $i;
		}
		if ( null === $idx ) return self::err( 'این مورد پیدا نشد.', 404 );
		$d   = &$c['deficiencies'][ $idx ];
		$now = GII_WF::iso();
		$open = 'open' === $d['status'];
		if ( 'reply' === $op ) {
			$sub_ok = 'subscriber' === $role && 'returned' === $c['status'] && $open;
			$gas_ok = 'gas' === $role && 'insurer_query' === $c['status'] && 'insurer' === $d['by'] && $open;
			if ( ! $sub_ok && ! $gas_ok ) return self::err( 'امکان پاسخ به این مورد را ندارید.', 403 );
			$reply = self::area( $req['reply'], 1000 );
			if ( '' === $reply ) return self::err( 'متن پاسخ را بنویسید.' );
			$d['reply'] = $reply; $d['replyAt'] = $now; $d['replyBy'] = GII_Store::actor()['name'];
		} elseif ( 'accept' === $op || 'reject' === $op ) {
			if ( ! ( 'gas' === $role && 'gas_review' === $c['status'] && $open && ! empty( $d['reply'] ) ) ) return self::err( 'امکان بررسی این پاسخ را ندارید.', 403 );
			if ( 'accept' === $op ) { $d['status'] = 'closed'; $d['closedAt'] = $now; }
			else { $d['note'] .= ' | پاسخ قبلی کافی نبود: ' . $d['reply']; $d['reply'] = ''; $d['at'] = $now; }
		} elseif ( 'delete' === $op ) {
			if ( ! ( $d['by'] === $role && empty( $d['reply'] ) && $open && self::can_flag( $c, $role ) ) ) return self::err( 'امکان حذف این مورد را ندارید.', 403 );
			unset( $d );
			array_splice( $c['deficiencies'], $idx, 1 );
		} else {
			return self::err( 'عمل نامعتبر' );
		}
		unset( $d );
		$c = self::save( $c );
		return is_wp_error( $c ) ? $c : self::ok();
	}

	// ---------- پیام و خوانده‌شده ----------
	public static function message( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$me   = GII_Store::actor();
		$text = self::area( $req['text'], 2000 );
		if ( '' === $text ) return self::err( 'متن پیام را بنویسید.' );
		$internal = 'subscriber' !== $me['role'] && ! empty( $req['internal'] );
		$c['messages'][] = array( 'id' => 'm-' . strtolower( wp_generate_password( 10, false ) ), 'at' => GII_WF::iso(), 'by' => $me['name'], 'byId' => $me['id'], 'role' => $me['role'], 'text' => $text, 'internal' => $internal );
		$c = self::save( $c );
		if ( is_wp_error( $c ) ) return $c;
		if ( 'subscriber' === $me['role'] ) {
			GII_Store::notify( null, 'gas', "پیام جدید از مشترک در پرونده {$c['code']}", $c['id'] );
			if ( ! empty( $c['forwardedAt'] ) ) GII_Store::notify( null, 'insurer', "پیام جدید از مشترک در پرونده {$c['code']}", $c['id'] );
		} elseif ( ! $internal ) {
			GII_Store::notify( (int) $c['subscriberId'], null, 'پیام جدید از ' . GII_WF::ROLES[ $me['role'] ] . " در پرونده {$c['code']}", $c['id'] );
		} else {
			GII_Store::notify( null, 'gas' === $me['role'] ? 'insurer' : 'gas', "یادداشت داخلی جدید در پرونده {$c['code']}", $c['id'] );
		}
		GII_Store::mark_read( get_current_user_id(), $c['id'] );
		return self::ok();
	}
	public static function read( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		GII_Store::mark_read( get_current_user_id(), $c['id'] );
		return self::ok();
	}
	public static function notifications_read( $req ) {
		GII_Store::mark_notices_read( (array) $req['ids'], get_current_user_id() );
		return self::ok();
	}

	// ---------- فایل ----------
	const MIMES = array( 'jpg|jpeg|jpe' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf' );
	private static function can_upload( $c, $role, $target ) {
		if ( 'subscriber' === $role && in_array( $c['status'], array( 'draft', 'returned' ), true ) ) {
			if ( 'photos' === $target ) return true;
			$d = GII_WF::doc_type( $target );
			return $d && 'subscriber' === $d['uploader'] && GII_WF::doc_visible( $c, $target );
		}
		return false;
	}
	private static function target_of( $c, $fid ) {
		if ( in_array( $fid, (array) $c['photos'], true ) ) return 'photos';
		foreach ( (array) $c['docs'] as $k => $list ) {
			if ( in_array( $fid, (array) $list, true ) ) return $k;
		}
		return null;
	}
	public static function upload( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$role   = self::role();
		$target = (string) $req['target'];
		if ( ! self::can_upload( $c, $role, $target ) ) return self::err( 'در وضعیت فعلی امکان بارگذاری این مدرک را ندارید.', 403 );
		$f = $req->get_file_params()['file'] ?? null;
		if ( ! $f || UPLOAD_ERR_OK !== $f['error'] ) return self::err( 'فایل دریافت نشد.' );
		if ( $f['size'] > 15 * MB_IN_BYTES ) return self::err( 'حجم فایل بیش از ۱۵ مگابایت است.' );
		if ( count( (array) $c['files'] ) >= 300 ) return self::err( 'تعداد فایل‌های این پرونده به حداکثر رسیده است.' );
		$check = wp_check_filetype_and_ext( $f['tmp_name'], $f['name'], self::MIMES );
		if ( empty( $check['type'] ) ) return self::err( 'فقط عکس (JPG، PNG، WEBP) یا PDF پذیرفته می‌شود.' );
		if ( 0 === strpos( $check['type'], 'image/' ) && ! @getimagesize( $f['tmp_name'] ) ) return self::err( 'فایل تصویر معتبر نیست.' );
		try {
			GII_Store::add_file( $c, $target, $f['tmp_name'], $f['name'], $check['type'], $role );
		} catch ( GII_WF_Error $e ) {
			return self::err( $e->getMessage(), 500 );
		}
		$c = self::save( $c );
		return is_wp_error( $c ) ? $c : self::ok();
	}
	public static function file( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$fid  = (string) $req['fid'];
		$meta = $c['files'][ $fid ] ?? null;
		$path = GII_Store::file_path( $c['id'], $fid );
		if ( ! $meta || ! is_file( $path ) ) return self::err( 'فایل پیدا نشد.', 404 );
		nocache_headers();
		header( 'Content-Type: ' . $meta['type'] );
		header( 'Content-Length: ' . filesize( $path ) );
		header( 'X-Content-Type-Options: nosniff' );
		header( "Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox" );
		header( 'Content-Disposition: inline; filename="' . rawurlencode( $meta['name'] ) . '"' );
		readfile( $path );
		exit;
	}
	public static function delete_file( $req ) {
		$c = self::claim( $req );
		if ( is_wp_error( $c ) ) return $c;
		$role   = self::role();
		$fid    = (string) $req['fid'];
		$target = self::target_of( $c, $fid );
		if ( ! $target || ! self::can_upload( $c, $role, $target ) || ( $c['files'][ $fid ]['by'] ?? '' ) !== $role ) {
			return self::err( 'امکان حذف این فایل را ندارید.', 403 );
		}
		GII_Store::remove_file( $c, $fid );
		$c = self::save( $c );
		return is_wp_error( $c ) ? $c : self::ok();
	}

	// ---------- مدیریت ----------
	public static function settings( $req ) {
		if ( 'admin' !== self::role() ) return self::err( 'فقط مدیر سامانه.', 403 );
		$in    = (array) $req->get_json_params();
		$patch = array();
		foreach ( GII_WF::DEFAULT_SETTINGS as $k => $v ) {
			if ( ! array_key_exists( $k, $in ) || is_array( $v ) ) continue;
			$patch[ $k ] = is_int( $v ) ? self::int( $in[ $k ] ) : self::txt( GII_WF::normalize_digits( $in[ $k ] ), 100 );
		}
		if ( array_key_exists( 'orgName', $in ) ) $patch['orgName'] = self::txt( $in['orgName'], 120 );
		if ( array_key_exists( 'fireOffers', $in ) ) {
			$offers = array();
			foreach ( array_slice( array_values( (array) $in['fireOffers'] ), 0, 3 ) as $o ) {
				$o   = (array) $o;
				$url = trim( (string) ( $o['url'] ?? '' ) );
				if ( '' !== $url && ! preg_match( '#^https://[^\s"\'<>]+$#i', $url ) ) return self::err( 'نشانی خرید بیمه باید با https:// شروع شود.' );
				$offers[] = array(
					'insurer' => self::txt( $o['insurer'] ?? '', 80 ), 'plan' => self::txt( $o['plan'] ?? '', 80 ),
					'price' => self::txt( $o['price'] ?? '', 80 ), 'cover' => self::txt( $o['cover'] ?? '', 240 ), 'url' => esc_url_raw( $url, array( 'https' ) ),
				);
			}
			$patch['fireOffers'] = $offers;
		}
		if ( array_key_exists( 'logoDataUrl', $in ) ) {
			$logo = (string) $in['logoDataUrl'];
			if ( '' !== $logo && ( strlen( $logo ) > 700000 || ! preg_match( '#^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$#', $logo ) ) ) {
				return self::err( 'فایل لوگو معتبر نیست.' );
			}
			$patch['logoDataUrl'] = $logo;
		}
		GII_Store::update_settings( $patch );
		return self::ok();
	}
	public static function add_staff( $req ) {
		if ( 'admin' !== self::role() ) return self::err( 'فقط مدیر سامانه.', 403 );
		$login = sanitize_user( (string) $req['username'], true );
		$roles = array( 'gas' => 'gii_gas', 'insurer' => 'gii_insurer', 'admin' => 'gii_admin' );
		if ( '' === $login || mb_strlen( $login ) < 3 ) return self::err( 'نام کاربری دست‌کم ۳ حرف لاتین یا رقم باشد.' );
		if ( username_exists( $login ) ) return self::err( 'این نام کاربری وجود دارد.' );
		if ( ! isset( $roles[ (string) $req['role'] ] ) ) return self::err( 'نقش نامعتبر' );
		try {
			list( $u, $pw ) = GII_Store::create_user( $login, self::txt( $req['name'], 100 ), $roles[ (string) $req['role'] ], array( 'gii_org' => self::txt( $req['org'], 120 ), 'gii_must_change' => '1' ) );
		} catch ( GII_WF_Error $e ) {
			return self::err( $e->getMessage() );
		}
		return self::ok( array( 'username' => $u->user_login, 'password' => $pw, 'mobile' => '' ) );
	}
	public static function reset_user( $req ) {
		$role = self::role();
		$u    = get_userdata( (int) $req['uid'] );
		$tr   = $u ? GII_Store::role_of( $u ) : null;
		if ( ! $u || ! $tr ) return self::err( 'کاربر پیدا نشد.', 404 );
		if ( ! ( 'admin' === $role || ( 'gas' === $role && 'subscriber' === $tr ) ) ) return self::err( 'اجازه این کار را ندارید.', 403 );
		if ( in_array( 'administrator', (array) $u->roles, true ) ) return self::err( 'رمز مدیر وردپرس از پیشخوان وردپرس عوض می‌شود.', 403 );
		$pw = GII_Store::temp_password();
		wp_set_password( $pw, $u->ID );
		update_user_meta( $u->ID, 'gii_must_change', '1' );
		update_user_meta( $u->ID, 'gii_active', '1' );
		$mobile = get_user_meta( $u->ID, 'gii_mobile', true );
		if ( $mobile ) GII_SMS::send( $mobile, "رمز موقت جدید سامانه بیمه حوادث گاز: $pw" );
		return self::ok( array( 'username' => $u->user_login, 'password' => $pw, 'mobile' => $mobile ) );
	}
	public static function toggle_user( $req ) {
		if ( 'admin' !== self::role() ) return self::err( 'فقط مدیر سامانه.', 403 );
		$u = get_userdata( (int) $req['uid'] );
		if ( ! $u || ! GII_Store::role_of( $u ) ) return self::err( 'کاربر پیدا نشد.', 404 );
		if ( $u->ID === get_current_user_id() || in_array( 'administrator', (array) $u->roles, true ) ) return self::err( 'این حساب را نمی‌توان غیرفعال کرد.', 403 );
		update_user_meta( $u->ID, 'gii_active', GII_Store::is_active( $u->ID ) ? '0' : '1' );
		if ( ! GII_Store::is_active( $u->ID ) ) {
			WP_Session_Tokens::get_instance( $u->ID )->destroy_all();
		}
		return self::ok();
	}
	public static function demo_reset() {
		if ( 'admin' !== self::role() ) return self::err( 'فقط مدیر سامانه.', 403 );
		if ( ! GII_Store::demo_on() ) return self::err( 'حالت نمایشی خاموش است.', 403 );
		try {
			GII_Seed::reset( get_current_user_id() );
		} catch ( Exception $e ) {
			return self::err( 'ساخت داده نمونه ممکن نشد: ' . $e->getMessage(), 500 );
		}
		return self::ok();
	}
}
