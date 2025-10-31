/* eslint-env node */
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { json, resolveBearerAuthorization } from '../_shared/http.js';

const ADMIN_CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Accept: 'application/json' } },
};


function readEnv(context) {
  return (context?.env && typeof context.env === 'object') ? context.env : (process.env ?? {});
}
function take(env, key) {
  const v = env?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}
function resolveAdminConfig(context) {
  const env = readEnv(context);
  const fallback = process.env ?? {};
  const url = take(env, 'APP_CONTROL_DB_URL') || take(fallback, 'APP_CONTROL_DB_URL');
  const key = take(env, 'APP_CONTROL_DB_SERVICE_ROLE_KEY') || take(fallback, 'APP_CONTROL_DB_SERVICE_ROLE_KEY');
  return { url, key };
}
function getAdminClient(context) {
  const cfg = resolveAdminConfig(context);
  if (!cfg.url || !cfg.key) return { client: null, error: new Error('missing_admin_credentials') };
  // Create a fresh admin client per request
  const client = createClient(cfg.url, cfg.key, ADMIN_CLIENT_OPTIONS);
  return { client, error: null };
}
function respond(context, status, body, extraHeaders = {}) {
  const response = json(status, body, { 'Cache-Control': 'no-store', ...extraHeaders });
  context.res = response; return response;
}
function parseSegments(context) {
  const raw = context?.bindingData?.restOfPath; if (!raw || typeof raw !== 'string') return [];
  return raw.split('/').map((s)=>s.trim()).filter(Boolean);
}
function normalizeUuid(v){
  if (typeof v !== 'string') return null; const t = v.trim(); if (!t) return null;
  const re=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; return re.test(t)?t.toLowerCase():null;
}
function normalizeRole(r){
  if (typeof r !== 'string') return null; const t=r.trim().toLowerCase();
  if (t === 'member' || t === 'admin') return t; // owner changes are not supported here
  return null;
}
async function getAuthUser(context, req, supabase){
  const auth = resolveBearerAuthorization(req);
  if (!auth?.token) { respond(context,401,{message:'missing bearer'}); return null; }
  let res; try { res = await supabase.auth.getUser(auth.token); } catch (e) {
    context.log?.warn?.('org-memberships bearer invalid', { message: e?.message });
    respond(context,401,{message:'invalid or expired token'}); return null;
  }
  if (res.error || !res.data?.user?.id) { respond(context,401,{message:'invalid or expired token'}); return null; }
  const u=res.data.user; return { id: u.id, email: typeof u.email==='string'?u.email.toLowerCase():null };
}
function isAdminRole(role){ if (typeof role !== 'string') return false; const t=role.trim().toLowerCase(); return t==='admin'||t==='owner'; }

async function requireActorRole(context, supabase, orgId, userId){
  const result = await supabase.from('org_memberships').select('id, role').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  if (result.error){ respond(context,500,{message:'failed to verify membership'}); return null; }
  if (!result.data || !isAdminRole(result.data.role)){ respond(context,403,{message:'forbidden'}); return null; }
  return result.data;
}
async function loadTargetMembership(context, supabase, membershipId){
  const result = await supabase.from('org_memberships').select('id, org_id, user_id, role').eq('id', membershipId).maybeSingle();
  if (result.error){ respond(context,500,{message:'failed to load membership'}); return null; }
  if (!result.data){ respond(context,404,{message:'membership not found'}); return null; }
  return result.data;
}

async function handleDelete(context, req, supabase, membershipId){
  const authUser = await getAuthUser(context, req, supabase); if (!authUser) return;
  const target = await loadTargetMembership(context, supabase, membershipId); if (!target) return;
  const actor = await requireActorRole(context, supabase, target.org_id, authUser.id); if (!actor) return;
  const targetRole = (target.role||'member').toLowerCase();
  const actorIsOwner = (actor.role||'member').toLowerCase()==='owner';
  if (targetRole === 'owner'){ respond(context,403,{message:'cannot remove owner'}); return; }
  if (!actorIsOwner && targetRole === 'admin'){ respond(context,403,{message:'admin cannot remove admin'}); return; }
  if (target.user_id === authUser.id){ respond(context,403,{message:'cannot remove yourself'}); return; }
  const del = await supabase.from('org_memberships').delete().eq('id', membershipId);
  if (del.error){ respond(context,500,{message:'failed to remove member'}); return; }
  respond(context,200,{ message: 'removed' });
}

async function handlePatch(context, req, supabase, membershipId){
  const authUser = await getAuthUser(context, req, supabase); if (!authUser) return;
  const body = req.body && typeof req.body==='object' ? req.body : {};
  const role = normalizeRole(body.role ?? body.newRole);
  if (!role){ respond(context,400,{message:'invalid role'}); return; }
  const target = await loadTargetMembership(context, supabase, membershipId); if (!target) return;
  const actor = await requireActorRole(context, supabase, target.org_id, authUser.id); if (!actor) return;
  const targetRole = (target.role||'member').toLowerCase();
  const actorIsOwner = (actor.role||'member').toLowerCase()==='owner';
  if (targetRole === 'owner'){ respond(context,403,{message:'cannot change owner role'}); return; }
  if (target.user_id === authUser.id){ respond(context,403,{message:'cannot change your own role'}); return; }
  if (!actorIsOwner && role === 'admin' && targetRole === 'admin'){ respond(context,200,{message:'no-op'}); return; }
  if (!actorIsOwner && targetRole === 'admin' && role === 'member'){ respond(context,403,{message:'admin cannot demote admin'}); return; }
  const upd = await supabase.from('org_memberships').update({ role }).eq('id', membershipId);
  if (upd.error){ respond(context,500,{message:'failed to update role'}); return; }
  respond(context,200,{ message:'updated', role });
}

export default async function orgMemberships(context, req){
  const { client: supabase, error } = getAdminClient(context);
  if (!supabase || error){ respond(context,500,{message:'server_misconfigured'}); return; }
  const method = String(req.method||'GET').toUpperCase();
  const segments = parseSegments(context);
  if (segments.length !== 1){ respond(context,404,{message:'not found'}); return; }
  const membershipId = normalizeUuid(segments[0]);
  if (!membershipId){ respond(context,400,{message:'invalid membership id'}); return; }
  if (method === 'DELETE'){ await handleDelete(context, req, supabase, membershipId); return; }
  if (method === 'PATCH' || method === 'PUT'){ await handlePatch(context, req, supabase, membershipId); return; }
  respond(context,405,{message:'method not allowed'});
}
