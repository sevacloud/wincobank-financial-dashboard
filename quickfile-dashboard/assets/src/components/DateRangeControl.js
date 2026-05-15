import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { fyStart, fyEnd } = window.qfdData || {};

export default function DateRangeControl( { onFetch, loading, defaultFrom, defaultTo } ) {
    const [ from, setFrom ] = useState( defaultFrom ?? fyStart ?? '' );
    const [ to,   setTo   ] = useState( defaultTo   ?? fyEnd   ?? '' );

    const handleSubmit = ( e ) => {
        e.preventDefault();
        if ( from && to ) onFetch( from, to );
    };

    return (
        <form className="wb-controls" onSubmit={ handleSubmit } aria-label={ __( 'Date range selector', 'quickfile-dashboard' ) }>
            <label htmlFor="wb-from">{ __( 'From', 'quickfile-dashboard' ) }</label>
            <input
                id="wb-from"
                type="date"
                value={ from }
                onChange={ ( e ) => setFrom( e.target.value ) }
                required
            />
            <label htmlFor="wb-to">{ __( 'To', 'quickfile-dashboard' ) }</label>
            <input
                id="wb-to"
                type="date"
                value={ to }
                onChange={ ( e ) => setTo( e.target.value ) }
                required
            />
            <button type="submit" className="wb-btn" disabled={ loading }>
                { loading ? __( 'Loading…', 'quickfile-dashboard' ) : __( 'Load Data', 'quickfile-dashboard' ) }
            </button>
        </form>
    );
}
