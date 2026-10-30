# Kaiterra

## Überblick

[Kaiterra](https://www.kaiterra.com) stellt Messgeräte für die Raumluftqualität her: den **Sensedge** und den **Sensedge Mini** für Büros und Wohnungen sowie die **Laser-Egg**-Familie. Je nach Modell und Sensormodulen messen sie **Feinstaub** (PM1, PM2,5, PM10), **CO₂**, **flüchtige organische Verbindungen** (TVOC), Temperatur, Luftfeuchtigkeit und manchmal Luftdruck, NO₂, Ozon, CO, Helligkeit und Bewegung. Jedes Gerät lädt jede Minute eine Messung in die Kaiterra-Cloud.

Diese Integration bringt sie über die offizielle [Kaiterra-API](https://dev.kaiterra.com) nach Gladys: ein Gerät pro Messgerät, Szenenauslöser, wenn die Luft schlechter wird, wenn ein Wert seinen Richtwert überschreitet oder wenn ein Messgerät offline geht, eine Szenenaktion und zwei Dashboard-Widgets. Sie liest nur: An deinen Geräten wird nichts geändert.

Der angezeigte **AQI** ist der US-Luftqualitätsindex der Partikel (der Index der Kaiterra-Apps), berechnet aus PM2,5 (Grenzen von 2024) und PM10: gut (0-50), mäßig (51-100), ungesund für empfindliche Gruppen (101-150), ungesund (151-200), sehr ungesund (201-300), gefährlich (301-500). Die Stufe ergibt sich immer aus dem Wert.

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer (Schlüsselwörter des Katalogs). Ältere Instanzen können die Integration nicht installieren.
- Ein oder mehrere Kaiterra-Geräte, in der Kaiterra-App eingerichtet und mit dem Internet verbunden.
- Ein Kaiterra-API-Schlüssel und die ID jedes Geräts (siehe unten).

### Einen API-Schlüssel erhalten

1. Melde dich auf [app.kaiterra.com](https://app.kaiterra.com) mit dem Konto an, zu dem deine Geräte gehören.
2. Öffne **Account Settings** (Kontoeinstellungen), dann **API Keys**, und klick auf **Generate API Key**. Kopier den Schlüssel.

Ein Gerät einer Organisation lässt sich nur mit einem Schlüssel lesen, den ein Mitglied dieser Organisation erstellt hat.

### Die ID eines Geräts finden

Die API kann deine Geräte nicht auflisten: Die Integration braucht die **eindeutige Geräte-ID** (UDID) jedes Geräts, 32 Hexadezimalziffern wie `46048117-86a7-488e-9c58-708f3470ee11`. Die Kaiterra-App zeigt sie in den Einstellungen des Geräts; ein Sensedge zeigt sie auch in seinen eigenen Einstellungen. Behandle sie wie ein Passwort: Veröffentliche sie nie.

## Konfiguration

| Feld                 | Was einzugeben ist                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| API-Schlüssel        | Der Schlüssel deines Kaiterra-Kontos. Als Geheimnis gespeichert, nie wieder angezeigt oder protokolliert.           |
| Geräte-IDs (UDID)    | Die ID jedes Geräts, mit oder ohne Bindestriche, getrennt durch Kommas, Leerzeichen oder Zeilenumbrüche. Bis zu 20. |
| CO₂-Richtwert (ppm)  | Darüber löst CO₂ den Auslöser „Richtwert überschritten“ aus und wird orange. Standard 1.000.                        |
| TVOC-Richtwert (ppb) | Dasselbe für die flüchtigen organischen Verbindungen. Standard 500.                                                 |
| Sprache der Texte    | Namen der Geräte und Texte für Szenen. Automatisch: die Sprache des zuletzt angezeigten Widgets.                    |

Zwei Knöpfe ergänzen die Seite: **Jetzt lesen** (prüft den Schlüssel und liest sofort jedes Gerät, mit seinem Namen und seinen Sensormodulen) und **Diagnose** (der Zustand der Integration in ihren Logs, ohne den Schlüssel und die Geräte-IDs).

Die anderen Richtwerte sind die WHO-Leitlinien von 2021:

| Schadstoff | Richtwert | Grundlage des WHO-Werts     |
| ---------- | --------- | --------------------------- |
| PM2,5      | 15 µg/m³  | 24-Stunden-Mittel           |
| PM10       | 45 µg/m³  | 24-Stunden-Mittel           |
| NO₂        | 25 µg/m³  | 24-Stunden-Mittel           |
| Ozon       | 100 µg/m³ | 8-Stunden-Mittel            |
| CO         | 3,5 ppm   | 24-Stunden-Mittel (4 mg/m³) |

Die Integration vergleicht sie mit der letzten Messung, wie es ein Messgerät tut: ein Hinweis, keine amtliche Messung.

## Verwendung

### Geräte

Öffne den Reiter **Entdecken** der Integration und leg ein Gerät pro Messgerät an („Kaiterra Office“), benannt nach der Kaiterra-App. Jedes Gerät bietet, was das Messgerät misst:

- **Luftqualitätsindex (AQI)** und **Luftqualität**, seine Stufe als Text;
- **PM2,5** und **PM10** (µg/m³), **CO₂** (ppm), **Flüchtige organische Verbindungen (TVOC)** (ppb);
- **Temperatur** (°C, bei Bedarf aus °F umgerechnet), **Luftfeuchtigkeit** (%);
- wenn das Messgerät sie hat: **Luftdruck** (hPa), **Stickstoffdioxid (NO₂)** und **Ozon (O₃)** (von ppb in µg/m³ umgerechnet), **Helligkeit** (lx), **Bewegung**, **Taupunkt**.

Ein Wert, den das Messgerät nicht hochgeladen hat, behält seinen letzten: Es wird keine 0 erfunden. Eine angebotene Funktion verschwindet nie. PM1 und CO haben in Gladys keine Kategorie: Sie stehen in der Szenenaktion.

Die Integration liest alle Geräte mit einer Anfrage pro Minute. Namen und Sensormodule liest sie alle 6 Stunden, die Stundenmittel der letzten 24 Stunden alle 30 Minuten.

### Dashboard-Widgets

![Das Widget Kaiterra-Luftqualität mit AQI, CO₂, PM2,5, TVOC und Temperatur, und das Widget Kaiterra über 24 Std. mit dem CO₂ der letzten 24 Stunden (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-kaiterra/main/docs/assets/widgets.de.png)

- **Kaiterra-Luftqualität**: der AQI in der Farbe seiner Stufe, dann CO₂, PM2,5, TVOC und die Temperatur (oder was das Messgerät misst), grün unter 90 % ihres Richtwerts, orange bis zum Doppelten, rot darüber; der Rat der Stufe, die Werte über ihrem Richtwert, die Luftfeuchtigkeit, ein Messgerät offline oder ein verbrauchtes Sensormodul; und ein Knopf **Aktualisieren**.
- **Kaiterra über 24 Std.**: ein Messwert (CO₂, AQI, PM2,5, PM10, TVOC, Temperatur oder Luftfeuchtigkeit) als Stundenmittel über die letzten 24 Stunden, mit dem aktuellen Wert, dem Mittel und der höchsten Stunde.

Beide haben die Einstellung **Gerät** (standardmäßig das erste).

### Szenen

Auslöser:

- **Kaiterra: Luftqualität geändert**: Die AQI-Stufe ändert sich und hält 5 Minuten an. Filter: Gerät, neue Stufe (eine oder mehrere), Richtung (schlechter, besser). Variablen: `aqi`, `level`, `level_name`, `previous_level`, `direction`, `pm25`, `pm10`, `name`.
- **Kaiterra: Richtwert überschritten**: CO₂, TVOC, PM2,5, PM10, NO₂, Ozon oder CO liegt 5 Minuten über seinem Richtwert. Filter: Gerät, Schadstoff. Variablen: `pollutant_name`, `value`, `unit`, `limit`, `percent`.
- **Kaiterra: wieder normal**: Dieser Wert bleibt 5 Minuten unter 90 % seines Richtwerts. Gleiche Filter und Variablen.
- **Kaiterra: Gerät offline oder zurück**: Ein Messgerät lädt 15 Minuten lang keine neue Messung hoch oder wieder eine. Filter: Gerät, Zustand. Variablen: `state`, `last_seen`, `minutes`.
- **Kaiterra: Sensormodul verbraucht**: Ein Sensormodul eines Sensedge hat weniger als 10 % Lebensdauer übrig. Variablen: `module`, `bay`, `lifetime`.

Aktion: **Kaiterra: Luft lesen** eines Geräts: der AQI und seine Stufe, alle Werte, der Zeitpunkt der Messung, online oder nicht, und ein fertiger Satz `summary`. Sie löst nie einen Auslöser aus.

Beispiele:

- Wenn **das CO₂ im Büro seinen Richtwert überschreitet** → `Öffne ein Fenster: CO₂ {{triggerEvent.data.value}} ppm` an dein Handy senden; wenn es **wieder normal** ist → eine kurze Bestätigung.
- Wenn **die Luftqualität ungesund wird** → den Luftreiniger auf volle Stufe stellen; wenn sie wieder **gut** ist → zurück auf Automatik.
- Wenn **ein Gerät offline geht** → eine Benachrichtigung, um sein WLAN zu prüfen.

### Transport

Cloud (`"transports": ["cloud"]`): Die Integration kontaktiert `api.kaiterra.com` über HTTPS mit deinem Schlüssel und den IDs deiner Geräte; Kaiterra hat ihre Messungen ohnehin. Sonst verlässt nichts dein Netzwerk. Die letzten Messungen, der Verlauf der letzten 24 Stunden und was die Auslöser schon gemeldet haben, bleiben im Volume `/data` der Integration: Ein Neustart löst nichts doppelt aus.

## Fehlerbehebung

- **Kaiterra hat den API-Schlüssel abgelehnt**: Kopier ihn erneut von app.kaiterra.com (ohne Leerzeichen) und speichere die Konfiguration.
- **Gerät N: Kaiterra kennt diese ID nicht**: Prüf die ID in der Kaiterra-App; die Position N ist die Reihenfolge der IDs in der Konfiguration.
- **Gerät N: Es gehört zu einer Organisation, zu der dieser Schlüssel nicht gehört**: Erstell den Schlüssel mit einem Konto dieser Organisation.
- **Keine Geräte-ID**: Eine ID hat 32 Hexadezimalziffern; ein Name oder eine Seriennummer ist keine.
- **Ein Gerät scheint offline**: Es hat seit 15 Minuten nichts hochgeladen. Prüf Stromversorgung und WLAN in der Kaiterra-App.
- **Immer noch ein Problem**: Drück **Diagnose** und eröffne ein Issue auf [GitHub](https://github.com/William-De71/gladys-kaiterra/issues) mit den Versionen von Gladys und der Integration und den Zeilen „Kaiterra diagnostic“ der Logs (im Entwicklermodus `DEBUG=gladys-integration-sdk` hinzufügen).

Daten bereitgestellt von Kaiterra. Diese Community-Integration ist nicht mit Kaiterra verbunden.
