import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import DateRangeControl from './DateRangeControl';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

const ACCOUNT_KEYS   = [ 'trust', 'chapel', 'natwest' ];
const ACCOUNT_LABELS = {
    trust:   'Trust (HSBC)',
    chapel:  'Chapel House (Lloyds)',
    natwest: 'Chapel Bank (Natwest)',
};

function formatCurrency( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

/**
 * The chart-of-accounts endpoint returns data for all accounts combined.
 * We display it once as the combined view; individual account breakdowns
 * come from the transaction search aggregated by nominal code.
 *
 * For simplicity, this view renders the combined COA grouped by category
 * alongside the per-account totals where available.
 */
export default function AnnualStatement() {
    const [ data,    setData    ] = useState( null );
    const [ loading, setLoading ] = useState( false );
    const [ error,   setError   ] = useState( null );
    const [ params,  setParams  ] = useState( { from: fyStart, to: fyEnd } );

    const fetchData = ( from, to ) => {
        setParams( { from, to } );
        setLoading( true );
        setError( null );
        api.getAnnualStatement( from, to )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    };

    useEffect( () => { fetchData( fyStart, fyEnd ); }, [] );

    const incomeNominals  = data?.NominalAccount?.filter( ( n ) => n.CategoryType === 'Income'      ) ?? [];
    const expendNominals  = data?.NominalAccount?.filter( ( n ) => n.CategoryType === 'Expenditure' ) ?? [];

    const totalIncome  = incomeNominals.reduce(  ( s, n ) => s + parseFloat( n.Balance ?? 0 ), 0 );
    const totalExpend  = expendNominals.reduce(  ( s, n ) => s + parseFloat( n.Balance ?? 0 ), 0 );

    const renderSection = ( nominals, sectionLabel ) => (
        <>
            <tr style={ { background: 'var(--navy)' } }>
                <td colSpan={ 3 } style={ { color: 'var(--white)', fontWeight: 700, padding: '8px 14px', fontSize: '.875rem', textTransform: 'uppercase' } }>
                    { sectionLabel }
                </td>
            </tr>
            { nominals.map( ( n, i ) => (
                <tr key={ n.NominalCode ?? i }>
                    <td>{ n.NominalCode }</td>
                    <td>{ n.NominalName }</td>
                    <td>{ formatCurrency( n.Balance ) }</td>
                </tr>
            ) ) }
        </>
    );

    return (
        <div>
            <DateRangeControl onFetch={ fetchData } loading={ loading } />
            <p style={ { fontSize: '.8125rem', color: 'var(--muted)', marginBottom: 16 } }>
                { __( 'Showing combined chart of accounts for all accounts. Period: ', 'wincobank-dashboard' ) }
                { params.from } { __( 'to', 'wincobank-dashboard' ) } { params.to }
            </p>
            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }
            { ! loading && data && (
                <div className="wb-card">
                    <h3 className="wb-card__title">{ __( 'Income & Expenditure by Nominal Code', 'wincobank-dashboard' ) }</h3>
                    <div className="wb-table-wrap">
                        <table className="wb-table">
                            <thead>
                                <tr>
                                    <th>{ __( 'Code', 'wincobank-dashboard' ) }</th>
                                    <th>{ __( 'Description', 'wincobank-dashboard' ) }</th>
                                    <th>{ __( 'Amount', 'wincobank-dashboard' ) }</th>
                                </tr>
                            </thead>
                            <tbody>
                                { renderSection( incomeNominals, __( 'Income', 'wincobank-dashboard' ) ) }
                                <tr style={ { background: 'var(--bg)' } }>
                                    <td colSpan={ 2 } style={ { fontWeight: 700 } }>{ __( 'Total Income', 'wincobank-dashboard' ) }</td>
                                    <td style={ { fontWeight: 700, color: 'var(--rag-green)' } }>{ formatCurrency( totalIncome ) }</td>
                                </tr>
                                { renderSection( expendNominals, __( 'Expenditure', 'wincobank-dashboard' ) ) }
                                <tr style={ { background: 'var(--bg)' } }>
                                    <td colSpan={ 2 } style={ { fontWeight: 700 } }>{ __( 'Total Expenditure', 'wincobank-dashboard' ) }</td>
                                    <td style={ { fontWeight: 700, color: 'var(--rag-red)' } }>{ formatCurrency( totalExpend ) }</td>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={ 2 }>{ __( 'Net Surplus / (Deficit)', 'wincobank-dashboard' ) }</td>
                                    <td style={ { color: totalIncome - totalExpend >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                                        { formatCurrency( totalIncome - totalExpend ) }
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) }
            { ! loading && ! data && ! error && (
                <p className="wb-empty">{ __( 'Select a date range and click Load Data.', 'wincobank-dashboard' ) }</p>
            ) }
        </div>
    );
}
