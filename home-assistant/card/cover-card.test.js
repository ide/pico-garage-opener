// Tests for cover-card.js. Run from this folder:
//   node --test cover-card.test.js
//
// The pure helpers take entity, states, and an optional nowMs so they can be
// driven from fixtures without touching Date.now or the DOM. setupHaptics is
// not covered here; it manipulates the card element and document.body, which
// would need jsdom or a real browser to exercise.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const api = require('./cover-card.js');

const opener = (state) => ({ 'button.garage_door': { state } });
const sensor = (last_changed, state = 'on') => ({
  'binary_sensor.garage_door': { last_changed, state },
});

test('isOpenerOperable', async (t) => {
  await t.test('true when opener reports a timestamp', () => {
    assert.equal(api.isOpenerOperable(opener('2026-05-15T00:00:00Z')), true);
  });
  await t.test('false when opener is unavailable', () => {
    assert.equal(api.isOpenerOperable(opener('unavailable')), false);
  });
  await t.test('false when opener is missing', () => {
    assert.equal(api.isOpenerOperable({}), false);
  });
  await t.test('false when states is nullish', () => {
    assert.equal(api.isOpenerOperable(), false);
    assert.equal(api.isOpenerOperable(null), false);
  });
});

test('getIcon', async (t) => {
  await t.test('open and opening share the open icon', () => {
    assert.equal(api.getIcon({ state: 'open' }), 'mdi:garage-open-variant');
    assert.equal(api.getIcon({ state: 'opening' }), 'mdi:garage-open-variant');
  });
  await t.test('closed and closing share the closed icon', () => {
    assert.equal(api.getIcon({ state: 'closed' }), 'mdi:garage-variant');
    assert.equal(api.getIcon({ state: 'closing' }), 'mdi:garage-variant');
  });
  await t.test('unknown / missing entity falls back to closed icon', () => {
    assert.equal(api.getIcon({ state: 'unknown' }), 'mdi:garage-variant');
    assert.equal(api.getIcon(null), 'mdi:garage-variant');
    assert.equal(api.getIcon(), 'mdi:garage-variant');
  });
});

test('getIconColor', async (t) => {
  await t.test('motion states use info color', () => {
    assert.equal(api.getIconColor({ state: 'opening' }), 'var(--info-color)');
    assert.equal(api.getIconColor({ state: 'closing' }), 'var(--info-color)');
  });
  await t.test('open uses active color', () => {
    assert.equal(api.getIconColor({ state: 'open' }), 'var(--state-cover-active-color)');
  });
  await t.test('closed uses inactive color', () => {
    assert.equal(api.getIconColor({ state: 'closed' }), 'var(--state-inactive-color)');
  });
  await t.test('unknown uses disabled color', () => {
    assert.equal(api.getIconColor({ state: 'unknown' }), 'var(--disabled-text-color)');
    assert.equal(api.getIconColor(null), 'var(--disabled-text-color)');
  });
});

test('formatDuration', async (t) => {
  const now = Date.parse('2026-05-15T12:00:00Z');

  await t.test('less than a minute', () => {
    assert.equal(api.formatDuration(now - 0, now), 'just now');
    assert.equal(api.formatDuration(now - 29 * 1000, now), 'just now');
  });
  await t.test('singular minute', () => {
    assert.equal(api.formatDuration(now - 60 * 1000, now), '1 minute ago');
  });
  await t.test('plural minutes', () => {
    assert.equal(api.formatDuration(now - 5 * 60 * 1000, now), '5 minutes ago');
    assert.equal(api.formatDuration(now - 59 * 60 * 1000, now), '59 minutes ago');
  });
  await t.test('singular hour', () => {
    assert.equal(api.formatDuration(now - 60 * 60 * 1000, now), '1 hour ago');
  });
  await t.test('plural hours', () => {
    assert.equal(api.formatDuration(now - 5 * 60 * 60 * 1000, now), '5 hours ago');
  });
  await t.test('singular day', () => {
    assert.equal(api.formatDuration(now - 24 * 60 * 60 * 1000, now), '1 day ago');
  });
  await t.test('plural days', () => {
    assert.equal(api.formatDuration(now - 5 * 24 * 60 * 60 * 1000, now), '5 days ago');
  });
  await t.test('future timestamps clamp to "just now"', () => {
    assert.equal(api.formatDuration(now + 10_000, now), 'just now');
  });
});

