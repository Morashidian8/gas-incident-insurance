<?php
/**
 * تست‌های قواعد سرور؛ همان سناریوهای tests/workflow.test.mjs.
 * اجرا: php wordpress/tests/workflow-test.php
 */
define( 'GII_TESTING', true );
require __DIR__ . '/../gas-incident-insurance/includes/workflow.php';

$fails = 0;
$count = 0;
function check( $name, $cond ) {
	global $fails, $count;
	$count++;
	if ( ! $cond ) {
		$fails++;
		echo "✗ $name\n";
	}
}
function throws( $fn, $pattern ) {
	try { $fn(); } catch ( GII_WF_Error $e ) { return (bool) preg_match( $pattern, $e->getMessage() ); }
	return false;
}
function make_sheba( $bban ) {
	$r = 0;
	foreach ( str_split( $bban . '182700' ) as $ch ) $r = ( $r * 10 + (int) $ch ) % 97;
	return 'IR' . str_pad( (string) ( 98 - $r ), 2, '0', STR_PAD_LEFT ) . $bban;
}
function complete_claim() {
	$docs = array();
	foreach ( GII_WF::doc_types() as $d ) $docs[ $d['id'] ] = array( 'f-' . $d['id'] );
	return array(
		'id' => 'c1', 'status' => 'draft', 'timeline' => array(), 'deficiencies' => array(),
		'incident' => array( 'date' => '1405/07/20', 'type' => 'fire', 'placeType' => 'residential', 'address' => 'تهران، خیابان آزادی، پلاک ۱۲', 'description' => 'آتش‌سوزی آشپزخانه به علت نشت شیلنگ اجاق گاز', 'fireReportNo' => '۱۲۳۴' ),
		'damage' => array( 'kinds' => array( 'property' ), 'items' => array( array( 'title' => 'کابینت', 'qty' => 1, 'amount' => 300000000 ) ), 'injured' => array(), 'deceased' => array() ),
		'photos' => array( 'p1', 'p2', 'p3', 'p4' ), 'docs' => $docs, 'bank' => array( 'sheba' => make_sheba( '0570028180010653892101' ), 'holder' => 'مشترک' ), 'declaration' => true,
		'gasReport' => array( 'inspector' => 'مهندس رضایی', 'visitDate' => '1405/07/21', 'cause' => 'hose', 'afterMeter' => 'after', 'opinion' => 'covered' ),
	);
}
date_default_timezone_set( 'Asia/Tehran' );
$sub = array( 'name' => 'مشترک', 'role' => 'subscriber' );
$gas = array( 'name' => 'کارشناس گاز', 'role' => 'gas' );
$ins = array( 'name' => 'ارزیاب', 'role' => 'insurer' );

// کد ملی و شبا
check( 'national id valid', GII_WF::is_valid_national_id( '0499370899' ) );
check( 'national id persian digits', GII_WF::is_valid_national_id( '۰۴۹۹۳۷۰۸۹۹' ) );
check( 'national id bad check digit', ! GII_WF::is_valid_national_id( '0499370898' ) );
check( 'national id repeated', ! GII_WF::is_valid_national_id( '1111111111' ) );
$s = make_sheba( '0570028180010653892101' );
check( 'sheba valid', GII_WF::is_valid_sheba( $s ) );
check( 'sheba bad', ! GII_WF::is_valid_sheba( substr( $s, 0, -1 ) . '9' ) );
check( 'sheba short', ! GII_WF::is_valid_sheba( 'IR12' ) );

// تاریخ شمسی
check( 'jalali 2026-10-20', '1405/07/28' === GII_WF::jalali_string( mktime( 12, 0, 0, 10, 20, 2026 ) ) );
check( 'jalali nowruz', '1404/01/01' === GII_WF::jalali_string( mktime( 12, 0, 0, 3, 21, 2025 ) ) );
$ts = GII_WF::parse_jalali( '۱۴۰۵/۰۷/۲۸' );
check( 'parse jalali', $ts && '2026-10-20' === date( 'Y-m-d', $ts ) );
check( 'parse invalid day', null === GII_WF::parse_jalali( '1405/07/31' ) );
check( 'parse garbage', null === GII_WF::parse_jalali( 'abc' ) );

// ارسال ناقص
$c = complete_claim();
$c['photos'] = array( 'p1' );
check( 'incomplete submit blocked', (bool) preg_match( '/عکس/u', (string) GII_WF::can_do( $c, 'subscriber', 'submit' ) ) );

