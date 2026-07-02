/**
 * Regex-based secret scanner (sync, main thread).
 * Structured credential formats are clearer with patterns than with an ML classifier.
 */

interface SecretPattern {
  label: string;
  regex: RegExp;
  /** Custom replacer for match+capture groups. Defaults to redacting the whole match. */
  replacer?: (...groups: string[]) => string;
}

const REDACT = (label: string) => `[REDACTED:${label}]`;

const SECRET_PATTERNS: SecretPattern[] = [
  { label: "AWS Access Key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "GitHub Token", regex: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g },
  { label: "Slack Token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { label: "Google API Key", regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { label: "Stripe Key", regex: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { label: "OpenAI API Key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  {
    label: "Private Key Block",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  { label: "JWT", regex: /\bey[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g },
  {
    label: "Bearer Token",
    regex: /\b(Bearer\s+)([A-Za-z0-9\-_.=]{16,})\b/gi,
    replacer: (prefix) => `${prefix}[REDACTED]`,
  },
  {
    label: "Password / Secret Field",
    regex: /\b((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*)(['"]?)([^\s'",;]{4,})(['"]?)/gi,
    replacer: (keyAndSep, openQuote, _value, closeQuote) => `${keyAndSep}${openQuote}[REDACTED]${closeQuote}`,
  },
  {
    label: "Env-style Secret",
    regex: /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|APIKEY|PRIVATE_KEY)[A-Z0-9_]*)(\s*=\s*)(\S+)/g,
    replacer: (key, sep) => `${key}${sep}[REDACTED]`,
  },
];

function luhnCheck(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface CredentialScanResult {
  masked: string;
  /** Human-readable labels of credential types found, in order of first occurrence. */
  found: string[];
}

export function maskCredentials(text: string): CredentialScanResult {
  let masked = text;
  const found: string[] = [];
  const seen = new Set<string>();

  const markFound = (label: string) => {
    if (!seen.has(label)) {
      seen.add(label);
      found.push(label);
    }
  };

  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern.regex, (...args) => {
      const groups = args.slice(1, -2) as string[];
      markFound(pattern.label);
      return pattern.replacer ? pattern.replacer(...groups) : REDACT(pattern.label);
    });
  }

  /** Luhn check avoids flagging arbitrary long digit sequences. */
  masked = masked.replace(/\b(?:\d[ -]?){13,19}\b/g, (match) => {
    const digits = match.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnCheck(digits)) {
      markFound("Credit Card Number");
      return REDACT("Credit Card Number");
    }
    return match;
  });

  return { masked, found };
}
