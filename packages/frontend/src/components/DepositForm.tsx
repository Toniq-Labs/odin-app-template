import { useCallback, useEffect, useMemo, useState } from 'react';
import { OdinUtils } from 'odin-connect';
import type { OdinTokenWithBalance } from 'odin-connect';
import { Principal } from '@dfinity/principal';

import { useOdinConnect } from '../odin/useOdinConnect';
import { useCanisterActor } from '../canister/useCanisterActor';
import { useInternalBalances } from '../canister/useInternalBalances';
import { APP_CANISTER_ID } from '../canister/config';
import { formatTokenAmount } from '../lib/amounts';

type Stage = 'idle' | 'transferring' | 'crediting' | 'done';

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
        background: '#f7931a',
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
    },
    error: { color: '#c0392b', fontSize: '0.9rem', marginTop: '0.5rem' },
    ok: { color: '#1e824c', fontSize: '0.9rem', marginTop: '0.5rem' },
    list: { listStyle: 'none', padding: 0, marginTop: '0.75rem' },
    note: { fontSize: '0.8rem', opacity: 0.7, marginTop: '0.75rem' },
};

/**
 * Deposit flow: user picks an Odin token + amount, the odin-connect transfer
 * popup sends the tokens to the app canister, then notifyDeposit credits the
 * internal ledger and the balance is refreshed.
 */
export function DepositForm() {
    const { user, principal } = useOdinConnect();
    const actor = useCanisterActor();
    const { balances, refresh } = useInternalBalances(actor);

    const [holdings, setHoldings] = useState<OdinTokenWithBalance[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [amount, setAmount] = useState('');
    const [stage, setStage] = useState<Stage>('idle');
    const [error, setError] = useState<string | null>(null);

    // Tokens the user holds on Odin that can be deposited into an ICRC ledger.
    const depositable = useMemo(
        () => holdings.filter((t) =>  t.token.icrc_ledger),
        [holdings],
    );

    const loadHoldings = useCallback(async () => {
        if (user === null) {
            return;
        }
        try {
            const result = await user.getTokens({ page: 1, limit: 50 });
            setHoldings(result.data.map((d) => ({ token: d.token, balance: d.balance })));
        } catch (err) {
            setError(`Failed to load tokens: ${toMessage(err)}`);
        }
    }, [user]);

    useEffect(() => {
        void loadHoldings();
    }, [loadHoldings]);

    // Map ICRC ledger principal → token meta, for labelling internal balances.
    const byLedger = useMemo(() => {
        const map = new Map<string, OdinTokenWithBalance>();
        for (const t of holdings) {
            if (t.token.icrc_ledger) {
                map.set(t.token.icrc_ledger, t);
            }
        }
        return map;
    }, [holdings]);

    const busy = stage === 'transferring' || stage === 'crediting';

    const deposit = useCallback(async () => {
        setError(null);

        if (APP_CANISTER_ID === '') {
            setError('No app canister configured (set VITE_APP_CANISTER_ID).');
            return;
        }
        if (user === null || principal === null) {
            setError('Not connected.');
            return;
        }
        const holding = depositable.find((t) => t.token.id === selectedId);
        if (!holding || !holding.token.icrc_ledger) {
            setError('Select a token to deposit.');
            return;
        }

        let raw: bigint;
        try {
            raw = OdinUtils.convertToOdinAmount(amount, holding.token);
        } catch {
            setError('Invalid amount.');
            return;
        }
        if (raw <= 0n) {
            setError('Amount must be greater than zero.');
            return;
        }

        // 1. Send tokens to the app canister via the Odin approval popup.
        setStage('transferring');
        let transferred: boolean;
        try {
            transferred = await user.transfer({
                token: holding.token.id,
                amount: raw,
                destination: APP_CANISTER_ID,
            });
        } catch (err) {
            setStage('idle');
            setError(`Transfer failed: ${toMessage(err)}`);
            return;
        }
        if (!transferred) {
            setStage('idle');
            setError('Transfer cancelled or rejected.');
            return;
        }

        // 2. Credit the internal ledger now that the transfer has settled.
        if (actor === null) {
            setStage('idle');
            setError('Canister unavailable — reconnect to enable deposits.');
            return;
        }
        setStage('crediting');
        try {
            await actor.notifyDeposit(
                Principal.fromText(principal),
                Principal.fromText(holding.token.icrc_ledger),
                raw,
            );
        } catch (err) {
            setStage('idle');
            // notifyDeposit is owner-gated; a non-owner caller is rejected here.
            setError(`Credit failed (notifyDeposit): ${toMessage(err)}`);
            return;
        }

        setStage('done');
        setAmount('');
        await refresh();
        void loadHoldings();
    }, [user, principal, actor, depositable, selectedId, amount, refresh, loadHoldings]);

    return (
        <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Deposit</h2>

            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={busy}
                >
                    <option value="">Select token…</option>
                    {depositable.map((t) => (
                        <option key={t.token.id} value={t.token.id}>
                            {t.token.ticker} ({formatTokenAmount(t.balance, t.token.divisibility)})
                        </option>
                    ))}
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
                    style={styles.button}
                    onClick={() => void deposit()}
                    disabled={busy || selectedId === '' || amount === ''}
                >
                    {stage === 'transferring'
                        ? 'Awaiting transfer…'
                        : stage === 'crediting'
                          ? 'Crediting…'
                          : 'Deposit'}
                </button>
            </div>

            {error !== null ? (
                <div style={styles.error} role="alert">
                    {error}
                </div>
            ) : null}
            {stage === 'done' && error === null ? (
                <div style={styles.ok}>Deposit credited.</div>
            ) : null}

            <h3 style={{ marginBottom: 0 }}>Internal balances</h3>
            {balances.length === 0 ? (
                <p style={styles.note}>No internal balances yet.</p>
            ) : (
                <ul style={styles.list}>
                    {balances.map((b) => {
                        const meta = byLedger.get(b.token);
                        const label = meta?.token.ticker ?? b.token;
                        const value = meta
                            ? formatTokenAmount(b.amount, meta.token.divisibility)
                            : b.amount.toString();
                        return (
                            <li key={b.token}>
                                <strong>{label}</strong>: {value}
                            </li>
                        );
                    })}
                </ul>
            )}

            <p style={styles.note}>
                Note: <code>notifyDeposit</code> is owner-gated. In production a
                trusted minter performs the credit step after verifying the
                transfer; locally the deployer (owner) is the test user.
            </p>
        </section>
    );
}
