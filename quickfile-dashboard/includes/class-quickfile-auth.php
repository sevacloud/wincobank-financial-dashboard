<?php
defined( 'ABSPATH' ) || exit;

/**
 * Handles QuickFile API authentication.
 *
 * Credentials are stored encrypted in wp_options via WordPress's
 * get_option/update_option — never hardcoded or exposed client-side.
 */
class QFD_Auth {

    private string $account_number  = '';
    private string $api_key         = '';
    private string $application_id  = '';

    public function __construct() {
        $this->account_number = (string) get_option( 'qfd_account_number', '' );
        $this->api_key        = (string) $this->get_decrypted_api_key();
        $this->application_id = (string) get_option( 'qfd_application_id', '' );
    }

    /**
     * Build the authentication node required by every QuickFile request.
     */
    public function get_auth_node( string $submission_number ): array {
        $md5 = md5( $this->account_number . $this->api_key . $submission_number );

        return [
            'AccNumber'    => $this->account_number,
            'MD5Value'     => strtolower( $md5 ),
            'ApplicationID' => $this->application_id,
        ];
    }

    /**
     * Generate a unique submission number (epoch ms).
     */
    public function make_submission_number(): string {
        return wp_generate_uuid4();
    }

    public function is_configured(): bool {
        return $this->account_number !== '' && $this->api_key !== '' && $this->application_id !== '';
    }

    // -----------------------------------------------------------------
    // Credential storage helpers (AES-256-CBC via openssl)
    // -----------------------------------------------------------------

    public static function encrypt_api_key( string $plain ): string {
        $key = self::derive_key();
        $iv  = openssl_random_pseudo_bytes( 16 );
        $enc = openssl_encrypt( $plain, 'AES-256-CBC', $key, 0, $iv );
        return base64_encode( $iv . '::' . $enc );
    }

    private function get_decrypted_api_key(): string {
        $stored = (string) get_option( 'qfd_api_key_enc', '' );
        if ( $stored === '' ) {
            return '';
        }
        try {
            $decoded = base64_decode( $stored, true );
            if ( $decoded === false || strpos( $decoded, '::' ) === false ) {
                return '';
            }
            [ $iv, $enc ] = explode( '::', $decoded, 2 );
            $plain = openssl_decrypt( $enc, 'AES-256-CBC', self::derive_key(), 0, $iv );
            return $plain === false ? '' : $plain;
        } catch ( \Throwable $e ) {
            return '';
        }
    }

    private static function derive_key(): string {
        // Derive a 32-byte key from WordPress secret keys — never stored separately.
        return substr( hash( 'sha256', AUTH_KEY . SECURE_AUTH_KEY ), 0, 32 );
    }
}
