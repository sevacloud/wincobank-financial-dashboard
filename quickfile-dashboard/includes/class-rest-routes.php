<?php
defined( 'ABSPATH' ) || exit;

class QFD_REST {

    private const NAMESPACE = 'quickfile/v1';

    public function init(): void {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }

    public function register_routes(): void {
        $auth = [ $this, 'check_permission' ];

        register_rest_route( self::NAMESPACE, '/balances', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_balances' ],
            'permission_callback' => $auth,
            'args'                => $this->date_range_args_optional(),
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

        // Prior-year figures — per nominal code, admin-editable.
        register_rest_route( self::NAMESPACE, '/prior-year', [
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_prior_year' ],
                'permission_callback' => $auth,
                'args'                => [
                    'fy' => [
                        'required'          => true,
                        'validate_callback' => fn( $v ) => is_numeric( $v ) && (int) $v >= 2000,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'save_prior_year_figure' ],
                'permission_callback' => fn() => current_user_can( 'manage_options' ),
                'args'                => [
                    'fy'     => [
                        'required'          => true,
                        'sanitize_callback' => 'absint',
                    ],
                    'code'   => [
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'amount' => [
                        'required'          => true,
                        'sanitize_callback' => fn( $v ) => round( (float) $v, 2 ),
                    ],
                ],
            ],
        ] );

        // Project budgets — stored in wp_options, editable by trustees.
        register_rest_route( self::NAMESPACE, '/project-budgets', [
            [
                'methods'             => 'GET',
                'callback'            => [ $this, 'get_project_budgets' ],
                'permission_callback' => $auth,
            ],
            [
                'methods'             => 'POST',
                'callback'            => [ $this, 'save_project_budget' ],
                'permission_callback' => $auth,
                'args'                => [
                    'tag_id' => [
                        'required'          => true,
                        'validate_callback' => fn( $v ) => is_numeric( $v ) && (int) $v > 0,
                        'sanitize_callback' => 'absint',
                    ],
                    'budget' => [
                        'required'          => true,
                        'validate_callback' => fn( $v ) => is_numeric( $v ) && (float) $v >= 0,
                        'sanitize_callback' => fn( $v ) => round( (float) $v, 2 ),
                    ],
                ],
            ],
        ] );

        register_rest_route( self::NAMESPACE, '/transactions', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_transactions' ],
            'permission_callback' => $auth,
            'args'                => array_merge(
                $this->date_range_args(),
                [
                    'account' => [
                        'required'          => true,
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ]
            ),
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

    public function get_balances( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        $from = $req->get_param( 'from' );
        $to   = $req->get_param( 'to' );

        if ( ! $from || ! $to ) {
            $fy_month = max( 1, min( 12, (int) get_option( 'qfd_fy_start_month', 4 ) ) );
            $now_year  = (int) date( 'Y' );
            $now_month = (int) date( 'n' );
            $from = sprintf( '%04d-%02d-01', ( $now_month >= $fy_month ? $now_year : $now_year - 1 ), $fy_month );
            $to   = date( 'Y-m-d' );
        }

        $from = sanitize_text_field( $from );
        $to   = sanitize_text_field( $to );

        $api     = new QFD_API();
        $results = $api->get_account_balances( $from, $to );

        if ( is_wp_error( $results ) ) {
            return $results;
        }

        $nominal_codes = $this->selected_nominal_codes();
        $response      = [];

        foreach ( $results as $key => $envelope ) {
            if ( $envelope['error'] !== null ) {
                $response[ $key ] = [ '_error' => $envelope['error'] ];
                continue;
            }

            $data    = (array) $envelope['data'];
            $nominal = $nominal_codes[ $key ] ?? '';

            if ( $nominal !== '' ) {
                $opening = $api->compute_opening_balance( $nominal, $from );
                $data['_openingBalance'] = is_wp_error( $opening ) ? null : $opening;
            }

            $data['_cached']  = $envelope['cached'];
            $response[ $key ] = $data;
        }

        return new WP_REST_Response( $response );
    }

    public function get_monthly_summary( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new QFD_API();
        $result         = [];

        foreach ( $this->selected_nominal_codes() as $key => $nominal_code ) {
            $search = $api->search_transactions( $nominal_code, $from, $to );
            if ( is_wp_error( $search ) ) {
                $result[ $key ] = [ '_error' => $search->get_error_message() ];
                continue;
            }
            $result[ $key ] = $this->aggregate_monthly( $search['transactions'] ?? [] );
        }

        return new WP_REST_Response( $result );
    }

    public function get_annual_statement( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new QFD_API();

        // Combined (authoritative for nominal codes and names).
        $combined = $api->get_chart_of_accounts( $from, $to );
        if ( is_wp_error( $combined ) ) {
            return $combined;
        }

        $result = [ 'combined' => $combined ];
        foreach ( $this->selected_account_ids() as $key => $id ) {
            $data = $api->get_chart_of_accounts( $from, $to, $id );
            $result[ $key ] = is_wp_error( $data )
                ? [ '_error' => $data->get_error_message() ]
                : $data;
        }

        return new WP_REST_Response( $result );
    }

    public function get_transactions( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $account_key   = $req->get_param( 'account' );

        $codes        = $this->selected_nominal_codes();
        $nominal_code = $codes[ $account_key ] ?? '';

        if ( $nominal_code === '' ) {
            return new WP_Error( 'not_found', 'Account not configured.', [ 'status' => 404 ] );
        }

        $api    = new QFD_API();
        $search = $api->search_transactions( $nominal_code, $from, $to, 200 );

        if ( is_wp_error( $search ) ) {
            return $search;
        }

        return new WP_REST_Response( [
            'meta'         => $search['meta']         ?? [],
            'transactions' => $search['transactions'] ?? [],
        ] );
    }

    public function get_projects( WP_REST_Request $req ): WP_REST_Response|WP_Error {
        [ $from, $to ] = $this->extract_dates( $req );
        $api            = new QFD_API();

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
        $api            = new QFD_API();

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
        $api   = new QFD_API();
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

    public function get_prior_year( WP_REST_Request $req ): WP_REST_Response {
        $fy  = $req->get_param( 'fy' );
        $raw = (string) get_option( "qfd_prior_year_{$fy}", '{}' );
        $data = json_decode( $raw, true );
        return new WP_REST_Response( is_array( $data ) ? $data : [] );
    }

    public function save_prior_year_figure( WP_REST_Request $req ): WP_REST_Response {
        $fy     = $req->get_param( 'fy' );
        $code   = $req->get_param( 'code' );
        $amount = $req->get_param( 'amount' );
        $key    = "qfd_prior_year_{$fy}";
        $stored = json_decode( (string) get_option( $key, '{}' ), true );
        if ( ! is_array( $stored ) ) {
            $stored = [];
        }
        $stored[ $code ] = $amount;
        update_option( $key, wp_json_encode( $stored ), false );
        return new WP_REST_Response( [ 'saved' => true, 'fy' => $fy, 'code' => $code, 'amount' => $amount ] );
    }

    public function get_project_budgets(): WP_REST_Response {
        global $wpdb;
        $like = $wpdb->esc_like( 'qfd_budget_' ) . '%';
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s",
                $like
            )
        );
        $budgets = [];
        foreach ( $rows as $row ) {
            $tag_id             = substr( $row->option_name, strlen( 'qfd_budget_' ) );
            $budgets[ $tag_id ] = (float) $row->option_value;
        }
        return new WP_REST_Response( $budgets );
    }

    public function save_project_budget( WP_REST_Request $req ): WP_REST_Response {
        $tag_id = $req->get_param( 'tag_id' );
        $budget = $req->get_param( 'budget' );
        update_option( "qfd_budget_{$tag_id}", $budget, false );
        return new WP_REST_Response( [ 'saved' => true, 'tag_id' => $tag_id, 'budget' => $budget ] );
    }

    public function flush_cache(): WP_REST_Response {
        global $wpdb;
        $prefix  = $wpdb->esc_like( '_transient_' . QFD_API::CACHE_PREFIX ) . '%';
        $timeout = $wpdb->esc_like( '_transient_timeout_' . QFD_API::CACHE_PREFIX ) . '%';
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
        return QFD_Roles::current_user_is_trustee();
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private function selected_account_ids(): array {
        $raw  = (string) get_option( 'qfd_selected_accounts', '[]' );
        $list = json_decode( $raw, true );
        $ids  = [];
        if ( is_array( $list ) ) {
            foreach ( $list as $acc ) {
                $bank_id = (string) ( $acc['bankId'] ?? '' );
                if ( $bank_id !== '' ) {
                    $ids[ $bank_id ] = (int) $acc['bankId'];
                }
            }
        }
        return $ids;
    }

    private function selected_nominal_codes(): array {
        $raw  = (string) get_option( 'qfd_selected_accounts', '[]' );
        $list = json_decode( $raw, true );
        $codes = [];
        if ( is_array( $list ) ) {
            foreach ( $list as $acc ) {
                $bank_id = (string) ( $acc['bankId']      ?? '' );
                $nominal = (string) ( $acc['nominalCode'] ?? '' );
                if ( $bank_id !== '' && $nominal !== '' ) {
                    $codes[ $bank_id ] = $nominal;
                }
            }
        }
        return $codes;
    }

    private function date_range_args_optional(): array {
        $date_validate = fn( $v ) => (bool) preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v );
        return [
            'from' => [ 'required' => false, 'validate_callback' => $date_validate ],
            'to'   => [ 'required' => false, 'validate_callback' => $date_validate ],
        ];
    }

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
