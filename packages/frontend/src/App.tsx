import { AuthBar } from './components/AuthBar';
import { DepositForm } from './components/DepositForm';
import { WithdrawForm } from './components/WithdrawForm';
import { useOdinConnect } from './odin/useOdinConnect';
import { useCanisterActor } from './canister/useCanisterActor';
import { useInternalBalances } from './canister/useInternalBalances';

export function App() {
    const { status } = useOdinConnect();
    // Internal balances live here so deposit and withdraw share one source of
    // truth — a deposit refresh immediately updates the withdraw selector.
    const actor = useCanisterActor();
    const { balances, refresh } = useInternalBalances(actor);

    return (
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '720px' }}>
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                }}
            >
                <h1 style={{ margin: 0 }}>odin-app-template</h1>
                <AuthBar />
            </header>

            <p>
                Reference canister app for building on Odin Fun. Auth is wired up
                with Odin Connect — deposit/withdraw flows and the multi-token
                ledger UI land in later subtasks.
            </p>

            {status === 'connected' ? (
                <>
                    <DepositForm actor={actor} balances={balances} refresh={refresh} />
                    <WithdrawForm actor={actor} balances={balances} refresh={refresh} />
                </>
            ) : (
                <p>Connect with Odin to deposit, withdraw and view your balances.</p>
            )}
        </main>
    );
}
