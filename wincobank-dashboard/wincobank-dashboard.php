<?php
/**
 * Plugin Name: QuickFile Dashboard
 * Plugin URI:  https://wincobank.org.uk
 * Description: Read-only financial dashboard that connects to the QuickFile accounting API. Displays balances, transactions, projects, and annual statements.
 * Version:     1.0.1
 * Author:      Seva Cloud
 * License:     GPL-2.0-or-later
 * Text Domain: wincobank-dashboard
 */

defined( 'ABSPATH' ) || exit;

define( 'WINCOBANK_VERSION', '1.0.1' );
define( 'WINCOBANK_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WINCOBANK_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once WINCOBANK_PLUGIN_DIR . 'includes/class-roles.php';
require_once WINCOBANK_PLUGIN_DIR . 'includes/class-quickfile-auth.php';
require_once WINCOBANK_PLUGIN_DIR . 'includes/class-quickfile-api.php';
require_once WINCOBANK_PLUGIN_DIR . 'includes/class-rest-routes.php';
require_once WINCOBANK_PLUGIN_DIR . 'includes/class-admin-settings.php';
require_once WINCOBANK_PLUGIN_DIR . 'includes/class-login-page.php';
require_once WINCOBANK_PLUGIN_DIR . 'includes/class-dashboard-page.php';

register_activation_hook( __FILE__, [ 'Wincobank_Roles', 'create_role' ] );
register_deactivation_hook( __FILE__, [ 'Wincobank_Roles', 'remove_role' ] );

add_action( 'plugins_loaded', function () {
    ( new Wincobank_Admin_Settings() )->init();
    ( new Wincobank_REST_Routes() )->init();
    ( new Wincobank_Login_Page() )->init();
    ( new Wincobank_Dashboard_Page() )->init();
} );
