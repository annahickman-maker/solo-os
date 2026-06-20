import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Agentation } from 'agentation';
import { PasswordGate } from './auth';
import { MembershipGate } from './membership';
import { NavRail } from './components/NavRail';
import { BottomNav } from './components/BottomNav';
import { UnauthorizedError } from './api';
import { Today } from './pages/Today';
import { Focus } from './pages/Focus';
import { Projects } from './pages/Projects';
import { Content } from './pages/Content';
// Metrics page is parked - re-add by uncommenting both this import and its route.
// import { Metrics } from './pages/Metrics';
import { Inbox } from './pages/Inbox';
import { Voice } from './pages/Voice';
import { Skills } from './pages/Skills';
import { Archive } from './pages/Archive';
import { Profile } from './pages/Profile';
import { Journey } from './pages/Journey';
import { Settings } from './pages/Settings';
import { Decks } from './pages/Decks';
import { TeleprompterProvider } from './components/TeleprompterProvider';

function handleAuthError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    window.dispatchEvent(new Event('dashboard:unauthorized'));
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, err) => {
        if (err instanceof UnauthorizedError) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
});

function Shell() {
  return (
    <div className="app-shell">
      <NavRail />
      <main className="main">
        <div className="main__inner">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/focus" element={<Focus />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/pipeline" element={<Projects />} />
            <Route path="/content" element={<Content />} />
            {/* <Route path="/metrics" element={<Metrics />} /> -- parked */}
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/voice" element={<Voice />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/reputation" element={<Profile />} />
            <Route path="/profile/reputation/journey" element={<Journey />} />
            <Route path="/profile/offer" element={<Profile />} />
            <Route path="/brand" element={<Profile />} />
            <Route path="/offers" element={<Profile />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/vault" element={<Archive />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
      <BottomNav />
      {import.meta.env.DEV && <Agentation />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PasswordGate>
          <MembershipGate>
            <TeleprompterProvider>
              <Shell />
            </TeleprompterProvider>
          </MembershipGate>
        </PasswordGate>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
