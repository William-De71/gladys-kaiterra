// -----------------------------------------------------------------------------
// Entry point of the Kaiterra external integration.
//
// Brings the indoor air quality measured by Kaiterra devices (Sensedge,
// Sensedge Mini, Laser Egg…) into Gladys, through the official Kaiterra API
// (a key per user):
//   - devices: one per configured device, with the AQI of the particles, its
//     level, PM2.5, PM10, CO₂, TVOC, temperature, humidity and whatever else
//     the device measures (src/device.js);
//   - scene triggers: air quality changed, reference value exceeded and back
//     to normal, device offline or back, sensor module worn;
//   - scene action: read the air of a device;
//   - dashboard widgets: air quality now, 24-hour history.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Kaiterra integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
