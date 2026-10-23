<?php
/**
 * قواعد گردش کار پرونده؛ برگردان مستقیم js/workflow.js برای اجرا روی سرور.
 * هر تغییر در یکی باید در دیگری هم اعمال شود؛ تست‌های wordpress/tests همان سناریوهای tests/workflow.test.mjs را اجرا می‌کنند.
 * پرونده آرایه انجمنی با همان ساختار JSON سمت مرورگر است.
 */
defined( 'ABSPATH' ) || defined( 'GII_TESTING' ) || exit;

class GII_WF_Error extends Exception {}

class GII_WF {

	const ROLES = array(
		'subscriber' => 'مشترک',
		'gas'        => 'کارشناس شرکت گاز',
		'insurer'    => 'کارشناس بیمه‌گر',
		'admin'      => 'مدیر سامانه',
	);

	const STATUS = array(
		'draft'          => array( 'label' => 'در حال تکمیل توسط مشترک', 'owner' => 'subscriber' ),
		'returned'       => array( 'label' => 'نقص پرونده؛ منتظر اصلاح مشترک', 'owner' => 'subscriber' ),
		'submitted'      => array( 'label' => 'ارسال‌شده به شرکت گاز', 'owner' => 'gas' ),
		'gas_review'     => array( 'label' => 'در حال بررسی شرکت گاز', 'owner' => 'gas' ),
		'sent_insurer'   => array( 'label' => 'ارسال‌شده به بیمه‌گر', 'owner' => 'insurer' ),
		'insurer_review' => array( 'label' => 'در حال بررسی و ارزیابی بیمه‌گر', 'owner' => 'insurer' ),
		'insurer_query'  => array( 'label' => 'درخواست مدارک تکمیلی از سوی بیمه‌گر', 'owner' => 'gas' ),
		'assessed'       => array( 'label' => 'خسارت تعیین شد؛ منتظر تأیید مشترک', 'owner' => 'subscriber' ),
		'objection'      => array( 'label' => 'اعتراض مشترک به مبلغ خسارت', 'owner' => 'insurer' ),
		'payment'        => array( 'label' => 'تأیید شد؛ در انتظار پرداخت', 'owner' => 'insurer' ),
		'paid'           => array( 'label' => 'خسارت پرداخت شد', 'owner' => null ),
		'rejected'       => array( 'label' => 'پرونده مشمول پوشش نیست (رد شد)', 'owner' => null ),
	);

	const INCIDENT_TYPES = array(
		'fire'      => 'آتش‌سوزی',
		'explosion' => 'انفجار',
		'co'        => 'گازگرفتگی (مسمومیت با مونوکسید کربن)',
		'leak'      => 'نشت گاز منجر به خسارت',
	);
	const PLACE_TYPES  = array( 'residential', 'commercial', 'office', 'other' );
	const DAMAGE_KINDS = array( 'property', 'medical', 'death' );
	const MIN_PHOTOS   = 4;
	const CAUSE_ISSUERS = array( 'fire' => 'سازمان آتش‌نشانی', 'expert' => 'کارشناس رسمی دادگستری' );

	const DEFAULT_SETTINGS = array(
		'propertyCapRial'   => 2000000000,
		'medicalCapRial'    => 1000000000,
		'deathCapRial'      => 6000000000,
		'deductiblePercent' => 10,
		'reportWindowDays'  => 30,
		'gasSlaDays'        => 7,
		'insurerSlaDays'    => 15,
		'fixSlaDays'        => 10,
		'policyNo'          => 'نمونه ۱۴۰۵/۴۲۲',
		'policyStart'       => '1405/01/01',
		'policyEnd'         => '1405/12/29',
	);

	const TRANSFER_METHODS = array(
		'paya'  => 'پایا',
		'satna' => 'ساتنا',
	);

