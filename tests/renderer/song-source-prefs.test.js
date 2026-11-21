// Per-song source preferences (lib/song-source-prefs.js): the saved shape,
// the pinned source handlePlay picks from, and what Choose Source… lists.
const fs = require('fs');
const path = require('path');
const { songKey, withSongPref, withPinnedSource, songAllows, songSourceChoices } = require('../../src/renderer/lib/song-source-prefs');

const song = { id: 't1', artist: 'Radiohead ', title: 'Creep' };
const sc = { soundcloudId: 'sc-1', title: 'Creep (Acoustic)', artist: 'Radiohead', confidence: 0.95 };
const sc2 = { soundcloudId: 'sc-2', title: 'Creep', artist: 'Radiohead', confidence: 0.95 };
const yt = { youtubeId: 'yt-1', title: 'Creep', artist: 'Radiohead', confidence: 0.95 };

describe('songKey', () => {
  test('artist and title, lowercased and trimmed, like the resolver blocklist', () => {
    expect(songKey(song)).toBe('radiohead|creep');
    expect(songKey({ artist: 'A' })).toBeNull();
  });
});

describe('withSongPref', () => {
  test('saves the pin with the song name, and a never list', () => {
    const prefs = withSongPref({}, song, { pin: { resolverId: 'soundcloud', source: sc }, never: ['youtube'] });
    expect(prefs).toEqual({ 'radiohead|creep': { artist: 'Radiohead ', title: 'Creep', pin: { resolverId: 'soundcloud', source: sc }, never: ['youtube'] } });
  });

  test('a pin wins over never for the same service, and duplicates go', () => {
    const prefs = withSongPref({}, song, { pin: { resolverId: 'soundcloud', source: sc }, never: ['soundcloud', 'youtube', 'youtube'] });
    expect(prefs['radiohead|creep'].never).toEqual(['youtube']);
  });

  test('a song left with no pin and no never is removed; others stay', () => {
    const other = withSongPref({}, { artist: 'B', title: 'C' }, { never: ['spotify'] });
    const prefs = withSongPref(withSongPref(other, song, { never: ['youtube'] }), song, {});
    expect(Object.keys(prefs)).toEqual(['b|c']);
  });
});

describe('withPinnedSource', () => {
  const pref = { pin: { resolverId: 'soundcloud', source: sc } };

  test('the pinned upload replaces that service’s current match and is preferred', () => {
    const t = withPinnedSource({ ...song, sources: { soundcloud: sc2, youtube: yt } }, pref);
    expect(t.sources).toEqual({ soundcloud: sc, youtube: yt });
    expect(t.preferredResolver).toBe('soundcloud');
    expect(t._pinApplied).toBe(true);
  });

  test('a source the person just picked still wins', () => {
    expect(withPinnedSource({ ...song, sources: {}, preferredResolver: 'youtube' }, pref).preferredResolver).toBe('youtube');
  });

  test('no pin, no change', () => {
    const t = { ...song, sources: { youtube: yt } };
    expect(withPinnedSource(t, { never: ['youtube'] })).toBe(t);
  });
});

describe('songAllows', () => {
  test('a never service is left out, unless the person just chose it', () => {
    const pref = { never: ['soundcloud'] };
    expect(songAllows(pref, 'soundcloud')).toBe(false);
    expect(songAllows(pref, 'soundcloud', 'soundcloud')).toBe(true);
    expect(songAllows(pref, 'youtube')).toBe(true);
    expect(songAllows(undefined, 'soundcloud')).toBe(true);
  });
});

describe('handlePlay applies the song’s preference', () => {
  test('pins after the background merge and filters before the sort', () => {
    const engine = fs.readFileSync(path.join(__dirname, '../../src/renderer/hooks/use-playback-engine.js'), 'utf8');
    const pin = engine.indexOf('trackOrSource = withPinnedSource(trackOrSource, songPref);');
    const filter = engine.indexOf('.filter(s => songAllows(songPref, s.resolverId, preferredResolver))');
    const sort = engine.indexOf('.sort((a, b) => compareCandidateSources(a, b, preferredResolver));');
    expect(engine.indexOf('...filteredResolved } };')).toBeLessThan(pin);
    expect(filter).toBeGreaterThan(pin);
    expect(sort).toBeGreaterThan(filter);
  });

  test('once per play, and only for a service that can play here: a fallback keeps the failed pin dropped', () => {
    const engine = fs.readFileSync(path.join(__dirname, '../../src/renderer/hooks/use-playback-engine.js'), 'utf8');
    expect(engine).toContain('if (songPref?.pin && !trackOrSource._pinApplied && activeResolversRef.current.includes(songPref.pin.resolverId)) {');
    const { trackToHoldAfterFailure } = require('../../src/renderer/lib/playback-helpers');
    expect(trackToHoldAfterFailure({ title: 'Creep', _pinApplied: true })).toEqual({ title: 'Creep' });
  });
});

describe('songSourceChoices', () => {
  test('shows the pinned upload even after a newer resolution found another', () => {
    const choices = songSourceChoices({ ...song, sources: {} }, { pin: { resolverId: 'soundcloud', source: sc } }, {
      trackSources: { t1: { soundcloud: sc2, youtube: yt } }, playbackResolvers: ['soundcloud', 'youtube'], resolverOrder: ['youtube', 'soundcloud'],
    });
    expect(choices.map((c) => [c.resolverId, c.source])).toEqual([['youtube', yt], ['soundcloud', sc]]);
  });

  test('only services that can play here', () => {
    const choices = songSourceChoices({ ...song, sources: { soundcloud: sc2, youtube: yt } }, null, { playbackResolvers: ['youtube'] });
    expect(choices.map((c) => c.resolverId)).toEqual(['youtube']);
  });
});
