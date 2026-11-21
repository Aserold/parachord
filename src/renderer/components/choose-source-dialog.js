// src/renderer/components/choose-source-dialog.js: "Choose Source…" on a
// track's right-click menu. Which source always plays this song (the exact
// match shown, lib/song-source-prefs.js), or Auto, and which services never
// do. A memo'd dialog on the shared Modal, RadioGroup, Checkbox and Button;
// functions arrive through useStableHandlers (CHOOSE_SOURCE_DIALOG_HANDLERS,
// pinned by tests/renderer/page-memo.test.js). Loads under plain Node.

const { Modal } = require('./modal');
const { Button } = require('./button');
const { RadioGroup, Checkbox } = require('./fields');
const { ResolverIcon } = require('./brand-logos');
const { EmptyState } = require('./states');
const { pluginName } = require('../lib/plugin-names');
const { formatDuration } = require('../lib/track-duration');

const CHOOSE_SOURCE_DIALOG_HANDLERS = ['closeChooseSource', 'saveChosenSource'];

// sources: songSourceChoices' list ({ resolverId, source }); pref: the song's
// saved { pin, never }; saveChosenSource({ pin, never }).
const ChooseSourceDialog = React.memo(function ChooseSourceDialog(props) {
  const {
    closeChooseSource,
    pref,
    saveChosenSource,
    sources,
    track,
  } = props;
  const e = React.createElement;
  const [choice, setChoice] = React.useState((pref && pref.pin && pref.pin.resolverId) || 'auto');
  const [never, setNever] = React.useState((pref && pref.never) || []);

  const pick = (id) => {
    setChoice(id);
    setNever((n) => n.filter((x) => x !== id));
  };
  const toggleNever = (id, on) => {
    setNever((n) => (on ? [...n, id] : n.filter((x) => x !== id)));
    if (on && choice === id) setChoice('auto');
  };
  // A pin whose service isn't listed right now (turned off) is kept, not erased.
  const save = () => saveChosenSource({
    pin: sources.find((s) => s.resolverId === choice) || (pref && pref.pin && pref.pin.resolverId === choice ? pref.pin : null),
    never,
  });

  const options = [{ value: 'auto', label: 'Auto', hint: 'Your service order picks the source.' }].concat(
    sources.map(({ resolverId, source }) => ({
      value: resolverId,
      label: e('span', { className: 'inline-flex items-center gap-2' },
        e(ResolverIcon, { resolverId, size: 14, fill: 'currentColor' }), pluginName(resolverId)),
      hint: [source.title, source.artist, source.album, formatDuration(source.duration)].filter(Boolean).join(' · '),
    })));

  return e(Modal, {
    open: true,
    onClose: closeChooseSource,
    title: 'Choose source',
    description: `${track.artist} – ${track.title}`,
    size: 'sm',
    footer: [
      e(Button, { key: 'cancel', variant: 'secondary', onClick: closeChooseSource }, 'Cancel'),
      e(Button, { key: 'save', variant: 'primary', onClick: save }, 'Save'),
    ],
  },
  e('div', { className: 'flex flex-col', style: { marginTop: '16px', gap: '16px' } },
    sources.length === 0 && e(EmptyState, {
      compact: true, align: 'start', icon: null,
      title: 'Not found on your services yet',
      body: 'Play the song once, then choose its source.',
    }),
    e(RadioGroup, { name: 'song-source', label: 'Plays from', value: choice, options, onChange: pick }),
    sources.length > 0 && e('fieldset', { className: 'flex flex-col', style: { gap: '8px', border: 0, margin: 0, padding: 0 } },
      e('legend', { className: 'text-ink-secondary', style: { fontSize: '12px', fontWeight: 500, marginBottom: '8px' } }, 'Never play this song from'),
      sources.map(({ resolverId }) => e('label', {
        key: resolverId, className: 'inline-flex items-center gap-2 text-ink-primary cursor-pointer', style: { fontSize: '13px' },
      },
      e(Checkbox, { checked: never.includes(resolverId), onChange: (on) => toggleNever(resolverId, on) }),
      pluginName(resolverId))))));
});

module.exports = { ChooseSourceDialog, CHOOSE_SOURCE_DIALOG_HANDLERS };
