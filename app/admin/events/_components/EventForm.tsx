'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import type { PublicationId } from '@/lib/publications';

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
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const [data, setData] = useState<EventFormData>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!data.title.trim()) {
      setError('Title is required');
      return;
    }

    const payload = fieldsToPayload(data);

    setSubmitting(true);
    try {
      if (mode === 'create') {
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
    'w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a2a44]/20 focus:border-[#1a2a44]';
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1';
  const sectionClass = 'bg-white border border-gray-200 rounded-lg p-6';
  const sectionTitleClass = 'text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide';

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
              <option value="austin">RealtyLine (Austin)</option>
              <option value="san_antonio">Newsline SA</option>
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
            <label className={labelClass}>Start</label>
            <input
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
            <label className={labelClass}>Organizer</label>
            <input
              type="text"
              value={data.organizer}
              onChange={(e) => update('organizer', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Organizer Email</label>
            <input
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

      {/* Actions */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => router.push('/admin/events')}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2 bg-[#1a2a44] text-white text-sm font-medium rounded hover:bg-[#021D40] transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : mode === 'create' ? 'Create Event' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
