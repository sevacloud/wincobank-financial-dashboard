import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { api } from '../api/client';
import { LoadingSpinner } from './LoadingSpinner';

const { fyStart, fyEnd } = window.wincobankData || {};

function fmt( v ) {
    return new Intl.NumberFormat( 'en-GB', { style: 'currency', currency: 'GBP' } ).format( v ?? 0 );
}

function fmtDate( iso ) {
    if ( ! iso ) return '—';
    return new Date( iso ).toLocaleDateString( 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    } );
}

export default function TransactionList( { accountKey, accountLabel, onClose } ) {
    const [ from,     setFrom     ] = useState( fyStart );
    const [ to,       setTo       ] = useState( fyEnd );
    const [ data,     setData     ] = useState( null );
    const [ loading,  setLoading  ] = useState( false );
    const [ error,    setError    ] = useState( null );

    const fetchData = useCallback( ( f, t ) => {
        setLoading( true );
        setError( null );
        api.getTransactions( accountKey, f, t )
            .then( setData )
            .catch( ( e ) => setError( e.message ) )
            .finally( () => setLoading( false ) );
    }, [ accountKey ] );

    useEffect( () => { fetchData( from, to ); }, [ fetchData ] );

    // Close on Escape key
    useEffect( () => {
        const handler = ( e ) => { if ( e.key === 'Escape' ) onClose(); };
        document.addEventListener( 'keydown', handler );
        return () => document.removeEventListener( 'keydown', handler );
    }, [ onClose ] );

    const meta         = data?.meta         ?? {};
    const transactions = data?.transactions ?? [];

    return (
        <>
            <div className="wb-drawer-backdrop" onClick={ onClose } />
            <div className="wb-drawer" role="dialog" aria-modal="true" aria-label={ accountLabel }>

                <div className="wb-drawer__header">
                    <div>
                        <div className="wb-drawer__title">{ meta.BankName || accountLabel }</div>
                        { meta.CurrentBalance != null && (
                            <div className="wb-drawer__subtitle">
                                { __( 'Current balance:', 'wincobank-dashboard' ) }
                                { ' ' }
                                <strong>{ fmt( meta.CurrentBalance ) }</strong>
                            </div>
                        ) }
                    </div>
                    <button
                        className="wb-drawer__close"
                        onClick={ onClose }
                        aria-label={ __( 'Close', 'wincobank-dashboard' ) }
                    >✕</button>
                </div>

                <div className="wb-drawer__controls">
                    <label>
                        { __( 'From', 'wincobank-dashboard' ) }
                        <input type="date" value={ from } onChange={ ( e ) => setFrom( e.target.value ) } />
                    </label>
                    <label>
                        { __( 'To', 'wincobank-dashboard' ) }
                        <input type="date" value={ to } onChange={ ( e ) => setTo( e.target.value ) } />
                    </label>
                    <button
                        className="wb-btn wb-btn--secondary"
                        onClick={ () => fetchData( from, to ) }
                        disabled={ loading }
                    >
                        { loading ? __( 'Loading…', 'wincobank-dashboard' ) : __( 'Load', 'wincobank-dashboard' ) }
                    </button>
                </div>

                <div className="wb-drawer__body">
                    { loading && <LoadingSpinner /> }

                    { error && (
                        <div className="wb-error">{ error }</div>
                    ) }

                    { ! loading && ! error && transactions.length === 0 && (
                        <p className="wb-empty">
                            { __( 'No transactions found for this period.', 'wincobank-dashboard' ) }
                        </p>
                    ) }

                    { ! loading && transactions.length > 0 && (
                        <div className="wb-table-wrap">
                            <table className="wb-table wb-table--txn">
                                <thead>
                                    <tr>
                                        <th>{ __( 'Date',      'wincobank-dashboard' ) }</th>
                                        <th>{ __( 'Reference', 'wincobank-dashboard' ) }</th>
                                        <th className="wb-num">{ __( 'Amount',  'wincobank-dashboard' ) }</th>
                                        <th className="wb-num">{ __( 'Balance', 'wincobank-dashboard' ) }</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    { transactions.map( ( t, i ) => (
                                        <tr key={ t.TransactionId ?? i }>
                                            <td className="wb-nowrap">{ fmtDate( t.TransactionDate ) }</td>
                                            <td>{ t.Reference || '—' }</td>
                                            <td className="wb-num" style={ {
                                                color: t.Amount >= 0 ? 'var(--rag-green)' : 'var(--rag-red)',
                                                fontWeight: 600,
                                            } }>
                                                { fmt( t.Amount ) }
                                            </td>
                                            <td className="wb-num">{ fmt( t.Balance ) }</td>
                                        </tr>
                                    ) ) }
                                </tbody>
                            </table>
                        </div>
                    ) }
                </div>

            </div>
        </>
    );
}
