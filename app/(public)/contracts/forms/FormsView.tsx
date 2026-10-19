'use client';

import { useState } from 'react';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import { TREC_FORM_LIBRARY_CATEGORIES, type TrecFormLibraryCategory } from '@/lib/trec-forms-library';
import TrecFormsLibrary from '../../agents/TrecFormsLibrary';
import SidebarWindow from '../SidebarWindow';

export default function FormsView({ versions }: { versions: TrecFormVersion[] }) {
  const [category, setCategory] = useState<'All Forms' | TrecFormLibraryCategory>('All Forms');
  return (
    <SidebarWindow
      label="TREC form categories"
      items={TREC_FORM_LIBRARY_CATEGORIES.map((c) => ({ id: c, label: c }))}
      selected={category}
      onSelect={(id) => setCategory(id as 'All Forms' | TrecFormLibraryCategory)}
    >
      <section className="rounded-lg border border-[#D9D2E9] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#301D5D]">{category === 'All Forms' ? 'TREC Library' : category}</h2>
        <TrecFormsLibrary versions={versions} embedded category={category} hideCategoryTabs />
      </section>
    </SidebarWindow>
  );
}
