'use client';

/**
 * NewQuoteModal — standalone quote builder (Print + E-Blast + App).
 *
 * Mounts from two entry points:
 *   - /admin/ads/inquiries (top-right "+ New quote")
 *   - /admin/agreements    (next to "+ New agreement")
 *
 * Flow:
 *   1. Search existing advertisers (client-side filter over
 *      GET /api/admin/advertisers) or toggle "Create new".
 *   2. Pick channel:
 *        • Print — package + size + months
 *        • E-Blast — package + sends + publication scope
 *        • App — slot + weekly/monthly cadence + markets 1-4 + qty
 *   3. Submit → POST /api/admin/quotes → success card with agreement
 *      number, Send Quote button (calls existing agreements/[id]/send),
 *      and links back to /admin/agreements and /admin/invoices.
 *
 * App slots also fetch /api/admin/ads/availability to surface a
 * "warn but allow" banner if the same slot has an overlapping booking.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PACKAGES,
  EBLASTS,
  APP_AD_SLOTS,
  eblastPriceForPub,
  weeklyRateForMarkets,
  monthlyRateForMarkets,
  type AppAdSlot,
  type MarketCount,
} from '@/lib/media-kit';

function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

type Publication = 'austin' | 'san_antonio' | 'both';
import {
  AD_SIZES, FREQUENCIES, FREQ_PKG_AG, MONTHS_LIST,
} from '@/lib/pressbook-constants';
import {
  lookupRate, pagePositionPremium, computeExp,
} from '@/lib/agreement-pricing';

type Channel = 'print' | 'email' | 'app';
type AppCadence = 'weekly' | 'monthly';

interface AdvertiserRow {
  id: number;
  name: string;
  contact_email: string | null;
  publication: string;
}

interface CreatedAgreement {
  id: string;
  status: string;
  type: string | null;
  amount_cents: number;
}
interface CreatedInvoice {
  id: string;
  number: string | null;
  amount_cents: number;
  status: string;
}

interface BookedWindow {
  slot_or_size: string | null;
  start_date: string;
  end_date: string;
  advertiser_name: string | null;
  channel: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional callback after a successful draft (e.g. to refresh a list). */
  onDrafted?: () => void;
}

// Add ISO days without timezone drift — used for the App weekly-cadence
// end-date preview + collision check.
function addDaysIso(startIso: string, days: number): string {
  const [y, m, d] = startIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Add N months, land on the last day of the target month (matches
// drafter's computeTerm for print/app-monthly).
function addMonthsEomIso(startIso: string, months: number): string {
  const [y, m] = startIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 0));
  return dt.toISOString().slice(0, 10);
}

