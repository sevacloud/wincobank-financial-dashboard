import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import DateRangeControl from './DateRangeControl';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

function formatCurrency( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v );
}

function ProjectCard( { project } ) {
    const [ expanded, setExpanded ] = useState( false );
    const budget  = parseFloat( project.tag?.Budget ?? 0 );
    const actual  = parseFloat( project.total ?? 0 );
    const pct     = budget > 0 ? Math.min( ( actual / budget ) * 100, 100 ) : null;
    const rag     = budget > 0
        ? ( actual <= budget * 0.8 ? 'green' : actual <= budget ? 'amber' : 'red' )
        : null;

    return (
        <div className="wb-card" style={ { marginBottom: 16 } }>
            <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 } }>
                <div>
                    <h3 className="wb-card__title" style={ { marginBottom: 4, paddingBottom: 0, border: 'none' } }>
                        { project.tag?.TagName ?? __( 'Unknown Project', 'wincobank-dashboard' ) }
                    </h3>
                    { project.tag?.Description && (
                        <p style={ { fontSize: '.85rem', color: 'var(--muted)', marginBottom: 8 } }>{ project.tag.Description }</p>
                    ) }
                </div>
                { rag && <span className={ `wb-rag wb-rag--${ rag }` }>{ rag === 'green' ? '● On Budget' : rag === 'amber' ? '● Near Limit' : '● Over Budget' }</span> }
            </div>

            <div style={ { display: 'flex', gap: 32, marginBottom: pct !== null ? 12 : 0, flexWrap: 'wrap' } }>
                <div>
                    <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase' } }>{ __( 'Actual Spend', 'wincobank-dashboard' ) }</div>
                    <div style={ { fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy)' } }>{ formatCurrency( actual ) }</div>
                </div>
                { budget > 0 && (
                    <div>
                        <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase' } }>{ __( 'Budget', 'wincobank-dashboard' ) }</div>
                        <div style={ { fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy)' } }>{ formatCurrency( budget ) }</div>
                    </div>
                ) }
                { budget > 0 && (
                    <div>
                        <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase' } }>{ __( 'Remaining', 'wincobank-dashboard' ) }</div>
                        <div style={ { fontSize: '1.25rem', fontWeight: 700, color: budget - actual >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                            { formatCurrency( budget - actual ) }
                        </div>
                    </div>
                ) }
            </div>

            { pct !== null && (
                <div style={ { height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 12, overflow: 'hidden' } }>
                    <div style={ { height: '100%', width: `${ pct }%`, background: rag === 'red' ? 'var(--rag-red)' : rag === 'amber' ? 'var(--gold)' : 'var(--teal)', borderRadius: 4, transition: 'width .4s' } } />
                </div>
            ) }

            { project.invoices?.length > 0 && (
                <>
                    <button
                        className="wb-btn wb-btn--secondary"
                        style={ { fontSize: '.8125rem', padding: '5px 12px', marginBottom: expanded ? 12 : 0 } }
                        onClick={ () => setExpanded( ! expanded ) }
                        aria-expanded={ expanded }
                    >
                        { expanded ? __( 'Hide Invoices', 'wincobank-dashboard' ) : __( `Show ${ project.invoices.length } Invoice(s)`, 'wincobank-dashboard' ) }
                    </button>
                    { expanded && (
                        <div className="wb-table-wrap" style={ { marginTop: 4 } }>
                            <table className="wb-table">
                                <thead>
                                    <tr>
                                        <th>{ __( 'Invoice #', 'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Date', 'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Supplier', 'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Amount', 'wincobank-dashboard' ) }</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { project.invoices.map( ( inv, i ) => (
                                        <tr key={ inv.InvoiceID ?? i }>
                                            <td>{ inv.InvoiceNumber ?? inv.InvoiceID }</td>
                                            <td>{ inv.InvoiceDate }</td>
                                            <td>{ inv.SupplierName ?? inv.ClientName ?? '—' }</td>
                                            <td>{ formatCurrency( inv.TotalAmount ?? 0 ) }</td>
                                        </tr>
                                    ) ) }
                                </tbody>
                            </table>
                        </div>
                    ) }
                </>
            ) }
        </div>
    );
}

export default function Projects() {
    const [ data,    setData    ] = useState( null );
    const [ loading, setLoading ] = useState( false );
    const [ error,   setError   ] = useState( null );

    const fetchData = ( from, to ) => {
        setLoading( true );
        setError( null );
        api.getProjects( from, to )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    };

    useEffect( () => { fetchData( fyStart, fyEnd ); }, [] );

    const totalSpend = data ? data.reduce( ( s, p ) => s + parseFloat( p.total ?? 0 ), 0 ) : 0;

    return (
        <div>
            <DateRangeControl onFetch={ fetchData } loading={ loading } />
            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }
            { ! loading && data && (
                <>
                    <div className="wb-card" style={ { marginBottom: 24 } }>
                        <div style={ { display: 'flex', gap: 32 } }>
                            <div>
                                <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase' } }>{ __( 'Total Projects', 'wincobank-dashboard' ) }</div>
                                <div style={ { fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy)' } }>{ data.length }</div>
                            </div>
                            <div>
                                <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase' } }>{ __( 'Total Spend', 'wincobank-dashboard' ) }</div>
                                <div style={ { fontSize: '1.5rem', fontWeight: 800, color: 'var(--navy)' } }>{ formatCurrency( totalSpend ) }</div>
                            </div>
                        </div>
                    </div>
                    { data.map( ( project, i ) => (
                        <ProjectCard key={ project.tag?.TagID ?? i } project={ project } />
                    ) ) }
                    { data.length === 0 && (
                        <p className="wb-empty">{ __( 'No projects found for this period.', 'wincobank-dashboard' ) }</p>
                    ) }
                </>
            ) }
        </div>
    );
}
