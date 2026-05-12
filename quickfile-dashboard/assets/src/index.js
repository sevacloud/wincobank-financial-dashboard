import { render } from '@wordpress/element';
import App from './App';

const root = document.getElementById( 'qfd-root' );
if ( root ) {
    render( <App />, root );
}
