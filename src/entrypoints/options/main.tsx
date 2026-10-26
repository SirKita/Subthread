import { render } from 'preact';
import { BRAND } from '../../lib/brand';
import { t, uiLanguage } from '../../lib/i18n';
import { App } from './App';
import './style.css';

document.documentElement.lang = uiLanguage();
document.title = t('optionsTitle', BRAND.name);
render(<App />, document.getElementById('root')!);