	// ---------- مدارک ----------
	public static function has_kind( $c, $k ) {
		return in_array( $k, (array) ( $c['damage']['kinds'] ?? array() ), true );
	}
	private static function injury_or_death( $c ) {
		return self::has_kind( $c, 'medical' ) || self::has_kind( $c, 'death' );
	}
	/** هر مدرک: شناسه، عنوان، بارگذارکننده، لازم بودن، و اختیاری بودن (برای کلانتری) */
	public static function doc_types() {
		$always = function () { return true; };
		return array(
			array( 'id' => 'national_id', 'title' => 'کارت ملی مشترک (پشت و رو)', 'uploader' => 'subscriber', 'need' => $always ),
			array( 'id' => 'ownership', 'title' => 'سند مالکیت یا اجاره‌نامه محل حادثه', 'uploader' => 'subscriber', 'need' => $always ),
			array( 'id' => 'gas_bill', 'title' => 'آخرین قبض گاز', 'uploader' => 'subscriber', 'need' => $always ),
			// سند اصلی اثبات علت حادثه؛ شرکت گاز بازدید ندارد
			array( 'id' => 'cause_report', 'title' => 'گزارش آتش‌نشانی یا کارشناس رسمی دادگستری (با قید علت گاز)', 'uploader' => 'subscriber', 'need' => $always ),
			array( 'id' => 'police', 'title' => 'گزارش نیروی انتظامی / کلانتری', 'uploader' => 'subscriber', 'need' => array( __CLASS__, 'injury_or_death_pub' ), 'optional' => function ( $c ) { return ! GII_WF::injury_or_death_pub( $c ); } ),
			array( 'id' => 'invoices', 'title' => 'فاکتور یا برآورد هزینه اقلام خسارت‌دیده', 'uploader' => 'subscriber', 'need' => function ( $c ) { return GII_WF::has_kind( $c, 'property' ); } ),
			array( 'id' => 'medical', 'title' => 'پرونده پزشکی و صورت‌حساب بیمارستان', 'uploader' => 'subscriber', 'need' => function ( $c ) { return GII_WF::has_kind( $c, 'medical' ); } ),
			array( 'id' => 'forensic', 'title' => 'گواهی پزشکی قانونی', 'uploader' => 'subscriber', 'need' => array( __CLASS__, 'injury_or_death_pub' ) ),
			array( 'id' => 'death_cert', 'title' => 'گواهی فوت', 'uploader' => 'subscriber', 'need' => function ( $c ) { return GII_WF::has_kind( $c, 'death' ); } ),
			array( 'id' => 'inheritance', 'title' => 'گواهی انحصار وراثت و مدارک وراث', 'uploader' => 'subscriber', 'need' => function ( $c ) { return GII_WF::has_kind( $c, 'death' ); } ),
			array( 'id' => 'sheba_cert', 'title' => 'گواهی شماره شبا به نام ذی‌نفع', 'uploader' => 'subscriber', 'need' => $always ),
		);
	}
	public static function injury_or_death_pub( $c ) { return self::injury_or_death( $c ); }

	public static function doc_type( $id ) {
		foreach ( self::doc_types() as $d ) {
			if ( $d['id'] === $id ) {
				return $d;
			}
		}
		return null;
	}
	public static function required_docs( $c, $uploader = null ) {
		$out = array();
		foreach ( self::doc_types() as $d ) {
			$optional = isset( $d['optional'] ) && call_user_func( $d['optional'], $c );
			if ( call_user_func( $d['need'], $c ) && ! $optional && ( ! $uploader || $d['uploader'] === $uploader ) ) {
				$out[] = $d;
			}
		}
		return $out;
	}
	/** مدرکی که در این پرونده نمایش داده می‌شود (لازم، اختیاری، یا دارای فایل) و قابل بارگذاری است */
	public static function doc_visible( $c, $id ) {
		$d = self::doc_type( $id );
		if ( ! $d ) {
			return false;
		}
		return call_user_func( $d['need'], $c ) || 'police' === $id || ! empty( $c['docs'][ $id ] );
	}

