<?php
defined( 'ABSPATH' ) || exit;

/**
 * Read-only QuickFile API service.
 *
 * All responses are cached with WordPress transients (default 15 min).
 * No data is written back to QuickFile.
 */
class Wincobank_QuickFile_API {

    private const ENDPOINT = 'https://api.quickfile.co.uk/1_2/';

    private Wincobank_QuickFile_Auth $auth;
    private int $cache_seconds;

    public function __construct() {
        $this->auth          = new Wincobank_QuickFile_Auth();
        $this->cache_seconds = (int) get_option( 'wincobank_cache_duration', 900 );
    }

    // -----------------------------------------------------------------
    // Public API methods (one per QuickFile endpoint used)
    // -----------------------------------------------------------------

    /**
     * Bank_GetAccountBalances — live balances for all configured accounts.
     */
    public function get_account_balances(): array|WP_Error {
        $account_ids = $this->get_account_ids();
        $results     = [];

        foreach ( $account_ids as $label => $id ) {
            $cache_key = "wincobank_balance_{$id}";
            $cached    = get_transient( $cache_key );

            if ( $cached !== false ) {
                $results[ $label ] = $cached;
                continue;
            }

            $payload = $this->build_payload( 'Bank', 'GetAccountBalances', [
                'Bank' => [ 'BankAccountID' => $id ],
            ] );

            $response = $this->post( 'bank', $payload );
            if ( is_wp_error( $response ) ) {
                return $response;
            }

            $balance = $response['Bank_GetAccountBalances_Response']['AccountDetails'] ?? [];
            set_transient( $cache_key, $balance, $this->cache_seconds );
            $results[ $label ] = $balance;
        }

        return $results;
    }

    /**
     * Bank_Search — transactions for a given account and date range.
     */
    public function search_transactions( int $bank_id, string $from, string $to, int $max_results = 200 ): array|WP_Error {
        $cache_key = "wincobank_txn_{$bank_id}_{$from}_{$to}";
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Bank', 'Search', [
            'SearchParameters' => [
                'BankID'     => $bank_id,
                'FromDate'   => $from,
                'ToDate'     => $to,
                'MaxResults' => $max_results,
            ],
        ] );

        $response = $this->post( 'bank', $payload );
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $transactions = $response['Bank_Search_Response']['Transactions']['Transaction'] ?? [];
        // Normalise single-item response (QuickFile wraps single items as object, not array).
        if ( isset( $transactions['TransactionID'] ) ) {
            $transactions = [ $transactions ];
        }

        set_transient( $cache_key, $transactions, $this->cache_seconds );
        return $transactions;
    }

    /**
     * Report_ChartOfAccounts — income/expenditure grouped by nominal code.
     */
    public function get_chart_of_accounts( string $from, string $to ): array|WP_Error {
        $cache_key = "wincobank_coa_{$from}_{$to}";
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Report', 'ChartOfAccounts', [
            'Parameters' => [
                'FromDate' => $from,
                'ToDate'   => $to,
            ],
        ] );

        $response = $this->post( 'report', $payload );
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $data = $response['Report_ChartOfAccounts_Response']['NominalAccounts'] ?? [];
        set_transient( $cache_key, $data, $this->cache_seconds );
        return $data;
    }

    /**
     * Project_TagSearch — retrieve all project tags.
     */
    public function get_project_tags(): array|WP_Error {
        $cache_key = 'wincobank_project_tags';
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Project', 'TagSearch', [
            'SearchParameters' => [ 'ReturnCount' => 100 ],
        ] );

        $response = $this->post( 'project', $payload );
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $tags = $response['Project_TagSearch_Response']['Tags']['Tag'] ?? [];
        if ( isset( $tags['TagID'] ) ) {
            $tags = [ $tags ];
        }

        set_transient( $cache_key, $tags, $this->cache_seconds );
        return $tags;
    }

    /**
     * Invoice_Search filtered by TagName — spend per project.
     */
    public function get_invoices_by_tag( string $tag_name, string $from, string $to ): array|WP_Error {
        $cache_key = 'wincobank_inv_' . md5( $tag_name . $from . $to );
        $cached    = get_transient( $cache_key );
        if ( $cached !== false ) {
            return $cached;
        }

        $payload = $this->build_payload( 'Invoice', 'Search', [
            'SearchParameters' => [
                'TagName'  => $tag_name,
                'FromDate' => $from,
                'ToDate'   => $to,
                'InvoiceType' => 'PURCHASE',
                'ReturnCount' => 200,
            ],
        ] );

        $response = $this->post( 'invoice', $payload );
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $invoices = $response['Invoice_Search_Response']['Invoices']['Invoice'] ?? [];
        if ( isset( $invoices['InvoiceID'] ) ) {
            $invoices = [ $invoices ];
        }

        set_transient( $cache_key, $invoices, $this->cache_seconds );
        return $invoices;
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private function get_account_ids(): array {
        return [
            'trust'   => (int) get_option( 'wincobank_account_trust', 1347970 ),
            'chapel'  => (int) get_option( 'wincobank_account_chapel', 1347971 ),
            'natwest' => (int) get_option( 'wincobank_account_natwest', 1347978 ),
        ];
    }

    private function build_payload( string $module, string $verb, array $body ): array {
        $submission = $this->auth->make_submission_number();

        return [
            $module . '_' . $verb => array_merge(
                [ 'Header' => array_merge( $this->auth->get_auth_node( $submission ), [
                    'MessageType'      => 'REQUEST',
                    'SubmissionNumber' => $submission,
                ] ) ],
                $body
            ),
        ];
    }

    private function post( string $module, array $payload ): array|WP_Error {
        $url = self::ENDPOINT . $module;

        $response = wp_remote_post( $url, [
            'headers' => [ 'Content-Type' => 'application/json' ],
            'body'    => wp_json_encode( $payload ),
            'timeout' => 30,
        ] );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        if ( $code !== 200 ) {
            return new WP_Error(
                'quickfile_http_error',
                sprintf( 'QuickFile returned HTTP %d', $code )
            );
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        if ( ! is_array( $body ) ) {
            return new WP_Error( 'quickfile_parse_error', 'Could not parse QuickFile response.' );
        }

        // Check for QuickFile-level errors.
        $header_key = array_key_first( $body );
        $header     = $body[ $header_key ]['Header'] ?? [];
        if ( isset( $header['Errors']['Error'] ) ) {
            $msg = is_array( $header['Errors']['Error'] )
                ? implode( ' | ', array_column( $header['Errors']['Error'], 'Message' ) )
                : (string) $header['Errors']['Error']['Message'];
            return new WP_Error( 'quickfile_api_error', $msg );
        }

        return $body;
    }
}
