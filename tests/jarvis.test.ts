import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDayPeriod, GREETING_SIGNATURE, selectGreeting } from '../src/utils/greetings.js';
import { tryEvaluateMath } from '../src/utils/mathEval.js';
import { parseLocalCommand } from '../src/utils/commandParser.js';
import { buildInvitationMessage } from '../src/components/ShareModal/ShareModal.js';
import { memories, notes, scores, secretCommands } from '../server/services/dbService.js';

describe('Personal Greeting System', () => {
  it('maps all 8 required simulated IST times to exact periods', () => {
    // 05:00–11:59: Good morning
    assert.equal(getDayPeriod('06:30'), 'morning');
    assert.equal(getDayPeriod('11:59'), 'morning');

    // 12:00–16:59: Good afternoon
    assert.equal(getDayPeriod('12:00'), 'afternoon');
    assert.equal(getDayPeriod('16:59'), 'afternoon');

    // 17:00–20:59: Good evening
    assert.equal(getDayPeriod('17:00'), 'evening');
    assert.equal(getDayPeriod('20:59'), 'evening');

    // 21:00–04:59: Good night
    assert.equal(getDayPeriod('21:00'), 'night');
    assert.equal(getDayPeriod('00:30'), 'night');
  });

  it('produces exact signature greetings for Aadarsh across all periods', () => {
    const morning = selectGreeting({ ownerName: 'Aadarsh', date: '06:30', avoidRepeat: false });
    assert.equal(
      morning.text,
      'Good morning, Aadarsh. Your JARVIS is online and ready to assist you, sir.',
    );

    const afternoon = selectGreeting({ ownerName: 'Aadarsh', date: '12:00', avoidRepeat: false });
    assert.equal(
      afternoon.text,
      'Good afternoon, Aadarsh. All systems standing by. What shall we accomplish today, sir?',
    );

    const evening = selectGreeting({ ownerName: 'Aadarsh', date: '17:00', avoidRepeat: false });
    assert.equal(
      evening.text,
      'Good evening, Aadarsh. Your JARVIS is at your service, sir.',
    );

    const night = selectGreeting({ ownerName: 'Aadarsh', date: '21:00', avoidRepeat: false });
    assert.equal(
      night.text,
      'Working late, Aadarsh? Your JARVIS is still standing by. How may I assist you, sir?',
    );
  });

  it('honours custom greeting overrides', () => {
    const g = selectGreeting({
      ownerName: 'Aadarsh',
      date: '06:30',
      customGreetings: { morning: 'Top of the morning, {name}!' },
    });
    assert.equal(g.text, 'Top of the morning, Aadarsh!');
    assert.equal(g.isCustom, true);
  });
});

describe('Safe Mathematical Evaluator', () => {
  it('solves spoken multiplication accurately ("calculate 987 multiplied by 654")', () => {
    const res = tryEvaluateMath('JARVIS, calculate 987 multiplied by 654.');
    assert.ok(res);
    assert.equal(res.value, 987 * 654);
  });

  it('handles percentages, square roots, powers, and parentheses', () => {
    assert.equal(tryEvaluateMath('what is 25% of 480')?.value, 120);
    assert.equal(tryEvaluateMath('calculate (987 * 654) + sqrt(14400)')?.value, 645498 + 120);
    assert.equal(tryEvaluateMath('calculate 2 to the power of 10')?.value, 1024);
  });

  it('returns null for non-mathematical conversational queries', () => {
    assert.equal(tryEvaluateMath('Explain black holes in detail'), null);
  });
});

describe('Local & Secret Command Parser', () => {
  it('responds with the exact boss quote', () => {
    const cmd = parseLocalCommand("JARVIS, who's the boss?", { ownerName: 'Aadarsh' });
    assert.ok(cmd);
    assert.equal(cmd.reply, 'That would be Aadarsh, obviously. I simply handle the intelligence around here.');
  });

  it('parses open YouTube and search commands with real URLs', () => {
    const yt = parseLocalCommand('JARVIS, open YouTube.');
    assert.ok(yt);
    assert.equal(yt.effect.type, 'open_url');
    if (yt.effect.type === 'open_url') {
      assert.equal(yt.effect.url, 'https://www.youtube.com');
    }

    const search = parseLocalCommand('JARVIS, search for artificial intelligence.');
    assert.ok(search);
    assert.equal(search.effect.type, 'open_url');
    if (search.effect.type === 'open_url') {
      assert.ok(search.effect.url.includes('artificial%20intelligence'));
    }
  });

  it('requires explicit consent before storing personal memories', () => {
    const mem = parseLocalCommand('JARVIS, remember that my exam is on Monday');
    assert.ok(mem);
    assert.equal(mem.effect.type, 'save_memory_prompt');
  });

  it('routes Showcase Mode and Friends Challenge commands', () => {
    const show = parseLocalCommand('JARVIS, activate showcase mode.');
    assert.ok(show);
    assert.deepEqual(show.effect, { type: 'navigate', view: 'showcase' });

    const quiz = parseLocalCommand('JARVIS, challenge my friends.');
    assert.ok(quiz);
    assert.deepEqual(quiz.effect, { type: 'navigate', view: 'arena' });
  });
});

describe('SQLite Database Service & Share Invitation', () => {
  it('creates, updates, and deletes memories, notes, secret commands, and leaderboard scores', () => {
    const m = memories.create('Test memory entry');
    assert.ok(m.id > 0);
    const updated = memories.update(m.id, 'Updated memory entry');
    assert.equal(updated?.content, 'Updated memory entry');
    assert.equal(memories.remove(m.id), true);

    const n = notes.create('Test note');
    assert.equal(notes.remove(n.id), true);

    const trig = `test-trigger-${Date.now()}`;
    const sc = secretCommands.create(trig, 'Custom secret response');
    assert.equal(secretCommands.remove(sc.id), true);

    const scoreRow = scores.add({
      name: 'Aadarsh',
      score: 500,
      correct: 5,
      total: 5,
      category: 'Science Quiz',
      difficulty: 'medium',
    });
    assert.ok(scoreRow.id > 0);
    assert.ok(scores.top(5).some((r) => r.id === scoreRow.id));
  });

  it('formats the WhatsApp invitation with the actual URL', () => {
    const msg = buildInvitationMessage('https://jarvis.aadarsh.dev');
    assert.ok(msg.includes("Guys, meet Aadarsh's JARVIS!"));
    assert.ok(msg.includes('https://jarvis.aadarsh.dev'));
  });
});
