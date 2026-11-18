#!/usr/bin/env node
/**
 * Demo mode: a stand-in for the Claude Messages API (POST /v1/messages).
 *
 * Lets you run the full pipeline (Sheets, Telegram, daily summary, error flow)
 * without an Anthropic API key. Classification is a simple keyword heuristic,
 * NOT an LLM. The response has the same shape as the real API, so the n8n
 * workflow runs unchanged. Only the URL differs (CLAUDE_API_URL).
 *
 *   node scripts/mock-claude.js                    # http://localhost:8787/v1/messages
 *   PORT=9000 node scripts/mock-claude.js
 *   MOCK_BAD_JSON_RATE=0.3 node scripts/mock-claude.js   # 30% of replies are not JSON -> exercises retry + error flow
 *
 * No dependencies. Node 18+.
 */

'use strict';

const http = require('http');

const PORT = Number(process.env.PORT || 8787);
const BAD_JSON_RATE = Number(process.env.MOCK_BAD_JSON_RATE || 0);

const has = (text, words) => words.some((w) => text.includes(w));

const IRRELEVANT = [
  // spam / vendors
  'seo', 'first page of google', 'crypto', 'double your money', 'מבצע', 'הנחה לקבלנים', 'לקבלנים',
  // jobs
  'מחפש עבודה', 'מחפשת עבודה', 'משרה', 'hiring', 'intern', 'job',
  // wrong service / place / mistake / tests
  'car ', 'my car', 'רכב', 'הובלות', 'הובלה', 'moving', 'toronto', 'canada', 'usa',
  'בטעות', 'by mistake', 'test test', 'asdf',
  // prompt injection attempts are a red flag for a real lead
  'ignore your previous instructions', 'ignore previous instructions',
];

const HOT = [
  'דחוף', 'בהקדם', 'הכי מוקדם', 'asap', 'urgent', 'leak', 'נזילה', 'fell', 'מתפורר',
  'תקציב', 'budget', 'הצעת מחיר', 'quote', 'לתאם', 'measure', 'come see', 'לבוא לראות',
  'this week', 'השבוע', 'בשבוע הבא', 'החודש הבא', 'החודש', 'within a month', 'in january',
  'שבועיים', '3 שבועות', 'weeks', 'permit', 'plans', 'מפתח', 'מתחילים', 'start within',
];

const AREAS = [
  ['full apartment', ['שיפוץ מלא', 'full renovation', 'whole apartment', 'דירה ישנה', 'דירות ישנות', 'דירת 3', 'דירת 4', 'older apartment']],
  ['kitchen', ['מטבח', 'kitchen']],
  ['bathroom', ['אמבט', 'מקלחת', 'חדר רחצה', 'חדרי רחצה', 'bathroom']],
  ['flooring', ['ריצוף', 'floor', 'פורצלן']],
  ['paint', ['צבע', 'צביעת', 'paint', 'טיח', 'plaster', 'ceiling']],
  ['extension', ['הרחבה', 'הרחבת', 'extension', 'מרפסת']],
];

const RENOVATION = AREAS.flatMap(([, words]) => words).concat(['שיפוץ', 'renovat', 'redo', 'contractor']);

function classify(lead) {
  const text = `${lead.message || ''} ${lead.name || ''}`.toLowerCase();
  const language = /[֐-׿]/.test(lead.message || '') ? 'he' : 'en';
  const area = (AREAS.find(([, words]) => has(text, words)) || ['other'])[0];

  if (has(text, IRRELEVANT) || !has(text, RENOVATION)) {
    return {
      quality: 'irrelevant',
      extracted: { interest_area: 'none', urgency: 'none', language },
      reason: 'Not a renovation request from a potential customer (spam, vendor, job seeker or unrelated service).',
    };
  }
  if (has(text, HOT)) {
    const urgent = has(text, ['דחוף', 'בהקדם', 'הכי מוקדם', 'asap', 'urgent', 'leak', 'נזילה', 'fell', 'this week', 'השבוע', 'שבועיים']);
    return {
      quality: 'hot',
      extracted: { interest_area: area, urgency: urgent ? 'high' : 'medium', language },
      reason: `Concrete ${area} project with a clear timeline, budget or request for a quote.`,
    };
  }
  return {
    quality: 'warm',
    extracted: { interest_area: area, urgency: 'low', language },
    reason: `Interested in ${area} work but still early stage with no firm timeline.`,
  };
}

function leadFromRequest(body) {
  const content = body?.messages?.[0]?.content;
  const text = typeof content === 'string' ? content : '';
  const m = text.match(/<lead>\s*([\s\S]*?)\s*<\/lead>/);
  try {
    return m ? JSON.parse(m[1]) : {};
  } catch {
    return {};
  }
}

function reply(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function handle(req, res) {
  if (req.method === 'GET' && req.url === '/health') return reply(res, 200, { ok: true });
  if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
    return reply(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'Not found' } });
  }

  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'Body is not JSON' } });
    }

    const lead = leadFromRequest(body);
    const result = classify(lead);
    const isRetry = String(body.messages?.[0]?.content || '').includes('previous answer failed validation');
    const sendBad = !isRetry && Math.random() < BAD_JSON_RATE;
    const text = sendBad ? 'Sure! This lead looks promising.' : JSON.stringify(result);

    console.log(`${new Date().toISOString()}  ${sendBad ? 'BAD-JSON' : result.quality.padEnd(10)}  ${lead.name || '?'}`);

    reply(res, 200, {
      id: 'msg_demo_' + Date.now().toString(36),
      type: 'message',
      role: 'assistant',
      model: 'demo-mock (' + (body.model || 'unknown') + ')',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  });
}

if (require.main === module) {
  http.createServer(handle).listen(PORT, () => {
    console.log(`Demo Claude mock listening on http://localhost:${PORT}/v1/messages`);
    console.log('Keyword heuristic, not an LLM. Set CLAUDE_API_URL in n8n to use it.');
  });
}

module.exports = { classify };
