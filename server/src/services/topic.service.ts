// Which topics a user may see and use: the presets plus their own custom topics. Custom topics whose owner is
// gone (ownerId NULL) stay attached to old sessions but are never shown to anyone.
export function visibleTopics(userId: string) {
  return { OR: [{ isCustom: false }, { ownerId: userId }] };
}
