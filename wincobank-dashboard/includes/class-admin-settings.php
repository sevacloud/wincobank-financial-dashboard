<?php
defined( 'ABSPATH' ) || exit;

class Wincobank_Admin_Settings {

    private const PAGE_SLUG    = 'wincobank-dashboard';
    private const OPTION_GROUP = 'wincobank_settings';

    public function init(): void {
        add_action( 'admin_menu', [ $this, 'add_menu_page' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
        add_action( 'admin_post_wincobank_flush_cache', [ $this, 'handle_flush_cache' ] );
    }

    public function add_menu_page(): void {
        add_options_page(
            __( 'Wincobank Dashboard', 'wincobank-dashboard' ),
            __( 'Wincobank Dashboard', 'wincobank-dashboard' ),
            'manage_options',
            self::PAGE_SLUG,
            [ $this, 'render_page' ]
        );
    }

    public function register_settings(): void {
        $options = [
            'wincobank_qf_account_number' => 'sanitize_text_field',
            'wincobank_cache_duration'    => 'absint',
            'wincobank_account_trust'     => 'absint',
            'wincobank_account_chapel'    => 'absint',
            'wincobank_account_natwest'   => 'absint',
        ];

        foreach ( $options as $name => $sanitize ) {
            register_setting( self::OPTION_GROUP, $name, [ 'sanitize_callback' => $sanitize ] );
        }

        // API key handled separately (encrypted).
        register_setting( self::OPTION_GROUP, 'wincobank_qf_api_key', [
            'sanitize_callback' => [ $this, 'sanitize_api_key' ],
        ] );

        add_settings_section( 'wincobank_api', __( 'QuickFile API Credentials', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );
        add_settings_section( 'wincobank_accounts', __( 'Bank Account IDs', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );
        add_settings_section( 'wincobank_cache', __( 'Cache Settings', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );

        $this->add_field( 'wincobank_api', 'wincobank_qf_account_number', __( 'QuickFile Account Number', 'wincobank-dashboard' ), 'text' );
        $this->add_field( 'wincobank_api', 'wincobank_qf_api_key', __( 'API Key', 'wincobank-dashboard' ), 'password', __( 'Leave blank to keep current key.', 'wincobank-dashboard' ) );

        $this->add_field( 'wincobank_accounts', 'wincobank_account_trust', __( 'Trust Account ID (HSBC)', 'wincobank-dashboard' ), 'number' );
        $this->add_field( 'wincobank_accounts', 'wincobank_account_chapel', __( 'Chapel House Account ID (Lloyds)', 'wincobank-dashboard' ), 'number' );
        $this->add_field( 'wincobank_accounts', 'wincobank_account_natwest', __( 'Chapel Bank Account ID (Natwest)', 'wincobank-dashboard' ), 'number' );

        $this->add_field( 'wincobank_cache', 'wincobank_cache_duration', __( 'Cache Duration (seconds)', 'wincobank-dashboard' ), 'number', __( 'Default: 900 (15 minutes).', 'wincobank-dashboard' ) );
    }

    private function add_field( string $section, string $id, string $label, string $type, string $description = '' ): void {
        add_settings_field(
            $id,
            $label,
            function () use ( $id, $type, $description ) {
                $value = $type === 'password' ? '' : esc_attr( (string) get_option( $id, '' ) );
                printf(
                    '<input type="%s" name="%s" id="%s" value="%s" class="regular-text" autocomplete="off">',
                    esc_attr( $type ),
                    esc_attr( $id ),
                    esc_attr( $id ),
                    esc_attr( $value )
                );
                if ( $description ) {
                    echo '<p class="description">' . esc_html( $description ) . '</p>';
                }
            },
            self::PAGE_SLUG,
            $section
        );
    }

    public function sanitize_api_key( string $value ): string {
        $trimmed = trim( $value );
        if ( $trimmed === '' ) {
            // Keep existing encrypted key.
            return (string) get_option( 'wincobank_qf_api_key_enc', '' );
        }
        $encrypted = Wincobank_QuickFile_Auth::encrypt_api_key( $trimmed );
        update_option( 'wincobank_qf_api_key_enc', $encrypted );
        return $encrypted;
    }

    public function handle_flush_cache(): void {
        check_admin_referer( 'wincobank_flush_cache' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( __( 'Unauthorised', 'wincobank-dashboard' ) );
        }
        global $wpdb;
        $prefix  = $wpdb->esc_like( '_transient_' . Wincobank_QuickFile_API::CACHE_PREFIX ) . '%';
        $timeout = $wpdb->esc_like( '_transient_timeout_' . Wincobank_QuickFile_API::CACHE_PREFIX ) . '%';
        $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
            $prefix,
            $timeout
        ) );
        wp_redirect( add_query_arg( [ 'page' => self::PAGE_SLUG, 'cache_flushed' => '1' ], admin_url( 'options-general.php' ) ) );
        exit;
    }

    public function render_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }
        $api_configured = ( new Wincobank_QuickFile_Auth() )->is_configured();
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Wincobank Dashboard Settings', 'wincobank-dashboard' ); ?></h1>

            <?php if ( isset( $_GET['cache_flushed'] ) ) : ?>
                <div class="notice notice-success is-dismissible"><p><?php esc_html_e( 'Cache cleared successfully.', 'wincobank-dashboard' ); ?></p></div>
            <?php endif; ?>

            <?php settings_errors( self::OPTION_GROUP ); ?>

            <form method="post" action="options.php">
                <?php
                settings_fields( self::OPTION_GROUP );
                do_settings_sections( self::PAGE_SLUG );
                submit_button();
                ?>
            </form>

            <hr>
            <h2><?php esc_html_e( 'API Status', 'wincobank-dashboard' ); ?></h2>
            <p>
                <?php if ( $api_configured ) : ?>
                    <span style="color:green;">&#10003; <?php esc_html_e( 'API credentials are configured.', 'wincobank-dashboard' ); ?></span>
                <?php else : ?>
                    <span style="color:red;">&#10007; <?php esc_html_e( 'API credentials are not configured.', 'wincobank-dashboard' ); ?></span>
                <?php endif; ?>
            </p>

            <h2><?php esc_html_e( 'Cache Management', 'wincobank-dashboard' ); ?></h2>
            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <?php wp_nonce_field( 'wincobank_flush_cache' ); ?>
                <input type="hidden" name="action" value="wincobank_flush_cache">
                <?php submit_button( __( 'Flush Cache Now', 'wincobank-dashboard' ), 'secondary' ); ?>
            </form>

            <hr>
            <h2><?php esc_html_e( 'Dashboard', 'wincobank-dashboard' ); ?></h2>
            <p>
                <?php
                $dashboard_url = home_url( '/wincobank-dashboard/' );
                printf(
                    '<a href="%s" class="button button-primary">%s</a>',
                    esc_url( $dashboard_url ),
                    esc_html__( 'Open Trustee Dashboard', 'wincobank-dashboard' )
                );
                ?>
            </p>
        </div>
        <?php
    }
}
