export interface ClientFixture {
  fullName: string;
  whatsappNumber: string;
  email: string;
  categoryTier: 'RETAIL' | 'HNI' | 'CORPORATE' | 'PROSPECT';
  communicationConsent: 'OPTED_IN' | 'OPTED_OUT' | 'PENDING';
  preferredLanguage: string;
  dateOfBirth?: string;
  weddingAnniversary?: string;
}

export const VALID_PHONE_NUMBERS = [
  '+919876543210',
  '+919823456789',
  '+919123456780',
  '+919999900001',
  '+919999900002',
  '+919999900003',
  '+14155552671',
];

export const MALFORMED_PHONE_NUMBERS = [
  { description: 'Missing leading plus', number: '9876543210' },
  { description: 'Too short phone number', number: '+9198765' },
  { description: 'Too long phone number', number: '+91987654321099999' },
  { description: 'Contains letters', number: '+9198765ABCD0' },
  { description: 'Contains spaces and hyphens', number: '+91 98765-43210' },
  { description: 'Invalid country code prefix', number: '+00012345678' },
  { description: 'Empty string', number: '' },
];

export const SAMPLE_CLIENTS: ClientFixture[] = [
  {
    fullName: 'Rahul Sharma',
    whatsappNumber: '+919999900001',
    email: 'rahul.sharma@test.wealthtrade.in',
    categoryTier: 'HNI',
    communicationConsent: 'OPTED_IN',
    preferredLanguage: 'en',
    dateOfBirth: '1985-05-15',
    weddingAnniversary: '2012-11-20',
  },
  {
    fullName: 'Priya Patel',
    whatsappNumber: '+919999900002',
    email: 'priya.patel@test.wealthtrade.in',
    categoryTier: 'RETAIL',
    communicationConsent: 'OPTED_IN',
    preferredLanguage: 'gu',
    dateOfBirth: '1990-08-22',
    weddingAnniversary: '2018-02-14',
  },
  {
    fullName: 'Amitabh Verma',
    whatsappNumber: '+919999900003',
    email: 'amitabh.verma@test.wealthtrade.in',
    categoryTier: 'CORPORATE',
    communicationConsent: 'OPTED_IN',
    preferredLanguage: 'hi',
    dateOfBirth: '1978-01-30',
  },
  {
    fullName: 'Sunita Rao',
    whatsappNumber: '+919999900004',
    email: 'sunita.rao@test.wealthtrade.in',
    categoryTier: 'PROSPECT',
    communicationConsent: 'PENDING',
    preferredLanguage: 'en',
  },
  {
    fullName: 'Vikram Singh',
    whatsappNumber: '+919999900005',
    email: 'vikram.singh@test.wealthtrade.in',
    categoryTier: 'HNI',
    communicationConsent: 'OPTED_OUT',
    preferredLanguage: 'hi',
  },
];

export const VALID_CLIENTS_CSV = `full_name,whatsapp_number,email,category_tier,preferred_language,date_of_birth,wedding_anniversary
Rajesh Kumar,+919999900011,rajesh.k@test.wealthtrade.in,HNI,en,1982-04-10,2008-12-05
Ananya Sen,+919999900012,ananya.s@test.wealthtrade.in,RETAIL,en,1993-09-18,2020-01-25
Karthik Iyer,+919999900013,karthik.i@test.wealthtrade.in,CORPORATE,ta,1986-11-03,
Deepa Joshi,+919999900014,deepa.j@test.wealthtrade.in,PROSPECT,mr,1995-07-29,
Manish Gupta,+919999900015,manish.g@test.wealthtrade.in,HNI,hi,1980-03-12,2006-05-18`;

export const INVALID_CLIENTS_CSV = `full_name,whatsapp_number,email,category_tier,preferred_language,date_of_birth,wedding_anniversary
Invalid Phone,9876543210,invalid.phone@test.wealthtrade.in,HNI,en,1982-04-10,
Invalid Tier,+919999900016,bad.tier@test.wealthtrade.in,SUPER_VIP,en,1990-01-01,
Malformed Email,+919999900017,not-an-email,RETAIL,en,1995-05-05,
Missing Name,,empty.phone@test.wealthtrade.in,PROSPECT,en,,`;

export function generateClientsCsv(count: number, startIndex = 100): string {
  const lines = ['full_name,whatsapp_number,email,category_tier,preferred_language,date_of_birth,wedding_anniversary'];
  const tiers = ['RETAIL', 'HNI', 'CORPORATE', 'PROSPECT'];
  const languages = ['en', 'hi', 'gu', 'mr', 'ta'];

  for (let i = 0; i < count; i++) {
    const idx = startIndex + i;
    const phone = `+9199999${String(idx).padStart(5, '0')}`;
    const email = `test.user.${idx}@test.wealthtrade.in`;
    const tier = tiers[i % tiers.length];
    const lang = languages[i % languages.length];
    lines.push(`Test User ${idx},${phone},${email},${tier},${lang},1990-01-01,`);
  }

  return lines.join('\n');
}
