import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { fyStart, fyEnd } = window.wincobankData || {};

export default function DateRangeControl( { onFetch, loading } ) {
    const [ from, setFrom ] = useState( fyStart || '' );
    const [ to, setTo ]     = useState( fyEnd   || '' );

    const handleSubmit = ( e ) => {
        e.preventDefault();
        if ( from && to ) onFetch( from, to );
    };

    return (
        <form className="wb-controls" onSubmit={ handleSubmit } aria-label={ __( 'Date range selector', 'wincobank-dashboard' ) }>
            <label htmlFor="wb-from">{ __( 'From', 'wincobank-dashboard' ) }</label>
            <input
                id="wb-from"
                type="date"
                value={ from }
                onChange={ ( e ) => setFrom( e.target.value ) }
                required
            />
            <label htmlFor="wb-to">{ __( 'To', 'wincobank-dashboard' ) }</label>
            <input
                id="wb-to"
                type="date"
                value={ to }
                onChange={ ( e ) => setTo( e.target.value ) }
                required
            />
            <button type="submit" className="wb-btn" disabled={ loading }>
                { loading ? __( 'Loading…', 'wincobank-dashboard' ) : __( 'Load Data', 'wincobank-dashboard' ) }
            </button>
        </form>
    );
}
