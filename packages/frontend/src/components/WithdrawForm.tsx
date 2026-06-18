import { useCallback, useEffect, useMemo, useState } from 'react';
import { OdinUtils } from 'odin-connect';
import type { OdinBalance } from 'odin-connect';
import { Principal } from '@dfinity/principal';

import { useOdinConnect } from '../odin/useOdinConnect';
import { useCanisterActor } from '../canister/useCanisterActor';
import { useInternalBalances } from '../canister/useInternalBalances';
import { APP_CANISTER_ID } from '../canister/config';
import { formatTokenAmount } from '../lib/amounts';

type Stage = 'idle' | 'withdrawing' | 'done';

function toMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : 'Unexpected error';
}

const styles: Record<string, React.CSSProperties> = {
    card: {
        border: '1px solid #e2e2e2',
        borderRadius: '12px',
        padding: '1.25rem',
        marginTop: '1.5rem',
    },
    row: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
    select: { padding: '0.5rem', borderRadius: '8px', minWidth: '160px' },
    input: { padding: '0.5rem', borderRadius: '8px', width: '160px' },
    button: {
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        border: 'none',
        background: '#2c3e50',
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
    },
    max: {
        padding: '0.5rem 0.6rem',
        borderRadius: '8px',
        border: '1px solid #ccc',
        background: 'transparent',
        cursor: 'pointer',
    },
    error: { color: '#c0392b', fontSize: '0.9rem', marginTop: '0.5rem' },
    ok: { color: '#1e824c', fontSize: '0.9rem', marginTop: '0.5rem' },
    note: { fontSize: '0.8rem', opacity: 0.7, marginTop: '0.75rem' },
};

/**
 * Withdraw flow: user picks a token from their internal balances and an amount
 * (capped at that balance), the canister debits the ledger and sends the tokens
 * back to the caller's principal via ICRC-1, then the balance refreshes.
 */
export function WithdrawForm() {
    const { user } = useOdinConnect();
    const actor = useCanisterActor();
    const { balances, refresh } = useInternalBalances(actor);

    const [meta, setMeta] = useState<Map<string, OdinBalance>>(new Map());
    const [selectedLedger, setSelectedLedger] = useState('');
    const [amount, setAmount] = useState('');
    const [stage, setStage] = useState<Stage>('idle');
    const [error, setError] = useState<string | null>(null);

    // Token metadata (ticker, divisibility) for labelling + amount conversion,
    // keyed by ICRC ledger principal. Best-effort from the user's Odin holdings.
    useEffect(() => {
        let active = true;
        if (user === null) {
            return;
        }
        user
            .getBalances({ page: 1, limit: 50 })
            .then((result) => {
                if (!active) {
                    return;
                }
                const map = new Map<string, OdinBalance>();
                for (const t of result) {
                    if (t.icrc_ledger) {
                        map.set(t.icrc_ledger, t);
                    }
                }
                setMeta(map);
            })
            .catch(() => {
                /* metadata is best-effort; withdraw still works without it */
            });
        return () => {
            active = false;
        };
    }, [user]);

    const selected = useMemo(
        () => balances.find((b) => b.token === selectedLedger) ?? null,
        [balances, selectedLedger],
    );
    const selectedMeta = selectedLedger ? meta.get(selectedLedger) : undefined;
    const divisibility = selectedMeta?.divisibility ?? 0;

    const busy = stage === 'withdrawing';

    const fillMax = useCallback(() => {
        if (selected) {
            setAmount(formatTokenAmount(selected.amount, divisibility));
        }
    }, [selected, divisibility]);

    const withdraw = useCallback(async () => {
        setError(null);

        if (APP_CANISTER_ID === '') {
            setError('No app canister configured (set VITE_APP_CANISTER_ID).');
            return;
        }
        if (actor === null) {
            setError('Canister unavailable — reconnect to enable withdrawals.');
            return;
        }
        if (selected === null) {
            setError('Select a token to withdraw.');
            return;
        }

        // Convert using token divisibility when known; otherwise treat the input
        // as raw base units.
        let raw: bigint;
        try {
            raw = selectedMeta
                ? OdinUtils.convertToOdinAmount(amount, selectedMeta)
                : BigInt(amount);
        } catch {
            setError('Invalid amount.');
            return;
        }
        if (raw <= 0n) {
            setError('Amount must be greater than zero.');
            return;
        }
        if (raw > selected.amount) {
            setError('Insufficient internal balance.');
            return;
        }

        setStage('withdrawing');
        try {
            await actor.withdraw(Principal.fromText(selected.token), raw);
        } catch (err) {
            setStage('idle');
            // Canister rejects overdrafts; an ICRC-1 transfer failure refunds
            // and surfaces here too.
            setError(`Withdraw failed: ${toMessage(err)}`);
            return;
        }

        setStage('done');
        setAmount('');
        await refresh();
    }, [actor, selected, selectedMeta, amount, refresh]);

    return (
        <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Withdraw</h2>

            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={selectedLedger}
                    onChange={(e) => {
                        setSelectedLedger(e.target.value);
                        setAmount('');
                    }}
                    disabled={busy}
                >
                    <option value="">Select token…</option>
                    {balances.map((b) => {
                        const m = meta.get(b.token);
                        const label = m?.ticker ?? b.token;
                        const value = formatTokenAmount(b.amount, m?.divisibility ?? 0);
                        return (
                            <option key={b.token} value={b.token}>
                                {label} ({value})
                            </option>
                        );
                    })}
                </select>

                <input
                    style={styles.input}
                    type="text"
                    inputMode="decimal"
                    placeholder="Amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                />

                <button
                    type="button"
                    style={styles.max}
                    onClick={fillMax}
                    disabled={busy || selected === null}
                >
                    Max
                </button>

                <button
                    type="button"
                    style={styles.button}
                    onClick={() => void withdraw()}
                    disabled={busy || selectedLedger === '' || amount === ''}
                >
                    {busy ? 'Withdrawing…' : 'Withdraw'}
                </button>
            </div>

            {error !== null ? (
                <div style={styles.error} role="alert">
                    {error}
                </div>
            ) : null}
            {stage === 'done' && error === null ? (
                <div style={styles.ok}>Withdrawal sent.</div>
            ) : null}

            {balances.length === 0 ? (
                <p style={styles.note}>
                    No internal balances to withdraw. Deposit some tokens first.
                </p>
            ) : null}
        </section>
    );
}
