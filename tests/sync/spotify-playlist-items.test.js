// Spotify's February 2026 playlist paths (/items, /me/playlists, /me/library)
// in the sync provider and the plug-in's import.
const spotify = require('../../sync-providers/spotify');
const { lookupPlaylist } = require('../../plugins-src/spotify/implementation.js');

const res = (status, body = {}) => ({
  ok: status < 400, status, statusText: '',
  headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body),
});
const track = (id) => ({ id, name: `T${id}`, uri: `spotify:track:${id}`, type: 'track', duration_ms: 1000, artists: [{ name: 'A' }], album: { name: 'Al', id: 'al', images: [] } });
afterEach(() => { delete global.fetch; });

describe('sync provider', () => {
  let calls;
  const answer = (handler) => {
    calls = [];
    global.fetch = jest.fn(async (url, opts = {}) => {
      const call = { method: opts.method || 'GET', path: url.replace('https://api.spotify.com/v1', ''), body: opts.body && JSON.parse(opts.body) };
      calls.push(call);
      return handler(call);
    });
  };
  const sent = () => calls.map(c => `${c.method} ${c.path}`);

  test('reads a playlist from /items, whose entries carry `item`', async () => {
    answer(() => res(200, { items: [{ added_at: '2026-01-01T00:00:00Z', item: track('1') }, { item: null }] }));
    const tracks = await spotify.fetchPlaylistTracks('PID', 'tok');
    expect(sent()).toEqual(['GET /playlists/PID/items?limit=50']);
    expect(tracks.map(t => t.spotifyUri)).toEqual(['spotify:track:1']);
  });

  test('replaces and appends through /items', async () => {
    answer((c) => (c.method === 'GET' ? res(200, { items: [] }) : res(200, { snapshot_id: `snap-${c.method}` })));
    const tracks = Array.from({ length: 101 }, (_, i) => ({ spotifyUri: `spotify:track:${i}` }));
    const result = await spotify.updatePlaylistTracks('PID', tracks, 'tok');
    expect(sent()).toEqual(['GET /playlists/PID/items?limit=50', 'PUT /playlists/PID/items', 'POST /playlists/PID/items']);
    expect(calls[2].body.uris).toEqual(['spotify:track:100']);
    expect(result.snapshotId).toBe('snap-POST');
  });

  test('a push the remote already matches writes nothing', async () => {
    answer((c) => (c.path.includes('/items') ? res(200, { items: [{ item: track('1') }, { item: track('2') }] }) : res(200, { snapshot_id: 'same' })));
    const result = await spotify.updatePlaylistTracks('PID', [{ spotifyUri: 'spotify:track:1' }, { spotifyUri: 'spotify:track:2' }], 'tok');
    expect(calls.every(c => c.method === 'GET')).toBe(true);
    expect(result.snapshotId).toBe('same');
  });

  test('creates at /me/playlists and unfollows through /me/library', async () => {
    answer(() => res(200, { id: 'NEW', snapshot_id: 's' }));
    expect(await spotify.createPlaylist('Mix', '', 'tok')).toEqual({ externalId: 'NEW', snapshotId: 's' });
    await spotify.deletePlaylist('PID', 'tok');
    expect(sent()).toEqual(['POST /me/playlists', 'DELETE /me/library?uris=spotify%3Aplaylist%3APID']);
  });
});

describe('the plug-in’s playlist import', () => {
  const url = 'https://open.spotify.com/playlist/PID';
  const scrapePlaylist = jest.fn(async () => ({ success: true, playlist: { name: 'Mix', tracks: [{ title: 'only the first part' }] } }));
  const answer = (handler) => { global.fetch = jest.fn(async (u) => handler(u.replace('https://api.spotify.com/v1', ''))); };
  beforeEach(() => {
    scrapePlaylist.mockClear();
    global.window = { electron: { spotify: { scrapePlaylist } } };
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { delete global.window; jest.restoreAllMocks(); });

  test('imports from /items', async () => {
    answer((p) => (p.includes('/items') ? res(200, { items: [{ item: track('1') }, { item: track('2') }], next: null }) : res(200, { name: 'Mix' })));
    const playlist = await lookupPlaylist(url, { token: 'tok' });
    expect(global.fetch.mock.calls[1][0]).toContain('/playlists/PID/items?limit=50');
    expect(playlist.tracks.map(t => t.spotifyId)).toEqual(['1', '2']);
  });

  test('a rate limit part-way is an error, never a shorter playlist or the embed page’s', async () => {
    let page = 0;
    answer((p) => {
      if (!p.includes('/items')) return res(200, { name: 'Mix' });
      page += 1;
      return page === 1 ? res(200, { items: [{ item: track('1') }], next: 'https://api.spotify.com/v1/playlists/PID/items?offset=50' }) : res(429);
    });
    await expect(lookupPlaylist(url, { token: 'tok' })).rejects.toMatchObject({ userMessage: expect.stringMatching(/limiting requests/) });
    expect(scrapePlaylist).not.toHaveBeenCalled();
  });

  test('a refused playlist request is an error too, not an untitled playlist', async () => {
    answer((p) => (p.includes('/items') ? res(200, { items: [{ item: track('1') }], next: null }) : res(500)));
    await expect(lookupPlaylist(url, { token: 'tok' })).rejects.toMatchObject({ userMessage: expect.stringMatching(/Try again/) });
    expect(scrapePlaylist).not.toHaveBeenCalled();
  });

  test('a playlist that is not yours comes from the embed page, and says why when that fails', async () => {
    answer((p) => (p.includes('/items') ? res(403) : res(200, { name: 'Mix' })));
    expect((await lookupPlaylist(url, { token: 'tok' })).tracks).toHaveLength(1);
    scrapePlaylist.mockResolvedValueOnce({ success: false });
    await expect(lookupPlaylist(url, { token: 'tok' })).rejects.toMatchObject({ userMessage: expect.stringMatching(/own or collaborate on/) });
  });
});
