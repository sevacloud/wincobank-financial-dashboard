<?php
defined( 'ABSPATH' ) || exit;

class Wincobank_REST_Routes {

    private const NAMESPACE = 'wincobank/v1';

    public function init(): void {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }

    public function register_routes(): void {
        $auth = [ $this, 'check_permission' ];

        register_rest_route( self::NAMESPACE, '/balances', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_balances' ],
            'permission_callback' => $auth,
        ] );

        register_rest_route( self::NAMESPACE, '/monthly-summary', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_monthly_summary' ],
            'permission_callback' => $auth,
            'args'                => $this->date_range_args(),
        ] );

        register_rest_route( self::NAMESPACE, '/annual-statement', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_annual_statement' ],
            'permission_callback' => $auth,
            'args'                => $this->date_range_args(),
        ] );

        register_rest_route( self::NAMESPACE, '/projects', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_projects' ],
            'permission_callback' => $auth,
            'args'                => $this->date_range_args(),
        ] );

        register_rest_route( self::NAMESPACE, '/utilities', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_utilities' ],
            'permission_callback' => $auth,
            'args'                => $this->date_range_args(),
        ] );

        register_rest_route( self::NAMESPACE, '/year-comparison', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_year_comparison' ],
            'permission_callback' => $auth,
            'args'                => [
                'years' => [
                    'required'          => true,
                    'validate_callback' => fn( $v ) => is_string( $v ) && preg_match( '/^\d{4}(,\d{4})*$/', $v ),
                ],
            ],
        ] );

        // Cache-bust endpoint (admin only).
        register_rest_route( self::NAMESPACE, '/flush-cache', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'flush_cache' ],
            'permission_callback' => fn() => current_user_can( 'manage_options' ),
        ] );
    }

    // -----------------------------------------------------------------
    // Callbacks
    // -----------------------------------------------------------------

    public function get_balances(): WP_REST_Response|WP_Error {
        $api     = new Wincobank_QuickFile_API();
        $results = $api->get_account_balances();

        if ( is_wp_error( $results ) ) {
            return $results;
        }

        // Unwrap per-account envelopes: merge balance data to top level so the
        // React client can read fields (e.g. CurrentBalance) directly.
        // Accounts that errored carry a _error field instead.
        $response = [];
        foreach ( $results as $label => $envelope ) {
            $response[ $label ] = $envelope['error'] !== null
                ? [ '_error' => $envelope['error'] ]
                : array_merge( (array) $envelope['data'], [ '_cached' => $envelope['cached'] ] );
        }

        return new WP_REST_Response( $response );
    }

    public function get_monthly_summary( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new Wincobank_QuickFile_API();
        $account_ids    = [
            'trust'   => (int) get_option( 'wincobank_account_trust',   1347970 ),
            'chapel'  => (int) get_option( 'wincobank_account_chapel',  1347971 ),
            'natwest' => (int) get_option( 'wincobank_account_natwest', 1347978 ),
        ];
        $result         = [];

        foreach ( $account_ids as $label => $id ) {
            $txns = $api->search_transactions( $id, $from, $to );
            if ( is_wp_error( $txns ) ) {
                // Surface the error per account; don't abort the whole response.
                $result[ $label ] = [ '_error' => $txns->get_error_message() ];
                continue;
            }
            $result[ $label ] = $this->aggregate_monthly( $txns );
        }

        return new WP_REST_Response( $result );
    }

    public function get_annual_statement( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new Wincobank_QuickFile_API();
        $data           = $api->get_chart_of_accounts( $from, $to );
        return is_wp_error( $data ) ? $data : new WP_REST_Response( $data );
    }

    public function get_projects( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new Wincobank_QuickFile_API();

        $tags = $api->get_project_tags();
        if ( is_wp_error( $tags ) ) {
            return $tags;
        }

        $result = [];
        foreach ( $tags as $tag ) {
            $tag_name = $tag['TagName'] ?? '';
            if ( $tag_name === '' ) {
                continue;
            }
            $invoices = $api->get_invoices_by_tag( $tag_name, $from, $to );
            if ( is_wp_error( $invoices ) ) {
                return $invoices;
            }
            $result[] = [
                'tag'      => $tag,
                'invoices' => $invoices,
                'total'    => array_sum( array_column( $invoices, 'TotalAmount' ) ),
            ];
        }

        return new WP_REST_Response( $result );
    }

    public function get_utilities( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new Wincobank_QuickFile_API();

        $utility_tags = [
            'Gas', 'Electricity', 'Water',
            'Broadband', 'Insurance', 'Alarm',
        ];

        $result = [];
        foreach ( $utility_tags as $tag ) {
            $invoices = $api->get_invoices_by_tag( $tag, $from, $to );
            if ( is_wp_error( $invoices ) ) {
                return $invoices;
            }
            $result[ $tag ] = $this->aggregate_monthly( $invoices );
        }

        return new WP_REST_Response( $result );
    }

    public function get_year_comparison( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        $years = array_map( 'intval', explode( ',', $req->get_param( 'years' ) ) );
        $api   = new Wincobank_QuickFile_API();
        $result = [];

        foreach ( $years as $year ) {
            $from = "{$year}-04-01";
            $to   = ( $year + 1 ) . '-03-31';
            $data = $api->get_chart_of_accounts( $from, $to );
            if ( is_wp_error( $data ) ) {
                return $data;
            }
            $result[ $year ] = $data;
        }

        return new WP_REST_Response( $result );
    }

    public function flush_cache(): WP_REST_Response {
        global $wpdb;
        $prefix  = $wpdb->esc_like( '_transient_' . Wincobank_QuickFile_API::CACHE_PREFIX ) . '%';
        $timeout = $wpdb->esc_like( '_transient_timeout_' . Wincobank_QuickFile_API::CACHE_PREFIX ) . '%';
        $wpdb->query( $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
            $prefix,
            $timeout
        ) );
        return new WP_REST_Response( [ 'flushed' => true ] );
    }

    // -----------------------------------------------------------------
    // Permission
    // -----------------------------------------------------------------

    public function check_permission(): bool {
        return Wincobank_Roles::current_user_is_trustee();
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private function date_range_args(): array {
        $date_validate = fn( $v ) => (bool) preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v );
        return [
            'from' => [ 'required' => true, 'validate_callback' => $date_validate ],
            'to'   => [ 'required' => true, 'validate_callback' => $date_validate ],
        ];
    }

    private function extract_dates( WP_REST_Request $req ): array {
        return [
            sanitize_text_field( $req->get_param( 'from' ) ),
            sanitize_text_field( $req->get_param( 'to' ) ),
        ];
    }

    private function aggregate_monthly( array $items ): array {
        $months = [];
        foreach ( $items as $item ) {
            $date  = $item['TransactionDate'] ?? $item['InvoiceDate'] ?? '';
            if ( $date === '' ) {
                continue;
            }
            $month  = substr( $date, 0, 7 ); // YYYY-MM
            $amount = (float) ( $item['Amount'] ?? $item['TotalAmount'] ?? 0 );
            $type   = $item['TransactionType'] ?? ( $amount >= 0 ? 'CREDIT' : 'DEBIT' );

            $months[ $month ] ??= [ 'income' => 0.0, 'expenditure' => 0.0 ];
            if ( strtoupper( $type ) === 'CREDIT' || $amount > 0 ) {
                $months[ $month ]['income'] += abs( $amount );
            } else {
                $months[ $month ]['expenditure'] += abs( $amount );
            }
        }
        ksort( $months );
        return $months;
    }
}
