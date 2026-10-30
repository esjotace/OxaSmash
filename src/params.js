// The page's address options (?perf&lag=70...). Forgiving: options may also be separated by extra
// question marks (?perf?lag=70), a common slip.
export const pageParams = () => new URLSearchParams(typeof location === 'undefined' ? '' : location.search.replace(/\?/g, '&'));
