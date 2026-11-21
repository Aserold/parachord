// src/renderer/lib/song-source-prefs.js — which source plays one song: "always
// from" the exact source a person picked (that upload, not just its service)
// and "never from" a service, saved per device under song_source_prefs:
//   { [songKey]: { artist, title, pin?: { resolverId, source }, never?: [resolverId] } }
// Keyed like the resolver blocklist: the song's artist and title, lowercased.
// Pure, no React, loads under plain Node.

const { mergedSources, visibleSources } = require('./visible-sources');

function songKey(track) {
  const artist = ((track && track.artist) || '').toLowerCase().trim();
  const title = ((track && track.title) || '').toLowerCase().trim();
  return artist && title ? `${artist}|${title}` : null;
}

// prefs with this song's preference set to { pin, never }. A pin wins over a
// "never" for the same service, and a song left with neither is dropped.
function withSongPref(prefs, track, { pin = null, never = [] } = {}) {
  const key = songKey(track);
  if (!key) return prefs;
  const { [key]: _old, ...rest } = prefs || {};
  const nevers = [...new Set(never)].filter((id) => !pin || id !== pin.resolverId);
  if (!pin && nevers.length === 0) return rest;
  const pref = { artist: track.artist, title: track.title };
  if (pin) pref.pin = { resolverId: pin.resolverId, source: pin.source };
  if (nevers.length) pref.never = nevers;
  return { ...rest, [key]: pref };
}

// The track to pick a source from: the pinned source in place of its service's
// current one, preferred unless the person just chose a source themselves.
// _pinApplied rides along into the fallback replays, so a pinned source that
// failed stays dropped (trackToHoldAfterFailure clears it for the next try).
function withPinnedSource(track, pref) {
  const pin = pref && pref.pin;
  if (!pin) return track;
  return {
    ...track,
    sources: { ...track.sources, [pin.resolverId]: pin.source },
    preferredResolver: track.preferredResolver || pin.resolverId,
    _pinApplied: true,
  };
}

// Whether a service may play the song: not one it never plays from, unless the
// person just chose that service.
function songAllows(pref, resolverId, preferredResolver) {
  return resolverId === preferredResolver || !((pref && pref.never) || []).includes(resolverId);
}

// The sources the song can be pinned to (visibleSources' rule), the pinned one
// shown as pinned even after a newer resolution found another match.
function songSourceChoices(track, pref, { trackSources, playbackResolvers, resolverOrder } = {}) {
  const merged = { ...track, sources: mergedSources(track, trackSources) };
  return visibleSources(withPinnedSource(merged, pref), { playbackResolvers, resolverOrder });
}

module.exports = { songKey, withSongPref, withPinnedSource, songAllows, songSourceChoices };
