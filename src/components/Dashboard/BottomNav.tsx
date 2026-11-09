import { motion } from 'framer-motion';
import { Activity, Atom, Brain, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { useJarvisStore, type View } from '../../hooks/useJarvisStore';
import { sfx } from '../../utils/sfx';

export const NAV_ITEMS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'core', label: 'Core', icon: Atom },
  { id: 'showcase', label: 'Showcase', icon: Sparkles },
  { id: 'arena', label: 'Arena', icon: Trophy },
  { id: 'vault', label: 'Vault', icon: Brain },
  { id: 'system', label: 'System', icon: Activity },
];

interface Props {
  available: View[];
}

export function BottomNav({ available }: Props) {
  const view = useJarvisStore((s) => s.view);
  const setView = useJarvisStore((s) => s.setView);
  const items = NAV_ITEMS.filter((i) => available.includes(i.id));

  return (
    <nav
      className="glass-strong safe-bottom relative z-30 border-x-0 border-b-0"
      aria-label="Main navigation"
    >
      <ul className="mx-auto flex max-w-xl items-stretch justify-around px-1">
        {items.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => {
                  if (!active) sfx.tick();
                  setView(id);
                }}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-16 w-full flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-cyan' : 'text-steel hover:text-[#cfe9f7]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute top-0 h-[2px] w-10 rounded-full bg-cyan shadow-[0_0_12px_rgba(56,225,255,0.9)]"
                  />
                )}
                <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
                <span className="font-display text-[9.5px] tracking-[0.14em] uppercase">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
