/** The sync engine series, in reading order. A part links once a post with its slug exists. */
export const SYNC_SERIES = {
  name: 'Sync engines in practice',
  parts: [
    { slug: 'before-you-build-a-sync-engine', title: 'Before you build a sync engine' },
    { slug: 'conflict-free-is-not-correct', title: "Conflict-free doesn't mean correct" },
    { slug: 'migrating-with-stale-clients', title: "Your schema will change, your clients won't" },
    { slug: 'ordering-and-moving-in-a-crdt', title: 'Ordering and moving things in a CRDT' },
    { slug: 'multiplayer-undo-redo', title: 'Undo and redo with other people in the room' },
    { slug: 'restoring-versions-while-collaborating', title: 'Restoring versions while others keep editing' },
  ],
};
