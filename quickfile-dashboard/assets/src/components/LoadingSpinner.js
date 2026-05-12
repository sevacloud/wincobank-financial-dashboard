import { __ } from '@wordpress/i18n';

/**
 * Renders a dismissible warning banner listing any per-account API errors.
 * Pass `errors` as an array of { label, message } objects.
 */
export function ApiErrorBanner( { errors } ) {
    if ( ! errors || errors.length === 0 ) return null;
    return (
        <div className="wb-api-error-banner" role="alert">
            <strong>⚠ { __( 'Some data could not be loaded:', 'quickfile-dashboard' ) }</strong>
            <ul>
                { errors.map( ( e, i ) => (
                    <li key={ i }>
                        { e.label ? <strong>{ e.label }:</strong> : null } { e.message }
                    </li>
                ) ) }
            </ul>
        </div>
    );
}

export function LoadingSpinner() {
    return (
        <div className="wb-loading" role="status" aria-live="polite">
            <div className="wb-loading__spinner" aria-hidden="true" />
            <p>{ __( 'Loading…', 'quickfile-dashboard' ) }</p>
        </div>
    );
}

export function ErrorMessage( { message } ) {
    return (
        <div className="wb-error" role="alert">
            <strong>{ __( 'Error: ', 'quickfile-dashboard' ) }</strong>{ message }
        </div>
    );
}
