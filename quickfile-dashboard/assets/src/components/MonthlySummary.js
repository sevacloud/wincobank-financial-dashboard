import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import DateRangeControl from './DateRangeControl';
import { LoadingSpinner, ErrorMessage, ApiErrorBanner } from './LoadingSpinner';
import { useFY } from '../FYContext';

const { selectedAccounts = [] } = window.qfdData || {};

const ACCOUNT_KEYS   = selectedAccounts.map( ( a ) => String( a.bankId ) );
const ACCOUNT_LABELS = Object.fromEntries( selectedAccounts.map( ( a ) => [ String( a.bankId ), a.name ] ) );

const COLOUR_PALETTE = [
    { solid: 'rgba(27,58,107,.85)',  area: 'rgba(27,58,107,.12)'  },
    { solid: 'rgba(13,110,110,.85)', area: 'rgba(13,110,110,.12)' },
    { solid: 'rgba(184,134,11,.85)', area: 'rgba(184,134,11,.12)' },
    { solid: 'rgba(180,60,60,.85)',  area: 'rgba(180,60,60,.12)'  },
    { solid: 'rgba(90,60,180,.85)',  area: 'rgba(90,60,180,.12)'  },
];
const ACCOUNT_COLOURS = Object.fromEntries(
    ACCOUNT_KEYS.map( ( k, i ) => [ k, COLOUR_PALETTE[ i % COLOUR_PALETTE.length ] ] )
);

const INCOME_COLOUR = { solid: 'rgba(13,110,110,1)', area: 'rgba(13,110,110,.12)' };
const EXPEND_COLOUR = { solid: 'rgba(184,134,11,1)', area: 'rgba(184,134,11,.12)' };

function fmt( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

function monthLabel( ym ) {
    const [ y, m ] = ym.split( '-' );
    return new Date( +y, +m - 1 ).toLocaleString( 'en-GB', { month: 'short', year: '2-digit' } );
}

// Collect all months from all accounts; YYYY-MM natural sort = correct Apr–Mar FY order.
function collectMonths( data ) {
    const s = new Set();
    ACCOUNT_KEYS.forEach( ( k ) => {
        if ( data[ k ] && ! data[ k ]._error ) {
            Object.keys( data[ k ] ).forEach( ( m ) => s.add( m ) );
        }
    } );
    return [ ...s ].sort();
}

function accountRow( data, key, month ) {
    if ( ! data[ key ] || data[ key ]._error ) return { income: 0, expenditure: 0 };
    const row = data[ key ][ month ] || {};
    return { income: row.income || 0, expenditure: row.expenditure || 0 };
}

// ─── Chart: Income vs Expenditure line chart (combined all accounts) ──────────────────────────

function IncomeExpenditureChart( { months, data } ) {
    const canvasRef = useRef( null );
    const chartRef  = useRef( null );

    useEffect( () => {
        if ( ! canvasRef.current ) return;

        const combined = months.map( ( m ) =>
            ACCOUNT_KEYS.reduce(
                ( acc, k ) => {
                    const row = accountRow( data, k, m );
                    return { income: acc.income + row.income, expenditure: acc.expenditure + row.expenditure };
                },
                { income: 0, expenditure: 0 }
            )
        );

        import( 'chart.js/auto' ).then( ( { default: Chart } ) => {
            if ( chartRef.current ) chartRef.current.destroy();
            chartRef.current = new Chart( canvasRef.current, {
                type: 'line',
                data: {
                    labels: months.map( monthLabel ),
                    datasets: [
                        {
                            label: __( 'Income', 'quickfile-dashboard' ),
                            data: combined.map( ( r ) => r.income ),
                            borderColor: INCOME_COLOUR.solid,
                            backgroundColor: INCOME_COLOUR.area,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                        },
                        {
                            label: __( 'Expenditure', 'quickfile-dashboard' ),
                            data: combined.map( ( r ) => r.expenditure ),
                            borderColor: EXPEND_COLOUR.solid,
                            backgroundColor: EXPEND_COLOUR.area,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: ( ctx ) => `${ ctx.dataset.label }: ${ fmt( ctx.parsed.y ) }`,
                            },
                        },
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: ( v ) => fmt( v ) },
                        },
                    },
                },
            } );
        } );

        return () => chartRef.current?.destroy();
    }, [ months, data ] );

    return (
        <div className="wb-card">
            <h3 className="wb-card__title">
                { __( 'Income vs Expenditure — All Accounts', 'quickfile-dashboard' ) }
            </h3>
            <div className="wb-chart-wrap">
                <canvas
                    ref={ canvasRef }
                    role="img"
                    aria-label={ __( 'Line chart: monthly combined income vs expenditure', 'quickfile-dashboard' ) }
                />
            </div>
        </div>
    );
}

