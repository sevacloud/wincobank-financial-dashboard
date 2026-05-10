import { render } from '@wordpress/element';
import App from './App';

const root = document.getElementById( 'wincobank-dashboard-root' );
if ( root ) {
    render( <App />, root );
}
