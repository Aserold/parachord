// src/renderer/components/song-sources-section.js: Settings › General › Song
// Sources. Every song with a source of its own (Choose Source…, the playbar's
// "Remember for this song") and every match blocked with Report Bad Match,
// each with Remove. Props-driven; loads under plain Node.

const { SettingsSection } = require('./settings-cards');
const { SettingRow } = require('./fields');
const { Button } = require('./button');
const { EmptyState } = require('./states');
const { pluginName } = require('../lib/plugin-names');
const { withSongPref } = require('../lib/song-source-prefs');

function prefHint(pref) {
  return [
    pref.pin && `Always from ${pluginName(pref.pin.resolverId)}`,
    pref.never && `Never from ${pref.never.map((id) => pluginName(id)).join(', ')}`,
  ].filter(Boolean).join(' · ');
}

// unblockSource(entry) takes a blocklist entry off and lets the song resolve again.
function SongSourcesSection({ songSourcePrefs, setSongSourcePrefs, resolverBlocklist, unblockSource }) {
  const e = React.createElement;
  const removeButton = (name, onClick) => e(Button, { variant: 'secondary', size: 'sm', 'aria-label': `Remove ${name}`, onClick }, 'Remove');
  const rows = [
    ...Object.entries(songSourcePrefs || {}).map(([key, pref]) => {
      const name = `${pref.artist} – ${pref.title}`;
      return e(SettingRow, { key, label: name, hint: prefHint(pref) },
        removeButton(name, () => setSongSourcePrefs((prev) => withSongPref(prev, pref, {}))));
    }),
    ...(resolverBlocklist || []).map((entry) => {
      const name = `${entry.artist} – ${entry.title}`;
      return e(SettingRow, { key: `${entry.resolverId}|${entry.artist}|${entry.title}|${entry.sourceId}`, label: name, hint: `Blocked a ${pluginName(entry.resolverId)} match` },
        removeButton(name, () => unblockSource(entry)));
    }),
  ];
  return e(SettingsSection, { title: 'Song Sources', description: 'Songs that play from a source you chose, and matches you reported' },
    rows.length > 0 ? rows : e(EmptyState, {
      compact: true, align: 'start', icon: null,
      title: 'No song sources yet',
      body: 'Right-click a song and choose Choose Source… to pick where it plays.',
    }));
}

module.exports = { SongSourcesSection };
