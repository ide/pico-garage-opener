// Garage cover button-card helpers.
//
// The section between @begin-inline and @end-inline is extracted by
// build-card.mjs and embedded once in cover-card.generated.yaml under
// `variables.helpers` as a [[[ ]]] template that returns the API object.
// Every other [[[ ]]] block in the generated YAML calls
// `variables.helpers.X(...)` - no globals, no per-block duplication.
//
// For unit tests, this file loads as a CommonJS module and exports the API
// object directly. Run `node --test cover-card.test.js` from this folder.
// The module.exports line lives outside the markers so it doesn't end up
// in the inlined YAML.

// @begin-inline
const COVER_OPEN = 'open';
const COVER_OPENING = 'opening';
const COVER_CLOSED = 'closed';
const COVER_CLOSING = 'closing';

const OPENER_ENTITY_ID = 'button.garage_door';
const SENSOR_ENTITY_ID = 'binary_sensor.garage_door';

const ICON_OPEN = 'mdi:garage-open-variant';
const ICON_CLOSED = 'mdi:garage-variant';

const ICONS_BY_COVER_STATE = {
  [COVER_OPEN]: ICON_OPEN,
  [COVER_OPENING]: ICON_OPEN,
  [COVER_CLOSED]: ICON_CLOSED,
  [COVER_CLOSING]: ICON_CLOSED,
};

const COLORS_BY_COVER_STATE = {
  [COVER_OPEN]: 'var(--state-cover-active-color)',
  [COVER_OPENING]: 'var(--info-color)',
  [COVER_CLOSED]: 'var(--state-inactive-color)',
  [COVER_CLOSING]: 'var(--info-color)',
};

const HOLD_HINTS_BY_COVER_STATE = {
  [COVER_OPEN]: 'Hold to close',
  [COVER_OPENING]: 'Hold to stop',
  [COVER_CLOSING]: 'Hold to open',
  [COVER_CLOSED]: 'Hold to open',
};

const DISPLAY_LABELS_BY_COVER_STATE = {
  [COVER_OPEN]: 'Open',
  [COVER_OPENING]: 'Opening',
  [COVER_CLOSED]: 'Closed',
  [COVER_CLOSING]: 'Closing',
};

const isOpenerOperable = (states) => {
  const opener = states?.[OPENER_ENTITY_ID];
  return Boolean(opener) && opener.state !== 'unavailable';
};

// Use the closed icon when the cover state isn't one we recognize. The sensor
// reading no longer participates in icon selection since the FSM returns
// 'unknown' rather than falling back to last-known sensor state.
const getIcon = (entity) => {
  return ICONS_BY_COVER_STATE[entity?.state] ?? ICON_CLOSED;
};

const getIconColor = (entity) => {
  return COLORS_BY_COVER_STATE[entity?.state] ?? 'var(--disabled-text-color)';
};

const formatDuration = (lastChangedMs, nowMs) => {
  const reference = typeof nowMs === 'number' ? nowMs : Date.now();
  const ageInSeconds = Math.max(0, (reference - lastChangedMs) / 1000);
  const ageInMinutes = Math.round(ageInSeconds / 60);
  if (ageInMinutes < 1) {
    return 'just now';
  }
  if (ageInMinutes === 1) {
    return '1 minute ago';
  }
  if (ageInMinutes < 60) {
    return `${ageInMinutes} minutes ago`;
  }
  const ageInHours = Math.round(ageInSeconds / 3600);
  if (ageInHours < 24) {
    return ageInHours === 1 ? '1 hour ago' : `${ageInHours} hours ago`;
  }
  const ageInDays = Math.round(ageInSeconds / 86400);
  return ageInDays === 1 ? '1 day ago' : `${ageInDays} days ago`;
};

const renderWithDuration = (label, lastChangedMs, nowMs) => {
  const duration = formatDuration(lastChangedMs, nowMs);
  return `${label}<span class="garage-when"> · ${duration}</span>`;
};

// The cover's own last_changed advances the moment intent flips, so it's the
// right timestamp for the motion states. For the at-rest states the reed
// switch's last_changed is what the user cares about ("closed for 5 minutes"
// means the door's been physically closed for 5 minutes).
const getStateDisplay = (entity, states, nowMs) => {
  const cover = entity?.state;
  const sensor = states?.[SENSOR_ENTITY_ID];

  if (cover === COVER_OPENING || cover === COVER_CLOSING) {
    const ms = entity?.last_changed ? Date.parse(entity.last_changed) : Date.now();
    return renderWithDuration(DISPLAY_LABELS_BY_COVER_STATE[cover], ms, nowMs);
  }

  if (cover === COVER_OPEN || cover === COVER_CLOSED) {
    const ms = sensor?.last_changed ? Date.parse(sensor.last_changed) : Date.now();
    return renderWithDuration(DISPLAY_LABELS_BY_COVER_STATE[cover], ms, nowMs);
  }

  // Cover is unknown / unavailable / loading; the sensor's last_changed marks
  // when it dropped offline (HA advances last_changed on transitions into
  // unavailable).
  if (!sensor) {
    return 'Loading…';
  }
  const ms = sensor.last_changed ? Date.parse(sensor.last_changed) : Date.now();
  return renderWithDuration('Sensor offline', ms, nowMs);
};

const getLabel = (entity, states) => {
  const opener = states?.[OPENER_ENTITY_ID];
  if (!opener) {
    return 'Opener loading…';
  }
  if (opener.state === 'unavailable') {
    return 'Opener offline';
  }
  return HOLD_HINTS_BY_COVER_STATE[entity?.state] ?? 'Hold to press';
};

const getHoldAction = (states) => {
  return isOpenerOperable(states) ? 'call-service' : 'none';
};

// Side-effecting: attaches haptic event listeners to the card element exactly
// once. Idempotent via the _hapticAtThreshold flag on the card.
const setupHaptics = (cardElement) => {
  if (!cardElement || cardElement._hapticAtThreshold) {
    return;
  }

  const fireHaptic = (kind) => {
    cardElement.dispatchEvent(new CustomEvent('haptic', {
      detail: kind,
      bubbles: true,
      composed: true,
    }));
  };

  // Prime haptic: button-card's action-handler runs a disc-grow transition
  // when a press starts. We listen at document.body because the handler is a
  // lazily-created singleton, and we filter to presses that landed inside our
  // card's bounding rect so we don't fire for other cards.
  document.body.addEventListener('transitionrun', (event) => {
    const handler = event.target;
    if (handler?.tagName !== 'BUTTON-CARD-ACTION-HANDLER') {
      return;
    }
    if (event.propertyName !== 'transform') {
      return;
    }
    // Skip the scale-down transition that stopAnimation also runs; left is unset there
    if (!handler.style.left) {
      return;
    }
    const x = parseFloat(handler.style.left);
    const y = parseFloat(handler.style.top);
    const rect = cardElement.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      return;
    }
    if (isOpenerOperable(cardElement._hass?.states)) {
      fireHaptic('light');
    }
  }, { passive: true });

  // Commit haptic: button-card dispatches hass-action when the gesture commits
  // as a hold.
  cardElement.addEventListener('hass-action', (event) => {
    if (event.detail?.action === 'hold' && isOpenerOperable(cardElement._hass?.states)) {
      fireHaptic('light');
    }
  });

  cardElement._hapticAtThreshold = true;
};

const api = {
  isOpenerOperable,
  getIcon,
  getIconColor,
  formatDuration,
  renderWithDuration,
  getStateDisplay,
  getLabel,
  getHoldAction,
  setupHaptics,
};
// @end-inline

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
