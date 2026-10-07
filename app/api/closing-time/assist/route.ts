import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { dealRisks, extensionDraft } from '@/lib/closing-time-risks';
import {
  FOLLOWUP_KINDS, PARTY_ROLES, addParty, approveFollowUp, dismissFollowUp, draftFollowUp, editFollowUp,
  getOrCreatePortalToken, setPortalLink, createDocRequest, markDocRequestEmailed, setDocRequestStatus, markDocRequestLogged, listDocRequests, listPortalLinks, listAssist, removeParty, removePortal, requireDeal, saveChecklist, saveExtensionDraft, markUploadReviewed, setAutoIntro, setAutoSignature, addSignatureRequest, closeSignature,
} from '@/lib/server/closing-time-assist';
import { connectedState, saveUploadToStorage, setSendFromConnected, syncCalendar } from '@/lib/server/closing-time-connected';
import { cancelSignRequest, deleteSignLayout, saveSignLayout, saveSignSettings } from '@/lib/server/closing-time-esign';
import { BUILTIN, SIGN_PROVIDERS, refreshEnvelope, sendForSignature, signingState } from '@/lib/server/closing-time-signing';
import { query } from '@/lib/server/db/neon';
import { sendEmail } from '@/lib/email';
import { logDealEvent, markEventsAudited } from '@/lib/server/closing-time-events';

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
  z.object({ action: z.literal('portal_link'), dealId, name: z.string().trim().min(1).max(200), reset: z.boolean().optional(), disable: z.boolean().optional() }),
  z.object({ action: z.literal('request_document'), dealId, label: z.string().trim().min(1).max(200), note: z.string().trim().max(500).optional(), email: z.boolean(),
    people: z.array(z.object({ name: z.string().trim().min(1).max(200), email: z.string().trim().max(320) })).min(1).max(10) }),
  z.object({ action: z.literal('request_logged'), id: z.string().uuid(), event: z.enum(['requested', 'uploaded', 'received']) }),
  z.object({ action: z.literal('events_audited'), ids: z.array(z.string().uuid()).max(100) }),
  z.object({ action: z.literal('request_received'), id: z.string().uuid() }),
  z.object({ action: z.literal('request_cancel'), id: z.string().uuid() }),
  z.object({ action: z.literal('upload_reviewed'), id: z.string().uuid() }),
  z.object({ action: z.literal('auto_intro'), on: z.boolean() }),
  z.object({ action: z.literal('auto_signature'), on: z.boolean() }),
  z.object({ action: z.literal('track_signature'), dealId, partyId: z.string().uuid(), document: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal('signature_signed'), id: z.string().uuid() }),
  z.object({ action: z.literal('calendar_sync'), dealId }),
  z.object({ action: z.literal('send_from_connected'), on: z.boolean() }),
  z.object({ action: z.literal('save_upload'), dealId, id: z.string().uuid(), storage: z.enum(['google_drive', 'dropbox', 'microsoft_onedrive']) }),
  z.object({ action: z.literal('send_signature'), dealId, provider: z.enum([...SIGN_PROVIDERS, BUILTIN]), placement: z.enum(['page', 'inline']).optional(), expireDays: z.number().int().min(1).max(365).optional(), remindEvery: z.number().int().min(0).max(60).optional(), maxReminders: z.number().int().min(0).max(10).optional(), fields: z.array(z.object({ signer: z.number().int().min(0).max(5), type: z.enum(['signature', 'date']), page: z.number().int().min(0).max(400), x: z.number(), y: z.number(), w: z.number(), h: z.number(), id: z.string().max(60).optional() })).max(80).optional(), uploadId: z.string().uuid().optional(), fileName: z.string().max(200).optional(), fileB64: z.string().max(4_400_000).optional(), subject: z.string().max(200).optional(), signers: z.array(z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(320) })).min(1).max(6) }),
  z.object({ action: z.literal('refresh_signature'), id: z.string().uuid() }),
  z.object({ action: z.literal('cancel_signature'), id: z.string().uuid() }),
  z.object({ action: z.literal('save_sign_settings'), settings: z.object({ expireDays: z.number(), remindEvery: z.number(), maxReminders: z.number(), draw: z.boolean(), type: z.boolean(), upload: z.boolean(), notice: z.string().max(400), redirectUrl: z.string().max(500), attach: z.boolean(), emailRequester: z.boolean(), accent: z.string().max(9), brandName: z.string().max(80) }) }),
  z.object({ action: z.literal('save_sign_layout'), name: z.string().max(80), fields: z.array(z.object({ signer: z.number().int().min(0).max(5), type: z.enum(['signature', 'date']), page: z.number().int().min(0).max(400), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).max(80) }),
  z.object({ action: z.literal('delete_sign_layout'), id: z.string().uuid() }),
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
  const signing = await signingState(user.realtorId, id).catch(() => ({ providers: [], envelopes: [], requests: [], layouts: [], settings: null }));
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
      try { return priv({ ok: true, message: await sendForSignature(user.realtorId, { ...input, builtin: input.provider === BUILTIN ? { placement: input.placement ?? 'page', fields: input.fields?.map((f) => ({ ...f, id: f.id ?? '' })), origin: new URL(req.url).origin, expireDays: input.expireDays, remindEvery: input.remindEvery, maxReminders: input.maxReminders } : undefined }) }); }
      catch (e) { return priv({ error: e instanceof Error ? e.message : 'Could not send for signature.' }, 400); }
    }
    case 'cancel_signature': { await cancelSignRequest(user.realtorId, input.id); return priv({ ok: true, message: 'Signature request cancelled.' }); }
    case 'save_sign_settings': { await saveSignSettings(user.realtorId, input.settings); return priv({ ok: true, message: 'Secure Sign settings saved.' }); }
    case 'save_sign_layout': {
      try { await saveSignLayout(user.realtorId, input.name, input.fields); return priv({ ok: true, message: 'Layout saved.' }); }
      catch (e) { return priv({ error: e instanceof Error ? e.message : 'Could not save the layout.' }, 400); }
    }
    case 'delete_sign_layout': { await deleteSignLayout(user.realtorId, input.id); return priv({ ok: true }); }
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
    case 'portal_link': {
      await owns(input.dealId);
      const token = await setPortalLink(user.realtorId, input.dealId, input.name, { reset: input.reset, disable: input.disable });
      return priv({ ok: true, token, links: await listPortalLinks(user.realtorId, input.dealId) });
    }
    case 'request_document': {
      const deal = await requireDeal(user.realtorId, input.dealId);
      const origin = new URL(req.url).origin;
      const property = (deal.propertyAddress || deal.title || 'your deal').trim();
      let emailed = 0;
      for (const person of input.people) {
        const id = await createDocRequest(user.realtorId, input.dealId, { label: input.label, note: input.note ?? '', personName: person.name });
        if (input.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) {
          const token = await setPortalLink(user.realtorId, input.dealId, person.name, {});
          const href = `${origin}/deal-portal/${token}`;
          const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
          const sent = await sendEmail({ to: person.email, replyTo: user.email, subject: `Document needed: ${input.label} - ${property}`,
            html: `<div style="font-family:Inter,Arial,sans-serif;color:#1B1726;line-height:1.55;max-width:560px"><p>Hello ${esc(person.name.split(/\s+/)[0])},</p><p>Your agent needs <strong>${esc(input.label)}</strong> for ${esc(property)}.</p>${input.note ? `<p>${esc(input.note)}</p>` : ''}<p><a href="${href}" style="display:inline-block;padding:10px 16px;background:#301D5D;color:#ffffff;text-decoration:none;border-radius:8px">Open Your Client Portal</a></p><p style="color:#4A4757;font-size:13px">This link is private to you. Upload the document in the Requested From You section. Reply to this email with any questions.</p></div>` }).catch(() => ({ ok: false }));
          if ((sent as { ok?: boolean })?.ok !== false) { await markDocRequestEmailed(user.realtorId, id); emailed += 1; await logDealEvent(user.realtorId, input.dealId, 'email', `Document request emailed to ${person.name} <${person.email}>: ${input.label}`); }
        }
      }
      return priv({ ok: true, emailed, requests: await listDocRequests(user.realtorId, input.dealId) });
    }
    case 'request_logged': await markDocRequestLogged(user.realtorId, input.id, input.event); return priv({ ok: true });
    case 'events_audited': await markEventsAudited(user.realtorId, input.ids); return priv({ ok: true });
    case 'request_received': await setDocRequestStatus(user.realtorId, input.id, 'received'); return priv({ ok: true });
    case 'request_cancel': await setDocRequestStatus(user.realtorId, input.id, 'cancelled'); return priv({ ok: true });
    case 'upload_reviewed': await markUploadReviewed(user.realtorId, input.id); return priv({ ok: true });
    case 'auto_signature': await setAutoSignature(user.realtorId, input.on); return priv({ ok: true });
    case 'track_signature': await addSignatureRequest(user.realtorId, input.dealId, input.partyId, input.document); return priv({ ok: true });
    case 'signature_signed': await closeSignature(user.realtorId, input.id); return priv({ ok: true });
    case 'auto_intro': await setAutoIntro(user.realtorId, input.on); return priv({ ok: true });
    case 'save_checklist': await saveChecklist(user.realtorId, input.steps); return priv({ ok: true });
  }
});
