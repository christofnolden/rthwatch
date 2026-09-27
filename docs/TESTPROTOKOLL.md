# RTH Watch v2 – Implementierungs- und Teststatus

**Stand:** 27.09.2026

## Übernommener Ausgangscode

Die Ausgangsbasis `RotorWatch-v1.0.0` wurde vollständig entpackt. Die ursprünglichen Quelldateien und Tests wurden gesichtet, insbesondere `src/parse.js`, `src/feed.js`, `src/sync.js`, `src/db.js`, `public/` und `test/`.

- **Übernommen:** Stationsauswahl und HTML-Detailparser (`src/parse.js`), Text-/Registrierungsnormalisierung (`src/util.js`), UI-Design aus `public/`, ausgewählte v1-Regressionstests.
- **Für Pages angepasst:** `src/feed.js`, neue datenbankfreie Import-/Merge-Pipeline, statischer Frontend-Datenabruf, neue Status-/Versionsanzeigen.
- **Entfallen (v2):** Dockerfile, Docker Compose, `src/server.js`, `src/scheduler.js`, SQLite-Datenbank und frühere servergebundene CLI. Die v1-Docker-Version wird durch die neue GitHub-Version nicht automatisch ersetzt.

## Vor Auslieferung lokal geprüft

| Prüfung | Ergebnis |
|---|---|
| Vollständige statische JS-Syntax-Prüfung mit `node --check` | Bestanden |
| GitHub-Workflow-YAML auf Struktur und Cron-/Zeitzoneneinträge geprüft | Bestanden |
| Unabhängig ausführbare JS-Tests für `src/feed.js`, `src/util.js`, `src/validation.js` und statische Seitenpfade | 6/6 bestanden |
| Backup-Wiederherstellung über den Pages-JSON-Fallback mit synthetischem 15-Stationen-Snapshot | Bestanden |
| Browser-UI mit synthetischen Testdaten: Datenanzeige, Tabellenzeilen, Filter, Favoriten | Bestanden |
| Responsive Desktop- und Mobile-Renderprüfung (Headless Chromium, direkt injiziertes Test-JSON) | Bestanden |
| GitHub-Actions-Test mit rth.info-Übersicht und zwei Detailseiten | Vor dem ersten v2-Deployment erfolgreich ausgeführt |

## Noch auf dem echten GitHub-Runner zu verifizieren

Ein **vollständiger externer Liveimport** aller realen Stationsseiten konnte in der Erstellungsumgebung wegen fehlendem Internet-/npm-Registry-Zugriff **nicht** ausgeführt werden. Entsprechend konnten die Cheerio-abhängigen Parser- und Pipeline-Regressionstests in dieser Umgebung nicht gestartet werden; sie sind im Paket enthalten und werden bei **jedem GitHub-Actions-Lauf** durch `npm test` automatisch geprüft.

Beim ersten `full`-Durchlauf auf GitHub deshalb prüfen:

1. Schließt die Stufe `Unit tests` erfolgreich ab?
2. Meldet `Overview: ... matching stations` die erwartete Größenordnung?
3. Zeigt der abschließende Build eine plausible Stations- und ICAO-Anzahl?
4. Ist `Deploy website` erfolgreich und wird das JSON in Pages erreichbar?
5. Werden manuelle Änderungen bei einem folgenden `publish`-Run ohne externen Crawl sichtbar?

Diese Unterscheidung ist wichtig: Eine Code-/Syntax- und Browserprüfung ersetzt keinen erfolgreichen vollständigen Integrationstest mit den realen Datenquellen auf GitHub.
