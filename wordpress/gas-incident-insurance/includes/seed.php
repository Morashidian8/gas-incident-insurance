<?php
/**
 * داده نمایشی؛ همان هفت پرونده نمونه js/store.js (نقص، منتظر تأیید، پیش‌نویس، ارسال‌شده، نزد بیمه‌گر، پرداخت‌شده، حواله صادرشده).
 * فقط در «حالت نمایشی» ساخته یا بازنشانی می‌شود. همه اشخاص و مبالغ ساختگی‌اند.
 */
defined( 'ABSPATH' ) || exit;

class GII_Seed {

	/** حساب‌های نمایشی که روی صفحه ورود دکمه دارند */
	const ACCOUNTS = array(
		array( 'u' => '1023456789', 'p' => '123456', 't' => 'مشترک — پرونده دارای نقص', 's' => 'حمید رضایی', 'ic' => 'alert' ),
		array( 'u' => '1045678912', 'p' => '123456', 't' => 'مشترک — منتظر تأیید مبلغ', 's' => 'مریم احمدی', 'ic' => 'money' ),
		array( 'u' => '1067891234', 'p' => '123456', 't' => 'مشترک — ورود اول با رمز موقت', 's' => 'رضا کریمی', 'ic' => 'key' ),
		array( 'u' => '1024681357', 'p' => '123456', 't' => 'مشترک — حواله صادر شده', 's' => 'علیرضا تهرانی', 'ic' => 'receipt' ),
		array( 'u' => 'gas', 'p' => 'gas123', 't' => 'کارشناس شرکت گاز', 's' => 'سارا کاظمی', 'ic' => 'flame' ),
		array( 'u' => 'bime', 'p' => 'bime123', 't' => 'کارشناس بیمه‌گر', 's' => 'علی محمدی', 'ic' => 'shield' ),
		array( 'u' => 'modir', 'p' => 'admin123', 't' => 'مدیر سامانه', 's' => 'کاربران، تنظیمات و گزارش', 'ic' => 'settings' ),
	);

	private static $gas;
	private static $ins;

