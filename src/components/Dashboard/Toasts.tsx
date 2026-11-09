import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useJarvisStore } from '../../hooks/useJarvisStore';

const icons = {
  info: <Info size={18} className="text-cyan" />,
  success: <CheckCircle2 size={18} className="text-success" />,
  warning: <AlertTriangle size={18} className="text-amber" />,
  error: <XCircle size={18} className="text-danger" />,
};

export function Toasts() {
  const toasts = useJarvisStore((s) => s.toasts);
  const dismiss = useJarvisStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+64px)]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            className="glass-strong pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl py-1 pl-4 pr-1 text-sm"
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            {icons[t.tone]}
            <span className="flex-1 py-2">{t.message}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
