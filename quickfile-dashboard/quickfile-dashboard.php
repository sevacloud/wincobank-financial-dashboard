<?php
/**
 * Plugin Name: QuickFile Dashboard
 * Plugin URI:  https://github.com/sevacloud/wincobank-financial-dashboard
 * Description: Read-only financial dashboard that connects to the QuickFile accounting API. Displays balances, transactions, projects, and annual statements.
 * Version:     1.0.1
 * Author:      Seva Cloud
 * License:     GPL-2.0-or-later
 * Text Domain: quickfile-dashboard
 */

defined( 'ABSPATH' ) || exit;

define( 'QFD_VERSION', '1.0.1' );
define( 'QFD_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'QFD_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once QFD_PLUGIN_DIR . 'includes/class-migrator.php';
require_once QFD_PLUGIN_DIR . 'includes/class-roles.php';
require_once QFD_PLUGIN_DIR . 'includes/class-quickfile-auth.php';
require_once QFD_PLUGIN_DIR . 'includes/class-quickfile-api.php';
require_once QFD_PLUGIN_DIR . 'includes/class-rest-routes.php';
require_once QFD_PLUGIN_DIR . 'includes/class-admin-settings.php';
require_once QFD_PLUGIN_DIR . 'includes/class-login-page.php';
require_once QFD_PLUGIN_DIR . 'includes/class-dashboard-page.php';

register_activation_hook( __FILE__, [ 'QFD_Roles', 'create_role' ] );
register_deactivation_hook( __FILE__, [ 'QFD_Roles', 'remove_role' ] );

add_action( 'plugins_loaded', function () {
    QFD_Migrator::run();
    ( new QFD_Settings() )->init();
    ( new QFD_REST() )->init();
    ( new QFD_Login() )->init();
    ( new QFD_Dashboard() )->init();
} );