// ─── Chart: Clustered bar — monthly net balance per account ─────────────────────────────

function AccountBalancesChart( { months, data } ) {
    const canvasRef = useRef( null );
    const chartRef  = useRef( null );

    useEffect( () => {
        if ( ! canvasRef.current ) return;

        import( 'chart.js/auto' ).then( ( { default: Chart } ) => {
            if ( chartRef.current ) chartRef.current.destroy();
            chartRef.current = new Chart( canvasRef.current, {
                type: 'bar',
                data: {
                    labels: months.map( monthLabel ),
                    datasets: ACCOUNT_KEYS.map( ( k ) => ( {
                        label: ACCOUNT_LABELS[ k ],
                        data: months.map( ( m ) => {
                            const row = accountRow( data, k, m );
                            return row.income - row.expenditure;
                        } ),
                        backgroundColor: ACCOUNT_COLOURS[ k ].solid,
                        borderRadius: 3,
                    } ) ),
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: ( ctx ) => `${ ctx.dataset.label }: ${ fmt( ctx.parsed.y ) }`,
                            },
                        },
                    },
                    scales: {
                        y: { ticks: { callback: ( v ) => fmt( v ) } },
                    },
                },
            } );
        } );

        return () => chartRef.current?.destroy();
    }, [ months, data ] );

    return (
        <div className="wb-card">
            <h3 className="wb-card__title">
                { __( 'Net Balance by Account — Monthly', 'quickfile-dashboard' ) }
            </h3>
            <div className="wb-chart-wrap">
                <canvas
                    ref={ canvasRef }
                    role="img"
                    aria-label={ __( 'Clustered bar chart: monthly net balance per account', 'quickfile-dashboard' ) }
                />
            </div>
        </div>
    );
}

// ─── Data table ───────────────────────────────────────────────────────────────────────────────────

