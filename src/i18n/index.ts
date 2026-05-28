import { en } from './en';

export function t(key: string, params: Record<string, string | number> = {}): string {
  let s = en[key] ?? key;
  for (const [k, v] of Object.entries(params)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
