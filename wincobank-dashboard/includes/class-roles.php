<?php
defined( 'ABSPATH' ) || exit;

class Wincobank_Roles {

    public static function create_role(): void {
        if ( get_role( 'wincobank_trustee' ) ) {
            return;
        }
        add_role(
            'wincobank_trustee',
            __( 'Wincobank Trustee', 'wincobank-dashboard' ),
            [ 'read' => true ]
        );
    }

    public static function remove_role(): void {
        remove_role( 'wincobank_trustee' );
    }

    public static function current_user_is_trustee(): bool {
        if ( ! is_user_logged_in() ) {
            return false;
        }
        $user = wp_get_current_user();
        return in_array( 'wincobank_trustee', (array) $user->roles, true )
            || user_can( $user, 'manage_options' );
    }
}