	// ---------- اعتبارسنجی‌های ایرانی ----------
	public static function normalize_digits( $s ) {
		return strtr( (string) $s, array(
			'۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
			'٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
		) );
	}
	public static function is_valid_national_id( $raw ) {
		$s = trim( self::normalize_digits( $raw ) );
		if ( ! preg_match( '/^\d{10}$/', $s ) || preg_match( '/^(\d)\1{9}$/', $s ) ) {
			return false;
		}
		$sum = 0;
		for ( $i = 0; $i < 9; $i++ ) {
			$sum += (int) $s[ $i ] * ( 10 - $i );
		}
		$sum  %= 11;
		$check = (int) $s[9];
		return $sum < 2 ? $check === $sum : $check === 11 - $sum;
	}
	public static function is_valid_mobile( $raw ) {
		return (bool) preg_match( '/^09\d{9}$/', trim( self::normalize_digits( $raw ) ) );
	}
	public static function is_valid_sheba( $raw ) {
		$s = strtoupper( preg_replace( '/[\s-]/', '', self::normalize_digits( $raw ) ) );
		if ( ! preg_match( '/^IR\d{24}$/', $s ) ) {
			return false;
		}
		$re = substr( $s, 4 ) . '1827' . substr( $s, 2, 2 );
		$r  = 0;
		foreach ( str_split( $re ) as $ch ) {
			$r = ( $r * 10 + (int) $ch ) % 97;
		}
		return 1 === $r;
	}

