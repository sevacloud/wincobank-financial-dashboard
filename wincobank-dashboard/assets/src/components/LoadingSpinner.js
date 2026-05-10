import { __ } from '@wordpress/i18n';

export function LoadingSpinner() {
    return (
        <div className="wb-loading" role="status" aria-live="polite">
            <div className="wb-loading__spinner" aria-hidden="true" />
            <p>{ __( 'Loading…', 'wincobank-dashboard' ) }</p>
        </div>
    );
}

export function ErrorMessage( { message } ) {
    return (
        <div className="wb-error" role="alert">
            <strong>{ __( 'Error: ', 'wincobank-dashboard' ) }</strong>{ message }
        </div>
    );
}
