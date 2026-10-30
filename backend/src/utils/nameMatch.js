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

/** Common single tokens that alone are too weak for a 1-token subset match. */
const WEAK_SINGLE_NAME_TOKENS = new Set([
  'singh',
  'devi',
  'prasad',
  'lal',
  'bai',
  'begum',
  'khan',
  'shaikh',
  'sheikh',
  'das',
  'nath',
  'chand',
  'pal',
  'rao',
  'reddy',
  'yadav',
  'patel',
  'sharma',
  'verma',
  'gupta',
  'agarwal',
  'agrawal',
  'jain',
  'mehta',
  'joshi',
  'pandey',
  'mishra',
  'tiwari',
  'dubey',
  'chaubey',
  'thakur',
  'chaudhary',
  'choudhary',
]);

/** Min length for accepting a single shared significant token as a match. */
const STRONG_SINGLE_TOKEN_MIN_LEN = 10;

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

function isStrongSingleTokenMatch(token) {
  return (
    token.length >= STRONG_SINGLE_TOKEN_MIN_LEN &&
    !WEAK_SINGLE_NAME_TOKENS.has(token) &&
    !NAME_MATCH_STOP_TOKENS.has(token)
  );
}

/** Substring needle: multi-word ok; single word only if long / uncommon. */
function isStrongSubstringNeedle(normalized) {
  if (!normalized || normalized.length < 4) return false;
  if (normalized.includes(' ')) return true;
  return isStrongSingleTokenMatch(normalized);
}

/**
 * Compare two person names for PAN/Aadhaar/bank holder checks.
 * Handles middle initials, omitted middle names, reversed order with a
 * long shared given name, and minor formatting differences.
 */
export function namesLikelyMatch(a, b) {
  const x = normalizeForNameMatch(a);
  const y = normalizeForNameMatch(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (isStrongSubstringNeedle(x) && y.includes(x)) return true;
  if (isStrongSubstringNeedle(y) && x.includes(y)) return true;

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
  if (matched === 0 || matched !== shorter.length) return false;
  if (matched >= 2) return true;
  return isStrongSingleTokenMatch(shorter[0]);
}
