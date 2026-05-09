// caxton-ads-v1
// Create-campaign route. Wraps CampaignForm in create mode.

import { CampaignForm } from '../../_components/CampaignForm';

export const dynamic = 'force-dynamic';

export default function NewCampaignPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">New campaign</h1>
        <p className="text-sm text-gray-700 mt-1">
          Schedule an advertiser into one of the 15 ad slots.
        </p>
      </div>
      <CampaignForm />
    </div>
  );
}
