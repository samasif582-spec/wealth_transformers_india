const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.CLIENT_EMULATOR_PORT ? parseInt(process.env.CLIENT_EMULATOR_PORT, 10) : 4020;
const MOCK_SERVER_URL = process.env.MOCK_SERVER_URL || 'http://localhost:4010';
const SUT_BACKEND_URL = process.env.SUT_BACKEND_URL || 'http://localhost:3000';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/config', (_req, res) => {
  res.json({
    mockServerUrl: MOCK_SERVER_URL,
    sutBackendUrl: SUT_BACKEND_URL,
    port: PORT,
  });
});

app.listen(PORT, () => {
  console.log(`[ClientEmulator] 📱 WhatsApp Client Emulator running on http://localhost:${PORT}`);
  console.log(`[ClientEmulator] 🔗 Connected to Mock WhatsApp Server at ${MOCK_SERVER_URL}`);
});
