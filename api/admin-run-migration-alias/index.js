/* eslint-env node */
import handler from '../admin-run-migration/index.js';

export default async function aliasHandler(context, req) {
  return handler(context, req);
}
