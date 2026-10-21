<?php
/**
 * ارسال پیامک. همه پیامک‌ها در «پیامک‌ها»ی مدیر ثبت می‌شوند.
 * سامانه‌ها: log (فقط ثبت، برای آزمایش)، kavenegar (کاوه‌نگار) و melipayamak (ملی‌پیامک).
 * تنظیمات در پیشخوان وردپرس ← بیمه حوادث گاز.
 */
defined( 'ABSPATH' ) || exit;

class GII_SMS {

	const PROVIDERS = array(
		'log'         => 'فقط ثبت در سامانه (بدون ارسال واقعی)',
		'kavenegar'   => 'کاوه‌نگار',
		'melipayamak' => 'ملی‌پیامک',
	);

	public static function send( $mobile, $text ) {
		$mobile = GII_WF::normalize_digits( $mobile );
		if ( ! GII_WF::is_valid_mobile( $mobile ) ) {
			return false;
		}
		$s        = GII_Store::settings();
		$provider = $s['sms_provider'] ?? 'log';
		$status   = 'logged';
		if ( 'kavenegar' === $provider && ! empty( $s['sms_key'] ) ) {
			$url    = 'https://api.kavenegar.com/v1/' . rawurlencode( $s['sms_key'] ) . '/sms/send.json';
			$status = self::result( wp_remote_post( $url, array(
				'timeout' => 10,
				'body'    => array( 'receptor' => $mobile, 'message' => $text, 'sender' => $s['sms_sender'] ?? '' ),
			) ) );
		} elseif ( 'melipayamak' === $provider && ! empty( $s['sms_user'] ) ) {
			$status = self::result( wp_remote_post( 'https://rest.payamak-panel.com/api/SendSMS/SendSMS', array(
				'timeout' => 10,
				'body'    => array( 'username' => $s['sms_user'], 'password' => $s['sms_pass'] ?? '', 'to' => $mobile, 'from' => $s['sms_sender'] ?? '', 'text' => $text, 'isflash' => 'false' ),
			) ) );
		}
		$id = wp_insert_post( array( 'post_type' => GII_Store::SMS, 'post_status' => 'publish', 'post_title' => $mobile, 'post_content' => wp_slash( $text ) ) );
		if ( $id && ! is_wp_error( $id ) ) {
			update_post_meta( $id, '_status', $status );
			update_post_meta( $id, '_provider', $provider );
		}
		return 'failed' !== substr( $status, 0, 6 );
	}

	private static function result( $res ) {
		if ( is_wp_error( $res ) ) {
			return 'failed: ' . $res->get_error_message();
		}
		$code = wp_remote_retrieve_response_code( $res );
		return $code >= 200 && $code < 300 ? 'sent' : 'failed: HTTP ' . $code;
	}
}
