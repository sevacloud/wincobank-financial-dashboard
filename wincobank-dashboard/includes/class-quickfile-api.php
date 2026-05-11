<?php
defined( 'ABSPATH' ) || exit;

/**
 * Read-only QuickFile API service.
 *
 * All five endpoints used by the dashboard are covered here:
 *   Bank_GetAccountBalances, Bank_Search, Report_ChartOfAccounts,
 *   Project_TagSearch, Invoice_Search.
 *
 * Every response is cached with WordPress transients (default 15 min).
 * No data is ever written back to QuickFile.
 * Credentials live only in PHP memory — they are never returned to the client.
 */
class Wincobank_QuickFile_API {

    // QuickFile REST API base URL — configurable via Settings → QuickFile Dashboard.
    private const DEFAULT_ENDPOINT = 'https://api.quickfile.co.uk/1_2/';

    // Transient key prefix — used by the cache-flush routine.
    public const CACHE_PREFIX = 'wincobank_qf_';

    // wp_remote_post timeout in seconds.
    private const HTTP_TIMEOUT = 30;

    // How many times to retry a failed HTTP request before giving up.
    private const MAX_RETRIES = 1;

    private Wincobank_QuickFile_Auth $auth;
    private int $cache_ttl;

    public function __construct() {
        $this->auth      = new Wincobank_QuickFile_Auth();
        $this->cache_ttl = max( 60, (int) get_option( 'wincobank_cache_duration', 900 ) );
    }

    // =========================================================================
    // Public API methods
    // =========================================================================

    /**
     * Bank_GetAccountBalances
     *
     * Returns live balances for all three configured accounts.
     * Each account is fetched and cached independently so a single failing
     * account does not prevent the others from being returned.
     *
     * @return array{
     *   trust:   array{ data: array, cached: bool, error: string|null },
     *   chapel:  array{ data: array, cached: bool, error: string|null },
     *   natwest: array{ data: array, cached: bool, error: string|null }
     * }|WP_Error  WP_Error only if credentials are not configured.
     */
    public function get_account_balances(): array|WP_Error {
        $guard = $this->credentials_guard();
        if ( is_wp_error( $guard ) ) {
            return $guard;
        }

        $nominal_codes = $this->account_nominal_codes();
        $cache_key     = self::CACHE_PREFIX . 'balances_' . md5( implode( '|', $nominal_codes ) );
        $cached        = get_transient( $cache_key );

        if ( $cached !== false ) {
            return array_map( fn( $d ) => $this->ok( $d, true ), $cached );
        }

        $payload = $this->build_payload( 'Bank', 'GetAccountBalances', [
            'NominalCodes' => [
                'NominalCode' => array_values( $nominal_codes ),
            ],
        ] );

        $raw = $this->post( 'Bank', 'GetAccountBalances', $payload );

        if ( is_wp_error( $raw ) ) {
            $this->log_error( 'Bank_GetAccountBalances', 'all accounts', $raw );
            $err = $raw->get_error_message();
            return array_map( fn( $_ ) => $this->err( $err ), $nominal_codes );
        }

        // Parse response — root key varies (Bank_GetAccountBalances or _Response suffix).
        $root         = array_key_first( $raw );
        $accounts_raw = $raw[ $root ]['Body']['BankAccounts']['BankAccount']
                     ?? $raw[ $root ]['Body']['BankAccounts']
                     ?? [];
        $accounts     = $this->normalise_list( $accounts_raw, 'NominalCode' );

        // Index by NominalCode so we can map back to our labels.
        $by_code = [];
        foreach ( $accounts as $account ) {
            $by_code[ (string) ( $account['NominalCode'] ?? '' ) ] = $account;
        }

        $results = [];
        foreach ( $nominal_codes as $label => $code ) {
            $data             = $by_code[ $code ] ?? [];
            $results[ $label ] = $this->ok( $data );
        }

        set_transient( $cache_key, array_map( fn( $r ) => $r['data'], $results ), $this->cache_ttl );
        return $results;
    }

