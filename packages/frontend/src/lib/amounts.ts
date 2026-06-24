/**
 * Format a raw base-unit amount (bigint) into a human string using the token's
 * divisibility, without going through float (which would lose precision on
 * large balances).
 */
export function formatTokenAmount(raw: bigint, divisibility: number): string {
    if (divisibility <= 0) {
        return raw.toString();
    }
    const base = 10n ** BigInt(divisibility);
    const whole = raw / base;
    const frac = raw % base;
    if (frac === 0n) {
        return whole.toString();
    }
    const fracStr = frac.toString().padStart(divisibility, '0').replace(/0+$/, '');
    return `${whole.toString()}.${fracStr}`;
}
