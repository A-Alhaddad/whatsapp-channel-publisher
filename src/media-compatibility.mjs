// Backport the upstream fix until whatsapp-web.js ships it in a tagged release:
// https://github.com/wwebjs/whatsapp-web.js/pull/201923
// MediaData.__x_id must not overwrite the outgoing message's internal MsgKey.
// Runs in the page before sending, including after WhatsApp reinjects its helpers.
export function installMediaCompatibility() {
  let source = window.WWebJS.sendMessage.toString();
  const anchor = "        // Bot's won't reply if canonicalUrl is set (linking)";
  if (!source.includes('delete message.__x_id;')) {
    if (source.split(anchor).length !== 2 || !source.includes('const message = {')) {
      throw new Error('Unsupported WhatsApp media helper; update compatibility fix');
    }
    source = source.replace(anchor, `        delete message.__x_id;\n\n${anchor}`);
  }
  // Recent WhatsApp Web versions moved Msg.avParams to this module.
  const legacyMetadata = 'mediaMetadata: msg.avParams(),';
  const currentMetadata = "mediaMetadata: typeof msg.avParams === 'function' ? msg.avParams() : window.require('WAWebMediaMetadata').mediaMetadata(msg),";
  if (source.includes(legacyMetadata)) {
    source = source.replace(legacyMetadata, currentMetadata);
  } else if (!source.includes(currentMetadata)) {
    throw new Error('Unsupported WhatsApp media metadata helper; update compatibility fix');
  }
  if (source !== window.WWebJS.sendMessage.toString()) {
    window.WWebJS.sendMessage = new Function('window', `return (${source});`)(window);
  }
}
