const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty',
  'Ninety',
];
const SCALES = ['', ' Thousand', ' Million', ' Billion'];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest < 20) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    parts.push(ones ? `${TENS[tens]}-${ONES[ones]}` : TENS[tens]);
  }
  return parts.join(' ');
}

/** Whole-number → English words (supports up to billions). */
function intToWords(n: number): string {
  if (n === 0) return 'Zero';
  const groups: string[] = [];
  let scale = 0;
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000;
    if (chunk) groups.unshift(threeDigitsToWords(chunk) + SCALES[scale]);
    n = Math.floor(n / 1000);
    scale += 1;
  }
  return groups.join(' ');
}

const CURRENCY_UNITS: Record<string, { major: string; minor: string }> = {
  USD: { major: 'dollar', minor: 'cent' },
  KHR: { major: 'riel', minor: 'sen' },
};

/**
 * Money → words for the voucher "Total Sum of … (in words)" line, e.g.
 * `amountToWords(7.5)` → "Seven dollars and fifty cents".
 */
export function amountToWords(amount: number, currency = 'USD'): string {
  const units = CURRENCY_UNITS[currency.toUpperCase()] ?? {
    major: currency.toLowerCase(),
    minor: 'cent',
  };
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const dollars = Math.floor(rounded);
  const cents = Math.round((rounded - dollars) * 100);

  const majorPlural = dollars === 1 ? units.major : `${units.major}s`;
  let words = `${intToWords(dollars)} ${majorPlural}`;
  if (cents > 0) {
    const minorPlural = cents === 1 ? units.minor : `${units.minor}s`;
    words += ` and ${intToWords(cents).toLowerCase()} ${minorPlural}`;
  }
  return words;
}
