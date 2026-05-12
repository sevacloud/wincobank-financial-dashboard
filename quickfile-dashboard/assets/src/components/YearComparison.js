import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { currentYear } = window.qfdData || {};

function formatCurrency( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

function fyLabel( year ) {
    return `${ year }/${ String( year + 1 ).slice( -2 ) }`;
}

export default function YearComparison() {
    const cur  = currentYear || new Date().getFullYear();
    const [ year1, setYear1 ] = useState( cur - 2 );
    const [ year2, setYear2 ] = useState( cur - 1 );
    const [ data,    setData    ] = useState( null );
    const [ loading, setLoading ] = useState( false );
    const [ error,   setError   ] = useState( null );

    const fetchData = () => {
        setLoading( true );
        setError( null );
        api.getYearComparison( [ year1, year2, cur ] )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    };

    const years = data ? Object.keys( data ).map( Number ).sort() : [];

    const getNominals = ( yearData ) => yearData?.NominalAccount ?? [];

    const allCodes = data
        ? [ ...new Set( years.flatMap( ( y ) => getNominals( data[ y ] ).map( ( n ) => n.NominalCode ) ) ) ].sort()
        : [];

    const getBalance = ( yearData, code ) => {
        const n = getNominals( yearData ).find( ( n ) => n.NominalCode === code );
        return parseFloat( n?.Balance ?? 0 );
    };

    const sectionRows = ( categoryType ) => allCodes.filter( ( code ) => {
        return years.some( ( y ) => {
            const n = getNominals( data[ y ] ).find( ( n ) => n.NominalCode === code );
            return n?.CategoryType === categoryType;
        } );
    } );

    const renderSection = ( label, rows ) => (
        <>
            <tr style={ { background: 'var(--navy)' } }>
                <td colSpan={ years.length + 1 } style={ { color: 'var(--white)', fontWeight: 700, padding: '8px 14px', fontSize: '.875rem', textTransform: 'uppercase' } }>
                    { label }
                </td>
            </tr>
            { rows.map( ( code ) => {
                const name = years.map( ( y ) => getNominals( data[ y ] ).find( ( n ) => n.NominalCode === code )?.NominalName ).find( Boolean ) ?? code;
                return (
                    <tr key={ code }>
                        <td>{ code } — { name }</td>
                        { years.map( ( y ) => <td key={ y }>{ formatCurrency( getBalance( data[ y ], code ) ) }</td> ) }
                    </tr>
                );
            } ) }
            <tr style={ { background: 'var(--bg)' } }>
                <td style={ { fontWeight: 700 } }>{ __( 'Subtotal', 'quickfile-dashboard' ) }</td>
                { years.map( ( y ) => (
                    <td key={ y } style={ { fontWeight: 700 } }>
                        { formatCurrency( rows.reduce( ( s, code ) => s + getBalance( data[ y ], code ), 0 ) ) }
                    </td>
                ) ) }
            </tr>
        </>
    );

    return (
        <div>
            <div className="wb-year-inputs">
                <label htmlFor="wb-y1">{ __( 'Year 1 (start)', 'quickfile-dashboard' ) }</label>
                <input id="wb-y1" type="number" min="2000" max={ cur } value={ year1 } onChange={ ( e ) => setYear1( Number( e.target.value ) ) } />
                <label htmlFor="wb-y2">{ __( 'Year 2 (start)', 'quickfile-dashboard' ) }</label>
                <input id="wb-y2" type="number" min="2000" max={ cur } value={ year2 } onChange={ ( e ) => setYear2( Number( e.target.value ) ) } />
                <label>{ __( 'Year 3 (current):', 'quickfile-dashboard' ) } <strong>{ fyLabel( cur ) }</strong> { __( '(auto)', 'quickfile-dashboard' ) }</label>
                <button className="wb-btn" onClick={ fetchData } disabled={ loading }>
                    { loading ? __( 'Loading…', 'quickfile-dashboard' ) : __( 'Load Comparison', 'quickfile-dashboard' ) }
                </button>
            </div>

            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }

            { ! loading && data && (
                <div className="wb-card">
                    <h3 className="wb-card__title">{ __( '3-Year Income & Expenditure Comparison', 'quickfile-dashboard' ) }</h3>
                    <div className="wb-table-wrap">
                        <table className="wb-table">
                            <thead>
                                <tr>
                                    <th>{ __( 'Nominal Code / Description', 'quickfile-dashboard' ) }</th>
                                    { years.map( ( y ) => <th key={ y }>{ fyLabel( y ) }</th> ) }
                                </tr>
                            </thead>
                            <tbody>
                                { renderSection( __( 'Income', 'quickfile-dashboard' ), sectionRows( 'Income' ) ) }
                                { renderSection( __( 'Expenditure', 'quickfile-dashboard' ), sectionRows( 'Expenditure' ) ) }
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>{ __( 'Net Surplus / (Deficit)', 'quickfile-dashboard' ) }</td>
                                    { years.map( ( y ) => {
                                        const inc = sectionRows( 'Income'      ).reduce( ( s, c ) => s + getBalance( data[ y ], c ), 0 );
                                        const exp = sectionRows( 'Expenditure' ).reduce( ( s, c ) => s + getBalance( data[ y ], c ), 0 );
                                        return (
                                            <td key={ y } style={ { color: inc - exp >= 0 ? 'var(--rag-green)' : 'var(--rag-red)', fontWeight: 700 } }>
                                                { formatCurrency( inc - exp ) }
                                            </td>
                                        );
                                    } ) }
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) }
            { ! loading && ! data && ! error && (
                <p className="wb-empty">{ __( 'Select comparison years and click Load Comparison.', 'quickfile-dashboard' ) }</p>
            ) }
        </div>
    );
}
