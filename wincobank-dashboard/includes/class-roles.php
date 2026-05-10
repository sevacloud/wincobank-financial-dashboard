<?php
defined( 'ABSPATH' ) || exit;

class Wincobank_Roles {

    const ROLE_SLUG = 'wincobank_dashboard_access';

    public static function create_role(): void {
        if ( get_role( self::ROLE_SLUG ) ) {
            return;
        }
        add_role(
            self::ROLE_SLUG,
            __( 'Wincobank Dashboard Access', 'wincobank-dashboard' ),
            [ 'read' => true ]
        );
        // Grant the capability to existing admins so the dashboard is usable
        // immediately after activation without manual role assignment.
        $admin_role = get_role( 'administrator' );
        if ( $admin_role ) {
            $admin_role->add_cap( self::ROLE_SLUG );
        }
    }

    public static function remove_role(): void {
        $admin_role = get_role( 'administrator' );
        if ( $admin_role ) {
            $admin_role->remove_cap( self::ROLE_SLUG );
        }
        remove_role( self::ROLE_SLUG );
    }

    public static function current_user_is_trustee(): bool {
        if ( ! is_user_logged_in() ) {
            return false;
        }
        $user = wp_get_current_user();
        return $user->has_cap( self::ROLE_SLUG )
            || user_can( $user, 'manage_options' );
    }
}
