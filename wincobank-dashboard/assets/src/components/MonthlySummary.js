import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import DateRangeControl from './DateRangeControl';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

const ACCOUNT_LABELS = {
    trust:   'Trust Account (HSBC)',
    chapel:  'Chapel House (Lloyds)',
    natwest: 'Chapel Bank (Natwest)',
};

const COLOURS = {
    income:      'rgba(13,110,110,.85)',
    expenditure: 'rgba(184,134,11,.85)',
};

function formatCurrency( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v );
}

function AccountChart( { label, months } ) {
    const canvasRef = useRef( null );
    const chartRef  = useRef( null );

    useEffect( () => {
        if ( ! canvasRef.current || ! months ) return;

        const labels  = Object.keys( months );
        const income  = labels.map( ( m ) => months[ m ].income       || 0 );
        const expend  = labels.map( ( m ) => months[ m ].expenditure  || 0 );

        import( 'chart.js/auto' ).then( ( { default: Chart } ) => {
            if ( chartRef.current ) chartRef.current.destroy();
            chartRef.current = new Chart( canvasRef.current, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { label: __( 'Income', 'wincobank-dashboard' ),      data: income,  backgroundColor: COLOURS.income },
                        { label: __( 'Expenditure', 'wincobank-dashboard' ), data: expend,  backgroundColor: COLOURS.expenditure },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
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
    }, [ months ] );

    return (
        <div className="wb-card">
            <h3 className="wb-card__title">{ label }</h3>
            <div className="wb-chart-wrap">
                <canvas ref={ canvasRef } aria-label={ `${ label } monthly income vs expenditure chart` } role="img" />
            </div>
            <div className="wb-table-wrap" style={ { marginTop: 16 } }>
                <table className="wb-table">
                    <thead>
                        <tr>
                            <th>{ __( 'Month', 'wincobank-dashboard' ) }</th>
                            <th>{ __( 'Income', 'wincobank-dashboard' ) }</th>
                            <th>{ __( 'Expenditure', 'wincobank-dashboard' ) }</th>
                            <th>{ __( 'Net', 'wincobank-dashboard' ) }</th>
                        </tr>
                    </thead>
                    <tbody>
                        { months && Object.entries( months ).map( ( [ month, row ] ) => (
                            <tr key={ month }>
                                <td>{ month }</td>
                                <td>{ formatCurrency( row.income || 0 ) }</td>
                                <td>{ formatCurrency( row.expenditure || 0 ) }</td>
                                <td>{ formatCurrency( ( row.income || 0 ) - ( row.expenditure || 0 ) ) }</td>
                            </tr>
                        ) ) }
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function MonthlySummary() {
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

    useEffect( () => { fetchData( fyStart, fyEnd ); }, [] );

    return (
        <div>
            <DateRangeControl onFetch={ fetchData } loading={ loading } />
            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }
            { ! loading && data && Object.entries( data ).map( ( [ key, months ] ) => (
                <AccountChart key={ key } label={ ACCOUNT_LABELS[ key ] ?? key } months={ months } />
            ) ) }
            { ! loading && ! data && ! error && (
                <p className="wb-empty">{ __( 'Select a date range and click Load Data.', 'wincobank-dashboard' ) }</p>
            ) }
        </div>
    );
}
