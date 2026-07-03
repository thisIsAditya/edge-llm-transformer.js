export interface ErrorSpan {
  start: number;
  end: number;
  original: string;
  suggestion: string;
}

interface Token {
  text: string;
  start: number;
  end: number;
  isWord: boolean;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+|\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      isWord: /\S/.test(m[0]),
    });
  }
  return tokens;
}

function lcsIndices(
  aWords: Token[],
  bWords: Token[]
): Array<[number, number]> {
  const m = aWords.length;
  const n = bWords.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aWords[i - 1]!.text === bWords[j - 1]!.text) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (aWords[i - 1]!.text === bWords[j - 1]!.text) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }
  return pairs.reverse();
}

export function diffWords(original: string, corrected: string): ErrorSpan[] {
  if (original === corrected) return [];

  const aTokens = tokenize(original);
  const bTokens = tokenize(corrected);

  const aWords = aTokens.filter((t) => t.isWord);
  const bWords = bTokens.filter((t) => t.isWord);

  const matched = lcsIndices(aWords, bWords);

  const spans: ErrorSpan[] = [];

  let ai = 0;
  let bi = 0;
  let matchIdx = 0;

  while (ai < aWords.length || bi < bWords.length) {
    const nextMatch = matched[matchIdx];

    const aMatch = nextMatch?.[0] ?? aWords.length;
    const bMatch = nextMatch?.[1] ?? bWords.length;

    if (ai === aMatch && bi === bMatch) {
      ai++;
      bi++;
      matchIdx++;
      continue;
    }

    const aRun: Token[] = [];
    const bRun: Token[] = [];

    while (ai < aMatch) {
      aRun.push(aWords[ai]!);
      ai++;
    }
    while (bi < bMatch) {
      bRun.push(bWords[bi]!);
      bi++;
    }

    if (aRun.length > 0 || bRun.length > 0) {
      const spanStart = aRun.length > 0 ? aRun[0]!.start : (aWords[ai] ? aWords[ai]!.start : original.length);
      const spanEnd = aRun.length > 0 ? aRun[aRun.length - 1]!.end : spanStart;
      const originalText = original.slice(spanStart, spanEnd);
      const suggestion = bRun.map((t) => t.text).join(" ");

      if (originalText !== suggestion) {
        spans.push({
          start: spanStart,
          end: spanEnd,
          original: originalText,
          suggestion,
        });
      }
    }
  }

  return spans;
}
