// One place for the URLs this app hands people back to. The site is on
// build.wearemuloo.com until the www cutover; change the env vars then.
export const SITE_URL = (process.env.MULOO_SITE_URL || 'https://build.wearemuloo.com').replace(/\/$/, '');
export const GATE_URL = process.env.MULOO_GATE_URL || `${SITE_URL}/hubspot-audit`;
export const BOOK_URL = process.env.MULOO_BOOK_URL || `${SITE_URL}/book-a-call`;
