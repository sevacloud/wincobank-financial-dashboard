import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import DateRangeControl from './DateRangeControl';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

const UTILITY_LABELS = {
    Gas:         __( 'Gas', 'wincobank-dashboard' ),
    Electricity: __( 'Electricity', 'wincobank-dashboard' ),
    Water:       __( 'Water', 'wincobank-dashboard' ),
    Broadband:   __( 'Broadband / Phone', 'wincobank-dashboard' ),
    Insurance:   __( 'Insurance', 'wincobank-dashboard' ),
    Alarm:       __( 'Alarm / Security', 'wincobank-dashboard' ),
};

const UTILITY_COLOURS = [
    'rgba(27,58,107,.8)',
    'rgba(13,110,110,.8)',
    'rgba(184,134,11,.8)',
    'rgba(100,60,180,.8)',
    'rgba(200,60,60,.8)',
    'rgba(60,160,80,.8)',
];

function formatCurrency( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v );
}

function UtilityChart( { data } ) {
    const canvasRef = useRef( null );
    const chartRef  = useRef( null );

    const allMonths = [ ...new Set( Object.values( data ).flatMap( ( m ) => Object.keys( m ) ) ) ].sort();
    const utilities  = Object.keys( data );

    useEffect( () => {
        if ( ! canvasRef.current ) return;

        import( 'chart.js/auto' ).then( ( { default: Chart } ) => {
            if ( chartRef.current ) chartRef.current.destroy();
            chartRef.current = new Chart( canvasRef.current, {
                type: 'line',
                data: {
                    labels: allMonths,
                    datasets: utilities.map( ( util, i ) => ( {
                        label: UTILITY_LABELS[ util ] ?? util,
                        data: allMonths.map( ( m ) => data[ util ]?.[ m ]?.expenditure ?? 0 ),
                        borderColor: UTILITY_COLOURS[ i % UTILITY_COLOURS.length ],
                        backgroundColor: UTILITY_COLOURS[ i % UTILITY_COLOURS.length ].replace( '.8)', '.15)' ),
                        tension: 0.3,
                        fill: false,
                    } ) ),
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: { label: ( ctx ) => `${ ctx.dataset.label }: ${ formatCurrency( ctx.parsed.y ) }` },
                        },
                    },
                    scales: {
                        y: { ticks: { callback: ( v ) => formatCurrency( v ) } },
                    },
                },
            } );
        } );

        return () => chartRef.current?.destroy();
    }, [ data ] );

    return (
        <div className="wb-card" style={ { marginBottom: 24 } }>
            <h3 className="wb-card__title">{ __( 'Monthly Utility Costs', 'wincobank-dashboard' ) }</h3>
            <div className="wb-chart-wrap">
                <canvas ref={ canvasRef } aria-label={ __( 'Monthly utility costs line chart', 'wincobank-dashboard' ) } role="img" />
            </div>
        </div>
    );
}

export default function Utilities() {
    const [ data,    setData    ] = useState( null );
    const [ loading, setLoading ] = useState( false );
    const [ error,   setError   ] = useState( null );

    const fetchData = ( from, to ) => {
        setLoading( true );
        setError( null );
        api.getUtilities( from, to )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    };

    useEffect( () => { fetchData( fyStart, fyEnd ); }, [] );

    const allMonths = data
        ? [ ...new Set( Object.values( data ).flatMap( ( m ) => Object.keys( m ) ) ) ].sort()
        : [];

    return (
        <div>
            <DateRangeControl onFetch={ fetchData } loading={ loading } />
            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }
            { ! loading && data && (
                <>
                    <UtilityChart data={ data } />
                    <div className="wb-card">
                        <h3 className="wb-card__title">{ __( 'Monthly Breakdown by Utility', 'wincobank-dashboard' ) }</h3>
                        <div className="wb-table-wrap">
                            <table className="wb-table">
                                <thead>
                                    <tr>
                                        <th>{ __( 'Utility', 'wincobank-dashboard' ) }</th>
                                        { allMonths.map( ( m ) => <th key={ m }>{ m }</th> ) }
                                        <th>{ __( 'Total', 'wincobank-dashboard' ) }</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { Object.entries( data ).map( ( [ util, months ] ) => {
                                        const total = Object.values( months ).reduce( ( s, r ) => s + ( r.expenditure || 0 ), 0 );
                                        return (
                                            <tr key={ util }>
                                                <td>{ UTILITY_LABELS[ util ] ?? util }</td>
                                                { allMonths.map( ( m ) => (
                                                    <td key={ m }>{ months[ m ] ? formatCurrency( months[ m ].expenditure || 0 ) : '—' }</td>
                                                ) ) }
                                                <td style={ { fontWeight: 700 } }>{ formatCurrency( total ) }</td>
                                            </tr>
                                        );
                                    } ) }
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td>{ __( 'Total', 'wincobank-dashboard' ) }</td>
                                        { allMonths.map( ( m ) => (
                                            <td key={ m }>
                                                { formatCurrency(
                                                    Object.values( data ).reduce( ( s, months ) => s + ( months[ m ]?.expenditure || 0 ), 0 )
                                                ) }
                                            </td>
                                        ) ) }
                                        <td>
                                            { formatCurrency(
                                                Object.values( data ).reduce(
                                                    ( s, months ) => s + Object.values( months ).reduce( ( ss, r ) => ss + ( r.expenditure || 0 ), 0 ),
                                                    0
                                                )
                                            ) }
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            ) }
        </div>
    );
}
