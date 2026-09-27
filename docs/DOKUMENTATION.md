# RTH Watch v2.1.0 – Technische Dokumentation

**Zielplattform:** GitHub Pages + GitHub Actions  
**Bereitstellung:** Statisches Dashboard über GitHub Pages; Datenimport über GitHub Actions  
**Technologien:** JavaScript, HTML, CSS, Node.js 24, Cheerio, JSON  
**Zeitzone:** Europe/Berlin

> RTH Watch ist ein unabhängiges Informations-Dashboard. Es zeigt die **zuletzt bei rth.info gemeldete Maschine je Station**, keine gesicherte Echtzeit-Flottenzuordnung. Auch ein gültiger ADS-B-Link bestätigt weder einen Flug noch aktuelle Empfangsdaten.

## Inhaltsverzeichnis

1. [Zweck und Funktionsumfang](#1-zweck-und-funktionsumfang)
2. [Architektur und Datenhaltung](#2-architektur-und-datenhaltung)
3. [Datenquellen und Auswahlregeln](#3-datenquellen-und-auswahlregeln)
4. [Datenimport und Fehlerbehandlung](#4-datenimport-und-fehlerbehandlung)
5. [Zeitplan und manuelle Workflow-Modi](#5-zeitplan-und-manuelle-workflow-modi)
6. [Oberfläche und Browserfavoriten](#6-oberfläche-und-browserfavoriten)
7. [Konfiguration, Overrides und Prioritäten](#7-konfiguration-overrides-und-prioritäten)
8. [Datenspeicherung und Wiederherstellung](#8-datenspeicherung-und-wiederherstellung)
9. [Installation und Wartung](#9-installation-und-wartung)
10. [Grenzen und Sicherheitsaspekte](#10-grenzen-und-sicherheitsaspekte)
11. [Projektdateien und externe Referenzen](#11-projektdateien-und-externe-referenzen)

## 1. Zweck und Funktionsumfang

RTH Watch fasst öffentlich gemeldete Informationen zu Rettungs- und Intensivtransporthubschraubern in einer responsiven, durchsuchbaren Weboberfläche zusammen. Für jede relevante Station zeigt es Rufname, zuletzt gemeldete Registrierung, Ort bzw. Stationierungsort, Betreiber, Standard-Hubschraubertyp, Sichtungsdatum und einen Quellenlink auf die jeweilige Detailseite bei rth.info. Wo eine ICAO-Adresse bekannt ist, wird ein direkter Link auf die passende Maschine bei ADS-B Exchange erzeugt.

Die Oberfläche übernimmt das Dark-Mode-Design der ersten Docker-Version, heißt jetzt vollständig **RTH Watch** und nutzt keine eigene Server-API. Suche, Betreiber-/Kategoriefilter, mobile Ansicht und Sternfavoriten funktionieren vollständig im Browser. Favoriten erscheinen in einer separaten Liste oben auf der Hauptseite; sie sind an die **Stations-ID**, nicht das jeweilige Kennzeichen, gebunden.

**Wichtigste Unterschiede zu v1:** Der Node.js-Dauerdienst, der Docker-Container, die SQLite-Datenbank und der interne Scheduler entfallen. Stattdessen erfolgt die Datenerzeugung durch zeitgesteuerte GitHub-Actions-Jobs und die Veröffentlichung als statische Website mit JSON-Datei.

## 2. Architektur und Datenhaltung

```text
            Git-Quellrepository
                |
                v
            GitHub Repository (main)
                |
                v
            GitHub Actions (Node.js 24)
                |             |
                |             +---- Wiederherstellung des letzten Datensatzes:
                |                   1. GitHub Actions Backup-Artefakt
                |                   2. Letzte veröffentlichte Pages-JSON
                |
                +---- rth.info: Übersicht + Detailseiten
                +---- tar1090-db: Registrierung -> ICAO
                +---- config/: manuelle, versionierte Overrides
                |
                v
            Zusammenführen & validieren
                |
                +--> dist/data/stations.json (ephemeral im Runner)
                +--> Backup-Artefakt (90 Tage Retention)
                +--> GitHub Pages Deployment-Artefakt
                           |
                           v
            Öffentliche statische Website (GitHub Pages)
                |
                +--> data/stations.json (gleiche Origin)
                +--> localStorage (Favoriten je Browser)
                +--> Externe Links: RTH-Info / ADS-B Exchange
```

Der Build-Runner ist kurzlebig. **Weder SQLite-Dateien noch dynamische JSON-Dateien noch die große Flugzeugdatenbank werden in einen Git-Branch geschrieben.** Da diese Laufzeitdaten nicht in Git versioniert werden, können reguläre Quellcode-Pushes die Datensnapshots nicht als Git-Änderung überschreiben.

Das temporäre Verzeichnis `.state/` wird ausschließlich zum Einlesen eines bestehenden Backup-Datensatzes verwendet; `dist/` enthält das erzeugte Artefakt. Beide Ordner und mögliche Datenbankreste stehen in `.gitignore`.

### JSON-Datenmodell

Ein minimierter Ausschnitt der erzeugten Datei `data/stations.json`:

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-09-27T10:07:00.000Z",
  "sourceStations": [
    {
      "id": 1,
      "callsign": "Christoph 1",
      "registration": "D-HXAD",
      "sightingDate": "2026-09-27",
      "rthUrl": "https://www.rth.info/stationen.db/station.php?id=1&show=1"
    }
  ],
  "registrations": { "DHXAD": "3e0f5f" },
  "stations": [
    {
      "id": 1,
      "callsign": "Christoph 1",
      "registration": "D-HXAD",
      "icao": "3e0f5f",
      "assignmentSource": "rth.info",
      "adsbUrl": "https://globe.adsbexchange.com/?icao=3e0f5f"
    }
  ],
  "status": {
    "total": 1,
    "mapped": 1,
    "lastStationsSync": "2026-09-27T10:07:00.000Z",
    "lastAircraftSync": "2026-09-27T09:33:00.000Z",
    "lastStationsError": ""
  }
}
```

Dieser Ausschnitt ist **schematisch** und absichtlich auf wenige Felder reduziert; er stellt keine konkrete aktuelle Stationszuordnung dar. In Wirklichkeit enthalten `sourceStations` und `stations` weitere Angaben wie Kategorie, Ort, Betreiber, Typ und Stationierungsort. `sourceStations` enthält die letzten Originalangaben; `stations` ist die Anzeige **nach Anwendung manueller Overrides**. Das doppelte Modell ermöglicht es, einen Stations-Override später ohne erneuten Netzwerkabruf zu entfernen.

`registrations` enthält **nur aktuell benötigte** Kennungen, nicht die gesamte tar1090-Datenbank. Die komplette Download-Datei wird nach dem jeweiligen GitHub-Actions-Lauf verworfen.

## 3. Datenquellen und Auswahlregeln

### 3.1 rth.info – Stationen, Rufnamen und letzte Registrierungen

Quelle: `https://www.rth.info/stationen.db/stationen.php`

Die erste Docker-Version enthielt bereits einen HTML-Parser für die Stationsübersicht und die einzelnen Detailseiten. Dieser Parser ist in `src/parse.js` der v2 weiterhin enthalten. **Die vorhandenen ID-Links** werden ausgelesen; es wird nicht versucht, fortlaufende numerische `station.php?id=`-Adressen durchzuprobieren.

**Auswahlregeln:**

- Vollständig: **Rettungshubschrauber (RTH), Dual-Use-Hubschrauber und Intensivtransport-Hubschrauber (ITH)**.
- Zusätzlich Rufnamen mit Präfixen **`Christoph `, `Lifeliner` oder `Air Rescue`**, auch wenn sie in einer anderen Kategorie liegen.
- **`Christophorus` ausgeschlossen** (Wortgrenze nach `Christoph`, nicht nur eine Präfixsuche).
- Doppelte Links werden über die Stations-ID zusammengeführt.

Jede ausgewählte Detailseite liefert **Rufname**, **Ort**, **Betreiber**, ggf. **Stationierungsort**, **Standard-Hubschraubertyp**, **zuletzt gesichtete Maschine** und ggf. **Sichtungsdatum**. Zusätzlich erhält der Eintrag den direkten Quellenlink `https://www.rth.info/stationen.db/station.php?id=<ID>&show=1`.

Die Bezeichnung „Rufname“ im Dashboard stammt aus **rth.info**, nicht aus ADS-B-Telemetrie. Der Import liest **keine Live-ADS-B-Callsigns**.

### 3.2 tar1090-db – ICAO-Zuordnung

Projekt: `https://github.com/wiedehopf/tar1090-db`  
Datei: `https://raw.githubusercontent.com/wiedehopf/tar1090-db/master/db/regIcao.js`

Die Datenbank bietet ein Mapping von normalisierten Luftfahrzeugkennzeichen (`DHXAD`) auf sechsstellige ICAO-Hexcodes. Sie wird als JSON-Datei oder komprimierte GZIP-Datei verarbeitet und vor der Nutzung plausibilisiert (u. a. mindestens 10.000 erwartete Einträge und Stichproben-Prüfung). Nur die tatsächlich benötigten Kennungen werden in das kleine Veröffentlichungs-JSON übernommen.

- Regulär tägliche Aktualisierung um **09:33 Uhr**.
- Bei neu entdeckten Registrierungen während eines Stationsimports automatisch **zusätzlicher Download bei Bedarf**.
- Wenn der letzte erfolgreiche ICAO-Abruf **mehr als 36 Stunden** zurückliegt, versucht ein Stationslauf erneut den Download.
- Bei Ausfall werden die zuvor gespeicherten Zuordnungen beibehalten. Fehlende und nicht überschreibbare Kennungen erhalten **keinen** ADS-B-Link.

### 3.3 ADS-B Exchange und Airplanes.live – Direktlinks, keine Importquellen

Ziele: `https://globe.adsbexchange.com/?icao=<HEXCODE>` und `https://globe.airplanes.live/?icao=<HEXCODE>`. Beide Links werden im Browser aus dem vorhandenen `icao`-Feld erzeugt und nur beim Anklicken geöffnet. Es erfolgt kein zusätzlicher Datenimport und keine Tracking-API-Abfrage. RTH Watch nutzt hierfür **keine kostenpflichtige ADS-B-Exchange-API**. Ein HTTP-403-Fehler innerhalb der externen ADS-B-Exchange-Seite ist nicht automatisch ein Hinweis auf ein fehlerhaftes ICAO-Mapping.

## 4. Datenimport und Fehlerbehandlung

`src/pipeline.js` verbindet den aus v1 übernommenen Parser (`src/parse.js`) mit dem angepassten HTTP-/ICAO-Modul (`src/feed.js`).

1. **Wiederherstellen** des letzten gültigen Datensatzes, bevorzugt aus einem **GitHub-Actions-Artefakt** desselben Repositories; falls nicht verfügbar, direkt aus der zuletzt veröffentlichten **Pages-JSON**.
2. **Abruf** der Stationsübersicht bzw. des ICAO-Mappings gemäß Workflow-Modus; die bisherige Auswahl und Plausibilitätskontrolle werden beibehalten.
3. **Einzelne Stationsdetailseiten** mit konfigurierter Pause abrufen. Erfolgreiche Detailseiten aktualisieren den Datensatz; fehlgeschlagene Stationen behalten bei einem unvollständigen Durchlauf ihre vorherigen Daten.
4. **Kennzeichen-/ICAO-Auflösung** aus lokalem Snapshot, aktueller Mapping-Datei und versionierten Overrides.
5. **Statisches JSON** erzeugen, auf Gültigkeit prüfen, sichern und gemeinsam mit HTML/CSS/JS per GitHub Pages veröffentlichen.

### Netzwerktoleranz

- **45 Sekunden Timeout pro Einzelversuch** als Standard (`FETCH_TIMEOUT_MS=45000`). Eine Seite, die nach 10–20 Sekunden antwortet, wird damit nicht frühzeitig abgebrochen.
- **Maximal 2 Versuche** je Datei/Detailseite und 2 Sekunden Verzögerung vor dem zweiten Versuch. Im schlimmsten Fall ca. **92 Sekunden pro nicht erreichbarer Detailseite**.
- **1.200 Millisekunden Pause** zwischen den Stationsdetails (`RTH_REQUEST_DELAY_MS`), damit rth.info nicht unnötig belastet wird.
- Maximale Laufzeit des GitHub-Build-Jobs: **170 Minuten**. Der Pages-Deploy-Job läuft separat.
- Schutz vor leeren oder verdächtig geschrumpften Übersichtsseiten: mindestens 15 Stationen, außerdem kein unerwarteter Rückgang unter ca. 65 % des bisherigen Bestands.
- Sind bei einem bestehenden Datenbestand einzelne Detailseiten nicht erreichbar, bleiben alte Stationsdaten erhalten. Wenn weniger als 15 Details erfolgreich eingelesen wurden, wird der vorherige Stationsbestand vollständig beibehalten.
- Beim **allerersten Lauf ohne gültige Alt-Daten** wird keine leere/kaputte Website publiziert: ein fehlgeschlagener Import lässt den Build absichtlich fehlschlagen.
- Bei einer externen Störung mit gültigem Vorbestand wird dieser wieder veröffentlicht; `status.lastStationsSync` wird dabei **nicht** fälschlich auf die Build-Zeit aktualisiert. `lastStationsError` beschreibt das Problem.

### Snapshot-Backups

`actions/upload-artifact@v4` legt nach jedem erfolgreichen Build die Datei `stations.json` als separates Actions-Artefakt namens **`rth-watch-state`** ab (standardmäßig **90 Tage** Aufbewahrung). Beim nächsten Build fragt das Wiederherstellungsskript über die GitHub-API maximal fünf aktuelle gültige Artefakte ab. Falls keines nutzbar ist, versucht es die **bereits veröffentlichte** Pages-JSON. Hierfür benötigt der Build-Job lediglich `actions: read` für das eigene Repository.

Die Wiederherstellung findet statt, **bevor** ein neuer Import oder ein Code-Deployment die nächste statische Ausgabe erzeugt. Ein Runner speichert nichts dauerhaft auf seiner lokalen Festplatte, und ein Git-Push schreibt keine generierten Daten zurück in den Quellcode-Branch.

**Grenze:** Actions-Artefakte unterliegen der eingestellten Aufbewahrungsfrist. Bei Verlust aller Artefakte **und** der veröffentlichten Pages-Ausgabe ist eine Wiederherstellung aus diesen beiden Quellen nicht mehr möglich. Für langfristige eigenständige Archivierung die Backup-Artefakte ggf. zusätzlich extern sichern.

## 5. Zeitplan und manuelle Workflow-Modi

Im Workflow `.github/workflows/pages.yml` sind GitHub-Actions-Zeitpläne mit IANA-Zeitzone **`Europe/Berlin`** definiert. Es gibt **keinen externen Cronjob und keinen dauerhaft laufenden Anwendungscontainer**.

| Zeit (Berlin) | Häufigkeit | Modus | Aufgabe |
|---|---|---|---|
| **09:33** | Täglich | `aircraft` | Tar1090-Zuordnung downloaden und die gespeicherten Kennzeichen neu zuordnen |
| **10:07** | Täglich | `stations` | Stationsübersicht und Detailseiten aktualisieren |
| **14:07** | Täglich | `stations` | Stationsdaten erneut aktualisieren |
| **18:07** | Täglich | `stations` | Stationsdaten erneut aktualisieren |
| Bei relevanten `main`-Pushes | Bei Änderungen | `publish` | Neue Oberfläche/Konfiguration mit vorhandenem Datenstand veröffentlichen, **ohne** rth.info bei jedem Commit abzurufen |
| Manuell | Bei Bedarf | auswählbar | Über `workflow_dispatch` steuerbar |

**Manuelle Modi:**

- `full`: Erzwingt einen Stations- und einen ICAO-Datenabruf, sinnvoll für Erstimport und Fehlersuche.
- `stations`: Aktualisiert die Stationsliste; downloadet ICAO nur bei neuen unbekannten Kennzeichen bzw. wenn die letzte erfolgreiche Aktualisierung länger als 36 Stunden zurückliegt.
- `aircraft`: Erzwingt den Mapping-Download und aktualisiert die ICAO-Zuordnung ohne erneutes rth.info-Crawling.
- `publish`: Lädt nur vorhandene Laufzeitdaten, wendet aktuelle Overrides/Frontend-Code an und deployt neu. Wenn noch **keine** gültigen Daten existieren, startet stattdessen ein notwendiger voller Erstimport.

Die Jobs sind pro Workflow über GitHub-Actions-`concurrency` serialisiert (`cancel-in-progress: false`). Die Uhrzeiten sind **Sollzeiten**: GitHub kann Cron-Ausführungen verzögern oder unter hoher Last ausfallen lassen; die Anzeige des letzten erfolgreichen Abgleichs bleibt deshalb wichtig. GitHub kann die geplanten Workflows öffentlicher Repositories nach **60 Tagen ohne Repositoryaktivität** automatisch deaktivieren.

## 6. Oberfläche und Browserfavoriten

Die Oberfläche besteht aus `public/index.html`, `public/assets/style.css` und `public/assets/app.js` und wird **ohne Framework und ohne eigenen Node-Webserver** bereitgestellt. Statische Dateipfade sind relativ (`./assets/...`, `./data/stations.json`): Die Seite funktioniert dadurch als `username.github.io/repo/` ebenso wie mit eigener Domain.

Die Tabelle zeigt **Rufname, Maschine, Ort, Betreiber, Typ, letzte Sichtung, RTH.INFO-Quelllink und Tracking-Aktionen für ADS-B Exchange und Airplanes.live**. Ausschließlich die gewählte Tracking-Aktion öffnet die zugeordnete Maschine in einem neuen Tab; die Tabellenzeile selbst hat keine Weiterleitung. Suche und Filter arbeiten lokal auf dem geladenen JSON.

Favoriten werden als numerische Stations-IDs in `localStorage` unter **`rth-watch:favorites:v2`** gespeichert; bei unverändertem Browser-/Domainkontext liest v2 als Migrationshilfe auch den alten Schlüssel `rotorwatch:favorites:v1`. Favoritenkarten bieten beide Tracking-Anbieter und den RTH-Info-Link. Zwei Aktionen oberhalb der Karten öffnen alle gespeicherten Favoriten mit gültigem ICAO-Code gemeinsam beim jeweiligen Anbieter. Fehlende oder ungültige Codes werden ausgelassen, doppelte Codes entfernt. Die Auswahl ist unabhängig von Suche und Filtern und aktualisiert sich bei Favoriten- und Datenänderungen sowie über den Browser-Storage-Event. Browserprofile und Endgeräte sind unabhängig. Der Server erhält diese persönlichen Markierungen nicht; bei einem Domainwechsel lassen sich bestehende Favoriten nicht automatisch übernehmen.

**Darstellung manueller Änderungen:** Der Feldwert `assignmentSource: "manual"` sorgt für den sichtbaren Hinweis **MANUELL** statt eines irreführenden rth.info-Sichtungsdatums.

**Link-Sicherheit:** Für Tracking gelten ausschließlich HTTPS, die Domains `globe.adsbexchange.com` und `globe.airplanes.live` sowie sechsstellige hexadezimale ICAO-Codes. Tracking-Links werden zentral generiert und geprüft; RTH-Info-Links behalten ihre bestehende Validierung.

**Aktualisierungsverhalten:** Der geöffnete Browser prüft die statische JSON-Datei jede Minute erneut (mit Cache-Busting-Parameter); die tatsächliche Datenerzeugung richtet sich nach dem Actions-Zeitplan. Ein GitHub-Pages-CDN kann neue Veröffentlichungen leicht verzögert ausliefern.

## 7. Konfiguration, Overrides und Prioritäten

### Eingangsvariablen

| Variable | Standard | Zweck |
|---|---:|---|
| `FETCH_TIMEOUT_MS` | `45000` | Timeout für **jeden** Versuch eines externen Abrufs |
| `RTH_REQUEST_DELAY_MS` | `1200` | Pause zwischen Stationsdetailseiten in Millisekunden (750–30000) |
| `RTH_MIN_STATIONS` | `15` | Mindestergebnis für sichere Übernahme (3–500) |

In `.github/workflows/pages.yml` stehen diese Werte direkt in der `Generate static website`-Stufe. `Europe/Berlin` ist an den beiden Cron-Einträgen als `timezone` gesetzt. Ein Wechsel der Zeitzone muss im Workflow und ggf. in der Anzeige angepasst werden.

### Zwei Konfigurationsdateien

1. `config/hex-overrides.json`: globale Registrierung → ICAO-Korrekturen.
2. `config/station-overrides.json`: ID → manuelle Stationsmaschine (Kennzeichen, optional ICAO, optionale Notiz).

**Priorität Kennzeichen:** Stations-Override vor den letzten rth.info-Originaldaten. **Priorität ICAO:** optionaler stationsspezifischer ICAO-Code → globaler Hex-Override → automatisches tar1090-Mapping. Ein unbekannter ICAO-Code führt zu **keinem** ungültigen Link.

Die Overrides sind **versionierte Eingaben** und gehören in das Quellrepository. Sie sind keine automatisch generierten Laufzeitdaten. Details und Beispiele siehe [MANUELLE-ZUORDNUNGEN.md](MANUELLE-ZUORDNUNGEN.md).

## 8. Datenspeicherung und Wiederherstellung

### Trennung von Quellcode und Laufzeitdaten

Der Branch `main` enthält Quellcode, Tests, Workflows und die beiden bewusst versionierten Override-Dateien. Die während der Ausführung generierten Daten werden dagegen **nicht** in Git zurückgeschrieben. Dadurch sind Code-Updates und erneute Deployments unabhängig von der laufenden Datenerzeugung.

Die `.gitignore` schließt insbesondere `dist/`, `.state/`, `data/`, `public/data/`, SQLite-Dateien, den heruntergeladenen ICAO-Cache und lokale temporäre Dateien aus. Bereits zuvor von Git erfasste Dateien werden durch `.gitignore` allerdings **nicht rückwirkend** entfernt.

Es gibt keinen zusätzlichen Git-Branch für generierte Pages- oder Stationsdaten. Der Deployment-Workflow verwendet stattdessen offizielle GitHub-Pages-Artefakte.

### Wiederherstellungsverfahren

Bei jedem Workflow-Lauf wird vor der Datenverarbeitung ein bestehender Snapshot geladen. Die Reihenfolge ist:

1. Das neueste gültige **GitHub-Actions-Backup-Artefakt** `rth-watch-state` desselben Repositories.
2. Falls nicht verfügbar: `data/stations.json` aus der zuletzt veröffentlichten **GitHub-Pages-Website**.
3. Falls beide Quellen fehlen: vollständiger Liveimport. Schlägt dieser beim Erststart fehl, wird keine leere Website veröffentlicht.

Die JSON-Datei auf GitHub Pages ist öffentlich abrufbar. Backup-Artefakte sind an das Repository gebunden und unterliegen dessen Aufbewahrungsrichtlinien. Bei Verlust aller Backups und der veröffentlichten JSON-Datei kann der frühere Zustand aus diesen Quellen nicht mehr rekonstruiert werden. Für eine langfristige Archivierung empfiehlt sich deshalb eine zusätzliche Sicherung der generierten `stations.json`.

### GitHub-Berechtigungen

Der Build-Job verwendet `contents: read` und `actions: read` für Quellcode und eigene Backups. Der separate Deployment-Job benötigt `pages: write` und `id-token: write`. Ein persönlicher Zugriffstoken ist für den regulären Workflow nicht erforderlich. Eine öffentliche Schreibschnittstelle für Konfiguration oder Stationsdaten existiert nicht.

## 9. Installation und Wartung

### Standardbereitstellung mit GitHub Pages

1. Projektdateien einschließlich `.github/workflows/pages.yml` in einem GitHub-Repository mit Standardbranch `main` bereitstellen.
2. Node.js 24 verwenden, lokal `npm install` und `npm test` ausführen und das erzeugte `package-lock.json` einchecken. Der Workflow verwendet anschließend `npm ci`.
3. In den Repository-Einstellungen **Settings → Pages → Build and deployment → GitHub Actions** als Veröffentlichungsquelle wählen.
4. Unter **Actions** den Workflow **RTH Watch - update data and publish Pages** mit dem Modus `full` starten.
5. Erfolgreichen Import, `rth-watch-state`-Backup und Pages-Deployment prüfen. Die Website-Adresse wird unter **Settings → Pages** angezeigt.

Die statischen Assets und der Datenpfad sind relativ. Die Veröffentlichung funktioniert deshalb sowohl als Projektseite unter einem Repository-Unterpfad als auch mit korrekt konfigurierter eigener Domain.

### Entwicklung und Diagnose

```bash
npm install
npm test

# Vorhandenen Snapshot unter .state/stations.json vorausgesetzt:
npm run build
python3 -m http.server 8080 -d dist
```

Ein Liveimport lässt sich mit `npm run sync:all` ausführen. Er darf nur unter Beachtung der Bedingungen der Datenquellen gestartet werden. Bei Änderungen an `config/*.json` genügt im laufenden GitHub-Projekt ein neuer `publish`-Durchlauf, sofern bereits ein gültiger Datensatz vorliegt.

Zur Fehleranalyse dienen die Protokolle des GitHub-Actions-Build-Jobs, insbesondere die Meldungen zu `[stations]`, `[aircraft]` und zur Snapshot-Wiederherstellung. Das Dashboard zeigt den Zeitpunkt des letzten **erfolgreichen Stationsabgleichs** an; ein erneutes Deployment ohne frische Quelldaten verändert diesen Zeitpunkt nicht.

### Datensicherung

Das Backup `rth-watch-state` kann unter **Actions → erfolgreicher Build → Artifacts** zusätzlich heruntergeladen werden. Es wird nicht in das Quellrepository übernommen. Lokale Tests können einen zuvor gesicherten Datensatz unter `.state/stations.json` einlesen.

## 10. Grenzen und Sicherheitsaspekte

- Bei einem Ausfall oder veralteten Einträgen von rth.info werden alte, ggf. überholte Maschinenzuordnungen sichtbar. Die Anzeige ist **keine Live-Quelle** und bestätigt keinen tatsächlichen aktuellen Standort.
- Quellseiten und die tar1090-Datei können sich ändern; dann können die Parser-/Mappingtests und der Import fehlschlagen.
- Pages ist grundsätzlich öffentlich erreichbar; dürfen keine Zugangsdaten, personenbezogenen Geheimnisse oder internen Infrastrukturinformationen in den JSON-Konfigurationsdateien.
- RTH Watch benötigt **keinen öffentlich erreichbaren eigenen Backend-Server**; GitHub-Actions-Runner verbinden sich ausgehend mit den externen Datenquellen. GitHub selbst und die externe Datenquelle bleiben Verfügbarkeitsabhängigkeiten.
- GitHub Pages unterstützt nicht dieselben individuell steuerbaren HTTP-Sicherheitsheader wie ein eigener Nginx-Reverse-Proxy. Es gibt aber auch **kein öffentliches Node-Backend, keine Datenbank-API und keine Admin-Schreibschnittstelle** zu schützen.
- Browserfavoriten und andere lokale Browserdaten werden **nicht** in die GitHub-Artefakte aufgenommen.
- Vor regelmäßiger automatisierter Abfrage oder öffentlicher Wiederveröffentlichung die Nutzungsbedingungen der Datenquellen beachten und erforderliche Freigaben einholen.

## 11. Projektdateien und externe Referenzen

| Datei | Aufgabe |
|---|---|
| `.github/workflows/pages.yml` | Vier Zeitpläne, manuelle Modi, Push-Publishing, Backups und Pages-Deployment |
| `src/parse.js` | Aus der Docker-Version übernommene Stationsauswahl und Detailparser |
| `src/feed.js` | Retry-/Timeout-HTTP-Client und tar1090-Datenbank-Dekodierung |
| `src/pipeline.js` | Fehlerrobuster Merge, Mapping und Overrides |
| `src/validation.js` | Strikte Prüfung früherer Snapshots und manuell versionierter Konfiguration |
| `src/config.js` | Importkonfiguration und Pfade |
| `scripts/restore-state.mjs` | GitHub-Actions-/Pages-Daten wiederherstellen |
| `scripts/generate.mjs` | Imports orchestrieren, statischen Build ausgeben |
| `public/` | Statische Dashboard-Oberfläche einschließlich `assets/tracking.js` für testbare Tracking-Links |
| `config/` | Versionierte manuelle Zuordnungen |
| `test/` | Regressionstests für Parser, Mapping, Status und Seitenpfade |

Offizielle technische Referenzen:

- GitHub Pages: `https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages`
- GitHub Actions Cron und Zeitzonen: `https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows`
- rth.info-Stationsdatenbank: `https://www.rth.info/stationen.db/stationen.php`
- tar1090-Datenbank: `https://github.com/wiedehopf/tar1090-db`
- ADS-B Exchange: `https://globe.adsbexchange.com/`
- Airplanes.live: `https://globe.airplanes.live/`

**Stand dieser Dokumentation:** 27.09.2026. Externe Dienstbedingungen, Workflow-Limits und Produktfunktionen können sich ändern.
