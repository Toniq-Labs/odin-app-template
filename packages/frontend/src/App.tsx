import { AuthBar } from './components/AuthBar';
import { DepositForm } from './components/DepositForm';
import { useOdinConnect } from './odin/useOdinConnect';

export function App() {
    const { status } = useOdinConnect();

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
                <DepositForm />
            ) : (
                <p>Connect with Odin to deposit and view your balances.</p>
            )}
        </main>
    );
}
