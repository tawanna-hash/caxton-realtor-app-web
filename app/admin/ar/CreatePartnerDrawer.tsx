'use client';

import { useState } from 'react';
import { DrawerFooter, DrawerShell, Field, Section } from '@/app/admin/billing/_components/DrawerShell';
import { INPUT } from '@/app/admin/billing/_components/constants';

type Props = {
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

const PAYMENT_METHODS = ['Select a primary payment method', 'ACH / bank transfer', 'Check', 'Credit card', 'Cash', 'Other'];
const TERMS = ['Due on receipt', 'Net 10', 'Net 15', 'Net 30', 'Net 60'];

export function CreatePartnerDrawer({ onClose, onSaved, onError }: Props) {
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [title, setTitle] = useState('');
  const [suffix, setSuffix] = useState('');
  const [company, setCompany] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [fax, setFax] = useState('');
  const [other, setOther] = useState('');
  const [website, setWebsite] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [checkName, setCheckName] = useState('');
  const [isSubClient, setIsSubClient] = useState(false);
  const [address, setAddress] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('United States');
  const [sameShipping, setSameShipping] = useState(true);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [terms, setTerms] = useState('Net 30');
  const [deliveryOption, setDeliveryOption] = useState('Email');
  const [invoiceLanguage, setInvoiceLanguage] = useState('English');
  const [salesTax, setSalesTax] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState('');
  const [preferredContact, setPreferredContact] = useState('');
  const [industry, setIndustry] = useState('');

  const save = async () => {
    const name = displayName.trim() || company.trim() || [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!name) {
      onError('Enter a partner display name, company name, or contact name.');
      return;
    }

    setSaving(true);
    try {
      const createResponse = await fetch('/api/admin/advertisers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact_email: email.trim() || null,
          publication: 'both',
          status: 'advertiser',
        }),
      });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !created.advertiser?.id) {
        throw new Error(created.error ?? 'Could not create partner.');
      }

      const supplementaryNotes = [
        notes.trim(),
        middleName.trim() && `Middle name: ${middleName.trim()}`,
        suffix.trim() && `Suffix: ${suffix.trim()}`,
        cc.trim() && `Email CC: ${cc.trim()}`,
        bcc.trim() && `Email BCC: ${bcc.trim()}`,
        fax.trim() && `Fax: ${fax.trim()}`,
        other.trim() && `Other phone: ${other.trim()}`,
        checkName.trim() && `Name to print on checks: ${checkName.trim()}`,
        isSubClient && 'Sub-client: Yes',
        country.trim() && `Country: ${country.trim()}`,
        !sameShipping && 'Shipping address differs from billing address',
        paymentMethod && `Primary payment method: ${paymentMethod}`,
        terms && `Terms: ${terms}`,
        deliveryOption && `Sales form delivery: ${deliveryOption}`,
        invoiceLanguage && `Invoice language: ${invoiceLanguage}`,
        salesTax.trim() && `Sales tax exemption: ${salesTax.trim()}`,
        openingBalance.trim() && `Opening balance: ${openingBalance.trim()} as of ${openingDate}`,
        source.trim() && `Source: ${source.trim()}`,
        referredBy.trim() && `Referred by: ${referredBy.trim()}`,
        role.trim() && `Role: ${role.trim()}`,
        preferredContact.trim() && `Preferred contact method: ${preferredContact.trim()}`,
      ].filter(Boolean).join('\n');

      const patchResponse = await fetch(`/api/admin/advertisers/${created.advertiser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'client',
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          company: company.trim() || null,
          title: title.trim() || jobTitle.trim() || null,
          industry: industry.trim() || null,
          phone: phone.trim() || mobile.trim() || null,
          office_phone: mobile.trim() || null,
          website: website.trim() || null,
          address: address.trim() || null,
          address_2: address2.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          zip: zip.trim() || null,
          notes: supplementaryNotes || null,
        }),
      });
      if (!patchResponse.ok) {
        const patched = await patchResponse.json().catch(() => ({}));
        throw new Error(patched.error ?? 'Partner was created, but some details could not be saved.');
      }

      onSaved();
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not create partner.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell title="Create partner" subtitle="Client profile and billing defaults" onClose={onClose}>
      <Section title="Name and contact">
        <div className="grid grid-cols-12 gap-3">
          <Field label="Title" className="col-span-3"><input className={INPUT} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="First name" className="col-span-5"><input className={INPUT} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field>
          <Field label="Middle name" className="col-span-4"><input className={INPUT} value={middleName} onChange={(event) => setMiddleName(event.target.value)} /></Field>
          <Field label="Last name" className="col-span-8"><input className={INPUT} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field>
          <Field label="Suffix" className="col-span-4"><input className={INPUT} value={suffix} onChange={(event) => setSuffix(event.target.value)} /></Field>
          <Field label="Company name" className="col-span-12"><input className={INPUT} value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
          <Field label="Partner display name" className="col-span-12"><input className={INPUT} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Required if company and contact name are blank" /></Field>
          <Field label="Email" className="col-span-6"><input type="email" className={INPUT} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Phone number" className="col-span-6"><input className={INPUT} value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
          <Field label="Cc" className="col-span-6"><input type="email" className={INPUT} value={cc} onChange={(event) => setCc(event.target.value)} /></Field>
          <Field label="Bcc" className="col-span-6"><input type="email" className={INPUT} value={bcc} onChange={(event) => setBcc(event.target.value)} /></Field>
          <Field label="Mobile number" className="col-span-6"><input className={INPUT} value={mobile} onChange={(event) => setMobile(event.target.value)} /></Field>
          <Field label="Fax" className="col-span-6"><input className={INPUT} value={fax} onChange={(event) => setFax(event.target.value)} /></Field>
          <Field label="Other" className="col-span-6"><input className={INPUT} value={other} onChange={(event) => setOther(event.target.value)} /></Field>
          <Field label="Website" className="col-span-6"><input type="url" className={INPUT} value={website} onChange={(event) => setWebsite(event.target.value)} /></Field>
          <Field label="Name to print on checks" className="col-span-7"><input className={INPUT} value={checkName} onChange={(event) => setCheckName(event.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={isSubClient} onChange={(event) => setIsSubClient(event.target.checked)} />Is a sub-client</label>
      </Section>

      <Section title="Communication permissions">
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-5 text-center">
          <div className="text-sm font-medium text-gray-800">Enter an email to record client consent.</div>
          <p className="mt-1 text-xs text-gray-500">If this partner has opted in to receive email marketing communications, acknowledge it after adding an email.</p>
        </div>
      </Section>

      <Section title="Addresses">
        <div className="text-sm font-medium text-gray-800">Billing address</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Street address 1"><input className={INPUT} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
          <Field label="Street address 2"><input className={INPUT} value={address2} onChange={(event) => setAddress2(event.target.value)} /></Field>
          <Field label="City"><input className={INPUT} value={city} onChange={(event) => setCity(event.target.value)} /></Field>
          <Field label="State"><input className={INPUT} value={state} onChange={(event) => setState(event.target.value)} /></Field>
          <Field label="ZIP code"><input className={INPUT} value={zip} onChange={(event) => setZip(event.target.value)} /></Field>
          <Field label="Country"><input className={INPUT} value={country} onChange={(event) => setCountry(event.target.value)} /></Field>
        </div>
        <div className="pt-2 text-sm font-medium text-gray-800">Shipping address</div>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={sameShipping} onChange={(event) => setSameShipping(event.target.checked)} />Add billing address as the shipping address</label>
        <select className={INPUT} value={sameShipping ? 'same' : 'different'} onChange={(event) => setSameShipping(event.target.value === 'same')}>
          <option value="same">Same as billing address</option>
          <option value="different">Use a different shipping address</option>
        </select>
      </Section>

      <Section title="Notes and attachments">
        <Field label="Notes"><textarea className={`${INPUT} resize-y`} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
        <label className="block rounded-md border border-dashed border-orange-200 px-4 py-5 text-center text-sm text-orange-700 hover:bg-orange-50">
          Add attachment
          <input type="file" className="sr-only" />
          <span className="mt-1 block text-xs text-gray-500">Max file size: 20 MB</span>
        </label>
      </Section>

      <Section title="Payments">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary payment method"><select className={INPUT} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{PAYMENT_METHODS.map((option) => <option key={option} value={option.startsWith('Select') ? '' : option}>{option}</option>)}</select></Field>
          <Field label="Terms"><select className={INPUT} value={terms} onChange={(event) => setTerms(event.target.value)}>{TERMS.map((option) => <option key={option}>{option}</option>)}</select></Field>
          <Field label="Sales form delivery option"><select className={INPUT} value={deliveryOption} onChange={(event) => setDeliveryOption(event.target.value)}><option>Email</option><option>Print later</option><option>None</option></select></Field>
          <Field label="Invoice language"><select className={INPUT} value={invoiceLanguage} onChange={(event) => setInvoiceLanguage(event.target.value)}><option>English</option><option>Spanish</option></select></Field>
        </div>
      </Section>

      <Section title="Additional info">
        <Field label="Sales tax exemption details"><input className={INPUT} value={salesTax} onChange={(event) => setSalesTax(event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening balance"><input type="number" step="0.01" className={INPUT} value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} /></Field>
          <Field label="As of"><input type="date" className={INPUT} value={openingDate} onChange={(event) => setOpeningDate(event.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Relationships and sales">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source"><input className={INPUT} value={source} onChange={(event) => setSource(event.target.value)} /></Field>
          <Field label="Referred by"><input className={INPUT} value={referredBy} onChange={(event) => setReferredBy(event.target.value)} /></Field>
          <Field label="Job title"><input className={INPUT} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field>
          <Field label="Role"><input className={INPUT} value={role} onChange={(event) => setRole(event.target.value)} /></Field>
          <Field label="Preferred contact method"><select className={INPUT} value={preferredContact} onChange={(event) => setPreferredContact(event.target.value)}><option value="">Select</option><option>Email</option><option>Phone</option><option>Text</option></select></Field>
          <Field label="Industry"><input className={INPUT} value={industry} onChange={(event) => setIndustry(event.target.value)} /></Field>
        </div>
      </Section>

      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={save} submitLabel="Save partner" tone="orange" />
    </DrawerShell>
  );
}
