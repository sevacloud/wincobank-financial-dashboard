import { useState } from '@wordpress/element';
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
    'dashboard':        __( 'Dashboard',           'wincobank-dashboard' ),
    'monthly-summary':  __( 'Monthly Summary',     'wincobank-dashboard' ),
    'projects':         __( 'Projects',            'wincobank-dashboard' ),
    'utilities':        __( 'Utilities',           'wincobank-dashboard' ),
    'annual-statement': __( 'Annual Statement',    'wincobank-dashboard' ),
    'year-comparison':  __( '3-Year Comparison',   'wincobank-dashboard' ),
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

export default function App() {
    const [ view, setView ]       = useState( 'dashboard' );
    const [ menuOpen, setMenuOpen ] = useState( false );

    const now = new Date().toLocaleDateString( 'en-GB', {
        day: '2-digit', month: 'long', year: 'numeric',
    } );

    return (
        <div className="wb-layout">
            <Nav
                activeView={ view }
                onNavigate={ setView }
                isOpen={ menuOpen }
                onClose={ () => setMenuOpen( false ) }
            />
            <main className="wb-main" id="main-content" tabIndex="-1">
                <header className="wb-topbar">
                    <div className="wb-topbar__left">
                        <button
                            className="wb-burger"
                            onClick={ () => setMenuOpen( true ) }
                            aria-label={ __( 'Open menu', 'wincobank-dashboard' ) }
                            aria-expanded={ menuOpen }
                            aria-controls="wb-sidebar"
                        >
                            <span /><span /><span />
                        </button>
                        <span className="wb-topbar__title">{ VIEW_TITLES[ view ] }</span>
                    </div>
                    <span className="wb-topbar__meta">
                        { __( 'The Charity of Mary Ann Rawson for Wincobank School', 'wincobank-dashboard' ) }
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
