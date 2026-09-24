import { getLanguage } from 'obsidian';
import { log } from 'architecture';
import en from './locale/en';
import es from './locale/es';
export const OBSIDIAN_LOCALE = getLanguage();

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

/**
 * A string with a **count in it**, in the right form for that count (#546 D2).
 *
 * The graph's status line read *"1 gaps"* next to *"1 notes"*, in both languages. A count is the
 * one kind of string that cannot be written once and be right, so the convention is: write the
 * plural under `key` and, when the singular differs, write it under `key_one`. A key with no
 * `_one` sibling simply keeps its one form -- which is correct for the many strings where the
 * count is never one, or where the phrasing already avoids the problem.
 *
 * `localeParity` checks that every `_one` has a sibling in both locales, so a half-translated
 * pair fails the build rather than showing English to a Spanish reader.
 */
export function tCount(count: number, key: keyof typeof en, ...args: string[]): string {
    const singular = `${key}_one` as keyof typeof en;
    const useSingular = Math.abs(count) === 1 && en[singular] !== undefined;
    return t(useSingular ? singular : key, ...args);
}
