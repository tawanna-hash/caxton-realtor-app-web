"use client";
import { useState } from "react";

type Ag = {
  id: string;
  payment_setup_sent_to?: string | null;
  payment_setup_requested_at?: string | null;
  payment_setup_reminders?: number | null;
  payment_setup_verification_pending?: boolean | null;
};

/** Alert for an agreement waiting on a payment method (setup link sent) or on bank verification. */
export default function PaymentSetupAlert({ ag, variant }: { ag: Ag; variant: "chip" | "banner" }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const waiting = !!ag.payment_setup_requested_at;
  const verifying = !waiting && !!ag.payment_setup_verification_pending;
  if (!waiting && !verifying) return null;

  async function resend() {
    const to = ag.payment_setup_sent_to ?? "";
    if (!window.confirm(`Resend the payment setup link to ${to || "the email on file"}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/agreements/${ag.id}/resend-setup-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Link sent to ${j.sentTo}` : (j.error ?? "Could not resend"));
    } catch { setMsg("Could not resend"); }
    setBusy(false);
  }

  const btn = (
    <button type="button" onClick={resend} disabled={busy} className="ml-2 underline font-semibold disabled:opacity-50">
      {busy ? "Sending…" : "Resend link"}
    </button>
  );
  const status = msg ? <span className="ml-2" role="status">{msg}</span> : null;

  if (verifying) {
    return variant === "chip" ? (
      <div role="alert" className="mt-1 inline-block rounded-full border border-sky-400 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900">Bank verification pending</div>
    ) : (
      <div role="alert" className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
        <strong>Bank verification pending.</strong> The client connected a bank account and Stripe is still verifying it (usually 1 to 2 business days). This clears when verification finishes.
      </div>
    );
  }
  if (variant === "chip") {
    return (
      <div role="alert" className="mt-1 inline-block rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
        Payment method needed · link sent to {ag.payment_setup_sent_to ?? "AP"}{btn}{status}
      </div>
    );
  }
  const n = ag.payment_setup_reminders ?? 0;
  return (
    <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>Payment method not on file yet.</strong> The client chose ACH and the setup link went to {ag.payment_setup_sent_to ?? "accounts payable"} on {new Date(ag.payment_setup_requested_at as string).toLocaleDateString("en-US")}.{" "}
      {n > 0 ? `${n} reminder${n === 1 ? "" : "s"} sent. ` : "Reminders go out automatically on day 3 and 7. "}
      This clears when a payment method is saved.{btn}{status}
    </div>
  );
}
