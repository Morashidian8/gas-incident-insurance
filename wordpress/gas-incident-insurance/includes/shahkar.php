<?php
/**
 * استعلام شاهکار: آیا این موبایل به نام صاحب این کد ملی است؟
 * حالت‌ها (پیشخوان وردپرس ← بیمه حوادث گاز):
 * - off: استعلام نمی‌شود (skipped)؛ کارشناس گاز فقط با مدارک تصمیم می‌گیرد.
 * - demo: برای آزمایش؛ موبایل‌های پایان‌یافته به 0000 «عدم تطابق» است و بقیه تطابق دارند.
 * - http: درخواست POST به نشانی سرویس‌دهنده شاهکار (معمولاً سامانه پیامک یا واسط استعلام).
 *   بدنه JSON: {"nationalCode": "...", "mobile": "..."} و سرآیند Authorization: Bearer <کلید>.
 *   پاسخ: یکی از کلیدهای matched / isMatched / result / data.matched با مقدار true/false.
 *   اگر قالب سرویس‌دهنده فرق داشت، فقط تابع http() را مطابق مستندات او تغییر دهید.
 * نتیجه: ok | mismatch | skipped | error. در error ثبت‌نام متوقف نمی‌شود و کارشناس هشدار می‌بیند.
 */
defined( 'ABSPATH' ) || exit;

class GII_Shahkar {

	const MODES = array(
		'off'  => 'خاموش (فقط بررسی مدارک توسط کارشناس)',
		'demo' => 'نمایشی (برای آزمایش)',
		'http' => 'سرویس واقعی شاهکار (HTTP)',
	);

	public static function check( $national_id, $mobile ) {
		$s    = GII_Store::settings();
		$mode = $s['shahkar_mode'] ?? ( GII_Store::demo_on() ? 'demo' : 'off' );
		$at   = GII_WF::iso();
		if ( 'demo' === $mode ) {
			return array( 'status' => preg_match( '/0000$/', $mobile ) ? 'mismatch' : 'ok', 'at' => $at, 'demo' => true );
		}
		if ( 'http' === $mode && ! empty( $s['shahkar_url'] ) ) {
			return array( 'status' => self::http( $s['shahkar_url'], $s['shahkar_key'] ?? '', $national_id, $mobile ), 'at' => $at );
		}
		return array( 'status' => 'skipped', 'at' => $at );
	}

	private static function http( $url, $key, $national_id, $mobile ) {
		$res = wp_remote_post( $url, array(
			'timeout' => 8,
			'headers' => array_filter( array( 'Content-Type' => 'application/json', 'Authorization' => $key ? 'Bearer ' . $key : '' ) ),
			'body'    => wp_json_encode( array( 'nationalCode' => $national_id, 'mobile' => $mobile ) ),
		) );
		if ( is_wp_error( $res ) || wp_remote_retrieve_response_code( $res ) >= 300 ) {
			return 'error';
		}
		$j = json_decode( wp_remote_retrieve_body( $res ), true );
		foreach ( array( $j['matched'] ?? null, $j['isMatched'] ?? null, $j['result'] ?? null, $j['data']['matched'] ?? null ) as $v ) {
			if ( is_bool( $v ) ) {
				return $v ? 'ok' : 'mismatch';
			}
		}
		return 'error';
	}
}
