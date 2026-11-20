import {
  PrismaClient,
  UserRole,
  AccountStatus,
  TemplateCategory,
  TemplateStatus,
  QualityRating,
  CategoryTier,
  ConsentStatus,
  ConsentSource,
  CampaignType,
  CampaignStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_USERS = [
  {
    email: 'superadmin@wealthtransformers.in',
    password: 'SuperAdmin@2026!',
    fullName: 'System Super Admin',
    role: UserRole.Super_Admin,
  },
  {
    email: 'admin@wealthtransformers.in',
    password: 'Admin@2026!',
    fullName: 'Operations Admin',
    role: UserRole.Admin,
  },
  // Legacy aliases for backward compatibility with older test harnesses
  {
    email: 'superadmin@wealthtrade.in',
    password: 'SuperAdmin@2026!',
    fullName: 'System Super Admin (Legacy)',
    role: UserRole.Super_Admin,
  },
  {
    email: 'admin@wealthtrade.in',
    password: 'Admin@2026!',
    fullName: 'Operations Admin (Legacy)',
    role: UserRole.Admin,
  },
];

async function main(): Promise<void> {
  console.log('🌱 Starting database seed with real production baseline...');

  // 1. Seed 5 Standard Role Accounts
  const seededUserMap: Record<string, string> = {};
  for (const u of SEED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        accountStatus: AccountStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        email: u.email,
        passwordHash,
        fullName: u.fullName,
        role: u.role,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    seededUserMap[u.role] = user.id;
    console.log(`✅ Seeded ${user.role}: ${user.email}`);
  }

  const superAdminId = seededUserMap[UserRole.Super_Admin];
  const adminId = seededUserMap[UserRole.Admin];
  const marketingId = adminId;

  // 2. Application Settings
  await prisma.applicationSetting.upsert({
    where: { key: 'meta_pricing' },
    update: {},
    create: {
      key: 'meta_pricing',
      value: [
        { category: 'MARKETING', rate_inr: 0.7854, effective_date: '2026-10-01', currency: 'INR' },
        { category: 'UTILITY', rate_inr: 0.1258, effective_date: '2026-10-01', currency: 'INR' },
        { category: 'AUTHENTICATION', rate_inr: 0.1258, effective_date: '2026-10-01', currency: 'INR' },
      ],
    },
  });

  await prisma.applicationSetting.upsert({
    where: { key: 'opt_out_keywords' },
    update: {},
    create: {
      key: 'opt_out_keywords',
      value: {
        en: ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'CANCEL'],
        hi: ['ROKO', 'BAND KARO', 'STOP'],
        gu: ['BANDH KARO', 'STOP'],
        mr: ['THAMBA', 'STOP'],
      },
    },
  });

  await prisma.applicationSetting.upsert({
    where: { key: 'worker_concurrency' },
    update: {},
    create: { key: 'worker_concurrency', value: 10 },
  });

  await prisma.applicationSetting.upsert({
    where: { key: 'meta_messages_per_second' },
    update: {},
    create: { key: 'meta_messages_per_second', value: 80 },
  });

  await prisma.applicationSetting.upsert({
    where: { key: 'gst_rate' },
    update: {},
    create: { key: 'gst_rate', value: 0.18 },
  });

  // 3. Approved Message Templates
  console.log('📝 Seeding WhatsApp Meta Templates...');

  const tplBirthday = await prisma.messageTemplate.upsert({
    where: { name: 'birthday_vip_wishes_v1' },
    update: {},
    create: {
      name: 'birthday_vip_wishes_v1',
      language: 'en',
      category: TemplateCategory.UTILITY,
      status: TemplateStatus.APPROVED,
      qualityRating: QualityRating.GREEN,
      metaTemplateId: 'meta_tpl_birthday_101',
      createdByUserId: marketingId,
      versions: {
        create: {
          versionNumber: 1,
          status: TemplateStatus.APPROVED,
          bodyText:
            'Happy Birthday {{1}}! On your special day, Wealth Transformers India Pvt Ltd extends warmest wishes for great health, prosperity and compounding success.',
          footerText: 'Wealth Transformers Customer Success Team',
          variableSchema: { '1': 'client.full_name' },
        },
      },
    },
  });

  const tplAnniversary = await prisma.messageTemplate.upsert({
    where: { name: 'wedding_anniversary_wishes_v1' },
    update: {},
    create: {
      name: 'wedding_anniversary_wishes_v1',
      language: 'en',
      category: TemplateCategory.UTILITY,
      status: TemplateStatus.APPROVED,
      qualityRating: QualityRating.GREEN,
      metaTemplateId: 'meta_tpl_anniversary_102',
      createdByUserId: marketingId,
      versions: {
        create: {
          versionNumber: 1,
          status: TemplateStatus.APPROVED,
          bodyText:
            'Dear {{1}}, congratulations on your wedding anniversary! Wishing you both joyful compounding, health and lifelong prosperity.',
          footerText: 'Wealth Transformers Advisory Desk',
          variableSchema: { '1': 'client.full_name' },
        },
      },
    },
  });

  const tplMarketOutlook = await prisma.messageTemplate.upsert({
    where: { name: 'wealth_market_alpha_v1' },
    update: {},
    create: {
      name: 'wealth_market_alpha_v1',
      language: 'en',
      category: TemplateCategory.MARKETING,
      status: TemplateStatus.APPROVED,
      qualityRating: QualityRating.GREEN,
      metaTemplateId: 'meta_tpl_alpha_103',
      createdByUserId: marketingId,
      versions: {
        create: {
          versionNumber: 1,
          status: TemplateStatus.APPROVED,
          bodyText:
            'Dear {{1}}, here is your daily stock market outlook for {{2}}. Key indices are trending positive with strong momentum in banking and energy. Visit: {{3}}',
          footerText:
            'Investments are subject to market risks. Read all scheme related documents carefully. SEBI Registered.',
          variableSchema: { '1': 'client.full_name', '2': 'campaign.date', '3': 'campaign.link' },
        },
      },
    },
  });

  const tplDiwali = await prisma.messageTemplate.upsert({
    where: { name: 'diwali_special_greeting_v1' },
    update: {},
    create: {
      name: 'diwali_special_greeting_v1',
      language: 'hi',
      category: TemplateCategory.MARKETING,
      status: TemplateStatus.APPROVED,
      qualityRating: QualityRating.GREEN,
      metaTemplateId: 'meta_tpl_diwali_104',
      createdByUserId: marketingId,
      versions: {
        create: {
          versionNumber: 1,
          status: TemplateStatus.APPROVED,
          bodyText:
            'प्रिय {{1}}, वेल्थ ट्रेड परिवार की ओर से आपको और आपके परिवार को दिवाली की हार्दिक शुभकामनाएँ! खुशहाली और समृद्धि की कामना करते हैं।',
          footerText:
            'Investments are subject to market risks. Read all scheme related documents carefully. SEBI Registered.',
          variableSchema: { '1': 'client.full_name' },
        },
      },
    },
  });

  console.log(`✅ Seeded 4 Meta Templates`);

  // 4. Seed Real Clients (including today's birthdays & anniversaries for instant test)
  console.log('👥 Seeding Client Directory (Real Records)...');

  const today = new Date();
  const currentMonth = today.getMonth(); // 0-indexed
  const currentDay = today.getDate();

  // Create date helper keeping month and day of today
  const birthdayToday = new Date(Date.UTC(1985, currentMonth, currentDay));
  const anniversaryToday = new Date(Date.UTC(2012, currentMonth, currentDay));

  const CLIENTS_DATA = [
    // 🎂 TODAY'S BIRTHDAYS (Will match n8n Birthday Automation)
    {
      fullName: 'Vikramaditya Singhania',
      whatsappNumber: '+919820123456',
      email: 'vikram.singhania@apexventures.in',
      dateOfBirth: birthdayToday,
      categoryTier: CategoryTier.HNI,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
    {
      fullName: 'Ananya Deshmukh',
      whatsappNumber: '+919819876543',
      email: 'ananya.d@fintechcap.com',
      dateOfBirth: birthdayToday,
      categoryTier: CategoryTier.CORPORATE,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'hi',
    },
    {
      fullName: 'Rajesh Kumar Patel',
      whatsappNumber: '+919723456789',
      email: 'rkpatel@gmail.com',
      dateOfBirth: birthdayToday,
      categoryTier: CategoryTier.RETAIL,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'gu',
    },

    // 💍 TODAY'S ANNIVERSARIES (Will match n8n Anniversary Automation)
    {
      fullName: 'Siddharth Roy Kapoor',
      whatsappNumber: '+919833445566',
      email: 'siddharth.kapoor@rkgroup.com',
      weddingAnniversary: anniversaryToday,
      categoryTier: CategoryTier.HNI,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
    {
      fullName: 'Pooja Bhattacharya',
      whatsappNumber: '+919822334455',
      email: 'pooja.b@kolkatainvest.in',
      weddingAnniversary: anniversaryToday,
      categoryTier: CategoryTier.RETAIL,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'hi',
    },

    // 🚫 OPTED_OUT CLIENT (Must be excluded from marketing per Property P1)
    {
      fullName: 'Meenakshi Sundaram',
      whatsappNumber: '+919444123456',
      email: 'meenakshi.s@chennaicapital.com',
      dateOfBirth: new Date(Date.UTC(1988, 11, 5)),
      categoryTier: CategoryTier.HNI,
      communicationConsent: ConsentStatus.OPTED_OUT,
      preferredLanguage: 'ta',
    },

    // GENERAL OPTED_IN CLIENTS
    {
      fullName: 'Gaurav Sharma',
      whatsappNumber: '+919910234567',
      email: 'gaurav.sharma@delhiinvest.com',
      dateOfBirth: new Date(Date.UTC(1995, 2, 30)),
      categoryTier: CategoryTier.PROSPECT,
      communicationConsent: ConsentStatus.PENDING,
      preferredLanguage: 'hi',
    },
    {
      fullName: 'Sunil Bharti Mittal',
      whatsappNumber: '+919811122233',
      email: 'sunil@bhartigroup.com',
      dateOfBirth: new Date(Date.UTC(1968, 9, 23)),
      categoryTier: CategoryTier.CORPORATE,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
    {
      fullName: 'Kavita Reddy',
      whatsappNumber: '+919848011223',
      email: 'kavita.reddy@gmail.com',
      dateOfBirth: new Date(Date.UTC(1984, 5, 14)),
      categoryTier: CategoryTier.HNI,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'te',
    },
    {
      fullName: 'Deepak Mehta',
      whatsappNumber: '+919825099887',
      email: 'deepak.mehta@fin.in',
      dateOfBirth: new Date(Date.UTC(1992, 0, 30)),
      categoryTier: CategoryTier.RETAIL,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'gu',
    },
    {
      fullName: 'Harish Chandra Verma',
      whatsappNumber: '+919450123987',
      email: 'hcverma@physics.in',
      dateOfBirth: new Date(Date.UTC(1972, 3, 8)),
      categoryTier: CategoryTier.RETAIL,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'hi',
    },
    {
      fullName: 'Nandini Swaminathan',
      whatsappNumber: '+919884012345',
      email: 'nandini.s@chennaicap.com',
      dateOfBirth: new Date(Date.UTC(1989, 7, 19)),
      categoryTier: CategoryTier.HNI,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'ta',
    },
    // SIT Synchronized Personas
    {
      fullName: 'Rajesh Sharma',
      whatsappNumber: '+919876543210',
      email: 'rajesh.sharma@example.com',
      dateOfBirth: new Date(Date.UTC(1985, 3, 12)),
      categoryTier: CategoryTier.HNI,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
    {
      fullName: 'Priya Patel',
      whatsappNumber: '+919876543211',
      email: 'priya.patel@example.com',
      dateOfBirth: new Date(Date.UTC(1992, 7, 15)),
      categoryTier: CategoryTier.RETAIL,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
    {
      fullName: 'Vikram Malhotra',
      whatsappNumber: '+919876543299',
      email: 'vikram.malhotra@example.com',
      dateOfBirth: new Date(Date.UTC(1980, 0, 1)),
      categoryTier: CategoryTier.RETAIL,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
    {
      fullName: 'Neha Gupta',
      whatsappNumber: '+919876543288',
      email: 'neha.gupta@example.com',
      dateOfBirth: new Date(Date.UTC(1994, 2, 21)),
      categoryTier: CategoryTier.CORPORATE,
      communicationConsent: ConsentStatus.OPTED_IN,
      preferredLanguage: 'en',
    },
  ];

  for (const c of CLIENTS_DATA) {
    const client = await prisma.client.upsert({
      where: { whatsappNumber: c.whatsappNumber },
      update: {
        fullName: c.fullName,
        email: c.email,
        dateOfBirth: c.dateOfBirth,
        weddingAnniversary: c.weddingAnniversary,
        categoryTier: c.categoryTier,
        communicationConsent: c.communicationConsent,
        preferredLanguage: c.preferredLanguage,
        accountStatus: AccountStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        fullName: c.fullName,
        whatsappNumber: c.whatsappNumber,
        email: c.email,
        dateOfBirth: c.dateOfBirth,
        weddingAnniversary: c.weddingAnniversary,
        categoryTier: c.categoryTier,
        communicationConsent: c.communicationConsent,
        preferredLanguage: c.preferredLanguage,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    // Create corresponding append-only consent record if none exists
    const existingConsent = await prisma.whatsappConsent.findFirst({
      where: { clientId: client.id },
    });
    if (!existingConsent) {
      await prisma.whatsappConsent.create({
        data: {
          clientId: client.id,
          consentStatus: c.communicationConsent,
          consentSource: ConsentSource.IMPORT,
          reason: 'Initial client onboarding consent',
          recordedByUserId: superAdminId,
        },
      });
    }
  }

  console.log(`✅ Seeded ${CLIENTS_DATA.length} real clients (including today's birthdays & anniversaries)`);

  // 5. Seed Initial Real Campaigns
  console.log('📢 Seeding Initial Broadcast Campaigns...');

  // Campaign 1: PENDING_APPROVAL for Admin dashboard gate
  await prisma.campaign.upsert({
    where: { name: 'Diwali Special Portfolio Advisory 2026' },
    update: {},
    create: {
      name: 'Diwali Special Portfolio Advisory 2026',
      campaignType: CampaignType.FESTIVAL,
      status: CampaignStatus.PENDING_APPROVAL,
      templateId: tplDiwali.id,
      resolvedRecipientCount: 8,
      estimatedCostInr: 7.41,
      createdByUserId: marketingId,
      description: 'Exclusive Diwali holiday market recommendations for retail & HNI investors',
    },
  });

  // Campaign 2: COMPLETED campaign with real logs
  await prisma.campaign.upsert({
    where: { name: 'Q3 Financial Markets Outlook & Alpha Strategy' },
    update: {},
    create: {
      name: 'Q3 Financial Markets Outlook & Alpha Strategy',
      campaignType: CampaignType.PROMOTIONAL,
      status: CampaignStatus.COMPLETED,
      templateId: tplMarketOutlook.id,
      resolvedRecipientCount: 7,
      estimatedCostInr: 6.48,
      dispatchedAt: new Date(Date.now() - 86400000),
      completedAt: new Date(Date.now() - 85000000),
      createdByUserId: marketingId,
      approvedByUserId: adminId,
      approvedAt: new Date(Date.now() - 87000000),
    },
  });

  console.log('✅ Seeded Broadcast Campaigns');
  console.log('');
  console.log('🎉 Real Baseline Seed Complete!');
  console.log('====================================================');
  console.log('5 Standard Role Accounts:');
  for (const u of SEED_USERS) {
    console.log(`  ${u.role.padEnd(20)}: ${u.email} / ${u.password}`);
  }
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
