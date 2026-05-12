import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Nav from './components/Nav';
import Dashboard from './components/Dashboard';
import MonthlySummary from './components/MonthlySummary';
import Projects from './components/Projects';
import Utilities from './components/Utilities';
import AnnualStatement from './components/AnnualStatement';
import YearComparison from './components/YearComparison';
import './styles/dashboard.css';

const VIEW_TITLES = {
    'dashboard':        __( 'Dashboard',           'quickfile-dashboard' ),
    'monthly-summary':  __( 'Monthly Summary',     'quickfile-dashboard' ),
    'projects':         __( 'Projects',            'quickfile-dashboard' ),
    'utilities':        __( 'Utilities',           'quickfile-dashboard' ),
    'annual-statement': __( 'Annual Statement',    'quickfile-dashboard' ),
    'year-comparison':  __( '3-Year Comparison',   'quickfile-dashboard' ),
};

function ViewContent( { view } ) {
    switch ( view ) {
        case 'dashboard':        return <Dashboard />;
        case 'monthly-summary':  return <MonthlySummary />;
        case 'projects':         return <Projects />;
        case 'utilities':        return <Utilities />;
        case 'annual-statement': return <AnnualStatement />;
        case 'year-comparison':  return <YearComparison />;
        default:                 return <Dashboard />;
    }
}

function viewFromHash() {
    const h = window.location.hash.slice( 1 );
    return VIEW_TITLES[ h ] ? h : 'dashboard';
}

export default function App() {
    const [ view, setView ]         = useState( viewFromHash );
    const [ menuOpen, setMenuOpen ] = useState( false );

    // Keep view in sync with browser back/forward and direct URL navigation.
    useEffect( () => {
        const onHash = () => setView( viewFromHash() );
        window.addEventListener( 'hashchange', onHash );
        return () => window.removeEventListener( 'hashchange', onHash );
    }, [] );

    const navigate = useCallback( ( v ) => {
        window.location.hash = v;
        setView( v );
    }, [] );

    const now = new Date().toLocaleDateString( 'en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    } );

    return (
        <div className="wb-layout">
            <Nav
                activeView={ view }
                onNavigate={ navigate }
                isOpen={ menuOpen }
                onClose={ () => setMenuOpen( false ) }
            />
            <main className="wb-main" id="main-content" tabIndex="-1">
                <header className="wb-topbar">
                    <div className="wb-topbar__left">
                        <button
                            className="wb-burger"
                            onClick={ () => setMenuOpen( true ) }
                            aria-label={ __( 'Open menu', 'quickfile-dashboard' ) }
                            aria-expanded={ menuOpen }
                            aria-controls="wb-sidebar"
                        >
                            <span /><span /><span />
                        </button>
                        <span className="wb-topbar__title">{ VIEW_TITLES[ view ] }</span>
                    </div>
                    <span className="wb-topbar__meta">
                        { window.qfdData?.businessName || __( 'QuickFile Dashboard', 'quickfile-dashboard' ) }
                        { ' · ' }{ now }
                    </span>
                </header>
                <div className="wb-content">
                    <ViewContent view={ view } />
                </div>
            </main>
        </div>
    );
}
