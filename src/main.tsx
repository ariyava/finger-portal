import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Diagnostics from './Diagnostics';
import './styles.css';

const Page=new URLSearchParams(location.search).has('diagnostics') ? Diagnostics : App;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Page /></React.StrictMode>);
