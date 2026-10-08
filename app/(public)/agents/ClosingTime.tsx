'use client';

import ContractPage from './ContractPage';
import Link from 'next/link';
import ClosingTimeAssist from './ClosingTimeAssist';
import ClientPortalPanel from './ClientPortalPanel';
import SchedulersPanel from './SchedulersPanel';
import { dealPeople } from '@/lib/closing-time-people';
import { readKeepScroll, useKeepScroll } from '@/lib/keep-scroll';
import MessagesPanel from './MessagesPanel';
import HelpTips from './HelpTips';
import { GUIDES, Walkthrough, type Guide } from './SetupGuides';
import IntegrationsPanel from './IntegrationsPanel';
import AlertSetupContent from './AlertSetupContent';
import UtilitiesPanel from './UtilitiesPanel';
import DataBackupsPanel from './DataBackupsPanel';
import AutomationsPanel from './AutomationsPanel';
import SecurityPanel from './SecurityPanel';
import TestimonialRequest from './TestimonialRequest';
import DocumentToolsPanel from './DocumentToolsPanel';
import TestimonialHubClient from '@/app/(public)/testimonial-hub/TestimonialHubClient';
import { ReferralNetworkPanel, WorkFasterPanel, type ReferralProvider } from './AgentToolsPanels';

const DEAL_TABS: { id: string; label: string; keys: string[] }[] = [
  { id: 'd-overview', label: 'Snapshot', keys: [] },
  { id: 'd-documents', label: 'Documents', keys: [] },
  { id: 'd-people', label: 'People', keys: [] },
  { id: 'd-portal', label: 'Client Portal', keys: [] },
  { id: 'd-messages', label: 'Messages', keys: [] },
  { id: 'd-schedule', label: 'Scheduling', keys: [] },
  { id: 'transaction', label: 'Contract', keys: ['current', 'trec-forms'] },
  { id: 'tasks', label: 'Tasks and Reminders', keys: ['tasks'] },
  { id: 'readiness', label: 'Readiness Check', keys: ['readiness'] },
  { id: 'audit', label: 'Audit Trail', keys: ['audit'] },
];
const TOOL_VIEWS: { id: string; label: string; keys: string[] }[] = [
  { id: 'overview', label: 'Snapshot', keys: [] },
  { id: 'forms', label: 'Forms Library', keys: ['trec-library'] },
  { id: 'tools', label: 'Calculators', keys: [] },
  { id: 'referral', label: 'Referral Network', keys: [] },
  { id: 'my-schedule', label: 'My Scheduling', keys: [] },
  { id: 'integrations', label: 'Integrations', keys: ['calendar'] },
  { id: 'setup-help', label: 'Set Up Instructions', keys: [] },
];
const CALC_VIEWS: { id: string; label: string; keys: string[] }[] = [
  { id: 'calc-net-sheet', label: 'Seller Net Sheet', keys: [] },
  { id: 'calc-commission', label: 'Commission Calculator', keys: [] },
  { id: 'calc-cash', label: 'Cash-To-Close', keys: [] },
];
const PERSONAL_DEAL = { id: '__personal__', title: 'Personal', propertyAddress: '', clientContacts: [], serviceProviders: [] } as unknown as AgentDeal;
const DEALS_VIEW = { id: 'deals', label: 'Deals', keys: [] as string[] };
const ALERT_SETUP_VIEW = { id: 'alert-setup', label: 'Alert Setup', keys: [] as string[] };
const CLOSINGS_VIEW = { id: 'closings', label: 'Closings', keys: [] as string[] };
const CONTACTS_VIEW = { id: 'contacts', label: 'Contacts', keys: [] as string[] };
const SETTINGS_VIEW = { id: 'coordinator', label: 'Settings', keys: ['assist', 'alerts', 'calendar-link', 'agent-details', 'mls'] };
const UTILITIES_VIEW = { id: 'utilities', label: 'Utilities', keys: [] as string[] };
const DATA_VIEW = { id: 'data-backups', label: 'Data And Backups', keys: [] as string[] };
const TESTIMONIALS_VIEW = { id: 'testimonials', label: 'Testimonials Hub', keys: [] as string[] };
const DOCTOOLS_VIEW = { id: 'doc-tools', label: 'Document Tools', keys: [] as string[] };
const SECURITY_VIEW = { id: 'security', label: 'Security', keys: [] as string[] };
const AUTOMATIONS_VIEW = { id: 'automations', label: 'Automations', keys: [] as string[] };
const DESK_VIEWS = [...DEAL_TABS, ...TOOL_VIEWS, ...CALC_VIEWS, SETTINGS_VIEW, UTILITIES_VIEW, DATA_VIEW, TESTIMONIALS_VIEW, AUTOMATIONS_VIEW, SECURITY_VIEW, DOCTOOLS_VIEW, DEALS_VIEW, ALERT_SETUP_VIEW, CLOSINGS_VIEW, CONTACTS_VIEW];
const NAV_ICONS: Record<string, LucideIcon> = { overview: LayoutDashboard, alerts: Bell, forms: FileText, tools: Calculator, referral: Handshake, integrations: Plug, 'my-schedule': CalendarClock, 'setup-help': ListChecks };
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calculator,
  Handshake,
  LayoutDashboard,
  Plug,
  type LucideIcon,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  BookOpen,
  ListChecks,
  Settings as SettingsIcon,
  LogOut as LogOutIcon,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  FileUp,
  FolderDown,
  ListTodo,
  Landmark,
  Users,
  Link2,
  LoaderCircle,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Smartphone,
  Trash2,
  X,
  CalendarClock,
} from 'lucide-react';
import PushOptInButton from '@/components/PushOptInButton';
import TrecPdfPagePreview from './TrecPdfPagePreview';
import dynamic from 'next/dynamic';
import TrecFormsLibrary from './TrecFormsLibrary';
import CustomFormsPanel from './CustomFormsPanel';
import MlsConnectionsCard from './MlsConnectionsCard';
const SellerNetSheetClient = dynamic(() => import('../resources/seller-net-sheet/SellerNetSheetClient'), { ssr: false });
const CommissionCalculatorClient = dynamic(() => import('../resources/commission-calculator/CommissionCalculatorClient'), { ssr: false });
const BuyerClosingCostsClient = dynamic(() => import('../resources/buyer-closing-costs/BuyerClosingCostsClient'), { ssr: false });
import { effectiveAgentSide } from './purchase-documents';
import DealSubpage, { TASK_TEMPLATES } from './DealSubpage';
import DocumentRequestsCard from './DocumentRequestsCard';
import DealPaymentWindow from './DealPaymentWindow';
import { EXTENSION_DAYS, autoCloseState } from '@/lib/closing-time-lifecycle';
import { syncStoredFromForm } from './ContractPage';
import { autofillDeal, buildAutofillIndex } from '@/lib/deal-autofill';
import { AGENT_DESK_TEMPLATE, templateTaskIdsFor } from '@/lib/agent-desk-template';
import {
  buildClosingTimeIcs,
  calendarEventsForActiveDeals,
  calendarEventsForDeal,
  type ClosingTimeCalendarEvent,
} from '@/lib/closing-time-calendar';
import CollapseToggle, { useCollapsibles } from './CollapseToggle';
import { trackEvent } from '@/app/posthog-provider';
import {
  agentCommandCenterWorkspaceSchema,
  agentDealSchema,
  defaultAgentContractDetails,
  defaultAgentNotificationPreferences,
  type AgentContractDetails,
  type AgentCommandCenterWorkspace,
  type AgentDeal,
  type AgentDeadlineNotificationOffset,
  type AgentNotificationPreferences,
  type AgentReminder,
  type AgentTask,
  type AgentDocument,
  type AgentActivity,
} from '@/lib/agent-command-center-workspace';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import {
  buildTrecValidation,
  TREC_DEAL_WORKFLOW_STATUS_LABELS,
  TREC_DEAL_WORKFLOW_STATUSES,
  TREC_TASK_PRIORITIES,
  TREC_TASK_STATUSES,
  type TrecTaskPriority,
  type TrecTaskStatus,
} from '@/lib/trec-workflow';
import Tip from './Tip';

type RadarItem = {
  id: string;
  dealId: string;
  dealTitle: string;
  label: string;
  date: string;
  kind: 'deadline' | 'reminder' | 'task';
  overdue: boolean;
};

type ReadinessDocumentTemplate = {
  id: string;
  label: string;
  description: string;
};

type ReadinessDocumentGroup = {
  id: string;
  label: string;
  items: readonly ReadinessDocumentTemplate[];
};

const DOCUMENT_GROUPS: readonly ReadinessDocumentGroup[] = [
  {
    id: 'buyer',
    label: 'Buyer Documentation',
    items: [
      {
        id: 'buyer-iabs',
        label: 'Information About Brokerage Services (IABS)',
        description: 'Mandatory TREC informational form outlining representation pathways.',
      },
      {
        id: 'buyer-wire-fraud-alert',
        label: 'Wire Fraud Alert Or Notice (TXR 2517)',
        description: 'Wire fraud warning delivered to and acknowledged by the client.',
      },
      {
        id: 'buyer-sales-disclosure-tx',
        label: 'Sales Disclosure - TX',
        description: 'Texas sales disclosure for the transaction file.',
      },
      {
        id: 'buyer-affiliated-business',
        label: 'Affiliated Business Arrangement Disclosure',
        description: 'Disclosure of any affiliated business relationships.',
      },
      {
        id: 'buyer-representation-agreement',
        label: 'Buyer Representation Agreement',
        description: 'Formal contract between the buyer and their brokerage.',
      },
      {
        id: 'buyer-pre-approval-letter',
        label: 'Pre-Approval Letter',
        description: 'Initial verification from a lender showing purchasing power.',
      },
      {
        id: 'delivery-confirmation',
        label: 'Earnest Money & Option Fee Receipts',
        description: 'Title and escrow validation of contract security deposits.',
      },
      {
        id: 'buyer-property-inspection-report',
        label: 'Property Inspection Report',
        description: 'Visual inspection of structure and systems by a licensed Texas inspector.',
      },
      {
        id: 'buyer-wdi-report',
        label: 'Wood-Destroying Insect Report',
        description: 'Required for VA and FHA loans; confirms no wood-destroying insect damage.',
      },
      {
        id: 'buyer-repair-request-addendum',
        label: 'Repair Request Or Inspection Addendum',
        description: 'Repairs requested after the inspection and the signed amendment that follows.',
      },
      {
        id: 'buyer-homeowners-insurance',
        label: 'Homeowners Insurance Proof',
        description: 'Binder or declarations page the lender and title company require before closing.',
      },
      {
        id: 'buyer-home-warranty',
        label: 'Home Warranty Contract',
        description: 'Ordered warranty plan and receipt, when one applies.',
      },
      {
        id: 'buyer-walkthrough',
        label: "Buyer's Walk-Through, Confirmation, And Acceptance",
        description: 'Signed confirmation of the final walk-through.',
      },
    ],
  },
  {
    id: 'seller',
    label: 'Seller Documentation',
    items: [
      {
        id: 'seller-listing-agreement',
        label: 'Listing Agreement',
        description: 'Formal contract between the seller and the listing brokerage.',
      },
      {
        id: 'executed-contract',
        label: 'TREC One To Four Family Residential Contract',
        description: 'The standard promulgated purchase agreement.',
      },
      {
        id: 'seller-disclosure',
        label: "Seller's Disclosure Notice",
        description: 'Legally required property condition disclosure.',
      },
      {
        id: 'survey',
        label: 'Property Survey & T-47 Residential Real Property Affidavit',
        description: 'Document showing property boundaries along with a notarized declaration of any changes.',
      },
      {
        id: 'seller-hoa-subdivision-information',
        label: 'HOA Subdivision Information & Addendum',
        description: 'Disclosure of rules, fees, and resale certificates for planned communities.',
      },
      {
        id: 'seller-hoa-estoppel',
        label: 'HOA Estoppel Or Resale Certificate',
        description: 'Payoff and status letter from the association, when the property is in an HOA.',
      },
      {
        id: 'seller-tax-record',
        label: 'Tax Record',
        description: 'County tax record for the property.',
      },
      {
        id: 'seller-mls-printout',
        label: 'MLS Printout (Option/Pending Status)',
        description: 'MLS record showing the option or pending status.',
      },
      {
        id: 'listing-mls-active',
        label: "MLS Printout Showing Active Status",
        description: "MLS record showing the listing as active (listing deals only).",
      },
      {
        id: 'listing-consumer-protection-notice',
        label: "Consumer Protection Notice Displayed",
        description: "Notice displayed in the office, on the website and on social profiles (listing deals only).",
      },
      {
        id: 'listing-t47',
        label: "T-47 Residential Real Property Affidavit",
        description: "Notarized affidavit; not needed with a new survey (listing deals only).",
      },
      {
        id: 'seller-general-warranty-deed',
        label: 'General Warranty Deed',
        description: 'Legal instrument executed at closing to transfer title securely.',
      },
    ],
  },
  {
    id: 'lender',
    label: 'Lender Documentation',
    items: [
      {
        id: 'lender-loan-estimate',
        label: 'Loan Estimate (LE)',
        description: 'Three-page form outlining estimated loan terms, features, and closing costs.',
      },
      {
        id: 'lender-closing-disclosure',
        label: 'Closing Disclosure (CD)',
        description: 'Final itemized breakdown of closing fees delivered at least three days before closing.',
      },
      {
        id: 'lender-deed-of-trust',
        label: 'Deed of Trust',
        description: 'The security instrument securing the mortgage loan against the real estate.',
      },
      {
        id: 'lender-promissory-note',
        label: 'Promissory Note',
        description: "The borrower's binding legal promise to repay the loan.",
      },
      {
        id: 'lender-loan-approval',
        label: 'Loan Approval Or Clear To Close',
        description: 'Lender approval letter or clear-to-close notice.',
      },
    ],
  },
  {
    id: 'title',
    label: 'Title And Closing Coordination',
    items: [
      {
        id: 'title-contact-information-sheets',
        label: 'Contact Information Sheets',
        description: 'Contact details for every party, sent to the title company and the other side.',
      },
      {
        id: 'title-agent-information-sheet',
        label: 'Agent Information Sheet For Title',
        description: 'Your agent and brokerage details for the title company.',
      },
      {
        id: 'title-commitment',
        label: 'Title Commitment',
        description: 'Title commitment and insurance policy information from the title company.',
      },
      {
        id: 'title-executed-contract-receipt',
        label: 'Executed Contract Receipted By Title Co.',
        description: 'Title company receipt for the executed contract.',
      },
      {
        id: 'title-commission-intake',
        label: 'Commission Intake Form',
        description: 'Commission intake paperwork for the brokerage.',
      },
      {
        id: 'listing-commission-disbursement',
        label: "Commission Disbursement Authorization",
        description: "Signed authorization for the commission payout (listing deals only).",
      },
    ],
  },
  {
    id: 'valuation-audit',
    label: 'Valuation, Sponsorship & Audit',
    items: [
      {
        id: 'valuation-cma-appraisal-bpo',
        label: 'CMA, Appraisal, Or BPO',
        description: 'Comparative market analysis, lender appraisal, or broker price opinion supporting valuation.',
      },
      {
        id: 'agent-sponsorship-agreement',
        label: 'Agent Sponsorship Agreement',
        description: 'Sponsoring broker agreement covering the agent for this deal.',
      },
      {
        id: 'financial-receipts-disbursements-log',
        label: 'Financial Receipts & Disbursements Log',
        description: 'Trust account receipts and disbursements tied to this deal.',
      },
      {
        id: 'substantive-communications-log',
        label: 'Substantive Communications Log',
        description: 'Emails and texts material to offers, negotiations, or disclosures for this deal.',
      },
    ],
  },
] as const;

// Which readiness items apply depends on whether the agent represents the buyer or the seller.
const SIDE_HIDDEN_ITEMS: Record<'buyer' | 'listing', ReadonlySet<string>> = {
  buyer: new Set(['seller-listing-agreement', 'seller-general-warranty-deed', 'listing-mls-active', 'listing-consumer-protection-notice', 'listing-t47', 'listing-commission-disbursement']),
  listing: new Set(['buyer-representation-agreement']),
};
const sideKey = (side?: string): 'buyer' | 'listing' => (side === 'listing' ? 'listing' : 'buyer');
function readinessGroupsForSide(side?: string): ReadinessDocumentGroup[] {
  const hidden = SIDE_HIDDEN_ITEMS[sideKey(side)];
  const groups = DOCUMENT_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !hidden.has(item.id)) }))
    .map((group) => (sideKey(side) === 'listing' && group.id === 'buyer' ? { ...group, label: 'Buyer And Offer Documentation' } : group));
  if (sideKey(side) !== 'listing') return groups;
  const order = ['seller', 'buyer', 'lender', 'title', 'valuation-audit'];
  return [...groups].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
const isReadinessItemHidden = (id: string, side?: string) => SIDE_HIDDEN_ITEMS[sideKey(side)].has(id);

const DOCUMENT_TEMPLATES = DOCUMENT_GROUPS.flatMap((group) => group.items);
const DOCUMENT_TEMPLATE_IDS = new Set<string>(DOCUMENT_TEMPLATES.map((item) => item.id));
// 2026-09-16: added Valuation, Sponsorship & Audit checklist group. Deals created before this
// cutover never gained those items as incomplete requirements -- see mergeReadinessDocuments.
const VALUATION_AUDIT_GROUP_CUTOVER_AT = '2026-09-16T00:00:00.000Z';
const VALUATION_AUDIT_ITEM_IDS = new Set<string>(
  DOCUMENT_GROUPS.find((group) => group.id === 'valuation-audit')?.items.map((item) => item.id) ?? [],
);

// One-time: the Buyer's Agent and Seller's Agent sections show every field on the contract's Broker Contact
// Information page (firm, address, license, associate, team, email, phone, supervisor), with the form's own labels,
// so an uploaded contract fills all of them. Custom broker fields that already hold a value are left alone.
function restoreBrokerSections(deal: AgentDeal): AgentDeal {
  const addresses = deal.contractAddresses ?? {};
  if (addresses['migrated.brokerFields'] === '1') return deal;
  const isBrokerField = (id: string) => /^p11_f2(0[1-9]|1\d|2[0-2])$/.test(id);
  const brokerSections = new Set(['buyer-broker', 'seller-broker']);
  const keep = (deal.contractCustomFields ?? []).filter((field) => !brokerSections.has(field.section) || (field.value ?? '').trim() !== '');
  const order: Record<string, string[]> = Object.fromEntries(Object.entries(deal.contractFieldOrder ?? {}).map(([key, list]) => [key, [...list]]));
  for (const key of brokerSections) delete order[key];
  return {
    ...deal,
    contractCustomFields: keep,
    contractFieldOrder: order,
    contractHiddenFields: (deal.contractHiddenFields ?? []).filter((id) => !isBrokerField(id)),
    contractFieldLabels: Object.fromEntries(Object.entries(deal.contractFieldLabels ?? {}).filter(([id]) => !isBrokerField(id))),
    contractAddresses: { ...addresses, 'migrated.brokerFields': '1' },
  };
}

// One-time: Property Description starts with the contract's own Section 2.A fields in form order
// (Lot, Block, Addition, City, County, Property Address), followed by the lookup fields.
function restorePropertyFormOrder(deal: AgentDeal): AgentDeal {
  const addresses = deal.contractAddresses ?? {};
  if (addresses['migrated.propertyForm'] === '1') return deal;
  const order: Record<string, string[]> = Object.fromEntries(Object.entries(deal.contractFieldOrder ?? {}).map(([key, list]) => [key, [...list]]));
  delete order.property;
  return {
    ...deal,
    contractFieldOrder: order,
    contractHiddenFields: (deal.contractHiddenFields ?? []).filter((id) => id !== 'p01_f006'),
    contractAddresses: { ...addresses, 'migrated.propertyForm': '1' },
  };
}

// Readiness Check items that mirror a checklist item on the Documents tab. Ticking one ticks the other.
const READINESS_CHECK_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['buyer-iabs', 'pd-iabs'],
  ['buyer-representation-agreement', 'pd-buyer-rep-agreement'],
  ['buyer-pre-approval-letter', 'pd-preapproval-pof'],
  ['delivery-confirmation', 'pd-em-option-receipt'],
  ['executed-contract', 'pd-residential-contract'],
  ['seller-disclosure', 'pd-sellers-disclosure-notice'],
  ['survey', 'pd-existing-survey-t47'],
  ['valuation-cma-appraisal-bpo', 'pd-cma'],
  ['lender-closing-disclosure', 'pd-closing-statement'],
  ['buyer-wire-fraud-alert', 'pd-wire-fraud-alert'],
  ['buyer-sales-disclosure-tx', 'pd-sales-disclosure-tx'],
  ['buyer-affiliated-business', 'pd-affiliated-business'],
  ['buyer-walkthrough', 'pd-walkthrough'],
  ['seller-tax-record', 'pd-tax-record'],
  ['seller-mls-printout', 'pd-mls-printout'],
  ['title-executed-contract-receipt', 'pd-executed-contract-receipt'],
  ['title-commission-intake', 'pd-commission-intake'],
];
const LISTING_CHECK_IDS: Readonly<Record<string, string>> = {
  'buyer-wire-fraud-alert': 'ld-wire-fraud-alert',
  'buyer-walkthrough': 'ld-final-walkthrough',
  'seller-mls-printout': 'ld-mls-pending',
  'delivery-confirmation': 'ld-em-receipt',
  survey: 'ld-survey',
};
const LISTING_ONLY_LINKS: ReadonlyArray<readonly [string, string]> = [
  ['seller-listing-agreement', 'ld-listing-agreement'],
  ['listing-mls-active', 'ld-mls-active'],
  ['listing-consumer-protection-notice', 'ld-consumer-protection-notice'],
  ['listing-t47', 'ld-t47'],
  ['listing-commission-disbursement', 'ld-commission-disbursement'],
];
// Buyer-only readiness items have no listing-side checklist item.
const BUYER_ONLY_READINESS = new Set(['buyer-representation-agreement', 'buyer-pre-approval-letter']);
const readinessLinksFor = (deal: AgentDeal): ReadonlyArray<readonly [string, string]> => {
  if (effectiveAgentSide(deal) !== 'listing') return READINESS_CHECK_LINKS;
  const shared = READINESS_CHECK_LINKS.filter(([r]) => !BUYER_ONLY_READINESS.has(r)).map(([r, c]) => [r, LISTING_CHECK_IDS[r] ?? c] as const);
  return [...shared, ...LISTING_ONLY_LINKS];
};
const receivedDoc = (document: AgentDocument, now: string): AgentDocument => ({ ...document, status: document.status === 'reviewed' ? 'reviewed' : 'received', complete: true, updatedAt: now });
const reopenedDoc = (document: AgentDocument, now: string): AgentDocument => ({ ...document, status: 'requested', complete: false, updatedAt: now });

/** On load: anything done in either place is done in both, so no progress is lost. */
function reconcileLinkedChecks(deal: AgentDeal): AgentDeal {
  const checks = { ...deal.documentChecks };
  const now = new Date().toISOString();
  let documents = deal.documents;
  let changed = false;
  for (const [readinessId, checkId] of readinessLinksFor(deal)) {
    const document = documents.find((entry) => entry.id === readinessId);
    if (!document) continue;
    if (checks[checkId] && !document.complete) { documents = documents.map((entry) => (entry.id === readinessId ? receivedDoc(entry, now) : entry)); changed = true; }
    else if (document.complete && !checks[checkId]) { checks[checkId] = true; changed = true; }
  }
  return changed ? { ...deal, documents, documentChecks: checks } : deal;
}

/** After an edit: a change made on one side is copied to the linked item on the other. */
function syncLinkedChecks(previous: AgentDeal | undefined, next: AgentDeal): AgentDeal {
  if (!previous || (previous.documents === next.documents && previous.documentChecks === next.documentChecks)) return next;
  const checks = { ...next.documentChecks };
  const now = new Date().toISOString();
  let documents = next.documents;
  let changed = false;
  for (const [readinessId, checkId] of readinessLinksFor(next)) {
    const before = previous.documents.find((entry) => entry.id === readinessId);
    const after = documents.find((entry) => entry.id === readinessId);
    if (!after) continue;
    const checkChanged = Boolean(previous.documentChecks[checkId]) !== Boolean(checks[checkId]);
    const docChanged = Boolean(before?.complete) !== Boolean(after.complete);
    if (checkChanged && Boolean(checks[checkId]) !== after.complete) {
      documents = documents.map((entry) => (entry.id === readinessId ? (checks[checkId] ? receivedDoc(entry, now) : reopenedDoc(entry, now)) : entry));
      changed = true;
    } else if (docChanged && Boolean(checks[checkId]) !== after.complete) {
      if (after.complete) checks[checkId] = true; else delete checks[checkId];
      changed = true;
    }
  }
  return changed ? { ...next, documents, documentChecks: checks } : next;
}

