# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- **devices:** Kaiterra air quality monitors (Sensedge, Sensedge Mini, Laser Egg…) through the official Kaiterra API, read only, with an API key and the ids of the devices; one device each, offered once it answered, with the US AQI of the particles and its level, PM2.5, PM10, CO₂, TVOC, temperature, humidity, and, when the device measures them, pressure, NO₂, O₃, illuminance, motion and dew point
- **scenes:** triggers when the AQI level changes, when CO₂, TVOC, PM2.5, PM10, NO₂, O₃ or CO goes over its reference value or back below it, when a device goes offline or comes back, and when a sensor module wears out; an action that reads the air of a device, with a ready-made sentence
- **widgets:** the air quality now (AQI, CO₂, PM2.5, TVOC, temperature, advice) with a Refresh button, and the hourly averages of one measure over the last 24 hours
- **configuration:** API key with a guide, device ids, CO₂ and TVOC reference values, language, "Read now" and "Diagnostic" buttons; one request a minute reads every device
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README
