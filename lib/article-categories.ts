export const ARTICLE_CATEGORIES = [
  'Austin Board of REALTORS (ABOR)',
  'Five Points Board of REALTORS (Five Points)',
  "Women's Council of REALTORS San Antonio",
  "Women's Council of REALTORS Austin",
  'Greater San Antonio Builders Association (GSABA)',
  'Home Builders Association of Austin (HBA Austin)',
  'San Antonio Board of REALTORS (SABOR)',
  "Editor's Choice",
  'Featured Partner',
  'Faces of Real Estate',
  'Residential Real Estate Council (RRC)',
] as const;

export type ArticleCategory = typeof ARTICLE_CATEGORIES[number];
export type ArticlePublication = 'austin' | 'san_antonio';

const [abor, fivePoints, wcrSanAntonio, wcrAustin, gsaba, hbaAustin, sabor,
  editorsChoice, featuredPartner, faces, rrc] = ARTICLE_CATEGORIES;

const aliases: Record<string, ArticleCategory> = {
  abor,
  'austin board of realtors': abor,
  'five points': fivePoints,
  'five points board of realtors': fivePoints,
  'wcr san antonio': wcrSanAntonio,
  'wcr austin': wcrAustin,
  'womens council of realtors san antonio': wcrSanAntonio,
  'womens council of realtors austin': wcrAustin,
  gsaba,
  'greater san antonio builders association': gsaba,
  'hba austin': hbaAustin,
  'home builders association of austin': hbaAustin,
  sabor,
  'san antonio board of realtors': sabor,
  "editor's choice": editorsChoice,
  'featured partners': featuredPartner,
  'featured advertiser': featuredPartner,
  'featured advertisers': featuredPartner,
  'featured partner': featuredPartner,
  'faces of real estate': faces,
  rrc,
  'residential real estate council': rrc,
};

export function canonicalArticleCategory(value: string, publication?: string): string {
  const clean = value.trim().replace(/\s+/g, ' ').replace(/[’‘]/g, "'");
  const key = clean.toLocaleLowerCase('en-US').replace(/[®™]/g, '').trim();
  if (key === "women's council of realtors" || key === 'womens council of realtors') {
    return publication === 'san_antonio' ? wcrSanAntonio : publication === 'austin' ? wcrAustin : clean;
  }
  return aliases[key] ?? ARTICLE_CATEGORIES.find((category) => category.toLocaleLowerCase('en-US') === key) ?? clean;
}

export function articleCategoriesForPublication(publication: ArticlePublication): ArticleCategory[] {
  return publication === 'austin'
    ? [abor, fivePoints, wcrAustin, hbaAustin, editorsChoice, featuredPartner, faces, rrc]
    : [wcrSanAntonio, gsaba, sabor, editorsChoice, featuredPartner, faces, rrc];
}
