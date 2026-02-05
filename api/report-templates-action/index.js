/* eslint-env node */
import handler from '../report-templates/index.js';

export default async function reportTemplatesAction(context, req) {
  return handler(context, req);
}
