import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { OdinUtils } from 'odin-connect';
import type { OdinToken, OdinTokenWithBalance } from 'odin-connect';

import { useOdinConnect } from '../odin/useOdinConnect';
import { useResumeFlow } from '../odin/useResumeFlow';
import type { ResumeState } from '../odin/resume';
import type { CanisterActor } from '../canister/idl';
import type { InternalBalance } from '../canister/useInternalBalances';
import { APP_CANISTER_ID } from '../canister/config';
import { formatTokenAmount } from '../lib/amounts';

type Stage = 'idle' | 'approving' | 'crediting' | 'done';

interface DepositFormProps {
    actor: CanisterActor | null;
    balances: InternalBalance[];
    refresh: () => Promise<void>;
}

function toMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : fallback;
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
 * Deposit flow: user picks an Odin token + amount, the odin-connect ICRC-2
 * approval popup grants the app canister an allowance, then the canister's
 * deposit() pulls the approved funds (icrc2_transfer_from) and credits the
 * internal ledger before the balance is refreshed.
 *
 * The credit is backed by real funds because the canister moves the tokens
 * itself inside deposit() before crediting — icrcApprove alone only grants the
 * allowance.
 *
 * In redirect mode (wallet in-app browsers) the approval navigates this tab
 * to Odin and back, so the awaited `icrcApprove()` never returns. The second
 * step is described up front as `returnState` and `useResumeFlow` runs it on
 * the next page load.
 */
