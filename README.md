# RTH Watch 🚁

**Version 2.1.0 · GitHub Pages Edition**

RTH Watch ist ein unabhängiges, responsives Web-Dashboard für Rettungs- und Intensivtransporthubschrauber. Es führt öffentlich gemeldete Stationsinformationen zusammen, ordnet den zuletzt gemeldeten Luftfahrzeugkennzeichen ICAO-Adressen zu und erzeugt Direktlinks zu ADS-B Exchange und Airplanes.live. Der Schwerpunkt liegt auf deutschen Luftrettungsstationen sowie ausgewählten benachbarten Stationen.

> **Datenhinweis:** Die angezeigten Luftfahrzeuge entsprechen den zuletzt bei rth.info gemeldeten Sichtungen. RTH Watch ermittelt weder aktuelle Besatzungen noch eine verlässliche Echtzeit-Zuordnung von Maschinen zu Stationen. Auch ein gültiger Tracking-Link bestätigt keinen aktuellen Flug.

## Funktionen

- **Stationsverzeichnis:** Rufname, Luftfahrzeugkennzeichen, Ort, Betreiber, Standard-Hubschraubertyp, letzte Sichtung und Original-Stationslink.
- **Stationsauswahl:** RTH-, Dual-Use- und ITH-Kategorien sowie ergänzende Rufnamen mit den Präfixen `Christoph `, `Lifeliner` und `Air Rescue`; `Christophorus` ist ausgeschlossen.
- **Tracking-Links:** Automatische Zuordnung Registrierung → ICAO-Hexcode und Verlinkung zu ADS-B Exchange und Airplanes.live.
- **Browserfavoriten:** Stationsbezogene Favoriten in einem eigenen Bereich, ausschließlich lokal im jeweiligen Browser gespeichert. Beide Anbieter können alle Favoriten mit gültiger ICAO-Adresse gemeinsam auf einer Karte anzeigen; doppelte ICAO-Adressen werden nur einmal übernommen. Suche und Filter beeinflussen das Sammeltracking nicht.
- **Übersichtliche Oberfläche:** Responsives Dark-Mode-Design mit Suche und Filtern.
- **Automatische Aktualisierung:** GitHub Actions importiert Stations- und ICAO-Daten; GitHub Pages veröffentlicht das statische Dashboard.
- **Ausfallsicherheit:** Wiederherstellung aus vorherigen Datensnapshots, Plausibilitätsprüfungen und manuelle Korrekturen für Registrierungen und ICAO-Adressen.

## Datenquellen

