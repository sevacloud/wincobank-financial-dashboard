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
        add_action( 'wp_ajax_wincobank_get_accounts',    [ $this, 'handle_get_accounts' ] );
        add_action( 'admin_post_wincobank_clear_log',   [ $this, 'handle_clear_log' ] );
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
            'wincobank_account_trust'     => [ $this, 'sanitize_account' ],
            'wincobank_account_chapel'    => [ $this, 'sanitize_account' ],
            'wincobank_account_natwest'   => [ $this, 'sanitize_account' ],
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
        add_settings_section( 'wincobank_accounts', __( 'Bank Accounts', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );
        add_settings_section( 'wincobank_cache', __( 'Cache Settings', 'wincobank-dashboard' ), '__return_false', self::PAGE_SLUG );

        $this->add_field( 'wincobank_general', 'wincobank_business_name', __( 'Business Name', 'wincobank-dashboard' ), 'text', __( 'Displayed in the dashboard header and browser tab.', 'wincobank-dashboard' ) );

        $this->add_field( 'wincobank_api', 'wincobank_qf_endpoint', __( 'API Base URL', 'wincobank-dashboard' ), 'url', __( 'Base URL only — the method name is appended automatically. Default: https://api.quickfile.co.uk/1_2/', 'wincobank-dashboard' ) );
        $this->add_field( 'wincobank_api', 'wincobank_qf_account_number', __( 'QuickFile Account Number', 'wincobank-dashboard' ), 'text' );
        $this->add_field( 'wincobank_api', 'wincobank_qf_application_id', __( 'Application ID', 'wincobank-dashboard' ), 'text', __( 'The Application ID from QuickFile Settings → API Management.', 'wincobank-dashboard' ) );
        $this->add_field( 'wincobank_api', 'wincobank_qf_api_key', __( 'API Key', 'wincobank-dashboard' ), 'password', __( 'Leave blank to keep current key.', 'wincobank-dashboard' ) );

        add_settings_field(
            'wincobank_accounts_picker',
            __( 'Account Mapping', 'wincobank-dashboard' ),
            [ $this, 'render_account_picker' ],
            self::PAGE_SLUG,
            'wincobank_accounts'
        );

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

    public function sanitize_account( $value ): string {
        $str  = trim( (string) $value );
        $data = json_decode( $str, true );
        if ( ! is_array( $data ) || empty( $data['nominalCode'] ) ) {
            return '';
        }
        return wp_json_encode( [
            'bankId'      => (int) ( $data['bankId']      ?? 0 ),
            'nominalCode' => (int) ( $data['nominalCode'] ?? 0 ),
            'name'        => sanitize_text_field( $data['name'] ?? '' ),
        ] );
    }

    public function handle_get_accounts(): void {
        check_ajax_referer( 'wincobank_get_accounts' );
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorised', 403 );
        }
        $auth = new Wincobank_QuickFile_Auth();
        if ( ! $auth->is_configured() ) {
            wp_send_json_error( 'API credentials not configured. Save Account Number, Application ID, and API Key first.' );
        }
        $api      = new Wincobank_QuickFile_API();
        $accounts = $api->get_bank_accounts();
        if ( is_wp_error( $accounts ) ) {
            wp_send_json_error( $accounts->get_error_message() );
        }
        wp_send_json_success( $accounts );
    }

    public function render_account_picker(): void {
        $labels = [
            'trust'   => __( 'Trust Account', 'wincobank-dashboard' ),
            'chapel'  => __( 'Chapel House Account', 'wincobank-dashboard' ),
            'natwest' => __( 'Chapel Bank Account', 'wincobank-dashboard' ),
        ];

        foreach ( $labels as $key => $label ) {
            $current = (string) get_option( "wincobank_account_{$key}", '' );
            $current_data = json_decode( $current, true );
            $display = is_array( $current_data ) ? esc_html( $current_data['name'] ?? '' ) : '';
            printf(
                '<p style="margin-bottom:10px;"><strong>%s</strong><br>
                <select name="%s" id="%s" class="regular-text wb-account-select" style="max-width:360px;margin-top:4px;">
                    <option value="">— %s —</option>',
                esc_html( $label ),
                esc_attr( "wincobank_account_{$key}" ),
                esc_attr( "wincobank_account_{$key}" ),
                esc_html__( 'select after loading', 'wincobank-dashboard' )
            );
            // Render the currently-saved option so it's pre-selected even before JS runs.
            if ( $current !== '' ) {
                printf(
                    '<option value="%s" selected>%s</option>',
                    esc_attr( $current ),
                    esc_html( $display ?: $current )
                );
            }
            echo '</select></p>';
        }
        ?>
        <p>
            <button type="button" id="wb-load-accounts" class="button button-secondary">
                <?php esc_html_e( 'Load Accounts from QuickFile', 'wincobank-dashboard' ); ?>
            </button>
            <span id="wb-accounts-status" style="margin-left:10px;font-style:italic;color:#555;"></span>
        </p>
        <script>
        document.getElementById('wb-load-accounts').addEventListener('click', function() {
            var btn    = this;
            var status = document.getElementById('wb-accounts-status');
            btn.disabled = true;
            status.textContent = '<?php echo esc_js( __( 'Loading…', 'wincobank-dashboard' ) ); ?>';

            fetch(ajaxurl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    action: 'wincobank_get_accounts',
                    _ajax_nonce: '<?php echo esc_js( wp_create_nonce( 'wincobank_get_accounts' ) ); ?>'
                })
            })
            .then(function(r) { return r.json(); })
            .then(function(resp) {
                if ( ! resp.success ) {
                    status.style.color = '#d63638';
                    status.textContent = '✗ ' + ( resp.data || 'Unknown error' );
                    return;
                }
                var accounts = resp.data;
                var selects  = document.querySelectorAll('.wb-account-select');
                selects.forEach(function(sel) {
                    var currentVal = sel.value;
                    // Keep placeholder, remove old dynamic options.
                    while ( sel.options.length > 1 ) sel.remove(1);
                    accounts.forEach(function(acc) {
                        var val  = JSON.stringify({ bankId: acc.BankId, nominalCode: acc.NominalCode, name: acc.Name });
                        var text = acc.Name + ' (' + acc.BankType + ')';
                        var opt  = new Option(text, val);
                        // Re-select if the stored nominalCode matches.
                        try {
                            var cur = JSON.parse(currentVal);
                            if ( cur && cur.nominalCode == acc.NominalCode ) opt.selected = true;
                        } catch(e) {}
                        sel.appendChild(opt);
                    });
                });
                status.style.color = '#00a32a';
                status.textContent = '✓ <?php echo esc_js( __( 'Loaded. Select an account for each row, then Save Changes.', 'wincobank-dashboard' ) ); ?>';
            })
            .catch(function(e) {
                status.style.color = '#d63638';
                status.textContent = '✗ Request failed: ' + e.message;
            })
            .finally(function() { btn.disabled = false; });
        });
        </script>
        <?php
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

        $api  = new Wincobank_QuickFile_API();
        wp_send_json_success( $api->diagnostic_request() );
    }

    public function handle_clear_log(): void {
        check_admin_referer( 'wincobank_clear_log' );
        if ( current_user_can( 'manage_options' ) ) {
            Wincobank_QuickFile_API::clear_log();
        }
        wp_redirect( add_query_arg( [ 'page' => self::PAGE_SLUG ], admin_url( 'options-general.php' ) ) );
        exit;
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
            <hr>
            <h2>
                <label>
                    <input type="checkbox" id="wb-log-toggle" style="margin-right:6px;">
                    <?php esc_html_e( 'API Debug Log', 'wincobank-dashboard' ); ?>
                </label>
            </h2>
            <div id="wb-log-wrap" style="display:none;">
                <?php
                $log = Wincobank_QuickFile_API::get_log();
                if ( empty( $log ) ) :
                ?>
                    <p><em><?php esc_html_e( 'No log entries yet. Use Test Connection or load the dashboard to generate entries.', 'wincobank-dashboard' ); ?></em></p>
                <?php else : ?>
                    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin-bottom:12px;">
                        <?php wp_nonce_field( 'wincobank_clear_log' ); ?>
                        <input type="hidden" name="action" value="wincobank_clear_log">
                        <?php submit_button( __( 'Clear Log', 'wincobank-dashboard' ), 'secondary small', 'submit', false ); ?>
                    </form>
                    <table class="widefat striped" style="font-family:monospace;font-size:12px;">
                        <thead>
                            <tr>
                                <th><?php esc_html_e( 'Time', 'wincobank-dashboard' ); ?></th>
                                <th><?php esc_html_e( 'Method', 'wincobank-dashboard' ); ?></th>
                                <th><?php esc_html_e( 'URL', 'wincobank-dashboard' ); ?></th>
                                <th><?php esc_html_e( 'HTTP', 'wincobank-dashboard' ); ?></th>
                                <th><?php esc_html_e( 'Response', 'wincobank-dashboard' ); ?></th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ( array_reverse( $log ) as $entry ) : ?>
                            <tr>
                                <td style="white-space:nowrap;"><?php echo esc_html( $entry['time'] ?? '' ); ?></td>
                                <td style="white-space:nowrap;"><?php echo esc_html( $entry['method'] ?? '' ); ?></td>
                                <td style="word-break:break-all;"><?php echo esc_html( $entry['url'] ?? '' ); ?></td>
                                <td style="font-weight:bold;color:<?php echo ( ( $entry['http_code'] ?? 0 ) === 200 ) ? 'green' : 'red'; ?>">
                                    <?php echo esc_html( $entry['http_code'] ?? '' ); ?>
                                </td>
                                <td style="max-width:400px;overflow:hidden;word-break:break-all;">
                                    <?php echo esc_html( $entry['response'] ?? '' ); ?>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
            <script>
            document.getElementById('wb-log-toggle').addEventListener('change', function() {
                document.getElementById('wb-log-wrap').style.display = this.checked ? 'block' : 'none';
            });
            </script>
        </div>
        <?php
    }
}
