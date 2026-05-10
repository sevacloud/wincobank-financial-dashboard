<?php
defined( 'ABSPATH' ) || exit;

class Wincobank_Admin_Settings {

    private const PAGE_SLUG    = 'quickfile-dashboard';
    private const OPTION_GROUP = 'wincobank_settings';

    public function init(): void {
        add_action( 'admin_menu', [ $this, 'add_menu_page' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
        add_action( 'admin_post_wincobank_flush_cache', [ $this, 'handle_flush_cache' ] );
        add_action( 'wp_ajax_wincobank_test_connection', [ $this, 'handle_test_connection' ] );
    }

    public function add_menu_page(): void {
        add_options_page(
            __( 'QuickFile Dashboard', 'wincobank-dashboard' ),
            __( 'QuickFile Dashboard', 'wincobank-dashboard' ),
            'manage_options',
            self::PAGE_SLUG,
            [ $this, 'render_page' ]
        );
    }

    public function register_settings(): void {
        $options = [
            'wincobank_business_name'     => 'sanitize_text_field',
            'wincobank_qf_endpoint'       => 'esc_url_raw',
            'wincobank_qf_account_number' => 'sanitize_text_field',
            'wincobank_qf_application_id' => 'sanitize_text_field',
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

        add_settings_section( 'wincobank_general', __( 'General', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );
        add_settings_section( 'wincobank_api', __( 'QuickFile API Credentials', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );
        add_settings_section( 'wincobank_accounts', __( 'Bank Account IDs', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );
        add_settings_section( 'wincobank_cache', __( 'Cache Settings', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );

        $this->add_field( 'wincobank_general', 'wincobank_business_name', __( 'Business Name', 'wincobank-dashboard' ), 'text', __( 'Displayed in the dashboard header and browser tab.', 'wincobank-dashboard' ) );

        $this->add_field( 'wincobank_api', 'wincobank_qf_endpoint', __( 'API Endpoint URL', 'wincobank-dashboard' ), 'url', __( 'Found in QuickFile → Settings → API Management. Leave blank for the default.', 'wincobank-dashboard' ) );
        $this->add_field( 'wincobank_api', 'wincobank_qf_account_number', __( 'QuickFile Account Number', 'wincobank-dashboard' ), 'text' );
        $this->add_field( 'wincobank_api', 'wincobank_qf_application_id', __( 'Application ID', 'wincobank-dashboard' ), 'text', __( 'The Application ID from QuickFile Settings → API Management.', 'wincobank-dashboard' ) );
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

    public function sanitize_api_key( $value ): string {
        $trimmed = trim( (string) $value );
        if ( $trimmed === '' ) {
            // Keep existing encrypted key.
            return (string) get_option( 'wincobank_qf_api_key_enc', '' );
        }
        $encrypted = Wincobank_QuickFile_Auth::encrypt_api_key( $trimmed );
        update_option( 'wincobank_qf_api_key_enc', $encrypted );
        return $encrypted;
    }

    public function handle_test_connection(): void {
        check_ajax_referer( 'wincobank_test_connection' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorised', 403 );
        }

        $auth = new Wincobank_QuickFile_Auth();
        if ( ! $auth->is_configured() ) {
            wp_send_json_error( 'Credentials not fully configured. Fill in all three API fields and save first.' );
        }

        $api    = new Wincobank_QuickFile_API();
        $result = $api->get_account_balances();

        if ( is_wp_error( $result ) ) {
            wp_send_json_error( $result->get_error_message() );
        }

        wp_send_json_success( $result );
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
            <h1><?php esc_html_e( 'QuickFile Dashboard Settings', 'wincobank-dashboard' ); ?></h1>

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
                    <span style="color:red;">&#10007; <?php esc_html_e( 'API credentials are not configured. Fill in Account Number, Application ID, and API Key above.', 'wincobank-dashboard' ); ?></span>
                <?php endif; ?>
            </p>
            <?php if ( $api_configured ) : ?>
            <p>
                <button type="button" id="wb-test-connection" class="button button-secondary">
                    <?php esc_html_e( 'Test Connection', 'wincobank-dashboard' ); ?>
                </button>
            </p>
            <div id="wb-test-result" style="margin-top:12px;padding:12px;background:#f6f7f7;border:1px solid #ddd;border-radius:4px;font-family:monospace;font-size:13px;white-space:pre-wrap;display:none;max-height:300px;overflow:auto;"></div>
            <script>
            document.getElementById('wb-test-connection').addEventListener('click', function() {
                var btn = this;
                var out = document.getElementById('wb-test-result');
                btn.disabled = true;
                btn.textContent = '<?php echo esc_js( __( 'Testing…', 'wincobank-dashboard' ) ); ?>';
                out.style.display = 'none';
                fetch(ajaxurl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        action: 'wincobank_test_connection',
                        _ajax_nonce: '<?php echo esc_js( wp_create_nonce( 'wincobank_test_connection' ) ); ?>'
                    })
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    out.style.display = 'block';
                    if (data.success) {
                        out.style.borderColor = '#00a32a';
                        out.style.background  = '#f0fff4';
                        out.textContent = '✓ Connection successful:\n\n' + JSON.stringify(data.data, null, 2);
                    } else {
                        out.style.borderColor = '#d63638';
                        out.style.background  = '#fff0f0';
                        out.textContent = '✗ ' + (data.data || 'Unknown error');
                    }
                })
                .catch(function(e) {
                    out.style.display  = 'block';
                    out.style.background = '#fff0f0';
                    out.textContent    = '✗ Request failed: ' + e.message;
                })
                .finally(function() {
                    btn.disabled = false;
                    btn.textContent = '<?php echo esc_js( __( 'Test Connection', 'wincobank-dashboard' ) ); ?>';
                });
            });
            </script>
            <?php endif; ?>

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
                $dashboard_url = home_url( '/wincobank-dashboard/' ); // URL slug is fixed; change via Permalinks if needed.
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
