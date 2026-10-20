import { render } from 'preact';
import { BRAND } from '../../lib/brand';
import { App } from './App';
import './style.css';

document.title = `${BRAND.name} settings`;
render(<App />, document.getElementById('root')!);
