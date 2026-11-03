const { listVoices } = require('./lib/api');

module.exports = function (RED) {
  function LazybirdConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
  }

  RED.nodes.registerType('lazybird-config', LazybirdConfigNode, {
    credentials: { apiKey: { type: 'password' } },
  });

  // Voice list for the speech node's editor. The key stays on the server, so the
  // config node has to be deployed before the list can load.
  RED.httpAdmin.get(
    '/lazybird/voices',
    RED.auth.needsPermission('lazybird-config.read'),
    async (req, res) => {
      const credentials = RED.nodes.getCredentials(String(req.query.config ?? ''));
      if (!credentials || !credentials.apiKey) {
        res.status(404).json({ error: 'Deploy the Lazybird config node to load the voice list.' });
        return;
      }
      try {
        const voices = await listVoices(credentials.apiKey, String(req.query.q ?? ''));
        res.json(voices.map((voice) => ({ id: voice.id, label: voiceLabel(voice) })));
      } catch (err) {
        res.status(502).json({ error: err.message });
      }
    },
  );
};

function voiceLabel(voice) {
  const details = [voice.language, voice.description].filter(Boolean).join(', ');
  const name = details ? `${voice.displayName} (${details})` : voice.displayName;
  return voice.mine ? `${name} · My voice` : name;
}
