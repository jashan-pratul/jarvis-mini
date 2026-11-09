import type { ReactNode } from 'react';
import { useJarvisStore } from '../../hooks/useJarvisStore';

function useLinkStatus() {
  const backend = useJarvisStore((s) => s.backend);
  if (!backend) return { color: 'bg-steel', label: 'Checking link' };
  if (!backend.reachable) return { color: 'bg-danger', label: 'Server offline' };
  if (!backend.aiConfigured) return { color: 'bg-amber', label: 'AI not configured' };
  return { color: 'bg-success', label: 'All systems online' };
}

interface Props {
  actions?: ReactNode;
}

export function TopBar({ actions }: Props) {
  const status = useLinkStatus();
  const reactorState = useJarvisStore((s) => s.reactorState);

  return (
    <header className="safe-top relative z-30">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 pl-4 pr-1">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[15px] font-bold tracking-[0.08em] text-white">
            Aadarsh's <span className="text-cyan text-glow">JARVIS</span>
          </h1>
          <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-steel">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.color}`} />
            <span className="truncate">
              {status.label}
              {reactorState !== 'idle' && ` · ${reactorState}`}
            </span>
          </p>
        </div>
        <div className="flex items-center">{actions}</div>
      </div>
    </header>
  );
}