function SummaryTable( { months, data } ) {
    // Pre-compute account and combined totals
    const acctTotals = ACCOUNT_KEYS.reduce( ( acc, k ) => {
        let inc = 0, exp = 0;
        if ( data[ k ] && ! data[ k ]._error ) {
            Object.values( data[ k ] ).forEach( ( r ) => {
                inc += r.income      || 0;
                exp += r.expenditure || 0;
            } );
        }
        acc[ k ] = { inc, exp };
        return acc;
    }, {} );

    const grandInc = ACCOUNT_KEYS.reduce( ( s, k ) => s + acctTotals[ k ].inc, 0 );
    const grandExp = ACCOUNT_KEYS.reduce( ( s, k ) => s + acctTotals[ k ].exp, 0 );

    return (
        <div className="wb-card">
            <h3 className="wb-card__title">{ __( 'Monthly Breakdown', 'quickfile-dashboard' ) }</h3>
            <div className="wb-table-wrap">
                <table className="wb-table">
                    <thead>
                        <tr>
                            <th rowSpan={ 2 }>{ __( 'Month', 'quickfile-dashboard' ) }</th>
                            { ACCOUNT_KEYS.map( ( k ) => (
                                <th key={ k } colSpan={ 2 } style={ { textAlign: 'center' } }>
                                    { ACCOUNT_LABELS[ k ] }
                                </th>
                            ) ) }
                            <th colSpan={ 2 } style={ { textAlign: 'center' } }>
                                { __( 'Combined', 'quickfile-dashboard' ) }
                            </th>
                        </tr>
                        <tr>
                            { [ ...ACCOUNT_KEYS, 'combined' ].map( ( k ) => (
                                <th key={ `${ k }-sub` } colSpan={ 2 } style={ { fontWeight: 400, fontSize: '.75rem', background: 'var(--navy)', opacity: .85 } }>
                                    { __( 'In / Out', 'quickfile-dashboard' ) }
                                </th>
                            ) ) }
                        </tr>
                    </thead>
                    <tbody>
                        { months.map( ( m ) => {
                            let combInc = 0, combExp = 0;
                            const cells = ACCOUNT_KEYS.map( ( k ) => {
                                const row = accountRow( data, k, m );
                                combInc += row.income;
                                combExp += row.expenditure;
                                return (
                                    <th key={ k } colSpan={ 2 } style={ { background: 'none' } }>
                                        <span style={ { color: 'var(--rag-green)', fontWeight: 400 } }>
                                            { row.income ? fmt( row.income ) : '—' }
                                        </span>
                                        { ' / ' }
                                        <span style={ { color: 'var(--rag-red)', fontWeight: 400 } }>
                                            { row.expenditure ? fmt( row.expenditure ) : '—' }
                                        </span>
                                    </th>
                                );
                            } );
                            return (
                                <tr key={ m }>
                                    <td>{ monthLabel( m ) }</td>
                                    { cells }
                                    <td style={ { fontWeight: 600 } }>
                                        <span style={ { color: 'var(--rag-green)' } }>{ fmt( combInc ) }</span>
                                        { ' / ' }
                                        <span style={ { color: 'var(--rag-red)' } }>{ fmt( combExp ) }</span>
                                    </td>
                                    { /* colspan filler for second combined column — merged above */ }
                                </tr>
                            );
                        } ) }
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>{ __( 'Total', 'quickfile-dashboard' ) }</td>
                            { ACCOUNT_KEYS.map( ( k ) => (
                                <td key={ k } colSpan={ 2 }>
                                    <span style={ { color: 'var(--rag-green)' } }>{ fmt( acctTotals[ k ].inc ) }</span>
                                    { ' / ' }
                                    <span style={ { color: 'var(--rag-red)' } }>{ fmt( acctTotals[ k ].exp ) }</span>
                                </td>
                            ) ) }
                            <td style={ { fontWeight: 700 } }>
                                <span style={ { color: 'var(--rag-green)' } }>{ fmt( grandInc ) }</span>
                                { ' / ' }
                                <span style={ { color: 'var(--rag-red)' } }>{ fmt( grandExp ) }</span>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────────────────────────────

export default function MonthlySummary() {
    const { globalFY } = useFY();
    const [ data,    setData    ] = useState( null );
    const [ loading, setLoading ] = useState( false );
    const [ error,   setError   ] = useState( null );

    const fetchData = ( from, to ) => {
        setLoading( true );
        setError( null );
        api.getMonthlySummary( from, to )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    };

    useEffect( () => {
        if ( globalFY ) fetchData( globalFY.from, globalFY.to );
    }, [ globalFY ] );

    const months = data ? collectMonths( data ) : [];

    const apiErrors = data
        ? ACCOUNT_KEYS.flatMap( ( key ) =>
            data[ key ]?._error
                ? [ { label: ACCOUNT_LABELS[ key ] ?? key, message: data[ key ]._error } ]
                : []
        )
        : [];

    return (
        <div>
            <DateRangeControl
                key={ globalFY?.label }
                onFetch={ fetchData }
                loading={ loading }
                defaultFrom={ globalFY?.from }
                defaultTo={ globalFY?.to }
            />
            { error && <ErrorMessage message={ error } /> }
            <ApiErrorBanner errors={ apiErrors } />
            { loading && <LoadingSpinner /> }

            { ! loading && data && months.length > 0 && (
                <>
                    <IncomeExpenditureChart months={ months } data={ data } />
                    <AccountBalancesChart   months={ months } data={ data } />
                    <SummaryTable           months={ months } data={ data } />
                </>
            ) }

            { ! loading && data && months.length === 0 && (
                <p className="wb-empty">
                    { __( 'No transactions found for this period.', 'quickfile-dashboard' ) }
                </p>
            ) }

            { ! loading && ! data && ! error && (
                <p className="wb-empty">
                    { __( 'Select a date range and click Load Data.', 'quickfile-dashboard' ) }
                </p>
            ) }
        </div>
    );
}
