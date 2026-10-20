// Runs inside WhatsApp Web via Puppeteer. Read only channel identity and permissions:
// WWebJS.getChatModel also loads the last message and currently fails with an
// IndexedDB DataError when its message key is missing (including new channels).
export async function writableChannels(target = null) {
  const collections = window.require('WAWebCollections');
  const { getIsNewsletter } = window.require('WAWebChatGetters');
  const metadata = collections.NewsletterMetadataCollection || collections.WAWebNewsletterMetadataCollection;
  const channels = collections.WAWebNewsletterCollection.getModelsArray();
  const result = [];
  for (const channel of channels) {
    const id = channel.id?._serialized;
    if (!/^\d{5,30}@newsletter$/.test(id || '') || (target !== null && id !== target) ||
        getIsNewsletter(channel) !== true || channel.isReadOnly !== false) continue;
    // Refresh membership before trusting writable access; errors fail closed.
    await metadata.update(channel.id);
    if (getIsNewsletter(channel) !== true || channel.isReadOnly !== false) continue;
    result.push({ id, name: String(channel.name || channel.newsletterMetadata?.name || id) });
  }
  return result;
}
