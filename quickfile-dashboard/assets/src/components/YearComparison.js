import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyYears = [], selectedAccounts = [] } = window.qfdData || {};

function formatCurrency( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

function fyLabel( year ) {
    return `${ year }/${ String( year + 1 ).slice( -2 ) }`;
}

export default function YearComparison() {
    const curFYStart  = fyYears[0] ? parseInt( fyYears[0].from.slice( 0, 4 ), 10 ) : new Date().getFullYear();
    const compYears   = [ curFYStart - 3, curFYStart - 2, curFYStart - 1 ];

    const [ data,    setData    ] = useState( null );
    const [ loading, setLoading ] = useState( false );
    const [ error,   setError   ] = useState( null );

    useEffect( () => {
        setLoading( true );
        setError( null );
        api.getYearComparison( compYears )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    }, [] );

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
            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }

            { ! loading && data && (
                <>
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

                    { selectedAccounts.length > 0 && (
                        <div className="wb-card" style={ { marginTop: 20 } }>
                            <h3 className="wb-card__title">{ __( 'Bank Account Balances at Year End', 'quickfile-dashboard' ) }</h3>
                            <div className="wb-table-wrap">
                                <table className="wb-table">
                                    <thead>
                                        <tr>
                                            <th>{ __( 'Account', 'quickfile-dashboard' ) }</th>
                                            { years.map( ( y ) => <th key={ y } style={ { textAlign: 'right' } }>{ fyLabel( y ) }</th> ) }
                                        </tr>
                                    </thead>
                                    <tbody>
                                        { selectedAccounts.map( ( acc ) => (
                                            <tr key={ acc.bankId }>
                                                <td>{ acc.name }</td>
                                                { years.map( ( y ) => {
                                                    const b = data[ y ]?._balances?.[ String( acc.bankId ) ];
                                                    return (
                                                        <td key={ y } style={ { textAlign: 'right' } }>
                                                            { b != null ? formatCurrency( b ) : <span style={ { color: 'var(--muted)' } }>—</span> }
                                                        </td>
                                                    );
                                                } ) }
                                            </tr>
                                        ) ) }
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td style={ { fontWeight: 700 } }>{ __( 'Total', 'quickfile-dashboard' ) }</td>
                                            { years.map( ( y ) => {
                                                const total = selectedAccounts.reduce( ( s, acc ) => {
                                                    const b = data[ y ]?._balances?.[ String( acc.bankId ) ];
                                                    return s + ( b ?? 0 );
                                                }, 0 );
                                                return (
                                                    <td key={ y } style={ { fontWeight: 700, textAlign: 'right' } }>
                                                        { formatCurrency( total ) }
                                                    </td>
                                                );
                                            } ) }
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    ) }
                </>
            ) }
        </div>
    );
}
