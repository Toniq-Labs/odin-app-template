import { useCallback, useEffect, useMemo, useState } from 'react';
import { OdinUtils } from 'odin-connect';
import type { OdinToken, OdinTokenWithBalance } from 'odin-connect';

import { useOdinConnect } from '../odin/useOdinConnect';
import type { CanisterActor } from '../canister/idl';
import type { InternalBalance } from '../canister/useInternalBalances';
import { APP_CANISTER_ID } from '../canister/config';
import { formatTokenAmount } from '../lib/amounts';
import {
    BTC_TOKEN_ID,
    WITHDRAW_FEE_APPROVAL,
    WITHDRAW_FEE_SATS,
} from '../lib/fees';

type Stage = 'idle' | 'approving' | 'withdrawing' | 'done';

interface WithdrawFormProps {
    actor: CanisterActor | null;
    balances: InternalBalance[];
    refresh: () => Promise<void>;
}

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
 * back to the caller on the Odin ledger, then the balance refreshes.
 */
export function WithdrawForm({ actor, balances, refresh }: WithdrawFormProps) {
    const { user, getToken } = useOdinConnect();

    const [holdings, setHoldings] = useState<OdinTokenWithBalance[]>([]);
    const [resolved, setResolved] = useState<Map<string, OdinToken>>(new Map());
    const [selectedTokenId, setSelectedTokenId] = useState('');
    const [amount, setAmount] = useState('');
    const [stage, setStage] = useState<Stage>('idle');
    const [error, setError] = useState<string | null>(null);

    // Token metadata (ticker, divisibility, decimals) for labelling + amount
    // conversion, best-effort from the user's holdings.
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
                setHoldings(
                    result.map((b) => ({ token: b, balance: b.balance })),
                );
            })
            .catch(() => {
                /* metadata is best-effort; withdraw still works without it */
            });
        return () => {
            active = false;
        };
    }, [user]);

    // Map Odin token id → token meta from the user's wallet holdings.
    const byId = useMemo(() => {
        const map = new Map<string, OdinTokenWithBalance>();
        for (const t of holdings) {
            map.set(t.token.id, t);
        }
        return map;
    }, [holdings]);

    // Backfill metadata for tokens held only as internal balances. After a
    // deposit the user may no longer hold the token in their wallet, so it is
    // absent from getBalances() above — without its divisibility/decimals the
    // amount conversion would be wrong. Resolve each missing token by id. Kept
    // in separate state so a later holdings refresh cannot wipe it.
    useEffect(() => {
        let active = true;
        const missing = balances
            .map((b) => b.token)
            .filter((id) => !byId.has(id) && !resolved.has(id));
        if (missing.length === 0) {
            return;
        }
        Promise.all(
            missing.map((id) =>
                getToken(id)
                    .then((token) => [id, token] as const)
                    .catch(() => null),
            ),
        ).then((entries) => {
            if (!active) {
                return;
            }
            setResolved((prev) => {
                const next = new Map(prev);
                for (const entry of entries) {
                    if (entry !== null) {
                        next.set(entry[0], entry[1]);
                    }
                }
                return next;
            });
        });
        return () => {
            active = false;
        };
    }, [balances, byId, resolved, getToken]);

    const selected = useMemo(
        () => balances.find((b) => b.token === selectedTokenId) ?? null,
        [balances, selectedTokenId],
    );
    const selectedToken = selectedTokenId
        ? (byId.get(selectedTokenId)?.token ?? resolved.get(selectedTokenId))
        : undefined;
    // Odin amounts scale by divisibility + decimals (matches convertToOdinAmount).
    const places = selectedToken
        ? selectedToken.divisibility + selectedToken.decimals
        : 0;

    const busy = stage === 'approving' || stage === 'withdrawing';

    const fillMax = useCallback(() => {
        // Needs real divisibility/decimals; without meta the formatted value
        // would be at the wrong scale.
        if (selected && selectedToken) {
            setAmount(formatTokenAmount(selected.amount, places));
        }
    }, [selected, selectedToken, places]);

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

        // Require token metadata before converting — its divisibility/decimals
        // set the scale. Guessing (e.g. treating the input as raw base units)
        // would withdraw the wrong amount.
        if (!selectedToken) {
            setError('Token info still loading — try again in a moment.');
            return;
        }
        let raw: bigint;
        try {
            raw = OdinUtils.convertToOdinAmount(amount, selectedToken);
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
        if (user === null) {
            setError('Not connected.');
            return;
        }

        // 1. Approve BTC for the withdrawal fee. The canister pulls this during
        //    withdraw to pay the Odin ledger's per-transfer fee, so withdrawals
        //    need no canister BTC float. The allowance covers the fee twice (the
        //    pull amount + the ledger fee on that pull) — see lib/fees.ts.
        setStage('approving');
        let approved: boolean;
        try {
            approved = await user.icrcApprove({
                token: BTC_TOKEN_ID,
                spender: APP_CANISTER_ID,
                amount: WITHDRAW_FEE_APPROVAL,
            });
        } catch (err) {
            setStage('idle');
            setError(`BTC fee approval failed: ${toMessage(err)}`);
            return;
        }
        if (!approved) {
            setStage('idle');
            setError('BTC fee approval cancelled or rejected.');
            return;
        }

        // 2. Withdraw: the canister pulls the approved fee, then sends the
        //    tokens. A ledger transfer failure refunds the debited balance.
        setStage('withdrawing');
        try {
            await actor.withdraw(selected.token, raw);
        } catch (err) {
            setStage('idle');
            // Canister rejects overdrafts; an Odin ledger transfer failure
            // refunds the debited balance and surfaces here too.
            setError(`Withdraw failed: ${toMessage(err)}`);
            return;
        }

        setStage('done');
        setAmount('');
        await refresh();
    }, [actor, selected, selectedToken, amount, refresh, user]);

    return (
        <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>Withdraw</h2>

            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={selectedTokenId}
                    onChange={(e) => {
                        setSelectedTokenId(e.target.value);
                        setAmount('');
                    }}
                    disabled={busy}
                >
                    <option value="">Select token…</option>
                    {balances.map((b) => {
                        const m = byId.get(b.token)?.token ?? resolved.get(b.token);
                        const label = m?.ticker ?? b.token;
                        const value = formatTokenAmount(
                            b.amount,
                            m ? m.divisibility + m.decimals : 0,
                        );
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
                    disabled={busy || selected === null || selectedToken === undefined}
                >
                    Max
                </button>

                <button
                    type="button"
                    style={styles.button}
                    onClick={() => void withdraw()}
                    disabled={busy || selectedTokenId === '' || amount === ''}
                >
                    {stage === 'approving'
                        ? 'Awaiting BTC approval…'
                        : stage === 'withdrawing'
                          ? 'Withdrawing…'
                          : 'Withdraw'}
                </button>
            </div>

            <p style={styles.note}>
                Network fee: ~{WITHDRAW_FEE_SATS} sats in BTC. You approve BTC on
                withdraw so the canister can cover the Odin ledger transfer fee —
                no canister float needed.
            </p>

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