function mergeReadinessDocuments(deal: AgentDeal): AgentDeal {
  const existingDocuments = new Map(deal.documents.map((document) => [document.id, document]));
  const requestedAt = deal.createdAt || new Date().toISOString();
  const isLegacyDeal = Boolean(deal.createdAt) && deal.createdAt < VALUATION_AUDIT_GROUP_CUTOVER_AT;
  const templates = isLegacyDeal
    ? DOCUMENT_TEMPLATES.filter((template) => !VALUATION_AUDIT_ITEM_IDS.has(template.id))
    : DOCUMENT_TEMPLATES;
  const readinessDocuments: AgentDocument[] = templates.map((template) => {
    const existing = existingDocuments.get(template.id);
    return existing
      ? { ...existing, label: template.label }
      : {
          id: template.id,
          label: template.label,
          status: 'requested',
          complete: false,
          requestedAt,
          updatedAt: requestedAt,
          driveFileId: '',
          fileName: '',
          fileUploadedAt: '',
        };
  });
  const additionalDocuments = deal.documents.filter((document) => !DOCUMENT_TEMPLATE_IDS.has(document.id));
  return { ...deal, documents: [...readinessDocuments, ...additionalDocuments] };
}

// Items in on the Readiness Check, for the side this deal is on: received, reviewed or not needed.
function readinessCounts(deal: AgentDeal): { done: number; total: number; groups: { label: string; done: number; total: number }[] } {
  const groups = readinessGroupsForSide(effectiveAgentSide(deal)).map((group) => {
    const rows = group.items
      .map((item) => deal.documents.find((document) => document.id === item.id))
      .filter((document): document is AgentDocument => Boolean(document));
    return { label: group.label, done: rows.filter((document) => document.complete || document.status === 'not_needed').length, total: rows.length };
  });
  return { done: groups.reduce((n, g) => n + g.done, 0), total: groups.reduce((n, g) => n + g.total, 0), groups };
}

