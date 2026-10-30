// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, AQI levels and their advice, widget
// contents, statuses, scene texts. Vocabulary of the Gladys interface
// (appareil / Gerät / dispositivo); German says "du", Spanish "usted". Device
// names given in the Kaiterra app are never translated.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  deviceName: {
    en: 'Kaiterra {name}',
    fr: 'Kaiterra {name}',
    de: 'Kaiterra {name}',
    es: 'Kaiterra {name}',
  },
  featureAqi: {
    en: 'Air quality index (AQI)',
    fr: 'Indice de qualité de l’air (AQI)',
    de: 'Luftqualitätsindex (AQI)',
    es: 'Índice de calidad del aire (AQI)',
  },
  featureAqiLevel: {
    en: 'Air quality',
    fr: 'Qualité de l’air',
    de: 'Luftqualität',
    es: 'Calidad del aire',
  },
  featurePm25: { en: 'PM2.5', fr: 'PM2,5', de: 'PM2,5', es: 'PM2,5' },
  featurePm10: { en: 'PM10', fr: 'PM10', de: 'PM10', es: 'PM10' },
  featureCo2: { en: 'CO₂', fr: 'CO₂', de: 'CO₂', es: 'CO₂' },
  featureTvoc: {
    en: 'Volatile organic compounds (TVOC)',
    fr: 'Composés organiques volatils (COVT)',
    de: 'Flüchtige organische Verbindungen (TVOC)',
    es: 'Compuestos orgánicos volátiles (COVT)',
  },
  featureTemperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  featureHumidity: { en: 'Humidity', fr: 'Humidité', de: 'Luftfeuchtigkeit', es: 'Humedad' },
  featurePressure: {
    en: 'Atmospheric pressure',
    fr: 'Pression atmosphérique',
    de: 'Luftdruck',
    es: 'Presión atmosférica',
  },
  featureNo2: {
    en: 'Nitrogen dioxide (NO₂)',
    fr: 'Dioxyde d’azote (NO₂)',
    de: 'Stickstoffdioxid (NO₂)',
    es: 'Dióxido de nitrógeno (NO₂)',
  },
  featureO3: { en: 'Ozone (O₃)', fr: 'Ozone (O₃)', de: 'Ozon (O₃)', es: 'Ozono (O₃)' },
  featureLight: { en: 'Illuminance', fr: 'Luminosité', de: 'Helligkeit', es: 'Luminosidad' },
  featureMotion: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
  featureDewPoint: {
    en: 'Dew point',
    fr: 'Point de rosée',
    de: 'Taupunkt',
    es: 'Punto de rocío',
  },

  // AQI levels (US EPA), full and short forms
  level_good: { en: 'Good', fr: 'Bonne', de: 'Gut', es: 'Buena' },
  level_moderate: { en: 'Moderate', fr: 'Moyenne', de: 'Mäßig', es: 'Moderada' },
  level_unhealthy_sensitive: {
    en: 'Unhealthy for sensitive groups',
    fr: 'Mauvaise pour les personnes sensibles',
    de: 'Ungesund für empfindliche Gruppen',
    es: 'Dañina para grupos sensibles',
  },
  level_unhealthy: { en: 'Unhealthy', fr: 'Mauvaise', de: 'Ungesund', es: 'Dañina' },
  level_very_unhealthy: {
    en: 'Very unhealthy',
    fr: 'Très mauvaise',
    de: 'Sehr ungesund',
    es: 'Muy dañina',
  },
  level_hazardous: { en: 'Hazardous', fr: 'Dangereuse', de: 'Gefährlich', es: 'Peligrosa' },
  short_good: { en: 'Good', fr: 'Bonne', de: 'Gut', es: 'Buena' },
  short_moderate: { en: 'Moderate', fr: 'Moyenne', de: 'Mäßig', es: 'Moderada' },
  short_unhealthy_sensitive: {
    en: 'Sensitive',
    fr: 'Sensibles',
    de: 'Empfindliche',
    es: 'Sensibles',
  },
  short_unhealthy: { en: 'Unhealthy', fr: 'Mauvaise', de: 'Ungesund', es: 'Dañina' },
  short_very_unhealthy: {
    en: 'Very unhealthy',
    fr: 'Très mauvaise',
    de: 'Sehr ungesund',
    es: 'Muy dañina',
  },
  short_hazardous: { en: 'Hazardous', fr: 'Dangereuse', de: 'Gefährlich', es: 'Peligrosa' },
  advice_good: {
    en: 'The air is clean.',
    fr: 'L’air est sain.',
    de: 'Die Luft ist sauber.',
    es: 'El aire está limpio.',
  },
  advice_moderate: {
    en: 'Acceptable; very sensitive people may react.',
    fr: 'Acceptable ; les personnes très sensibles peuvent réagir.',
    de: 'Akzeptabel; sehr empfindliche Menschen können reagieren.',
    es: 'Aceptable; las personas muy sensibles pueden reaccionar.',
  },
  advice_unhealthy_sensitive: {
    en: 'Sensitive people should limit their exposure; an air purifier helps.',
    fr: 'Les personnes sensibles devraient limiter leur exposition ; un purificateur aide.',
    de: 'Empfindliche Menschen sollten sich weniger aussetzen; ein Luftreiniger hilft.',
    es: 'Las personas sensibles deberían limitar su exposición; un purificador ayuda.',
  },
  advice_unhealthy: {
    en: 'Run an air purifier and find the source of the particles.',
    fr: 'Faites tourner un purificateur et cherchez la source des particules.',
    de: 'Lass einen Luftreiniger laufen und such die Quelle der Partikel.',
    es: 'Encienda un purificador y busque el origen de las partículas.',
  },
  advice_very_unhealthy: {
    en: 'Unhealthy for everyone: purify the air and avoid effort.',
    fr: 'Nocif pour tous : purifiez l’air et évitez les efforts.',
    de: 'Für alle ungesund: Luft reinigen und Anstrengung vermeiden.',
    es: 'Dañino para todos: purifique el aire y evite esfuerzos.',
  },
  advice_hazardous: {
    en: 'Hazardous: purify the air at once and limit your time in the room.',
    fr: 'Dangereux : purifiez l’air tout de suite et limitez le temps passé dans la pièce.',
    de: 'Gefährlich: Luft sofort reinigen und möglichst wenig im Raum bleiben.',
    es: 'Peligroso: purifique el aire ya y limite el tiempo en la habitación.',
  },

  // pollutants (scene texts)
  pollutant_co2: { en: 'CO₂', fr: 'CO₂', de: 'CO₂', es: 'CO₂' },
  pollutant_tvoc: { en: 'TVOC', fr: 'COVT', de: 'TVOC', es: 'COVT' },
  pollutant_pm25: { en: 'PM2.5', fr: 'PM2,5', de: 'PM2,5', es: 'PM2,5' },
  pollutant_pm10: { en: 'PM10', fr: 'PM10', de: 'PM10', es: 'PM10' },
  pollutant_no2: { en: 'NO₂', fr: 'NO₂', de: 'NO₂', es: 'NO₂' },
  pollutant_o3: { en: 'Ozone', fr: 'Ozone', de: 'Ozon', es: 'Ozono' },
  pollutant_co: {
    en: 'Carbon monoxide',
    fr: 'Monoxyde de carbone',
    de: 'Kohlenmonoxid',
    es: 'Monóxido de carbono',
  },

  // widgets
  measuredAt: { en: 'at {time}', fr: 'à {time}', de: 'um {time}', es: 'a las {time}' },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  noReading: {
    en: 'No reading yet from this device.',
    fr: 'Pas encore de mesure de cet appareil.',
    de: 'Noch keine Messung von diesem Gerät.',
    es: 'Todavía no hay medición de este dispositivo.',
  },
  noDeviceWidget: {
    en: 'No Kaiterra device: add its id in the configuration of the integration.',
    fr: 'Aucun appareil Kaiterra : ajoutez son identifiant dans la configuration de l’intégration.',
    de: 'Kein Kaiterra-Gerät: Trag seine ID in der Konfiguration der Integration ein.',
    es: 'Ningún dispositivo Kaiterra: añada su identificador en la configuración de la integración.',
  },
  noHistory: {
    en: 'No hourly average for the last 24 hours yet.',
    fr: 'Pas encore de moyenne horaire sur les dernières 24 heures.',
    de: 'Noch kein Stundenmittel der letzten 24 Stunden.',
    es: 'Todavía no hay promedios horarios de las últimas 24 horas.',
  },
  tileAqi: { en: 'AQI · {level}', fr: 'AQI · {level}', de: 'AQI · {level}', es: 'AQI · {level}' },
  tileTemperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  tileHumidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad' },
  humidityText: {
    en: 'Humidity {value} %',
    fr: 'Humidité {value} %',
    de: 'Luftfeuchtigkeit {value} %',
    es: 'Humedad {value} %',
  },
  overText: {
    en: 'Above its reference: {list}.',
    fr: 'Au-dessus de la référence : {list}.',
    de: 'Über dem Richtwert: {list}.',
    es: 'Por encima de la referencia: {list}.',
  },
  offlineText: {
    en: 'No new reading since {time}: is the device connected?',
    fr: 'Aucune nouvelle mesure depuis {time} : l’appareil est-il connecté ?',
    de: 'Keine neue Messung seit {time}: Ist das Gerät verbunden?',
    es: 'Ninguna medición nueva desde las {time}: ¿está conectado el dispositivo?',
  },
  moduleText: {
    en: 'Sensor module {module}: {lifetime} % of its life left.',
    fr: 'Module de capteur {module} : {lifetime} % de durée de vie restante.',
    de: 'Sensormodul {module}: noch {lifetime} % Lebensdauer.',
    es: 'Módulo de sensor {module}: le queda un {lifetime} % de vida útil.',
  },
  measure_aqi: { en: 'AQI', fr: 'AQI', de: 'AQI', es: 'AQI' },
  measure_co2: { en: 'CO₂', fr: 'CO₂', de: 'CO₂', es: 'CO₂' },
  measure_pm25: { en: 'PM2.5', fr: 'PM2,5', de: 'PM2,5', es: 'PM2,5' },
  measure_pm10: { en: 'PM10', fr: 'PM10', de: 'PM10', es: 'PM10' },
  measure_tvoc: { en: 'TVOC', fr: 'COVT', de: 'TVOC', es: 'COVT' },
  measure_temperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  measure_humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchte', es: 'Humedad' },
  seriesHourly: {
    en: '{measure}, hourly',
    fr: '{measure}, par heure',
    de: '{measure}, stündlich',
    es: '{measure}, por hora',
  },
  rowNow: { en: 'Now', fr: 'Maintenant', de: 'Jetzt', es: 'Ahora' },
  rowMax: {
    en: 'Highest in 24 h',
    fr: 'Maximum sur 24 h',
    de: 'Höchstwert in 24 Std.',
    es: 'Máximo en 24 h',
  },
  rowAverage: {
    en: 'Average in 24 h',
    fr: 'Moyenne sur 24 h',
    de: 'Mittel in 24 Std.',
    es: 'Promedio en 24 h',
  },
  refreshDone: {
    en: 'Read again: {value}.',
    fr: 'Relu : {value}.',
    de: 'Neu gelesen: {value}.',
    es: 'Leído de nuevo: {value}.',
  },
  refreshCached: {
    en: 'Already up to date: the device sends a reading every minute.',
    fr: 'Déjà à jour : l’appareil envoie une mesure par minute.',
    de: 'Schon aktuell: Das Gerät sendet jede Minute eine Messung.',
    es: 'Ya actualizado: el dispositivo envía una medición por minuto.',
  },

  // statuses
  statusConnected: {
    en: 'Connected to Kaiterra: {devices}.',
    fr: 'Connecté à Kaiterra : {devices}.',
    de: 'Mit Kaiterra verbunden: {devices}.',
    es: 'Conectado a Kaiterra: {devices}.',
  },
  deviceLine: {
    en: '{name} AQI {aqi} ({level})',
    fr: '{name} AQI {aqi} ({level})',
    de: '{name} AQI {aqi} ({level})',
    es: '{name} AQI {aqi} ({level})',
  },
  deviceOffline: {
    en: '{name} offline',
    fr: '{name} hors ligne',
    de: '{name} offline',
    es: '{name} sin conexión',
  },
  statusSomeFailing: {
    en: '{ok} of {total} devices read. {detail}',
    fr: '{ok} appareil(s) lu(s) sur {total}. {detail}',
    de: '{ok} von {total} Geräten gelesen. {detail}',
    es: '{ok} de {total} dispositivos leídos. {detail}',
  },
  statusNoDevice: {
    en: 'Key accepted. Add the ids of your Kaiterra devices in the configuration.',
    fr: 'Clé acceptée. Ajoutez les identifiants de vos appareils Kaiterra dans la configuration.',
    de: 'Schlüssel angenommen. Trag die IDs deiner Kaiterra-Geräte in der Konfiguration ein.',
    es: 'Clave aceptada. Añada los identificadores de sus dispositivos Kaiterra en la configuración.',
  },
  statusPaused: {
    en: 'Kaiterra asks to slow down: readings resume in a few minutes.',
    fr: 'Kaiterra demande de ralentir : les mesures reprennent dans quelques minutes.',
    de: 'Kaiterra bittet um weniger Anfragen: Die Messungen gehen in einigen Minuten weiter.',
    es: 'Kaiterra pide reducir el ritmo: las mediciones se reanudan en unos minutos.',
  },
  errNoKey: {
    en: 'Enter your Kaiterra API key in the configuration.',
    fr: 'Saisissez votre clé d’API Kaiterra dans la configuration.',
    de: 'Gib deinen Kaiterra-API-Schlüssel in der Konfiguration ein.',
    es: 'Introduzca su clave de API de Kaiterra en la configuración.',
  },
  errAuth: {
    en: 'Kaiterra refused the API key: check it at app.kaiterra.com (Account settings, API Keys).',
    fr: 'Kaiterra a refusé la clé d’API : vérifiez-la sur app.kaiterra.com (paramètres du compte, API Keys).',
    de: 'Kaiterra hat den API-Schlüssel abgelehnt: Prüf ihn auf app.kaiterra.com (Kontoeinstellungen, API Keys).',
    es: 'Kaiterra rechazó la clave de API: compruébela en app.kaiterra.com (ajustes de la cuenta, API Keys).',
  },
  errForbidden: {
    en: 'Device {position}: it belongs to an organization this key is not part of.',
    fr: 'Appareil {position} : il appartient à une organisation dont cette clé ne fait pas partie.',
    de: 'Gerät {position}: Es gehört zu einer Organisation, zu der dieser Schlüssel nicht gehört.',
    es: 'Dispositivo {position}: pertenece a una organización de la que esta clave no forma parte.',
  },
  errNotFound: {
    en: 'Device {position}: Kaiterra does not know this id (check it in the Kaiterra app).',
    fr: 'Appareil {position} : Kaiterra ne connaît pas cet identifiant (vérifiez-le dans l’appli Kaiterra).',
    de: 'Gerät {position}: Kaiterra kennt diese ID nicht (prüf sie in der Kaiterra-App).',
    es: 'Dispositivo {position}: Kaiterra no conoce este identificador (compruébelo en la app Kaiterra).',
  },
  errNoData: {
    en: 'Device {position}: no reading uploaded yet.',
    fr: 'Appareil {position} : aucune mesure envoyée pour l’instant.',
    de: 'Gerät {position}: noch keine Messung hochgeladen.',
    es: 'Dispositivo {position}: todavía no ha enviado ninguna medición.',
  },
  errRateLimit: {
    en: 'Kaiterra asks to slow down: try again in a few minutes.',
    fr: 'Kaiterra demande de ralentir : réessayez dans quelques minutes.',
    de: 'Kaiterra bittet um weniger Anfragen: Versuch es in einigen Minuten erneut.',
    es: 'Kaiterra pide reducir el ritmo: vuelva a intentarlo en unos minutos.',
  },
  errUnreachable: {
    en: 'Kaiterra cannot be reached ({detail}): check the Internet connection of Gladys.',
    fr: 'Kaiterra est injoignable ({detail}) : vérifiez la connexion Internet de Gladys.',
    de: 'Kaiterra ist nicht erreichbar ({detail}): Prüf die Internetverbindung von Gladys.',
    es: 'Kaiterra no responde ({detail}): compruebe la conexión a Internet de Gladys.',
  },
  errFailed: {
    en: 'Kaiterra answered with an error ({detail}).',
    fr: 'Kaiterra a répondu par une erreur ({detail}).',
    de: 'Kaiterra hat mit einem Fehler geantwortet ({detail}).',
    es: 'Kaiterra respondió con un error ({detail}).',
  },
  errInvalidIds: {
    en: 'Not a device id: {list}. An id has 32 hexadecimal digits, with or without dashes.',
    fr: 'Pas un identifiant d’appareil : {list}. Un identifiant compte 32 chiffres hexadécimaux, avec ou sans tirets.',
    de: 'Keine Geräte-ID: {list}. Eine ID hat 32 Hexadezimalziffern, mit oder ohne Bindestriche.',
    es: 'No es un identificador de dispositivo: {list}. Un identificador tiene 32 dígitos hexadecimales, con o sin guiones.',
  },
  errTooMany: {
    en: '{count} device(s) beyond the 20 the integration reads were left out.',
    fr: '{count} appareil(s) au-delà des 20 que lit l’intégration ont été ignorés.',
    de: '{count} Gerät(e) über die 20 hinaus, die die Integration liest, wurden ignoriert.',
    es: 'Se ignoraron {count} dispositivo(s) por encima de los 20 que lee la integración.',
  },
  readDone: {
    en: 'Read: {devices}',
    fr: 'Lu : {devices}',
    de: 'Gelesen: {devices}',
    es: 'Leído: {devices}',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the logs of the integration ({count} line(s), without the key nor the device ids).',
    fr: 'Diagnostic écrit dans les journaux de l’intégration ({count} ligne(s), sans la clé ni les identifiants des appareils).',
    de: 'Diagnose in die Logs der Integration geschrieben ({count} Zeile(n), ohne den Schlüssel und die Geräte-IDs).',
    es: 'Diagnóstico escrito en los registros de la integración ({count} línea(s), sin la clave ni los identificadores de los dispositivos).',
  },

  // scene action
  summaryNow: {
    en: 'Air in {name}: {level} (AQI {aqi}).',
    fr: 'Air de {name} : {level} (AQI {aqi}).',
    de: 'Luft in {name}: {level} (AQI {aqi}).',
    es: 'Aire en {name}: {level} (AQI {aqi}).',
  },
  summaryNoAqi: {
    en: 'Air in {name}:',
    fr: 'Air de {name} :',
    de: 'Luft in {name}:',
    es: 'Aire en {name}:',
  },
  summaryCo2: {
    en: 'CO₂ {value} ppm.',
    fr: 'CO₂ {value} ppm.',
    de: 'CO₂ {value} ppm.',
    es: 'CO₂ {value} ppm.',
  },
  summaryTvoc: {
    en: 'TVOC {value} ppb.',
    fr: 'COVT {value} ppb.',
    de: 'TVOC {value} ppb.',
    es: 'COVT {value} ppb.',
  },
  summaryTemperature: {
    en: '{temperature} °C.',
    fr: '{temperature} °C.',
    de: '{temperature} °C.',
    es: '{temperature} °C.',
  },
  summaryOffline: {
    en: 'Last reading at {time}: the device seems offline.',
    fr: 'Dernière mesure à {time} : l’appareil semble hors ligne.',
    de: 'Letzte Messung um {time}: Das Gerät scheint offline zu sein.',
    es: 'Última medición a las {time}: el dispositivo parece desconectado.',
  },
};

/**
 * @description Whether a value is one of the four languages.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('refreshDone', 'fr', { value: 'AQI 12' }); // 'Relu : AQI 12.'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The name of a level, full or short.
 * @param {string|null} level - The level key.
 * @param {string} language - The language.
 * @param {boolean} [short] - The short form (badges, tiles).
 * @returns {string} The name, '' without a level.
 */
const levelText = (level, language, short = false) =>
  level ? t(`${short ? 'short' : 'level'}_${level}`, language) : '';

/**
 * @description The name of a pollutant.
 * @param {string|null} pollutant - The pollutant key.
 * @param {string} language - The language.
 * @returns {string} The name.
 */
const pollutantText = (pollutant, language) =>
  pollutant ? t(`pollutant_${pollutant}`, language) : '';

/**
 * @description A decimal written the way of a language: "4,4" in French.
 * @param {number} value - The value.
 * @param {string} language - The language.
 * @param {number} [digits] - Fraction digits at most.
 * @returns {string} The text.
 */
const decimal = (value, language, digits = 1) =>
  new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);

export { LANGUAGES, TEXTS, isLanguage, t, all, levelText, pollutantText, decimal };
