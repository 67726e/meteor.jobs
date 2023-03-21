
// TODO: Pass in from Jobs...
export const DOMINATOR_ID = 'dominatorId';

export const LOGGER_NOOP = () => {};

export const QUEUE_PAUSED = 'paused';
// cap timeout limit to 24 hours to avoid Node.js limit https://github.com/wildhart/meteor.jobs/issues/5
export const QUEUE_MILLISECOND_MAX_TIMEOUT = 24 *3600 * 1000;
