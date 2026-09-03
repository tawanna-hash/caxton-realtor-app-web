'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, UploadCloud, X } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { PUBLICATIONS, type PublicationId } from '@/lib/publications';

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
};

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hp, setHp] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const flyerInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
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

    const payload = fieldsToPayload(data);

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
        <h2 className="mt-2 text-2xl font-semibold text-gray-900">Thank you for sharing your event</h2>
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
              placeholder="https://..."
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Instructor Name</label>
            <input
              type="text"
              value={data.instructorName}
              onChange={(e) => update('instructorName', e.target.value)}
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
