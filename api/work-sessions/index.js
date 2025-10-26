/* eslint-env node */
import { json } from '../_shared/http.js';

export default async function (context, _req) {
  // Legacy endpoint removed. This app no longer uses WorkSessions, Rates, Leaves, or Services tables.
  // Intentionally return 410 Gone without touching any database connection.
  const response = json(410, { message: 'legacy_unavailable', details: 'WorkSessions API has been retired.' });
  context.res = response;
  return response;
}