test('getStateDisplay', async (t) => {
  const now = Date.parse('2026-05-15T12:00:00Z');
  const fiveMinAgo = '2026-05-15T11:55:00Z';
  const tenMinAgo = '2026-05-15T11:50:00Z';

  await t.test('opening shows cover last_changed, not sensor', () => {
    const result = api.getStateDisplay(
      { state: 'opening', last_changed: fiveMinAgo },
      sensor(tenMinAgo),
      now,
    );
    assert.equal(result, 'Opening<span class="garage-when"> · 5 minutes ago</span>');
  });
  await t.test('closing shows cover last_changed, not sensor', () => {
    const result = api.getStateDisplay(
      { state: 'closing', last_changed: fiveMinAgo },
      sensor(tenMinAgo),
      now,
    );
    assert.equal(result, 'Closing<span class="garage-when"> · 5 minutes ago</span>');
  });
  await t.test('open shows sensor last_changed', () => {
    const result = api.getStateDisplay(
      { state: 'open', last_changed: tenMinAgo },
      sensor(fiveMinAgo),
      now,
    );
    assert.equal(result, 'Open<span class="garage-when"> · 5 minutes ago</span>');
  });
  await t.test('closed shows sensor last_changed', () => {
    const result = api.getStateDisplay(
      { state: 'closed', last_changed: tenMinAgo },
      sensor(fiveMinAgo, 'off'),
      now,
    );
    assert.equal(result, 'Closed<span class="garage-when"> · 5 minutes ago</span>');
  });
  await t.test('unknown shows "Sensor offline" with sensor timestamp', () => {
    const result = api.getStateDisplay(
      { state: 'unknown' },
      sensor(fiveMinAgo, 'unavailable'),
      now,
    );
    assert.equal(result, 'Sensor offline<span class="garage-when"> · 5 minutes ago</span>');
  });
  await t.test('"Loading…" when sensor entity is missing', () => {
    assert.equal(api.getStateDisplay({ state: 'unknown' }, {}, now), 'Loading…');
    assert.equal(api.getStateDisplay({ state: 'unknown' }, null, now), 'Loading…');
  });
});

test('getLabel', async (t) => {
  await t.test('"Opener loading…" when button entity is missing', () => {
    assert.equal(api.getLabel({ state: 'closed' }, {}), 'Opener loading…');
  });
  await t.test('"Opener offline" when button is unavailable', () => {
    assert.equal(api.getLabel({ state: 'closed' }, opener('unavailable')), 'Opener offline');
  });
  await t.test('cover-specific hold hints when opener is operable', () => {
    const operable = opener('2026-05-15T00:00:00Z');
    assert.equal(api.getLabel({ state: 'open' }, operable), 'Hold to close');
    assert.equal(api.getLabel({ state: 'opening' }, operable), 'Hold to stop');
    assert.equal(api.getLabel({ state: 'closing' }, operable), 'Hold to open');
    assert.equal(api.getLabel({ state: 'closed' }, operable), 'Hold to open');
  });
  await t.test('default hint for unrecognized cover state', () => {
    assert.equal(api.getLabel({ state: 'unknown' }, opener('ok')), 'Hold to press');
  });
});

test('getHoldAction', async (t) => {
  await t.test('call-service when opener is operable', () => {
    assert.equal(api.getHoldAction(opener('2026-05-15T00:00:00Z')), 'call-service');
  });
  await t.test('none when opener is offline', () => {
    assert.equal(api.getHoldAction(opener('unavailable')), 'none');
  });
  await t.test('none when opener is missing', () => {
    assert.equal(api.getHoldAction({}), 'none');
  });
});
