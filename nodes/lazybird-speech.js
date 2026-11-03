const { generateSpeech } = require('./lib/api');

const DEFAULT_VOICE_ID = 'tgJ2Hes6DauwTg8kFrRPLN';
const SSML = /^\s*<speak[\s>]/i;

module.exports = function (RED) {
  function LazybirdSpeechNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const account = RED.nodes.getNode(config.lazybird);

    node.on('input', async (msg, send, done) => {
      const apiKey = account && account.credentials && account.credentials.apiKey;
      if (!apiKey) {
        fail(new Error('Add your Lazybird API key to the Lazybird config node.'));
        return;
      }
      const input = msg.payload;
      if (typeof input !== 'string' || input.trim() === '') {
        fail(new Error('msg.payload must be the text (or SSML) to speak.'));
        return;
      }

      const settings = definedOnly({
        locale: msg.locale ?? (config.locale || undefined),
        speed: msg.speed ?? (config.speed ? Number(config.speed) : undefined),
        ...msg.settings,
      });
      const speech = {
        voiceId: msg.voice || config.voice || DEFAULT_VOICE_ID,
        ...(SSML.test(input) ? { ssml: input } : { text: input }),
        ...(Object.keys(settings).length > 0 ? { settings } : {}),
      };

      node.status({ fill: 'blue', shape: 'dot', text: 'generating' });
      try {
        msg.payload = await generateSpeech(apiKey, speech);
        msg.contentType = 'audio/mpeg';
        node.status({});
        send(msg);
        done();
      } catch (err) {
        fail(err);
      }

      function fail(err) {
        node.status({ fill: 'red', shape: 'ring', text: err.message.slice(0, 40) });
        done(err);
      }
    });
  }

  RED.nodes.registerType('lazybird-speech', LazybirdSpeechNode);
};

function definedOnly(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
