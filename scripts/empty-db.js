const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkCounts() {
  const counts = {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    clientTags: await prisma.clientTag.count(),
    consents: await prisma.whatsappConsent.count(),
    templates: await prisma.messageTemplate.count(),
    templateVersions: await prisma.templateVersion.count(),
    campaigns: await prisma.campaign.count(),
    campaignRecipients: await prisma.campaignRecipient.count(),
    campaignTransitions: await prisma.campaignStateTransition.count(),
    messageLogs: await prisma.messageLog.count(),
    webhookEvents: await prisma.webhookEvent.count(),
    mediaAssets: await prisma.mediaAsset.count(),
    automationRules: await prisma.automationRule.count(),
    automationExecutions: await prisma.automationExecution.count(),
    auditLogs: await prisma.auditLog.count(),
    applicationSettings: await prisma.applicationSetting.count(),
    notificationChannels: await prisma.notificationChannel.count(),
  };
  return counts;
}

async function emptyDatabase() {
  console.log('--- BEFORE EMPTYING ---');
  console.log(await checkCounts());

  console.log('\nEmptying tables in foreign-key safe order, retaining only User records...');

  await prisma.$transaction([
    prisma.campaignRecipient.deleteMany({}),
    prisma.campaignStateTransition.deleteMany({}),
    prisma.campaign.deleteMany({}),
    prisma.messageLog.deleteMany({}),
    prisma.webhookEvent.deleteMany({}),
    prisma.automationExecution.deleteMany({}),
    prisma.automationRule.deleteMany({}),
    prisma.templateVersion.deleteMany({}),
    prisma.messageTemplate.deleteMany({}),
    prisma.mediaAsset.deleteMany({}),
    prisma.whatsappConsent.deleteMany({}),
    prisma.clientTag.deleteMany({}),
    prisma.client.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.notificationChannel.deleteMany({}),
  ]);

  console.log('\n--- AFTER EMPTYING ---');
  console.log(await checkCounts());

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, accountStatus: true },
  });
  console.log('\nRetained Users & Roles:');
  console.table(users);

  await prisma.$disconnect();
}

emptyDatabase().catch(async (e) => {
  console.error('Error emptying database:', e);
  await prisma.$disconnect();
  process.exit(1);
});