function ReadinessChecklist({
  headingTag = 'h3',
  side,
  documents,
  documentName,
  setDocumentName,
  addDocument,
  updateDocument,
  reviewAlerts,
  uploadDocumentFile,
  removeDocumentFile,
  documentUploadBusyId,
  documentUploadError,
}: {
  headingTag?: 'h2' | 'h3';
  side?: string;
  documents: AgentDocument[];
  documentName: string;
  setDocumentName: (value: string) => void;
  addDocument: () => void;
  updateDocument: (documentId: string, status: AgentDocument['status']) => void;
  reviewAlerts: string[];
  uploadDocumentFile: (documentId: string, file: File | undefined) => void;
  removeDocumentFile: (documentId: string) => void;
  documentUploadBusyId: string | null;
  documentUploadError: string;
}) {
  const additionalDocuments = documents.filter((document) => !DOCUMENT_TEMPLATE_IDS.has(document.id));
  const groups = readinessGroupsForSide(side).map((group) => ({
    id: group.id,
    label: group.label,
    rows: group.items
      .map((item) => ({ description: item.description as string | undefined, document: documents.find((document) => document.id === item.id) }))
      .filter((entry): entry is { description: string | undefined; document: AgentDocument } => Boolean(entry.document)),
  }));
  if (additionalDocuments.length) groups.push({ id: 'additional', label: 'Additional Documentation', rows: additionalDocuments.map((document) => ({ description: undefined, document })) });
  const isDone = (document: AgentDocument) => document.complete || document.status === 'not_needed';
  const totalCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const doneCount = groups.reduce((sum, group) => sum + group.rows.filter(({ document }) => isDone(document)).length, 0);
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const [groupId, setGroupId] = useState<string>('');
  const activeGroup = groups.find((group) => group.id === groupId) ?? groups[0];
  // Astro status colors: amber requested, green received or reviewed, gray not needed.
  const dotColor = (status: AgentDocument['status']) => (status === 'received' || status === 'reviewed' ? '#00E200' : status === 'not_needed' ? '#B9B6C4' : '#FFAF3D');

  const renderDocument = (document: AgentDocument, description?: string) => {
    const hasFile = Boolean(document.driveFileId);
    const isUploading = documentUploadBusyId === document.id;
    const done = isDone(document);
    return (
      <div key={document.id} className="grid min-w-0 gap-3 border-t border-[#E6E5EC] px-4 py-3 first:border-t-0 hover:bg-[#F6F3FB] sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <span className="hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block" style={{ backgroundColor: dotColor(document.status) }} aria-hidden="true" />
        <div className="min-w-0">
          <p className={`text-sm font-semibold leading-5 ${done ? 'text-[#7A7787]' : 'text-[#1B1726]'}`}>{document.label}</p>
          {description ? <p className="mt-0.5 text-[13px] leading-5 text-[#7A7787]">{description}</p> : null}
          {hasFile ? (
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 truncate rounded-md bg-[#E0FBE0] px-2 py-0.5 text-xs font-medium text-[#005A00]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{document.fileName || 'File Attached'}</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 text-[13px] font-medium text-[#301D5D] hover:bg-[#EFEAF8]">
            {isUploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileUp className="h-3.5 w-3.5" aria-hidden="true" />}
            {isUploading ? 'Uploading…' : hasFile ? 'Replace' : 'Attach'}
            <input
              type="file"
              className="hidden"
              disabled={isUploading}
              onChange={(event) => { void uploadDocumentFile(document.id, event.target.files?.[0]); event.target.value = ''; }}
              aria-label={`Attach file for ${document.label}`}
            />
          </label>
          {hasFile ? (
            <button type="button" onClick={() => removeDocumentFile(document.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#7A7787] hover:!bg-[#EFEAF8] hover:!text-[#661102]" aria-label={`Remove attached file from ${document.label}`}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
          <select
            value={document.status}
            onChange={(event) => updateDocument(document.id, event.target.value as AgentDocument['status'])}
            aria-label={`Status for ${document.label}`}
            className="h-9 rounded-md border border-[#E6E5EC] bg-white px-2 text-[13px] font-medium text-[#4A4757] outline-none focus:border-[#301D5D]"
          >
            <option value="requested">Requested</option>
            <option value="received">Received</option>
            <option value="reviewed">Reviewed</option>
            <option value="not_needed">Not Needed</option>
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="ds-page min-w-0 max-w-full" data-testid="readiness-check" data-section-key="readiness">
      <div className="rounded-2xl border border-[#E6E5EC] bg-white">
        <div className="px-[1.125rem] py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#7A7787]">Readiness Check</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#1B1726]">Deal Readiness Checklist</h3>
            <span className="text-[13px] text-[#4A4757]">{doneCount} Of {totalCount} Items In</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#EFEAF8]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness progress">
            <div className="h-full rounded-full bg-[#301D5D]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div role="tablist" aria-label="Readiness Groups" className="flex items-end gap-1 overflow-x-auto border-b border-[#E6E5EC] px-[1.125rem]">
          {groups.map((group) => {
            const done = group.rows.filter(({ document }) => isDone(document)).length;
            const selected = activeGroup?.id === group.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setGroupId(group.id)}
                className={`!-mb-px !flex-none !whitespace-nowrap !rounded-b-none !rounded-t-lg !border !border-b-0 !px-4 !py-2.5 ${selected ? '!border-[#E6E5EC] !border-t-2 !border-t-[#301D5D] !bg-white !font-semibold !text-[#301D5D]' : '!border-transparent !bg-[#F6F3FB] !font-medium !text-[#4A4757] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]'}`}
              >
                {group.label}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${done === group.rows.length && group.rows.length > 0 ? 'bg-[#E0FBE0] text-[#005A00]' : 'bg-[#EFEAF8] text-[#301D5D]'}`}>{done}/{group.rows.length}</span>
              </button>
            );
          })}
        </div>

        <div role="tabpanel">{activeGroup?.rows.map(({ document, description }) => renderDocument(document, description))}</div>
      </div>

      {documentUploadError ? (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-[#FF2A04] bg-[#FFEAE6] px-3 py-2 text-xs font-semibold text-[#661102]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {documentUploadError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={documentName}
          onChange={(event) => setDocumentName(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-[#E6E5EC] bg-[#F6F3FB] px-3 text-sm outline-none focus:border-[#301D5D]"
          placeholder="Custom Document Request"
        />
        <button type="button" onClick={addDocument} disabled={!documentName.trim()} className="h-10 rounded-md border border-[#E6E5EC] bg-white px-4 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-40">
          Request
        </button>
      </div>

      <div className="mt-3 rounded-2xl border border-[#E6E5EC] bg-white px-[1.125rem] py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#7A7787]">Operational Review Alerts</p>
        {reviewAlerts.length ? (
          <ul className="mt-2 space-y-2">
            {reviewAlerts.slice(0, 4).map((alert) => (
              <li key={alert} className="flex min-w-0 gap-2 break-words text-sm leading-5 text-[#4A4757]">
                <AlertTriangle className="rnn-inline-icon text-[#661102]" aria-hidden="true" />
                {alert}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-[#005A00]">
            <CheckCircle2 className="rnn-inline-icon" aria-hidden="true" />
            No worksheet alerts for your active deals.
          </p>
        )}
      </div>
    </div>
  );
}

const CONTRACT_DETAIL_FIELDS: ReadonlyArray<{
  key: keyof AgentContractDetails;
  label: string;
  multiline?: boolean;
}> = [
  { key: 'county', label: 'County' },
  { key: 'legalDescription', label: 'Legal Description', multiline: true },
  { key: 'improvementsAndAccessories', label: 'Improvements and Accessories', multiline: true },
  { key: 'exclusions', label: 'Exclusions', multiline: true },
  { key: 'cashPortion', label: 'Cash Portion' },
  { key: 'loanAmount', label: 'Loan Amount' },
  { key: 'salesPrice', label: 'Sales Price' },
  { key: 'financingType', label: 'Financing Type' },
  { key: 'financingNotes', label: 'Financing Notes', multiline: true },
  { key: 'earnestMoney', label: 'Earnest Money' },
  { key: 'titleCompany', label: 'Title company / escrow holder' },
  { key: 'optionFee', label: 'Option Fee' },
  { key: 'additionalEarnestMoney', label: 'Additional Earnest Money' },
  { key: 'titlePolicyPayer', label: 'Title Policy Payer' },
  { key: 'surveyPlan', label: 'Survey Plan', multiline: true },
  { key: 'titleAndSurveyNotes', label: 'Title and Survey Notes', multiline: true },
  { key: 'conditionAndRepairNotes', label: 'Condition and Repair Notes', multiline: true },
  { key: 'possessionPlan', label: 'Possession Plan', multiline: true },
  { key: 'specialProvisionsNotes', label: 'Special Provisions Notes', multiline: true },
  { key: 'settlementNotes', label: 'Settlement and Expense Notes', multiline: true },
  { key: 'notices', label: 'Notices', multiline: true },
];

const CALCULATED_TIMELINE_FIELDS: ReadonlyArray<{
  key: 'optionPeriodDays';
  deadlineId: string;
  label: string;
  rule: string;
}> = [
  {
    key: 'optionPeriodDays',
    deadlineId: 'option-period-ends',
    label: 'Option / Inspection Period',
    rule: 'Negotiated period after the effective date; notice is due by 5:00 p.m. local property time on the final day.',
  },
];

function getId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function chicagoToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysUntilClosing(closingDate: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) return null;
  const closingTime = Date.parse(`${closingDate}T12:00:00Z`);
  const todayTime = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(closingTime) || !Number.isFinite(todayTime)) return null;
  return Math.round((closingTime - todayTime) / 86_400_000);
}

function closingCountdownLabel(closingDate: string, today: string): string {
  const days = daysUntilClosing(closingDate, today);
  if (days === null) return 'Closing date not set';
  if (days === 0) return 'Closing today';
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} past closing`;
  return `${days} day${days === 1 ? '' : 's'} until closing`;
}

function sentenceCaseKey(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function buyerLastNames(value: string): string {
  return Array.from(new Set(
    value
      .split(/\s+(?:and|&)\s+|[,;]/i)
      .map((name) => name.trim().split(/\s+/).at(-1) ?? '')
      .filter(Boolean),
  )).join(' / ');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function newDeal(trecFormVersionId: string): AgentDeal {
  const now = new Date().toISOString();
  return {
    id: getId('deal'),
    title: 'New Contract',
    propertyAddress: '',
    buyerNames: '',
    sellerNames: '',
    effectiveDate: '',
    optionPeriodDays: '',
    additionalEarnestMoneyDays: '',
    financingDeadlineDays: '',
    appraisalDeadlineDays: '',
    titleCommitmentDays: '',
    surveyDays: '',
    titleObjectionDays: '',
    earnestMoneyDeliveredDate: '',
    optionFeeDeliveredDate: '',
    closingDate: '',
    status: 'prep',
    owner: '',
    workflowStatus: 'intake',
    worksheetStep: 0,
    trecFormVersionId,
    closeoutOutcome: '',
    closeoutDate: '',
    closeoutNote: '',
    auditLocked: false,
    dealType: 'purchase',
    agentSide: '',
    isTemplate: false,
    ignoredBlankAlerts: [],
    buyerRepForm: '',
    contractForm: '20',
    yearBuilt: '',
    hasHoa: false,
    documentChecks: {},
    serviceProviders: [],
    nextAction: '',
    notes: '',
    photoUrl: '',
    preferences: { budget: '', financing: '', targetAreas: '', mustHaves: '', timeframe: '', minBeds: '' },
    clientContacts: [],
    offersShowings: [],
    contractDetails: defaultAgentContractDetails(),
    keyTerms: [],
    keyTermsCustom: false,
    cashLines: [],
    cashLinesCustom: false,
    earnestInEscrow: '',
    contractAddresses: {},
    contractCustomFields: [],
    contractFieldLabels: {},
    contractHiddenFields: [],
    contractFieldOrder: {},
    buyer2Name: '',
    seller2Name: '',
    lender: '',
    otherAgent: '',
    otherBrokerage: '',
    otherAgentContact: '',
    formFields: {},
    addenda: {},
    selectedFormFamilies: {},
    reminders: [],
    tasks: [],
    documents: DOCUMENT_TEMPLATES.map(({ id, label }) => ({ id, label, status: 'requested' as const, complete: false, requestedAt: now, updatedAt: now, driveFileId: '', fileName: '', fileUploadedAt: '' })),
    activity: [{ id: getId('activity'), message: 'Deal workspace created', createdAt: now }],
    autoCloseExtensionDays: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function isStoredDeal(value: unknown): value is AgentDeal {
  return agentDealSchema.safeParse(value).success;
}

function dealDeadlines(deal: AgentDeal): TrecDeadline[] {
  const list = calculateTrecDeadlines({
    effectiveDate: deal.effectiveDate,
    optionPeriodDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
  });
  // The closing date is a key deadline too (it is typed in, not calculated from the effective date).
  if (deal.closingDate && !list.some((item) => item.id === 'closing-date')) {
    list.push({ id: 'closing-date', label: 'Closing Date', date: deal.closingDate, category: 'contract-period', rule: 'Negotiated closing date from Paragraph 9 of the contract.', rolloverApplied: false });
  }
  return list;
}

type ExtractionState = 'idle' | 'extracting' | 'ready' | 'error';
type ExtractionDraft = {
  title?: string;
  worksheet: Record<string, string>;
  formFields: Record<string, string>;
  addenda: Record<string, boolean>;
  warnings: string[];
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function worksheetValues(deal: AgentDeal): Record<string, string> {
  return {
    buyerNames: deal.buyerNames,
    sellerNames: deal.sellerNames,
    propertyAddress: deal.propertyAddress,
    effectiveDate: deal.effectiveDate,
    optionDays: deal.optionPeriodDays,
    additionalEarnestMoneyDays: deal.additionalEarnestMoneyDays,
    financingDeadlineDays: deal.financingDeadlineDays,
    appraisalDeadlineDays: deal.appraisalDeadlineDays,
    titleCommitmentDays: deal.titleCommitmentDays,
    surveyDays: deal.surveyDays,
    titleObjectionDays: deal.titleObjectionDays,
    earnestMoneyDeliveredDate: deal.earnestMoneyDeliveredDate,
    optionFeeDeliveredDate: deal.optionFeeDeliveredDate,
    closingDate: deal.closingDate,
    ...deal.contractDetails,
    ...deal.formFields,
  };
}

function downloadBackupRecord(deal: AgentDeal): { filename: string; blob: Blob } {
  const record = {
    exportedAt: new Date().toISOString(),
    recordType: 'TREC transaction backup record',
    retentionNote: 'Retain for at least four years from the date of closing, contract termination, or the date of a deposit/withdrawal, per TREC Rules 535.2(h) and 535.146.',
    deal,
  };
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = (deal.propertyAddress || deal.title || 'transaction').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'transaction';
  const filename = `${safeName}-backup-record-${deal.closeoutDate || 'undated'}.json`;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return { filename, blob };
}

const TREC_RETENTION_NOTICE = 'Under TREC Rules 535.2(h) and 535.146, a broker must keep transaction records and trust account logs for four years from the date of closing, contract termination, or the date of a deposit/withdrawal.';
const TREC_RETENTION_URL = 'https://www.trec.texas.gov/how-long-does-license-holder-have-keep-financial-and-real-estate-transactions-file';

async function downloadAuditPdf(deal: AgentDeal, selectedVersions: TrecFormVersion[]): Promise<{ filename: string; blob: Blob }> {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default;

  const NAVY: [number, number, number] = [48, 29, 93];
  const GOLD: [number, number, number] = [196, 163, 90];
  const GREY_900: [number, number, number] = [17, 24, 39];
  const GREY_700: [number, number, number] = [55, 65, 81];
  const GREY_500: [number, number, number] = [107, 114, 128];

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY_500);
  doc.text('REALTYLINE AUSTIN  ·  DEAL AUDIT RECORD', margin, y);
  y += 26;

  doc.setFont('times', 'normal');
  doc.setFontSize(22);
  doc.setTextColor(...GREY_900);
  const title = deal.propertyAddress || deal.title || 'Deal';
  doc.text(title, margin, y);
  y += 14;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(2);
  doc.line(margin, y, margin + 60, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREY_700);
  doc.text(`Generated ${new Date().toLocaleString('en-US')}`, margin, y);
  y += 22;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, textColor: GREY_900 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
    head: [['Deal Details', '']],
    body: [
      ['Buyer(s)', deal.buyerNames || 'Not entered'],
      ['Seller(s)', deal.sellerNames || 'Not entered'],
      ['Property Address', deal.propertyAddress || 'Not entered'],
      ['Effective Date', deal.effectiveDate || 'Not set'],
      ['Closing Date', deal.closingDate || 'Not set'],
      ['Closeout Outcome', deal.closeoutOutcome || 'Not set'],
      ['Closeout Date', deal.closeoutDate || 'Not set'],
      ['Closeout Note', deal.closeoutNote || 'Not set'],
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  const contractRows: [string, string][] = [
    ['County', deal.contractDetails.county || 'Not entered'],
    ['Legal Description', deal.contractDetails.legalDescription || 'Not entered'],
    ['Improvements & Accessories', deal.contractDetails.improvementsAndAccessories || 'Not entered'],
    ['Exclusions', deal.contractDetails.exclusions || 'Not entered'],
    ['Sales Price', deal.contractDetails.salesPrice || 'Not entered'],
    ['Cash Portion', deal.contractDetails.cashPortion || 'Not entered'],
    ['Loan Amount', deal.contractDetails.loanAmount || 'Not entered'],
    ['Financing Type', deal.contractDetails.financingType || 'Not entered'],
    ['Financing Notes', deal.contractDetails.financingNotes || 'Not entered'],
    ['Earnest Money', deal.contractDetails.earnestMoney || 'Not entered'],
    ['Option Fee', deal.contractDetails.optionFee || 'Not entered'],
    ['Additional Earnest Money', deal.contractDetails.additionalEarnestMoney || 'Not entered'],
    ['Title Company', deal.contractDetails.titleCompany || 'Not entered'],
    ['Title Policy Payer', deal.contractDetails.titlePolicyPayer || 'Not entered'],
    ['Survey Plan', deal.contractDetails.surveyPlan || 'Not entered'],
    ['Title & Survey Notes', deal.contractDetails.titleAndSurveyNotes || 'Not entered'],
    ['Condition & Repair Notes', deal.contractDetails.conditionAndRepairNotes || 'Not entered'],
    ['Possession Plan', deal.contractDetails.possessionPlan || 'Not entered'],
    ['Special Provisions Notes', deal.contractDetails.specialProvisionsNotes || 'Not entered'],
    ['Settlement Notes', deal.contractDetails.settlementNotes || 'Not entered'],
    ['Notices', deal.contractDetails.notices || 'Not entered'],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { fontSize: 9, textColor: GREY_900 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 150 } },
    head: [['Contract Details & Notes', '']],
    body: contractRows,
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  if (selectedVersions.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 9, textColor: GREY_900 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      head: [['Attached TREC Forms & Addenda', 'Title']],
      body: selectedVersions.map((version) => [version.formNumber, version.title]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

    for (const version of selectedVersions) {
      const rows = version.fields.map((field) => [field.label, deal.formFields[field.id] || '—']);
      if (rows.length === 0) continue;
      if (y > 620) {
        doc.addPage();
        y = margin;
      }
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid',
        styles: { fontSize: 8, textColor: GREY_900 },
        headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 220 } },
        head: [[`${version.formNumber} — Filled Field Values`, '']],
        body: rows,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
    }
  }

  if (deal.tasks.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 9, textColor: GREY_900 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      head: [['Task', 'Priority', 'Due', 'Status']],
      body: deal.tasks.map((task) => [task.title, task.priority, task.dueDate || '—', task.status]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  if (deal.reminders.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 9, textColor: GREY_900 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      head: [['Reminder', 'Date', 'Complete']],
      body: deal.reminders.map((reminder) => [reminder.label, reminder.reminderDate || '—', reminder.complete ? 'Yes' : 'No']),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  if (deal.documents.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 9, textColor: GREY_900 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      head: [['Document', 'Status']],
      body: deal.documents.map((document) => [document.label, document.status]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  if (deal.activity.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 8.5, textColor: GREY_900 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      head: [['Timestamp', 'Activity']],
      body: [...deal.activity].reverse().map((item) => [formatTimestamp(item.createdAt), item.message]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.75);
    doc.line(margin, pageHeight - 56, pageWidth - margin, pageHeight - 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY_500);
    const noticeLines = doc.splitTextToSize(`${TREC_RETENTION_NOTICE} Source: ${TREC_RETENTION_URL}`, pageWidth - margin * 2);
    doc.text(noticeLines, margin, pageHeight - 42);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
  }

  const safeName = (deal.propertyAddress || deal.title || 'transaction').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'transaction';
  const filename = `${safeName}-audit-record-${deal.closeoutDate || 'undated'}.pdf`;
  doc.save(filename);
  const blob = doc.output('blob') as Blob;
  return { filename, blob };
}

function downloadCalendar(events: ClosingTimeCalendarEvent[], filename: string): void {
  if (!events.length) return;
  const content = buildClosingTimeIcs(events);
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

type SyncState = 'loading' | 'ready' | 'saving' | 'conflict' | 'error';

/**
 * Best-effort background copy of an export to the agent's connected Google
 * Drive. Never throws and never surfaces to the export button — if the
 * agent hasn't connected Drive, or the upload fails for any reason, the
 * local download the caller already produced is still the record of truth.
 */
function backupExportToDrive(filename: string, blob: Blob): void {
  const body = new FormData();
  body.set('filename', filename);
  body.set('file', blob, filename);
  void fetch('/api/agents/drive-auth/upload', { method: 'POST', body }).catch(() => {
    // Intentionally silent — see function docblock.
  });
}

// Google Drive integration disabled — GoogleDriveConnectPanel removed.

export default function ClosingTime({
  initialView,
  workspaceKey,
  realtorId,
  initialWorkspace,
  initialWorkspaceVersion,
  trecFormVersion,
  trecFormVersions,
  panelsOnly = false,
  providers = [],
}: {
  workspaceKey: string;
  realtorId: string;
  initialWorkspace: AgentCommandCenterWorkspace | null;
  initialWorkspaceVersion: number | null;
  trecFormVersion: TrecFormVersion;
  trecFormVersions: TrecFormVersion[];
  initialView?: string;
  panelsOnly?: boolean;
  providers?: ReferralProvider[];
}) {
  const [deals, setDeals] = useState<AgentDeal[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<AgentNotificationPreferences>(
    defaultAgentNotificationPreferences,
  );
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [today, setToday] = useState(chicagoToday);
  const { section: collapsible, toggleProps, reveal } = useCollapsibles();
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskError, setTaskError] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<TrecTaskPriority>('normal');
  const [reminderDeadlineId, setReminderDeadlineId] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [extractionState, setExtractionState] = useState<ExtractionState>('idle');
  const [extractionDraft, setExtractionDraft] = useState<ExtractionDraft | null>(null);
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [extractionError, setExtractionError] = useState('');
  const [isContractDropActive, setIsContractDropActive] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [tourId, setTourId] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [contractPreviewUrl, setContractPreviewUrl] = useState('');
  const [originalSaved, setOriginalSaved] = useState(false);
  const [showSavedOriginal, setShowSavedOriginal] = useState(false);
  const [originalContract, setOriginalContract] = useState<{ dealId: string; id: string } | null>(null);
  const [originalSaveBusy, setOriginalSaveBusy] = useState(false);
  const [isPdfSource, setIsPdfSource] = useState(false);
  const [activeTrecFormFamily, setActiveTrecFormFamily] = useState('20');
  const [activeTrecPage, setActiveTrecPage] = useState(1);
  const [formsStatusDealId, setFormsStatusDealId] = useState<string | null>(null);
  const [workspacePage, setWorkspacePage] = useState<1 | 2>(2);
  const [deskView, setDeskView] = useState('transaction');
  const [dealsTab, setDealsTab] = useState<'all' | 'active' | 'closed'>('all');
  const [dealsQuery, setDealsQuery] = useState('');
  const [dealsHealth, setDealsHealth] = useState('all');
  const [dealPageId, setDealPageId] = useState<string | null>(null);
  const [newDealPickerOpen, setNewDealPickerOpen] = useState(false);
  useEffect(() => {
    if (!newDealPickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNewDealPickerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newDealPickerOpen]);
  const [pickerStep, setPickerStep] = useState<'type' | 'side'>('type');
  // A refresh always lands at the top of the page instead of restoring the old scroll position.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    if (readKeepScroll()) return; // a scheduling page you were working on keeps its exact spot
    const toTop = () => window.scrollTo(0, 0);
    toTop();
    const timer = window.setTimeout(toTop, 150);
    return () => window.clearTimeout(timer);
  }, []);
  // Any click in the left nav starts the destination page at the top.
  useEffect(() => {
    const rail = document.querySelector('#agent-desk .ds-rail');
    if (!rail) return;
    const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const onClick = (event: Event) => {
      if (!(event.target as HTMLElement).closest('button, a')) return;
      toTop();
      window.setTimeout(toTop, 60);
      window.setTimeout(toTop, 250);
    };
    rail.addEventListener('click', onClick);
    return () => rail.removeEventListener('click', onClick);
  }, [ready]);
  const BROKER_FOOTER_KEY = `closing-time-broker-footer:${realtorId}`;
  const [brokerFooter, setBrokerFooter] = useState({ brokerage: '', address: '', agentId: '', agentName: '', brokerName: '', brokerEmail: '' });
  const accountSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [accountSave, setAccountSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveAccountDetails = useCallback((details: typeof brokerFooter) => {
    if (accountSaveTimer.current) clearTimeout(accountSaveTimer.current);
    setAccountSave('saving');
    accountSaveTimer.current = setTimeout(async () => {
      try {
        const response = await fetch('/api/agent-command-center/account', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details),
        });
        setAccountSave(response.ok ? 'saved' : 'error');
      } catch { setAccountSave('error'); }
    }, 700);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let local: Record<string, string> | null = null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(BROKER_FOOTER_KEY) ?? 'null');
      if (saved && typeof saved === 'object') { local = saved; setBrokerFooter((current) => ({ ...current, ...saved })); }
    } catch { /* storage unavailable */ }
    void (async () => {
      try {
        const response = await fetch('/api/agent-command-center/account', { cache: 'no-store' });
        if (!response.ok || cancelled) return;
        const data = await response.json() as { details: Record<string, string> | null };
        if (data.details && Object.values(data.details).some((value) => String(value).trim())) {
          setBrokerFooter((current) => ({ ...current, ...data.details }));
          try { window.localStorage.setItem(BROKER_FOOTER_KEY, JSON.stringify({ ...(local ?? {}), ...data.details })); } catch { /* storage unavailable */ }
          setAccountSave('saved');
        } else if (local && Object.values(local).some((value) => String(value).trim())) {
          saveAccountDetails({ brokerage: '', address: '', agentId: '', agentName: '', brokerName: '', brokerEmail: '', ...local });
        }
      } catch { /* account details unavailable; the browser copy still works */ }
    })();
    return () => { cancelled = true; };
  }, [BROKER_FOOTER_KEY, saveAccountDetails]);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewState, setReviewState] = useState<{ status: 'idle' | 'sending' | 'sent' | 'error'; message: string }>({ status: 'idle', message: '' });
  const submitForBrokerReview = async () => {
    if (!activeDeal) return;
    setReviewState({ status: 'sending', message: '' });
    const values: Record<string, string> = {};
    currentTrecFormVersion.fields.forEach((field) => { const v = currentFormValues[field.id]; if (v) values[field.pdfFieldName] = String(v); });
    try {
      const response = await fetch('/api/agent-command-center/submit-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formNumber: currentTrecFormVersion.formNumber, title: currentTrecFormVersion.title, pdfUrl: currentTrecFormVersion.pdfUrl,
          property: activeDeal.propertyAddress || activeDeal.title, dealName: activeDeal.title, values,
          broker: { name: brokerFooter.brokerName, email: brokerFooter.brokerEmail, note: reviewNote },
          footer: { brokerage: brokerFooter.brokerage, address: brokerFooter.address, agentId: brokerFooter.agentId, agentName: brokerFooter.agentName },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not send for review.');
      setReviewState({ status: 'sent', message: `Sent to ${brokerFooter.brokerEmail}.` });
      applyActiveAction(`Submitted ${currentTrecFormVersion.formNumber} to broker for review`, {});
    } catch (error) {
      setReviewState({ status: 'error', message: error instanceof Error ? error.message : 'Could not send for review.' });
    }
  };
  const updateBrokerFooter = (key: 'brokerage' | 'address' | 'agentId' | 'agentName' | 'brokerName' | 'brokerEmail', value: string) => {
    setBrokerFooter((current) => {
      const next = { ...current, [key]: value };
      try { window.localStorage.setItem(BROKER_FOOTER_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      saveAccountDetails(next);
      return next;
    });
  };
  const [contactsTab, setContactsTab] = useState<'clients' | 'external'>('clients');
  const [messagingContact, setMessagingContact] = useState<{ name: string; email: string; phone: string; role: string } | null>(null);
  const [contactsFilter, setContactsFilter] = useState<'all' | 'active' | 'past'>('all');
  const [contactsQuery, setContactsQuery] = useState('');
  const [savedContacts, setSavedContacts] = useState<{ email: string; name: string; deal_id: string; property: string; closed_date: string }[]>([]);
  const [formsLibraryTab, setFormsLibraryTab] = useState<'trec' | 'brokerage'>('trec');
  const [dealPageTab, setDealPageTab] = useState<'preferences' | 'offers' | 'paperwork' | 'tasks' | 'history'>('preferences');
  const effectiveView = workspacePage === 1 ? 'overview' : deskView === 'overview' ? 'transaction' : deskView;
  useEffect(() => {
    if (effectiveView !== 'contacts') return;
    void fetch('/api/closing-time/contacts', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.contacts) setSavedContacts(d.contacts); }).catch(() => undefined);
  }, [effectiveView]);
  const helpGuideId = effectiveView === 'my-schedule' ? 'scheduler' : effectiveView === 'coordinator' ? 'alerts' : effectiveView === 'd-documents' ? 'documents' : '';
  const helpGuide: Guide | null = GUIDES.find((g) => g.id === helpGuideId) ?? null;
  // The scheduler walkthrough starts by itself the first time this browser opens My Scheduling.
  useEffect(() => {
    if (effectiveView !== 'my-schedule' || !ready) return;
    try {
      if (window.localStorage.getItem('ct-tour-scheduler-seen')) return;
      window.localStorage.setItem('ct-tour-scheduler-seen', '1');
    } catch { return; }
    const t = window.setTimeout(() => setTourId('scheduler'), 1200);
    return () => window.clearTimeout(t);
  }, [effectiveView, ready]);
  const RES_VIEW_ACTIVE = ['utilities', 'referral', 'testimonials', 'data-backups', 'automations', 'security', 'doc-tools'].includes(effectiveView);
  // Scheduling pages are working pages: a refresh keeps the exact scroll position there.
  useKeepScroll(effectiveView === 'my-schedule' || effectiveView === 'd-schedule', ready);
  useEffect(() => {
    DESK_VIEWS.find((v) => v.id === effectiveView)?.keys.forEach((key) => reveal(key));
  }, [effectiveView, reveal]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (deskView !== 'alert-setup') window.sessionStorage.setItem('closing-time-desk-position', JSON.stringify({ dealId: activeDealId, view: deskView, page: workspacePage }));
    } catch {
      /* storage unavailable */
    }
  }, [ready, activeDealId, deskView, workspacePage]);
  const versionRef = useRef<number | null>(initialWorkspaceVersion);
  const syncTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedWorkspaceRef = useRef<AgentCommandCenterWorkspace | null>(null);
  const contractUploadInputRef = useRef<HTMLInputElement | null>(null);
  const contractCameraInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const contractPreviewUrlRef = useRef('');
  const contractFileRef = useRef<File | null>(null);
  const formDeepLinkHandledRef = useRef(false);
  const dealsRef = useRef(deals);
  const notificationPreferencesRef = useRef(notificationPreferences);
  useEffect(() => {
    dealsRef.current = deals;
  }, [deals]);
  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);
  useEffect(() => {
    const refreshToday = () => {
      const currentDate = chicagoToday();
      setToday((previous) => previous === currentDate ? previous : currentDate);
    };
    const timer = window.setInterval(refreshToday, 60_000);
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  }, []);

  const clearContractPreview = useCallback(() => {
    if (contractPreviewUrlRef.current) URL.revokeObjectURL(contractPreviewUrlRef.current);
    contractPreviewUrlRef.current = '';
    contractFileRef.current = null;
    setContractPreviewUrl('');
    setIsPdfSource(false);
  }, []);
  useEffect(() => {
    if (!activeDealId) return;
    let cancelled = false;
    void fetch(`/api/agent-command-center/contracts/original?dealId=${encodeURIComponent(activeDealId)}`, { cache: 'no-store' })
      .then(async response => response.ok ? response.json() as Promise<{ id?: string }> : null)
      .then(record => {
        if (!cancelled) {
          setOriginalContract(record?.id ? { dealId: activeDealId, id: record.id } : null);
          setShowSavedOriginal(false);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeDealId]);

  const saveToCloud = useCallback(async function saveToCloud(workspace: AgentCommandCenterWorkspace) {
    if (saveInFlightRef.current) {
      queuedWorkspaceRef.current = workspace;
      return;
    }

    saveInFlightRef.current = true;
    let saved = false;
    setSyncState('saving');
    try {
      const response = await fetch('/api/agent-command-center/workspace', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspace, expectedVersion: versionRef.current }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.assign('/login?next=%2Fagents');
        return;
      }

      if (response.status === 409) {
        setSyncState('conflict');
        return;
      }

      if (!response.ok || !payload || typeof payload !== 'object') {
        setSyncState('error');
        return;
      }

      const record = payload as { workspace?: unknown; version?: unknown };
      if (!agentCommandCenterWorkspaceSchema.safeParse(record.workspace).success || typeof record.version !== 'number') {
        setSyncState('error');
        return;
      }

      versionRef.current = record.version;
      window.localStorage.removeItem(workspaceKey);
      setSyncState('ready');
      saved = true;
    } catch {
      setSyncState('error');
    } finally {
      saveInFlightRef.current = false;
      const queuedWorkspace = queuedWorkspaceRef.current;
      queuedWorkspaceRef.current = null;
      if (saved && queuedWorkspace) {
        window.setTimeout(() => {
          void saveToCloud(queuedWorkspace);
        }, 0);
      }
    }
  }, [workspaceKey]);

  const queueCloudSave = useCallback((workspace: AgentCommandCenterWorkspace) => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      void saveToCloud(workspace);
    }, 650);
  }, [saveToCloud]);

  useEffect(() => {
    let cancelled = false;
    let legacyDeals: AgentDeal[] = [];

    try {
      const stored = window.localStorage.getItem(workspaceKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      legacyDeals = Array.isArray(parsed) ? parsed.filter(isStoredDeal) : [];
    } catch {
      legacyDeals = [];
    }
    const cloudWorkspace = initialWorkspace ?? null;
    const startingWorkspace = cloudWorkspace ?? {
      deals: legacyDeals,
      notificationPreferences: defaultAgentNotificationPreferences(),
    };
    const migratedDeals = startingWorkspace.deals.map(mergeReadinessDocuments).map(reconcileLinkedChecks).map(restoreBrokerSections).map(restorePropertyFormOrder).map((deal) => (deal.title === 'New Transaction' ? { ...deal, title: 'New Contract' } : deal));
    const readinessChecklistChanged = JSON.stringify(migratedDeals) !== JSON.stringify(startingWorkspace.deals);
    const hydratedWorkspace = { ...startingWorkspace, deals: migratedDeals };

    queueMicrotask(() => {
      if (cancelled) return;
      versionRef.current = initialWorkspaceVersion;
      setDeals(hydratedWorkspace.deals);
      setNotificationPreferences(hydratedWorkspace.notificationPreferences);
      let restoredDealId: string | null = null;
      try {
        const saved = JSON.parse(window.sessionStorage.getItem('closing-time-desk-position') ?? 'null') as { dealId?: string | null; view?: string; page?: number } | null;
        if (saved) {
          if (saved.dealId && hydratedWorkspace.deals.some((d) => d.id === saved.dealId)) restoredDealId = saved.dealId;
          if (typeof saved.view === 'string' && saved.view !== 'alert-setup' && DESK_VIEWS.some((v) => v.id === saved.view)) setDeskView(saved.view);
          if (saved.page === 1 || saved.page === 2) setWorkspacePage(saved.page);
        }
      } catch {
        restoredDealId = null;
      }
      if (initialView && DESK_VIEWS.some((v) => v.id === initialView)) { setDeskView(initialView); setWorkspacePage(2); }
      setActiveDealId(restoredDealId ?? (hydratedWorkspace.deals.find((d) => !d.isTemplate) ?? hydratedWorkspace.deals[0])?.id ?? null);
      setReady(true);
      setSyncState(cloudWorkspace ? 'ready' : 'loading');
    });

    if (cloudWorkspace) {
      window.localStorage.removeItem(workspaceKey);
      if (readinessChecklistChanged) {
        window.setTimeout(() => {
          if (!cancelled) void saveToCloud(hydratedWorkspace);
        }, 0);
      }
    } else if (legacyDeals.length) {
      window.setTimeout(() => {
        if (!cancelled) void saveToCloud(hydratedWorkspace);
      }, 0);
    } else {
      queueMicrotask(() => {
        if (!cancelled) setSyncState('ready');
      });
    }

    return () => {
      cancelled = true;
    };
  }, [initialWorkspace, initialWorkspaceVersion, saveToCloud, workspaceKey]);

  useEffect(() => () => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    if (contractPreviewUrlRef.current) URL.revokeObjectURL(contractPreviewUrlRef.current);
  }, []);

  useEffect(() => {
    if (formDeepLinkHandledRef.current) return;
    const requestedFormFamily = new URLSearchParams(window.location.search).get('form');
    const requestedVersion = trecFormVersions.find((version) => version.formFamily === requestedFormFamily && version.isActive);
    if (!ready || !requestedVersion) return;
    formDeepLinkHandledRef.current = true;
    const timer = window.setTimeout(() => {
      setActiveTrecFormFamily(requestedVersion.formFamily);
      setActiveTrecPage(1);
      setWorkspacePage(2);
      if (dealsRef.current.length === 0) {
        const deal = newDeal(requestedVersion.id);
        const workspace = { deals: [deal], notificationPreferences: notificationPreferencesRef.current };
        setDeals([deal]);
        setActiveDealId(deal.id);
        queueCloudSave(workspace);
      }
      window.setTimeout(() => document.getElementById('trec-form-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [queueCloudSave, ready, trecFormVersions]);

  useEffect(() => {
    if (!isCameraOpen) return;
    let cancelled = false;

    void navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        void cameraVideoRef.current.play();
      }
    }).catch(() => {
      if (!cancelled) setCameraError('Camera access was blocked or no camera was found. Allow camera access or use the device camera option.');
    });

    return () => {
      cancelled = true;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    };
  }, [isCameraOpen]);

  const autofillIndex = useMemo(() => buildAutofillIndex(trecFormVersions), [trecFormVersions]);
  const persistDeals = (incoming: AgentDeal[]) => {
    // Contract entries and uploaded-contract data flow into the matching blanks on the deal's other forms.
    const before = new Map(dealsRef.current.map((deal) => [deal.id, deal]));
    const nextDeals = incoming.map((deal) => (before.get(deal.id) === deal ? deal : syncLinkedChecks(before.get(deal.id), syncStoredFromForm(autofillDeal(before.get(deal.id), deal, autofillIndex)))));
    setDeals(nextDeals);
    if (ready) queueCloudSave({ deals: nextDeals, notificationPreferences });
  };

  const applyActiveAction = (message: string, patch: Partial<AgentDeal>) => {
    if (!activeDeal) return;
    const now = new Date().toISOString();
    const activity: AgentActivity = { id: getId('activity'), message, createdAt: now };
    const nextDeal: AgentDeal = { ...activeDeal, ...patch, updatedAt: now, activity: [...activeDeal.activity, activity].slice(-300) };
    persistDeals(deals.map((deal) => deal.id === activeDeal.id ? nextDeal : deal));
  };

  const updateNotificationPreferences = (patch: Partial<AgentNotificationPreferences>) => {
    const nextPreferences = { ...notificationPreferences, ...patch };
    setNotificationPreferences(nextPreferences);
    if (ready) queueCloudSave({ deals, notificationPreferences: nextPreferences });
  };

  const activeDeal = deals.find((deal) => deal.id === activeDealId) ?? null;
  // Page title follows the current section so browser tabs and history entries are distinguishable.
  useEffect(() => {
    const label = DESK_VIEWS.find((v) => v.id === effectiveView)?.label ?? (effectiveView === 'deal-page' ? 'Deal' : 'Agent Desk');
    document.title = `${label}${activeDeal && effectiveView !== 'deals' ? ` · ${activeDeal.propertyAddress || activeDeal.title || 'Deal'}` : ''} | It's Almost Closing Time!`;
  }, [effectiveView, activeDeal]);
  // Browser Back/Forward move between sections instead of leaving the app.
  const navStateRef = useRef<string>('');
  useEffect(() => {
    const snap = { deskView, workspacePage, dealPageId };
    const key = JSON.stringify(snap);
    if (navStateRef.current === key) return;
    const first = navStateRef.current === '';
    navStateRef.current = key;
    try {
      if (first) window.history.replaceState({ ct: snap }, '');
      else window.history.pushState({ ct: snap }, '');
    } catch { /* ignore */ }
  }, [deskView, workspacePage, dealPageId]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state as { ct?: { deskView: string; workspacePage: number; dealPageId: string | null } } | null)?.ct;
      if (!st) return;
      navStateRef.current = JSON.stringify(st);
      setDeskView(st.deskView); setWorkspacePage(st.workspacePage as never); setDealPageId(st.dealPageId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const isDealFullyComplete = (deal: AgentDeal) =>
    deal.tasks.every((task) => task.complete) &&
    deal.reminders.every((reminder) => reminder.complete) &&
    deal.documents.every((document) => document.complete || isReadinessItemHidden(document.id, effectiveAgentSide(deal)));
  const isDealClosedAndComplete = (deal: AgentDeal) => deal.auditLocked || (Boolean(deal.closeoutOutcome) && isDealFullyComplete(deal));
  const templateDeal = deals.find((deal) => deal.isTemplate) ?? null;
  const liveDeals = deals.filter((deal) => !deal.isTemplate);
  const activeDeals = liveDeals.filter((deal) => !isDealClosedAndComplete(deal));
  const closedDeals = liveDeals.filter((deal) => isDealClosedAndComplete(deal));
  useEffect(() => {
    if (!ready) return;
    const due = dealsRef.current.filter((deal) => autoCloseState(deal, today)?.due);
    if (due.length === 0) return;
    const now = new Date().toISOString();
    persistDeals(dealsRef.current.map((deal) => due.includes(deal) ? {
      ...deal, status: 'completed' as const, auditLocked: true, closeoutOutcome: 'Closed Automatically', closeoutDate: today, updatedAt: now,
      activity: [...deal.activity, { id: getId('activity'), message: 'Deal closed automatically. It is now read-only.', createdAt: now }].slice(-300),
    } : deal));
    // Closing sends the whole file to the agent's connected document storage (or recommends connecting one).
    due.forEach((deal) => {
      fetch('/api/closing-time/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive_deal', dealId: deal.id }) })
        .then((res) => res.json())
        .then((data: { result?: { message?: string } }) => {
          const message = data.result?.message;
          if (!message) return;
          const at = new Date().toISOString();
          persistDeals(dealsRef.current.map((d) => d.id === deal.id ? { ...d, activity: [...d.activity, { id: getId('activity'), message, createdAt: at }].slice(-300) } : d));
        })
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, deals, today]);
  const templateCreatedRef = useRef(false);
  useEffect(() => {
    if (!ready || templateDeal || templateCreatedRef.current) return;
    templateCreatedRef.current = true;
    const base = newDeal(trecFormVersion.id);
    const template: AgentDeal = {
      ...base,
      title: 'Template',
      isTemplate: true,
      contractCustomFields: AGENT_DESK_TEMPLATE.contractCustomFields.map((field) => ({ ...field })),
      contractFieldOrder: Object.fromEntries(Object.entries(AGENT_DESK_TEMPLATE.contractFieldOrder).map(([key, list]) => [key, [...list]])),
      contractHiddenFields: [...AGENT_DESK_TEMPLATE.contractHiddenFields],
      contractFieldLabels: { ...AGENT_DESK_TEMPLATE.contractFieldLabels },
      selectedFormFamilies: { ...base.selectedFormFamilies, '20': true, '55': true, IABS: true },
    };
    persistDeals([template, ...deals]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, templateDeal]);
  const upcomingClosingDays = activeDeals.flatMap((deal) => {
    const days = daysUntilClosing(deal.closingDate, today);
    return deal.status !== 'completed' && days !== null && days >= 0 ? [days] : [];
  });
  const nextClosingDays = upcomingClosingDays.length > 0 ? Math.min(...upcomingClosingDays) : null;
  const isDealLocked = (deal: AgentDeal) =>
    deal.auditLocked || (Boolean(deal.closeoutOutcome && deal.closeoutDate) && isDealFullyComplete(deal));
  const activePacketForms = trecFormVersions.filter((version) => version.isActive);
  const selectedFormVersions = activeDeal
    ? activePacketForms.filter((version) => activeDeal.selectedFormFamilies[version.formFamily])
    : [];
  const dealFormStatus = (deal: AgentDeal, version: TrecFormVersion): 'completed' | 'needs_attention' | 'not_started' => {
    if (version.fields.length === 0) return 'not_started';
    const filledCount = version.fields.filter((field) => (deal.formFields[field.id] ?? '').trim() !== '').length;
    if (filledCount === 0) return 'not_started';
    if (filledCount === version.fields.length) return 'completed';
    return 'needs_attention';
  };
  const currentTrecFormVersion = activePacketForms.find((version) => version.formFamily === activeTrecFormFamily)
    ?? activePacketForms[0]
    ?? trecFormVersion;
  const currentTrecPage = Math.min(Math.max(activeTrecPage, 1), currentTrecFormVersion.pageCount);
  const trecFormFieldById = new Map(currentTrecFormVersion.fields.map((field) => [field.id, field]));
  const currentFormValues = activeDeal
    ? Object.fromEntries(currentTrecFormVersion.fields.map((field) => [
        field.id,
        activeDeal.formFields[field.id]
          || (field.pdfFieldName === 'Street Address and City' || field.pdfFieldName === 'Address of Property'
            ? activeDeal.propertyAddress
            : ''),
      ]))
    : {};

  const syncMessage = {
    loading: 'Connecting your secure cloud workspace.',
    ready: 'Secure cloud sync is active for your signed-in account.',
    saving: 'Saving your latest changes securely.',
    conflict: 'A newer cloud copy exists on another device. Refresh this page before making more changes.',
    error: 'Cloud sync needs attention. Keep this page open and refresh before leaving.',
  }[syncState];
  const activeDeadlines = activeDeal ? dealDeadlines(activeDeal) : [];
  const radarItems = (() => {
    const windowEnd = addDays(today, 14);
    const items: RadarItem[] = [];

    liveDeals.filter((deal) => deal.status !== 'completed' && !isDealClosedAndComplete(deal)).forEach((deal) => {
      dealDeadlines(deal).forEach((deadline) => {
        if (deadline.date <= windowEnd && deadline.date >= addDays(today, -7)) {
          items.push({
            id: `deadline-${deal.id}-${deadline.id}`,
            dealId: deal.id,
            dealTitle: deal.propertyAddress || deal.title,
            label: deadline.label,
            date: deadline.date,
            kind: 'deadline',
            overdue: deadline.date < today,
          });
        }
      });

      deal.reminders.filter((reminder) => !reminder.complete && reminder.reminderDate <= windowEnd).forEach((reminder) => {
        items.push({
          id: `reminder-${deal.id}-${reminder.id}`,
          dealId: deal.id,
          dealTitle: deal.propertyAddress || deal.title,
          label: `Reminder: ${reminder.label}`,
          date: reminder.reminderDate,
          kind: 'reminder',
          overdue: reminder.reminderDate < today,
        });
      });

      deal.tasks.filter((task) => !task.complete && task.dueDate && task.dueDate <= windowEnd).forEach((task) => {
        items.push({
          id: `task-${deal.id}-${task.id}`,
          dealId: deal.id,
          dealTitle: deal.propertyAddress || deal.title,
          label: task.title,
          date: task.dueDate,
          kind: 'task',
          overdue: task.dueDate < today,
        });
      });
    });

    return items.sort((left, right) => left.date.localeCompare(right.date)).slice(0, 10);
  })();

  const reviewAlerts = liveDeals.flatMap((deal) => {
    if (deal.status === 'completed') return [];
    const label = deal.propertyAddress || deal.title;
    return buildTrecValidation(
      worksheetValues(deal),
      dealDeadlines(deal),
      deal.reminders.map((reminder) => ({ deadlineKey: reminder.deadlineId, reminderDate: reminder.reminderDate, isComplete: reminder.complete })),
    ).map((alert) => `${label}: ${alert.message}`);
  });


  const activeDealCount = liveDeals.filter((deal) => deal.status !== 'completed').length;
  const overviewDealCount = activeDeals.filter((deal) => deal.status !== 'completed').length;
  const closingSoonCount = liveDeals.filter((deal) => deal.status !== 'completed' && deal.closingDate >= today && deal.closingDate <= addDays(today, 30)).length;
  const overdueTaskCount = liveDeals.flatMap((deal) => deal.tasks).filter((task) => !task.complete && task.dueDate < today).length;

  const [paymentFor, setPaymentFor] = useState<{ dealId: string; finish: () => void; kind?: 'deal' | 'extension'; extensions?: number } | null>(null);
  const extendDeal = (dealId: string) => {
    const target = dealsRef.current.find((deal) => deal.id === dealId);
    if (!target) return;
    const extensions = Math.round((target.autoCloseExtensionDays ?? 0) / EXTENSION_DAYS);
    const apply = () => {
      const now = new Date().toISOString();
      persistDeals(dealsRef.current.map((deal) => deal.id === dealId ? {
        ...deal, autoCloseExtensionDays: (deal.autoCloseExtensionDays ?? 0) + EXTENSION_DAYS, updatedAt: now,
        activity: [...deal.activity, { id: getId('activity'), message: `Deal extended ${EXTENSION_DAYS} days.`, createdAt: now }].slice(-300),
      } : deal));
      setPaymentFor(null);
    };
    fetch('/api/closing-time/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'extension_reserve', dealId, extensions }) })
      .then((res) => res.json())
      .then((data: { ok?: boolean; paymentRequired?: boolean }) => {
        if (data.ok) apply();
        else if (data.paymentRequired) setPaymentFor({ dealId, finish: apply, kind: 'extension', extensions });
        else window.alert('This deal could not be extended. Please try again.');
      })
      .catch(() => window.alert('This deal could not be extended. Please try again.'));
  };
  const createDeal = (dealType?: AgentDeal['dealType'], agentSide?: AgentDeal['agentSide']) => {
    const base = newDeal(trecFormVersion.id);
    // Pre-tick the required TREC forms: the One to Four Family contract, the Seller's Disclosure Notice and IABS.
    const seededTasks = templateTaskIdsFor(dealType, agentSide).flatMap((id) => TASK_TEMPLATES.find((t) => t.id === id)?.tasks ?? [])
      .filter((title, index, all) => all.indexOf(title) === index)
      .map((title) => ({ id: getId('task'), title, dueDate: '', priority: 'normal' as const, status: 'todo' as const, complete: false }));
    const layout = templateDeal ?? AGENT_DESK_TEMPLATE;
    const seededTitles = new Set(seededTasks.map((task) => task.title));
    const extraTasks = (templateDeal?.tasks ?? []).filter((task) => !seededTitles.has(task.title))
      .map((task) => ({ id: getId('task'), title: task.title, dueDate: '', priority: task.priority, status: 'todo' as const, complete: false }));
    const deal = {
      ...base,
      ...(dealType ? { dealType } : {}),
      ...(agentSide ? { agentSide } : {}),
      contractCustomFields: layout.contractCustomFields.map((field) => ({ ...field, value: '' })),
      contractFieldOrder: Object.fromEntries(Object.entries(layout.contractFieldOrder).map(([key, list]) => [key, [...list]])),
      contractHiddenFields: [...layout.contractHiddenFields],
      contractFieldLabels: { ...layout.contractFieldLabels },
      tasks: [...seededTasks, ...extraTasks],
      selectedFormFamilies: { ...base.selectedFormFamilies, ...(templateDeal?.selectedFormFamilies ?? {}), '20': true, '55': true, IABS: true },
    };
    const finish = () => {
      persistDeals([deal, ...dealsRef.current]);
      setActiveDealId(deal.id);
      setPendingRemoval(null);
      setPaymentFor(null);
      trackEvent('closing_time_transaction_created', { deal_type: deal.dealType });
    };
    // The first two deals an account opens are free. From the third on, a payment window opens first.
    fetch('/api/closing-time/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reserve', dealId: deal.id }) })
      .then((res) => res.json())
      .then((data: { ok?: boolean; paymentRequired?: boolean }) => {
        if (data.ok) finish();
        else if (data.paymentRequired) setPaymentFor({ dealId: deal.id, finish });
        else window.alert('This deal could not be opened. Please try again.');
      })
      .catch(() => window.alert('This deal could not be opened. Please try again.'));
  };

  const updateDealParties = (key: 'buyerNames' | 'sellerNames' | 'buyer2Name' | 'seller2Name', value: string) => {
    if (!activeDeal) return;
    const buyers = key === 'buyerNames' ? value : activeDeal.buyerNames;
    const buyer2 = key === 'buyer2Name' ? value : (activeDeal.buyer2Name ?? '');
    const sellers = key === 'sellerNames' ? value : activeDeal.sellerNames;
    const seller2 = key === 'seller2Name' ? value : (activeDeal.seller2Name ?? '');
    const title = buyerLastNames(buyers) || buyerLastNames(sellers) || 'New Contract';
    const isSeller = key === 'sellerNames' || key === 'seller2Name';
    const formKey = isSeller ? 'p01_f001' : 'p01_f002';
    const formValue = (isSeller ? [sellers.trim(), seller2.trim()] : [buyers.trim(), buyer2.trim()]).filter(Boolean).join(' and ');
    persistDeals(deals.map((deal) => (
      deal.id === activeDeal.id ? { ...deal, [key]: value, title, formFields: { ...deal.formFields, [formKey]: formValue }, updatedAt: new Date().toISOString() } : deal
    )));
  };
  const updateActiveDeal = <Key extends keyof AgentDeal>(key: Key, value: AgentDeal[Key]) => {
    if (!activeDeal) return;
    const nextDeals = deals.map((deal) => (
      deal.id === activeDeal.id
        ? { ...deal, [key]: value, updatedAt: new Date().toISOString() }
        : deal
    ));
    persistDeals(nextDeals);
  };

  const saveOriginalPdf = async (file: File, dealId: string): Promise<string | null> => {
    setOriginalSaveBusy(true);
    setDocumentUploadError('');
    try {
      if (file.type !== 'application/pdf' || file.size > 15 * 1024 * 1024) {
        throw new Error('Choose a PDF smaller than 15 MB.');
      }
      const { upload } = await import('@vercel/blob/client');
      const id = crypto.randomUUID();
      const pathname = `closing-time/originals/${realtorId}/${id}.pdf`;
      const blob = await upload(pathname, file, {
        access: 'private',
        contentType: 'application/pdf',
        handleUploadUrl: '/api/agent-command-center/contracts/original',
        clientPayload: dealId,
      });
      const response = await fetch('/api/agent-command-center/contracts/original', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', dealId, pathname: blob.pathname, filename: file.name }),
      });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || 'Could not keep the original PDF.');
      if (contractFileRef.current === file) {
        setOriginalContract({ dealId, id: data.id });
        setOriginalSaved(true);
      }
      return data.id;
    } catch (error) {
      if (contractFileRef.current === file) {
        setDocumentUploadError(error instanceof Error ? error.message : 'Could not keep the original PDF.');
      }
      return null;
    } finally {
      if (contractFileRef.current === file) setOriginalSaveBusy(false);
    }
  };

  const [formModalOpen, setFormModalOpen] = useState(false);
  const rowUploadInputRef = useRef<HTMLInputElement | null>(null);
  const rowUploadFamilyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!formModalOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFormModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formModalOpen]);
  const extractContract = async (file: File | undefined, family?: string) => {
    if (!file || !activeDeal) return;
    const primaryVersion = (family ? activePacketForms.find((version) => version.formFamily === family) : undefined) ?? currentTrecFormVersion;
    if (family) {
      setActiveTrecFormFamily(family);
      setActiveTrecPage(1);
      if (!activeDeal.selectedFormFamilies[family]) updateActiveDeal('selectedFormFamilies', { ...activeDeal.selectedFormFamilies, [family]: true });
    }
    clearContractPreview();
    contractFileRef.current = file;
    setIsPdfSource(file.type === 'application/pdf');
    setOriginalSaved(false);
    const dealId = activeDeal.id;
    const previewUrl = URL.createObjectURL(file);
    contractPreviewUrlRef.current = previewUrl;
    setContractPreviewUrl(previewUrl);
    setExtractionState('extracting');
    setExtractionError('');
    setExtractionWarnings([]);
    try {
      const originalId = file.type === 'application/pdf' ? await saveOriginalPdf(file, dealId) : null;
      if (file.type === 'application/pdf' && !originalId) {
        throw new Error('The original PDF could not be saved. Try uploading it again.');
      }
      // Read the upload against the contract and every other selected form (IABS, addenda, etc.).
      // Each form has its own field catalog; a document that is not that form simply returns nothing.
      const isolatedForm = Boolean(family) && family !== '20';
      // A row upload for any other form is independent (the 1-4 Residential contract also drives the Contract page): it reads only that form. The main contract upload still reads every selected form.
      const targetVersions = isolatedForm
        ? [primaryVersion]
        : [primaryVersion, ...selectedFormVersions.filter((version) => version.id !== primaryVersion.id && version.fields.length > 0)];
      const readWithVersion = async (versionId: string) => {
        const formData = new FormData();
        if (!originalId) { formData.append('contract', file); formData.append('trecFormVersionId', versionId); }
        const response = await fetch('/api/agent-command-center/extract-contract', {
          method: 'POST',
          credentials: 'same-origin',
          ...(originalId
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originalId, trecFormVersionId: versionId }) }
            : { body: formData }),
        });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401) { window.location.assign('/login?next=%2Fagents'); return null; }
        if (!response.ok || !data || typeof data !== 'object') {
          const error = data && typeof data === 'object' && 'error' in data
            ? String((data as { error?: unknown }).error ?? 'Could not read this contract.')
            : 'Could not read this contract.';
          throw new Error(error);
        }
        const extraction = (data as { extraction?: unknown }).extraction;
        if (!extraction || typeof extraction !== 'object') throw new Error('Contract suggestions were not available.');
        const parsed = extraction as Partial<ExtractionDraft>;
        if (!parsed.worksheet || typeof parsed.worksheet !== 'object' || !parsed.addenda || typeof parsed.addenda !== 'object') {
          throw new Error('Contract suggestions were not in the expected format.');
        }
        return parsed;
      };
      const settled = await Promise.allSettled(targetVersions.map((version) => readWithVersion(version.id)));
      if (settled.some((result) => result.status === 'fulfilled' && result.value === null)) return;
      const readings = settled.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
      if (readings.length === 0) {
        const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw failed?.reason instanceof Error ? failed.reason : new Error('Could not read this contract.');
      }
      const record: { title?: string; worksheet: Record<string, string>; formFields: Record<string, string>; addenda: Record<string, boolean>; warnings: string[] } = {
        title: isolatedForm ? undefined : readings.find((reading) => typeof reading.title === 'string')?.title,
        worksheet: isolatedForm ? {} : Object.assign({}, ...[...readings].reverse().map((reading) => reading.worksheet ?? {})) as Record<string, string>,
        formFields: Object.assign({}, ...readings.map((reading) => reading.formFields ?? {})) as Record<string, string>,
        addenda: isolatedForm ? {} : Object.assign({}, ...[...readings].reverse().map((reading) => reading.addenda ?? {})) as Record<string, boolean>,
        warnings: readings.flatMap((reading) => (Array.isArray(reading.warnings) ? reading.warnings : [])),
      };
      const importedFields = record.formFields && typeof record.formFields === 'object'
        ? Object.entries(record.formFields).filter(([, value]) => typeof value === 'string')
        : [];
      const signatureFields = importedFields.filter(([id]) => {
        const field = primaryVersion.fields.find((candidate) => candidate.id === id);
        return /signatur|initial/i.test(`${field?.pdfFieldName ?? ''} ${field?.label ?? ''}`);
      });
      setExtractionDraft({
        title: typeof record.title === 'string' ? record.title : undefined,
        worksheet: Object.fromEntries(Object.entries(record.worksheet).filter(([, value]) => typeof value === 'string')) as Record<string, string>,
        formFields: Object.fromEntries(importedFields.filter(([id]) => !signatureFields.some(([signatureId]) => signatureId === id))) as Record<string, string>,
        addenda: Object.fromEntries(Object.entries(record.addenda).filter(([, value]) => typeof value === 'boolean')) as Record<string, boolean>,
        warnings: Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : [],
      });
      setExtractionWarnings([
        ...(Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === 'string') : []),
        ...(signatureFields.length ? ['Existing signatures and initials stay only on the original uploaded document. They are never copied into a blank template.'] : []),
      ]);
      setExtractionState('ready');
      trackEvent('closing_time_contract_extracted');
    } catch (error) {
      if (contractPreviewUrlRef.current) URL.revokeObjectURL(contractPreviewUrlRef.current);
      contractPreviewUrlRef.current = '';
      setContractPreviewUrl('');
      setExtractionError(error instanceof Error ? error.message : 'Could not read this contract.');
      setExtractionState('error');
    }
  };

  const captureContractPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera is still starting. Wait a moment, then try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('The camera image could not be captured. Use the device camera option instead.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError('The camera image could not be captured. Use the device camera option instead.');
        return;
      }
      setIsCameraOpen(false);
      const targetFamily = cameraTargetFamilyRef.current ?? undefined;
      cameraTargetFamilyRef.current = null;
      if (targetFamily) setFormModalOpen(true);
      void extractContract(new File([blob], `contract-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }), targetFamily);
    }, 'image/jpeg', 0.92);
  };

  const cameraTargetFamilyRef = useRef<string | null>(null);
  const openContractCamera = (family?: string) => {
    cameraTargetFamilyRef.current = family ?? null;
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      contractCameraInputRef.current?.click();
      return;
    }
    setIsCameraOpen(true);
  };

  const applyExtraction = () => {
    if (!activeDeal || !extractionDraft) return;
    const worksheet = extractionDraft.worksheet;
    const detailKeys = CONTRACT_DETAIL_FIELDS.map(({ key }) => key);
    const nextDetails = { ...activeDeal.contractDetails };
    for (const key of detailKeys) {
      const value = worksheet[key];
      if (typeof value === 'string') nextDetails[key] = value;
    }
    const nextDeal: AgentDeal = {
      ...activeDeal,
      title: buyerLastNames(worksheet.buyerNames ?? '') || extractionDraft.title || activeDeal.title,
      propertyAddress: worksheet.propertyAddress ?? activeDeal.propertyAddress,
      buyerNames: worksheet.buyerNames ?? activeDeal.buyerNames,
      sellerNames: worksheet.sellerNames ?? activeDeal.sellerNames,
      effectiveDate: worksheet.effectiveDate ?? activeDeal.effectiveDate,
      optionPeriodDays: worksheet.optionDays ?? activeDeal.optionPeriodDays,
      additionalEarnestMoneyDays: worksheet.additionalEarnestMoneyDays ?? activeDeal.additionalEarnestMoneyDays,
      financingDeadlineDays: worksheet.financingDeadlineDays ?? activeDeal.financingDeadlineDays,
      appraisalDeadlineDays: worksheet.appraisalDeadlineDays ?? activeDeal.appraisalDeadlineDays,
      titleCommitmentDays: worksheet.titleCommitmentDays ?? activeDeal.titleCommitmentDays,
      surveyDays: worksheet.surveyDays ?? activeDeal.surveyDays,
      titleObjectionDays: worksheet.titleObjectionDays ?? activeDeal.titleObjectionDays,
      earnestMoneyDeliveredDate: worksheet.earnestMoneyDeliveredDate ?? activeDeal.earnestMoneyDeliveredDate,
      optionFeeDeliveredDate: worksheet.optionFeeDeliveredDate ?? activeDeal.optionFeeDeliveredDate,
      closingDate: worksheet.closingDate ?? activeDeal.closingDate,
      contractDetails: nextDetails,
      formFields: { ...activeDeal.formFields, ...extractionDraft.formFields },
      addenda: { ...activeDeal.addenda, ...extractionDraft.addenda },
      updatedAt: new Date().toISOString(),
      activity: [...activeDeal.activity, { id: getId('activity'), message: 'Applied reviewed contract extraction suggestions', createdAt: new Date().toISOString() }].slice(-300),
    };
    const iabs = selectedFormVersions.find((version) => version.formFamily === 'IABS');
    if (iabs) {
      const valueOf = (field?: { id: string }) => (field ? (extractionDraft.formFields[field.id] ?? '').trim() : '');
      const labelled = (pattern: RegExp) => iabs.fields.findIndex((field) => pattern.test(`${field.label} ${field.pdfFieldName}`));
      const after = (index: number, pattern: RegExp) => (index < 0 ? undefined : iabs.fields.slice(index + 1, index + 4).find((field) => pattern.test(`${field.label} ${field.pdfFieldName}`)));
      const firmIndex = labelled(/broker firm name/i);
      const designatedIndex = labelled(/designated broker/i);
      const agentIndex = labelled(/sales agent/i);
      const fromIabs = {
        brokerage: valueOf(iabs.fields[firmIndex]),
        agentName: valueOf(iabs.fields[agentIndex]),
        agentId: valueOf(after(agentIndex, /license/i)),
        brokerName: valueOf(iabs.fields[designatedIndex]),
        brokerEmail: valueOf(after(designatedIndex, /e-?mail/i)),
      };
      const found = Object.fromEntries(Object.entries(fromIabs).filter(([, value]) => value));
      if (Object.keys(found).length) {
        const merged = { ...brokerFooter, ...found };
        setBrokerFooter(merged);
        try { window.localStorage.setItem(BROKER_FOOTER_KEY, JSON.stringify(merged)); } catch { /* storage unavailable */ }
      }
    }
    persistDeals(deals.map((deal) => deal.id === activeDeal.id ? nextDeal : deal));
    clearContractPreview();
    setExtractionDraft(null);
    setExtractionState('idle');
    trackEvent('closing_time_contract_suggestions_applied');
  };

  const updateTrecFormField = (key: string, value: string) => {
    if (!activeDeal) return;
    updateActiveDeal('formFields', { ...activeDeal.formFields, [key]: value });
  };

  const addCustomReminder = () => {
    if (!activeDeal || !reminderDeadlineId || !reminderDate) return;
    const deadline = activeDeadlines.find((item) => item.id === reminderDeadlineId);
    if (!deadline) return;
    const reminder: AgentReminder = {
      id: getId('reminder'), deadlineId: deadline.id, label: deadline.label, deadlineDate: deadline.date,
      reminderDate, note: reminderNote.trim(), preset: 'custom', complete: false,
    };
    applyActiveAction(`Added custom reminder for ${deadline.label}`, { reminders: [...activeDeal.reminders, reminder] });
    setReminderDeadlineId(''); setReminderDate(''); setReminderNote('');
  };

  const updateCalculatedDeadline = (
    key: 'optionPeriodDays' | 'appraisalDeadlineDays' | 'financingDeadlineDays',
    date: string,
  ) => {
    if (!activeDeal) return;
    if (!date) {
      updateActiveDeal(key, '');
      return;
    }
    if (!activeDeal.effectiveDate) return;
    const effective = new Date(`${activeDeal.effectiveDate}T12:00:00Z`).getTime();
    const deadline = new Date(`${date}T12:00:00Z`).getTime();
    const days = Math.round((deadline - effective) / 86_400_000);
    if (days > 0) updateActiveDeal(key, String(days));
  };

  const addTask = () => {
    if (!activeDeal) return;
    if (!taskTitle.trim()) { setTaskError('Enter A Task Name Before Adding.'); return; }
    setTaskError('');
    const task: AgentTask = { id: getId('task'), title: taskTitle.trim(), dueDate: taskDueDate, priority: taskPriority, status: 'todo', complete: false };
    applyActiveAction(`Added ${taskPriority} priority task: ${task.title}`, { tasks: [...activeDeal.tasks, task] });
    setTaskTitle(''); setTaskDueDate(''); setTaskPriority('normal');
    trackEvent('closing_time_task_added');
  };

  const updateTask = (taskId: string, patch: Partial<AgentTask>) => {
    if (!activeDeal) return;
    const nextTasks = activeDeal.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task);
    applyActiveAction(`Updated task status`, { tasks: nextTasks });
  };

  const removeTask = (taskId: string) => {
    if (!activeDeal || isDealLocked(activeDeal)) return;
    applyActiveAction('Removed a deal task', { tasks: activeDeal.tasks.filter((task) => task.id !== taskId) });
  };

  const updateReminder = (reminderId: string, patch: Partial<AgentReminder>) => {
    if (!activeDeal) return;
    applyActiveAction(patch.complete === true ? 'Completed a deadline reminder' : 'Updated a deadline reminder', { reminders: activeDeal.reminders.map((reminder) => reminder.id === reminderId ? { ...reminder, ...patch } : reminder) });
  };

  const addDocument = () => {
    if (!activeDeal || !documentName.trim()) return;
    const now = new Date().toISOString();
    const document: AgentDocument = { id: getId('document'), label: documentName.trim(), status: 'requested', complete: false, requestedAt: now, updatedAt: now, driveFileId: '', fileName: '', fileUploadedAt: '' };
    applyActiveAction(`Requested document: ${document.label}`, { documents: [...activeDeal.documents, document] });
    setDocumentName('');
  };

  const updateDocument = (documentId: string, status: AgentDocument['status']) => {
    if (!activeDeal) return;
    const now = new Date().toISOString();
    applyActiveAction(`Updated document request status to ${status.replace('_', ' ')}`, { documents: activeDeal.documents.map((document) => document.id === documentId ? { ...document, status, complete: status === 'received' || status === 'reviewed', updatedAt: now } : document) });
  };

  // Files the Cash-To-Close estimate PDF in the active deal's documents (one entry, replaced on each save).
  const saveCashToCloseToDocuments = async (file: File) => {
    if (!activeDeal) throw new Error('No deal.');
    const documentId = 'cash-to-close-estimate';
    const form = new FormData();
    form.set('file', new File([file], 'Cash-To-Close-Estimate.pdf', { type: 'application/pdf' }));
    form.set('dealId', activeDeal.id);
    form.set('documentId', documentId);
    const response = await fetch('/api/agent-command-center/documents/upload', { method: 'POST', body: form });
    const data = (await response.json().catch(() => null)) as { driveFileId?: string; fileName?: string; fileUploadedAt?: string } | null;
    if (!response.ok || !data?.driveFileId) throw new Error('Upload failed.');
    const now = new Date().toISOString();
    const entry = { id: documentId, label: 'Cash To Close Estimate', status: 'received' as const, complete: true, requestedAt: now, updatedAt: now, driveFileId: data.driveFileId, fileName: data.fileName ?? 'Cash-To-Close-Estimate.pdf', fileUploadedAt: data.fileUploadedAt ?? now };
    const exists = activeDeal.documents.some((d) => d.id === documentId);
    applyActiveAction('Saved Cash To Close estimate to documents', {
      documents: exists ? activeDeal.documents.map((d) => (d.id === documentId ? { ...d, ...entry, requestedAt: d.requestedAt } : d)) : [...activeDeal.documents, entry],
    });
  };

  const [documentUploadBusyId, setDocumentUploadBusyId] = useState<string | null>(null);
  const [documentUploadError, setDocumentUploadError] = useState<string>('');

  const uploadDocumentFile = async (documentId: string, file: File | undefined) => {
    if (!file || !activeDeal) return;
    setDocumentUploadError('');
    setDocumentUploadBusyId(documentId);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('dealId', activeDeal.id);
      form.set('documentId', documentId);
      const response = await fetch('/api/agent-command-center/documents/upload', { method: 'POST', body: form });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        window.location.assign('/login?next=%2Fagents');
        return;
      }
      if (response.status === 409) {
        setDocumentUploadError('Document uploads are temporarily unavailable. Please try again later.');
        return;
      }
      if (!response.ok || !data || typeof data !== 'object') {
        throw new Error('Upload failed.');
      }
      const result = data as { driveFileId?: string; fileName?: string; fileUploadedAt?: string };
      const driveFileId = result.driveFileId;
      if (!driveFileId) throw new Error('Upload failed.');
      const document = activeDeal.documents.find((entry) => entry.id === documentId);
      const now = new Date().toISOString();
      applyActiveAction(`Attached file to document: ${document?.label ?? 'document'}`, {
        documents: activeDeal.documents.map((entry) => entry.id === documentId
          ? {
              ...entry,
              driveFileId,
              fileName: result.fileName ?? file.name,
              fileUploadedAt: result.fileUploadedAt ?? now,
              status: entry.status === 'requested' ? 'received' : entry.status,
              complete: entry.status === 'requested' ? true : entry.complete,
              updatedAt: now,
            }
          : entry),
      });
      trackEvent('closing_time_document_file_attached');
    } catch {
      setDocumentUploadError('Could not upload this file. Try again in a moment.');
    } finally {
      setDocumentUploadBusyId(null);
    }
  };

  const removeDocumentFile = (documentId: string) => {
    if (!activeDeal) return;
    const document = activeDeal.documents.find((entry) => entry.id === documentId);
    if (!document) return;
    const now = new Date().toISOString();
    applyActiveAction(`Removed attached file from document: ${document.label}`, {
      documents: activeDeal.documents.map((entry) => entry.id === documentId
        ? { ...entry, driveFileId: '', fileName: '', fileUploadedAt: '', updatedAt: now }
        : entry),
    });
  };

  const removeDeal = (dealId: string) => {
    const dealToRemove = deals.find((deal) => deal.id === dealId);
    if (dealToRemove && (isDealLocked(dealToRemove) || dealToRemove.isTemplate)) return;
    const nextDeals = deals.filter((deal) => deal.id !== dealId);
    persistDeals(nextDeals);
    setActiveDealId(nextDeals[0]?.id ?? null);
    setPendingRemoval(null);
    trackEvent('closing_time_transaction_removed');
  };

  const focusDeal = (dealId: string) => {
    setActiveDealId(dealId);
    window.setTimeout(() => document.getElementById('current-transaction')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const toggleReminderOffset = (offset: AgentDeadlineNotificationOffset) => {
    const alreadyEnabled = notificationPreferences.reminderOffsets.includes(offset);
    const nextOffsets = alreadyEnabled
      ? notificationPreferences.reminderOffsets.filter((value) => value !== offset)
      : [...notificationPreferences.reminderOffsets, offset].sort((left, right) => right - left);
    if (!nextOffsets.length) return;
    updateNotificationPreferences({ reminderOffsets: nextOffsets });
  };

  const [calendarFeed, setCalendarFeed] = useState<{ url: string; webcalUrl: string } | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  useEffect(() => {
    let live = true;
    fetch('/api/agent-integrations', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { accounts?: { appSlug: string; healthy: boolean }[] } | null) => {
        if (live && body?.accounts) setCalendarConnected(body.accounts.some((a) => (a.appSlug === 'google_calendar' || a.appSlug === 'outlook') && a.healthy));
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  const [calendarFeedState, setCalendarFeedState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [calendarFeedCopied, setCalendarFeedCopied] = useState(false);

  const loadCalendarFeed = async (reset = false) => {
    if (reset && !window.confirm('Reset your calendar link? Calendars subscribed with the old link will stop updating until you subscribe again.')) return;
    setCalendarFeedState('loading');
    try {
      const response = await fetch('/api/agent-command-center/calendar-feed', { method: reset ? 'POST' : 'GET', cache: 'no-store' });
      if (!response.ok) throw new Error('Calendar link unavailable');
      const body = await response.json() as { url: string; webcalUrl: string };
      setCalendarFeed(body);
      setCalendarFeedState('idle');
      setCalendarFeedCopied(false);
      trackEvent(reset ? 'closing_time_calendar_feed_reset' : 'closing_time_calendar_feed_opened', {});
    } catch {
      setCalendarFeedState('error');
    }
  };

  const copyCalendarFeed = async () => {
    if (!calendarFeed) return;
    try {
      await navigator.clipboard.writeText(calendarFeed.url);
      setCalendarFeedCopied(true);
      window.setTimeout(() => setCalendarFeedCopied(false), 2_000);
    } catch {
      window.prompt('Copy your private calendar link:', calendarFeed.url);
    }
  };

  const exportActiveDealCalendar = () => {
    if (!activeDeal) return;
    downloadCalendar(calendarEventsForDeal(activeDeal), 'realty-news-now-deal-dates.ics');
    trackEvent('closing_time_calendar_exported', { scope: 'active_deal' });
  };

  const exportAllDealsCalendar = () => {
    const events = calendarEventsForActiveDeals(liveDeals);
    downloadCalendar(events, 'realty-news-now-active-deal-dates.ics');
    trackEvent('closing_time_calendar_exported', { scope: 'all_active_deals' });
  };

  const exportBackupRecord = (deal: AgentDeal) => {
    const { filename, blob } = downloadBackupRecord(deal);
    backupExportToDrive(filename, blob);
    trackEvent('closing_time_backup_record_exported');
  };

  const exportAuditPdf = (deal: AgentDeal) => {
    const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
    void downloadAuditPdf(deal, dealFormVersions).then(({ filename, blob }) => {
      backupExportToDrive(filename, blob);
    });
    trackEvent('closing_time_audit_pdf_exported');
  };

  const [dealFolderBusy, setDealFolderBusy] = useState(false);
  const [dealFolderError, setDealFolderError] = useState('');

  const exportDealFolder = async (deal: AgentDeal) => {
    setDealFolderBusy(true);
    setDealFolderError('');
    try {
      const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
      const { filename: pdfFilename, blob: pdfBlob } = await downloadAuditPdf(deal, dealFormVersions);

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file(pdfFilename, pdfBlob);

      const attachedDocuments = deal.documents.filter((document) => document.driveFileId);
      const results = await Promise.all(attachedDocuments.map(async (document) => {
        try {
          const response = await fetch(`/api/agent-command-center/documents/download?fileId=${encodeURIComponent(document.driveFileId)}`);
          if (!response.ok) return { document, ok: false as const };
          const blob = await response.blob();
          return { document, ok: true as const, blob };
        } catch {
          return { document, ok: false as const };
        }
      }));

      const documentsFolder = zip.folder('documents');
      let attachedCount = 0;
      let failedCount = 0;
      for (const result of results) {
        if (result.ok && documentsFolder) {
          const safeFileName = (result.document.fileName || `${result.document.label}.bin`).replace(/[\\/]+/g, '-');
          documentsFolder.file(`${result.document.label.replace(/[\\/]+/g, '-')} - ${safeFileName}`, result.blob);
          attachedCount += 1;
        } else {
          failedCount += 1;
        }
      }

      const notAttached = deal.documents.filter((document) => !document.driveFileId);
      const summaryLines = [
        `Deal folder summary — ${deal.propertyAddress || deal.title || 'Deal'}`,
        `Generated ${new Date().toLocaleString('en-US')}`,
        '',
        `Files included in this folder: ${attachedCount}${failedCount ? ` (${failedCount} attached file(s) could not be fetched — see below)` : ''}`,
        '',
        'Attached documents:',
        ...results.filter((result) => result.ok).map((result) => `- ${result.document.label}: ${result.document.fileName || 'file attached'}`),
        '',
        'Not attached:',
        ...notAttached.map((document) => `- ${document.label} (status: ${document.status.replace('_', ' ')})`),
        ...(failedCount ? ['', 'Could not fetch (Drive error):', ...results.filter((result) => !result.ok).map((result) => `- ${result.document.label}`)] : []),
      ];
      zip.file('documents-summary.txt', summaryLines.join('\n'));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const safeName = (deal.propertyAddress || deal.title || 'transaction').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'transaction';
      const zipFilename = `${safeName}-deal-folder-${deal.closeoutDate || 'undated'}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename;
      link.click();
      URL.revokeObjectURL(url);

      trackEvent('closing_time_folder_exported', { attached: attachedCount, missing: notAttached.length, failed: failedCount });
    } catch {
      setDealFolderError('Could not build the deal folder. Try again in a moment.');
    } finally {
      setDealFolderBusy(false);
    }
  };

  const lockDealRecord = () => {
    if (!activeDeal || isDealLocked(activeDeal)) return;
    applyActiveAction('Locked deal record for TREC audit retention', { auditLocked: true });
    trackEvent('closing_time_record_locked');
  };

  const saveProgress = () => {
    if (!ready) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    const now = new Date().toISOString();
    const nextDeals = activeDeal ? deals.map((deal) => deal.id === activeDeal.id ? {
      ...deal, updatedAt: now, activity: [...deal.activity, { id: getId('activity'), message: 'Saved deal progress', createdAt: now }].slice(-300),
    } : deal) : deals;
    setDeals(nextDeals);
    void saveToCloud({ deals: nextDeals, notificationPreferences });
    trackEvent('closing_time_progress_saved');
  };

  if (panelsOnly) {
    return (
      <section id="agent-deal-tools" className="bg-white">
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-8">
          <div {...collapsible('attention')} className="border border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                  All Deals · {overviewDealCount} Active Deal{overviewDealCount === 1 ? '' : 's'}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-gray-900">What Needs Attention</h2>
              </div>
              <span data-testid="text-dashboard-next-closing-countdown" className="bg-[#F6F3FB] px-3 py-2 text-xs font-bold text-[#301D5D]">
                {nextClosingDays === null
                  ? 'No upcoming closings'
                  : nextClosingDays === 0
                    ? 'Next Closing Today'
                    : `Next closing · ${nextClosingDays} day${nextClosingDays === 1 ? '' : 's'}`}
              </span>
              <CollapseToggle {...toggleProps('attention', 'what needs attention')} />
            </div>
            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {radarItems.length === 0 ? (
                <p className="py-4 text-sm text-slate-600">
                  {overviewDealCount === 0 ? 'No active deals yet.' : 'No upcoming items or recent overdue deadlines.'}
                </p>
              ) : radarItems.slice(0, 5).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.dealTitle}</p>
                  </div>
                  <span className={`text-xs font-bold ${item.overdue ? 'text-[#661102]' : 'text-[#301D5D]'}`}>
                    {item.overdue ? 'Overdue' : item.date === today ? 'Due Today' : formatDate(item.date)}
                  </span>
                </div>
              ))}
            </div>
            <Link href="/agents/closing-time" className="mt-4 inline-flex min-h-[44px] items-center bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277C]">
              Open Agent Desk <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const renderTimelineFields = () => (activeDeal ? (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
        <span className="block text-sm font-bold text-slate-900">Signed Contract / Effective Date</span>
        <input
          type="date"
          value={activeDeal.effectiveDate}
          onChange={(event) => updateActiveDeal('effectiveDate', event.target.value)}
          className="mt-4"
        />
      </label>
      <div className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-900">Earnest Money Deposit</p>
        <Tip text="TREC rule: due by the end of the third calendar day after the effective date; weekend and legal-holiday rollover applies." />
        <input
          type="date"
          readOnly
          value={activeDeadlines.find((deadline) => deadline.id === 'earnest-money-delivery')?.date ?? ''}
          className="mt-4 bg-slate-50 text-slate-700"
          aria-label="Calculated earnest money deposit deadline"
        />
      </div>
      {CALCULATED_TIMELINE_FIELDS.map(({ key, deadlineId, label, rule }) => (
        <label key={key} className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
          <span className="block text-sm font-bold text-slate-900">{label}</span>
          <input
            type="date"
            value={activeDeadlines.find((deadline) => deadline.id === deadlineId)?.date ?? ''}
            disabled={!activeDeal.effectiveDate}
            onChange={(event) => updateCalculatedDeadline(key, event.target.value)}
            className="mt-4 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
      ))}
      <label className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-white p-4">
        <span className="block text-sm font-bold text-slate-900">Closing Date</span>
        <input
          type="date"
          value={activeDeal.closingDate}
          onChange={(event) => updateActiveDeal('closingDate', event.target.value)}
          className="mt-4"
        />
      </label>
    </div>
  ) : null);

  const renderExtractionReview = () => (extractionState === 'ready' && extractionDraft ? (
    <section role="status" className="mt-4 border border-[#D9CFF0] bg-[#F6F3FB] p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <p className="text-sm font-semibold text-[#301D5D]">Contract Suggestions Are Ready to Review</p>
                          <p className="mt-1 text-sm leading-6 text-slate-700">
                            {Object.values(extractionDraft.worksheet).filter(Boolean).length} operational facts, {Object.values(extractionDraft.formFields).filter(Boolean).length} official TREC fields, and {Object.values(extractionDraft.addenda).filter(Boolean).length} selected addenda were found. Review the preview before applying.
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" onClick={applyExtraction} className="inline-flex min-h-[40px] items-center justify-center rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white hover:bg-[#42277C]">Apply to This Deal</button>
                          <button type="button" onClick={() => { clearContractPreview(); setExtractionDraft(null); setExtractionState('idle'); }} className="inline-flex min-h-[40px] items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-300">Discard</button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div className="overflow-hidden border border-[#D9CFF0] bg-white">
                          <div className="border-b border-[#E6E5EC] px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#301D5D]">Uploaded Contract</p>
                          </div>
                          {contractPreviewUrl ? (
                            <iframe
                              src={contractPreviewUrl}
                              title="Uploaded contract preview"
                              className="h-[420px] w-full bg-slate-100 sm:h-[560px]"
                            />
                          ) : (
                            <div className="flex h-[280px] items-center justify-center px-4 text-center text-sm text-slate-600">
                              The temporary contract preview is no longer available.
                            </div>
                          )}
                        </div>
                        <div className="max-h-[560px] overflow-y-auto border border-[#D9CFF0] bg-white">
                          <div className="sticky top-0 z-10 border-b border-[#E6E5EC] bg-white px-3 py-2">
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#301D5D]">Proposed Entries</p>
                            <Tip text="Compare each entry with the unchanged contract before applying." />
                          </div>
                          <div className="space-y-4 p-3">
                            {Object.entries(extractionDraft.worksheet).filter(([, value]) => Boolean(value)).length > 0 && (
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Workspace Summary and Timing</p>
                                <dl className="mt-2 space-y-2">
                                  {Object.entries(extractionDraft.worksheet).filter(([, value]) => Boolean(value)).map(([key, value]) => (
                                    <div key={key} className="border border-slate-200 bg-[#FCFBF9] px-3 py-2 text-xs">
                                      <dt className="font-semibold text-slate-900">{sentenceCaseKey(key)}</dt>
                                      <dd className="mt-1 break-words text-slate-700">{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            )}
                            {Object.entries(extractionDraft.formFields).filter(([, value]) => Boolean(value)).length > 0 && (
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Official TREC Fields</p>
                                <dl className="mt-2 space-y-2">
                                  {Object.entries(extractionDraft.formFields).filter(([, value]) => Boolean(value)).map(([key, value]) => {
                                    const field = trecFormFieldById.get(key);
                                    return (
                                      <div key={key} className="border border-slate-200 bg-[#FCFBF9] px-3 py-2 text-xs">
                                        <dt className="font-semibold leading-5 text-slate-900">{field?.label ?? key}</dt>
                                        <dd className="mt-1 break-words text-slate-700">{value === 'true' ? 'Selected' : value}</dd>
                                        {field && <dd className="mt-1 text-[11px] text-slate-500">Page {field.page}</dd>}
                                      </div>
                                    );
                                  })}
                                </dl>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-700">Existing signatures stay on the unchanged uploaded PDF. Extracted values never transfer signatures to a blank form.</p>
                    </section>
  ) : null);

  const renderFormWindow = () => (!activeDeal ? null : (
    <>
                    <div className="mt-6 rounded-md border border-[#E6E5EC] bg-[#F6F3FB] p-6 sm:p-8 lg:p-14">
                      {originalContract?.dealId === activeDeal.id && (
                        <div className="mx-auto mb-4 max-w-[1020px] border border-slate-300 bg-white p-3">
                          <button type="button" onClick={() => setShowSavedOriginal((value) => !value)}
                            aria-expanded={showSavedOriginal}
                            className="text-sm font-bold text-[#301D5D] underline">
                            {showSavedOriginal ? 'Hide Original Contract' : 'View original uploaded contract (signatures in place)'}
                          </button>
                          {showSavedOriginal && <iframe
                            title="Original uploaded contract, signatures unchanged"
                            src={`/api/agent-command-center/contracts/original?id=${encodeURIComponent(originalContract.id)}`}
                            className="mt-3 h-[70vh] w-full border border-slate-200"
                          />}
                        </div>
                      )}
                      <div className="mx-auto max-w-[1020px] overflow-hidden border border-slate-300 bg-white shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">{currentTrecFormVersion.formFamily.startsWith('custom-') ? `${currentTrecFormVersion.formNumber} form` : `Official TREC ${currentTrecFormVersion.formNumber}`} · Page {currentTrecPage}</p>
                          <a href={`/api/agent-command-center/form-pdf?src=${encodeURIComponent(currentTrecFormVersion.pdfUrl)}&name=${encodeURIComponent(`TREC-${currentTrecFormVersion.formNumber.replace(/\s+/g, '-')}`)}`} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#42277C] underline underline-offset-2">Open Full Form</a>
                        </div>
                        <TrecPdfPagePreview
                          pdfUrl={currentTrecFormVersion.pdfUrl}
                          pageNumber={currentTrecPage}
                          formNumber={currentTrecFormVersion.formNumber}
                          fields={currentTrecFormVersion.fields.filter((field) => field.page === currentTrecPage)}
                          values={currentFormValues}
                          onFieldChange={updateTrecFormField}
                        />
                        <div className="grid gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:grid-cols-[1fr_1.6fr_0.7fr_1fr]" aria-label="Brokerage and agent details">
                          {([['brokerage', 'Brokerage'], ['address', 'Brokerage Address'], ['agentId', 'Agent ID'], ['agentName', 'Agent Name']] as const).map(([key, label]) => (
                            <input
                              key={key}
                              value={brokerFooter[key]}
                              onChange={(event) => updateBrokerFooter(key, event.target.value)}
                              placeholder={label}
                              aria-label={label}
                              title={label}
                              style={{ fontSize: '8pt' }}
                              className="h-6 w-full min-w-0 rounded-md border border-slate-200 bg-[#F6F3FB] px-2 text-center text-slate-900 outline-none focus:border-[#301D5D]"
                            />
                          ))}
                        </div>
                        {(['brokerage', 'address', 'agentId', 'agentName'] as const).some((key) => !brokerFooter[key].trim()) && (
                          <p className="border-t border-slate-100 bg-white px-3 py-2 text-center text-[11px] text-slate-500">Fill these once in <button type="button" onClick={() => setDeskView('coordinator')} className="font-semibold text-[#301D5D] underline underline-offset-2">Settings</button> and they appear on every form.</p>
                        )}
                        <div className="border-t border-slate-200 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Tip text="Send this filled form to your broker to review." />
                            <button type="button" onClick={() => { setReviewOpen((open) => !open); setReviewState({ status: 'idle', message: '' }); }} aria-expanded={reviewOpen} className="ds-review-btn">Submit For Review</button>
                          </div>
                          {reviewOpen && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {([['brokerName', 'Broker Name', 'text'], ['brokerEmail', 'Broker Email', 'email']] as const).map(([key, label, type]) => (
                                <label key={key} className="block min-w-0">
                                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
                                  <input type={type} value={brokerFooter[key]} onChange={(event) => updateBrokerFooter(key, event.target.value)} placeholder={label}
                                    className="h-7 w-full rounded-md border border-slate-200 bg-[#F6F3FB] px-2 text-xs text-slate-900 outline-none focus:border-[#301D5D]" />
                                </label>
                              ))}
                              <label className="block sm:col-span-2">
                                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Message To Broker (Optional)</span>
                                <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={2} placeholder="Anything the broker should look at first"
                                  className="w-full rounded-md border border-slate-200 bg-[#F6F3FB] px-2 py-1 text-xs text-slate-900 outline-none focus:border-[#301D5D]" />
                              </label>
                              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                                <button type="button" disabled={reviewState.status === 'sending' || !brokerFooter.brokerEmail.trim()} className="ds-review-btn" onClick={() => void submitForBrokerReview()}>
                                  {reviewState.status === 'sending' ? 'Sending...' : 'Send To Broker'}
                                </button>
                                {reviewState.message && <p role="status" className={`text-xs ${reviewState.status === 'error' ? 'text-[#661102]' : 'text-[#005A00]'}`}>{reviewState.message}</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 rounded-md border border-slate-200 bg-[#FCFBF9] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => setActiveTrecPage((page) => Math.max(1, page - 1))}
                        disabled={currentTrecPage === 1}
                        className="inline-flex min-h-[42px] min-w-[112px] items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-[#301D5D] hover:bg-[#F6F3FB] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        Back
                      </button>
                      <div className="min-w-0 text-center">
                        <p className="text-sm font-bold text-slate-950">Page {currentTrecPage} of {currentTrecFormVersion.pageCount}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-600">{currentTrecFormVersion.pageSections[currentTrecPage] ?? `Official TREC page ${currentTrecPage}`}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTrecPage((page) => Math.min(currentTrecFormVersion.pageCount, page + 1))}
                        disabled={currentTrecPage === currentTrecFormVersion.pageCount}
                        className="inline-flex min-h-[42px] min-w-[112px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277C] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
    </>
  ));

  return (
    <main id="agent-desk" className="min-h-screen bg-white">
      <h1 className="sr-only">Closing Time Agent Desk</h1>
      <div className="w-full">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside aria-label="Deals" className="sticky top-16 flex min-w-0 flex-col lg:top-24 ds-rail">
            <div className="ds-brand">
              <span className="ds-brand-mark" aria-hidden="true"><ClipboardCheck className="h-4 w-4" /></span>
              <span className="ds-brand-name">Agent Desk</span>
            </div>
            <ul className="ds-nav-top">
              {TOOL_VIEWS.filter((view) => view.id === 'overview').map((view) => {
                const active = view.id === effectiveView || (view.id === 'tools' && effectiveView.startsWith('calc-'));
                const NavIcon = NAV_ICONS[view.id] ?? FileText;
                return (
                  <li key={view.id}>
                    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => setWorkspacePage(1)} className="ds-navbtn" aria-label={view.label} title={view.label}>
                      <NavIcon className="ct-navicon" aria-hidden="true" /><span>Today</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" aria-current={effectiveView === 'my-schedule' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('my-schedule'); }} className="ds-navbtn" aria-label="My Scheduling" title="My Scheduling">
                  <CalendarClock className="ct-navicon" aria-hidden="true" /><span>My Scheduling</span>
                </button>
              </li>
              <li>
                <button type="button" aria-current={effectiveView === 'contacts' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('contacts'); }} className="ds-navbtn" aria-label="Contacts" title="Contacts">
                  <Users className="ct-navicon" aria-hidden="true" /><span>Contacts</span>
                </button>
              </li>
              <li>
                <button type="button" aria-current={effectiveView === 'deals' || effectiveView === 'deal-page' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('deals'); }} className="ds-navbtn" aria-label="Deals" title="Deals">
                  <ListTodo className="ct-navicon" aria-hidden="true" /><span>Deals</span>
                </button>
              </li>
            </ul>
            <div className="ds-group">
              <p className="ds-group-label">Pipeline</p>
              <button type="button" onClick={() => { setPickerStep('type'); setNewDealPickerOpen(true); }} className="ds-new" aria-label="New contract"><Plus className="h-3.5 w-3.5" aria-hidden="true" /><span>New</span></button>
            </div>
            <ul className="ds-nav-top ds-nav-closings">
              <li>
                <button type="button" aria-current={effectiveView === 'closings' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('closings'); }} className="ds-navbtn" aria-label="Closings" title="Closings">
                  <Landmark className="ct-navicon" aria-hidden="true" /><span>Closings</span>
                </button>
              </li>
            </ul>
            <ul className="ds-deals">
              {templateDeal && (
                <li className="relative">
                  <button
                    type="button"
                    aria-current={templateDeal.id === activeDealId && workspacePage === 2 && DEAL_TABS.some((t) => t.id === effectiveView) ? 'true' : undefined}
                    onClick={() => { setActiveDealId(templateDeal.id); setWorkspacePage(2); if (!DEAL_TABS.some((t) => t.id === deskView)) setDeskView('d-overview'); setFormsStatusDealId(templateDeal.id); }}
                    className="ds-deal"
                    aria-label="Template" title="Template"
                  >
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#7059A8]" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">Template</span>
                      <span className="block truncate text-xs ds-sub">Edits Apply To New Contracts</span>
                    </span>
                  </button>
                </li>
              )}
              {liveDeals.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No deals yet.</li>}
              {[...activeDeals, ...closedDeals].map((deal) => {
                const days = daysUntilClosing(deal.closingDate, today);
                const closed = isDealClosedAndComplete(deal);
                const tone = closed ? 'bg-slate-300' : days === null ? 'bg-slate-300' : days < 0 ? 'bg-[#FF2A04] ring-1 ring-[#661102]' : days <= 7 ? 'bg-[#FAD800] ring-1 ring-[#645600]' : 'bg-[#00E200] ring-1 ring-[#005A00]';
                const selected = deal.id === activeDealId && workspacePage === 2 && DEAL_TABS.some((t) => t.id === effectiveView);
                return (
                  <li key={deal.id} className="group/deal relative">
                    <button
                      type="button"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => { setActiveDealId(deal.id); setWorkspacePage(2); if (!DEAL_TABS.some((t) => t.id === deskView)) setDeskView('d-overview'); setFormsStatusDealId(deal.id); }}
                      className="ds-deal"
                      aria-label={deal.propertyAddress || deal.title}
                      title={deal.propertyAddress || deal.title}
                    >
                      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{deal.propertyAddress || deal.title}</span>
                        <span className="block truncate text-xs ds-sub">{closed ? 'Closed' : days === null ? 'Closing Date Not Set' : closingCountdownLabel(deal.closingDate, today)}</span>
                      </span>
                    </button>
                    {!isDealLocked(deal) && (
                      <button
                        type="button"
                        aria-label={`Delete ${deal.propertyAddress || deal.title}`}
                        title="Delete Deal"
                        onClick={() => { if (window.confirm(`Delete ${deal.propertyAddress || deal.title}? This cannot be undone.`)) removeDeal(deal.id); }}
                        className="absolute right-1 top-1.5 !flex !h-6 !w-6 !items-center !justify-center !border-0 !bg-transparent !p-0 text-slate-300 opacity-0 transition hover:!text-[#661102] group-hover/deal:opacity-100 [@media(hover:none)]:opacity-100"
                      ><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="ds-group-label ds-group-solo">Tools</p>
            <ul className="ds-nav-top">
              {TOOL_VIEWS.filter((view) => view.id !== 'overview' && view.id !== 'referral' && view.id !== 'my-schedule').map((view) => {
                const active = view.id === effectiveView;
                const NavIcon = NAV_ICONS[view.id] ?? FileText;
                return (
                  <li key={view.id}>
                    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView(view.id); }} className="ds-navbtn" aria-label={view.label} title={view.label}>
                      <NavIcon className="ct-navicon" aria-hidden="true" /><span>{view.label}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <button type="button" aria-expanded={resourcesOpen || RES_VIEW_ACTIVE} onClick={() => setResourcesOpen((open) => !open)} className="ds-navbtn" aria-label="Resources" title="Resources">
                  <BookOpen className="ct-navicon" aria-hidden="true" /><span>Resources</span>
                  <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${resourcesOpen || RES_VIEW_ACTIVE ? 'rotate-90' : ''}`} aria-hidden="true" />
                </button>
                {(resourcesOpen || RES_VIEW_ACTIVE) && (
                  <ul className="ds-nav-child">
                    <li>
                      <button type="button" aria-current={effectiveView === 'utilities' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('utilities'); }} className="ds-navbtn">
                        <span>Utilities</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" aria-current={effectiveView === 'referral' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('referral'); }} className="ds-navbtn">
                        <span>Referral Network</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" aria-current={effectiveView === 'testimonials' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('testimonials'); }} className="ds-navbtn">
                        <span>Testimonials Hub</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" aria-current={effectiveView === 'data-backups' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('data-backups'); }} className="ds-navbtn">
                        <span>Data And Backups</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" aria-current={effectiveView === 'automations' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('automations'); }} className="ds-navbtn">
                        <span>Automations</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" aria-current={effectiveView === 'security' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('security'); }} className="ds-navbtn">
                        <span>Security</span>
                      </button>
                    </li>
                    <li>
                      <button type="button" aria-current={effectiveView === 'doc-tools' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('doc-tools'); }} className="ds-navbtn">
                        <span>Document Tools</span>
                      </button>
                    </li>
                  </ul>
                )}
              </li>
              <li>
                <button type="button" aria-current={effectiveView === 'coordinator' ? 'page' : undefined} onClick={() => { setWorkspacePage(2); setDeskView('coordinator'); }} className="ds-navbtn" aria-label="Settings" title="Settings">
                  <SettingsIcon className="ct-navicon" aria-hidden="true" /><span>Settings</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="ds-navbtn"
                  aria-label="Sign Out"
                  title="Sign Out"
                  onClick={async () => {
                    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
                    window.location.href = '/auth/sign-up';
                  }}
                >
                  <LogOutIcon className="ct-navicon" aria-hidden="true" /><span>Sign Out</span>
                </button>
              </li>
            </ul>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 px-2 pb-2 text-[11px] text-[#7A7787]">
              <a className="underline" href="/privacy">Privacy</a>
              <a className="underline" href="/terms">Terms</a>
              <a className="underline" href="/disclaimer">Notices</a>
            </div>
          </aside>
          <div className="ds-mainwrap min-w-0">
            <HelpTips howTo={helpGuide} onTour={helpGuide ? () => setTourId(helpGuide.id) : undefined} />
            {tourId && GUIDES.find((g) => g.id === tourId) && <Walkthrough key={tourId} guide={GUIDES.find((g) => g.id === tourId) as Guide} onClose={() => setTourId(null)} goView={(v) => { setWorkspacePage(2); setDeskView(v); }} />}
            {((effectiveView !== 'overview' && effectiveView !== 'deal-page') || DEAL_TABS.some((t) => t.id === effectiveView)) && (
              <div className="ds-toolbar">
            {effectiveView !== 'overview' && effectiveView !== 'deal-page' && (() => {
              const toDeals = DEAL_TABS.some((t) => t.id === effectiveView);
              return (
                <button type="button" className="ds-back mb-3" aria-label={toDeals ? 'Back to Deals' : effectiveView.startsWith('calc-') ? 'Back to Calculators' : effectiveView === 'alert-setup' ? 'Back to Settings' : 'Back to Today'}
                  onClick={() => { if (toDeals) { setWorkspacePage(2); setDeskView('deals'); } else if (effectiveView.startsWith('calc-')) { setDeskView('tools'); } else if (effectiveView === 'alert-setup') { setDeskView('coordinator'); } else { setWorkspacePage(1); } }}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" /> {toDeals ? 'Deals' : effectiveView.startsWith('calc-') ? 'Calculators' : effectiveView === 'alert-setup' ? 'Settings' : 'Today'}
                </button>
              );
            })()}
            {DEAL_TABS.some((t) => t.id === effectiveView) && (
              <nav aria-label="Deal sections" className="ds-dealnav mb-4">
                {([['Deal', ['d-overview', 'transaction']], ['Work', ['d-documents', 'd-people', 'd-messages', 'd-schedule', 'd-portal', 'tasks', 'readiness', 'audit']]] as const).map(([group, ids]) => (
                  <div key={group} className="ds-dealnav-group" role="group" aria-label={group}>
                    <span className="ds-dealnav-label">{group}</span>
                    {(ids as readonly string[]).map((id) => DEAL_TABS.find((tab) => tab.id === id)).filter((tab): tab is (typeof DEAL_TABS)[number] => Boolean(tab)).map((tab) => (
                      <button key={tab.id} type="button" className="ds-tab" aria-current={tab.id === effectiveView ? 'page' : undefined} onClick={() => setDeskView(tab.id)}>{tab.label}</button>
                    ))}
                  </div>
                ))}
              </nav>
            )}
              </div>
            )}
          <div data-desk-view={effectiveView} className="ds-main min-w-0">
            <header className="ds-header">
              <div className="min-w-0">
                <p className="ds-eyebrow">{new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
                <h2 className="ds-title">It&apos;s Almost Closing Time!</h2>
                <p className="ds-subtitle">{ready ? syncMessage : 'Loading your secure workspace.'}</p>
              </div>
              <div data-testid="text-next-closing-countdown" className="ds-pill-lg">
                {nextClosingDays === null
                  ? 'No upcoming closings'
                  : nextClosingDays === 0
                    ? 'Next Closing Is Today'
                    : `${nextClosingDays} day${nextClosingDays === 1 ? '' : 's'} to next closing`}
              </div>
            </header>
            <div className="ds-stats" aria-label="Desk summary">
              <div className="ds-stat"><div><p className="ds-stat-label">Active Files</p><p className="ds-stat-num">{activeDeals.length}</p><p className="ds-stat-sub">Under Contract</p></div><span className="ds-stat-icon ds-i-purple"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /></span></div>
              <div className="ds-stat"><div><p className="ds-stat-label">Next Closing</p><p className="ds-stat-num">{nextClosingDays === null ? '—' : nextClosingDays}</p><p className="ds-stat-sub">{nextClosingDays === null ? 'None Scheduled' : 'Days Away'}</p></div><span className="ds-stat-icon ds-i-green"><CalendarDays className="h-4 w-4" aria-hidden="true" /></span></div>
              <div className="ds-stat"><div><p className="ds-stat-label">Open tasks</p><p className="ds-stat-num">{activeDeals.reduce((n, d) => n + d.tasks.filter((t) => !t.complete).length, 0)}</p><p className="ds-stat-sub">Across Active Files</p></div><span className="ds-stat-icon ds-i-blue"><ListTodo className="h-4 w-4" aria-hidden="true" /></span></div>
              <div className="ds-stat"><div><p className="ds-stat-label">Closed</p><p className="ds-stat-num">{closedDeals.length}</p><p className="ds-stat-sub">Completed Files</p></div><span className="ds-stat-icon ds-i-amber"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /></span></div>
            </div>
            {effectiveView === 'contacts' && (() => {
              type ContactRow = { key: string; name: string; email: string; phone: string; role: string; dealIds: string[]; active: boolean; last: string; client: boolean; property?: string; anniversary?: string };
              const map = new Map<string, ContactRow>();
              const clientRole = /buyer|seller|client|tenant|landlord|owner/i;
              const add = (deal: (typeof deals)[number], name: string, email: string, phone: string, role: string, forceClient: boolean) => {
                const cleaned = name.trim();
                if (!cleaned) return;
                const key = (email.trim().toLowerCase() || cleaned.toLowerCase());
                const closed = isDealClosedAndComplete(deal);
                const existing = map.get(key);
                const client = forceClient || !role.trim() || clientRole.test(role);
                if (existing) {
                  if (!existing.dealIds.includes(deal.id)) existing.dealIds.push(deal.id);
                  existing.active = existing.active || !closed;
                  if (deal.updatedAt > existing.last) existing.last = deal.updatedAt;
                  existing.email = existing.email || email; existing.phone = existing.phone || phone;
                  existing.client = existing.client || client;
                } else {
                  map.set(key, { key, name: cleaned, email, phone, role: role.trim(), dealIds: [deal.id], active: !closed, last: deal.updatedAt, client });
                }
              };
              liveDeals.forEach((deal) => {
                dealPeople(deal).filter((p) => p.kind === 'client').forEach((p) => add(deal, p.name, p.email, p.phone, p.role, p.kind === 'client' && /buyer|seller/i.test(p.role)));
              });
              savedContacts.forEach((sc) => { const k = sc.email.toLowerCase(); const ex = map.get(k); if (ex) { ex.anniversary = sc.closed_date; return; } map.set(k, { key: k, name: sc.name, email: sc.email, phone: '', role: 'Client', dealIds: [], active: false, last: sc.closed_date, client: true, property: sc.property, anniversary: sc.closed_date }); });
              const all = Array.from(map.values());
              const clients = all.filter((c) => c.client);
              const external = all.filter((c) => !c.client);
              const q = contactsQuery.trim().toLowerCase();
              const list = (contactsTab === 'clients' ? clients : external)
                .filter((c) => contactsFilter === 'all' || (contactsFilter === 'active' ? c.active : !c.active))
                .filter((c) => !q || `${c.name} ${c.email} ${c.phone} ${c.role}`.toLowerCase().includes(q))
                .sort((a, b) => a.name.localeCompare(b.name));
              const touch = (iso: string) => {
                const days = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(iso)) / 86400000);
                if (Number.isNaN(days)) return '—';
                return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
              };
              if (messagingContact) {
                return (
                  <div className="ds-page ds-compact" data-testid="contact-messages">
                    <button type="button" className="mb-3 text-[13px] font-medium text-[#301D5D] underline underline-offset-2" onClick={() => setMessagingContact(null)}>Back To Contacts</button>
                    <h2 className="ds-title">Messages With {messagingContact.name}</h2>
                    <p className="ds-subtitle">Everything exchanged with this person on every deal, plus new messages. This stays open after a deal is closed and locked.</p>
                    <MessagesPanel key={messagingContact.name} contact={messagingContact} />
                  </div>
                );
              }
              return (
                <div className="ds-page ds-compact" data-testid="contacts-page">
                  <p className="ds-eyebrow">CRM</p>
                  <h2 className="ds-title">Contacts</h2>
                  <p className="ds-subtitle">Everyone you work with: your clients and the professionals on your deals.</p>
                  <div className="ds-tabs" role="tablist" aria-label="Contact groups">
                    <button type="button" role="tab" aria-selected={contactsTab === 'clients'} className="ds-tab" onClick={() => setContactsTab('clients')}>Clients ({clients.length})</button>
                    <button type="button" role="tab" aria-selected={contactsTab === 'external'} className="ds-tab" onClick={() => setContactsTab('external')}>External Contacts ({external.length})</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex gap-1" role="group" aria-label="Contact status">
                      {(['all', 'active', 'past'] as const).map((id) => (
                        <button key={id} type="button" aria-pressed={contactsFilter === id} onClick={() => setContactsFilter(id)} className={contactsFilter === id ? 'ds-filter-on' : ''}>{id === 'all' ? 'All' : id === 'active' ? 'Active' : 'Past'}</button>
                      ))}
                    </div>
                    <input value={contactsQuery} onChange={(e) => setContactsQuery(e.target.value)} placeholder={`Search ${contactsTab === 'clients' ? 'clients' : 'external contacts'}`} aria-label="Search contacts" className="h-8 min-w-[220px] flex-1 rounded-lg border border-[#E6E5EC] bg-white px-3 text-sm" />
                  </div>
                  <div className="ds-table-wrap ds-cards mt-3">
                    <table className="w-full text-left text-sm">
                      <thead><tr><th className="px-4 py-2">Name</th><th>{contactsTab === 'clients' ? 'Stage' : 'Role'}</th><th>Email</th><th>Phone</th><th>Deal</th><th>Last Touch</th><th className="pr-4"><span className="sr-only">Message</span></th></tr></thead>
                      <tbody>
                        {list.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-sm text-slate-500">No contacts found.</td></tr>}
                        {list.map((c) => {
                          const first = deals.find((d) => d.id === c.dealIds[0]);
                          return (
                            <tr key={c.key} tabIndex={0} onClick={() => { if (first) { setActiveDealId(first.id); setDealPageId(first.id); setDealPageTab('preferences'); setDeskView('deal-page'); } }}>
                              <td data-label="Name" className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                              <td data-label={contactsTab === 'clients' ? 'Stage' : 'Role'}>{contactsTab === 'clients'
                                ? <span className={`ds-chip ${c.active ? 'bg-[#E0FBE0] text-[#005A00]' : 'bg-[#EFEAF8] text-[#301D5D]'}`}>{c.active ? 'Active Client' : 'Past Client'}</span>
                                : <span className="capitalize">{c.role || '—'}</span>}</td>
                              <td data-label="Email">{c.email || '—'}</td>
                              <td data-label="Phone">{c.phone || '—'}</td>
                              <td data-label="Deal" className="max-w-[220px] truncate">{first ? (first.propertyAddress || first.title) : (c.property || '—')}{c.dealIds.length > 1 ? ` +${c.dealIds.length - 1}` : ''}</td>
                              <td data-label="Last Touch" className="whitespace-nowrap">{touch(c.last)}</td>
                              <td data-label="" className="pr-4"><button type="button" className="rounded-lg border border-[#E6E5EC] bg-white px-3 py-1 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white" onClick={(e) => { e.stopPropagation(); setMessagingContact({ name: c.name, email: c.email, phone: c.phone, role: c.role || (c.client ? 'Client' : 'Contact') }); }}>Message</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
            {effectiveView === 'closings' && (() => {
              const stageList = TREC_DEAL_WORKFLOW_STATUSES.filter((status) => status !== 'cancelled');
              const inFlight = liveDeals.filter((deal) => !isDealClosedAndComplete(deal)).sort((a, b) => (a.closingDate || '9999').localeCompare(b.closingDate || '9999'));
              const closedList = liveDeals.filter((deal) => isDealClosedAndComplete(deal));
              const typeLabel: Record<string, string> = { purchase: 'Buy side', listing_sale: 'Sell side', listing_lease: 'Lease listing', lease: 'Lease', real_estate_other: 'Other', other: 'Other' };
              const openDeal = (deal: (typeof deals)[number]) => { setActiveDealId(deal.id); setDealPageId(deal.id); setDealPageTab('preferences'); setDeskView('deal-page'); };
              const row = (deal: (typeof deals)[number]) => {
                const days = daysUntilClosing(deal.closingDate, today);
                const dot = days === null ? 'bg-slate-300' : days < 0 ? 'bg-[#FF2A04] ring-1 ring-[#661102]' : days <= 7 ? 'bg-[#FAD800] ring-1 ring-[#645600]' : 'bg-[#00E200] ring-1 ring-[#005A00]';
                const stageIdx = Math.max(0, stageList.indexOf(deal.workflowStatus as (typeof stageList)[number]));
                const pct = Math.round(((stageIdx + 1) / stageList.length) * 100);
                const openTasks = deal.tasks.filter((t) => !t.complete).length;
                const price = deal.contractDetails?.salesPrice?.trim();
                return (
                  <li key={deal.id}>
                    <button type="button" onClick={() => openDeal(deal)} className="ds-closing-row">
                      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900">{deal.propertyAddress || deal.title}</span>
                          <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{deal.dealType === 'purchase' && deal.agentSide === 'listing' ? 'Sell side' : (typeLabel[deal.dealType] ?? 'Deal')}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span className="font-medium text-slate-900">{TREC_DEAL_WORKFLOW_STATUS_LABELS[deal.workflowStatus]}</span>
                          <span className="ds-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                          <span>{stageIdx + 1}/{stageList.length}</span>
                          <span>·</span>
                          <span>{deal.closingDate ? `closes ${formatDate(deal.closingDate)}` : 'closing date not set'}</span>
                          <span>·</span>
                          <span>{openTasks} open {openTasks === 1 ? 'task' : 'tasks'}</span>
                        </span>
                      </span>
                      {price ? <span className="shrink-0 text-sm font-semibold text-slate-900">{price.startsWith('$') ? price : `$${price}`}</span> : null}
                    </button>
                  </li>
                );
              };
              return (
                <div className="ds-page ds-compact" data-testid="closings-page">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="ds-eyebrow">Pipeline</p>
                      <h2 className="ds-title">Closings</h2>
                      <p className="ds-subtitle">Contract to keys. The nearest closings sort to the top.</p>
                    </div>
                    <button type="button" onClick={() => { setPickerStep('type'); setNewDealPickerOpen(true); }}><Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />New Contract</button>
                  </div>
                  <p className="mt-6 text-sm font-semibold text-slate-900">In Flight <span className="ds-chip ml-1 bg-[#EFEAF8] text-[#301D5D]">{inFlight.length}</span></p>
                  <ul className="ds-closing-list">{inFlight.length === 0 ? <li className="px-4 py-4 text-sm text-slate-500">No closings in flight.</li> : inFlight.map(row)}</ul>
                  <p className="mt-6 text-sm font-semibold text-slate-900">Closed</p>
                  <ul className="ds-closing-list">{closedList.length === 0 ? <li className="px-4 py-4 text-sm text-slate-500">No closings completed yet.</li> : closedList.map(row)}</ul>
                </div>
              );
            })()}
            {effectiveView === 'deals' && (() => {
              const healthOf = (deal: (typeof deals)[number]) => {
                if (isDealClosedAndComplete(deal)) return { key: 'closed', label: 'Closed', tone: 'bg-slate-100 text-slate-600' };
                const d = daysUntilClosing(deal.closingDate, today);
                if (d === null) return { key: 'nodate', label: 'No date', tone: 'bg-slate-100 text-slate-600' };
                if (d < 0) return { key: 'overdue', label: 'Overdue', tone: 'bg-[#FFEAE6] text-[#661102]' };
                if (d <= 7) return { key: 'attention', label: 'Needs Attention', tone: 'bg-[#FEF8CC] text-[#645600]' };
                return { key: 'ontrack', label: 'On Track', tone: 'bg-[#E0FBE0] text-[#005A00]' };
              };
              const sinceLabel = (iso?: string) => {
                if (!iso) return '—';
                const days = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(iso)) / 86400000);
                if (Number.isNaN(days)) return '—';
                if (days <= 0) return 'Today';
                if (days === 1) return 'Yesterday';
                return `${days} days ago`;
              };
              const q = dealsQuery.trim().toLowerCase();
              const rows = liveDeals.filter((deal) => {
                const closed = isDealClosedAndComplete(deal);
                if (dealsTab === 'active' && closed) return false;
                if (dealsTab === 'closed' && !closed) return false;
                if (dealsHealth !== 'all' && healthOf(deal).key !== dealsHealth) return false;
                if (q && !`${deal.propertyAddress} ${deal.title} ${deal.buyerNames} ${deal.sellerNames}`.toLowerCase().includes(q)) return false;
                return true;
              });
              return (
                <div className="ds-page" data-testid="deals-page">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="ds-title">Deals</h2>
                      <p className="ds-subtitle">Every deal in one place, with where each one stands and what is due next.</p>
                    </div>
                    <button type="button" onClick={() => { setPickerStep('type'); setNewDealPickerOpen(true); }} className="inline-flex h-[40px] items-center gap-2 rounded-lg bg-[#301D5D] px-4 text-sm font-semibold text-white hover:bg-[#42277C]">
                      <Plus className="h-4 w-4" aria-hidden="true" /> New Deal
                    </button>
                  </div>
                  <div className="ds-tabs" role="tablist" aria-label="Deal filter">
                    {([['all', 'All deals', liveDeals.length], ['active', 'Active', activeDeals.length], ['closed', 'Closed', closedDeals.length]] as const).map(([id, label, count]) => (
                      <button key={id} type="button" role="tab" aria-selected={dealsTab === id} aria-current={dealsTab === id ? 'page' : undefined} onClick={() => setDealsTab(id)} className="ds-tab">{label} <span className="ds-tab-count">{count}</span></button>
                    ))}
                  </div>
                  <div className="ds-filters">
                    <label className="ds-search"><Search className="h-4 w-4" aria-hidden="true" /><input value={dealsQuery} onChange={(e) => setDealsQuery(e.target.value)} placeholder="Search deals..." aria-label="Search deals" /></label>
                    <select value={dealsHealth} onChange={(e) => setDealsHealth(e.target.value)} aria-label="Health" className="ds-select">
                      <option value="all">Health</option>
                      <option value="ontrack">On Track</option>
                      <option value="attention">Needs Attention</option>
                      <option value="overdue">Overdue</option>
                      <option value="nodate">No date</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                  <div className="ds-table-wrap ds-cards">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead>
                        <tr>
                          <th className="py-3 pl-4">Deal</th><th>Clients</th><th>Stage</th><th>Progress</th><th>Health</th><th>Closing</th><th className="pr-4">Last Activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{deals.length === 0 ? 'No deals yet. Select New deal to start one.' : 'No deals match.'}</td></tr>}
                        {rows.map((deal) => {
                          const health = healthOf(deal);
                          const done = deal.tasks.filter((t) => t.complete).length;
                          const total = deal.tasks.length;
                          return (
                            <tr key={deal.id} tabIndex={0} onClick={() => { setActiveDealId(deal.id); setDealPageId(deal.id); setDealPageTab('preferences'); setDeskView('deal-page'); }} onKeyDown={(e) => { if (e.key === 'Enter') { setActiveDealId(deal.id); setDealPageId(deal.id); setDealPageTab('preferences'); setDeskView('deal-page'); } }} className="cursor-pointer">
                              <td data-label="Deal" className="py-3 pl-4 font-medium text-slate-900">{deal.propertyAddress || deal.title}</td>
                              <td data-label="Clients">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(', ') || '—'}</td>
                              <td data-label="Stage"><span className="ds-chip ds-chip-purple">{TREC_DEAL_WORKFLOW_STATUS_LABELS[deal.workflowStatus]}</span></td>
                              <td data-label="Progress">
                                <div className="flex items-center gap-2">
                                  <span className="ds-bar" aria-hidden="true"><span style={{ width: total ? `${Math.round((done / total) * 100)}%` : '0%' }} /></span>
                                  <span className="text-xs text-slate-500">{total ? `${done}/${total}` : '—'}</span>
                                </div>
                              </td>
                              <td data-label="Health"><span className={`ds-chip ${health.tone}`}>{health.label}</span></td>
                              <td data-label="Closing" className="whitespace-nowrap">{deal.closingDate ? formatDate(deal.closingDate) : '—'}</td>
                              <td data-label="Last Activity" className="whitespace-nowrap pr-4">{sinceLabel(deal.activity[deal.activity.length - 1]?.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
            {effectiveView === 'deal-page' && (() => {
              const deal = deals.find((d) => d.id === dealPageId);
              const closed = deal ? isDealClosedAndComplete(deal) : false;
              const days = deal ? daysUntilClosing(deal.closingDate, today) : null;
              const health = closed ? { label: 'Closed', tone: 'bg-slate-100 text-slate-600' }
                : days === null ? { label: 'No date', tone: 'bg-slate-100 text-slate-600' }
                : days < 0 ? { label: 'Overdue', tone: 'bg-[#FFEAE6] text-[#661102]' }
                : days <= 7 ? { label: 'Needs Attention', tone: 'bg-[#FEF8CC] text-[#645600]' }
                : { label: 'On Track', tone: 'bg-[#E0FBE0] text-[#005A00]' };
              const nextDeadline = deal ? dealDeadlines(deal).filter((d) => d.date && d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
              return (
                <DealSubpage
                  key={deal?.id ?? 'none'}
                  onExtendDeal={extendDeal}
                  readiness={deal ? readinessCounts(deal) : undefined}
                  deal={deal}
                  today={today}
                  locked={deal ? isDealLocked(deal) : false}
                  health={health}
                  statusLabels={TREC_DEAL_WORKFLOW_STATUS_LABELS}
                  statuses={TREC_DEAL_WORKFLOW_STATUSES}
                  documentGroups={DOCUMENT_GROUPS}
                  nextDeadline={nextDeadline}
                  formatDate={formatDate}
                  countdownLabel={deal ? closingCountdownLabel(deal.closingDate, today) : ''}
                  onUpdate={updateActiveDeal}
                  onBack={() => setDeskView('deals')}
                  onOpenView={(view) => { setWorkspacePage(2); setDeskView(view); }}
                />
              );
            })()}
            {DEAL_TABS.some((t) => t.id === effectiveView) && (() => {
              const deal = activeDeal;
              if (!deal) return null;
              const nextDeadline = dealDeadlines(deal).filter((d) => d.date && d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
              return (
                <div className="mb-5">
                  <DealSubpage
                    key={`${deal.id}-strip`}
                    stripOnly
                    onExtendDeal={extendDeal}
                    deal={deal}
                    today={today}
                    locked={isDealLocked(deal)}
                    health={{ label: '', tone: '' }}
                    statusLabels={TREC_DEAL_WORKFLOW_STATUS_LABELS}
                    statuses={TREC_DEAL_WORKFLOW_STATUSES}
                    documentGroups={DOCUMENT_GROUPS}
                    nextDeadline={nextDeadline}
                    formatDate={formatDate}
                    countdownLabel={closingCountdownLabel(deal.closingDate, today)}
                    onUpdate={updateActiveDeal}
                    onBack={() => setDeskView('deals')}
                    onOpenView={(view) => { setWorkspacePage(2); setDeskView(view); }}
                  />
                </div>
              );
            })()}
            {activeDeal && ['audit', 'transaction', 'readiness', 'd-messages', 'd-portal', 'd-schedule'].includes(effectiveView) && <DocumentRequestsCard headless key={`sync-${activeDeal.id}`} deal={activeDeal} locked={isDealLocked(activeDeal)} documentGroups={DOCUMENT_GROUPS} onUpdate={updateActiveDeal} />}
            {effectiveView === 'utilities' && <UtilitiesPanel />}
            {effectiveView === 'data-backups' && <DataBackupsPanel />}
            {effectiveView === 'automations' && <AutomationsPanel />}
            {effectiveView === 'security' && <SecurityPanel />}
            {effectiveView === 'doc-tools' && <DocumentToolsPanel />}
            {effectiveView === 'testimonials' && <div className="ds-page"><TestimonialHubClient /></div>}
            {effectiveView === 'd-messages' && activeDeal && <div className="ds-page"><MessagesPanel key={activeDeal.id} deal={activeDeal} /></div>}
            {effectiveView === 'd-portal' && activeDeal && <div className="ds-page"><ClientPortalPanel key={activeDeal.id} deal={activeDeal} /></div>}
            {effectiveView === 'setup-help' && (
              <div className="ds-page space-y-6">
                <div>
                  <h2 className="ds-title">Set Up Instructions</h2>
                  <p className="mt-1 text-[14px] text-[#4A4757]">Start a walkthrough and it points at each part of the page in order, or read the written steps. The same guides appear under Help on the matching pages.</p>
                </div>
                {GUIDES.map((g) => (
                  <div key={g.id} className="ds-card">
                    <p className="text-sm font-semibold text-slate-900">{g.title}</p>
                    {g.intro && <p className="mt-1 text-[14px] text-[#4A4757]">{g.intro}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setTourId(g.id)}>Start Walkthrough</button>
                    </div>
                    <details data-no-auto-open className="mt-3 border-t border-[#E6E5EC] pt-2">
                      <summary className="cursor-pointer text-xs font-medium text-[#301D5D]">Show Written Steps</summary>
                      <div className="mt-2 space-y-3 text-[14px] text-[#4A4757]">
                        {g.steps.map((h, n) => <p key={h.step}><strong className="text-[#1B1726]">{n + 1}. {h.step}.</strong> {h.text}</p>)}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
            {effectiveView === 'my-schedule' && <div className="ds-page space-y-8"><SchedulersPanel key="personal" deal={PERSONAL_DEAL} onOpenIntegrations={() => setDeskView('integrations')} /></div>}
            {effectiveView === 'd-schedule' && activeDeal && <div className="ds-page space-y-8"><SchedulersPanel key={activeDeal.id} deal={activeDeal} onOpenIntegrations={() => setDeskView('integrations')} /></div>}
            {['d-overview', 'd-documents', 'd-people'].includes(effectiveView) && (() => {
              const deal = activeDeal;
              const health = deal ? (() => {
                if (isDealClosedAndComplete(deal)) return { label: 'Closed', tone: 'bg-slate-100 text-slate-600' };
                const d = daysUntilClosing(deal.closingDate, today);
                return d === null ? { label: 'No date', tone: 'bg-slate-100 text-slate-600' } : d < 0 ? { label: 'Overdue', tone: 'bg-[#FFEAE6] text-[#661102]' } : d <= 7 ? { label: 'Needs Attention', tone: 'bg-[#FEF8CC] text-[#645600]' } : { label: 'On Track', tone: 'bg-[#E0FBE0] text-[#005A00]' };
              })() : { label: 'No date', tone: 'bg-slate-100 text-slate-600' };
              const nextDeadline = deal ? dealDeadlines(deal).filter((d) => d.date && d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
              return (
                <div className="ds-page">
                  <DealSubpage
                    key={`${deal?.id ?? 'none'}-${effectiveView}`}
                    readiness={deal ? readinessCounts(deal) : undefined}
                    section={effectiveView === 'd-documents' ? 'documents' : effectiveView === 'd-people' ? 'people' : 'overview'}
                    deal={deal ?? undefined}
                    today={today}
                    locked={deal ? isDealLocked(deal) : false}
                    health={health}
                    statusLabels={TREC_DEAL_WORKFLOW_STATUS_LABELS}
                    statuses={TREC_DEAL_WORKFLOW_STATUSES}
                    documentGroups={DOCUMENT_GROUPS}
                    nextDeadline={nextDeadline}
                    deadlines={deal ? dealDeadlines(deal) : []}
                    timelineFields={renderTimelineFields()}
                    alerts={notificationPreferences}
                    onOpenAlerts={() => { setWorkspacePage(2); setDeskView('coordinator'); }}
                    onExtendDeal={extendDeal}
                    formatDate={formatDate}
                    countdownLabel={deal ? closingCountdownLabel(deal.closingDate, today) : ''}
                    onUpdate={updateActiveDeal}
                    onBack={() => setDeskView('deals')}
                    onOpenView={(view) => { setWorkspacePage(2); setDeskView(view); }}
                    trecForms={deal ? activePacketForms.map((version) => ({
                      formFamily: version.formFamily,
                      formNumber: version.formNumber,
                      title: version.title,
                      total: version.fields.length,
                      filled: version.fields.filter((field) => (deal.formFields[field.id] ?? '').trim() !== '').length,
                      selected: Boolean(deal.selectedFormFamilies[version.formFamily]),
                      textTotal: version.fields.filter((field) => field.type === 'text').length,
                      textFilled: version.fields.filter((field) => field.type === 'text' && (deal.formFields[field.id] ?? '').trim() !== '').length,
                    })) : undefined}
                    onToggleTrecForm={(family, selected) => updateActiveDeal('selectedFormFamilies', { ...(deal?.selectedFormFamilies ?? {}), [family]: selected })}
                    onOpenTrecForm={(family) => {
                      if (deal && !deal.selectedFormFamilies[family]) updateActiveDeal('selectedFormFamilies', { ...deal.selectedFormFamilies, [family]: true });
                      setActiveTrecFormFamily(family);
                      setActiveTrecPage(1);
                      setFormModalOpen(true);
                    }}
                    onUploadTrecForm={(family, mode) => {
                      if (mode === 'photo') { openContractCamera(family); return; }
                      rowUploadFamilyRef.current = family;
                      rowUploadInputRef.current?.click();
                    }}
                  />
                </div>
              );
            })()}
            <div data-section-key="tools" className="min-w-0"><WorkFasterPanel onOpenTool={(view) => { setWorkspacePage(2); setDeskView(view); }} /></div>
            {effectiveView === 'alert-setup' && <AlertSetupContent />}
            {effectiveView === 'calc-net-sheet' && <div className="ds-embed"><SellerNetSheetClient /></div>}
            {effectiveView === 'calc-commission' && <div className="ds-embed"><CommissionCalculatorClient /></div>}
            {effectiveView === 'calc-cash' && <div className="ds-embed"><BuyerClosingCostsClient onSaveToDeal={activeDeal ? saveCashToCloseToDocuments : undefined} dealLabel={activeDeal?.propertyAddress || activeDeal?.title || undefined} /></div>}
            <div data-section-key="integrations" className="min-w-0"><IntegrationsPanel calendarTile={(
              <li className="ds-cal-tile">
                {!calendarFeed ? (
                  <button type="button" onClick={() => void loadCalendarFeed()} disabled={calendarFeedState === 'loading'} className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left hover:bg-[#F6F3FB]">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#EFEAF8] text-[#301D5D]">{calendarFeedState === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">Subscribe To Apple Calendar</span>
                  </button>
                ) : (
                  <div className="flex min-h-[56px] w-full flex-col justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[#301D5D]">
                      <a href={calendarFeed.webcalUrl} onClick={() => trackEvent('closing_time_calendar_feed_subscribe', { app: 'apple' })} className="underline underline-offset-2">Open In Apple Calendar</a>
                      <button type="button" onClick={() => void copyCalendarFeed()} className="underline underline-offset-2">{calendarFeedCopied ? 'Copied' : 'Copy Link'}</button>
                    </div>
                    {calendarFeedState === 'error' && <p className="text-xs font-semibold text-[#661102]">Could not load your link. Try again.</p>}
                  </div>
                )}
              </li>
            )} /></div>
            <div data-section-key="referral" className="min-w-0"><ReferralNetworkPanel providers={providers} /></div>
        {workspacePage === 2 && (
          <section className={'mt-4 grid gap-4'} aria-label="Deal settings, alerts and calendar">
            <div data-section-key="agent-details" className="min-w-0 rounded-xl border border-[#E6E5EC] bg-white p-[1.125rem] lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900">Account: Brokerage And Agent Details</h3>
                <span className="ds-chip bg-[#EFEAF8] text-[#301D5D]">{(['brokerage', 'address', 'agentId', 'agentName'] as const).filter((key) => brokerFooter[key].trim()).length} of 4 required filled</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">Fill these in once. They appear along the bottom of every form and are stamped along the bottom of every page of any PDF you download, send to your broker or send for signature.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([['brokerage', 'Brokerage', 'text', true], ['address', 'Brokerage Address', 'text', true], ['agentId', 'Agent License Number', 'text', true], ['agentName', 'Agent Name', 'text', true], ['brokerName', 'Broker Name', 'text', false], ['brokerEmail', 'Broker Email', 'email', false]] as const).map(([key, label, type, required]) => (
                  <label key={key} className="block min-w-0">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}{required ? ' (required)' : ' (for broker review)'}</span>
                    <input type={type} value={brokerFooter[key]} onChange={(event) => updateBrokerFooter(key, event.target.value)} placeholder={label} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#301D5D]" />
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500" role="status">{accountSave === 'saving' ? 'Saving to your account...' : accountSave === 'error' ? 'Could not save to your account. Your entries are kept on this browser. Try again.' : 'Saved to your account.'}</p>
            </div>
            <MlsConnectionsCard />
            <div data-section-key="calendar-link" className="min-w-0 rounded-xl border border-[#E6E5EC] bg-white p-[1.125rem] lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900">Calendar Link</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">Your Apple Calendar subscription uses a private link. Anyone with it can view your deal dates. Reset it if it was shared by mistake. The old link stops working and you will need to subscribe again.</p>
              <button type="button" disabled={calendarFeedState === 'loading'} onClick={() => { if (window.confirm('Reset your calendar link? The old link will stop working.')) void loadCalendarFeed(true); }} className="mt-4 inline-flex min-h-[36px] items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                {calendarFeedState === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Reset Calendar Link
              </button>
              {calendarFeed && calendarFeedState !== 'loading' && <Tip text="Use Open In Apple Calendar on the Integrations page to subscribe with the new link." />}
            </div>
            <div {...collapsible('alerts')} className="min-w-0 rounded-xl border border-[#E6E5EC] bg-white p-[1.125rem] lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-900">Deadline Alerts</h3>
                <CollapseToggle {...toggleProps('alerts', 'deadline alerts')} />
              </div>
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                  <input type="checkbox" checked={notificationPreferences.emailEnabled} onChange={(event) => updateNotificationPreferences({ emailEnabled: event.target.checked })} className="h-4 w-4 accent-[#301D5D]" />
                  <Mail className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" /> Send Deadline Alerts By Email
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Send Emails To
                  <input type="email" defaultValue={notificationPreferences.notificationEmail ?? ''} placeholder="Account Email" onBlur={(event) => { const value = event.target.value.trim(); if (value !== (notificationPreferences.notificationEmail ?? '') && (value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) updateNotificationPreferences({ notificationEmail: value }); }} className="mt-1 block w-full max-w-sm rounded-md border border-[#E6E5EC] px-3 py-2 text-sm font-normal text-slate-800" />
                </label>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={notificationPreferences.smsEnabled} onChange={async (event) => {
                      if (!event.target.checked) { updateNotificationPreferences({ smsEnabled: false }); return; }
                      const phone = (document.getElementById('closing-time-sms-phone') as HTMLInputElement | null)?.value.trim() ?? '';
                      const res = await fetch('/api/agent-command-center/sms-consent', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                      if (!res.ok) { event.target.checked = false; window.alert(res.status === 403 ? 'Text alerts are not available on this account yet.' : 'Enter your 10-digit US mobile number first.'); return; }
                      const data = (await res.json()) as { phone: string };
                      updateNotificationPreferences({ smsEnabled: true, smsPhone: data.phone });
                    }} className="h-4 w-4 accent-[#301D5D]" />
                    Send Deadline Alerts By Text
                  </label>
                  <input id="closing-time-sms-phone" type="tel" defaultValue={notificationPreferences.smsPhone} placeholder="Mobile Number" className="block w-full max-w-sm rounded-md border border-[#E6E5EC] px-3 py-2 text-sm font-normal text-slate-800" />
                  <Tip text="Each text includes the property address. Message and data rates may apply. Reply STOP to opt out." />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={notificationPreferences.pushEnabled} onChange={(event) => updateNotificationPreferences({ pushEnabled: event.target.checked })} className="h-4 w-4 accent-[#301D5D]" />
                    <Smartphone className="rnn-inline-icon text-[#7059A8]" aria-hidden="true" /> Send Browser Push Alerts
                  </label>
                  <PushOptInButton realtorId={realtorId} label="Connect This Device" className="inline-flex min-h-[36px] items-center rounded-md border border-[#7059A8] bg-white px-3 text-xs font-bold text-[#301D5D] transition hover:bg-[#F6F3FB]" />
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap sm:gap-4">
                  {([[7, '7 Days Before'], [3, '3 Days Before'], [1, '1 Day Before'], [0, 'Due Today']] as const).map(([offset, label]) => (
                    <label key={offset} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={notificationPreferences.reminderOffsets.includes(offset)} disabled={notificationPreferences.reminderOffsets.length === 1 && notificationPreferences.reminderOffsets[0] === offset} onChange={() => toggleReminderOffset(offset)} className="h-3.5 w-3.5 accent-[#301D5D]" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Alerts are opt-in for active deals. Browser push requires permission on each device. <Link href="/agents/closing-time/alert-setup" className="font-semibold text-[#301D5D] underline underline-offset-2">Alert Setup Guide</Link></p>
            </div>
            {activeDeal && (
              <ClosingTimeAssist
                deal={activeDeal}
                onMarkReceived={(docId, fileName) => {
                  const now = new Date().toISOString();
                  applyActiveAction('Marked a client-uploaded document received', {
                    documents: activeDeal.documents.map((d) => d.id === docId ? { ...d, status: 'received' as const, complete: true, updatedAt: now, fileName: fileName.slice(0, 280), fileUploadedAt: now } : d),
                  });
                }}
                onApplyChecklist={(steps) => {
                  const base = (anchorKind: 'effective' | 'closing') => anchorKind === 'closing' ? activeDeal.closingDate : activeDeal.effectiveDate;
                  const existing = new Set(activeDeal.tasks.map((t) => t.title));
                  const added = steps.filter((s) => base(s.anchor) && !existing.has(s.title)).map((s) => ({
                    id: getId('task'), title: s.title, dueDate: addDays(base(s.anchor), s.offsetDays),
                    priority: 'normal' as const, status: 'todo' as const, complete: false,
                  }));
                  if (!added.length) return;
                  applyActiveAction(`Applied closing checklist (${added.length} tasks)`, { tasks: [...activeDeal.tasks, ...added].slice(0, 200) });
                }}
              />
            )}
            <div id="trec-forms" {...collapsible('trec-library')} className="ds-page min-w-0 scroll-mt-24 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <p className="ds-eyebrow">Tools</p>
                  <h3 className="ds-title">Forms Library</h3>
                  <p className="ds-subtitle">TREC contracts and your brokerage forms, in one place.</p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {formsLibraryTab === 'trec' && <a href="https://www.trec.texas.gov/agency-information/contracts" target="_blank" rel="noreferrer" className="hidden min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 transition hover:bg-[#301D5D] hover:text-white sm:inline-flex">TREC Quick Link</a>}
                  <CollapseToggle {...toggleProps('trec-library', 'forms library')} />
                </div>
              </div>
              <div role="tablist" aria-label="Forms library pages" className="mt-4 flex gap-4 border-b border-[#E6E5EC]">
                {([['trec', 'TREC Forms'], ['brokerage', 'Brokerage Forms']] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={formsLibraryTab === id} onClick={() => setFormsLibraryTab(id)}
                    className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-semibold ${formsLibraryTab === id ? 'border-[#301D5D] text-[#301D5D]' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{label}</button>
                ))}
              </div>
              {formsLibraryTab === 'trec' && (
                <>
                  <TrecFormsLibrary
                    versions={trecFormVersions}
                    embedded
                    dealContext={{
                      hasDeal: Boolean(activeDeal),
                      locked: activeDeal ? isDealLocked(activeDeal) : false,
                      selected: activeDeal?.selectedFormFamilies ?? {},
                      filled: activeDeal ? Object.fromEntries(activePacketForms.map((version) => [version.formFamily, version.fields.filter((field) => (activeDeal.formFields[field.id] ?? '').trim() !== '').length])) : {},
                      onToggle: (family, selected) => { if (activeDeal) updateActiveDeal('selectedFormFamilies', { ...activeDeal.selectedFormFamilies, [family]: selected }); },
                      onOpen: (family) => {
                        if (activeDeal && !activeDeal.selectedFormFamilies[family]) updateActiveDeal('selectedFormFamilies', { ...activeDeal.selectedFormFamilies, [family]: true });
                        setActiveTrecFormFamily(family);
                        setActiveTrecPage(1);
                        setFormModalOpen(true);
                      },
                      onUpload: (family, mode) => {
                        if (mode === 'photo') { openContractCamera(family); return; }
                        rowUploadFamilyRef.current = family;
                        rowUploadInputRef.current?.click();
                      },
                    }}
                  />
                  <h4 className="mt-6 text-sm font-semibold text-slate-900">Your Uploaded TREC Forms</h4>
                  <CustomFormsPanel section="trec" label="TREC form" />
                </>
              )}
              {formsLibraryTab === 'brokerage' && <CustomFormsPanel
                section="brokerage"
                label="Brokerage form"
                dealContext={{
                  hasDeal: Boolean(activeDeal),
                  locked: activeDeal ? isDealLocked(activeDeal) : false,
                  checks: activeDeal?.documentChecks ?? {},
                  onToggle: (formId, selected) => {
                    if (!activeDeal) return;
                    const next = { ...activeDeal.documentChecks };
                    if (selected) next[`bf:${formId}`] = true; else { delete next[`bf:${formId}`]; delete next[`bfs:${formId}`]; }
                    updateActiveDeal('documentChecks', next);
                  },
                }}
              />}
            </div>
          </section>
        )}


        {workspacePage === 1 && (
          <>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Agent deals', activeDealCount, ClipboardCheck, 'bg-[#F6F3FB] text-[#301D5D]'],
            ['Closing in 30 days', closingSoonCount, CalendarDays, 'bg-[#FEF8CC] text-[#645600]'],
            ['Review alerts', reviewAlerts.length, AlertTriangle, 'bg-[#FFEAE6] text-[#661102]'],
            ['Overdue tasks', overdueTaskCount, ListTodo, 'bg-[#F2EEE7] text-[#4C3B67]'],
          ].map(([label, value, Icon, tone]) => {
            const MetricIcon = Icon as typeof CalendarDays;
            return (
              <div key={label as string} className="border border-slate-200 bg-white p-4">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${tone as string}`}>
                  <MetricIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value as number}</p>
                <p className="mt-1 text-sm font-medium text-slate-600">{label as string}</p>
              </div>
            );
          })}
        </div>

          </>
        )}

        {workspacePage === 2 && (
          <div data-section-key="current" className="min-w-0">{activeDeal ? <ContractPage deal={activeDeal} onParties={updateDealParties} onOpenCalculator={(id) => setDeskView(id)} onPatch={(patch) => { const id = activeDeal.id; persistDeals(deals.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d))); }} /> : <p className="text-sm text-slate-500">Start a deal to see its contract terms.</p>}</div>
        )}

        {workspacePage === 2 && activeDeals.length > 0 && (
          <section {...collapsible('active')} className="mt-6 rounded-xl border border-[#E6E5EC] bg-white p-[1.125rem]">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Active Deals</p>
                <h3 className="mt-1 text-xl font-semibold text-gray-900">{activeDeals.length} Deal{activeDeals.length === 1 ? '' : 's'} In Progress</h3>
              </div>
              <CollapseToggle {...toggleProps('active', 'active deals')} className="ml-auto" />
            </div>
            {/* Mobile cards */}
            <div className="mt-5 divide-y divide-slate-100 md:hidden">
              {activeDeals.map((deal) => {
                const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
                const openTasks = deal.tasks.filter((task) => !task.complete).length;
                const doneTasks = deal.tasks.length - openTasks;
                const openReminders = deal.reminders.filter((reminder) => !reminder.complete).length;
                const doneReminders = deal.reminders.length - openReminders;
                return (
                  <button
                    type="button"
                    key={deal.id}
                    onClick={() => {
                      focusDeal(deal.id);
                      setFormsStatusDealId(deal.id);
                    }}
                    className={`block w-full py-3 text-left transition hover:bg-[#F6F3FB] ${deal.id === activeDealId ? 'bg-[#F6F3FB]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-slate-900">{deal.propertyAddress || deal.title}</span>
                        {(deal.buyerNames || deal.sellerNames) && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ')}</span>
                        )}
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </div>
                    <div className="mt-2">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{TREC_DEAL_WORKFLOW_STATUS_LABELS[deal.workflowStatus]}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-slate-400">Effective Date</div>
                        <div className="text-slate-700">{deal.effectiveDate ? formatDate(deal.effectiveDate) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-400">Closing Date</div>
                        <div className="text-slate-700">{deal.closingDate ? formatDate(deal.closingDate) : '—'}</div>
                        <div data-testid={`text-closing-countdown-${deal.id}`} className="mt-0.5 font-bold text-[#301D5D]">
                          {closingCountdownLabel(deal.closingDate, today)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {dealFormVersions.length === 0 ? (
                        <span className="text-xs text-slate-400">No forms</span>
                      ) : (
                        <span
                          title={dealFormVersions.map((version) => version.formNumber).join(', ')}
                          className="inline-flex rounded-md bg-[#F6F3FB] px-2 py-1 text-xs font-bold text-[#42277C]"
                        >
                          {dealFormVersions.length} form{dealFormVersions.length === 1 ? '' : 's'}
                        </span>
                      )}
                      {deal.tasks.length > 0 && (
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {openTasks} open / {doneTasks} done tasks
                        </span>
                      )}
                      {deal.reminders.length > 0 && (
                        <span className="inline-flex rounded-md bg-[#FEF8CC] px-2 py-1 text-xs font-bold text-[#645600]">
                          {openReminders} open / {doneReminders} done reminders
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-bold">Deal</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Stage</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Effective Date</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Closing Date</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Forms</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Tasks</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Reminders</th>
                    <th scope="col" className="py-2 pl-4" aria-label="Open deal" />
                  </tr>
                </thead>
                <tbody>
                  {activeDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      onClick={() => {
                        focusDeal(deal.id);
                        setFormsStatusDealId(deal.id);
                      }}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-[#F6F3FB] ${deal.id === activeDealId ? 'bg-[#F6F3FB]' : ''}`}
                    >
                      <td className="py-3 pr-4">
                        <span className="block font-semibold text-slate-900">{deal.propertyAddress || deal.title}</span>
                        {(deal.buyerNames || deal.sellerNames) && (
                          <span className="mt-0.5 block text-xs text-slate-500">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ')}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{TREC_DEAL_WORKFLOW_STATUS_LABELS[deal.workflowStatus]}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{deal.effectiveDate ? formatDate(deal.effectiveDate) : '—'}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        {deal.closingDate ? formatDate(deal.closingDate) : '—'}
                        <span data-testid={`text-closing-countdown-${deal.id}`} className="block text-xs font-bold text-[#301D5D]">
                          {closingCountdownLabel(deal.closingDate, today)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
                          if (dealFormVersions.length === 0) return <span className="text-slate-400">—</span>;
                          return (
                            <span
                              title={dealFormVersions.map((version) => version.formNumber).join(', ')}
                              className="inline-flex rounded-md bg-[#F6F3FB] px-2 py-1 text-xs font-bold text-[#42277C]"
                            >
                              {dealFormVersions.length} form{dealFormVersions.length === 1 ? '' : 's'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          if (deal.tasks.length === 0) return <span className="text-slate-400">—</span>;
                          const openCount = deal.tasks.filter((task) => !task.complete).length;
                          const doneCount = deal.tasks.length - openCount;
                          return (
                            <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                              {openCount} open / {doneCount} done
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          if (deal.reminders.length === 0) return <span className="text-slate-400">—</span>;
                          const openCount = deal.reminders.filter((reminder) => !reminder.complete).length;
                          const doneCount = deal.reminders.length - openCount;
                          return (
                            <span className="inline-flex rounded-md bg-[#FEF8CC] px-2 py-1 text-xs font-bold text-[#645600]">
                              {openCount} open / {doneCount} done
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {workspacePage === 2 && closedDeals.length > 0 && (
          <section {...collapsible('closed')} className="mt-6 rounded-xl border border-[#E6E5EC] bg-white p-[1.125rem]">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Closed & Audit</p>
                <h3 className="mt-1 text-xl font-semibold text-gray-900">{closedDeals.length} Closed Deal{closedDeals.length === 1 ? '' : 's'}</h3>
              </div>
              <CollapseToggle {...toggleProps('closed', 'closed deals')} className="ml-auto" />
            </div>
            {/* Mobile cards */}
            <div className="mt-5 divide-y divide-slate-100 md:hidden">
              {closedDeals.map((deal) => {
                const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
                return (
                  <button
                    type="button"
                    key={deal.id}
                    onClick={() => {
                      focusDeal(deal.id);
                      setFormsStatusDealId(deal.id);
                    }}
                    className={`block w-full py-3 text-left transition hover:bg-[#F6F3FB] ${deal.id === activeDealId ? 'bg-[#F6F3FB]' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="flex items-center gap-2 truncate font-semibold text-slate-900">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="truncate">{deal.propertyAddress || deal.title}</span>
                        </span>
                        {(deal.buyerNames || deal.sellerNames) && (
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ')}</span>
                        )}
                      </div>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-slate-400">Outcome</div>
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">{deal.closeoutOutcome}</span>
                      </div>
                      <div>
                        <div className="text-slate-400">Closing Date</div>
                        <div className="text-slate-700">{deal.closeoutDate ? formatDate(deal.closeoutDate) : '—'}</div>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      {dealFormVersions.length === 0 ? (
                        <span className="text-xs text-slate-400">No forms</span>
                      ) : (
                        <span
                          title={dealFormVersions.map((version) => version.formNumber).join(', ')}
                          className="inline-flex rounded-md bg-[#F6F3FB] px-2 py-1 text-xs font-bold text-[#42277C]"
                        >
                          {dealFormVersions.length} form{dealFormVersions.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-bold">Deal</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Outcome</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Closing Date</th>
                    <th scope="col" className="py-2 pr-4 font-bold">Forms</th>
                    <th scope="col" className="py-2 pl-4" aria-label="Open deal" />
                  </tr>
                </thead>
                <tbody>
                  {closedDeals.map((deal) => (
                    <tr
                      key={deal.id}
                      onClick={() => {
                        focusDeal(deal.id);
                        setFormsStatusDealId(deal.id);
                      }}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-[#F6F3FB] ${deal.id === activeDealId ? 'bg-[#F6F3FB]' : ''}`}
                    >
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-2 font-semibold text-slate-900">
                          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          {deal.propertyAddress || deal.title}
                        </span>
                        {(deal.buyerNames || deal.sellerNames) && (
                          <span className="mt-0.5 block text-xs text-slate-500">{[deal.buyerNames, deal.sellerNames].filter(Boolean).join(' · ')}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">{deal.closeoutOutcome}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">{deal.closeoutDate ? formatDate(deal.closeoutDate) : '—'}</td>
                      <td className="py-3 pr-4">
                        {(() => {
                          const dealFormVersions = activePacketForms.filter((version) => deal.selectedFormFamilies[version.formFamily]);
                          if (dealFormVersions.length === 0) return <span className="text-slate-400">—</span>;
                          return (
                            <span
                              title={dealFormVersions.map((version) => version.formNumber).join(', ')}
                              className="inline-flex rounded-md bg-[#F6F3FB] px-2 py-1 text-xs font-bold text-[#42277C]"
                            >
                              {dealFormVersions.length} form{dealFormVersions.length === 1 ? '' : 's'}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}


        {workspacePage === 2 && activeDeal && (
          <>
          <div className="mt-6 grid min-w-0 gap-6">
            <div {...collapsible('tasks')} className="rounded-2xl border border-[#E6E5EC] bg-white">
              <div className="flex items-center gap-3 px-[1.125rem] py-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#7A7787]">Tasks And Reminders</p>
                  <h3 className="mt-1 text-sm font-semibold text-[#1B1726]">{activeDeal.tasks.filter((t) => !t.complete).length + activeDeal.reminders.filter((r) => !r.complete).length} Open Of {activeDeal.tasks.length + activeDeal.reminders.length}</h3>
                </div>
                <CollapseToggle {...toggleProps('tasks', 'tasks and reminders')} className="ml-auto" />
              </div>
              <div className="grid min-w-0 gap-3 border-y border-[#E6E5EC] bg-[#F6F3FB] px-[1.125rem] py-3 sm:grid-cols-[minmax(0,1fr)_150px_120px_auto]">
                <input value={taskTitle} onChange={(event) => { setTaskTitle(event.target.value); if (taskError) setTaskError(''); }} aria-label="Task name" aria-invalid={taskError ? true : undefined} aria-describedby={taskError ? 'task-name-error' : undefined} className="h-10 min-w-0 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm outline-none focus:border-[#301D5D]" placeholder="Add a deal task" />
                <input type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} aria-label="Task due date" className="h-10 min-w-0 w-full rounded-md border border-[#E6E5EC] bg-white px-3 text-sm outline-none focus:border-[#301D5D]" />
                <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as TrecTaskPriority)} aria-label="Task priority" className="h-10 min-w-0 w-full rounded-md border border-[#E6E5EC] bg-white px-2 text-sm outline-none focus:border-[#301D5D]">{TREC_TASK_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</option>)}</select>
                <button type="button" onClick={addTask} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#E6E5EC] bg-white px-4 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]"><Plus className="rnn-inline-icon" aria-hidden="true" />Add</button>
              </div>
              {taskError && <p id="task-name-error" role="alert" className="border-b border-[#E6E5EC] bg-[#FFEAE6] px-[1.125rem] py-2 text-[13px] text-[#661102]">{taskError}</p>}
              
              <div>
                {!activeDeal.tasks.length && !activeDeal.reminders.length ? <p className="px-[1.125rem] py-6 text-sm text-[#7A7787]">Use deadline presets (7d, 3d, 1d, due) in the review step or add a custom action here.</p> : <>
                  {activeDeal.reminders.map((reminder) => <div key={reminder.id} className="flex flex-wrap items-center gap-3 border-t border-[#E6E5EC] bg-[#FEF8CC]/50 px-[1.125rem] py-3 first:border-t-0"><button type="button" onClick={() => updateReminder(reminder.id, { complete: !reminder.complete })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${reminder.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#645600] bg-white text-transparent'}`} aria-label={`Mark ${reminder.label} reminder ${reminder.complete ? 'incomplete' : 'complete'}`}>{reminder.complete && <Check className="h-4 w-4" aria-hidden="true" />}</button><span className={`min-w-0 flex-1 text-sm font-semibold ${reminder.complete ? 'text-[#7A7787] line-through' : 'text-[#1B1726]'}`}>{reminder.label}{reminder.note ? <span className="block text-xs font-normal text-slate-600">{reminder.note}</span> : null}</span><span className="text-xs font-bold text-[#645600]">{formatDate(reminder.reminderDate)}</span></div>)}
                  {activeDeal.tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-3 border-t border-[#E6E5EC] px-[1.125rem] py-3 first:border-t-0 hover:bg-[#F6F3FB]"><button type="button" onClick={() => updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done', complete: task.status !== 'done' })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${task.complete ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#B9B6C4] bg-white text-transparent'}`} aria-label={`Mark ${task.title} ${task.complete ? 'incomplete' : 'complete'}`}>{task.complete && <Check className="h-4 w-4" aria-hidden="true" />}</button><span className={`min-w-0 flex-1 text-sm font-semibold ${task.complete ? 'text-[#7A7787] line-through' : 'text-[#1B1726]'}`}>{task.title}</span><span className={`rounded-md px-2 py-1 text-xs font-medium ${task.priority === 'critical' ? 'bg-[#FFEAE6] text-[#661102]' : task.priority === 'high' ? 'bg-[#FEF8CC] text-[#645600]' : 'bg-[#EFEAF8] text-[#301D5D]'} capitalize`}>{task.priority}</span><select value={task.status} onChange={(event) => { const status = event.target.value as TrecTaskStatus; updateTask(task.id, { status, complete: status === 'done' || status === 'skipped' }); }} aria-label={`Status for ${task.title}`} className="h-9 rounded-md border border-[#E6E5EC] bg-white px-2 text-[13px] font-medium text-[#4A4757]">{TREC_TASK_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}</select>{task.dueDate && <span className={`text-xs font-medium ${task.dueDate < today && !task.complete ? 'text-[#661102]' : 'text-slate-500'}`}>{formatDate(task.dueDate)}</span>}{!isDealLocked(activeDeal) && <button type="button" onClick={() => removeTask(task.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#7A7787] hover:!bg-[#EFEAF8] hover:!text-[#661102]" aria-label={`Remove ${task.title}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div>)}
                </>}
              </div>
            </div>

            <ReadinessChecklist
              side={effectiveAgentSide(activeDeal)}
              documents={activeDeal.documents}
              documentName={documentName}
              setDocumentName={setDocumentName}
              addDocument={addDocument}
              updateDocument={updateDocument}
              reviewAlerts={reviewAlerts}
              uploadDocumentFile={uploadDocumentFile}
              removeDocumentFile={removeDocumentFile}
              documentUploadBusyId={documentUploadBusyId}
              documentUploadError={documentUploadError}
            />
          </div>
          <section {...collapsible('audit')} className="mt-6 rounded-xl border border-[#E6E5EC] bg-white p-[1.125rem]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Audit</p>
                  <h3 className="mt-1 text-xl font-semibold text-gray-900">
                    {isDealLocked(activeDeal) ? `${activeDeal.propertyAddress || activeDeal.title}, Closed & Audit` : 'Deal History, Audit and Closeout'}
                  </h3>
                </div>
                <CollapseToggle {...toggleProps('audit', 'audit')} className="ml-auto" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => exportAuditPdf(activeDeal)} className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D]"><Download className="h-4 w-4" aria-hidden="true" />Download PDF</button>
                {isDealLocked(activeDeal) && (
                  <button type="button" onClick={() => exportBackupRecord(activeDeal)} className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white"><Download className="h-4 w-4" aria-hidden="true" />Download Backup Record</button>
                )}
                {isDealLocked(activeDeal) && (
                  <button type="button" onClick={() => void exportDealFolder(activeDeal)} disabled={dealFolderBusy} className="inline-flex min-h-[40px] items-center gap-2 rounded-md border border-[#7059A8] px-4 text-sm font-bold text-[#301D5D] disabled:opacity-50">
                    {dealFolderBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FolderDown className="h-4 w-4" aria-hidden="true" />}
                    {dealFolderBusy ? 'Building Folder\u2026' : 'Download Folder'}
                  </button>
                )}
                {!isDealLocked(activeDeal) && (
                  <button type="button" onClick={lockDealRecord} className="inline-flex min-h-[40px] items-center gap-2 rounded-md bg-[#661102] px-4 text-sm font-bold text-white"><Lock className="h-4 w-4" aria-hidden="true" />Lock Record</button>
                )}
              </div>
              {dealFolderError ? (
                <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#661102]"><AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{dealFolderError}</p>
              ) : null}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Under <a href="https://www.trec.texas.gov/how-long-does-license-holder-have-keep-financial-and-real-estate-transactions-file" target="_blank" rel="noreferrer" className="font-semibold text-[#301D5D] underline">TREC Rules 535.2(h) and 535.146</a>, a broker must keep transaction records and trust account logs for four years from the date of closing, contract termination, or the date of a deposit/withdrawal.
            </p>
            {/* Google Drive integration disabled — panel intentionally not rendered. */}
            {isDealLocked(activeDeal) && (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#42277C]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {activeDeal.auditLocked && !(Boolean(activeDeal.closeoutOutcome && activeDeal.closeoutDate) && isDealFullyComplete(activeDeal))
                  ? 'Manually locked for audit retention.'
                  : `Closed on ${formatDate(activeDeal.closeoutDate)}.`}
                {' '}This record is locked and retained for at least four years — tasks and this deal can no longer be removed.
              </p>
            )}
            {Boolean(activeDeal.closeoutOutcome) && !isDealFullyComplete(activeDeal) && (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#645600]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Outcome set to {activeDeal.closeoutOutcome}, but this deal stays in Deals In Progress and unlocked until every task, reminder, and readiness document is marked complete.
              </p>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select value={activeDeal.closeoutOutcome} onChange={(event) => updateActiveDeal('closeoutOutcome', event.target.value)} disabled={isDealLocked(activeDeal)} aria-label="Closeout outcome" className="min-h-[44px] border border-slate-300 bg-white px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"><option value="">Closeout Outcome</option><option value="closed">Closed</option><option value="cancelled">Cancelled</option><option value="withdrawn">Withdrawn</option><option value="expired">Expired</option></select>
              <input type="date" value={activeDeal.closeoutDate} onChange={(event) => updateActiveDeal('closeoutDate', event.target.value)} disabled={isDealLocked(activeDeal)} aria-label="Closeout date" className="min-h-[44px] border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" />
              <input value={activeDeal.closeoutNote} onChange={(event) => updateActiveDeal('closeoutNote', event.target.value)} disabled={isDealLocked(activeDeal)} aria-label="Closeout note" className="min-h-[44px] border border-slate-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500" placeholder="Closeout note" />
            </div>
            {activeDeal.closeoutOutcome === 'closed' && (
              <TestimonialRequest
                address={activeDeal.propertyAddress}
                onSent={(how) => {
                  const now = new Date().toISOString();
                  persistDeals(deals.map((d) => d.id === activeDeal.id
                    ? { ...d, updatedAt: now, activity: [...d.activity, { id: getId('activity'), message: `Testimonial request ${how} for ${activeDeal.propertyAddress || 'this deal'}`, createdAt: now }].slice(-300) }
                    : d));
                }}
                emails={activeDeal.clientContacts.map((c) => c.email.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))}
              />
            )}
            <ul className="mt-4 max-h-52 space-y-2 overflow-auto">{[...activeDeal.activity].reverse().map((item) => <li key={item.id} className="border-l-2 border-[#FAD800] bg-[#FCFBF9] px-3 py-2 text-sm text-slate-700"><span className="font-bold text-slate-900">{formatTimestamp(item.createdAt)}</span> · {item.message}</li>)}</ul>
          </section>
          </>
        )}

          </div>
          </div>
        </div>

        {isCameraOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-camera-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4"
          >
            <div className="w-full max-w-2xl rounded-md bg-white p-4 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="contract-camera-title" className="text-xl font-semibold text-slate-950">Take a Contract Photo</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Place the page inside the frame and keep all text in focus.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-xl text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close camera"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-md bg-slate-950">
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-[4/3] w-full object-contain"
                />
              </div>

              {cameraError && (
                <p role="alert" className="mt-3 rounded-md border border-[#FAD800] bg-[#FEF8CC] px-3 py-2 text-sm leading-6 text-[#645600]">
                  {cameraError}
                </p>
              )}

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(false)}
                  className="inline-flex h-[42px] items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    contractCameraInputRef.current?.click();
                    setIsCameraOpen(false);
                  }}
                  className="inline-flex h-[42px] items-center justify-center rounded-md border border-[#7059A8] bg-white px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#EFEAF8]"
                >
                  Device Camera
                </button>
                <button
                  type="button"
                  onClick={captureContractPhoto}
                  disabled={Boolean(cameraError)}
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277C] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Camera className="rnn-inline-icon" aria-hidden="true" />
                  Take Picture
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <input
        ref={rowUploadInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a PDF or image for the selected form"
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          const family = rowUploadFamilyRef.current ?? undefined;
          rowUploadFamilyRef.current = null;
          input.value = '';
          if (file && family) setFormModalOpen(true);
          await extractContract(file, family);
        }}
      />
      {formModalOpen && activeDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`${currentTrecFormVersion.formNumber} form`} onClick={() => setFormModalOpen(false)}>
          <div className="flex max-h-full w-full max-w-[1120px] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{currentTrecFormVersion.formFamily.startsWith('custom-') ? 'Form' : 'TREC Form'}</p>
                <h3 className="truncate text-base font-semibold text-slate-900">{currentTrecFormVersion.formNumber} · {currentTrecFormVersion.title}</h3>
              </div>
              <button type="button" aria-label="Close" onClick={() => setFormModalOpen(false)} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-4">
              {extractionState === 'extracting' && <p role="status" className="mb-3 border border-[#E6E5EC] bg-[#F6F3FB] px-3 py-2 text-sm text-slate-700">Reading your upload...</p>}
              {extractionState === 'error' && <p role="alert" className="mb-3 border border-[#FF2A04] bg-[#FFEAE6] px-3 py-2 text-sm text-[#661102]">{extractionError || 'The upload could not be read. Use a clear PDF or image smaller than 15 MB, then try again.'}</p>}
              {renderExtractionReview()}
              {extractionWarnings.length > 0 && (
                <ul className="mb-3 list-disc space-y-1 border-l-2 border-[#FAD800] pl-6 text-xs leading-5 text-[#645600]">
                  {extractionWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              )}
              {renderFormWindow()}
            </div>
          </div>
        </div>
      )}
      {paymentFor && <DealPaymentWindow dealId={paymentFor.dealId} kind={paymentFor.kind} extensions={paymentFor.extensions} onPaid={paymentFor.finish} onCancel={() => setPaymentFor(null)} />}
      {newDealPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Start a new deal" onClick={() => setNewDealPickerOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Start A New Deal</h3>
              <button type="button" aria-label="Close" onClick={() => setNewDealPickerOpen(false)} className="text-slate-500 hover:text-slate-900"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            {pickerStep === 'type' ? (
              <>
                <p className="mt-1 text-sm text-slate-500">Choose the deal type.</p>
                <div className="mt-4 grid gap-2">
                  {([['purchase', 'Purchase'], ['listing_sale', 'Listing For Sale'], ['listing_lease', 'Listing For Lease'], ['lease', 'Lease']] as const).map(([type, label]) => (
                    <button key={type} type="button" onClick={() => { if (type === 'purchase') { setPickerStep('side'); return; } createDeal(type); setNewDealPickerOpen(false); setWorkspacePage(2); setDeskView('transaction'); }} className="ds-provider-tile !min-h-[44px] !flex-row !justify-start !px-4 text-sm font-medium">{label}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-slate-500">Are You The Listing Agent Or The Buyer&apos;s Agent?</p>
                <div className="mt-4 grid gap-2">
                  {([['listing', 'Listing Agent'], ['buyer', "Buyer's Agent"]] as const).map(([side, label]) => (
                    <button key={side} type="button" onClick={() => { createDeal('purchase', side); setNewDealPickerOpen(false); setPickerStep('type'); setWorkspacePage(2); setDeskView('transaction'); }} className="ds-provider-tile !min-h-[44px] !flex-row !justify-start !px-4 text-sm font-medium">{label}</button>
                  ))}
                </div>
                <div className="mt-3"><button type="button" onClick={() => setPickerStep('type')}>Back</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
