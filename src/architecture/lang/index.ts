import { log } from 'architecture';
import en from './locale/en';
import es from './locale/es';
export const OBSIDIAN_LOCALE = localStorage.getItem('language');

const localeMap: { [k: string]: Partial<typeof en> } = {
    en,
    es
};

const locale = localeMap[OBSIDIAN_LOCALE || 'en'];

export function t(str: keyof typeof en, ...args: string[]): string {
    if (!locale) {
      log.error('Error: database locale not found', OBSIDIAN_LOCALE);
    }
    const translated = (locale && locale[str]) || en[str];
  
    if (!translated) {
        log.warn('String key not found in locale', str);
      return str;
    }
  
    // Replace any arguments in the string
    return args.reduce((acc, arg, i) => acc.replace(`{${i}}`, arg), translated);
  }