    /**
     * Bank_Search
     *
     * Returns all transactions for a single bank account within a date range.
     * QuickFile wraps a single transaction result as an object rather than a
     * one-element array; this method always returns a numerically indexed array.
     *
     * @param  int    $bank_id     QuickFile bank account ID.
     * @param  string $from        Start date (YYYY-MM-DD).
     * @param  string $to          End date (YYYY-MM-DD).
     * @param  int    $max_results Cap on records returned per call (max 500).
     * @return array|WP_Error
     */
    public function search_transactions(
        int    $bank_id,
        string $from,
        string $to,
        int    $max_results = 500
    ): array|WP_Error {
        $guard = $this->credentials_guard();
        if ( is_wp_error( $guard ) ) {
            return $guard;
        }

        $cache_key = self::CACHE_PREFIX . 'txn_' . md5( "{$bank_id}|{$from}|{$to}|{$max_results}" );
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Bank', 'Search', [
            'SearchParameters' => [
                'BankID'     => (string) $bank_id,
                'FromDate'   => $from,
                'ToDate'     => $to,
                'MaxResults' => $max_results,
            ],
        ] );

        $raw = $this->post( 'Bank', 'Search', $payload );
        if ( is_wp_error( $raw ) ) {
            $this->log_error( 'Bank_Search', "account {$bank_id}", $raw );
            return $raw;
        }

        $transactions = $this->normalise_list(
            $raw['Bank_Search_Response']['Transactions']['Transaction'] ?? [],
            'TransactionID'
        );

        set_transient( $cache_key, $transactions, $this->cache_ttl );
        return $transactions;
    }

    /**
     * Report_ChartOfAccounts
     *
     * Returns income and expenditure grouped by nominal code for a date range.
     * The response is structured as:
     *   [ 'NominalAccount' => [ [...], [...], ... ] ]
     *
     * @param  string $from  Start date (YYYY-MM-DD).
     * @param  string $to    End date (YYYY-MM-DD).
     * @return array|WP_Error
     */
    public function get_chart_of_accounts( string $from, string $to, int $bank_id = 0 ): array|WP_Error {
        $guard = $this->credentials_guard();
        if ( is_wp_error( $guard ) ) {
            return $guard;
        }

        $cache_key = self::CACHE_PREFIX . 'coa_' . md5( "{$from}|{$to}|{$bank_id}" );
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $params = [ 'FromDate' => $from, 'ToDate' => $to ];
        if ( $bank_id > 0 ) {
            $params['BankAccountID'] = (string) $bank_id;
        }

        $payload = $this->build_payload( 'Report', 'ChartOfAccounts', [
            'Parameters' => $params,
        ] );

        $raw = $this->post( 'Report', 'ChartOfAccounts', $payload );
        if ( is_wp_error( $raw ) ) {
            $this->log_error( 'Report_ChartOfAccounts', "{$from} to {$to}", $raw );
            return $raw;
        }

        $nominal_accounts = $raw['Report_ChartOfAccounts_Response']['NominalAccounts'] ?? [];

        // Ensure NominalAccount is always a list, not a single-item object.
        if ( isset( $nominal_accounts['NominalAccount'] ) ) {
            $nominal_accounts['NominalAccount'] = $this->normalise_list(
                $nominal_accounts['NominalAccount'],
                'NominalCode'
            );
        }

        set_transient( $cache_key, $nominal_accounts, $this->cache_ttl );
        return $nominal_accounts;
    }

    /**
     * Project_TagSearch
     *
     * Retrieves all project tags defined in QuickFile.
     *
     * @return array|WP_Error  Flat list of tag objects.
     */
    public function get_project_tags(): array|WP_Error {
        $guard = $this->credentials_guard();
        if ( is_wp_error( $guard ) ) {
            return $guard;
        }

        $cache_key = self::CACHE_PREFIX . 'project_tags';
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Project', 'TagSearch', [
            'SearchParameters' => [ 'ReturnCount' => 200 ],
        ] );

        $raw = $this->post( 'Project', 'TagSearch', $payload );
        if ( is_wp_error( $raw ) ) {
            $this->log_error( 'Project_TagSearch', 'all tags', $raw );
            return $raw;
        }

        $tags = $this->normalise_list(
            $raw['Project_TagSearch_Response']['Tags']['Tag'] ?? [],
            'TagID'
        );

        set_transient( $cache_key, $tags, $this->cache_ttl );
        return $tags;
    }

    /**
     * Invoice_Search (filtered by project tag)
     *
     * Returns all purchase invoices tagged with a given project tag name
     * within a date range. Handles pagination automatically when the result
     * set exceeds $page_size.
     *
     * @param  string $tag_name  QuickFile project tag name.
     * @param  string $from      Start date (YYYY-MM-DD).
     * @param  string $to        End date (YYYY-MM-DD).
     * @param  int    $page_size Records per page (max 200 per QuickFile limit).
     * @return array|WP_Error    Flat list of invoice objects.
     */
    public function get_invoices_by_tag(
        string $tag_name,
        string $from,
        string $to,
        int    $page_size = 200
    ): array|WP_Error {
        $guard = $this->credentials_guard();
        if ( is_wp_error( $guard ) ) {
            return $guard;
        }

        $cache_key = self::CACHE_PREFIX . 'inv_' . md5( "{$tag_name}|{$from}|{$to}" );
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $all_invoices = [];
        $offset       = 0;

        do {
            $payload = $this->build_payload( 'Invoice', 'Search', [
                'SearchParameters' => [
                    'TagName'     => $tag_name,
                    'FromDate'    => $from,
                    'ToDate'      => $to,
                    'InvoiceType' => 'PURCHASE',
                    'ReturnCount' => $page_size,
                    'Offset'      => $offset,
                ],
            ] );

            $raw = $this->post( 'Invoice', 'Search', $payload );
            if ( is_wp_error( $raw ) ) {
                $this->log_error( 'Invoice_Search', "tag={$tag_name}", $raw );
                // Return what we have so far, or propagate the error on first page.
                if ( $offset === 0 ) {
                    return $raw;
                }
                break;
            }

            $page = $this->normalise_list(
                $raw['Invoice_Search_Response']['Invoices']['Invoice'] ?? [],
                'InvoiceID'
            );

            $all_invoices = array_merge( $all_invoices, $page );
            $offset      += count( $page );

            // Stop paginating when a partial page is returned (no more records).
        } while ( count( $page ) === $page_size );

        set_transient( $cache_key, $all_invoices, $this->cache_ttl );
        return $all_invoices;
    }

    // =========================================================================
    // Request builder
    // =========================================================================

    /**
     * Assemble the full JSON payload for a QuickFile API call.
     *
     * The method name is encoded in the URL (Module/Verb), so Body contains
     * only the method-specific parameters. Authentication credentials are
     * nested inside Header.Authentication as required by the v1.2 schema.
     */
    private function build_payload( string $module, string $verb, array $body ): array {
        $submission = $this->auth->make_submission_number();

        return [
            'payload' => [
                'Header' => [
                    'MessageType'      => 'Request',
                    'SubmissionNumber' => $submission,
                    'Authentication'   => $this->auth->get_auth_node( $submission ),
                ],
                'Body' => $body,
            ],
        ];
    }

    // =========================================================================
    // HTTP layer
    // =========================================================================

    /**
     * POST JSON to a QuickFile module endpoint with automatic retry on
     * transient network failures. Validates the HTTP status code and
     * QuickFile's own error envelope before returning the parsed body.
     *
     * @param  string $module  Pascal-case module name, e.g. 'Bank', 'Report'.
     * @param  string $verb    Pascal-case verb, e.g. 'GetAccountBalances'.
     * @param  array  $payload Request body (will be JSON-encoded).
     * @return array|WP_Error  Decoded response body, or a descriptive WP_Error.
     */
    private function post( string $module, string $verb, array $payload ): array|WP_Error {
        $base        = rtrim( (string) get_option( 'wincobank_qf_endpoint', self::DEFAULT_ENDPOINT ), '/' ) . '/';
        $method_name = "{$module}_{$verb}";
        $url         = $base . $module . '/' . $verb;
        $args = [
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ],
            'body'    => wp_json_encode( $payload ),
            'timeout' => self::HTTP_TIMEOUT,
        ];

        $response = null;
        $attempts  = 0;

        do {
            $response = wp_remote_post( $url, $args );
            $attempts++;
            $retry = is_wp_error( $response ) && $attempts <= self::MAX_RETRIES;
        } while ( $retry );

        $http_code    = is_wp_error( $response ) ? 0 : wp_remote_retrieve_response_code( $response );
        $raw_body     = is_wp_error( $response ) ? $response->get_error_message() : wp_remote_retrieve_body( $response );
        $decoded_body = json_decode( $raw_body, true );

        $this->append_log( $method_name, $url, $http_code, $raw_body );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'quickfile_network_error',
                sprintf( 'Network error (%s): %s', $module, $response->get_error_message() )
            );
        }

        if ( $http_code !== 200 ) {
            $detail = is_array( $decoded_body )
                ? ' — ' . wp_json_encode( $decoded_body )
                : ( $raw_body !== '' ? ' — ' . substr( $raw_body, 0, 300 ) : '' );
            return new WP_Error(
                'quickfile_http_error',
                sprintf( 'QuickFile HTTP %d (%s)%s', $http_code, strtoupper( $module ), $detail )
            );
        }

        if ( ! is_array( $decoded_body ) ) {
            return new WP_Error(
                'quickfile_parse_error',
                "Unparseable response from QuickFile ({$module}): " . substr( $raw_body, 0, 300 )
            );
        }

        return $this->check_api_errors( $decoded_body, $module );
    }

    /**
     * Inspect the QuickFile response Header for API-level errors and return a
     * descriptive WP_Error if any are present, otherwise pass the body through.
     */
    private function check_api_errors( array $body, string $module ): array|WP_Error {
        $root_key = array_key_first( $body );
        if ( $root_key === null ) {
            return new WP_Error( 'quickfile_empty_response', "Empty response body from QuickFile ({$module})." );
        }

        $header = $body[ $root_key ]['Header'] ?? [];
        $status = strtoupper( $header['ResponseStatus'] ?? '' );

        // 'OK' or absent status → success.
        if ( $status === '' || $status === 'OK' || $status === 'SUCCESS' ) {
            return $body;
        }

        // Gather all error messages from the Errors node.
        $errors_node = $header['Errors']['Error'] ?? null;
        if ( $errors_node === null ) {
            return new WP_Error(
                'quickfile_api_error',
                "QuickFile reported an error (status: {$status}) for {$module}."
            );
        }

        // QuickFile returns a single error as an object, multiple as an array.
        if ( isset( $errors_node['Message'] ) ) {
            $errors_node = [ $errors_node ];
        }

        $messages = array_filter( array_map( fn( $e ) => $e['Message'] ?? '', $errors_node ) );
        return new WP_Error(
            'quickfile_api_error',
            implode( ' | ', $messages ) ?: "Unknown QuickFile error ({$module})."
        );
    }

    // =========================================================================
    // Diagnostics
    // =========================================================================

    public function diagnostic_request(): array {
        $nominal_codes = $this->account_nominal_codes();

        $payload = $this->build_payload( 'Bank', 'GetAccountBalances', [
            'NominalCodes' => [
                'NominalCode' => array_values( $nominal_codes ),
            ],
        ] );

        $base = rtrim( (string) get_option( 'wincobank_qf_endpoint', self::DEFAULT_ENDPOINT ), '/' ) . '/';
        $url  = $base . 'Bank/GetAccountBalances';

        $safe_payload = $payload;
        if ( isset( $safe_payload['payload']['Header']['Authentication']['MD5Value'] ) ) {
            $safe_payload['payload']['Header']['Authentication']['MD5Value'] = '*** masked ***';
        }

        $args     = [
            'headers' => [ 'Content-Type' => 'application/json', 'Accept' => 'application/json' ],
            'body'    => wp_json_encode( $payload ),
            'timeout' => self::HTTP_TIMEOUT,
        ];
        $response  = wp_remote_post( $url, $args );
        $http_code = is_wp_error( $response ) ? 0 : wp_remote_retrieve_response_code( $response );
        $raw_body  = is_wp_error( $response ) ? $response->get_error_message() : wp_remote_retrieve_body( $response );

        $this->append_log( 'Bank_GetAccountBalances', $url, $http_code, $raw_body );

        return [
            'url'           => $url,
            'request_body'  => $safe_payload,
            'http_code'     => $http_code,
            'response_body' => substr( $raw_body, 0, 1000 ),
        ];
    }

    public static function get_log(): array {
        return (array) json_decode( (string) get_option( 'wincobank_api_log', '[]' ), true );
    }

    public static function clear_log(): void {
        delete_option( 'wincobank_api_log' );
    }

    private function append_log( string $method, string $url, int $http_code, string $raw_body ): void {
        $log   = self::get_log();
        $log[] = [
            'time'      => current_time( 'Y-m-d H:i:s' ),
            'method'    => $method,
            'url'       => $url,
            'http_code' => $http_code,
            'response'  => substr( $raw_body, 0, 500 ),
        ];
        // Keep last 30 entries.
        if ( count( $log ) > 30 ) {
            $log = array_slice( $log, -30 );
        }
        update_option( 'wincobank_api_log', wp_json_encode( $log ), false );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Return a WP_Error immediately if credentials have not been configured,
     * preventing pointless HTTP calls and confusing error messages.
     */
    private function credentials_guard(): true|WP_Error {
        if ( ! $this->auth->is_configured() ) {
            return new WP_Error(
                'quickfile_not_configured',
                'QuickFile credentials are not configured. Visit Settings > Wincobank Dashboard.'
            );
        }
        return true;
    }

    /**
     * Normalise a QuickFile list node.
     *
     * QuickFile returns a single-item list as an associative array (object)
     * rather than a one-element indexed array. This method ensures the caller
     * always receives a numerically indexed list.
     *
     * @param  mixed  $raw        The value at the list node.
     * @param  string $id_field   A field name present only on list items (used
     *                            to detect the single-item case).
     * @return array              Always a numerically indexed list.
     */
    private function normalise_list( mixed $raw, string $id_field ): array {
        if ( ! is_array( $raw ) || empty( $raw ) ) {
            return [];
        }

        // If the id_field exists as a direct key, this is a single item.
        if ( array_key_exists( $id_field, $raw ) ) {
            return [ $raw ];
        }

        // Already a list.
        return array_values( $raw );
    }

    /**
     * Build a successful per-account result envelope.
     */
    private function ok( array $data, bool $cached = false ): array {
        return [ 'data' => $data, 'cached' => $cached, 'error' => null ];
    }

    /**
     * Build a per-account error envelope (used when partial results are
     * acceptable, e.g. one of three bank accounts fails to respond).
     */
    private function err( string $message ): array {
        return [ 'data' => [], 'cached' => false, 'error' => $message ];
    }

    /**
     * Write a structured error to the PHP error log (server-side only).
     * Nothing from this call reaches the client.
     */
    private function log_error( string $endpoint, string $context, WP_Error $error ): void {
        error_log( sprintf(
            '[Wincobank Dashboard] %s (%s) failed: [%s] %s',
            $endpoint,
            $context,
            $error->get_error_code(),
            $error->get_error_message()
        ) );
    }

    /**
     * Bank_GetAccounts
     *
     * Returns all bank accounts visible to this QuickFile account.
     * Used to populate the account selector in admin settings.
     *
     * @return array|WP_Error  Flat list of account objects.
     */
    public function get_bank_accounts(): array|WP_Error {
        $guard = $this->credentials_guard();
        if ( is_wp_error( $guard ) ) {
            return $guard;
        }

        $cache_key = self::CACHE_PREFIX . 'bank_accounts';
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Bank', 'GetAccounts', [
            'SearchParameters' => [
                'OrderResultsBy' => 'Position',
                'AccountTypes'   => [
                    'AccountType' => [ 'CURRENT', 'PETTY', 'BUILDINGSOC', 'LOAN', 'MERCHANT', 'EQUITY', 'CREDITCARD', 'RESERVE' ],
                ],
                'ShowHidden'             => 'false',
                'GetOpenBankingConsents' => 'false',
            ],
        ] );

        $raw = $this->post( 'Bank', 'GetAccounts', $payload );
        if ( is_wp_error( $raw ) ) {
            $this->log_error( 'Bank_GetAccounts', 'list', $raw );
            return $raw;
        }

        $root     = array_key_first( $raw );
        $accounts = $raw[ $root ]['Body']['BankAccounts'] ?? [];

        // Ensure flat list (QuickFile may return a single item as an object).
        if ( isset( $accounts['BankId'] ) ) {
            $accounts = [ $accounts ];
        } else {
            $accounts = array_values( $accounts );
        }

        set_transient( $cache_key, $accounts, $this->cache_ttl );
        return $accounts;
    }

    /**
     * Return nominal codes for all selected accounts, keyed by bankId string.
     */
    private function account_nominal_codes(): array {
        $raw  = (string) get_option( 'wincobank_selected_accounts', '[]' );
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
}