	// ---------- تاریخ شمسی (الگوریتم jalaali) ----------
	private static function div( $a, $b ) { return intdiv( $a, $b ); }
	private static function jal_cal( $jy ) {
		$breaks = array( -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178 );
		$gy     = $jy + 621;
		$leap_j = -14;
		$jp     = $breaks[0];
		$jump   = 0;
		for ( $i = 1; $i < count( $breaks ); $i++ ) {
			$jm   = $breaks[ $i ];
			$jump = $jm - $jp;
			if ( $jy < $jm ) {
				break;
			}
			$leap_j += self::div( $jump, 33 ) * 8 + self::div( $jump % 33, 4 );
			$jp      = $jm;
		}
		$n       = $jy - $jp;
		$leap_j += self::div( $n, 33 ) * 8 + self::div( ( $n % 33 ) + 3, 4 );
		if ( 4 === $jump % 33 && 4 === $jump - $n ) {
			$leap_j++;
		}
		$leap_g = self::div( $gy, 4 ) - self::div( ( self::div( $gy, 100 ) + 1 ) * 3, 4 ) - 150;
		$march  = 20 + $leap_j - $leap_g;
		if ( $jump - $n < 6 ) {
			$n = $n - $jump + self::div( $jump + 4, 33 ) * 33;
		}
		$leap = ( ( ( $n + 1 ) % 33 ) - 1 ) % 4;
		if ( -1 === $leap ) {
			$leap = 4;
		}
		return array( 'leap' => $leap, 'gy' => $gy, 'march' => $march );
	}
	private static function g2d( $gy, $gm, $gd ) {
		$d = self::div( ( $gy + self::div( $gm - 8, 6 ) + 100100 ) * 1461, 4 ) + self::div( 153 * ( ( $gm + 9 ) % 12 ) + 2, 5 ) + $gd - 34840408;
		return $d - self::div( self::div( $gy + 100100 + self::div( $gm - 8, 6 ), 100 ) * 3, 4 ) + 752;
	}
	private static function d2g( $jdn ) {
		$j  = 4 * $jdn + 139361631;
		$j  = $j + self::div( self::div( 4 * $jdn + 183187720, 146097 ) * 3, 4 ) * 4 - 3908;
		$i  = self::div( $j % 1461, 4 ) * 5 + 308;
		$gd = self::div( $i % 153, 5 ) + 1;
		$gm = ( self::div( $i, 153 ) % 12 ) + 1;
		$gy = self::div( $j, 1461 ) - 100100 + self::div( 8 - $gm, 6 );
		return array( $gy, $gm, $gd );
	}
	private static function j2d( $jy, $jm, $jd ) {
		$r = self::jal_cal( $jy );
		return self::g2d( $r['gy'], 3, $r['march'] ) + ( $jm - 1 ) * 31 - self::div( $jm, 7 ) * ( $jm - 7 ) + $jd - 1;
	}
	private static function d2j( $jdn ) {
		list( $gy ) = self::d2g( $jdn );
		$jy         = $gy - 621;
		$r          = self::jal_cal( $jy );
		$k          = $jdn - self::g2d( $gy, 3, $r['march'] );
		if ( $k >= 0 ) {
			if ( $k <= 185 ) {
				return array( $jy, 1 + self::div( $k, 31 ), ( $k % 31 ) + 1 );
			}
			$k -= 186;
		} else {
			$jy--;
			$k += 179;
			if ( 1 === $r['leap'] ) {
				$k++;
			}
		}
		return array( $jy, 7 + self::div( $k, 30 ), ( $k % 30 ) + 1 );
	}
	private static function tz() {
		return function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'Asia/Tehran' );
	}
	/** @param int|null $ts برچسب زمانی یونیکس؛ تاریخ به وقت محلی سایت */
	public static function to_jalali( $ts = null ) {
		$d = ( new DateTime( '@' . ( null === $ts ? time() : $ts ) ) )->setTimezone( self::tz() );
		return self::d2j( self::g2d( (int) $d->format( 'Y' ), (int) $d->format( 'n' ), (int) $d->format( 'j' ) ) );
	}
	public static function jalali_string( $ts = null ) {
		list( $y, $m, $d ) = self::to_jalali( $ts );
		return sprintf( '%d/%02d/%02d', $y, $m, $d );
	}
	/** '1405/07/28' ← برچسب زمانی ظهر همان روز، یا null */
	public static function parse_jalali( $raw ) {
		if ( ! preg_match( '/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/', trim( self::normalize_digits( $raw ) ), $m ) ) {
			return null;
		}
		$jy = (int) $m[1];
		$jm = (int) $m[2];
		$jd = (int) $m[3];
		if ( $jm < 1 || $jm > 12 || $jd < 1 || $jd > 31 || ( $jm > 6 && $jd > 30 ) ) {
			return null;
		}
		if ( 12 === $jm && 30 === $jd && 0 !== self::jal_cal( $jy )['leap'] ) {
			return null;
		}
		list( $gy, $gm, $gd ) = self::d2g( self::j2d( $jy, $jm, $jd ) );
		return ( new DateTime( sprintf( '%04d-%02d-%02d 12:00:00', $gy, $gm, $gd ), self::tz() ) )->getTimestamp();
	}
	public static function days_between( $a, $b ) { return (int) floor( ( $b - $a ) / 86400 ); }
	/** زمان به قالب toISOString مرورگر تا مقایسه رشته‌ای سمت مرورگر درست بماند */
	public static function iso( $ts = null ) { return gmdate( 'Y-m-d\TH:i:s', null === $ts ? time() : $ts ) . '.000Z'; }
	public static function claim_code( $seq, $ts = null ) {
		return sprintf( 'GZ-%d-%06d', self::to_jalali( $ts )[0], $seq );
	}

	// ---------- کامل بودن بخش‌ها ----------
	private static function len( $s ) { return mb_strlen( trim( (string) $s ) ); }
	public static function section_issues( $c ) {
		$inc = $c['incident'] ?? array();
		$out = array( 'incident' => array(), 'damage' => array(), 'photos' => array(), 'docs' => array(), 'bank' => array(), 'declare' => array() );
		if ( ! self::parse_jalali( $inc['date'] ?? '' ) ) $out['incident'][] = 'تاریخ حادثه';
		if ( empty( $inc['type'] ) ) $out['incident'][] = 'نوع حادثه';
		if ( empty( $inc['placeType'] ) ) $out['incident'][] = 'نوع کاربری محل';
		if ( self::len( $inc['address'] ?? '' ) < 10 ) $out['incident'][] = 'نشانی کامل محل حادثه';
		if ( self::len( $inc['description'] ?? '' ) < 20 ) $out['incident'][] = 'شرح حادثه (دست‌کم ۲۰ حرف)';
		if ( ! isset( self::CAUSE_ISSUERS[ $inc['causeIssuer'] ?? '' ] ) ) $out['incident'][] = 'صادرکننده گزارش علت حادثه';
		if ( empty( $inc['causeReportNo'] ) ) $out['incident'][] = 'شماره گزارش علت حادثه';
		if ( ! self::parse_jalali( $inc['causeReportDate'] ?? '' ) ) $out['incident'][] = 'تاریخ گزارش علت حادثه';
		if ( empty( $inc['causeStatesGas'] ) ) $out['incident'][] = 'تأیید قید علت گاز در گزارش';

		$dmg = $c['damage'] ?? array();
		if ( empty( $dmg['kinds'] ) ) $out['damage'][] = 'نوع خسارت';
		$some = function ( $list, $fn ) { foreach ( (array) $list as $x ) { if ( $fn( (array) $x ) ) return true; } return false; };
		if ( self::has_kind( $c, 'property' ) && ! $some( $dmg['items'] ?? array(), function ( $i ) { return ! empty( $i['title'] ) && (float) ( $i['amount'] ?? 0 ) > 0; } ) ) $out['damage'][] = 'دست‌کم یک قلم خسارت مالی با مبلغ';
		if ( self::has_kind( $c, 'medical' ) && ! $some( $dmg['injured'] ?? array(), function ( $p ) { return ! empty( $p['name'] ) && (float) ( $p['amount'] ?? 0 ) > 0; } ) ) $out['damage'][] = 'مشخصات و هزینه درمان مصدوم';
		if ( self::has_kind( $c, 'death' ) && ! $some( $dmg['deceased'] ?? array(), function ( $p ) { return ! empty( $p['name'] ) && GII_WF::is_valid_national_id( $p['nationalId'] ?? '' ); } ) ) $out['damage'][] = 'مشخصات متوفی با کد ملی معتبر';

		$n = count( (array) ( $c['photos'] ?? array() ) );
		if ( $n < self::MIN_PHOTOS ) $out['photos'][] = 'دست‌کم ' . self::MIN_PHOTOS . " عکس از محل حادثه ($n بارگذاری شده)";

		foreach ( self::required_docs( $c, 'subscriber' ) as $d ) {
			if ( empty( $c['docs'][ $d['id'] ] ) ) $out['docs'][] = $d['title'];
		}
		$b = $c['bank'] ?? array();
		if ( ! self::is_valid_sheba( $b['sheba'] ?? '' ) ) $out['bank'][] = 'شماره شبای معتبر';
		if ( empty( $b['holder'] ) ) $out['bank'][] = 'نام صاحب حساب';
		if ( empty( $c['declaration'] ) ) $out['declare'][] = 'تأیید تعهدنامه صحت اطلاعات';
		return $out;
	}
	public static function open_deficiencies( $c ) {
		return array_values( array_filter( (array) ( $c['deficiencies'] ?? array() ), function ( $d ) { return 'open' === ( $d['status'] ?? '' ); } ) );
	}
	public static function missing_for_submit( $c ) {
		$list = array_merge( ...array_values( self::section_issues( $c ) ) );
		$unanswered = array_filter( self::open_deficiencies( $c ), function ( $d ) { return empty( $d['reply'] ) && 'system' !== ( $d['by'] ?? '' ); } );
		if ( 'returned' === ( $c['status'] ?? '' ) && $unanswered ) {
			$list[] = 'پاسخ به ' . count( $unanswered ) . ' مورد نقص اعلام‌شده';
		}
		return $list;
	}
	// ---------- محاسبه خسارت قابل پرداخت ----------
	public static function compute_payable( $items, $s, $death_count = 0 ) {
		$sum = function ( $cat ) use ( $items ) {
			$t = 0;
			foreach ( (array) $items as $i ) {
				if ( ( $i['category'] ?? '' ) === $cat ) $t += max( 0, (float) ( $i['approved'] ?? 0 ) );
			}
			return $t;
		};
		$property     = $sum( 'property' );
		$deductible   = (int) round( $property * ( $s['deductiblePercent'] / 100 ) );
		$property_net = min( max( 0, $property - $deductible ), $s['propertyCapRial'] );
		$medical      = min( $sum( 'medical' ), $s['medicalCapRial'] );
		$death        = min( $sum( 'death' ), $s['deathCapRial'] * max( 1, $death_count ) );
		return array(
			'property'   => $property,
			'deductible' => $deductible,
			'payable'    => $property_net + $medical + $death,
		);
	}
	public static function payable_of( $c, $s ) {
		return (int) self::compute_payable( $c['assessment']['items'] ?? array(), $s, count( (array) ( $c['damage']['deceased'] ?? array() ) ) )['payable'];
	}

	// ---------- انتقال‌های وضعیت ----------
	public static function actions() {
		return array(
			'submit'      => array( 'role' => 'subscriber', 'from' => array( 'draft', 'returned' ), 'to' => 'submitted', 'label' => 'ارسال پرونده به شرکت گاز',
				'guard' => function ( $c ) { $m = GII_WF::missing_for_submit( $c ); return $m ? 'موارد ناقص: ' . implode( '، ', $m ) : null; } ),
			'gas_start'   => array( 'role' => 'gas', 'from' => array( 'submitted' ), 'to' => 'gas_review', 'label' => 'شروع بررسی' ),
			'gas_return'  => array( 'role' => 'gas', 'from' => array( 'gas_review', 'insurer_query' ), 'to' => 'returned', 'label' => 'اعلام نقص و بازگشت به مشترک',
				'guard' => function ( $c ) { foreach ( GII_WF::open_deficiencies( $c ) as $d ) { if ( empty( $d['reply'] ) ) return null; } return 'دست‌کم یک مورد نقص جدید ثبت کنید.'; } ),
			'gas_forward' => array( 'role' => 'gas', 'from' => array( 'gas_review' ), 'to' => 'sent_insurer', 'label' => 'تأیید و ارسال به بیمه‌گر',
				'guard' => function ( $c ) {
					$s = GII_WF::missing_for_submit( array_merge( $c, array( 'status' => 'draft' ) ) );
					if ( $s ) return 'مدارک مشترک ناقص است: ' . implode( '، ', $s );
					foreach ( GII_WF::open_deficiencies( $c ) as $d ) { if ( empty( $d['reply'] ) ) return 'موارد نقص باز وجود دارد.'; }
					return null;
				} ),
			'gas_answer'  => array( 'role' => 'gas', 'from' => array( 'insurer_query' ), 'to' => 'insurer_review', 'label' => 'پاسخ به استعلام و بازگشت به بیمه‌گر',
				'guard' => function ( $c ) { foreach ( GII_WF::open_deficiencies( $c ) as $d ) { if ( 'insurer' === $d['by'] && empty( $d['reply'] ) ) return 'به همه موارد استعلام بیمه‌گر پاسخ دهید.'; } return null; } ),
			'gas_reject'  => array( 'role' => 'gas', 'from' => array( 'gas_review' ), 'to' => 'rejected', 'label' => 'رد پرونده (غیرمشمول)', 'needsNote' => true ),
			'ins_start'   => array( 'role' => 'insurer', 'from' => array( 'sent_insurer' ), 'to' => 'insurer_review', 'label' => 'پذیرش و شروع ارزیابی' ),
			'ins_query'   => array( 'role' => 'insurer', 'from' => array( 'insurer_review', 'objection' ), 'to' => 'insurer_query', 'label' => 'درخواست مدارک تکمیلی',
				'guard' => function ( $c ) { foreach ( GII_WF::open_deficiencies( $c ) as $d ) { if ( 'insurer' === $d['by'] && empty( $d['reply'] ) ) return null; } return 'دست‌کم یک مورد درخواست ثبت کنید.'; } ),
			'ins_assess'  => array( 'role' => 'insurer', 'from' => array( 'insurer_review', 'objection' ), 'to' => 'assessed', 'label' => 'ثبت ارزیابی و اعلام مبلغ به مشترک',
				'guard' => function ( $c ) {
					if ( empty( $c['assessment']['adjuster'] ) ) return 'نام ارزیاب خسارت را وارد کنید.';
					if ( empty( $c['assessment']['items'] ) ) return 'دست‌کم یک ردیف ارزیابی وارد کنید.';
					return null;
				} ),
			'ins_reject'  => array( 'role' => 'insurer', 'from' => array( 'insurer_review', 'objection' ), 'to' => 'rejected', 'label' => 'رد پرونده', 'needsNote' => true ),
			'accept'      => array( 'role' => 'subscriber', 'from' => array( 'assessed' ), 'to' => 'payment', 'label' => 'قبول مبلغ و درخواست پرداخت' ),
			'object'      => array( 'role' => 'subscriber', 'from' => array( 'assessed' ), 'to' => 'objection', 'label' => 'اعتراض به مبلغ', 'needsNote' => true ),
			'ins_pay'     => array( 'role' => 'insurer', 'from' => array( 'payment' ), 'to' => 'paid', 'label' => 'ثبت واریز',
				'guard' => function ( $c ) {
					if ( 'bank' !== GII_WF::fin_stage( $c ) ) return 'پیش از ثبت واریز، بررسی مالی، صدور حواله و ارسال به بانک باید انجام شود.';
					return ( ! empty( $c['payment']['ref'] ) && ! empty( $c['payment']['date'] ) ) ? null : 'شماره پیگیری بانکی و تاریخ واریز را وارد کنید.';
				} ),
		);
	}

	public static function can_do( $c, $role, $id ) {
		$a = self::actions()[ $id ] ?? null;
		if ( ! $a ) return 'عمل نامعتبر';
		if ( $a['role'] !== $role ) return 'این عمل برای نقش شما مجاز نیست.';
		if ( ! in_array( $c['status'], $a['from'], true ) ) return 'در وضعیت فعلی پرونده این عمل ممکن نیست.';
		return isset( $a['guard'] ) ? call_user_func( $a['guard'], $c ) : null;
	}

	/**
	 * @param array $actor array( 'name' => ..., 'role' => ... )
	 * @param array $opts  causeConfirmed: کارشناس گاز تأیید می‌کند که در گزارش، علت گاز قید شده است
	 */
	public static function apply_action( $c, $id, $actor, $note = '', $now = null, $opts = array() ) {
		$err = self::can_do( $c, $actor['role'], $id );
		if ( $err ) throw new GII_WF_Error( $err );
		$a = self::actions()[ $id ];
		if ( ! empty( $a['needsNote'] ) && '' === trim( $note ) ) throw new GII_WF_Error( 'نوشتن توضیح برای این عمل الزامی است.' );
		if ( 'gas_forward' === $id && empty( $opts['causeConfirmed'] ) ) throw new GII_WF_Error( 'تأیید کنید که گزارش علت حادثه را دیده‌اید و در آن «گاز» به‌عنوان علت قید شده است.' );
		$at            = self::iso( $now );
		$c['status']   = $a['to'];
		$c['statusAt'] = $at;
		if ( 'submit' === $id ) {
			$c['submittedAt'] = $at;
			$c['submitCount'] = (int) ( $c['submitCount'] ?? 0 ) + 1;
		}
		if ( 'gas_forward' === $id || 'gas_answer' === $id ) {
			foreach ( $c['deficiencies'] as &$d ) {
				if ( 'open' === $d['status'] ) { $d['status'] = 'closed'; $d['closedAt'] = $at; }
			}
			unset( $d );
		}
		if ( 'gas_forward' === $id ) {
			$c['forwardedAt'] = $at;
			$c['causeCheck']  = array( 'by' => $actor['name'], 'at' => $at );
		}
		if ( 'gas_return' === $id ) $c['returnedAt'] = $at;
		if ( 'ins_assess' === $id ) $c['assessment']['at'] = $at;
		if ( 'accept' === $id ) $c['acceptedAt'] = $at;
		if ( 'object' === $id ) $c['objection'] = array( 'note' => $note, 'at' => $at );
		if ( 'ins_pay' === $id ) $c['paidAt'] = $at;
		if ( 'rejected' === $a['to'] ) $c['rejectReason'] = $note;
		$c['timeline'][] = array( 'at' => $at, 'by' => $actor['name'], 'role' => $actor['role'], 'action' => $id, 'label' => $a['label'], 'note' => $note );
		return $c;
	}

	// ---------- فرایند مالی ----------
	public static function fin_stage( $c ) {
		if ( 'paid' === $c['status'] ) return 'paid';
		if ( 'payment' !== $c['status'] ) return null;
		return $c['finance']['stage'] ?? 'accepted';
	}
	public static function fin_steps() {
		return array(
			'fin_review'  => array( 'from' => 'accepted', 'to' => 'review', 'label' => 'بررسی مالی و استعلام شبا انجام شد',
				'check' => function ( $d ) { return empty( $d['reviewer'] ) ? 'نام بررسی‌کننده مالی را وارد کنید.' : ( empty( $d['shebaMatch'] ) ? 'تطبیق شبا با نام ذی‌نفع باید تأیید شود.' : null ); } ),
			'fin_voucher' => array( 'from' => 'review', 'to' => 'voucher', 'label' => 'حواله پرداخت صادر شد',
				'check' => function ( $d ) { return empty( $d['voucherNo'] ) ? 'شماره حواله را وارد کنید.' : ( ! GII_WF::parse_jalali( $d['date'] ?? '' ) ? 'تاریخ صدور حواله معتبر نیست.' : ( ( (float) ( $d['amount'] ?? 0 ) ) <= 0 ? 'مبلغ حواله باید بیشتر از صفر باشد.' : null ) ); } ),
			'fin_bank'    => array( 'from' => 'voucher', 'to' => 'bank', 'label' => 'دستور پرداخت به بانک ارسال شد',
				'check' => function ( $d ) { return ! isset( GII_WF::TRANSFER_METHODS[ $d['method'] ?? '' ] ) ? 'روش انتقال (پایا یا ساتنا) را انتخاب کنید.' : ( empty( $d['ref'] ) ? 'شماره پیگیری دستور پرداخت را وارد کنید.' : ( ! GII_WF::parse_jalali( $d['date'] ?? '' ) ? 'تاریخ ارسال معتبر نیست.' : null ) ); } ),
		);
	}
	public static function apply_finance( $c, $step, $data, $actor, $now = null ) {
		$f = self::fin_steps()[ $step ] ?? null;
		if ( ! $f ) throw new GII_WF_Error( 'گام مالی نامعتبر' );
		if ( 'insurer' !== $actor['role'] ) throw new GII_WF_Error( 'فقط کارشناس بیمه‌گر گام‌های مالی را ثبت می‌کند.' );
		if ( self::fin_stage( $c ) !== $f['from'] ) throw new GII_WF_Error( 'این گام مالی به ترتیب نیست.' );
		$err = call_user_func( $f['check'], $data );
		if ( $err ) throw new GII_WF_Error( $err );
		$at                         = self::iso( $now );
		$c['finance']               = (array) ( $c['finance'] ?? array() );
		$c['finance']['stage']      = $f['to'];
		$c['finance'][ $f['to'] ]   = array_merge( $data, array( 'at' => $at, 'by' => $actor['name'] ) );
		if ( 'voucher' === $f['to'] ) {
			$c['payment']           = (array) ( $c['payment'] ?? array() );
			$c['payment']['amount'] = $data['amount'];
		}
		$note = 'review' === $f['to'] ? (string) ( $data['note'] ?? '' )
			: ( 'voucher' === $f['to'] ? "حواله {$data['voucherNo']} به مبلغ {$data['amount']} ریال" : self::TRANSFER_METHODS[ $data['method'] ] . " — پیگیری {$data['ref']}" );
		$c['timeline'][] = array( 'at' => $at, 'by' => $actor['name'], 'role' => $actor['role'], 'action' => $step, 'label' => $f['label'], 'note' => $note );
		return $c;
	}
}
