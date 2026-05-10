import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import DateRangeControl from './DateRangeControl';
import { LoadingSpinner, ErrorMessage } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

function fmt( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

// RAG against budget: remaining = budget − spend
// green  = remaining ≥ 0     (on / under budget)
// amber  = remaining ≥ −500  (within £500 over)
// red    = remaining < −500  (significantly over)
function ragStatus( remaining ) {
    if ( remaining >= 0 )    return 'green';
    if ( remaining >= -500 ) return 'amber';
    return 'red';
}

const RAG_LABELS = {
    green: __( '● Under Budget', 'wincobank-dashboard' ),
    amber: __( '● Near Limit',   'wincobank-dashboard' ),
    red:   __( '● Over Budget',  'wincobank-dashboard' ),
};

// ─── Inline budget editor ────────────────────────────────────────────────────

function BudgetEditor( { tagId, budget, onSaved } ) {
    const [ editing,   setEditing   ] = useState( false );
    const [ inputVal,  setInputVal  ] = useState( String( budget ) );
    const [ saving,    setSaving    ] = useState( false );
    const [ saveError, setSaveError ] = useState( null );

    // Keep input in sync when parent updates the budget prop
    useEffect( () => {
        if ( ! editing ) setInputVal( String( budget ) );
    }, [ budget, editing ] );

    const handleSave = async () => {
        const parsed = parseFloat( inputVal );
        if ( isNaN( parsed ) || parsed < 0 ) return;
        setSaving( true );
        setSaveError( null );
        try {
            await api.saveProjectBudget( tagId, parsed );
            onSaved( tagId, parsed );
            setEditing( false );
        } catch ( e ) {
            setSaveError( e.message );
        } finally {
            setSaving( false );
        }
    };

    const handleCancel = () => {
        setEditing( false );
        setInputVal( String( budget ) );
        setSaveError( null );
    };

    if ( ! editing ) {
        return (
            <div style={ { display: 'flex', alignItems: 'center', gap: 8 } }>
                <span style={ { fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy)' } }>
                    { budget > 0 ? fmt( budget ) : <em style={ { color: 'var(--muted)', fontWeight: 400, fontSize: '1rem' } }>{ __( 'Not set', 'wincobank-dashboard' ) }</em> }
                </span>
                <button
                    className="wb-btn wb-btn--secondary"
                    style={ { fontSize: '.75rem', padding: '3px 10px' } }
                    onClick={ () => setEditing( true ) }
                    aria-label={ __( 'Edit budget', 'wincobank-dashboard' ) }
                >
                    { __( 'Edit', 'wincobank-dashboard' ) }
                </button>
            </div>
        );
    }

    return (
        <div style={ { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }>
            <span style={ { fontSize: '.875rem', color: 'var(--muted)' } }>£</span>
            <input
                type="number"
                min="0"
                step="0.01"
                value={ inputVal }
                onChange={ ( e ) => setInputVal( e.target.value ) }
                style={ { width: 120, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.875rem' } }
                autoFocus
                onKeyDown={ ( e ) => { if ( e.key === 'Enter' ) handleSave(); if ( e.key === 'Escape' ) handleCancel(); } }
            />
            <button
                className="wb-btn"
                style={ { fontSize: '.75rem', padding: '4px 12px' } }
                onClick={ handleSave }
                disabled={ saving }
            >
                { saving ? __( 'Saving…', 'wincobank-dashboard' ) : __( 'Save', 'wincobank-dashboard' ) }
            </button>
            <button
                className="wb-btn wb-btn--secondary"
                style={ { fontSize: '.75rem', padding: '4px 10px' } }
                onClick={ handleCancel }
                disabled={ saving }
            >
                { __( 'Cancel', 'wincobank-dashboard' ) }
            </button>
            { saveError && (
                <span style={ { color: 'var(--rag-red)', fontSize: '.8125rem' } }>{ saveError }</span>
            ) }
        </div>
    );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard( { project, budget, onBudgetSaved } ) {
    const [ expanded, setExpanded ] = useState( false );

    const tagId    = project.tag?.TagID;
    const name     = project.tag?.TagName     ?? __( 'Unknown Project', 'wincobank-dashboard' );
    const desc     = project.tag?.Description ?? '';
    const spend    = parseFloat( project.total ?? 0 );
    const hasBudget = budget > 0;
    const remaining = hasBudget ? budget - spend : null;
    const pct       = hasBudget ? Math.min( ( spend / budget ) * 100, 100 ) : null;
    const rag       = remaining !== null ? ragStatus( remaining ) : null;

    const barColour = rag === 'red' ? 'var(--rag-red)' : rag === 'amber' ? 'var(--gold)' : 'var(--teal)';

    return (
        <div className="wb-card" style={ { marginBottom: 16 } }>

            {/* ── Header ── */}
            <div style={ { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 } }>
                <div>
                    <div className="wb-card__title" style={ { marginBottom: desc ? 4 : 0, paddingBottom: 0, border: 'none' } }>
                        { name }
                    </div>
                    { desc && (
                        <p style={ { fontSize: '.85rem', color: 'var(--muted)' } }>{ desc }</p>
                    ) }
                </div>
                { rag && (
                    <span className={ `wb-rag wb-rag--${ rag }` }>{ RAG_LABELS[ rag ] }</span>
                ) }
            </div>

            {/* ── Stats row ── */}
            <div style={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: pct !== null ? 14 : 0 } }>

                <div>
                    <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }>
                        { __( 'Budget', 'wincobank-dashboard' ) }
                    </div>
                    <BudgetEditor tagId={ tagId } budget={ budget } onSaved={ onBudgetSaved } />
                </div>

                <div>
                    <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }>
                        { __( 'Total Spend', 'wincobank-dashboard' ) }
                    </div>
                    <div style={ { fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy)' } }>
                        { fmt( spend ) }
                    </div>
                </div>

                { hasBudget && (
                    <div>
                        <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 } }>
                            { __( 'Remaining', 'wincobank-dashboard' ) }
                        </div>
                        <div style={ { fontSize: '1.25rem', fontWeight: 700, color: remaining >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                            { fmt( remaining ) }
                        </div>
                    </div>
                ) }

                { hasBudget && pct !== null && (
                    <div style={ { alignSelf: 'center' } }>
                        <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 } }>
                            { __( 'Budget used', 'wincobank-dashboard' ) }
                        </div>
                        <div style={ { height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' } }>
                            <div style={ {
                                height: '100%',
                                width: `${ pct }%`,
                                background: barColour,
                                borderRadius: 5,
                                transition: 'width .4s',
                            } } />
                        </div>
                        <div style={ { fontSize: '.75rem', color: 'var(--muted)', marginTop: 4 } }>
                            { pct.toFixed( 1 ) }%
                        </div>
                    </div>
                ) }
            </div>

            {/* ── Invoice accordion ── */}
            { project.invoices?.length > 0 && (
                <>
                    <button
                        className="wb-btn wb-btn--secondary"
                        style={ { fontSize: '.8125rem', padding: '5px 14px', marginTop: 12 } }
                        onClick={ () => setExpanded( ! expanded ) }
                        aria-expanded={ expanded }
                    >
                        { expanded
                            ? __( 'Hide Invoices', 'wincobank-dashboard' )
                            : `${ __( 'Show', 'wincobank-dashboard' ) } ${ project.invoices.length } ${ __( 'invoice(s)', 'wincobank-dashboard' ) }` }
                    </button>

                    { expanded && (
                        <div className="wb-table-wrap" style={ { marginTop: 12 } }>
                            <table className="wb-table">
                                <thead>
                                    <tr>
                                        <th>{ __( 'Invoice #',  'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Date',       'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Supplier',   'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Amount',     'wincobank-dashboard' ) }</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { project.invoices.map( ( inv, i ) => (
                                        <tr key={ inv.InvoiceID ?? i }>
                                            <td>{ inv.InvoiceNumber ?? inv.InvoiceID }</td>
                                            <td>{ inv.InvoiceDate }</td>
                                            <td>{ inv.SupplierName ?? inv.ClientName ?? '—' }</td>
                                            <td>{ fmt( inv.TotalAmount ?? 0 ) }</td>
                                        </tr>
                                    ) ) }
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={ 3 }>{ __( 'Total', 'wincobank-dashboard' ) }</td>
                                        <td>{ fmt( spend ) }</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    ) }
                </>
            ) }
        </div>
    );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar( { projects, budgets } ) {
    const totalSpend  = projects.reduce( ( s, p ) => s + parseFloat( p.total ?? 0 ), 0 );
    const totalBudget = projects.reduce( ( s, p ) => {
        const b = budgets[ p.tag?.TagID ] ?? 0;
        return s + b;
    }, 0 );
    const remaining = totalBudget > 0 ? totalBudget - totalSpend : null;

    return (
        <div className="wb-card" style={ { marginBottom: 24 } }>
            <div style={ { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 20 } }>
                <div>
                    <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' } }>
                        { __( 'Total Projects', 'wincobank-dashboard' ) }
                    </div>
                    <div style={ { fontSize: '1.75rem', fontWeight: 800, color: 'var(--navy)' } }>
                        { projects.length }
                    </div>
                </div>
                <div>
                    <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' } }>
                        { __( 'Total Budget', 'wincobank-dashboard' ) }
                    </div>
                    <div style={ { fontSize: '1.75rem', fontWeight: 800, color: 'var(--navy)' } }>
                        { totalBudget > 0 ? fmt( totalBudget ) : '—' }
                    </div>
                </div>
                <div>
                    <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' } }>
                        { __( 'Total Spend', 'wincobank-dashboard' ) }
                    </div>
                    <div style={ { fontSize: '1.75rem', fontWeight: 800, color: 'var(--navy)' } }>
                        { fmt( totalSpend ) }
                    </div>
                </div>
                { remaining !== null && (
                    <div>
                        <div style={ { fontSize: '.75rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' } }>
                            { __( 'Remaining', 'wincobank-dashboard' ) }
                        </div>
                        <div style={ { fontSize: '1.75rem', fontWeight: 800, color: remaining >= 0 ? 'var(--rag-green)' : 'var(--rag-red)' } }>
                            { fmt( remaining ) }
                        </div>
                    </div>
                ) }
            </div>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Projects() {
    const [ projects, setProjects ] = useState( null );
    const [ budgets,  setBudgets  ] = useState( {} );
    const [ loading,  setLoading  ] = useState( false );
    const [ error,    setError    ] = useState( null );

    const fetchData = ( from, to ) => {
        setLoading( true );
        setError( null );
        Promise.all( [ api.getProjects( from, to ), api.getProjectBudgets() ] )
            .then( ( [ proj, budg ] ) => {
                setProjects( proj );
                setBudgets( budg );
            } )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    };

    useEffect( () => { fetchData( fyStart, fyEnd ); }, [] );

    const handleBudgetSaved = useCallback( ( tagId, newBudget ) => {
        setBudgets( ( prev ) => ( { ...prev, [ tagId ]: newBudget } ) );
    }, [] );

    return (
        <div>
            <DateRangeControl onFetch={ fetchData } loading={ loading } />
            { error && <ErrorMessage message={ error } /> }
            { loading && <LoadingSpinner /> }

            { ! loading && projects && (
                <>
                    <SummaryBar projects={ projects } budgets={ budgets } />

                    { projects.map( ( project, i ) => (
                        <ProjectCard
                            key={ project.tag?.TagID ?? i }
                            project={ project }
                            budget={ budgets[ project.tag?.TagID ] ?? 0 }
                            onBudgetSaved={ handleBudgetSaved }
                        />
                    ) ) }

                    { projects.length === 0 && (
                        <p className="wb-empty">
                            { __( 'No projects found for this period.', 'wincobank-dashboard' ) }
                        </p>
                    ) }
                </>
            ) }

            { ! loading && ! projects && ! error && (
                <p className="wb-empty">
                    { __( 'Select a date range and click Load Data.', 'wincobank-dashboard' ) }
                </p>
            ) }
        </div>
    );
}
