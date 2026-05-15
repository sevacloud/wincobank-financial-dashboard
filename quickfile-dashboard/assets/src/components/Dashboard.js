import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner, ErrorMessage, ApiErrorBanner } from './LoadingSpinner';
import TransactionList from './TransactionList';
import { useFY } from '../FYContext';

const { fyYears = [], selectedAccounts = [] } = window.qfdData || {};

const ACCOUNT_KEYS   = selectedAccounts.map( ( a ) => String( a.bankId ) );
const ACCOUNT_LABELS = Object.fromEntries( selectedAccounts.map( ( a ) => [ String( a.bankId ), a.name ] ) );

function fmt( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

function ragFromNet( net ) {
    if ( net >= 0 )    return 'green';
    if ( net >= -500 ) return 'amber';
    return 'red';
}

const RAG_LABELS = {
    green: __( '● On Budget',  'quickfile-dashboard' ),
    amber: __( '● Near Limit', 'quickfile-dashboard' ),
    red:   __( '● Over Limit', 'quickfile-dashboard' ),
};

function RagBadge( { net } ) {
    const status = ragFromNet( net );
    return <span className={ `wb-rag wb-rag--${ status }` }>{ RAG_LABELS[ status ] }</span>;
}

function sumYTD( months ) {
    let income = 0, expenditure = 0;
    if ( ! months || months._error ) return { income: 0, expenditure: 0 };
    for ( const row of Object.values( months ) ) {
        income      += row.income      || 0;
        expenditure += row.expenditure || 0;
    }
    return { income, expenditure };
}

function signed( n ) {
    return ( n >= 0 ? '+' : '' ) + fmt( n );
}

export default function Dashboard() {
    const { globalFY: fy } = useFY();
    const currentFY = fyYears[ 0 ] ?? null;
    const [ balances, setBalances ] = useState( null );
    const [ summary,  setSummary  ] = useState( null );
    const [ closingBals, setClosingBals ] = useState( null );
    const [ loading,  setLoading  ] = useState( true );
    const [ error,    setError    ] = useState( null );
    const [ drawerKey, setDrawerKey ] = useState( null );

    const isCurrentFY = fy?.label === currentFY?.label;

    const openDrawer  = useCallback( ( key ) => setDrawerKey( key ), [] );
    const closeDrawer = useCallback( () => setDrawerKey( null ), [] );

    useEffect( () => {
        if ( ! fy ) return;
        setLoading( true );
        setError( null );
        const fetchClosing = ! isCurrentFY ? api.getClosingBalances( fy.label ) : Promise.resolve( null );
        Promise.all( [
            api.getBalances( fy.from, fy.to ),
            api.getMonthlySummary( fy.from, fy.to ),
            fetchClosing,
        ] )
            .then( ( [ b, s, cb ] ) => { setBalances( b ); setSummary( s ); setClosingBals( cb ); } )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    }, [ fy ] );

    if ( ! fy ) {
        return <ErrorMessage message={ __( 'No financial year configured.', 'quickfile-dashboard' ) } />;
    }

    const rows = balances ? ACCOUNT_KEYS.map( ( key ) => {
        const bal        = balances[ key ] ?? {};
        const ytd        = sumYTD( summary?.[ key ] );
        const cb         = closingBals?.[ key ];
        const live       = isCurrentFY
            ? parseFloat( bal.CurrentBalance ?? bal.Amount ?? bal.Balance ?? 0 )
            : ( cb?.balance ?? null );
        const opening    = live !== null ? live + ytd.expenditure - ytd.income : null;
        const net        = live !== null ? live - opening : null;
        const missingRef = ! isCurrentFY && cb && cb.has_ref === false;
        return { key, live, opening, ytd, net, hasErr: !! bal._error || !! cb?._error, errMsg: bal._error || cb?._error, missingRef };
    } ) : [];

    const totals = rows.reduce(
        ( acc, r ) => ( {
            opening:     acc.opening     + ( r.opening ?? 0 ),
            income:      acc.income      + r.ytd.income,
            expenditure: acc.expenditure + r.ytd.expenditure,
            live:        acc.live        + ( r.live ?? 0 ),
            net:         acc.net         + ( r.net ?? 0 ),
        } ),
        { opening: 0, income: 0, expenditure: 0, live: 0, net: 0 }
    );

    const apiErrors = ACCOUNT_KEYS.flatMap( ( key ) => {
        const label = ACCOUNT_LABELS[ key ] ?? key;
        const errs = [];
        if ( balances?.[ key ]?._error ) errs.push( { label, message: balances[ key ]._error } );
        if ( summary?.[ key ]?._error )  errs.push( { label, message: summary[ key ]._error } );
        if ( rows.find( ( r ) => r.key === key )?.missingRef )
            errs.push( { label, message: __( 'Year-end journal reference not set — add it in Settings.', 'quickfile-dashboard' ) } );
        return errs;
    } );

    return (
        <div>
            { loading && <LoadingSpinner /> }
            { ! loading && error && <ErrorMessage message={ error } /> }

            { ! loading && ! error && balances && (
                <>
                    <ApiErrorBanner errors={ apiErrors } />

                    {/* ---- Balance cards ---- */}
                    <div className="wb-balances">
                        { rows.map( ( r ) => (
                            <div
                                key={ r.key }
                                className="wb-balance-card wb-balance-card--clickable"
                                style={ { borderTopColor: r.hasErr ? 'var(--rag-red)' : 'var(--teal)' } }
                                role="button"
                                tabIndex={ 0 }
                                onClick={ () => openDrawer( r.key ) }
                                onKeyDown={ ( e ) => ( e.key === 'Enter' || e.key === ' ' ) && openDrawer( r.key ) }
                                title={ __( 'View transactions', 'quickfile-dashboard' ) }
                            >
                                <div className="wb-balance-card__label">{ ACCOUNT_LABELS[ r.key ] }</div>
                                { r.hasErr ? (
                                    <div style={ { color: 'var(--rag-red)', fontSize: '.875rem', marginTop: 8 } }>
                                        { r.errMsg }
                                    </div>
                                ) : (
                                    <>
                                        <div className="wb-balance-card__amount">{ r.live !== null ? fmt( r.live ) : '–' }</div>
                                        <div className="wb-balance-card__sub">
                                            { __( 'Opening: ', 'quickfile-dashboard' ) }{ r.opening !== null ? fmt( r.opening ) : '–' }
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
                            { __( 'Account Summary', 'quickfile-dashboard' ) }
                            { ' — ' }
                            { __( 'Financial Year', 'quickfile-dashboard' ) } { fy.label }
                        </h3>
                        <div className="wb-table-wrap">
                            <table className="wb-table">
                                <thead>
                                    <tr>
                                        <th>{ __( 'Account',         'quickfile-dashboard' ) }</th>
                                        <th>{ __( 'Opening Balance', 'quickfile-dashboard' ) }</th>
                                        <th>{ __( 'YTD Income',      'quickfile-dashboard' ) }</th>
                                        <th>{ __( 'YTD Spend',       'quickfile-dashboard' ) }</th>
                                        <th>{ __( 'Net Movement',    'quickfile-dashboard' ) }</th>
                                        <th>{ isCurrentFY ? __( 'Live Balance', 'quickfile-dashboard' ) : __( 'Closing Balance', 'quickfile-dashboard' ) }</th>
                                        <th>{ __( 'Status',          'quickfile-dashboard' ) }</th>
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
                                                    <td>{ r.opening !== null ? fmt( r.opening ) : '–' }</td>
                                                    <td style={ { color: 'var(--rag-green)' } }>{ fmt( r.ytd.income ) }</td>
                                                    <td style={ { color: 'var(--rag-red)' } }>{ fmt( r.ytd.expenditure ) }</td>
                                                    <td style={ { fontWeight: 600, color: r.net !== null && r.net >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                                                        { r.net !== null ? signed( r.net ) : '–' }
                                                    </td>
                                                    <td style={ { fontWeight: 700, color: 'var(--navy)' } }>{ r.live !== null ? fmt( r.live ) : '–' }</td>
                                                    <td>{ r.net !== null ? <RagBadge net={ r.net } /> : null }</td>
                                                </>
                                            ) }
                                        </tr>
                                    ) ) }
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td style={ { fontWeight: 700 } }>{ __( 'Combined', 'quickfile-dashboard' ) }</td>
                                        <td>{ fmt( totals.opening ) }</td>
                                        <td style={ { color: 'var(--rag-green)' } }>{ fmt( totals.income ) }</td>
                                        <td style={ { color: 'var(--rag-red)' } }>{ fmt( totals.expenditure ) }</td>
                                        <td style={ { fontWeight: 700, color: totals.net >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                                            { signed( totals.net ) }
                                        </td>
                                        <td style={ { fontWeight: 700, color: 'var(--navy)' } }>{ fmt( totals.live ) }</td>
                                        <td><RagBadge net={ totals.net } /></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <p className="wb-topbar__meta" style={ { marginTop: 8 } }>
                        { __( 'Balances refreshed every 15 minutes', 'quickfile-dashboard' ) }
                        { ' · ' }
                        { __( 'Opening balance: live balance minus all transactions since period start', 'quickfile-dashboard' ) }
                    </p>
                </>
            ) }

            { drawerKey && (
                <TransactionList
                    accountKey={ drawerKey }
                    accountLabel={ ACCOUNT_LABELS[ drawerKey ] ?? drawerKey }
                    onClose={ closeDrawer }
                />
            ) }
        </div>
    );
}
