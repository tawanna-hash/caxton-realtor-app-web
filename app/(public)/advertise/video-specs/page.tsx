// app/(public)/advertise/video-specs/page.tsx
//
// Public, advertiser-facing video ad specifications. Mirrors the client
// spec sheet in docs/VIDEO_AD_SPECS.md. Placement list + file specs come
// from lib/media-kit.ts (APP_AD_SLOTS[].video, VIDEO_FILE_SPECS,
// EBLAST_VIDEO_SPECS) so every advertise page stays in sync.

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import TrackPageView from '@/components/analytics/TrackPageView';
import { VideoSpecsTables } from '@/components/ads/VideoSupport';
import { VideoSpecsActions } from '@/components/ads/VideoSpecsActions';

export const revalidate = 86400;

export const metadata = {
  title: 'Video Ad Specs — Realty News Now',
  description:
    'Video ad specifications for RealtyLine Austin and Newsline San Antonio: file requirements, video-ready placements, the e-Blast video option, creative guidelines, and Texas real estate disclosures.',
  alternates: { canonical: '/advertise/video-specs' },
};

const GUIDELINES: Array<[string, string]> = [
  ['Brand in the first 2 seconds.', 'Show your logo or name right away. Many viewers scroll within seconds.'],
  ['Design for sound off.', 'Burn in captions or on-screen text for every spoken line.'],
  ['Keep text large and inside the frame.', 'Leave a 5% margin on all sides. Keep headlines to about 7 words.'],
  ['One clear call to action.', 'For example "Tour Today," "See Move-In Ready Homes," or "Call Now." Hold it for the last 2–3 seconds.'],
  ['Make it loop.', 'When yours is the only ad in a placement, it repeats. A clean end frame that matches the opening looks best.'],
  ['No rapid flashing.', 'Don’t flash more than 3 times per second (accessibility standard).'],
  ['Use real footage.', 'Show the actual home or community. Label renderings "Artist rendering."'],
];

const DELIVERABLES: Array<[string, string]> = [
  ['Video file', 'Per the specs above, one file per placement size'],
  ['e-Blast banner (if booked)', '600×300 animated GIF or play-button image, plus your video link'],
  ['Click-through URL', 'Full https:// link to your landing page'],
  ['Description', 'One sentence describing the video, for screen readers'],
  ['Placement and publication', 'RealtyLine (Austin), Newsline (San Antonio), or both'],
  ['Flight dates', 'Start and end dates'],
];

export default function VideoSpecsPage() {
  return (
    <>
      <TrackPageView event="advertise_video_specs_page_viewed" />
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <header className="mb-8">
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
              Advertise · Video
            </p>
            <PageTitle size="md">Video ad specifications</PageTitle>
            <p className="text-base text-gray-700 font-light leading-relaxed mt-4">
              Video ads run on the Realty News Now website and app for RealtyLine (Austin) and
              Newsline (San Antonio). They autoplay muted, play only while on screen, and link to your
              landing page when tapped.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link href="/advertise/placements" className="text-brand-700 underline font-semibold">
                See where ads appear →
              </Link>
              <Link href="/advertise/inquire" className="text-gray-600 hover:text-gray-900">
                Questions? Talk to our team
              </Link>
            </div>
            <div className="mt-5">
              <VideoSpecsActions />
            </div>
          </header>

          <VideoSpecsTables />

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Creative guidelines</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
              {GUIDELINES.map(([t, d]) => (
                <li key={t}>
                  <strong className="text-gray-900">{t}</strong> {d}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">What to send</h2>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="What to send">
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-200">
                  {DELIVERABLES.map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row" className="w-48 px-3 py-2 text-left align-top font-medium text-gray-900">{k}</th>
                      <td className="px-3 py-2 align-top text-gray-700">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-gray-700">
              Send files at least 5 business days before your start date to{' '}
              <a href="mailto:tawanna@myrealtyline.com" className="text-brand-700 underline">tawanna@myrealtyline.com</a>.
              Large files can be shared by Google Drive, Dropbox, or WeTransfer link. We review every video
              before it goes live.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