// چرخه کامل
$c = complete_claim();
check( 'gas cannot submit', 'این عمل برای نقش شما مجاز نیست.' === GII_WF::can_do( $c, 'gas', 'submit' ) );
$c = GII_WF::apply_action( $c, 'submit', $sub );
check( 'submitted', 'submitted' === $c['status'] );
$c = GII_WF::apply_action( $c, 'gas_start', $gas );
check( 'return needs defect', (bool) preg_match( '/نقص/u', (string) GII_WF::can_do( $c, 'gas', 'gas_return' ) ) );
$c['deficiencies'][] = array( 'id' => 'd1', 'target' => 'doc:fire_report', 'note' => 'ناخوانا', 'by' => 'gas', 'status' => 'open' );
$c = GII_WF::apply_action( $c, 'gas_return', $gas );
check( 'returned', 'returned' === $c['status'] );
check( 'resubmit needs reply', (bool) preg_match( '/پاسخ/u', (string) GII_WF::can_do( $c, 'subscriber', 'submit' ) ) );
$c['deficiencies'][0]['reply'] = 'اصلاح شد';
$c = GII_WF::apply_action( $c, 'submit', $sub );
$c = GII_WF::apply_action( $c, 'gas_start', $gas );
$c = GII_WF::apply_action( $c, 'gas_forward', $gas );
check( 'sent to insurer', 'sent_insurer' === $c['status'] && 0 === count( GII_WF::open_deficiencies( $c ) ) );
$c = GII_WF::apply_action( $c, 'ins_start', $ins );
$c['deficiencies'][] = array( 'id' => 'd2', 'target' => 'general', 'note' => 'عکس کنتور', 'by' => 'insurer', 'status' => 'open' );
$c = GII_WF::apply_action( $c, 'ins_query', $ins );
check( 'insurer query', 'insurer_query' === $c['status'] );
check( 'answer needs reply', (bool) preg_match( '/پاسخ/u', (string) GII_WF::can_do( $c, 'gas', 'gas_answer' ) ) );
$c['deficiencies'][1]['reply'] = 'پیوست شد';
$c = GII_WF::apply_action( $c, 'gas_answer', $gas );
check( 'back to insurer review', 'insurer_review' === $c['status'] );
$c['assessment'] = array( 'adjuster' => 'ارزیاب', 'items' => array( array( 'category' => 'property', 'title' => 'کابینت', 'claimed' => 300000000, 'approved' => 250000000 ) ) );
$c = GII_WF::apply_action( $c, 'ins_assess', $ins );
check( 'objection needs note', throws( function () use ( $c, $sub ) { GII_WF::apply_action( $c, 'object', $sub, '' ); }, '/توضیح/u' ) );
$c = GII_WF::apply_action( $c, 'accept', $sub );
$c['payment'] = array( 'ref' => '998877', 'date' => '1405/08/10' );
check( 'pay blocked before voucher', (bool) preg_match( '/حواله/u', (string) GII_WF::can_do( $c, 'insurer', 'ins_pay' ) ) );
check( 'fin stage accepted', 'accepted' === GII_WF::fin_stage( $c ) );
check( 'finance out of order', throws( function () use ( $c, $ins ) { GII_WF::apply_finance( $c, 'fin_voucher', array( 'voucherNo' => '1', 'date' => '1405/08/01', 'amount' => 1 ), $ins ); }, '/ترتیب/u' ) );
check( 'finance needs sheba match', throws( function () use ( $c, $ins ) { GII_WF::apply_finance( $c, 'fin_review', array( 'reviewer' => 'مالی' ), $ins ); }, '/شبا/u' ) );
check( 'finance only insurer', throws( function () use ( $c, $gas ) { GII_WF::apply_finance( $c, 'fin_review', array( 'reviewer' => 'x', 'shebaMatch' => true ), $gas ); }, '/بیمه‌گر/u' ) );
$c = GII_WF::apply_finance( $c, 'fin_review', array( 'reviewer' => 'واحد مالی', 'shebaMatch' => true ), $ins );
$c = GII_WF::apply_finance( $c, 'fin_voucher', array( 'voucherNo' => 'H-1405-77', 'date' => '1405/08/05', 'amount' => 205000000 ), $ins );
check( 'voucher sets amount', 205000000 === $c['payment']['amount'] );
$c = GII_WF::apply_finance( $c, 'fin_bank', array( 'method' => 'paya', 'ref' => 'P-5566', 'date' => '1405/08/06' ), $ins );
check( 'fin stage bank', 'bank' === GII_WF::fin_stage( $c ) );
$c = GII_WF::apply_action( $c, 'ins_pay', $ins );
check( 'paid', 'paid' === $c['status'] && 'paid' === GII_WF::fin_stage( $c ) );
check( 'timeline length 15', 15 === count( $c['timeline'] ) );

// فرانشیز و سقف
$st = array_merge( GII_WF::DEFAULT_SETTINGS, array( 'deductiblePercent' => 10, 'propertyCapRial' => 100, 'medicalCapRial' => 50 ) );
$r  = GII_WF::compute_payable( array( array( 'category' => 'property', 'approved' => 200 ), array( 'category' => 'medical', 'approved' => 80 ) ), $st );
check( 'deductible 20', 20 === $r['deductible'] );
check( 'payable capped 150', 150.0 === (float) $r['payable'] );

// مدارک لازم
$c         = complete_claim();
$c['docs'] = array();
$ids       = function () use ( &$c ) { return array_column( GII_WF::required_docs( $c, 'subscriber' ), 'id' ); };
check( 'fire report required', in_array( 'fire_report', $ids(), true ) );
check( 'no death cert', ! in_array( 'death_cert', $ids(), true ) );
check( 'police optional', ! in_array( 'police', $ids(), true ) );
$c['damage']['kinds'][] = 'death';
check( 'death cert required', in_array( 'death_cert', $ids(), true ) );
check( 'police required on death', in_array( 'police', $ids(), true ) );
check( 'gas report not subscriber', ! in_array( 'gas_report', $ids(), true ) );

echo $fails ? "\n$fails of $count checks failed\n" : "all $count checks passed\n";
exit( $fails ? 1 : 0 );
