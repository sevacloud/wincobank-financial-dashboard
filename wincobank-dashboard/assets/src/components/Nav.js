import { __ } from '@wordpress/i18n';

const NAV_ITEMS = [
    { id: 'dashboard',        label: __( 'Dashboard',           'wincobank-dashboard' ), icon: '⊞' },
    { id: 'monthly-summary',  label: __( 'Monthly Summary',     'wincobank-dashboard' ), icon: '📊' },
    { id: 'projects',         label: __( 'Projects',            'wincobank-dashboard' ), icon: '🏷️' },
    { id: 'utilities',        label: __( 'Utilities',           'wincobank-dashboard' ), icon: '💡' },
    { id: 'annual-statement', label: __( 'Annual Statement',    'wincobank-dashboard' ), icon: '📋' },
    { id: 'year-comparison',  label: __( '3-Year Comparison',   'wincobank-dashboard' ), icon: '📈' },
];

export default function Nav( { activeView, onNavigate, isOpen, onClose } ) {
    const businessName = window.wincobankData?.businessName || __( 'QuickFile', 'wincobank-dashboard' );

    const handleNav = ( id ) => {
        onNavigate( id );
        onClose();
    };

    return (
        <>
            { isOpen && (
                <div
                    className="wb-nav-backdrop"
                    aria-hidden="true"
                    onClick={ onClose }
                />
            ) }

            <aside
                className={ `wb-sidebar${ isOpen ? ' wb-sidebar--open' : '' }` }
                role="navigation"
                aria-label={ __( 'Main navigation', 'wincobank-dashboard' ) }
            >
                <div className="wb-sidebar__header">
                    <div className="wb-sidebar__logo">
                        <h1>{ businessName }</h1>
                        <p>{ __( 'Financial Dashboard', 'wincobank-dashboard' ) }</p>
                    </div>
                    <button
                        className="wb-sidebar__close"
                        onClick={ onClose }
                        aria-label={ __( 'Close menu', 'wincobank-dashboard' ) }
                    >
                        ✕
                    </button>
                </div>

                <ul className="wb-nav" role="list">
                    { NAV_ITEMS.map( ( item ) => (
                        <li key={ item.id } className="wb-nav__item">
                            <button
                                className={ `wb-nav__btn${ activeView === item.id ? ' wb-nav__btn--active' : '' }` }
                                onClick={ () => handleNav( item.id ) }
                                aria-current={ activeView === item.id ? 'page' : undefined }
                            >
                                <span aria-hidden="true">{ item.icon }</span>
                                { item.label }
                            </button>
                        </li>
                    ) ) }
                </ul>

                <div className="wb-sidebar__footer">
                    { businessName }
                </div>
            </aside>
        </>
    );
}
