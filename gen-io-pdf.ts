import { writeFileSync } from 'node:fs';
import { generateInsertionOrderPdfBuffer } from '@/lib/insertion-order-pdf';
import type { InsertionOrder } from '@/lib/insertion-orders';

const sample: InsertionOrder = {
  id: 'io-sample-001',
  io_number: 'IO-2026-0142',
  agreement_id: 'sample-eblast-001',
  advertiser_id: 42,
  campaign_ids: [],
  channel: 'email',
  publication: 'austin',
  flight_start: '2026-07-28',
  flight_end: '2026-07-28',
  line_items: [
    { slot: 'standout-blast', description: 'Standout e-Blast — solo send', quantity: 1, rate_cents: 99, total_cents: 99, start_date: '2026-07-28', end_date: '2026-07-28' },
  ],
  total_cents: 99,
  status: 'sent',
  notes: 'Sample IO to verify header color.',
  sent_at: '2026-07-21T20:00:00Z',
  acknowledged_at: null,
  pdf_url: null,
  created_by: 'tawanna@myrealtyline.com',
  created_at: '2026-07-21T20:00:00Z',
  updated_at: '2026-07-21T20:00:00Z',
} as InsertionOrder;

(async () => {
  const buf = await generateInsertionOrderPdfBuffer({
    io: sample,
    advertiserName: 'Bluebonnet Realty Group',
    advertiserEmail: 'advertiser@example.com',
    advertiserPhone: '(512) 555-0142',
  });
  writeFileSync('/home/user/workspace/sample-insertion-order.pdf', Buffer.from(buf));
  console.log('WROTE /home/user/workspace/sample-insertion-order.pdf', Buffer.from(buf).length, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
