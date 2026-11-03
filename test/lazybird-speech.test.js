const { describe, it, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const helper = require('node-red-node-test-helper');
const configNode = require('../nodes/lazybird-config.js');
const speechNode = require('../nodes/lazybird-speech.js');

helper.init(require.resolve('node-red'));

const MP3 = Buffer.from('ID3 fake mp3');

function flow(speech = {}) {
  return [
    { id: 'cfg', type: 'lazybird-config', name: 'Lazybird' },
    { id: 'speech', type: 'lazybird-speech', lazybird: 'cfg', voice: 'v1', speed: '', locale: '', wires: [['out']], ...speech },
    { id: 'out', type: 'helper' },
  ];
}

const credentials = { cfg: { apiKey: 'test-key' } };

function respondWith(response) {
  return mock.method(globalThis, 'fetch', async () => response);
}

function nextMessage(id) {
  return new Promise((resolve) => helper.getNode(id).once('input', resolve));
}

// done(err) reaches node.error, which is what catch nodes listen to.
function nextError(id) {
  return new Promise((resolve) => helper.getNode(id).once('call:error', (call) => resolve(call.args[0])));
}

describe('lazybird-speech', () => {
  before(() => new Promise((resolve) => helper.startServer(resolve)));
  after(() => new Promise((resolve) => helper.stopServer(resolve)));
  afterEach(async () => {
    mock.restoreAll();
    await helper.unload();
  });

  it('sends the text and outputs the MP3', async () => {
    const fetch = respondWith(new Response(MP3, { headers: { 'Content-Type': 'audio/mpeg' } }));
    await helper.load([configNode, speechNode], flow({ locale: 'es-ES', speed: '1.2' }), credentials);
    const output = nextMessage('out');
    helper.getNode('speech').receive({ payload: 'Hola' });
    const msg = await output;

    assert.deepEqual(msg.payload, MP3);
    assert.equal(msg.contentType, 'audio/mpeg');
    const [url, init] = fetch.mock.calls[0].arguments;
    assert.equal(url, 'https://api.lazybird.app/v2/generate-speech');
    assert.equal(init.headers['X-API-Key'], 'test-key');
    assert.deepEqual(JSON.parse(init.body), {
      voiceId: 'v1',
      text: 'Hola',
      settings: { locale: 'es-ES', speed: 1.2 },
    });
  });

  it('sends SSML and takes the voice and settings from the message', async () => {
    const fetch = respondWith(new Response(MP3));
    await helper.load([configNode, speechNode], flow(), credentials);
    const output = nextMessage('out');
    helper.getNode('speech').receive({
      payload: '<speak>Hi <break time="1s"/> there</speak>',
      voice: 'v2',
      settings: { pitch: 0.9 },
    });
    await output;

    assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), {
      voiceId: 'v2',
      ssml: '<speak>Hi <break time="1s"/> there</speak>',
      settings: { pitch: 0.9 },
    });
  });

  it('reports API errors to catch nodes', async () => {
    respondWith(Response.json({ error: 'Authorization Error: bad key' }, { status: 401 }));
    await helper.load([configNode, speechNode], flow(), credentials);
    const error = nextError('speech');
    helper.getNode('speech').receive({ payload: 'Hello' });

    assert.equal((await error).message, 'Your Lazybird API key is not valid. Check the Lazybird config node.');
  });

  it('rejects an empty payload without calling the API', async () => {
    const fetch = respondWith(new Response(MP3));
    await helper.load([configNode, speechNode], flow(), credentials);
    const error = nextError('speech');
    helper.getNode('speech').receive({ payload: '  ' });

    assert.match((await error).message, /msg.payload must be the text/);
    assert.equal(fetch.mock.callCount(), 0);
  });
});

describe('voice list', () => {
  before(() => new Promise((resolve) => helper.startServer(resolve)));
  after(() => new Promise((resolve) => helper.stopServer(resolve)));
  afterEach(async () => {
    mock.restoreAll();
    await helper.unload();
  });

  it('lists your voices first, then the library', async () => {
    const fetch = respondWith(
      Response.json({
        myVoices: [{ id: 'm1', displayName: 'Me', language: 'en-US', mine: true }],
        library: [{ id: 'l1', displayName: 'Elyssia', language: 'en-US', description: 'Warm narrator' }],
      }),
    );
    await helper.load([configNode, speechNode], flow(), credentials);
    const response = await helper.request().get('/lazybird/voices?config=cfg&q=warm').expect(200);

    assert.deepEqual(response.body, [
      { id: 'm1', label: 'Me (en-US) · My voice' },
      { id: 'l1', label: 'Elyssia (en-US, Warm narrator)' },
    ]);
    assert.equal(fetch.mock.calls[0].arguments[0], 'https://api.lazybird.app/v2/voices?limit=100&q=warm');
  });

  it('asks to deploy the config node first', async () => {
    await helper.load([configNode, speechNode], flow(), credentials);
    const response = await helper.request().get('/lazybird/voices?config=unknown').expect(404);

    assert.match(response.body.error, /Deploy the Lazybird config node/);
  });
});
