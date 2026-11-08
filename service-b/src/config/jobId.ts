// One BullMQ job id per message, so the same message is never queued twice.
// BullMQ rejects integer ids and ids with ':', so the id is prefixed and ':' (and '%') escaped.
export const jobIdFor = (id: string) =>
  `message-${id.replaceAll('%', '%25').replaceAll(':', '%3A')}`;