// Do two [startA,endA] and [startB,endB] windows overlap? All inclusive.
function windowsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export default function NewQuoteModal({ open, onClose, onDrafted }: Props) {
  // ── Advertiser picker state ───────────────────────────────────────
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [advertiserSearch, setAdvertiserSearch] = useState('');
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<number | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPublication, setNewPublication] = useState<Publication>('austin');

  // ── Quote form state ──────────────────────────────────────────────
  const [channel, setChannel] = useState<Channel>('print');
  const [packageId, setPackageId] = useState<string>(PACKAGES[0]?.id ?? '');
  const [size, setSize] = useState<string>('');
  const [months, setMonths] = useState<number>(1);
  // Insertion Order state (print channel only — mirrors AgreementDrawer)
  const [ioAdSize, setIoAdSize] = useState<string>('');
  const [ioFrequency, setIoFrequency] = useState<string>('');
  const [ioAdRate, setIoAdRate] = useState<string>('');
  const [ioAdRateBase, setIoAdRateBase] = useState<string>('');
  const [ioRateUserEdited, setIoRateUserEdited] = useState<boolean>(false);
  const [ioDiscount, setIoDiscount] = useState<string>('');
  const [ioAdPremium, setIoAdPremium] = useState<string>('');
  const [ioPosPremActive, setIoPosPremActive] = useState<boolean>(false);
  const [ioPagePosition, setIoPagePosition] = useState<string>('');
  const [ioTimingMonths, setIoTimingMonths] = useState<Record<string, boolean>>({});
  const [ioTimingYears, setIoTimingYears] = useState<Record<string, string>>({});
  const [sends, setSends] = useState<number>(1);
  // Run-window mode toggle — 'quantity' keeps legacy qty+cadence input,
  // 'dates' exposes explicit start/end pickers. When 'dates', qty is
  // derived from the span so pricing math still works.
  type RunMode = 'quantity' | 'dates';
  const [runMode, setRunMode] = useState<RunMode>('quantity');
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [runStart, setRunStart] = useState<string>(todayIso);
  const [runEnd, setRunEnd] = useState<string>(todayIso);
  // App channel
  const [appCadence, setAppCadence] = useState<AppCadence>('weekly');
  const [appWeeks, setAppWeeks] = useState<number>(1);
  const [appMarkets, setAppMarkets] = useState<MarketCount>(1);

  const [publication, setPublication] = useState<Publication>('austin');
  // Email preferred send dates (up to 3, all optional; blank ⇒ advertiser picks)
  const [ebDate1, setEbDate1] = useState<string>('');
  const [ebDate2, setEbDate2] = useState<string>('');
  const [ebDate3, setEbDate3] = useState<string>('');
  // Review overlay
  const [showReview, setShowReview] = useState<boolean>(false);
  const [dueDate, setDueDate] = useState<string>('');
  const [memo, setMemo] = useState<string>('');

  // ── Custom pricing override ─────────────────────────────────────────
  // Rep can toggle between overriding the full total or the per-unit
  // (per-month, per-send, per-week) price. Empty string = no override.
  const [overrideMode, setOverrideMode] = useState<'off' | 'total' | 'unit'>('off');
  const [overrideTotalDollars, setOverrideTotalDollars] = useState<string>('');
  const [overrideUnitDollars, setOverrideUnitDollars] = useState<string>('');

  // ── Submit state ──────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Bundle state ──────────────────────────────────────────────────
  // Multi-line quote support. Each line snapshots the current form
  // values (channel + qty + pricing) so the rep can add another. On
  // Save, we POST once per bundle line, then once for the current
  // (final) form values — yielding N independent agreements.
  type BundleLine = {
    id: string;
    channel: Channel;
    packageId: string;
    packageLabel: string;
    size?: string;
    months?: number;
    sends?: number;
    appCadence?: AppCadence;
    appWeeks?: number;
    appMarkets?: MarketCount;
    publication?: Publication;
    runStart?: string;
    runEnd?: string;
    runMode: RunMode;
    overrideMode: 'off' | 'total' | 'unit';
    overrideTotalCents: number | null;
    overrideUnitCents: number | null;
    subtotalCents: number;
    ioAdSize?: string;
    ioFrequency?: string;
    ioAdRateCents?: number;
    ioAdRateBaseCents?: number;
    ioDiscountCents?: number;
    ioAdPremiumCents?: number;
    ioPagePosition?: string;
    ioPosPremActive?: boolean;
    ioTimingMonths?: Record<string, boolean>;
    ioTimingYears?: Record<string, string>;
    preferredSendDates?: string[];
  };
  const [bundleLines, setBundleLines] = useState<BundleLine[]>([]);
  const [bundleProgress, setBundleProgress] = useState<{
    total: number;
    done: number;
    label: string;
  } | null>(null);
  const [createdAgreement, setCreatedAgreement] = useState<CreatedAgreement | null>(null);
  const [createdBundle, setCreatedBundle] = useState<
    Array<{ agreement: CreatedAgreement; invoice: CreatedInvoice }>
  >([]);
  const [createdInvoice, setCreatedInvoice] = useState<CreatedInvoice | null>(null);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [sent, setSent] = useState(false);

  // ── Availability (App channel) ────────────────────────────────────
  const [bookedWindows, setBookedWindows] = useState<BookedWindow[]>([]);

  // Fetch advertisers list on first open. Client-side filter after that.
  useEffect(() => {
    if (!open || advertisers.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/advertisers', { credentials: 'include' });
        if (!res.ok) return;
        const json = (await res.json()) as { advertisers: AdvertiserRow[] };
        if (!cancelled) setAdvertisers(json.advertisers ?? []);
      } catch {
        // silent — list stays empty, user can still Create new
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, advertisers.length]);

  // Fetch App-channel booked windows so we can warn about collisions.
  // We only need windows for the app channel and only when the modal is
  // open AND the user actually selected the App channel — otherwise skip.
  useEffect(() => {
    if (!open || channel !== 'app') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ads/availability?channel=app', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = (await res.json()) as { rows?: BookedWindow[] };
        if (!cancelled) setBookedWindows(json.rows ?? []);
      } catch {
        // silent — banner just won't fire if we can't fetch
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, channel]);

  // Imperative reset — called by Close/Cancel handlers so we don't need
  // a state-mutating effect for what is really user-driven cleanup.
  const resetAll = useCallback(() => {
    setAdvertiserSearch('');
    setSelectedAdvertiserId(null);
    setCreateNew(false);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewPublication('austin');
    setChannel('print');
    setPackageId(PACKAGES[0]?.id ?? '');
    setSize(PACKAGES[0]?.sizes[0]?.size ?? '');
    setMonths(1);
    setSends(1);
    setRunMode('quantity');
    setRunStart(todayIso);
    setRunEnd(todayIso);
    setAppCadence('weekly');
    setAppWeeks(1);
    setAppMarkets(1);
    setPublication('austin');
    setEbDate1('');
    setEbDate2('');
    setEbDate3('');
    setShowReview(false);
    setDueDate('');
    setMemo('');
    setError(null);
    setCreatedAgreement(null);
    setCreatedBundle([]);
    setCreatedInvoice(null);
    setSent(false);
    setBookedWindows([]);
    setBundleLines([]);
    setBundleProgress(null);
  }, [todayIso]);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  const filteredAdvertisers = useMemo(() => {
    const q = advertiserSearch.trim().toLowerCase();
    if (!q) return advertisers.slice(0, 20);
    return advertisers
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.contact_email ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [advertisers, advertiserSearch]);

  const selectedAdvertiser = useMemo(
    () => advertisers.find((a) => a.id === selectedAdvertiserId) ?? null,
    [advertisers, selectedAdvertiserId],
  );

  const selectedPrintPackage = useMemo(
    () => (channel === 'print' ? PACKAGES.find((p) => p.id === packageId) ?? null : null),
    [channel, packageId],
  );
  const selectedEmailPackage = useMemo(
    () =>
      channel === 'email' ? EBLASTS.find((e) => eblastId(e.name) === packageId) ?? null : null,
    [channel, packageId],
  );
  const selectedAppSlot: AppAdSlot | null = useMemo(
    () => (channel === 'app' ? APP_AD_SLOTS.find((s) => s.slug === packageId) ?? null : null),
    [channel, packageId],
  );

  // Channel + package changes reset dependent fields imperatively via the
  // onChange handlers below — no effects, no cascading renders.
  const handleChannelChange = useCallback((next: Channel) => {
    setChannel(next);
    if (next === 'print') {
      const firstPkg = PACKAGES[0];
      setPackageId(firstPkg?.id ?? '');
      setSize(firstPkg?.sizes[0]?.size ?? '');
    } else if (next === 'email') {
      const firstEb = EBLASTS[0];
      setPackageId(firstEb ? eblastId(firstEb.name) : '');
      setSize('');
    } else {
      const firstSlot = APP_AD_SLOTS[0];
      setPackageId(firstSlot?.slug ?? '');
      setSize('');
      // Snap cadence to whatever the first slot supports.
      if (firstSlot && monthlyRateForMarkets(firstSlot, 1) == null) {
        setAppCadence('weekly');
      }
    }
  }, []);

  const handlePackageChange = useCallback(
    (nextId: string) => {
      setPackageId(nextId);
      if (channel === 'print') {
        const pkg = PACKAGES.find((p) => p.id === nextId);
        setSize(pkg?.sizes[0]?.size ?? '');
      } else if (channel === 'app') {
        const slot = APP_AD_SLOTS.find((s) => s.slug === nextId);
        // If the newly picked slot has no monthly rate, snap to weekly.
        if (slot && monthlyRateForMarkets(slot, appMarkets) == null) {
          setAppCadence('weekly');
        }
      }
    },
    [channel, appMarkets],
  );

  // Price preview.
  const previewCents = useMemo(() => {
    if (channel === 'print') {
      // Insertion Order path: (rate − discount + premium) × freq_months
      if (ioAdSize && ioFrequency && ioAdRate) {
        const FREQ_MONTHS: Record<string, number> = { '1x': 1, '3x': 3, '6x': 6, '12x': 12 };
        const issues = FREQ_MONTHS[ioFrequency] ?? 1;
        const rate = Math.round((parseFloat(ioAdRate) || 0) * 100);
        const disc = Math.round((parseFloat(ioDiscount) || 0) * 100);
        const prem = Math.round((parseFloat(ioAdPremium) || 0) * 100);
        const monthly = Math.max(0, rate - disc + prem);
        return monthly * issues;
      }
      if (selectedPrintPackage) {
        const s = selectedPrintPackage.sizes.find((sz) => sz.size === size);
        if (!s) return 0;
        return s.price * 100 * months;
      }
      return 0;
    }
    if (channel === 'email' && selectedEmailPackage) {
      const mkPub =
        publication === 'austin' ? 'realtyline' :
        publication === 'san_antonio' ? 'newsline' :
        'both';
      return Math.round(eblastPriceForPub(selectedEmailPackage, mkPub) * 100) * sends;
    }
    if (channel === 'app' && selectedAppSlot) {
      if (appCadence === 'weekly') {
        const rate = weeklyRateForMarkets(selectedAppSlot, appMarkets);
        return Math.round(rate * 100) * Math.max(1, appWeeks);
      }
      const monthly = monthlyRateForMarkets(selectedAppSlot, appMarkets);
      if (monthly == null) return 0;
      return Math.round(monthly * 100) * Math.max(1, months);
    }
    return 0;
  }, [
    channel,
    selectedPrintPackage,
    selectedEmailPackage,
    selectedAppSlot,
    size,
    months,
    sends,
    publication,
    appCadence,
    appWeeks,
    appMarkets,
    ioAdSize,
    ioFrequency,
    ioAdRate,
    ioDiscount,
    ioAdPremium,
  ]);

  // ── Rack unit + qty (drives "Unit" override math + label) ───────────
  const rackQty = useMemo(() => {
    if (channel === 'print') {
      if (ioFrequency) {
        const FM: Record<string, number> = { '1x': 1, '3x': 3, '6x': 6, '12x': 12 };
        return Math.max(1, FM[ioFrequency] ?? 1);
      }
      return Math.max(1, months);
    }
    if (channel === 'email') return Math.max(1, sends);
    if (channel === 'app') {
      return appCadence === 'weekly' ? Math.max(1, appWeeks) : Math.max(1, months);
    }
    return 1;
  }, [channel, months, sends, appCadence, appWeeks, ioFrequency]);

  const rackUnitCents = useMemo(
    () => (rackQty > 0 ? Math.round(previewCents / rackQty) : 0),
    [previewCents, rackQty],
  );

  const unitLabel = useMemo(() => {
    if (channel === 'print') return 'month';
    if (channel === 'email') return 'send';
    if (channel === 'app') return appCadence === 'weekly' ? 'week' : 'month';
    return 'unit';
  }, [channel, appCadence]);

  // ── Effective total after override (client preview only) ────────────
  const overrideTotalCents = useMemo(() => {
    if (overrideMode !== 'total') return null;
    const n = Number(overrideTotalDollars);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }, [overrideMode, overrideTotalDollars]);

  const overrideUnitCents = useMemo(() => {
    if (overrideMode !== 'unit') return null;
    const n = Number(overrideUnitDollars);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }, [overrideMode, overrideUnitDollars]);

  const effectiveCents = useMemo(() => {
    if (overrideTotalCents != null) return overrideTotalCents;
    if (overrideUnitCents != null) return overrideUnitCents * rackQty;
    return previewCents;
  }, [overrideTotalCents, overrideUnitCents, rackQty, previewCents]);

  const discountPct = useMemo(() => {
    if (previewCents <= 0) return 0;
    return Math.round(((previewCents - effectiveCents) / previewCents) * 1000) / 10;
  }, [previewCents, effectiveCents]);

  // App-channel collision detection. Returns a list of overlapping
  // bookings so we can show a "warn but allow" banner.
  const appCollisions = useMemo(() => {
    if (channel !== 'app' || !selectedAppSlot) return [] as BookedWindow[];
    const startIso = new Date().toISOString().slice(0, 10);
    const endIso =
      appCadence === 'weekly'
        ? addDaysIso(startIso, Math.max(1, appWeeks) * 7 - 1)
        : addMonthsEomIso(startIso, Math.max(1, months));
    return bookedWindows.filter(
      (w) =>
        w.slot_or_size === selectedAppSlot.slug &&
        windowsOverlap(startIso, endIso, w.start_date, w.end_date),
    );
  }, [channel, selectedAppSlot, appCadence, appWeeks, months, bookedWindows]);

  const monthlyUnavailable =
    channel === 'app' &&
    selectedAppSlot != null &&
    monthlyRateForMarkets(selectedAppSlot, appMarkets) == null;

  // When user is in date-mode, derive qty (weeks / months / sends) from the
  // picked span so all downstream pricing keeps working. The effect only
  // fires when runMode='dates' — quantity-mode is untouched.
  useEffect(() => {
    (async () => {
      await Promise.resolve();
      if (runMode !== 'dates') return;
      if (!runStart || !runEnd) return;
      if (runEnd < runStart) return;
      const startMs = Date.UTC(
        +runStart.slice(0, 4), +runStart.slice(5, 7) - 1, +runStart.slice(8, 10),
      );
      const endMs = Date.UTC(
        +runEnd.slice(0, 4), +runEnd.slice(5, 7) - 1, +runEnd.slice(8, 10),
      );
      const days = Math.max(1, Math.floor((endMs - startMs) / 86400000) + 1);
      if (channel === 'print') {
        // Month count — every month "touched" by the window.
        const [sy, sm] = [+runStart.slice(0, 4), +runStart.slice(5, 7)];
        const [ey, em] = [+runEnd.slice(0, 4), +runEnd.slice(5, 7)];
        const monthCount = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
        setMonths(Math.min(24, monthCount));
      } else if (channel === 'email') {
        // Solo e-Blast is single-day; leave sends alone (rep still enters it).
      } else if (channel === 'app') {
        if (appCadence === 'weekly') {
          setAppWeeks(Math.min(52, Math.max(1, Math.ceil(days / 7))));
        } else {
          const [sy, sm] = [+runStart.slice(0, 4), +runStart.slice(5, 7)];
          const [ey, em] = [+runEnd.slice(0, 4), +runEnd.slice(5, 7)];
          const monthCount = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
          setMonths(Math.min(24, monthCount));
        }
      }
    })();
  }, [runMode, runStart, runEnd, channel, appCadence]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (createNew) {
      if (!newName.trim() || !newEmail.trim()) return false;
    } else {
      if (!selectedAdvertiserId) return false;
    }
    if (!packageId) return false;
    if (previewCents <= 0) return false;
    return true;
  }, [submitting, createNew, newName, newEmail, selectedAdvertiserId, packageId, previewCents]);

  // Build a BundleLine snapshot from current form state.
  // Returns null if the current form isn't valid enough to add.
  function currentLineSnapshot(): BundleLine | null {
    if (!packageId) return null;
    if (previewCents <= 0) return null;
    let label = packageId;
    if (channel === 'print') {
      const pkg = PACKAGES.find((p) => p.id === packageId);
      const effectiveSize = ioAdSize || size;
      const sz = pkg?.sizes.find((x) => x.size === effectiveSize);
      const shownSize = sz?.size ?? effectiveSize;
      label = pkg ? `${pkg.name}${shownSize ? ` — ${shownSize}` : ''}` : packageId;
    } else if (channel === 'email') {
      const eb = EBLASTS.find((e) => eblastId(e.name) === packageId);
      label = eb ? eb.name : packageId;
    } else {
      const slot = APP_AD_SLOTS.find((x) => x.slug === packageId);
      label = slot ? slot.name : packageId;
    }
    return {
      id: '',
      channel,
      packageId,
      packageLabel: label,
      size: channel === 'print' ? size : undefined,
      months:
        channel === 'print' || (channel === 'app' && appCadence === 'monthly')
          ? months
          : undefined,
      sends: channel === 'email' ? sends : undefined,
      appCadence: channel === 'app' ? appCadence : undefined,
      appWeeks: channel === 'app' && appCadence === 'weekly' ? appWeeks : undefined,
      appMarkets: channel === 'app' ? appMarkets : undefined,
      ioAdSize: channel === 'print' ? ioAdSize : undefined,
      ioFrequency: channel === 'print' ? ioFrequency : undefined,
      ioAdRateCents: channel === 'print' && ioAdRate ? Math.round(parseFloat(ioAdRate) * 100) : undefined,
      ioAdRateBaseCents: channel === 'print' && ioAdRateBase ? Math.round(parseFloat(ioAdRateBase) * 100) : undefined,
      ioDiscountCents: channel === 'print' && ioDiscount ? Math.round(parseFloat(ioDiscount) * 100) : undefined,
      ioAdPremiumCents: channel === 'print' && ioAdPremium ? Math.round(parseFloat(ioAdPremium) * 100) : undefined,
      ioPagePosition: channel === 'print' ? ioPagePosition : undefined,
      ioPosPremActive: channel === 'print' ? ioPosPremActive : undefined,
      ioTimingMonths: channel === 'print' ? ioTimingMonths : undefined,
      ioTimingYears: channel === 'print' ? ioTimingYears : undefined,
      preferredSendDates: channel === 'email'
        ? [ebDate1, ebDate2, ebDate3].filter(Boolean)
        : undefined,
      publication: channel === 'email' ? publication : undefined,
      runStart: runMode === 'dates' ? runStart : undefined,
      runEnd: runMode === 'dates' ? runEnd : undefined,
      runMode,
      overrideMode,
      overrideTotalCents,
      overrideUnitCents,
      subtotalCents: previewCents,
    };
  }

  function addCurrentLineToBundle() {
    const snap = currentLineSnapshot();
    if (!snap) {
      setError('Current selection is incomplete — pick a package and quantity first.');
      return;
    }
    setError(null);
    snap.id = `bl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    setBundleLines((prev) => [...prev, snap]);
  }

  function removeBundleLine(id: string) {
    setBundleLines((prev) => prev.filter((l) => l.id !== id));
  }

  function reviseBundleLine(id: string) {
    const line = bundleLines.find((l) => l.id === id);
    if (!line) return;
    setChannel(line.channel);
    setPackageId(line.packageId);
    if (line.channel === 'print') {
      setSize(line.size ?? '');
      setMonths(line.months ?? 1);
      setIoAdSize(line.ioAdSize ?? '');
      setIoFrequency(line.ioFrequency ?? '');
      setIoAdRate(line.ioAdRateCents != null ? String(line.ioAdRateCents / 100) : '');
      setIoAdRateBase(line.ioAdRateBaseCents != null ? String(line.ioAdRateBaseCents / 100) : '');
      setIoDiscount(line.ioDiscountCents != null ? String(line.ioDiscountCents / 100) : '');
      setIoAdPremium(line.ioAdPremiumCents != null ? String(line.ioAdPremiumCents / 100) : '');
      setIoPagePosition(line.ioPagePosition ?? '');
      setIoPosPremActive(!!line.ioPosPremActive);
      setIoTimingMonths(line.ioTimingMonths ?? {});
      setIoTimingYears(line.ioTimingYears ?? {});
    } else if (line.channel === 'email') {
      setSends(line.sends ?? 1);
      if (line.publication) setPublication(line.publication);
      setEbDate1(line.preferredSendDates?.[0] ?? '');
      setEbDate2(line.preferredSendDates?.[1] ?? '');
      setEbDate3(line.preferredSendDates?.[2] ?? '');
    } else {
      setAppCadence(line.appCadence ?? 'weekly');
      setAppWeeks(line.appWeeks ?? 1);
      setAppMarkets(line.appMarkets ?? 1);
      if (line.appCadence === 'monthly') setMonths(line.months ?? 1);
    }
    if (line.runMode === 'dates' && line.runStart && line.runEnd) {
      setRunMode('dates');
      setRunStart(line.runStart);
      setRunEnd(line.runEnd);
    } else {
      setRunMode('quantity');
    }
    setOverrideMode(line.overrideMode);
    setOverrideTotalDollars(line.overrideTotalCents != null ? String(line.overrideTotalCents / 100) : '');
    setOverrideUnitDollars(line.overrideUnitCents != null ? String(line.overrideUnitCents / 100) : '');
    setBundleLines((prev) => prev.filter((l) => l.id !== id));
  }

  // Grand total = sum of all bundle-line subtotals + current form preview.
  const bundleGrandTotalCents = useMemo(() => {
    const linesSum = bundleLines.reduce((acc, l) => acc + l.subtotalCents, 0);
    return linesSum + previewCents;
  }, [bundleLines, previewCents]);

  // Build the POST body from a BundleLine (or, when null, from the
  // current form state — for the final line in the bundle sequence).
  function buildPayloadFor(line: BundleLine | null): Record<string, unknown> {
    const advertiserPayload = createNew
      ? {
          name: newName.trim(),
          contact_email: newEmail.trim(),
          publication: newPublication,
          ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
        }
      : { id: selectedAdvertiserId! };

    const src = line ?? {
      channel,
      packageId,
      size,
      months,
      sends,
      appCadence,
      appWeeks,
      appMarkets,
      publication,
      runMode,
      runStart,
      runEnd,
      overrideMode,
      overrideTotalCents,
      overrideUnitCents,
    };

    const payload: Record<string, unknown> = {
      channel: src.channel,
      package_id: src.packageId,
      advertiser: advertiserPayload,
    };
    if (src.channel === 'print') {
      payload.size = src.size;
      payload.months = src.months ?? 1;
    } else if (src.channel === 'email') {
      payload.sends = src.sends ?? 1;
      payload.publication = src.publication;
    } else {
      payload.app_cadence = src.appCadence;
      payload.app_markets = src.appMarkets;
      if (src.appCadence === 'weekly') {
        payload.app_weeks = Math.max(1, src.appWeeks ?? 1);
      } else {
        payload.months = Math.max(1, src.months ?? 1);
      }
    }
    if (src.runMode === 'dates' && src.runStart && src.runEnd && src.runEnd >= src.runStart) {
      payload.start_date = src.runStart;
      payload.end_date = src.runEnd;
    }
    if (dueDate) payload.due_date = dueDate;
    if (memo.trim()) payload.memo = memo.trim();
    if (src.overrideTotalCents != null) {
      payload.override_total_cents = src.overrideTotalCents;
    } else if (src.overrideUnitCents != null) {
      payload.override_unit_cents = src.overrideUnitCents;
    }
    return payload;
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Bundle mode or has pending line: show review overlay before hitting API
    const currentSnap = currentLineSnapshot();
    const linesForReview = [...bundleLines, ...(currentSnap ? [currentSnap] : [])];
    if (linesForReview.length > 1 || bundleLines.length > 0) {
      setShowReview(true);
      return;
    }
    // Single-line path: submit directly
    void handleSubmit(e);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const advertiserPayload = createNew
        ? {
            name: newName.trim(),
            contact_email: newEmail.trim(),
            publication: newPublication,
            ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
          }
        : { id: selectedAdvertiserId! };

      const payload: Record<string, unknown> = {
        channel,
        package_id: packageId,
        advertiser: advertiserPayload,
      };
      if (channel === 'print') {
        payload.size = size;
        payload.months = months;
      } else if (channel === 'email') {
        payload.sends = sends;
        payload.publication = publication;
      } else {
        payload.app_cadence = appCadence;
        payload.app_markets = appMarkets;
        if (appCadence === 'weekly') {
          payload.app_weeks = Math.max(1, appWeeks);
        } else {
          payload.months = Math.max(1, months);
        }
      }
      if (runMode === 'dates' && runStart && runEnd && runEnd >= runStart) {
        payload.start_date = runStart;
        payload.end_date = runEnd;
      }
      if (dueDate) payload.due_date = dueDate;
      if (memo.trim()) payload.memo = memo.trim();
      if (overrideTotalCents != null) {
        payload.override_total_cents = overrideTotalCents;
      } else if (overrideUnitCents != null) {
        payload.override_unit_cents = overrideUnitCents;
      }

      // Bundle path: one POST with line_items[]. Single-line path unchanged.
      const currentSnap = currentLineSnapshot();
      const allLines = currentSnap ? [...bundleLines, currentSnap] : bundleLines;
      const isBundle = allLines.length > 1;

      let body: Record<string, unknown>;
      if (isBundle) {
        const advertiserPayload = createNew
          ? {
              name: newName.trim(),
              contact_email: newEmail.trim(),
              publication: newPublication,
              ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
            }
          : { id: selectedAdvertiserId! };
        body = {
          advertiser: advertiserPayload,
          line_items: allLines.map((line) => {
            const item: Record<string, unknown> = {
              channel: line.channel,
              package_id: line.packageId,
            };
            if (line.channel === 'print') {
              item.size = line.size;
              item.months = line.months ?? 1;
              if (line.ioAdSize) item.ad_size = line.ioAdSize;
              if (line.ioFrequency) item.frequency = line.ioFrequency;
              if (line.ioAdRateCents != null) item.ad_rate_cents = line.ioAdRateCents;
              if (line.ioAdRateBaseCents != null) item.ad_rate_base_cents = line.ioAdRateBaseCents;
              if (line.ioDiscountCents != null) item.discount_cents = line.ioDiscountCents;
              if (line.ioAdPremiumCents != null) item.ad_premium_cents = line.ioAdPremiumCents;
              if (line.ioPagePosition) item.page_position = line.ioPagePosition;
              if (line.ioPosPremActive) item.pos_premium_active = true;
              if (line.ioTimingMonths) item.ad_timing_months = line.ioTimingMonths;
              if (line.ioTimingYears) item.ad_timing_years = line.ioTimingYears;
            } else if (line.channel === 'email') {
              item.sends = line.sends ?? 1;
              if (line.publication) item.publication = line.publication;
              if (line.preferredSendDates && line.preferredSendDates.length > 0) {
                item.preferred_send_dates = line.preferredSendDates;
              }
            } else {
              item.app_cadence = line.appCadence;
              item.app_markets = line.appMarkets;
              if (line.appCadence === 'weekly') item.app_weeks = Math.max(1, line.appWeeks ?? 1);
              else item.months = Math.max(1, line.months ?? 1);
            }
            if (line.runMode === 'dates' && line.runStart && line.runEnd && line.runEnd >= line.runStart) {
              item.start_date = line.runStart;
              item.end_date = line.runEnd;
            }
            if (line.overrideTotalCents != null) item.override_total_cents = line.overrideTotalCents;
            else if (line.overrideUnitCents != null) item.override_unit_cents = line.overrideUnitCents;
            return item;
          }),
        };
        if (dueDate) body.due_date = dueDate;
        if (memo.trim()) body.memo = memo.trim();
      } else {
        body = buildPayloadFor(null);
      }

      setBundleProgress({
        total: 1,
        done: 0,
        label: isBundle ? `Bundle · ${allLines.length} lines` : (currentSnap?.packageLabel ?? 'Quote'),
      });
      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string; details?: unknown } | null;
        const detailStr = j?.details ? ` — ${JSON.stringify(j.details)}` : '';
        throw new Error(`${j?.error || `Quote failed (${res.status})`}${detailStr}`);
      }
      const json = (await res.json()) as {
        agreement: CreatedAgreement;
        invoice: CreatedInvoice;
      };
      setBundleProgress({ total: 1, done: 1, label: 'done' });
      setCreatedAgreement(json.agreement);
      setCreatedInvoice(json.invoice);
      setCreatedBundle([{ agreement: json.agreement, invoice: json.invoice }]);
      onDrafted?.();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend() {
    if (!createdAgreement) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/agreements/${createdAgreement.id}/send`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Send failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  // Test-mode send: server forces recipient to admin.email, does NOT
  // update agreement.status / sent_to_email. Endpoint added in 4155b71.
  async function handleSendTest() {
    if (!createdAgreement) return;
    setSendingTest(true);
    setError(null);
    setTestSent(false);
    try {
      const res = await fetch(
        `/api/admin/agreements/${createdAgreement.id}/send?test=1`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Test send failed (${res.status})`);
      }
      setTestSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test send failed');
    } finally {
      setSendingTest(false);
    }
  }

  if (!open) return null;

  // ── Render success card ────────────────────────────────────────────
  if (createdAgreement && createdInvoice) {
    const paymentTerms =
      channel === 'email' || channel === 'app'
        ? 'Payment due immediately on invoice.'
        : 'Print: invoiced monthly, net-20 (card or check).';
    return (
      <ModalShell onClose={handleClose} title="Quote drafted">
        <div className="border border-green-200 bg-green-50 rounded-md p-4">
          <p className="text-sm font-semibold text-green-900">
            {createdInvoice.number ?? createdInvoice.id}
            <span className="ml-2 text-xs font-normal text-green-800">
              · agreement {createdAgreement.id.slice(0, 8)}
            </span>
          </p>
          <p className="text-xs text-green-900 mt-1">
            ${(createdInvoice.amount_cents / 100).toFixed(2)} · status {createdInvoice.status}.
          </p>
          {createdBundle && createdBundle.length > 1 && (
            <div className="mt-3 border-t border-green-200 pt-3">
              <p className="text-[11px] uppercase tracking-wider text-green-800 font-semibold mb-1">
                Bundle lines
              </p>
              <ul className="text-xs text-green-900 space-y-1">
                {createdBundle.map((b, i) => (
                  <li key={b.agreement.id} className="flex items-center justify-between">
                    <span><span className="font-mono mr-2">#{i + 1}</span>{b.invoice.number ?? b.invoice.id}</span>
                    <span>${(b.invoice.amount_cents / 100).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-green-800 mt-1 italic">{paymentTerms}</p>
          {sent && (
            <p className="text-xs text-green-900 mt-2 font-medium">
              ✓ Quote email sent — client will receive a sign link.
            </p>
          )}
          {testSent && (
            <p className="text-xs text-purple-900 mt-2 font-medium">
              ✓ Test email sent to you — check your inbox.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!sent && (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || sendingTest}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send Quote to Client'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSendTest}
              disabled={sending || sendingTest}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-purple-300 bg-white text-purple-700 hover:bg-purple-50 disabled:opacity-60"
              title="Send the notification email to yourself. Does not touch advertiser record."
            >
              {sendingTest ? 'Sending…' : 'Email me a test'}
            </button>
            <a
              href={`/admin/agreements?id=${encodeURIComponent(createdAgreement.id)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
            >
              Open agreement
            </a>
            <a
              href={`/admin/invoices?focus=${encodeURIComponent(createdInvoice.id)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
            >
              Open in Invoices
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
          {error && <p className="text-xs text-red-700 mt-2">Error: {error}</p>}
        </div>
      </ModalShell>
    );
  }

  // ── Render form ────────────────────────────────────────────────────
  return (
    <ModalShell onClose={handleClose} title="New quote">
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* REVIEW_OVERLAY_MARKER */}
        {showReview && (() => {
          const currentSnap = currentLineSnapshot();
          const reviewLines = [...bundleLines, ...(currentSnap ? [currentSnap] : [])];
          const grand = reviewLines.reduce((a, b) => a + (b.subtotalCents || 0), 0);
          return (
            <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 overflow-y-auto py-8 px-4">
              <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                  <h3 className="text-base font-semibold text-gray-900">Review quote before sending</h3>
                  <button
                    type="button"
                    onClick={() => setShowReview(false)}
                    className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                    aria-label="Close review"
                  >×</button>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-gray-600">Confirm all bundle lines below. Click <b>Back</b> to keep editing or <b>Draft &amp; Send</b> to draft the quote and prepare it for the client.</p>
                  <div className="space-y-2">
                    {reviewLines.map((line, i) => (
                      <div key={line.id || `pending-${i}`} className="border border-gray-200 rounded-md p-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs">
                            <span className="font-mono text-purple-700 mr-2">#{i + 1}</span>
                            <span className="font-semibold text-gray-900">{line.packageLabel}</span>
                            <span className="ml-2 uppercase text-[10px] tracking-wider text-gray-500">{line.channel}</span>
                          </div>
                          <div className="text-sm font-semibold text-gray-900">${(line.subtotalCents / 100).toFixed(2)}</div>
                        </div>
                        <div className="text-[11px] text-gray-700 space-y-0.5">
                          {line.channel === 'print' && (
                            <>
                              {line.ioAdSize && <div>Ad size: <b>{line.ioAdSize}</b></div>}
                              {line.ioFrequency && <div>Frequency: <b>{line.ioFrequency}</b></div>}
                              {line.ioAdRateCents != null && <div>Ad rate: <b>${(line.ioAdRateCents / 100).toFixed(2)}</b></div>}
                              {line.ioDiscountCents != null && line.ioDiscountCents > 0 && <div>Discount: <b>-${(line.ioDiscountCents / 100).toFixed(2)}</b></div>}
                              {line.ioAdPremiumCents != null && line.ioAdPremiumCents > 0 && <div>Ad premium: <b>+${(line.ioAdPremiumCents / 100).toFixed(2)}</b></div>}
                              {line.ioPagePosition && <div>Page position: <b>{line.ioPagePosition}</b>{line.ioPosPremActive ? ' (20% premium)' : ''}</div>}
                              {line.ioTimingMonths && Object.keys(line.ioTimingMonths).filter((k) => line.ioTimingMonths?.[k]).length > 0 && (
                                <div>Timing months: <b>{Object.keys(line.ioTimingMonths).filter((k) => line.ioTimingMonths?.[k]).map((k) => `${k}${line.ioTimingYears?.[k] ? ' ' + line.ioTimingYears[k] : ''}`).join(', ')}</b></div>
                              )}
                            </>
                          )}
                          {line.channel === 'email' && (
                            <>
                              <div>Sends: <b>{line.sends ?? 1}</b></div>
                              {line.publication && <div>Publication: <b>{line.publication}</b></div>}
                              {line.preferredSendDates && line.preferredSendDates.length > 0 && (
                                <div>Preferred dates: <b>{line.preferredSendDates.join(', ')}</b></div>
                              )}
                              {(!line.preferredSendDates || line.preferredSendDates.length === 0) && (
                                <div className="italic text-gray-500">Advertiser will pick dates</div>
                              )}
                            </>
                          )}
                          {line.channel === 'app' && (
                            <>
                              <div>Cadence: <b>{line.appCadence}</b></div>
                              <div>Markets: <b>{line.appMarkets}</b></div>
                              {line.appCadence === 'weekly' && <div>Weeks: <b>{line.appWeeks}</b></div>}
                              {line.appCadence === 'monthly' && <div>Months: <b>{line.months}</b></div>}
                              {line.runStart && line.runEnd && (
                                <div>Run window: <b>{line.runStart} → {line.runEnd}</b></div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-3 mt-2">
                    <div className="text-sm font-semibold text-gray-900">Grand total</div>
                    <div className="text-sm font-semibold text-gray-900">${(grand / 100).toFixed(2)}</div>
                  </div>
                </div>
                <div className="border-t border-gray-200 px-4 py-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReview(false)}
                    disabled={submitting}
                    className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowReview(false); void handleSubmit(new Event('submit') as unknown as React.FormEvent); }}
                    disabled={submitting}
                    className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-60"
                  >
                    {submitting ? 'Drafting…' : 'Draft & Send'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Advertiser picker */}
        <section className="border border-gray-200 rounded-md p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold">
              Advertiser
            </p>
            <button
              type="button"
              onClick={() => setCreateNew((v) => !v)}
              className="text-xs text-purple-700 hover:underline"
            >
              {createNew ? '← Use existing' : '+ Create new advertiser'}
            </button>
          </div>

          {!createNew && (
            <>
              <input
                type="text"
                value={advertiserSearch}
                onChange={(e) => {
                  setAdvertiserSearch(e.target.value);
                  setSelectedAdvertiserId(null);
                }}
                placeholder="Search by name or email…"
                className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
              {selectedAdvertiser ? (
                <div className="mt-2 flex items-center justify-between border border-purple-200 bg-purple-50 rounded-md px-2 py-1.5">
                  <div className="text-xs">
                    <span className="font-semibold text-purple-900">
                      {selectedAdvertiser.name}
                    </span>
                    <span className="text-purple-800 ml-2">
                      {selectedAdvertiser.contact_email ?? 'no email'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAdvertiserId(null)}
                    className="text-xs text-purple-700 hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <ul className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white text-sm divide-y divide-gray-100">
                  {filteredAdvertisers.length === 0 ? (
                    <li className="px-2 py-2 text-xs text-gray-500 italic">
                      No matches. Try &ldquo;+ Create new advertiser&rdquo;.
                    </li>
                  ) : (
                    filteredAdvertisers.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedAdvertiserId(a.id)}
                          className="w-full text-left px-2 py-1.5 hover:bg-purple-50"
                        >
                          <span className="font-medium text-gray-900">{a.name}</span>
                          <span className="ml-2 text-xs text-gray-500">
                            {a.contact_email ?? 'no email'}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}

          {createNew && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-gray-700">
                Name
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-gray-700">
                Contact email
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-gray-700">
                Phone (optional)
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-gray-700">
                Publication
                <select
                  value={newPublication}
                  onChange={(e) => setNewPublication(e.target.value as Publication)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="austin">RealtyLine (Austin)</option>
                  <option value="san_antonio">Newsline (San Antonio)</option>
                  <option value="both">Both</option>
                </select>
              </label>
            </div>
          )}
        </section>

        {/* Channel + package */}
        <section className="border border-gray-200 rounded-md p-3">
          <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-2">
            Package
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-gray-700">
              Channel
              <select
                value={channel}
                onChange={(e) => handleChannelChange(e.target.value as Channel)}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="print">Print</option>
                <option value="email">E-Blast</option>
                <option value="app">App ad</option>
              </select>
            </label>
            <label className="text-xs text-gray-700" style={{ display: channel === 'print' ? 'none' : undefined }}>
              {channel === 'email' ? 'E-Blast package' : 'App slot'}
              <select
                value={packageId}
                onChange={(e) => handlePackageChange(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
              >
                {channel === 'print' &&
                  PACKAGES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                {channel === 'email' &&
                  EBLASTS.map((e) => (
                    <option key={eblastId(e.name)} value={eblastId(e.name)}>
                      {e.name}
                    </option>
                  ))}
                {channel === 'app' &&
                  APP_AD_SLOTS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.tier === 'premium' ? '★ ' : ''}
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>

            {/* Run window: quantity ⇄ date-range toggle */}
            <div className="rounded-md border border-gray-200 p-3 mb-3 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Run window
                </div>
                <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setRunMode('quantity')}
                    className={
                      runMode === 'quantity'
                        ? 'px-3 py-1 bg-purple-600 text-white'
                        : 'px-3 py-1 bg-white text-gray-700 hover:bg-gray-100'
                    }
                  >
                    By quantity
                  </button>
                  <button
                    type="button"
                    onClick={() => setRunMode('dates')}
                    className={
                      runMode === 'dates'
                        ? 'px-3 py-1 bg-purple-600 text-white'
                        : 'px-3 py-1 bg-white text-gray-700 hover:bg-gray-100'
                    }
                  >
                    By dates
                  </button>
                </div>
              </div>
              {runMode === 'dates' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-gray-600">
                    Start date
                    <input
                      type="date"
                      value={runStart}
                      onChange={(e) => setRunStart(e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    End date
                    <input
                      type="date"
                      value={runEnd}
                      min={runStart}
                      onChange={(e) => setRunEnd(e.target.value)}
                      className="mt-1 w-full px-2 py-1.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </label>
                  {runEnd < runStart && (
                    <div className="col-span-2 text-xs text-red-600">
                      End date must be on or after start date.
                    </div>
                  )}
                  <div className="col-span-2 text-[11px] text-gray-500">
                    Quantity below auto-derives from this window.
                  </div>
                </div>
              )}
            </div>
            {channel === 'print' && (
              <div className="rounded-md border border-gray-200 p-3 mb-3 bg-white space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-700">Insertion Order</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Ad Size</div>
                    {AD_SIZES.map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                        <input type="radio" name="nq_ag_size" value={s} checked={ioAdSize === s}
                          onChange={() => {
                            setIoAdSize(s);
                            const looked = lookupRate(ioFrequency, s);
                            if (looked) {
                              setIoAdRate(String(looked.rate));
                              setIoAdRateBase(String(looked.rate));
                              setIoRateUserEdited(false);
                              if (ioPosPremActive) setIoAdPremium(String(pagePositionPremium(looked.rate)));
                            }
                          }}
                          className="w-4 h-4 accent-blue-600" />
                        {s}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Frequency</div>
                    {FREQUENCIES.map((f) => (
                      <label key={f} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                        <input type="radio" name="nq_ag_freq" value={f} checked={ioFrequency === f}
                          onChange={() => {
                            setIoFrequency(f);
                            const looked = lookupRate(f, ioAdSize);
                            if (looked) {
                              setIoAdRate(String(looked.rate));
                              setIoAdRateBase(String(looked.rate));
                              setIoRateUserEdited(false);
                              if (ioPosPremActive) setIoAdPremium(String(pagePositionPremium(looked.rate)));
                            }
                          }}
                          className="w-4 h-4 accent-blue-600" />
                        {f} {FREQ_PKG_AG[f] ? `· ${FREQ_PKG_AG[f]}` : ''}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Ad Rate ($)</div>
                    <input
                      type="number"
                      value={ioAdRate}
                      onChange={(e) => {
                        setIoAdRate(e.target.value);
                        setIoAdRateBase(e.target.value);
                        setIoRateUserEdited(true);
                      }}
                      className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00" min="0" step="0.01"
                    />
                    {!ioRateUserEdited && ioAdRate && (
                      <div className="text-[10px] text-gray-400 mt-1">
                        ✨ Auto-filled from {FREQ_PKG_AG[ioFrequency] ?? ioFrequency}
                      </div>
                    )}
                  </div>
                  <label className="block">
                    <div className="text-xs text-gray-600 mb-1">Discount ($)</div>
                    <input type="number" value={ioDiscount}
                      onChange={(e) => setIoDiscount(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00" min="0" step="0.01" />
                  </label>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Ad Premium ($)</div>
                    {ioPosPremActive ? (
                      <>
                        <input value={ioAdPremium} className="w-full px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm text-gray-600 cursor-not-allowed" readOnly />
                        <div className="text-[10px] text-gray-400 mt-1">20% page position premium applied</div>
                      </>
                    ) : (
                      <input type="number" value={ioAdPremium}
                        onChange={(e) => setIoAdPremium(e.target.value)}
                        className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00" min="0" step="0.01" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Total Monthly ($)</div>
                    <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900">
                      ${((parseFloat(ioAdRate) || 0) - (parseFloat(ioDiscount) || 0) + (parseFloat(ioAdPremium) || 0)).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">Rate − Discount + Premium</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <div className="text-xs text-gray-600 mb-1">Page Position</div>
                    <input value={ioPagePosition}
                      onChange={(e) => setIoPagePosition(e.target.value)}
                      className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Inside front cover" />
                  </label>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={ioPosPremActive}
                        onChange={(e) => {
                          const active = e.target.checked;
                          setIoPosPremActive(active);
                          const base = parseFloat(ioAdRateBase) || 0;
                          if (active && base > 0) setIoAdPremium(String(pagePositionPremium(base)));
                          else if (!active) setIoAdPremium('');
                        }}
                        className="w-4 h-4 accent-blue-600" />
                      Apply 20% premium
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Ad Timing Term</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                    {MONTHS_LIST.map((m) => (
                      <div key={m.k} className="flex items-center gap-2">
                        <input type="checkbox" id={`nq_agm_${m.k}`}
                          checked={!!ioTimingMonths[m.k]}
                          onChange={(e) => setIoTimingMonths({ ...ioTimingMonths, [m.k]: e.target.checked })}
                          className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" />
                        <label htmlFor={`nq_agm_${m.k}`} className="text-sm min-w-[80px] cursor-pointer">{m.l}</label>
                        <input
                          value={ioTimingYears[m.k] ?? ''}
                          disabled={!ioTimingMonths[m.k]}
                          maxLength={4}
                          onChange={(e) => setIoTimingYears({ ...ioTimingYears, [m.k]: e.target.value })}
                          className="w-14 px-2 py-1 text-xs rounded-md border border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                          placeholder="Year"
                        />
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const exp = computeExp(ioTimingMonths, ioTimingYears, ioFrequency, new Date().toISOString().slice(0,10));
                    if (!exp) return null;
                    const d = new Date(exp + 'T00:00:00');
                    const rem = new Date(d); rem.setDate(rem.getDate() - 30);
                    const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                    return (
                      <div className="mt-2 text-xs text-gray-600">
                        Expiration: <span className="font-medium text-gray-900">{fmt(d)}</span>
                        {' · '}Renewal reminder 30 days before: <span className="font-medium">{fmt(rem)}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {channel === 'email' && (
              <>
                <label className="text-xs text-gray-700">
                  Sends
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={sends}
                    onChange={(e) => setSends(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </label>
                <label className="text-xs text-gray-700">
                  Publication scope
                  <select
                    value={publication}
                    onChange={(e) => setPublication(e.target.value as Publication)}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    <option value="austin">RealtyLine (Austin)</option>
                    <option value="san_antonio">Newsline (San Antonio)</option>
                    <option value="both">Both</option>
                  </select>
                </label>
                <div className="sm:col-span-2 border-t border-gray-200 pt-3 mt-1">
                  <p className="text-[11px] uppercase tracking-wider text-gray-600 font-semibold mb-1">
                    Preferred send dates <span className="normal-case font-normal text-gray-500">(optional — leave blank if advertiser will choose)</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-xs text-gray-700">
                      1st choice
                      <input
                        type="date"
                        value={ebDate1}
                        onChange={(e) => setEbDate1(e.target.value)}
                        className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-700">
                      2nd choice
                      <input
                        type="date"
                        value={ebDate2}
                        onChange={(e) => setEbDate2(e.target.value)}
                        className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-700">
                      3rd choice
                      <input
                        type="date"
                        value={ebDate3}
                        onChange={(e) => setEbDate3(e.target.value)}
                        className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </label>
                  </div>
                </div>
              </>
            )}

            {channel === 'app' && selectedAppSlot && (
              <>
                <label className="text-xs text-gray-700">
                  Cadence
                  <select
                    value={appCadence}
                    onChange={(e) => setAppCadence(e.target.value as AppCadence)}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly" disabled={monthlyUnavailable}>
                      Monthly{monthlyUnavailable ? ' (not offered)' : ''}
                    </option>
                  </select>
                </label>
                <label className="text-xs text-gray-700">
                  Markets
                  <select
                    value={String(appMarkets)}
                    onChange={(e) =>
                      setAppMarkets(Number(e.target.value) as MarketCount)
                    }
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    <option value="1">1 market</option>
                    <option value="2">2 markets</option>
                    <option value="3">3 markets</option>
                    <option value="4">4 markets</option>
                  </select>
                </label>
                {appCadence === 'weekly' ? (
                  <label className="text-xs text-gray-700">
                    Weeks
                    <input
                      type="number"
                      min={1}
                      max={52}
                      value={appWeeks}
                      onChange={(e) =>
                        setAppWeeks(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </label>
                ) : (
                  <label className="text-xs text-gray-700">
                    Months
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={months}
                      onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
                      className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </label>
                )}
                <div className="text-[11px] text-gray-500 sm:col-span-2 leading-snug">
                  {selectedAppSlot.zone} · {selectedAppSlot.tier} · {selectedAppSlot.sizes}
                  <br />
                  {selectedAppSlot.notes}
                </div>
              </>
            )}
          </div>

          {/* App-channel collision warning banner (warn but allow) */}
          {channel === 'app' && appCollisions.length > 0 && (
            <div className="mt-3 border border-yellow-300 bg-yellow-50 rounded-md px-3 py-2">
              <p className="text-xs font-semibold text-yellow-900">
                ⚠ Overlaps {appCollisions.length} existing booking
                {appCollisions.length > 1 ? 's' : ''} for this slot
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-yellow-900">
                {appCollisions.slice(0, 3).map((c, i) => (
                  <li key={i}>
                    · {c.advertiser_name ?? 'Unknown advertiser'} — {c.start_date} → {c.end_date}
                  </li>
                ))}
                {appCollisions.length > 3 && (
                  <li className="italic">…and {appCollisions.length - 3} more</li>
                )}
              </ul>
              <p className="mt-1 text-[11px] text-yellow-800 italic">
                You can still draft this quote — this is a heads-up, not a block.
              </p>
            </div>
          )}
        </section>

        {/* Memo + due date */}
        <section className="border border-gray-200 rounded-md p-3">
          <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-2">
            Options
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-gray-700">
              Due date (optional)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
            <label className="text-xs text-gray-700 sm:col-span-1">
              Memo (optional)
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Appears on invoice"
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
          </div>
        </section>

        {/* Pricing override */}
        <section className="space-y-2 border border-gray-200 rounded-md p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">
              Custom pricing (optional)
            </span>
            <div className="flex gap-1 text-[11px]">
              {(['off', 'total', 'unit'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setOverrideMode(m)}
                  className={
                    'px-2 py-0.5 rounded-md border ' +
                    (overrideMode === m
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')
                  }
                >
                  {m === 'off' ? 'Rack rate' : m === 'total' ? 'Total' : `Per ${unitLabel}`}
                </button>
              ))}
            </div>
          </div>

          {overrideMode === 'total' && (
            <label className="block text-xs text-gray-700">
              Custom total ($)
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={overrideTotalDollars}
                onChange={(e) => setOverrideTotalDollars(e.target.value)}
                placeholder={(previewCents / 100).toFixed(2)}
                className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
          )}

          {overrideMode === 'unit' && (
            <label className="block text-xs text-gray-700">
              Custom per-{unitLabel} ($) × {rackQty}
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={overrideUnitDollars}
                onChange={(e) => setOverrideUnitDollars(e.target.value)}
                placeholder={(rackUnitCents / 100).toFixed(2)}
                className="mt-1 w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
          )}
        </section>

        {/* Bundle: multi-line quote builder */}
        <div className="rounded-md border border-purple-200 bg-purple-50/40 p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-purple-900">
                  Bundle (multi-line quote)
                </div>
                <button
                  type="button"
                  onClick={addCurrentLineToBundle}
                  disabled={submitting || previewCents <= 0}
                  className="px-2.5 py-1 text-xs rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  + Add current as another line
                </button>
              </div>
              {bundleLines.length === 0 ? (
                <div className="text-[11px] text-gray-500">
                  Add the current selection as a line, then change channel/package to build a multi-item quote. On save, each line becomes its own agreement + sign link.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {bundleLines.map((line, i) => (
                    <div
                      key={line.id}
                      className="flex items-center justify-between text-xs bg-white border border-purple-100 rounded px-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-purple-700 mr-2">#{i + 1}</span>
                        <span className="font-medium text-gray-800">{line.packageLabel}</span>
                        <span className="text-gray-500 ml-2">
                          {line.channel === 'print' && `${line.months ?? 1}mo`}
                          {line.channel === 'email' && `${line.sends ?? 1} send${(line.sends ?? 1) > 1 ? 's' : ''}`}
                          {line.channel === 'app' && line.appCadence === 'weekly' && `${line.appWeeks ?? 1}w × ${line.appMarkets ?? 1} mkt`}
                          {line.channel === 'app' && line.appCadence === 'monthly' && `${line.months ?? 1}mo × ${line.appMarkets ?? 1} mkt`}
                        </span>
                      </div>
                      <div className="text-gray-800 font-semibold mr-2">
                        ${(line.subtotalCents / 100).toFixed(2)}
                      </div>
                      <button
                        type="button"
                        onClick={() => reviseBundleLine(line.id)}
                        disabled={submitting}
                        className="text-purple-700 hover:text-purple-900 text-xs mr-3"
                        aria-label="Revise line"
                      >
                        Revise
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBundleLine(line.id)}
                        disabled={submitting}
                        className="text-red-600 hover:text-red-700 text-xs"
                        aria-label="Remove line"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {previewCents > 0 && (
                    <div className="flex items-center justify-between text-xs bg-purple-100/50 border border-purple-200 rounded px-2 py-1.5">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-purple-700 mr-2">#{bundleLines.length + 1}</span>
                        <span className="italic text-gray-600">Current selection (will be added on Save)</span>
                      </div>
                      <div className="text-gray-800 font-semibold">
                        ${(previewCents / 100).toFixed(2)}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-purple-200 pt-2 mt-2">
                    <div className="text-xs font-semibold text-gray-700">Grand total</div>
                    <div className="text-sm font-bold text-purple-900">
                      ${(bundleGrandTotalCents / 100).toFixed(2)}
                    </div>
                  </div>
                  {bundleProgress && (
                    <div className="text-[11px] text-gray-600 mt-1">
                      Creating {bundleProgress.done} / {bundleProgress.total}: {bundleProgress.label}…
                    </div>
                  )}
                </div>
              )}
            </div>
        {/* Preview */}
        <div className="space-y-1 px-3 py-2 rounded-md bg-purple-50 border border-purple-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-900">Rack total</span>
            <span
              className={
                'text-xs text-purple-900 ' +
                (overrideMode !== 'off' && discountPct !== 0 ? 'line-through opacity-70' : '')
              }
            >
              ${(previewCents / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-900">
              Quoted total
              {overrideMode !== 'off' && discountPct !== 0 && (
                <span
                  className={
                    'ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ' +
                    (discountPct > 0
                      ? 'bg-green-100 text-green-800'
                      : 'bg-orange-100 text-orange-800')
                  }
                >
                  {discountPct > 0 ? `${discountPct}% off` : `+${Math.abs(discountPct)}% over`}
                </span>
              )}
            </span>
            <span className="text-sm font-semibold text-purple-900">
              ${(effectiveCents / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-md text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Drafting…' : 'Draft quote'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Small modal shell (no shared modal primitive imported to keep this
// file drop-in-safe across both entry points).
function ModalShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

