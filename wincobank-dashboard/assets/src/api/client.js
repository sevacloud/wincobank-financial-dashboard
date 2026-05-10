const { restUrl, nonce } = window.wincobankData || {};

async function apiFetch( path, params = {} ) {
    const url = new URL( restUrl + path );
    Object.entries( params ).forEach( ( [ k, v ] ) => url.searchParams.set( k, v ) );

    const res = await fetch( url.toString(), {
        headers: {
            'X-WP-Nonce': nonce,
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
    } );

    if ( ! res.ok ) {
        const err = await res.json().catch( () => ( { message: res.statusText } ) );
        throw new Error( err.message || `HTTP ${ res.status }` );
    }

    return res.json();
}

export const api = {
    getBalances: () => apiFetch( '/balances' ),
    getMonthlySummary: ( from, to ) => apiFetch( '/monthly-summary', { from, to } ),
    getAnnualStatement: ( from, to ) => apiFetch( '/annual-statement', { from, to } ),
    getProjects: ( from, to ) => apiFetch( '/projects', { from, to } ),
    getUtilities: ( from, to ) => apiFetch( '/utilities', { from, to } ),
    getYearComparison: ( years ) => apiFetch( '/year-comparison', { years: years.join( ',' ) } ),
};
