'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ImagePlus, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { PUBLICATIONS, type PublicationId } from '@/lib/publications';

export type EventPersonForm = {
  name: string;
  email: string;
  company: string;
  phone: string;
};

export const EMPTY_EVENT_PERSON: EventPersonForm = { name: '', email: '', company: '', phone: '' };

export type EventFormData = {
  id?: number;
  publication: PublicationId;
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  location: string;
  organizer: string;
  organizerEmail: string;
  website: string;
  tags: string;
  format: string;
  courseNumber: string;
  memberPrice: string;
  nonmemberPrice: string;
  imageUrl: string;
  imageThumb: string;
  instructorName: string;
  instructorBio: string;
  lat: string;
  lng: string;
  advertiserIds: number[];
  additionalHosts: EventPersonForm[];
  additionalInstructors: EventPersonForm[];
};

export const EMPTY_EVENT: EventFormData = {
  publication: 'austin',
  title: '',
  description: '',
  link: '',
  startDate: '',
  endDate: '',
  location: '',
  organizer: '',
  organizerEmail: '',
  website: '',
  tags: '',
  format: '',
  courseNumber: '',
  memberPrice: '',
  nonmemberPrice: '',
  imageUrl: '',
  imageThumb: '',
  instructorName: '',
  instructorBio: '',
  lat: '',
  lng: '',
  advertiserIds: [],
  additionalHosts: [],
  additionalInstructors: [],
};

// Known real-estate/industry acronyms to preserve verbatim when Title Casing.
// Matched case-insensitively so "mls", "Mls", "MLS" all normalize to "MLS".
const PRESERVED_ACRONYMS = [
  'MLS', 'HAR', 'ABoR', 'SABoR', 'TREC', 'NAR', 'TAR', 'CE', 'HOA', 'REALTOR',
  'REALTORS', 'CRM', 'RSVP', 'HVAC', 'FAQ', 'CEO', 'VP', 'PC', 'LLC', 'HGTV',
];
const ACRONYM_LOOKUP = new Map(PRESERVED_ACRONYMS.map((a) => [a.toUpperCase(), a]));

/**
 * Title-case a free-typed name/place field: capitalizes the first letter of
 * each word and lowercases the rest, except for a fixed whitelist of known
 * industry acronyms (MLS, HAR, TREC, etc.), which are preserved in their
 * canonical casing regardless of how the source text was cased. This is
 * deliberately NOT based on guessing from capitalization patterns — data
 * imported verbatim (e.g. from Gmail-scanned events) is often entirely
 * ALL CAPS, and that should always be converted to normal Title Case rather
 * than left untouched.
 */
