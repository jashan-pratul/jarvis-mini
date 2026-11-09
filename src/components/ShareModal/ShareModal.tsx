import { useState } from 'react';
import { AlertTriangle, Check, Copy, MessageCircle, Share2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useJarvisStore } from '../../hooks/useJarvisStore';
import { isLocalOrigin } from '../../utils/device';
import { sfx } from '../../utils/sfx';

export function buildInvitationMessage(url: string): string {
  return `Guys, meet Aadarsh's JARVIS!

A personal AI assistant that can talk,
answer questions, solve problems and challenge you
with quizzes and riddles.

Try it here:
${url}`;
}

export function ShareModal() {
  const open = useJarvisStore((s) => s.shareOpen);
  const setOpen = useJarvisStore((s) => s.setShareOpen);
  const toast = useJarvisStore((s) => s.toast);

  const detectedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const [customUrl, setCustomUrl] = useState('');
  const [copied, setCopied] = useState<'url' | 'invite' | null>(null);

  const activeUrl = (customUrl.trim() || detectedOrigin).replace(/\/+$/, '');
  const localWarning = isLocalOrigin(activeUrl);
  const invitation = buildInvitationMessage(activeUrl);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyText = async (text: string, type: 'url' | 'invite') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      sfx.tap();
      toast(type === 'url' ? 'Application URL copied!' : 'Invitation message copied!', 'success');
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      toast('Could not access clipboard on this browser.', 'error');
    }
  };

  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: "Aadarsh's JARVIS",
        text: invitation,
        url: activeUrl,
      });
    } catch {
      /* user cancelled share sheet */
    }
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(invitation)}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-2 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Share Aadarsh's JARVIS"
            className="glass-strong scroll-area max-h-[90dvh] w-full max-w-md rounded-3xl p-4"
            initial={{ y: 32, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="hud-label text-[10px] text-cyan">Invite Friends</p>
                <h2 className="font-display text-base font-bold text-white">Share Aadarsh's JARVIS</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-btn"
                aria-label="Close share modal"
              >
                <X size={18} />
              </button>
            </div>

            {localWarning && (
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber/40 bg-amber/10 p-3 text-xs text-amber">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Local/LAN URL detected ({activeUrl})</p>
                  <p className="mt-0.5 text-[11px] text-[#ffe2b3]">
                    Friends outside your Wi-Fi cannot open `localhost`. Deploy to Render/Railway first or paste your live deployed URL below.
                  </p>
                </div>
              </div>
            )}

            {/* QR Code */}
            <div className="mt-3 flex flex-col items-center rounded-2xl border border-cyan/25 bg-abyss/80 p-4">
              <div className="rounded-2xl bg-white p-3 shadow-[0_0_28px_rgba(56,225,255,0.35)]">
                <QRCodeSVG value={activeUrl || 'https://example.com'} size={164} level="M" />
              </div>
              <p className="mt-2.5 break-all text-center font-mono text-xs text-cyan-soft">{activeUrl}</p>
            </div>

            {/* Optional custom deployed URL override */}
            <div className="mt-3">
              <label htmlFor="share-url-input" className="hud-label text-[9px]">
                Application URL (auto-detected from live origin)
              </label>
              <input
                id="share-url-input"
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder={detectedOrigin}
                className="field mt-1 text-xs font-mono"
              />
            </div>

            {/* Invitation Preview */}
            <div className="mt-3 rounded-2xl border border-cyan/15 bg-navy/40 p-3">
              <div className="flex items-center justify-between">
                <p className="hud-label text-[9px]">Invitation Message</p>
                <button
                  type="button"
                  onClick={() => void copyText(invitation, 'invite')}
                  className="text-xs font-semibold text-cyan hover:underline"
                >
                  {copied === 'invite' ? 'Copied!' : 'Copy message'}
                </button>
              </div>
              <pre className="mt-1.5 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[#dceaf7]">
                {invitation}
              </pre>
            </div>

            {/* Share Actions */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-hud btn-primary col-span-2 text-sm"
              >
                <MessageCircle size={18} />
                <span>Share via WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => void copyText(activeUrl, 'url')}
                className="btn-hud text-xs"
              >
                {copied === 'url' ? <Check size={15} /> : <Copy size={15} />}
                <span>{copied === 'url' ? 'Copied URL' : 'Copy URL'}</span>
              </button>

              {canNativeShare ? (
                <button type="button" onClick={() => void handleNativeShare()} className="btn-hud text-xs">
                  <Share2 size={15} />
                  <span>Android Share</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void copyText(invitation, 'invite')}
                  className="btn-hud text-xs"
                >
                  <Copy size={15} />
                  <span>Copy Invite</span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
