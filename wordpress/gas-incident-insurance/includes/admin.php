<?php
/**
 * صفحه پیشخوان وردپرس: نشانی‌ها، تنظیم سامانه پیامک و حالت نمایشی.
 * تنظیمات بیمه‌نامه (سقف‌ها، فرانشیز، مهلت‌ها) و کاربران از داخل خود سامانه با حساب مدیر انجام می‌شود.
 */
defined( 'ABSPATH' ) || exit;

class GII_Admin {

	public static function init() {
		add_action( 'admin_menu', function () {
			add_menu_page( 'بیمه حوادث گاز', 'بیمه حوادث گاز', 'manage_options', 'gii', array( __CLASS__, 'page' ), 'dashicons-shield', 58 );
		} );
		add_action( 'admin_post_gii_sms', array( __CLASS__, 'save_sms' ) );
		add_action( 'admin_post_gii_demo_on', array( __CLASS__, 'demo_on' ) );
		add_action( 'admin_post_gii_demo_off', array( __CLASS__, 'demo_off' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( GII_FILE ), function ( $links ) {
			array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=gii' ) ) . '">تنظیمات</a>' );
			return $links;
		} );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'دسترسی ندارید.' );
		}
		check_admin_referer( $action );
	}
	private static function back( $msg ) {
		wp_safe_redirect( add_query_arg( array( 'page' => 'gii', 'gii_msg' => rawurlencode( $msg ) ), admin_url( 'admin.php' ) ) );
		exit;
	}

	public static function save_sms() {
		self::guard( 'gii_sms' );
		$p = wp_unslash( $_POST );
		GII_Store::update_settings( array(
			'sms_provider' => isset( GII_SMS::PROVIDERS[ $p['sms_provider'] ?? '' ] ) ? $p['sms_provider'] : 'log',
			'sms_key'      => sanitize_text_field( $p['sms_key'] ?? '' ),
			'sms_sender'   => sanitize_text_field( $p['sms_sender'] ?? '' ),
			'sms_user'     => sanitize_text_field( $p['sms_user'] ?? '' ),
			'sms_pass'     => sanitize_text_field( $p['sms_pass'] ?? '' ),
		) );
		self::back( 'تنظیمات پیامک ذخیره شد.' );
	}
	public static function demo_on() {
		self::guard( 'gii_demo_on' );
		GII_Store::update_settings( array( 'demo' => true ) );
		GII_Seed::reset( get_current_user_id() );
		self::back( 'حالت نمایشی روشن شد و داده‌های نمونه ساخته شد.' );
	}
	public static function demo_off() {
		self::guard( 'gii_demo_off' );
		GII_Seed::wipe( get_current_user_id() );
		GII_Store::update_settings( array( 'demo' => false ) );
		self::back( 'داده‌های نمونه پاک و حالت نمایشی خاموش شد.' );
	}

	public static function page() {
		$s    = GII_Store::settings();
		$msg  = isset( $_GET['gii_msg'] ) ? sanitize_text_field( wp_unslash( $_GET['gii_msg'] ) ) : '';
		$form = function ( $action, $label, $class = 'button', $confirm = '' ) {
			echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" style="display:inline-block;margin-left:8px"' . ( $confirm ? ' onsubmit="return confirm(\'' . esc_js( $confirm ) . '\')"' : '' ) . '>';
			wp_nonce_field( $action );
			echo '<input type="hidden" name="action" value="' . esc_attr( $action ) . '"><button class="' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
		};
		?>
		<div class="wrap" dir="rtl">
			<h1>بیمه حوادث مشترکین گاز</h1>
			<?php if ( $msg ) : ?><div class="notice notice-success"><p><?php echo esc_html( $msg ); ?></p></div><?php endif; ?>

			<h2>نشانی‌ها</h2>
			<table class="form-table"><tbody>
				<tr><th>سایت (کامپیوتر و همه مرورگرها)</th><td><a href="<?php echo esc_url( GII_Plugin::page_url( 'site' ) ); ?>" target="_blank"><?php echo esc_html( GII_Plugin::page_url( 'site' ) ); ?></a></td></tr>
				<tr><th>اپ موبایل (قابل نصب روی صفحه اصلی)</th><td><a href="<?php echo esc_url( GII_Plugin::page_url( 'app' ) ); ?>" target="_blank"><?php echo esc_html( GII_Plugin::page_url( 'app' ) ); ?></a></td></tr>
			</tbody></table>
			<p>کاربران سامانه (مشترک، کارشناس گاز، کارشناس بیمه‌گر، مدیر سامانه) فقط همین دو صفحه را می‌بینند و به پیشخوان وردپرس راه ندارند. مدیر وردپرس با همان حساب وردپرس وارد سامانه هم می‌شود و نقش «مدیر سامانه» را دارد.</p>

			<h2>سامانه پیامک</h2>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'gii_sms' ); ?><input type="hidden" name="action" value="gii_sms">
				<table class="form-table"><tbody>
					<tr><th><label for="gii-p">ارائه‌دهنده</label></th><td><select id="gii-p" name="sms_provider">
						<?php foreach ( GII_SMS::PROVIDERS as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $s['sms_provider'] ?? 'log', $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?>
					</select><p class="description">تا وقتی «فقط ثبت» انتخاب است، پیامکی ارسال نمی‌شود و متن پیامک‌ها در بخش «پیامک‌ها»ی مدیر سامانه دیده می‌شود.</p></td></tr>
					<tr><th><label for="gii-k">کلید API (کاوه‌نگار)</label></th><td><input id="gii-k" class="regular-text" dir="ltr" name="sms_key" value="<?php echo esc_attr( $s['sms_key'] ?? '' ); ?>"></td></tr>
					<tr><th><label for="gii-u">نام کاربری (ملی‌پیامک)</label></th><td><input id="gii-u" class="regular-text" dir="ltr" name="sms_user" value="<?php echo esc_attr( $s['sms_user'] ?? '' ); ?>"></td></tr>
					<tr><th><label for="gii-w">رمز (ملی‌پیامک)</label></th><td><input id="gii-w" type="password" class="regular-text" dir="ltr" name="sms_pass" value="<?php echo esc_attr( $s['sms_pass'] ?? '' ); ?>"></td></tr>
					<tr><th><label for="gii-s">شماره خط فرستنده</label></th><td><input id="gii-s" class="regular-text" dir="ltr" name="sms_sender" value="<?php echo esc_attr( $s['sms_sender'] ?? '' ); ?>"></td></tr>
				</tbody></table>
				<?php submit_button( 'ذخیره تنظیمات پیامک' ); ?>
			</form>

			<h2>حالت نمایشی</h2>
			<p>وضعیت: <strong><?php echo GII_Store::demo_on() ? 'روشن — دکمه‌های ورود سریع روی صفحه ورود دیده می‌شوند' : 'خاموش'; ?></strong></p>
			<p>روشن کردن حالت نمایشی <strong>همه پرونده‌ها، اعلان‌ها و کاربران سامانه</strong> را پاک و هفت پرونده نمونه با حساب‌های نمایشی می‌سازد. روی سامانه واقعی استفاده نکنید.</p>
			<p>
				<?php $form( 'gii_demo_on', GII_Store::demo_on() ? 'بازسازی داده‌های نمونه' : 'روشن کردن و ساخت داده نمونه', 'button button-primary', 'همه پرونده‌ها و کاربران سامانه پاک می‌شوند. ادامه می‌دهید؟' ); ?>
				<?php if ( GII_Store::demo_on() ) $form( 'gii_demo_off', 'پاک کردن داده نمونه و خاموش کردن', 'button', 'همه پرونده‌ها و کاربران سامانه پاک می‌شوند. ادامه می‌دهید؟' ); ?>
			</p>

			<h2>نکته امنیتی سرور</h2>
			<p>مدارک و عکس‌ها در پوشه‌ای با نام تصادفی زیر <code dir="ltr">wp-content/uploads/gii-private-…</code> نگه داشته می‌شوند و فقط از راه سامانه با بررسی دسترسی قابل دیدن‌اند. روی آپاچی فایل <code>.htaccess</code> خودکار ساخته می‌شود. روی nginx این را به پیکربندی سایت اضافه کنید:</p>
			<pre dir="ltr" style="background:#fff;padding:10px;display:inline-block">location ~ ^/wp-content/uploads/gii-private- { deny all; }</pre>
			<p>برای ارسال درست کوکی ورود، سایت را فقط با <strong>HTTPS</strong> راه‌اندازی کنید.</p>
		</div>
		<?php
	}
}
