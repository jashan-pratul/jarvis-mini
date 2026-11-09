import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config, ownerRoutesOpen } from '../config.js';

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function isValidOwnerKey(key: unknown): boolean {
  if (ownerRoutesOpen) return true;
  if (typeof key !== 'string' || key.length === 0) return false;
  if (config.ownerPasscode.length < 6) return false;
  return safeEqual(key, config.ownerPasscode);
}

/** Requires the `x-owner-key` (or `x-owner-passcode`) header to match OWNER_PASSCODE. */
export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('x-owner-key') || req.header('x-owner-passcode');
  if (isValidOwnerKey(key)) {
    next();
    return;
  }
  res.status(401).json({
    error: 'owner_required',
    message: "This part of Aadarsh's JARVIS is locked. Unlock the Memory Vault with the owner passcode.",
  });
}
