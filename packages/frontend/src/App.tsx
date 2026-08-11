import { useTranslation } from 'react-i18next';

import { AuthBar } from './components/AuthBar';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { DepositForm } from './components/DepositForm';
import { WithdrawForm } from './components/WithdrawForm';
import { useOdinConnect } from './odin/useOdinConnect';
import { useCanisterActor } from './canister/useCanisterActor';
import { useInternalBalances } from './canister/useInternalBalances';

export function App() {
    const { t } = useTranslation();
    const { status } = useOdinConnect();
    // Internal balances live here so deposit and withdraw share one source of
    // truth — a deposit refresh immediately updates the withdraw selector.
    const actor = useCanisterActor();
    const { balances, refresh } = useInternalBalances(actor);

    return (
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '720px' }}>
            {/* Wraps as whole groups: the title and the controls each stay
                intact and move to their own line instead of being squeezed
                until words break mid-token. */}
            <header
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                }}
            >
                <h1 style={{ margin: 0 }}>{t('app.title')}</h1>
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginLeft: 'auto',
                    }}
                >
                    <LanguageSwitcher />
                    <AuthBar />
                </div>
            </header>

            <p>{t('app.intro')}</p>

            {status === 'connected' ? (
                <>
                    <DepositForm actor={actor} balances={balances} refresh={refresh} />
                    <WithdrawForm actor={actor} balances={balances} refresh={refresh} />
                </>
            ) : (
                <p>{t('app.connectPrompt')}</p>
            )}
        </main>
    );
}