export function toTitleCase(value: string): string {
  return value.replace(/[A-Za-z''-]+/g, (word) => {
    const acronym = ACRONYM_LOOKUP.get(word.toUpperCase());
    if (acronym) return acronym;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Prefix a bare domain/URL with https:// if no protocol is present. */
export function normalizeUrlInput(value: string): string {
  const v = value.trim();
  if (v === '') return v;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(v)) return v; // already has a scheme
  if (v.startsWith('//')) return `https:${v}`;
  return `https://${v}`;
}

/** Convert ISO 8601 (with TZ) to "YYYY-MM-DDTHH:mm" for datetime-local input. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Pad helpers
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert "YYYY-MM-DDTHH:mm" local input to ISO 8601 string. */
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Drop rows with a blank name and trim/null-out the rest for the API. */
function peopleToPayload(people: EventPersonForm[]): Array<{
  name: string;
  email: string | null;
  company: string | null;
  phone: string | null;
}> {
  return people
    .filter((p) => p.name.trim() !== '')
    .map((p) => ({
      name: p.name.trim(),
      email: p.email.trim() === '' ? null : p.email.trim(),
      company: p.company.trim() === '' ? null : p.company.trim(),
      phone: p.phone.trim() === '' ? null : p.phone.trim(),
    }));
}

function fieldsToPayload(data: EventFormData): Record<string, unknown> {
  // Strings → null when blank. Numbers parsed. Dates → ISO.
  const str = (v: string) => (v.trim() === '' ? null : v.trim());
  const num = (v: string) => {
    if (v.trim() === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    publication: data.publication,
    title: data.title.trim(),
    description: str(data.description),
    link: str(data.link),
    startDate: localInputToIso(data.startDate),
    endDate: localInputToIso(data.endDate),
    location: str(data.location),
    organizer: str(data.organizer),
    organizerEmail: str(data.organizerEmail),
    website: str(data.website),
    tags: str(data.tags),
    format: str(data.format),
    courseNumber: str(data.courseNumber),
    memberPrice: str(data.memberPrice),
    nonmemberPrice: str(data.nonmemberPrice),
    imageUrl: str(data.imageUrl),
    imageThumb: str(data.imageThumb),
    instructorName: str(data.instructorName),
    instructorBio: str(data.instructorBio),
    lat: num(data.lat),
    lng: num(data.lng),
    advertiserIds: [...data.advertiserIds].sort((a, b) => a - b),
    additionalHosts: peopleToPayload(data.additionalHosts),
    additionalInstructors: peopleToPayload(data.additionalInstructors),
  };
}

export function EventForm({
  initial,
  mode,
}: {
  initial: EventFormData;
  mode: 'create' | 'edit' | 'public';
}) {
  const router = useRouter();
  const [data, setData] = useState<EventFormData>(initial);
  const initialPayloadRef = useRef<Record<string, unknown>>(fieldsToPayload(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hp, setHp] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const flyerInputRef = useRef<HTMLInputElement>(null);
  const [autoCapturing, setAutoCapturing] = useState(false);
  const [autoCaptureNotice, setAutoCaptureNotice] = useState<string | null>(null);
  const [autoCaptureDragActive, setAutoCaptureDragActive] = useState(false);
  const autoCaptureInputRef = useRef<HTMLInputElement>(null);
  const [partners, setPartners] = useState<PickerAdvertiser[]>([]);

  useEffect(() => {
    if (mode === 'public') return; // public submitters don't tag partners
    let cancelled = false;
    fetch('/api/admin/advertisers/picker', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { advertisers: [] }))
      .then((json: { advertisers?: PickerAdvertiser[] }) => {
        if (!cancelled) setPartners(json.advertisers ?? []);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const update = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  };

  /** On blur, Title Case a name/place text field (Title, Location, Organizer, Instructor Name, ...). */
  const titleCaseOnBlur =
    (key: Extract<keyof EventFormData, string>) => () => {
      setData((d) => {
        const v = d[key];
        if (typeof v !== 'string' || v.trim() === '') return d;
        return { ...d, [key]: toTitleCase(v) };
      });
    };

  /** On blur, prefix a bare domain/URL field with https:// if missing a scheme. */
  const urlOnBlur =
    (key: Extract<keyof EventFormData, string>) => () => {
      setData((d) => {
        const v = d[key];
        if (typeof v !== 'string' || v.trim() === '') return d;
        return { ...d, [key]: normalizeUrlInput(v) };
      });
    };

  const uploadFlyer = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Flyer must be a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Flyer image must be 10 MB or smaller');
      return;
    }

    setUploadingFlyer(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/events/upload-flyer', {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.url) {
        throw new Error(result.error ?? `Upload failed (${response.status})`);
      }
      setData((current) => ({
        ...current,
        imageUrl: result.url ?? '',
        imageThumb: result.url ?? '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Flyer upload failed');
    } finally {
      setUploadingFlyer(false);
      if (flyerInputRef.current) flyerInputRef.current.value = '';
    }
  };

  const autoCaptureFlyer = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAutoCaptureNotice(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Flyer must be a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Flyer image must be 10 MB or smaller');
      return;
    }

    setAutoCapturing(true);
    try {
      const extractFormData = new FormData();
      extractFormData.append('image', file);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const [extractResponse, uploadResponse] = await Promise.all([
        fetch('/api/admin/events/extract-flyer', { method: 'POST', body: extractFormData }),
        fetch('/api/events/upload-flyer', { method: 'POST', body: uploadFormData }),
      ]);

      const result = (await extractResponse.json().catch(() => ({}))) as {
        ok?: boolean;
        extracted?: {
          title: string | null;
          description: string | null;
          startDate: string | null;
          endDate: string | null;
          location: string | null;
          organizer: string | null;
          organizerEmail: string | null;
          website: string | null;
          format: string | null;
          courseNumber: string | null;
          memberPrice: string | null;
          nonmemberPrice: string | null;
          instructorName: string | null;
          instructorBio: string | null;
          rawDate: string | null;
          rawTime: string | null;
          confidence: number;
        };
        error?: string;
      };
      const uploadResult = (await uploadResponse.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!extractResponse.ok || !result.ok || !result.extracted) {
        throw new Error(result.error ?? `Auto-capture failed (${extractResponse.status})`);
      }

      const flyerUrl = uploadResponse.ok ? uploadResult.url ?? null : null;
      const ex = result.extracted;
      const noDetailsFound = !ex.title && ex.confidence === 0;

      setData((current) => ({
        ...current,
        title: ex.title ?? current.title,
        description: ex.description ?? current.description,
        startDate: ex.startDate ?? current.startDate,
        endDate: ex.endDate ?? current.endDate,
        location: ex.location ?? current.location,
        organizer: ex.organizer ?? current.organizer,
        organizerEmail: ex.organizerEmail ?? current.organizerEmail,
        website: ex.website ?? current.website,
        format: ex.format ?? current.format,
        courseNumber: ex.courseNumber ?? current.courseNumber,
        memberPrice: ex.memberPrice ?? current.memberPrice,
        nonmemberPrice: ex.nonmemberPrice ?? current.nonmemberPrice,
        instructorName: ex.instructorName ?? current.instructorName,
        instructorBio: ex.instructorBio ?? current.instructorBio,
        imageUrl: flyerUrl ?? current.imageUrl,
        imageThumb: flyerUrl ?? current.imageThumb,
      }));

      if (noDetailsFound) {
        setAutoCaptureNotice(
          flyerUrl
            ? "Couldn't find event details in that image, but the flyer was attached as the event image."
            : "Couldn't find event details in that image — fields left as-is.",
        );
      } else if (!ex.startDate && ex.rawDate) {
        setAutoCaptureNotice(
          `Filled in what I could read and attached the flyer image. Couldn't auto-parse the date "${ex.rawDate}${ex.rawTime ? ` ${ex.rawTime}` : ''}" — please set it manually.`,
        );
      } else {
        setAutoCaptureNotice(
          flyerUrl
            ? 'Fields filled in and flyer attached as the event image — please review before saving.'
            : 'Fields filled in from the flyer — please review before saving.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-capture failed');
    } finally {
      setAutoCapturing(false);
      if (autoCaptureInputRef.current) autoCaptureInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!data.title.trim()) {
      setError('Title is required');
      return;
    }
    if (mode === 'public' && !data.startDate) {
      setError('Start date and time are required');
      return;
    }
    if (mode === 'public' && (!data.organizer.trim() || !data.organizerEmail.trim())) {
      setError('Organizer name and email are required');
      return;
    }

    const fullPayload = fieldsToPayload(data);
    const payload = mode === 'edit'
      ? Object.fromEntries(Object.entries(fullPayload).filter(([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(initialPayloadRef.current[key]),
        ))
      : fullPayload;
    if (mode === 'edit' && Object.keys(payload).length === 0) {
      router.push('/admin/events');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'public') {
        const response = await fetch('/api/events/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, hp }),
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(result.error ?? `Submission failed (${response.status})`);
        }
        setSubmitted(true);
        setSubmitting(false);
        return;
      } else if (mode === 'create') {
        await adminApi.createEvent(payload);
      } else if (data.id) {
        await adminApi.updateEvent(data.id, payload);
      }
      router.push('/admin/events');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700';
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1';
  const sectionClass = 'bg-white border border-gray-200 rounded-md p-6';
  const sectionTitleClass = 'text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide';

  if (submitted) {
    return (
      <div className="max-w-4xl rounded-md border border-emerald-200 bg-white p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">
          Submitted for review
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-gray-900">Thank You for Sharing Your Event</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
          The Realty News Now team has been notified. Your event will appear on the
          Calendar after an administrator reviews and approves it.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setData(initial);
              setHp('');
              setSubmitted(false);
            }}
            className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            Submit another event
          </button>
          <button
            type="button"
            onClick={() => router.push('/calendar')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Return to Calendar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      {(mode === 'create' || mode === 'edit') && (
        <div className="rounded-md border border-brand-700/40 bg-brand-50/40 p-5">
          <div className="flex items-start gap-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-brand-700" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Auto-fill from flyer</p>
              <p className="mt-0.5 text-xs text-gray-600">
                Drop a photo or screenshot of an event flyer below and the fields will be filled in
                automatically. Review everything before saving.
              </p>
              <div
                role="button"
                tabIndex={0}
                onClick={() => !autoCapturing && autoCaptureInputRef.current?.click()}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !autoCapturing) {
                    event.preventDefault();
                    autoCaptureInputRef.current?.click();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setAutoCaptureDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setAutoCaptureDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setAutoCaptureDragActive(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setAutoCaptureDragActive(false);
                  void autoCaptureFlyer(event.dataTransfer.files[0]);
                }}
                className={`mt-3 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-6 text-center transition-colors ${
                  autoCaptureDragActive
                    ? 'border-brand-700 bg-brand-100/60'
                    : 'border-brand-700/40 bg-white hover:border-brand-700 hover:bg-brand-50/60'
                }`}
              >
                {autoCapturing ? (
                  <Loader2 className="mb-2 animate-spin text-brand-700" size={26} />
                ) : (
                  <UploadCloud className="mb-2 text-brand-700" size={26} />
                )}
                <p className="text-sm font-medium text-gray-900">
                  {autoCapturing ? 'Reading flyer...' : 'Drop your flyer here or click to browse'}
                </p>
                <p className="mt-1 text-xs text-gray-500">JPG, PNG, or WebP up to 10 MB</p>
              </div>
              {autoCaptureNotice && (
                <p className="mt-2 text-xs text-gray-600">{autoCaptureNotice}</p>
              )}
              {data.imageUrl && (
                <div className="mt-3 flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-gray-100">
                    <Image
                      src={data.imageUrl}
                      alt="Attached flyer preview"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <p className="text-xs text-gray-600">
                    Flyer attached as the event image — it will show on the public listing.
                  </p>
                </div>
              )}
              <input
                ref={autoCaptureInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => void autoCaptureFlyer(event.target.files?.[0])}
              />
            </div>
          </div>
        </div>
      )}

      {/* Core */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>Core</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Title <span className="text-red-500">*</span></label>
            <input
              required
              type="text"
              value={data.title}
              onChange={(e) => update('title', e.target.value)}
              onBlur={titleCaseOnBlur('title')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Publication</label>
            <select
              value={data.publication}
              onChange={(e) => update('publication', e.target.value as PublicationId)}
              className={fieldClass}
            >
              {PUBLICATIONS.map((publication) => (
                <option key={publication.id} value={publication.id}>
                  {publication.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Format</label>
            <input
              type="text"
              value={data.format}
              onChange={(e) => update('format', e.target.value)}
              placeholder="In-Person, Virtual, Hybrid..."
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              value={data.description}
              onChange={(e) => update('description', e.target.value)}
              rows={4}
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Registration / Detail Link</label>
            <input
              type="url"
              value={data.link}
              onChange={(e) => update('link', e.target.value)}
              onBlur={urlOnBlur('link')}
              placeholder="https://..."
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* When */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>When</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Start {mode === 'public' && <span className="text-red-500">*</span>}
            </label>
            <input
              required={mode === 'public'}
              type="datetime-local"
              value={data.startDate}
              onChange={(e) => update('startDate', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>End</label>
            <input
              type="datetime-local"
              value={data.endDate}
              onChange={(e) => update('endDate', e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* Where */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>Where</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Location / Venue</label>
            <input
              type="text"
              value={data.location}
              onChange={(e) => update('location', e.target.value)}
              onBlur={titleCaseOnBlur('location')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Latitude</label>
            <input
              type="number"
              step="any"
              value={data.lat}
              onChange={(e) => update('lat', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Longitude</label>
            <input
              type="number"
              step="any"
              value={data.lng}
              onChange={(e) => update('lng', e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* Who */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>Who</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Organizer {mode === 'public' && <span className="text-red-500">*</span>}
            </label>
            <input
              required={mode === 'public'}
              type="text"
              value={data.organizer}
              onChange={(e) => update('organizer', e.target.value)}
              onBlur={titleCaseOnBlur('organizer')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>
              Organizer Email {mode === 'public' && <span className="text-red-500">*</span>}
            </label>
            <input
              required={mode === 'public'}
              type="email"
              value={data.organizerEmail}
              onChange={(e) => update('organizerEmail', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Organizer Website</label>
            <input
              type="url"
              value={data.website}
              onChange={(e) => update('website', e.target.value)}
              onBlur={urlOnBlur('website')}
              placeholder="https://..."
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Additional Event Hosts</label>
            <p className="mb-1.5 text-xs text-gray-500">
              Extra hosts beyond the primary organizer above.
            </p>
            <PeopleListEditor
              people={data.additionalHosts}
              onChange={(people) => update('additionalHosts', people)}
              addLabel="Add Host"
            />
          </div>
          <div>
            <label className={labelClass}>Instructor Name</label>
            <input
              type="text"
              value={data.instructorName}
              onChange={(e) => update('instructorName', e.target.value)}
              onBlur={titleCaseOnBlur('instructorName')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Course Number</label>
            <input
              type="text"
              value={data.courseNumber}
              onChange={(e) => update('courseNumber', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Instructor Bio</label>
            <textarea
              value={data.instructorBio}
              onChange={(e) => update('instructorBio', e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Additional Instructors</label>
            <p className="mb-1.5 text-xs text-gray-500">
              Extra instructors beyond the primary instructor above.
            </p>
            <PeopleListEditor
              people={data.additionalInstructors}
              onChange={(people) => update('additionalInstructors', people)}
              addLabel="Add Instructor"
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>Pricing</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Member Price</label>
            <input
              type="text"
              value={data.memberPrice}
              onChange={(e) => update('memberPrice', e.target.value)}
              placeholder="Free, $25, etc."
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Non-member Price</label>
            <input
              type="text"
              value={data.nonmemberPrice}
              onChange={(e) => update('nonmemberPrice', e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* Media + tags */}
      <div className={sectionClass}>
        <div className={sectionTitleClass}>Media & Tags</div>
        {mode === 'public' && (
          <div className="mb-5">
            <label className={labelClass}>Event Flyer or Image</label>
            {data.imageUrl ? (
              <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <div className="relative aspect-[16/9] w-full max-w-xl bg-gray-100">
                  <Image
                    src={data.imageUrl}
                    alt="Uploaded event flyer preview"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <ImagePlus size={16} />
                    Flyer uploaded
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => flyerInputRef.current?.click()}
                      className="text-sm font-medium text-brand-700 hover:text-brand-800"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        update('imageUrl', '');
                        update('imageThumb', '');
                      }}
                      className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      <X size={15} />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => !uploadingFlyer && flyerInputRef.current?.click()}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !uploadingFlyer) {
                    event.preventDefault();
                    flyerInputRef.current?.click();
                  }
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDragActive(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  void uploadFlyer(event.dataTransfer.files[0]);
                }}
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  dragActive
                    ? 'border-brand-700 bg-brand-50'
                    : 'border-gray-300 bg-gray-50 hover:border-brand-700 hover:bg-brand-50/50'
                }`}
              >
                {uploadingFlyer ? (
                  <Loader2 className="mb-3 animate-spin text-brand-700" size={28} />
                ) : (
                  <UploadCloud className="mb-3 text-brand-700" size={30} />
                )}
                <p className="text-sm font-medium text-gray-900">
                  {uploadingFlyer ? 'Uploading flyer...' : 'Drop your flyer here or click to browse'}
                </p>
                <p className="mt-1 text-xs text-gray-500">JPG, PNG, or WebP up to 10 MB</p>
              </div>
            )}
            <input
              ref={flyerInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => void uploadFlyer(event.target.files?.[0])}
            />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Image URL</label>
            <input
              type="url"
              value={data.imageUrl}
              onChange={(e) => update('imageUrl', e.target.value)}
              placeholder="https://..."
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Thumbnail URL</label>
            <input
              type="url"
              value={data.imageThumb}
              onChange={(e) => update('imageThumb', e.target.value)}
              placeholder="https://..."
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Tags</label>
            <input
              type="text"
              value={data.tags}
              onChange={(e) => update('tags', e.target.value)}
              placeholder="comma, separated, tags"
              className={fieldClass}
            />
          </div>
          {mode !== 'public' && (
            <div className="md:col-span-2">
              <label className={labelClass}>Partners</label>
              <p className="mb-1.5 text-xs text-gray-500">
                Tag one or more partners — the event will show on each partner&rsquo;s public page.
              </p>
              <PartnerMultiPicker
                partners={partners}
                value={data.advertiserIds}
                onChange={(ids) => update('advertiserIds', ids)}
              />
            </div>
          )}
        </div>
      </div>

      {mode === 'public' && (
        <div aria-hidden="true" className="absolute left-[-10000px] h-0 overflow-hidden">
          <label>
            Company website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={(event) => setHp(event.target.value)}
            />
          </label>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => router.push(mode === 'public' ? '/calendar' : '/admin/events')}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-md hover:bg-brand-700 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {submitting
            ? mode === 'public' ? 'Submitting...' : 'Saving...'
            : mode === 'public'
              ? 'Submit Event for Approval'
              : mode === 'create'
                ? 'Create Event'
                : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

type PickerAdvertiser = {
  id: number;
  name: string;
  slug: string;
  publication: string;
};

function PartnerMultiPicker({
  partners,
  value,
  onChange,
}: {
  partners: PickerAdvertiser[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const selected = value
    .map((id) => partners.find((p) => p.id === id))
    .filter((p): p is PickerAdvertiser => !!p);

  const q = query.trim().toLowerCase();
  const filtered = q ? partners.filter((p) => p.name.toLowerCase().includes(q)) : partners;

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const remove = (id: number) => onChange(value.filter((v) => v !== id));

  return (
    <div ref={wrapRef} className="relative">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-700/30 px-2.5 py-1 text-xs font-medium text-brand-700"
            >
              {p.name}
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`Remove ${p.name}`}
                className="text-brand-700/70 hover:text-brand-900"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQuery('');
        }}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-md bg-white text-left text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <span className="truncate text-gray-500">
          {selected.length > 0 ? 'Add another partner...' : 'Select partners...'}
        </span>
        <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-56 bg-white border border-gray-200 rounded-md shadow-lg">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search partners..."
            className="w-full border-b border-gray-200 px-3 py-2 text-xs focus:outline-none"
          />
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((p) => {
              const checked = value.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-xs hover:bg-gray-50 truncate ${
                      checked ? 'text-brand-700 font-medium' : 'text-gray-800'
                    }`}
                  >
                    <input type="checkbox" checked={checked} readOnly className="pointer-events-none" />
                    {p.name}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-400">
                {partners.length === 0 ? 'No partners available' : 'No matches'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function PeopleListEditor({
  people,
  onChange,
  addLabel,
}: {
  people: EventPersonForm[];
  onChange: (people: EventPersonForm[]) => void;
  addLabel: string;
}) {
  const update = (index: number, patch: Partial<EventPersonForm>) => {
    onChange(people.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const remove = (index: number) => {
    onChange(people.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...people, { ...EMPTY_EVENT_PERSON }]);
  };
  const smallField = 'w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="space-y-3">
      {people.map((person, index) => (
        <div
          key={index}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
        >
          <input
            type="text"
            value={person.name}
            onChange={(e) => update(index, { name: e.target.value })}
            onBlur={() => update(index, { name: toTitleCase(person.name) })}
            placeholder="Name"
            className={smallField}
          />
          <input
            type="email"
            value={person.email}
            onChange={(e) => update(index, { email: e.target.value })}
            placeholder="Email"
            className={smallField}
          />
          <input
            type="text"
            value={person.company}
            onChange={(e) => update(index, { company: e.target.value })}
            onBlur={() => update(index, { company: toTitleCase(person.company) })}
            placeholder="Company"
            className={smallField}
          />
          <input
            type="tel"
            value={person.phone}
            onChange={(e) => update(index, { phone: e.target.value })}
            placeholder="Phone"
            className={smallField}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label="Remove"
            className="flex items-center justify-center rounded-md border border-gray-300 px-2 py-1.5 text-gray-500 hover:text-red-600 hover:border-red-300"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs font-medium text-brand-700 hover:text-brand-800"
      >
        + {addLabel}
      </button>
    </div>
  );
}