| Datenquelle | Verwendung | Geplante Aktualisierung (Europe/Berlin) |
|---|---|---|
| [rth.info – Stationsdatenbank](https://www.rth.info/stationen.db/stationen.php) | Stations-IDs, Rufnamen, Standorte, Betreiber, Hubschraubertypen, zuletzt gemeldete Registrierungen | 10:07, 14:07 und 18:07 Uhr |
| [wiedehopf/tar1090-db](https://github.com/wiedehopf/tar1090-db) | Zuordnung von Registrierungen zu ICAO-Hexcodes | 09:33 Uhr; bei neuen unbekannten Kennzeichen ggf. zusätzlich |
| [ADS-B Exchange](https://globe.adsbexchange.com/) | Externe Zielseite für ICAO-Direktlinks | Kein automatischer Abruf durch RTH Watch |
| [Airplanes.live](https://globe.airplanes.live/) | Zweite externe Zielseite für dieselben ICAO-Codes | Kein automatischer Abruf durch RTH Watch |

Die Zeitangaben bezeichnen geplante Ausführungszeiten. GitHub Actions kann zeitgesteuerte Workflows verzögert oder bei hoher Auslastung gar nicht starten.

## Architektur

```text
rth.info ──────────┐
                  ├─> GitHub Actions (Node.js, Parser, Validierung)
tar1090-db ───────┘            │
                               ├─> Wiederherstellbarer Datensnapshot
Konfiguration/Overrides ──────┤
                               └─> Statischer Build: HTML / CSS / JS / JSON
                                              │
                                              v
                                        GitHub Pages
                                              │
                              Suche, Filter, Browserfavoriten
                                              │
                              Externe RTH-/Tracking-Links
```

Das veröffentlichte Dashboard benötigt weder einen laufenden Node.js-Dienst noch eine Datenbank oder eigene Backend-API. Automatisch generierte Daten werden als GitHub-Actions- und Pages-Artefakte verwaltet und **nicht** in den Quellcode-Branch committed.

## Bereitstellung

**Voraussetzungen:** GitHub-Repository mit Branch `main`, aktivierte GitHub Actions und GitHub Pages sowie Node.js 24 für die lokale Entwicklung. Die Bereitstellung erfordert keine zusätzlichen API-Schlüssel.

1. Projektdateien einschließlich versteckter Dateien (`.github/`, `.gitignore`) in das Repository übernehmen.
2. Lokal `npm install` und `npm test` ausführen und die erzeugte `package-lock.json` zusammen mit dem Quellcode committen.
3. In den Repository-Einstellungen unter **Settings → Pages** die Quelle **GitHub Actions** auswählen.
4. Unter **Actions → RTH Watch - update data and publish Pages** den Workflow einmalig manuell mit dem Modus `full` starten.
5. Nach erfolgreichen Build- und Deployment-Jobs die unter **Settings → Pages** angezeigte Website aufrufen.

Ein Push relevanter Änderungen auf `main` veröffentlicht die Anwendung mit dem letzten gültigen Datensatz erneut. Der erste Lauf führt bei fehlendem Datensatz automatisch einen vollständigen Import aus.

**Voraussetzung für den produktiven Einsatz:** Die Nutzungsbedingungen der externen Datenquellen müssen den geplanten automatisierten Abruf und die öffentliche Weiterveröffentlichung erlauben; gegebenenfalls ist eine Freigabe einzuholen.

## Lokal entwickeln und testen

```bash
npm install
npm test

# Nur bei bestehendem, zuvor generiertem Snapshot:
npm run build
python3 -m http.server 8080 -d dist
```

Ein vollständiger lokaler Liveimport ist mit `npm run sync:all` möglich. Er benötigt Netzwerkzugriff und ist nur bei zulässigem Datenabruf auszuführen. Der Build schreibt die Website nach `dist/`; bestehende Eingangsdaten für einen lokalen `publish`-Build liegen optional unter `.state/stations.json`.

## Verzeichnisstruktur

```text
.github/workflows/pages.yml     GitHub-Actions-Import und Pages-Deployment
config/                         Versionierte, optionale manuelle Zuordnungen
docs/                           Technische Dokumentation, Datenpflege, Teststatus
public/                         Statische Dashboard-Oberfläche
scripts/                        Importsteuerung und Snapshot-Wiederherstellung
src/                            Parser, Netzwerklayer, Validierung und Datenpipeline
test/                           Automatisierte Tests
.gitignore                      Ausschluss lokaler und generierter Laufzeitdaten
```

### Versionierte Konfiguration und generierte Daten

Die Dateien `config/hex-overrides.json` und `config/station-overrides.json` sind **bewusst versionierte Konfiguration**. Sie dienen der manuellen Korrektur von ICAO-Codes und Stationszuordnungen. Änderungen an diesen Dateien werden bei der nächsten Veröffentlichung berücksichtigt.

Die Verzeichnisse `dist/`, `.state/`, `data/` und `public/data/` sowie SQLite-Dateien sind durch `.gitignore` ausgeschlossen. Das automatische Backup liegt in GitHub-Actions-Artefakten; als zusätzliche Wiederherstellungsquelle dient der zuletzt veröffentlichte Pages-Datensatz.

## Dokumentation

- [Technische Dokumentation](docs/DOKUMENTATION.md)
- [Manuelle Stations- und ICAO-Zuordnungen](docs/MANUELLE-ZUORDNUNGEN.md)
- [Implementierungs- und Teststatus](docs/TESTPROTOKOLL.md)
- [Änderungsprotokoll](CHANGELOG.md)

**Projektstatus:** Die Parser- und vollständigen Integrationsläufe mit sämtlichen realen Stationen sind beim ersten produktiven GitHub-Actions-Import zu verifizieren. Ein erfolgreicher Konnektivitätstest allein ersetzt diesen Integrationstest nicht.

**Hinweis:** RTH Watch steht in keiner offiziellen Verbindung zu rth.info, ADS-B Exchange, Airplanes.live oder dem tar1090-db-Projekt. Externe Daten und Links bleiben von deren Verfügbarkeit und Nutzungsbedingungen abhängig.
