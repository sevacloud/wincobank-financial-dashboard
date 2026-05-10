import { __ } from '@wordpress/i18n';

const NAV_ITEMS = [
    { id: 'dashboard',        label: __( 'Dashboard',           'wincobank-dashboard' ), icon: '⊞' },
    { id: 'monthly-summary',  label: __( 'Monthly Summary',     'wincobank-dashboard' ), icon: '📊' },
    { id: 'projects',         label: __( 'Projects',            'wincobank-dashboard' ), icon: '🏷️' },
    { id: 'utilities',        label: __( 'Utilities',           'wincobank-dashboard' ), icon: '💡' },
    { id: 'annual-statement', label: __( 'Annual Statement',    'wincobank-dashboard' ), icon: '📋' },
    { id: 'year-comparison',  label: __( '3-Year Comparison',   'wincobank-dashboard' ), icon: '📈' },
];

export default function Nav( { activeView, onNavigate } ) {
    return (
        <aside className="wb-sidebar" role="navigation" aria-label={ __( 'Main navigation', 'wincobank-dashboard' ) }>
            <div className="wb-sidebar__logo">
                <h1>{ __( 'Wincobank', 'wincobank-dashboard' ) }</h1>
                <p>{ __( 'Trustee Dashboard', 'wincobank-dashboard' ) }</p>
            </div>
            <ul className="wb-nav" role="list">
                { NAV_ITEMS.map( ( item ) => (
                    <li key={ item.id } className="wb-nav__item">
                        <button
                            className={ `wb-nav__btn${ activeView === item.id ? ' wb-nav__btn--active' : '' }` }
                            onClick={ () => onNavigate( item.id ) }
                            aria-current={ activeView === item.id ? 'page' : undefined }
                        >
                            <span aria-hidden="true">{ item.icon }</span>
                            { item.label }
                        </button>
                    </li>
                ) ) }
            </ul>
            <div className="wb-sidebar__footer">
                { __( 'The Charity of Mary Ann Rawson', 'wincobank-dashboard' ) }
            </div>
        </aside>
    );
}
