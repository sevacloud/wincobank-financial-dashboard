<?php
defined( 'ABSPATH' ) || exit;

/**
 * Registers the front-end dashboard page as a virtual WordPress page
 * using a rewrite rule — no page needs to be created in the admin backend.
 */
class Wincobank_Dashboard_Page {

    private const SLUG = 'wincobank-dashboard';

    public function init(): void {
        add_action( 'init', [ $this, 'add_rewrite_rule' ] );
        add_filter( 'query_vars', [ $this, 'add_query_var' ] );
        add_action( 'template_redirect', [ $this, 'intercept_request' ] );
        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_assets' ] );
    }

    public function add_rewrite_rule(): void {
        add_rewrite_rule(
            '^' . self::SLUG . '(/.*)?$',
            'index.php?wincobank_dashboard=1',
            'top'
        );
    }

    public function add_query_var( array $vars ): array {
        $vars[] = 'wincobank_dashboard';
        return $vars;
    }

    public function intercept_request(): void {
        if ( ! get_query_var( 'wincobank_dashboard' ) ) {
            return;
        }

        if ( ! Wincobank_Roles::current_user_is_trustee() ) {
            wp_redirect( wp_login_url( home_url( '/' . self::SLUG . '/' ) ) );
            exit;
        }

        $this->enqueue_assets();
        $this->render_shell();
        exit;
    }

    public function enqueue_assets(): void {
        if ( ! get_query_var( 'wincobank_dashboard' ) ) {
            return;
        }

        $asset_file = WINCOBANK_PLUGIN_DIR . 'assets/build/index.asset.php';
        $asset      = file_exists( $asset_file ) ? require $asset_file : [
            'dependencies' => [ 'wp-element', 'wp-api-fetch', 'wp-i18n' ],
            'version'      => WINCOBANK_VERSION,
        ];

        wp_enqueue_script(
            'wincobank-dashboard',
            WINCOBANK_PLUGIN_URL . 'assets/build/index.js',
            $asset['dependencies'],
            $asset['version'],
            true
        );

        wp_enqueue_style(
            'wincobank-dashboard',
            WINCOBANK_PLUGIN_URL . 'assets/build/index.css',
            [],
            $asset['version']
        );

        wp_localize_script( 'wincobank-dashboard', 'wincobankData', [
            'restUrl'      => esc_url_raw( rest_url( 'wincobank/v1' ) ),
            'nonce'        => wp_create_nonce( 'wp_rest' ),
            'currentYear'  => (int) date( 'Y' ),
            'fyStart'      => $this->current_fy_start(),
            'fyEnd'        => $this->current_fy_end(),
            'isAdmin'      => current_user_can( 'manage_options' ),
            'businessName' => sanitize_text_field( (string) get_option( 'wincobank_business_name', '' ) ),
        ] );
    }

    private function render_shell(): void {
        ?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title><?php
        $name = get_option( 'wincobank_business_name', '' );
        echo esc_html( $name ? $name . ' — Dashboard' : 'QuickFile Dashboard' );
    ?></title>
    <?php wp_head(); ?>
</head>
<body class="wincobank-dashboard-body">
    <div id="wincobank-dashboard-root"></div>
    <?php wp_footer(); ?>
</body>
</html><?php
    }

    private function current_fy_start(): string {
        $year  = (int) date( 'Y' );
        $month = (int) date( 'n' );
        return ( $month >= 4 ? $year : $year - 1 ) . '-04-01';
    }

    private function current_fy_end(): string {
        $year  = (int) date( 'Y' );
        $month = (int) date( 'n' );
        return ( $month >= 4 ? $year + 1 : $year ) . '-03-31';
    }
}
