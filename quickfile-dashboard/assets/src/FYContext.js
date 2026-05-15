import { createContext, useContext } from '@wordpress/element';

export const FYContext = createContext( null );
export const useFY = () => useContext( FYContext );
