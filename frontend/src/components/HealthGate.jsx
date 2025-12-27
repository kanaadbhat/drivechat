import { useEffect, useMemo, useRef, useState } from 'react';

const resolveHealthUrl = () => {
  const apiBase = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL;
  if (apiBase) return `${apiBase.replace(/\/$/, '')}/health`;

  return 'http://localhost:5000/health';
};

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 60000;

function WarmupScreen({ attempt, timeUntilNext, lastError }) {
  const nextDelaySeconds = Math.max(1, Math.ceil(timeUntilNext / 1000));

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-black text-white flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/minimalist-bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        aria-hidden
      />
      <div className="absolute inset-0 bg-linear-to-br from-black/70 via-black/60 to-[#0b1224]/80" />

      <div className="relative z-10 w-full max-w-3xl px-6 flex flex-col items-center text-center gap-8">
        <div className="flex items-center gap-4">
          <img
            src="/logo.png"
            alt="DriveChat"
            className="w-16 h-16 rounded-xl shadow-lg shadow-blue-500/30"
          />
          <div className="text-left">
            <p className="uppercase tracking-[0.3em] text-sm text-gray-300">DriveChat</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white drop-shadow">Warming up</h1>
          </div>
        </div>

        <div className="relative w-28 h-28">
          <div className="absolute inset-0 rounded-full border-4 border-white/10" />
          <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-400 border-r-blue-500 animate-spin" />
          <div className="absolute inset-6 rounded-full bg-white/10 backdrop-blur" />
        </div>

        <div className="space-y-2 max-w-xl">
          <p className="text-lg text-gray-200 font-semibold">Please wait till the server starts…</p>
          <p className="text-sm text-gray-400">
            Checking backend health (attempt {attempt}) · next request in {nextDelaySeconds}s
          </p>
          {lastError ? (
            <p className="text-xs text-rose-300/80 wrap-break-word">Last error: {lastError}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/10 border border-white/10 shadow-lg shadow-blue-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Live health check in progress
          </span>
        </div>
      </div>

      <a
        href="mailto:kanaad@kanaad.in?subject=DriveChat%20Server%20Delay"
        className="absolute bottom-6 inset-x-0 mx-auto w-fit flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-sm text-gray-200 backdrop-blur hover:bg-white/15 transition"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="w-4 h-4"
          aria-hidden
        >
          <path d="M3 5.5h18v13H3z" />
          <path d="M3 7l9 6 9-6" />
        </svg>
        Contact admin for persistent delays — kanaad@kanaad.in
      </a>
    </div>
  );
}

export default function HealthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lastError, setLastError] = useState('');
  const [timeUntilNext, setTimeUntilNext] = useState(null);

  const intervalRef = useRef(null);
  const cancelledRef = useRef(false);
  const healthUrl = useMemo(() => resolveHealthUrl(), []);

  const fibSeconds = (n) => {
    if (n === 0) return 0;
    if (n <= 2) return 1;
    let a = 1,
      b = 1;
    for (let i = 3; i <= n; i++) [a, b] = [b, a + b];
    return b;
  };

  useEffect(() => {
    cancelledRef.current = false;

    const fireAttempt = async (n) => {
      if (cancelledRef.current) return;

      setAttempt(n);

      try {
        const res = await fetch(healthUrl, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        setReady(true);
        setLastError('');
      } catch (err) {
        setReady(false);
        setLastError(err?.message || 'Network error');

        const next = n + 1;
        let seconds = fibSeconds(next);
        setTimeUntilNext(seconds);

        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          seconds -= 1;
          setTimeUntilNext(seconds);

          if (seconds <= 0) {
            clearInterval(intervalRef.current);
            fireAttempt(next);
          }
        }, 1000);
      }
    };

    fireAttempt(0);

    return () => {
      cancelledRef.current = true;
      clearInterval(intervalRef.current);
    };
  }, [healthUrl]);

  if (!ready) {
    return (
      <WarmupScreen
        attempt={attempt}
        timeUntilNext={(timeUntilNext ?? 0) * 1000}
        lastError={lastError}
      />
    );
  }

  return children;
}
