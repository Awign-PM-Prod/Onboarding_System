const NAME_MATCH_STOP_TOKENS = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'shri',
  'sri',
  'smt',
  'kumari',
  'kumar',
]);

export function normalizeForNameMatch(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInitialToken(token) {
  return token.length <= 2;
}

function significantNameTokens(name) {
  return normalizeForNameMatch(name)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !NAME_MATCH_STOP_TOKENS.has(token))
    .filter((token) => !isInitialToken(token));
}

/**
 * Compare two person names for PAN/Aadhaar/bank holder checks.
 * Handles middle initials, omitted middle names, and minor formatting differences.
 */
export function namesLikelyMatch(a, b) {
  const x = normalizeForNameMatch(a);
  const y = normalizeForNameMatch(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 4 && y.includes(x)) return true;
  if (y.length >= 4 && x.includes(y)) return true;

  const tokensA = significantNameTokens(a);
  const tokensB = significantNameTokens(b);
  if (!tokensA.length || !tokensB.length) return false;

  if (tokensA.join(' ') === tokensB.join(' ')) return true;

  if (
    tokensA[0] === tokensB[0] &&
    tokensA[tokensA.length - 1] === tokensB[tokensB.length - 1]
  ) {
    return true;
  }

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const longerSet = new Set(longer);
  const matched = shorter.filter((token) => longerSet.has(token)).length;
  return matched >= 2 && matched === shorter.length;
}