export function DepositForm({ actor, balances, refresh }: DepositFormProps) {
    const { t } = useTranslation();
    const { user, principal, getToken } = useOdinConnect();

    const [holdings, setHoldings] = useState<OdinTokenWithBalance[]>([]);
    const [resolved, setResolved] = useState<Map<string, OdinToken>>(new Map());
    const [selectedId, setSelectedId] = useState('');
    const [amount, setAmount] = useState('');
    const [stage, setStage] = useState<Stage>('idle');
    const [error, setError] = useState<string | null>(null);

    // Any token the user holds on Odin can be deposited — every Odin token
    // lives on the shared Odin ledger, addressed by subaccount.
    const depositable = useMemo(() => holdings, [holdings]);

    const loadHoldings = useCallback(async () => {
        if (user === null) {
            return;
        }
        try {
            const result = await user.getBalances({ page: 1, limit: 50 });
            setHoldings(result.map((b) => ({ token: b, balance: BigInt(b.balance) })));
        } catch (err) {
            setError(t('deposit.errors.loadTokens', { message: toMessage(err, t('errors.unexpected')) }));
        }
    }, [user, t]);

    useEffect(() => {
        void loadHoldings();
    }, [loadHoldings]);

    // Map Odin token id → token meta, for labelling internal balances.
    const byId = useMemo(() => {
        const map = new Map<string, OdinTokenWithBalance>();
        for (const t of holdings) {
            map.set(t.token.id, t);
        }
        return map;
    }, [holdings]);

    // Backfill metadata for internal-balance tokens the user no longer holds in
    // their wallet (so they are absent from getBalances/byId). Without it the
    // balance list would show the raw token id and an unscaled amount.
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
                let changed = false;
                for (const entry of entries) {
                    if (entry !== null) {
                        next.set(entry[0], entry[1]);
                        changed = true;
                    }
                }
                // Keep the same reference when nothing resolved, otherwise the
                // new Map re-triggers this effect and re-fetches the same
                // (failing) ids forever.
                return changed ? next : prev;
            });
        });
        return () => {
            active = false;
        };
    }, [balances, byId, resolved, getToken]);

    const busy = stage === 'approving' || stage === 'crediting';

    // Step 2 of the deposit: pull the approved funds into the canister and
    // credit the internal ledger. deposit() runs icrc2_transfer_from then
    // credits the caller. Shared by the popup path (right after the awaited
    // approval) and the redirect path (on the next page load).
    const credit = useCallback(
        async (tokenId: string, raw: bigint) => {
            if (actor === null) {
                setStage('idle');
                setError(t('errors.canisterUnavailableDeposit'));
                return;
            }
            setStage('crediting');
            try {
                await actor.deposit(tokenId, raw);
            } catch (err) {
                setStage('idle');
                setError(t('deposit.errors.depositFailed', { message: toMessage(err, t('errors.unexpected')) }));
                return;
            }

            setStage('done');
            setAmount('');
            await refresh();
            void loadHoldings();
        },
        [actor, refresh, loadHoldings, t],
    );

    // Redirect mode: the approval this page load returned from.
    useResumeFlow('deposit', actor, (state, status) => {
        setError(null);
        if (status === 'failed') {
            setStage('idle');
            setError(t('errors.approvalRejected'));
            return;
        }
        setSelectedId(state.tokenId);
        void credit(state.tokenId, state.amount);
    });

    const deposit = useCallback(async () => {
        setError(null);

        if (APP_CANISTER_ID === '') {
            setError(t('errors.noCanisterConfigured'));
            return;
        }
        if (user === null || principal === null) {
            setError(t('errors.notConnected'));
            return;
        }
        const holding = depositable.find((h) => h.token.id === selectedId);
        if (!holding) {
            setError(t('errors.selectTokenDeposit'));
            return;
        }

        let raw: bigint;
        try {
            raw = OdinUtils.convertToOdinAmount(amount, holding.token);
        } catch {
            setError(t('errors.invalidAmount'));
            return;
        }
        if (raw <= 0n) {
            setError(t('errors.amountGreaterThanZero'));
            return;
        }

        // 1. Approve the app canister to pull `raw` of this token via ICRC-2.
        //    Unlike a direct transfer this only grants an allowance — the
        //    canister must call icrc2_transfer_from to actually move the funds.
        //    `returnState` describes step 2 for redirect mode, where this
        //    await never returns (the tab navigates to Odin and back).
        const resume: ResumeState = { flow: 'deposit', tokenId: holding.token.id, amount: raw };
        setStage('approving');
        let approved: boolean;
        try {
            approved = await user.icrcApprove({
                token: holding.token.id,
                spender: APP_CANISTER_ID,
                amount: raw,
                returnState: resume,
            });
        } catch (err) {
            setStage('idle');
            setError(t('deposit.errors.approvalFailed', { message: toMessage(err, t('errors.unexpected')) }));
            return;
        }
        if (!approved) {
            setStage('idle');
            setError(t('errors.approvalRejected'));
            return;
        }

        // 2. Popup mode lands here; redirect mode runs this via useResumeFlow.
        await credit(holding.token.id, raw);
    }, [user, principal, depositable, selectedId, amount, credit, t]);

    return (
        <section style={styles.card}>
            <h2 style={{ marginTop: 0 }}>{t('deposit.heading')}</h2>

            <div style={styles.row}>
                <select
                    style={styles.select}
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={busy}
                >
                    <option value="">{t('deposit.selectToken')}</option>
                    {depositable.map(({ token, balance }) => (
                        <option key={token.id} value={token.id}>
                            {token.ticker} ({formatTokenAmount(balance, token.divisibility + token.decimals)})
                        </option>
                    ))}
                </select>

                <input
                    style={styles.input}
                    type="text"
                    inputMode="decimal"
                    placeholder={t('deposit.amountPlaceholder')}
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
                    {stage === 'approving'
                        ? t('deposit.awaitingApproval')
                        : stage === 'crediting'
                          ? t('deposit.crediting')
                          : t('deposit.submit')}
                </button>
            </div>

            {error !== null ? (
                <div style={styles.error} role="alert">
                    {error}
                </div>
            ) : null}
            {stage === 'done' && error === null ? (
                <div style={styles.ok}>{t('deposit.credited')}</div>
            ) : null}

            <h3 style={{ marginBottom: 0 }}>{t('deposit.balancesHeading')}</h3>
            {balances.length === 0 ? (
                <p style={styles.note}>{t('deposit.noBalances')}</p>
            ) : (
                <ul style={styles.list}>
                    {balances.map((b) => {
                        const token = byId.get(b.token)?.token ?? resolved.get(b.token);
                        const label = token?.ticker ?? b.token;
                        const value = token
                            ? formatTokenAmount(b.amount, token.divisibility + token.decimals)
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
                <Trans i18nKey="deposit.note" components={[<code key="0" />, <code key="1" />]} />
            </p>
        </section>
    );
}
