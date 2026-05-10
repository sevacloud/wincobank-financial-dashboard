import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

const ACCOUNT_KEYS   = [ 'trust', 'chapel', 'natwest' ];
const ACCOUNT_LABELS = {
    trust:   __( 'Trust (HSBC)',          'wincobank-dashboard' ),
    chapel:  __( 'Chapel House (Lloyds)', 'wincobank-dashboard' ),
    natwest: __( 'Chapel Bank (Natwest)', 'wincobank-dashboard' ),
};

function fmt( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

// RAG based on net movement (live balance − opening balance).
// green = on/above budget (net ≥ 0)
// amber = within £500 under (−500 ≤ net < 0)
// red   = more than £500 under (net < −500)
function ragFromNet( net ) {
    if ( net >= 0 )    return 'green';
    if ( net >= -500 ) return 'amber';
    return 'red';
}

const RAG_LABELS = {
    green: __( '● On Budget',  'wincobank-dashboard' ),
    amber: __( '● Near Limit', 'wincobank-dashboard' ),
    red:   __( '● Over Limit', 'wincobank-dashboard' ),
};

function RagBadge( { net } ) {
    const status = ragFromNet( net );
    return <span className={ `wb-rag wb-rag--${ status }` }>{ RAG_LABELS[ status ] }</span>;
}

function sumYTD( months ) {
    let income = 0, expenditure = 0;
    if ( ! months || months._error ) {
        return { income: 0, expenditure: 0 };
    }
    for ( const row of Object.values( months ) ) {
        income      += row.income      || 0;
        expenditure += row.expenditure || 0;
    }
    return { income, expenditure };
}

// Net movement sign prefix
function signed( n ) {
    return ( n >= 0 ? '+' : '' ) + fmt( n );
}

export default function Dashboard() {
    const [ balances, setBalances ] = useState( null );
    const [ summary,  setSummary  ] = useState( null );
    const [ loading,  setLoading  ] = useState( true );
    const [ error,    setError    ] = useState( null );

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

    const rows = ACCOUNT_KEYS.map( ( key ) => {
        const bal    = balances?.[ key ] ?? {};
        const ytd    = sumYTD( summary?.[ key ] );
        const live   = parseFloat( bal.CurrentBalance ?? bal.Balance ?? 0 );
        // QuickFile returns OpeningBalance or StartBalance; fall back to live if absent.
        const opening = parseFloat( bal.OpeningBalance ?? bal.StartBalance ?? live );
        const net     = live - opening;
        return { key, live, opening, ytd, net, hasErr: !! bal._error, errMsg: bal._error };
    } );

    const totals = rows.reduce(
        ( acc, r ) => ( {
            opening:     acc.opening     + r.opening,
            income:      acc.income      + r.ytd.income,
            expenditure: acc.expenditure + r.ytd.expenditure,
            live:        acc.live        + r.live,
            net:         acc.net         + r.net,
        } ),
        { opening: 0, income: 0, expenditure: 0, live: 0, net: 0 }
    );

    return (
        <div>
            {/* ---- Balance cards ---- */}
            <div className="wb-balances">
                { rows.map( ( r ) => (
                    <div
                        key={ r.key }
                        className="wb-balance-card"
                        style={ { borderTopColor: r.hasErr ? 'var(--rag-red)' : 'var(--teal)' } }
                    >
                        <div className="wb-balance-card__label">{ ACCOUNT_LABELS[ r.key ] }</div>
                        { r.hasErr ? (
                            <div style={ { color: 'var(--rag-red)', fontSize: '.875rem', marginTop: 8 } }>
                                { r.errMsg }
                            </div>
                        ) : (
                            <>
                                <div className="wb-balance-card__amount">{ fmt( r.live ) }</div>
                                <div className="wb-balance-card__sub">
                                    { __( 'Opening: ', 'wincobank-dashboard' ) }{ fmt( r.opening ) }
                                </div>
                                <div style={ { marginTop: 8 } }>
                                    <RagBadge net={ r.net } />
                                </div>
                            </>
                        ) }
                    </div>
                ) ) }
            </div>

            {/* ---- Detail table ---- */}
            <div className="wb-card">
                <h3 className="wb-card__title">
                    { __( 'Account Summary — Year to Date', 'wincobank-dashboard' ) }
                </h3>
                <div className="wb-table-wrap">
                    <table className="wb-table">
                        <thead>
                            <tr>
                                <th>{ __( 'Account',         'wincobank-dashboard' ) }</th>
                                <th>{ __( 'Opening Balance', 'wincobank-dashboard' ) }</th>
                                <th>{ __( 'YTD Income',      'wincobank-dashboard' ) }</th>
                                <th>{ __( 'YTD Spend',       'wincobank-dashboard' ) }</th>
                                <th>{ __( 'Net Movement',    'wincobank-dashboard' ) }</th>
                                <th>{ __( 'Live Balance',    'wincobank-dashboard' ) }</th>
                                <th>{ __( 'Status',          'wincobank-dashboard' ) }</th>
                            </tr>
                        </thead>
                        <tbody>
                            { rows.map( ( r ) => (
                                <tr key={ r.key }>
                                    <td style={ { fontWeight: 600 } }>{ ACCOUNT_LABELS[ r.key ] }</td>
                                    { r.hasErr ? (
                                        <td colSpan={ 6 } style={ { color: 'var(--rag-red)' } }>
                                            { r.errMsg }
                                        </td>
                                    ) : (
                                        <>
                                            <td>{ fmt( r.opening ) }</td>
                                            <td style={ { color: 'var(--rag-green)' } }>
                                                { fmt( r.ytd.income ) }
                                            </td>
                                            <td style={ { color: 'var(--rag-red)' } }>
                                                { fmt( r.ytd.expenditure ) }
                                            </td>
                                            <td style={ {
                                                fontWeight: 600,
                                                color: r.net >= 0 ? 'var(--rag-green)' : 'var(--rag-red)',
                                            } }>
                                                { signed( r.net ) }
                                            </td>
                                            <td style={ { fontWeight: 700, color: 'var(--navy)' } }>
                                                { fmt( r.live ) }
                                            </td>
                                            <td><RagBadge net={ r.net } /></td>
                                        </>
                                    ) }
                                </tr>
                            ) ) }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td style={ { fontWeight: 700 } }>
                                    { __( 'Combined', 'wincobank-dashboard' ) }
                                </td>
                                <td>{ fmt( totals.opening ) }</td>
                                <td style={ { color: 'var(--rag-green)' } }>{ fmt( totals.income ) }</td>
                                <td style={ { color: 'var(--rag-red)' } }>{ fmt( totals.expenditure ) }</td>
                                <td style={ {
                                    fontWeight: 700,
                                    color: totals.net >= 0 ? 'var(--rag-green)' : 'var(--rag-red)',
                                } }>
                                    { signed( totals.net ) }
                                </td>
                                <td style={ { fontWeight: 700, color: 'var(--navy)' } }>
                                    { fmt( totals.live ) }
                                </td>
                                <td><RagBadge net={ totals.net } /></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            <p className="wb-topbar__meta" style={ { marginTop: 8 } }>
                { __( 'Financial year:', 'wincobank-dashboard' ) } { fyStart } { __( 'to', 'wincobank-dashboard' ) } { fyEnd }
                { ' · ' }{ __( 'Balances refreshed every 15 minutes', 'wincobank-dashboard' ) }
            </p>
        </div>
    );
}
