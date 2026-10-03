import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { dealRisks, extensionDraft } from '@/lib/closing-time-risks';
import {
  FOLLOWUP_KINDS, PARTY_ROLES, addParty, approveFollowUp, dismissFollowUp, draftFollowUp, editFollowUp,
  getOrCreatePortalToken, listAssist, removeParty, removePortal, requireDeal, saveChecklist, saveExtensionDraft, markUploadReviewed, setAutoIntro, setAutoSignature, addSignatureRequest, closeSignature,
} from '@/lib/server/closing-time-assist';
import { connectedState, saveUploadToStorage, setSendFromConnected, syncCalendar } from '@/lib/server/closing-time-connected';
import { SIGN_PROVIDERS, refreshEnvelope, sendForSignature, signingState } from '@/lib/server/closing-time-signing';
import { query } from '@/lib/server/db/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dealId = z.string().min(1).max(120);
const step = z.object({ title: z.string().trim().min(1).max(280), offsetDays: z.number().int().min(-365).max(365), anchor: z.enum(['effective', 'closing']) });
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_party'), dealId, role: z.enum(PARTY_ROLES), name: z.string().max(200), email: z.string().max(320) }),
  z.object({ action: z.literal('remove_party'), partyId: z.string().uuid() }),
  z.object({ action: z.literal('draft'), dealId, kind: z.enum(FOLLOWUP_KINDS), partyId: z.string().uuid().optional(), detail: z.string().max(300).optional() }),
  z.object({ action: z.literal('draft_extension'), dealId, riskId: z.string().max(120), partyId: z.string().uuid().optional() }),
  z.object({ action: z.literal('edit_draft'), id: z.string().uuid(), toEmail: z.string().max(320).optional(), subject: z.string().max(300).optional(), body: z.string().max(5000).optional() }),
  z.object({ action: z.literal('approve'), id: z.string().uuid() }),
  z.object({ action: z.literal('dismiss'), id: z.string().uuid() }),
  z.object({ action: z.literal('portal'), dealId, reset: z.boolean().optional(), disable: z.boolean().optional() }),
  z.object({ action: z.literal('upload_reviewed'), id: z.string().uuid() }),
  z.object({ action: z.literal('auto_intro'), on: z.boolean() }),
  z.object({ action: z.literal('auto_signature'), on: z.boolean() }),
  z.object({ action: z.literal('track_signature'), dealId, partyId: z.string().uuid(), document: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('signature_signed'), id: z.string().uuid() }),
  z.object({ action: z.literal('calendar_sync'), dealId }),
  z.object({ action: z.literal('send_from_connected'), on: z.boolean() }),
  z.object({ action: z.literal('save_upload'), dealId, id: z.string().uuid(), storage: z.enum(['google_drive', 'dropbox', 'microsoft_onedrive']) }),
  z.object({ action: z.literal('send_signature'), dealId, provider: z.enum(SIGN_PROVIDERS), uploadId: z.string().uuid().optional(), fileName: z.string().max(200).optional(), fileB64: z.string().max(4_400_000).optional(), subject: z.string().max(200).optional(), signers: z.array(z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(320) })).min(1).max(6) }),
  z.object({ action: z.literal('refresh_signature'), id: z.string().uuid() }),
  z.object({ action: z.literal('save_checklist'), steps: z.array(step).min(1).max(60) }),
]);

const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

export const GET = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const id = dealId.parse(new URL(req.url).searchParams.get('dealId'));
  const deal = await requireDeal(user.realtorId, id);
  const data = await listAssist(user.realtorId, id);
  const connected = await connectedState(user.realtorId).catch(() => ({ calendar: null, mail: null, storage: [], sendFromConnected: false }));
  const signing = await signingState(user.realtorId, id).catch(() => ({ providers: [], envelopes: [] }));
  return priv({ ...data, connected, signing, risks: dealRisks(deal, chicagoToday()) });
});

export const POST = withErrorHandling(async (req: Request): Promise<Response> => {
  const user = await requireUser();
  const input = action.parse(await req.json());
  const owns = async (id: string) => { await requireDeal(user.realtorId, id); };
  switch (input.action) {
    case 'calendar_sync': {
      try { return priv({ ok: true, result: await syncCalendar(user.realtorId, input.dealId) }); }
      catch (e) { return priv({ error: e instanceof Error ? e.message : 'Calendar sync failed.' }, 400); }
    }
    case 'send_from_connected': await setSendFromConnected(user.realtorId, input.on); return priv({ ok: true });
    case 'send_signature': {
      try { return priv({ ok: true, message: await sendForSignature(user.realtorId, input) }); }
      catch (e) { return priv({ error: e instanceof Error ? e.message : 'Could not send for signature.' }, 400); }
    }
    case 'refresh_signature': {
      try { return priv({ ok: true, status: await refreshEnvelope(user.realtorId, input.id) }); }
      catch (e) { return priv({ error: e instanceof Error ? e.message : 'Could not check the status.' }, 400); }
    }
    case 'save_upload': {
      try { return priv({ ok: true, message: await saveUploadToStorage(user.realtorId, input.dealId, input.id, input.storage) }); }
      catch (e) { return priv({ error: e instanceof Error ? e.message : 'Could not save the file.' }, 400); }
    }
    case 'add_party': await owns(input.dealId); await addParty(user.realtorId, input.dealId, input); return priv({ ok: true });
    case 'remove_party': await removeParty(user.realtorId, input.partyId); return priv({ ok: true });
    case 'draft': await owns(input.dealId); return priv({ ok: true, created: await draftFollowUp(user.realtorId, input.dealId, input) });
    case 'draft_extension': {
      const deal = await requireDeal(user.realtorId, input.dealId);
      const risk = dealRisks(deal, chicagoToday()).find((r) => r.id === input.riskId);
      if (!risk) return priv({ error: 'That risk no longer applies.' }, 404);
      const me = await query<{ first_name: string | null; last_name: string | null }>(`SELECT first_name, last_name FROM realtors WHERE id=$1`, [user.realtorId]);
      const draft = extensionDraft(deal, risk, [me[0]?.first_name, me[0]?.last_name].filter(Boolean).join(' ') || 'Your agent');
      await saveExtensionDraft(user.realtorId, input.dealId, draft.subject, draft.body, input.partyId);
      return priv({ ok: true });
    }
    case 'edit_draft': await editFollowUp(user.realtorId, input.id, input); return priv({ ok: true });
    case 'approve': { const r = await approveFollowUp(user.realtorId, input.id); return priv(r, r.ok ? 200 : 400); }
    case 'dismiss': await dismissFollowUp(user.realtorId, input.id); return priv({ ok: true });
    case 'portal': {
      await owns(input.dealId);
      if (input.disable) { await removePortal(user.realtorId, input.dealId); return priv({ ok: true, token: null }); }
      return priv({ ok: true, token: await getOrCreatePortalToken(user.realtorId, input.dealId, input.reset) });
    }
    case 'upload_reviewed': await markUploadReviewed(user.realtorId, input.id); return priv({ ok: true });
    case 'auto_signature': await setAutoSignature(user.realtorId, input.on); return priv({ ok: true });
    case 'track_signature': await addSignatureRequest(user.realtorId, input.dealId, input.partyId, input.document); return priv({ ok: true });
    case 'signature_signed': await closeSignature(user.realtorId, input.id); return priv({ ok: true });
    case 'auto_intro': await setAutoIntro(user.realtorId, input.on); return priv({ ok: true });
    case 'save_checklist': await saveChecklist(user.realtorId, input.steps); return priv({ ok: true });
  }
});
