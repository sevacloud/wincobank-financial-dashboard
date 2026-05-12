import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner, ErrorMessage, ApiErrorBanner } from './LoadingSpinner';
import TransactionList from './TransactionList';

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
    const currentFY               = fyYears[ 0 ] ?? null;
    const [ fy, setFY ]           = useState( currentFY );
    const [ balances, setBalances ] = useState( null );
    const [ summary,  setSummary  ] = useState( null );
    const [ loading,  setLoading  ] = useState( true );
    const [ error,    setError    ] = useState( null );
    const [ drawerKey, setDrawerKey ] = useState( null );

    const openDrawer  = useCallback( ( key ) => setDrawerKey( key ), [] );
    const closeDrawer = useCallback( () => setDrawerKey( null ), [] );

    useEffect( () => {
        if ( ! fy ) return;
        setLoading( true );
        setError( null );
        Promise.all( [
            api.getBalances( fy.from, fy.to ),
            api.getMonthlySummary( fy.from, fy.to ),
        ] )
            .then( ( [ b, s ] ) => { setBalances( b ); setSummary( s ); } )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    }, [ fy ] );

    if ( ! fy ) {
        return <ErrorMessage message={ __( 'No financial year configured.', 'quickfile-dashboard' ) } />;
    }

    const isCurrentFY = fy === currentFY;

    const rows = balances ? ACCOUNT_KEYS.map( ( key ) => {
        const bal     = balances[ key ] ?? {};
        const ytd     = sumYTD( summary?.[ key ] );
        const live    = parseFloat( bal.CurrentBalance ?? bal.Amount ?? bal.Balance ?? 0 );
        const opening = live + ytd.expenditure - ytd.income;
        const net     = live - opening;
        return { key, live, opening, ytd, net, hasErr: !! bal._error, errMsg: bal._error };
    } ) : [];

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

    const apiErrors = ACCOUNT_KEYS.flatMap( ( key ) => {
        const label = ACCOUNT_LABELS[ key ] ?? key;
        const errs = [];
        if ( balances?.[ key ]?._error ) errs.push( { label, message: balances[ key ]._error } );
        if ( summary?.[ key ]?._error )  errs.push( { label, message: summary[ key ]._error } );
        return errs;
    } );

    return (
        <div>
            {/* ---- Year selector ---- */}
            <div className="wb-card" style={ { marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } }>
                <label htmlFor="wb-fy-select" style={ { fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap' } }>
                    { __( 'Financial Year', 'quickfile-dashboard' ) }
                </label>
                <select
                    id="wb-fy-select"
                    value={ fy.label }
                    onChange={ ( e ) => {
                        const selected = fyYears.find( ( y ) => y.label === e.target.value );
                        if ( selected ) setFY( selected );
                    } }
                    style={ { padding: '6px 10px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '1rem', color: 'var(--navy)', fontWeight: 600 } }
                >
                    { fyYears.map( ( y ) => (
                        <option key={ y.label } value={ y.label }>
                            { y.label }{ y === currentFY ? __( ' (current)', 'quickfile-dashboard' ) : '' }
                        </option>
                    ) ) }
                </select>
                <span style={ { fontSize: '.875rem', color: 'var(--muted)' } }>
                    { fy.from } { __( 'to', 'quickfile-dashboard' ) } { fy.to }
                    { isCurrentFY && (
                        <span style={ { marginLeft: 8, background: 'var(--teal)', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: '.75rem', fontWeight: 600 } }>
                            { __( 'Current', 'quickfile-dashboard' ) }
                        </span>
                    ) }
                </span>
            </div>

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
                                        <div className="wb-balance-card__amount">{ fmt( r.live ) }</div>
                                        <div className="wb-balance-card__sub">
                                            { __( 'Opening: ', 'quickfile-dashboard' ) }{ fmt( r.opening ) }
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
                                        <th>{ __( 'Live Balance',    'quickfile-dashboard' ) }</th>
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
                                                    <td>{ fmt( r.opening ) }</td>
                                                    <td style={ { color: 'var(--rag-green)' } }>{ fmt( r.ytd.income ) }</td>
                                                    <td style={ { color: 'var(--rag-red)' } }>{ fmt( r.ytd.expenditure ) }</td>
                                                    <td style={ { fontWeight: 600, color: r.net >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                                                        { signed( r.net ) }
                                                    </td>
                                                    <td style={ { fontWeight: 700, color: 'var(--navy)' } }>{ fmt( r.live ) }</td>
                                                    <td><RagBadge net={ r.net } /></td>
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