	/** همه داده‌های سامانه (پرونده، اعلان، پیامک، کاربران نقش‌دار) جز کاربر $keep پاک و دوباره ساخته می‌شود */
	public static function reset( $keep = 0 ) {
		self::wipe( $keep );
		self::seed();
	}
	public static function wipe( $keep = 0 ) {
		foreach ( array( GII_Store::CLAIM, GII_Store::NOTICE, GII_Store::SMS ) as $type ) {
			foreach ( get_posts( array( 'post_type' => $type, 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids' ) ) as $id ) {
				if ( GII_Store::CLAIM === $type ) {
					GII_Store::delete_claim_files( $id );
				}
				wp_delete_post( $id, true );
			}
		}
		require_once ABSPATH . 'wp-admin/includes/user.php';
		foreach ( get_users( array( 'role__in' => array( 'gii_subscriber', 'gii_gas', 'gii_insurer', 'gii_admin' ), 'fields' => 'ids' ) ) as $uid ) {
			if ( (int) $uid !== (int) $keep ) {
				wp_delete_user( $uid );
			}
		}
		delete_option( 'gii_seq' );
		// محدودیت‌های تعداد درخواست و کدهای بازیابی هم با داده نمونه از نو شروع می‌شوند
		global $wpdb;
		$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_gii\\_%' OR option_name LIKE '\\_transient\\_timeout\\_gii\\_%'" );
	}

	private static function ts( $days_ago, $hour = 10 ) {
		$d = new DateTime( 'now', wp_timezone() );
		$d->modify( "-$days_ago days" )->setTime( $hour, 15 );
		return $d->getTimestamp();
	}
	private static function iso( $days_ago, $hour = 10 ) { return GII_WF::iso( self::ts( $days_ago, $hour ) ); }
	private static function jal( $days_ago ) { return GII_WF::jalali_string( self::ts( $days_ago ) ); }
	private static function rid( $p ) { return $p . '-' . strtolower( wp_generate_password( 10, false ) ); }

	private static function nid( $b9 ) {
		$sum = 0;
		for ( $i = 0; $i < 9; $i++ ) $sum += (int) $b9[ $i ] * ( 10 - $i );
		$sum %= 11;
		$id   = $b9 . ( $sum < 2 ? $sum : 11 - $sum );
		return GII_WF::is_valid_national_id( $id ) ? $id : null;
	}
	private static function sheba( $bban ) {
		$r = 0;
		foreach ( str_split( $bban . '182700' ) as $ch ) $r = ( $r * 10 + (int) $ch ) % 97;
		return 'IR' . str_pad( (string) ( 98 - $r ), 2, '0', STR_PAD_LEFT ) . $bban;
	}
	private static function photo_svg( $label, $hue ) {
		return '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' . $hue . ',25%,32%)"/><stop offset="1" stop-color="hsl(' . $hue . ',30%,14%)"/></linearGradient></defs>'
			. '<rect width="800" height="600" fill="url(#g)"/><rect x="80" y="160" width="300" height="300" fill="hsl(' . $hue . ',12%,22%)"/><rect x="430" y="220" width="260" height="240" fill="hsl(' . $hue . ',10%,26%)"/>'
			. '<path d="M200 460c-60 0-90-40-90-90 0-60 50-80 60-150 40 30 60 60 55 90 20-10 30-30 35-50 40 30 70 70 70 110 0 50-40 90-130 90z" fill="hsl(28,40%,30%)" opacity=".7"/>'
			. '<text x="400" y="560" font-family="Tahoma" font-size="34" fill="#fff" text-anchor="middle" opacity=".85">عکس نمونه — ' . esc_html( $label ) . '</text></svg>';
	}
	private static function doc_svg( $title, $cause = '' ) {
		$lines = $cause ? '<rect x="70" y="190" width="460" height="56" rx="10" fill="#fdecdf"/><text x="300" y="227" font-family="Tahoma" font-size="22" fill="#c2410c" text-anchor="middle">' . esc_html( $cause ) . '</text>' : '';
		for ( $i = 0; $i < ( $cause ? 12 : 14 ); $i++ ) $lines .= '<rect x="80" y="' . ( ( $cause ? 270 : 220 ) + $i * 34 ) . '" width="' . ( $i % 3 ? 440 : 300 ) . '" height="10" rx="5" fill="#dfe6ec"/>';
		return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#fbfbf8"/><rect x="40" y="40" width="520" height="720" fill="none" stroke="#c9d3dc" stroke-width="3"/>'
			. '<text x="300" y="120" font-family="Tahoma" font-size="30" fill="#1c2733" text-anchor="middle">' . esc_html( $title ) . '</text>'
			. '<text x="300" y="165" font-family="Tahoma" font-size="20" fill="#8a97a3" text-anchor="middle">مدرک نمونه برای نسخه نمایشی</text>' . $lines
			. '<circle cx="460" cy="690" r="46" fill="none" stroke="#3a8cc3" stroke-width="4"/></svg>';
	}
	private static function add_svg( &$c, $target, $svg, $name, $by ) {
		$tmp = tempnam( get_temp_dir(), 'gii' );
		file_put_contents( $tmp, $svg );
		$id = GII_Store::add_file( $c, $target, $tmp, $name, 'image/svg+xml', $by );
		$c['files'][ $id ]['at'] = $c['createdAt'];
		return $id;
	}

	private static function user( $login, $pw, $name, $role, $meta = array(), $days = 40 ) {
		// کاربری که بازنشانی را انجام داده نگه داشته شده؛ دوباره ساخته نمی‌شود
		$existing = get_user_by( 'login', $login );
		if ( $existing ) {
			foreach ( $meta as $k => $v ) {
				update_user_meta( $existing->ID, $k, $v );
			}
			return $existing;
		}
		list( $u ) = GII_Store::create_user( $login, $name, $role, $meta, $pw );
		wp_update_user( array( 'ID' => $u->ID, 'user_registered' => gmdate( 'Y-m-d H:i:s', self::ts( $days ) ) ) );
		return get_userdata( $u->ID );
	}

	private static function claim( WP_User $u, $o ) {
		$created = self::ts( $o['age'] );
		$addr    = get_user_meta( $u->ID, 'gii_address', true );
		$c       = array(
			'code' => GII_WF::claim_code( GII_Store::next_seq(), $created ), 'subscriberId' => (string) $u->ID, 'createdBy' => (string) self::$gas->ID,
			'createdAt' => GII_WF::iso( $created ), 'status' => 'draft', 'statusAt' => GII_WF::iso( $created ), 'submitCount' => 0,
			'incident' => array_merge( array( 'date' => self::jal( $o['age'] + 2 ), 'time' => '21:30', 'type' => 'fire', 'placeType' => 'residential', 'address' => $addr, 'postalCode' => '', 'description' => '', 'causeIssuer' => '', 'causeReportNo' => '', 'causeReportDate' => '', 'causeStatesGas' => false, 'policeReportNo' => '' ), $o['incident'] ?? array() ),
			'damage' => array_merge( array( 'kinds' => array( 'property' ), 'items' => array(), 'injured' => array(), 'deceased' => array() ), $o['damage'] ?? array() ),
			'photos' => array(), 'docs' => array(), 'files' => array(), 'bank' => array( 'sheba' => '', 'holder' => '' ), 'declaration' => false,
			'deficiencies' => array(), 'messages' => array(),
			'timeline' => array( array( 'at' => GII_WF::iso( $created ), 'by' => self::$gas->display_name, 'role' => 'gas', 'action' => 'create', 'label' => 'تشکیل پرونده و ایجاد حساب مشترک', 'note' => '' ) ),
			'assessment' => null, 'payment' => null,
		);
		$c = GII_Store::save_claim( $c );
		if ( ! empty( $o['fill'] ) ) {
			foreach ( array( 'آشپزخانه', 'سقف', 'کابینت', 'پنجره', 'کنتور' ) as $i => $label ) {
				self::add_svg( $c, 'photos', self::photo_svg( $label, 200 + $i * 20 ), 'photo-' . ( $i + 1 ) . '.svg', 'subscriber' );
			}
			foreach ( GII_WF::required_docs( $c, 'subscriber' ) as $d ) {
				if ( in_array( $d['id'], $o['skipDocs'] ?? array(), true ) ) continue;
				$cause = 'cause_report' === $d['id'] ? 'علت حادثه: ' . ( 'co' === $c['incident']['type'] ? 'گازگرفتگی ناشی از نشت گاز طبیعی' : 'آتش‌سوزی ناشی از نشت گاز طبیعی' ) : '';
				self::add_svg( $c, $d['id'], self::doc_svg( $d['title'], $cause ), $d['id'] . '.svg', 'subscriber' );
			}
			// گزارش علت حادثه با قید «گاز»؛ گازگرفتگی معمولاً با گزارش کارشناس رسمی دادگستری
			$c['incident'] = array_merge( $c['incident'], array(
				'causeIssuer' => 'co' === $c['incident']['type'] ? 'expert' : 'fire',
				'causeReportNo' => '' !== $c['incident']['causeReportNo'] ? $c['incident']['causeReportNo'] : '۵۱۰' . $c['id'],
				'causeReportDate' => self::jal( $o['age'] + 1 ), 'causeStatesGas' => true,
			) );
			$c['bank']        = array( 'sheba' => self::sheba( '0170000000123456789001' ), 'holder' => $u->display_name );
			$c['declaration'] = true;
		}
		foreach ( $o['steps'] ?? array() as $s ) {
			$by              = 'gas' === $s[2] ? self::$gas->display_name : ( 'insurer' === $s[2] ? self::$ins->display_name : $u->display_name );
			$c['timeline'][] = array( 'at' => self::iso( $s[3], 12 ), 'by' => $by, 'role' => $s[2], 'action' => $s[0], 'label' => $s[1], 'note' => $s[4] ?? '' );
		}
		if ( ! empty( $o['steps'] ) ) $c['statusAt'] = end( $c['timeline'] )['at'];
		foreach ( $c['timeline'] as $t ) {
			if ( 'gas_forward' === $t['action'] ) { $c['forwardedAt'] = $t['at']; $c['causeCheck'] = array( 'by' => self::$gas->display_name, 'at' => $t['at'] ); break; }
		}
		$c['status'] = $o['status'] ?? 'draft';
		return array_merge( $c, $o['extra'] ?? array() );
	}

	public static function seed() {
		$admin = self::user( 'modir', 'admin123', 'مدیر سامانه', 'gii_admin', array( 'gii_org' => 'واحد فناوری اطلاعات' ) );
		self::$gas = self::user( 'gas', 'gas123', 'سارا کاظمی', 'gii_gas', array( 'gii_org' => 'شرکت گاز استان — امور حوادث و بیمه', 'gii_mobile' => '09120000001' ) );
		self::$ins = self::user( 'bime', 'bime123', 'علی محمدی', 'gii_insurer', array( 'gii_org' => 'شرکت بیمه‌گر — واحد خسارت', 'gii_mobile' => '09120000002' ) );
		$gas = self::$gas->display_name;
		$ins = self::$ins->display_name;
		$subs = array(
			array( 'حمید رضایی', '004123456', '1023456789', '09121112233', 'تهران، نارمک، خیابان گلبرگ، کوچه ۱۴، پلاک ۸' ),
			array( 'مریم احمدی', '012345678', '1045678912', '09123334455', 'کرج، گوهردشت، بلوار موذن، پلاک ۲۲' ),
			array( 'رضا کریمی', '029876543', '1067891234', '09125556677', 'تهران، پیروزی، خیابان نبرد، پلاک ۴۵' ),
			array( 'زهرا موسوی', '038765432', '1089123456', '09127778899', 'تهران، شهرری، خیابان فداییان اسلام، پلاک ۳' ),
			array( 'محسن نوری', '047654321', '1091234567', '09129990011', 'شهریار، خیابان ولیعصر، کوچه یاس، پلاک ۱۱' ),
			array( 'فاطمه جعفری', '056543219', '1013579246', '09124443322', 'تهران، تهرانپارس، فلکه دوم، پلاک ۷۰' ),
			array( 'علیرضا تهرانی', '065432198', '1024681357', '09121234567', 'تهران، ونک، خیابان ملاصدرا، پلاک ۱۸' ),
		);
		$users = array();
		foreach ( $subs as $i => $s ) {
			$nid     = self::nid( $s[1] ) ?: self::nid( substr( $s[1], 0, 8 ) . '1' );
			$users[] = self::user( $s[2], '123456', $s[0], 'gii_subscriber', array(
				'gii_national_id' => $nid, 'gii_subscription_no' => $s[2], 'gii_mobile' => $s[3], 'gii_address' => $s[4],
				'gii_must_change' => 2 === $i ? '1' : '',
			) );
		}

		// ۱) پرونده دارای نقص
		$c1 = self::claim( $users[0], array(
			'age' => 9, 'status' => 'returned', 'fill' => true, 'skipDocs' => array( 'ownership' ),
			'incident' => array( 'description' => 'هنگام روشن کردن اجاق گاز، شعله به شیلنگ رسید و آتش به کابینت و پرده آشپزخانه سرایت کرد. آتش‌نشانی ظرف ۱۵ دقیقه آتش را مهار کرد.', 'causeReportNo' => '۵۴۸۷۲' ),
			'damage' => array( 'items' => array( array( 'title' => 'کابینت آشپزخانه', 'qty' => 1, 'amount' => 420000000 ), array( 'title' => 'یخچال فریزر', 'qty' => 1, 'amount' => 310000000 ), array( 'title' => 'رنگ و گچ‌کاری سقف', 'qty' => 1, 'amount' => 95000000 ) ) ),
			'steps' => array( array( 'submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 6 ), array( 'gas_start', 'شروع بررسی', 'gas', 5 ), array( 'gas_return', 'اعلام نقص و بازگشت به مشترک', 'gas', 4, 'دو مورد نقص ثبت شد.' ) ),
			'extra' => array( 'submitCount' => 1 ),
		) );
		$c1['deficiencies'] = array(
			array( 'id' => self::rid( 'd' ), 'target' => 'doc:ownership', 'title' => 'سند مالکیت یا اجاره‌نامه محل حادثه', 'note' => 'سند مالکیت یا اجاره‌نامه بارگذاری نشده است.', 'by' => 'gas', 'byName' => $gas, 'at' => self::iso( 4 ), 'status' => 'open', 'reply' => '' ),
			array( 'id' => self::rid( 'd' ), 'target' => 'section:photos', 'title' => 'تصاویر حادثه', 'note' => 'لطفاً یک عکس واضح از کنتور و شیر اصلی گاز هم اضافه کنید.', 'by' => 'gas', 'byName' => $gas, 'at' => self::iso( 4 ), 'status' => 'open', 'reply' => '' ),
		);
		$c1['messages'][] = array( 'id' => self::rid( 'm' ), 'at' => self::iso( 4, 13 ), 'by' => $gas, 'byId' => (string) self::$gas->ID, 'role' => 'gas', 'text' => 'سلام، لطفاً موارد نقص را تا ۱۰ روز آینده تکمیل کنید تا پرونده برای بیمه‌گر ارسال شود.', 'internal' => false );
		$c1 = GII_Store::save_claim( $c1 );

		// ۲) منتظر تأیید مشترک
		$c2 = self::claim( $users[1], array(
			'age' => 34, 'status' => 'assessed', 'fill' => true,
			'incident' => array( 'type' => 'explosion', 'description' => 'انفجار ناشی از تجمع گاز در آشپزخانه پس از خاموش شدن شعله اجاق؛ شیشه‌ها و در ورودی آسیب دید.', 'causeReportNo' => '۴۹۱۲۰' ),
			'damage' => array( 'items' => array( array( 'title' => 'شیشه و پنجره‌ها', 'qty' => 4, 'amount' => 180000000 ), array( 'title' => 'در ورودی', 'qty' => 1, 'amount' => 120000000 ), array( 'title' => 'لوازم آشپزخانه', 'qty' => 1, 'amount' => 260000000 ) ) ),
			'steps' => array( array( 'submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 30 ), array( 'gas_start', 'شروع بررسی', 'gas', 29 ), array( 'gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 26 ), array( 'ins_start', 'پذیرش و شروع ارزیابی', 'insurer', 24 ), array( 'ins_assess', 'ثبت ارزیابی و اعلام مبلغ به مشترک', 'insurer', 3, 'بر اساس بازدید ارزیاب و فاکتورها.' ) ),
		) );
		$c2['assessment'] = array( 'adjuster' => 'مهندس نادر شریفی', 'visitDate' => self::jal( 20 ), 'note' => 'لوازم آشپزخانه با استهلاک ۲۰٪ محاسبه شد.', 'at' => self::iso( 3 ),
			'items' => array( array( 'category' => 'property', 'title' => 'شیشه و پنجره‌ها', 'claimed' => 180000000, 'approved' => 165000000 ), array( 'category' => 'property', 'title' => 'در ورودی', 'claimed' => 120000000, 'approved' => 110000000 ), array( 'category' => 'property', 'title' => 'لوازم آشپزخانه', 'claimed' => 260000000, 'approved' => 208000000 ) ) );
		$c2 = GII_Store::save_claim( $c2 );

		// ۳) پیش‌نویس تازه
		GII_Store::save_claim( self::claim( $users[2], array( 'age' => 1, 'damage' => array( 'kinds' => array() ) ) ) );

		// ۴) ارسال‌شده — کارتابل شرکت گاز
		$c4 = GII_Store::save_claim( self::claim( $users[3], array(
			'age' => 5, 'status' => 'submitted', 'fill' => true,
			'incident' => array( 'type' => 'co', 'description' => 'مسمومیت با مونوکسید کربن به علت انسداد دودکش آبگرمکن؛ دو نفر از اعضای خانواده بستری شدند.' ),
			'damage' => array( 'kinds' => array( 'medical' ), 'injured' => array( array( 'name' => 'علی موسوی', 'nationalId' => '', 'relation' => 'فرزند', 'hospital' => 'بیمارستان فیروزگر', 'amount' => 85000000 ), array( 'name' => 'زهرا موسوی', 'nationalId' => '', 'relation' => 'خود مشترک', 'hospital' => 'بیمارستان فیروزگر', 'amount' => 64000000 ) ) ),
			'steps' => array( array( 'submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 2 ) ),
			'extra' => array( 'submitCount' => 1 ),
		) ) );

		// ۵) نزد بیمه‌گر
		$c5 = GII_Store::save_claim( self::claim( $users[4], array(
			'age' => 18, 'status' => 'sent_insurer', 'fill' => true,
			'incident' => array( 'description' => 'آتش‌سوزی بخاری گازی در اتاق نشیمن به علت نزدیکی پرده؛ فرش و مبلمان سوخت.', 'causeReportNo' => '۵۰۳۳۱' ),
			'damage' => array( 'items' => array( array( 'title' => 'فرش دستباف ۹ متری', 'qty' => 1, 'amount' => 350000000 ), array( 'title' => 'مبلمان', 'qty' => 1, 'amount' => 280000000 ) ) ),
			'steps' => array( array( 'submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 14 ), array( 'gas_start', 'شروع بررسی', 'gas', 13 ), array( 'gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 11 ) ),
			'extra' => array( 'submitCount' => 1 ),
		) ) );

		// ۶) پرداخت‌شده
		$c6 = self::claim( $users[5], array(
			'age' => 70, 'status' => 'paid', 'fill' => true,
			'incident' => array( 'description' => 'آتش‌سوزی آبگرمکن در پارکینگ؛ دیوار و تأسیسات آسیب دید.', 'causeReportNo' => '۴۴۰۹۸' ),
			'damage' => array( 'items' => array( array( 'title' => 'آبگرمکن و لوله‌کشی', 'qty' => 1, 'amount' => 140000000 ), array( 'title' => 'بازسازی دیوار پارکینگ', 'qty' => 1, 'amount' => 90000000 ) ) ),
			'steps' => array( array( 'submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 66 ), array( 'gas_start', 'شروع بررسی', 'gas', 65 ), array( 'gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 62 ), array( 'ins_start', 'پذیرش و شروع ارزیابی', 'insurer', 60 ), array( 'ins_assess', 'ثبت ارزیابی و اعلام مبلغ به مشترک', 'insurer', 50 ), array( 'accept', 'قبول مبلغ و درخواست پرداخت', 'subscriber', 49 ), array( 'ins_pay', 'ثبت پرداخت', 'insurer', 41, 'واریز به حساب شبای مشترک' ) ),
			'extra' => array( 'submitCount' => 1 ),
		) );
		$c6['assessment'] = array( 'adjuster' => 'مهندس نادر شریفی', 'visitDate' => self::jal( 55 ), 'note' => '', 'at' => self::iso( 50 ),
			'items' => array( array( 'category' => 'property', 'title' => 'آبگرمکن و لوله‌کشی', 'claimed' => 140000000, 'approved' => 128000000 ), array( 'category' => 'property', 'title' => 'بازسازی دیوار پارکینگ', 'claimed' => 90000000, 'approved' => 90000000 ) ) );
		$c6['payment']    = array( 'ref' => '140506118842', 'date' => self::jal( 41 ), 'amount' => 196200000 );
		$c6['acceptedAt'] = self::iso( 49 );
		$c6['finance']    = array(
			'stage'   => 'bank',
			'review'  => array( 'reviewer' => 'واحد مالی بیمه‌گر', 'shebaMatch' => true, 'note' => '', 'at' => self::iso( 47 ), 'by' => $ins ),
			'voucher' => array( 'voucherNo' => 'H-1405-000006', 'date' => self::jal( 45 ), 'amount' => 196200000, 'at' => self::iso( 45 ), 'by' => $ins ),
			'bank'    => array( 'method' => 'paya', 'ref' => 'P-77810452', 'date' => self::jal( 42 ), 'at' => self::iso( 42 ), 'by' => $ins ),
		);
		array_splice( $c6['timeline'], count( $c6['timeline'] ) - 1, 0, array(
			array( 'at' => self::iso( 47, 11 ), 'by' => $ins, 'role' => 'insurer', 'action' => 'fin_review', 'label' => 'بررسی مالی و استعلام شبا انجام شد', 'note' => '' ),
			array( 'at' => self::iso( 45, 11 ), 'by' => $ins, 'role' => 'insurer', 'action' => 'fin_voucher', 'label' => 'حواله پرداخت صادر شد', 'note' => 'حواله H-1405-000006' ),
			array( 'at' => self::iso( 42, 11 ), 'by' => $ins, 'role' => 'insurer', 'action' => 'fin_bank', 'label' => 'دستور پرداخت به بانک ارسال شد', 'note' => 'پایا — پیگیری P-77810452' ),
		) );
		GII_Store::save_claim( $c6 );

		// ۷) حواله صادر شده
		$c7 = self::claim( $users[6], array(
			'age' => 40, 'status' => 'payment', 'fill' => true,
			'incident' => array( 'description' => 'آتش‌سوزی پکیج گرمایشی در آشپزخانه به علت نشتی اتصالات؛ کابینت و سقف کاذب آسیب دید.', 'causeReportNo' => '۴۷۲۲۵' ),
			'damage' => array( 'items' => array( array( 'title' => 'پکیج و لوله‌کشی', 'qty' => 1, 'amount' => 210000000 ), array( 'title' => 'کابینت و سقف کاذب', 'qty' => 1, 'amount' => 260000000 ) ) ),
			'steps' => array( array( 'submit', 'ارسال پرونده به شرکت گاز', 'subscriber', 36 ), array( 'gas_start', 'شروع بررسی', 'gas', 35 ), array( 'gas_forward', 'تأیید و ارسال به بیمه‌گر', 'gas', 31 ), array( 'ins_start', 'پذیرش و شروع ارزیابی', 'insurer', 29 ), array( 'ins_assess', 'ثبت ارزیابی و اعلام مبلغ به مشترک', 'insurer', 12 ), array( 'accept', 'قبول مبلغ و درخواست پرداخت', 'subscriber', 9 ), array( 'fin_review', 'بررسی مالی و استعلام شبا انجام شد', 'insurer', 6 ), array( 'fin_voucher', 'حواله پرداخت صادر شد', 'insurer', 2, 'حواله H-1405-000007' ) ),
			'extra' => array( 'submitCount' => 1, 'acceptedAt' => self::iso( 9 ) ),
		) );
		$c7['assessment'] = array( 'adjuster' => 'مهندس نادر شریفی', 'visitDate' => self::jal( 25 ), 'note' => 'سقف کاذب با استهلاک ۱۵٪ محاسبه شد.', 'at' => self::iso( 12 ),
			'items' => array( array( 'category' => 'property', 'title' => 'پکیج و لوله‌کشی', 'claimed' => 210000000, 'approved' => 195000000 ), array( 'category' => 'property', 'title' => 'کابینت و سقف کاذب', 'claimed' => 260000000, 'approved' => 221000000 ) ) );
		$c7['finance']    = array(
			'stage'   => 'voucher',
			'review'  => array( 'reviewer' => 'واحد مالی بیمه‌گر', 'shebaMatch' => true, 'note' => 'شبا با کد ملی ذی‌نفع تطبیق داده شد.', 'at' => self::iso( 6 ), 'by' => $ins ),
			'voucher' => array( 'voucherNo' => 'H-1405-000007', 'date' => self::jal( 2 ), 'amount' => 374400000, 'at' => self::iso( 2 ), 'by' => $ins ),
		);
		$c7['payment']    = array( 'amount' => 374400000 );
		$c7 = GII_Store::save_claim( $c7 );

		GII_Store::notify( $users[6]->ID, null, "حواله پرداخت خسارت پرونده {$c7['code']} به شماره H-1405-000007 صادر شد.", $c7['id'] );
		GII_Store::notify( null, 'gas', "پرونده {$c4['code']} از سوی مشترک ارسال شد.", $c4['id'] );
		GII_Store::notify( $users[0]->ID, null, "برای پرونده {$c1['code']} نقص اعلام شد. لطفاً اصلاح و دوباره ارسال کنید.", $c1['id'] );
		GII_Store::notify( $users[1]->ID, null, "مبلغ خسارت پرونده {$c2['code']} تعیین شد. لطفاً بررسی و تأیید کنید.", $c2['id'] );
		GII_Store::notify( null, 'insurer', "پرونده {$c5['code']} از شرکت گاز دریافت شد.", $c5['id'] );
		GII_SMS::send( '09125556677', 'مشترک گرامی، پرونده خسارت گاز شما تشکیل شد. نام کاربری: 1067891234 — رمز موقت: ۱۲۳۴۵۶' );
		return $admin;
	}
}
