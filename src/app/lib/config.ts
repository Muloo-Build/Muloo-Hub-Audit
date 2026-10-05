// One place for the URLs this app hands people back to. The site is on
// www.wearemuloo.com now on www; env vars can override.
export const SITE_URL = (process.env.MULOO_SITE_URL || 'https://www.wearemuloo.com').replace(/\/$/, '');
export const GATE_URL = process.env.MULOO_GATE_URL || `${SITE_URL}/hubspot-audit`;
export const BOOK_URL = process.env.MULOO_BOOK_URL || `${SITE_URL}/book-a-call`;
