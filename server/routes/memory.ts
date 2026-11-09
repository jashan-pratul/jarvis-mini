import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { isValidOwnerKey, requireOwner } from '../middleware/ownerAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { sanitizeText, validateBody } from '../middleware/validate.js';
import { memories, notes, secretCommands } from '../services/dbService.js';

export const memoryRouter = Router();

const ContentSchema = z.object({
  content: z.string().min(1).max(1000),
});

const SecretCommandSchema = z.object({
  trigger: z.string().min(2).max(120),
  response: z.string().min(1).max(1000),
});

const VerifySchema = z.object({
  passcode: z.string().min(1).max(120),
});

function parseId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// Public read of custom secret triggers so the local command parser can match them.
memoryRouter.get('/secret-commands', (_req: Request, res: Response) => {
  res.json({ items: secretCommands.list() });
});

// Verify owner passcode cleanly with brute-force protection.
memoryRouter.post('/verify', authLimiter, validateBody(VerifySchema), (req: Request, res: Response) => {
  const { passcode } = req.body as z.infer<typeof VerifySchema>;
  if (!isValidOwnerKey(passcode)) {
    res.status(401).json({ error: 'invalid_passcode', message: 'Incorrect owner passcode.' });
    return;
  }
  res.json({ ok: true });
});

// ── Owner-protected Memories ────────────────────────────────────────────────
memoryRouter.get('/', requireOwner, (_req: Request, res: Response) => {
  res.json({ items: memories.list() });
});

memoryRouter.post('/', requireOwner, validateBody(ContentSchema), (req: Request, res: Response) => {
  const content = sanitizeText((req.body as z.infer<typeof ContentSchema>).content);
  if (!content) {
    res.status(400).json({ error: 'empty', message: 'Memory cannot be empty.' });
    return;
  }
  res.status(201).json({ item: memories.create(content) });
});

memoryRouter.put('/:id', requireOwner, validateBody(ContentSchema), (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id', message: 'Invalid memory ID.' });
    return;
  }
  const content = sanitizeText((req.body as z.infer<typeof ContentSchema>).content);
  const updated = memories.update(id, content);
  if (!updated) {
    res.status(404).json({ error: 'not_found', message: 'Memory not found.' });
    return;
  }
  res.json({ item: updated });
});

memoryRouter.delete('/:id', requireOwner, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id', message: 'Invalid memory ID.' });
    return;
  }
  if (!memories.remove(id)) {
    res.status(404).json({ error: 'not_found', message: 'Memory not found.' });
    return;
  }
  res.json({ ok: true });
});

// ── Owner-protected Notes ───────────────────────────────────────────────────
memoryRouter.get('/notes', requireOwner, (_req: Request, res: Response) => {
  res.json({ items: notes.list() });
});

memoryRouter.post('/notes', requireOwner, validateBody(ContentSchema), (req: Request, res: Response) => {
  const content = sanitizeText((req.body as z.infer<typeof ContentSchema>).content);
  if (!content) {
    res.status(400).json({ error: 'empty', message: 'Note cannot be empty.' });
    return;
  }
  res.status(201).json({ item: notes.create(content) });
});

memoryRouter.put('/notes/:id', requireOwner, validateBody(ContentSchema), (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id', message: 'Invalid note ID.' });
    return;
  }
  const content = sanitizeText((req.body as z.infer<typeof ContentSchema>).content);
  const updated = notes.update(id, content);
  if (!updated) {
    res.status(404).json({ error: 'not_found', message: 'Note not found.' });
    return;
  }
  res.json({ item: updated });
});

memoryRouter.delete('/notes/:id', requireOwner, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id', message: 'Invalid note ID.' });
    return;
  }
  if (!notes.remove(id)) {
    res.status(404).json({ error: 'not_found', message: 'Note not found.' });
    return;
  }
  res.json({ ok: true });
});

// ── Owner-protected Secret Command Mutations ────────────────────────────────
memoryRouter.post(
  '/secret-commands',
  requireOwner,
  validateBody(SecretCommandSchema),
  (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof SecretCommandSchema>;
    const trigger = sanitizeText(body.trigger).toLowerCase();
    const response = sanitizeText(body.response);
    if (!trigger || !response) {
      res.status(400).json({ error: 'empty', message: 'Trigger and response are both required.' });
      return;
    }
    try {
      res.status(201).json({ item: secretCommands.create(trigger, response) });
    } catch {
      res.status(409).json({ error: 'duplicate', message: 'That secret command trigger already exists.' });
    }
  },
);

memoryRouter.delete('/secret-commands/:id', requireOwner, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'invalid_id', message: 'Invalid command ID.' });
    return;
  }
  if (!secretCommands.remove(id)) {
    res.status(404).json({ error: 'not_found', message: 'Secret command not found.' });
    return;
  }
  res.json({ ok: true });
});
