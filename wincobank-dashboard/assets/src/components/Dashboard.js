import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

const ACCOUNT_LABELS = {
    trust:   __( 'Trust Account (HSBC)', 'wincobank-dashboard' ),
    chapel:  __( 'Chapel House (Lloyds)', 'wincobank-dashboard' ),
    natwest: __( 'Chapel Bank (Natwest)', 'wincobank-dashboard' ),
};

function ragStatus( balance ) {
    if ( balance >= 5000 )  return 'green';
    if ( balance >= 1000 )  return 'amber';
    return 'red';
}

function formatCurrency( value ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( value );
}

export default function Dashboard() {
    const [ balances,  setBalances  ] = useState( null );
    const [ summary,   setSummary   ] = useState( null );
    const [ loading,   setLoading   ] = useState( true );
    const [ error,     setError     ] = useState( null );

    useEffect( () => {
        Promise.all( [
            api.getBalances(),
            api.getMonthlySummary( fyStart, fyEnd ),
        ] )
            .then( ( [ b, s ] ) => { setBalances( b ); setSummary( s ); } )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    }, [] );

    if ( loading ) return <LoadingSpinner />;
    if ( error )   return <ErrorMessage message={ error } />;

    const ytd = summary ? computeYTD( summary ) : null;

    return (
        <div>
            <h2 className="wb-section-heading">{ __( 'Live Account Balances', 'wincobank-dashboard' ) }</h2>
            <div className="wb-balances">
                { balances && Object.entries( balances ).map( ( [ key, data ] ) => {
                    const amount = parseFloat( data.CurrentBalance ?? data.Balance ?? 0 );
                    const rag    = ragStatus( amount );
                    return (
                        <div key={ key } className="wb-balance-card">
                            <div className="wb-balance-card__label">{ ACCOUNT_LABELS[ key ] ?? key }</div>
                            <div className="wb-balance-card__amount">{ formatCurrency( amount ) }</div>
                            <span className={ `wb-rag wb-rag--${ rag }` }>
                                { rag === 'green' ? '● Good' : rag === 'amber' ? '● Review' : '● Low' }
                            </span>
                        </div>
                    );
                } ) }
            </div>

            { ytd && (
                <div className="wb-card">
                    <h3 className="wb-card__title">{ __( 'Year-to-Date Summary', 'wincobank-dashboard' ) }</h3>
                    <div className="wb-table-wrap">
                        <table className="wb-table">
                            <thead>
                                <tr>
                                    <th>{ __( 'Account', 'wincobank-dashboard' ) }</th>
                                    <th>{ __( 'YTD Income', 'wincobank-dashboard' ) }</th>
                                    <th>{ __( 'YTD Expenditure', 'wincobank-dashboard' ) }</th>
                                    <th>{ __( 'Net', 'wincobank-dashboard' ) }</th>
                                </tr>
                            </thead>
                            <tbody>
                                { Object.entries( ytd ).map( ( [ key, row ] ) => (
                                    <tr key={ key }>
                                        <td>{ ACCOUNT_LABELS[ key ] ?? key }</td>
                                        <td>{ formatCurrency( row.income ) }</td>
                                        <td>{ formatCurrency( row.expenditure ) }</td>
                                        <td style={ { color: row.income - row.expenditure >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                                            { formatCurrency( row.income - row.expenditure ) }
                                        </td>
                                    </tr>
                                ) ) }
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>{ __( 'Total', 'wincobank-dashboard' ) }</td>
                                    <td>{ formatCurrency( Object.values( ytd ).reduce( ( s, r ) => s + r.income, 0 ) ) }</td>
                                    <td>{ formatCurrency( Object.values( ytd ).reduce( ( s, r ) => s + r.expenditure, 0 ) ) }</td>
                                    <td>{ formatCurrency( Object.values( ytd ).reduce( ( s, r ) => s + ( r.income - r.expenditure ), 0 ) ) }</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) }

            <p className="wb-topbar__meta">
                { __( 'Financial year: ', 'wincobank-dashboard' ) }{ fyStart } { __( 'to', 'wincobank-dashboard' ) } { fyEnd }
                { ' · ' }{ __( 'Data refreshed every 15 minutes', 'wincobank-dashboard' ) }
            </p>
        </div>
    );
}

function computeYTD( summary ) {
    const result = {};
    for ( const [ account, months ] of Object.entries( summary ) ) {
        result[ account ] = { income: 0, expenditure: 0 };
        for ( const month of Object.values( months ) ) {
            result[ account ].income       += month.income       || 0;
            result[ account ].expenditure  += month.expenditure  || 0;
        }
    }
    return result;
}
