# RTH Watch 🚁

**Version 2.2.0 · Statisches Dashboard**

RTH Watch ist ein unabhängiges, responsives Dashboard für Rettungs- und Intensivtransporthubschrauber. Es zeigt zuletzt bei [rth.info](https://www.rth.info/stationen.db/stationen.php) gemeldete Stationsdaten und verknüpft bekannte ICAO-Codes mit ADS-B Exchange und Airplanes.live. Die Angaben sind keine verlässliche Echtzeit-Zuordnung von Luftfahrzeugen zu Stationen und kein Live-Flugstatus.

## Funktionen

- Stationsverzeichnis mit Rufname, Kennzeichen, Ort, Betreiber, Typ, Sichtungsdatum und Quellenlink.
- Suche und Filter nach Kategorie und Betreiber.
- Einzeltracking und gemeinsames Tracking aller Browserfavoriten mit gültiger ICAO-Adresse.
- Favoriten pro Browser unter dem unveränderten Schlüssel `rth-watch:favorites:v2`.
- Versionierte Stations- und ICAO-Overrides sowie Prüfung externer Links.
- Responsives Dashboard ohne dauerhaften Webserver oder Datenbank.

## Daten und Aktualisierung

| Quelle | Verwendung | Regelmäßiger Termin (Europe/Berlin) |
|---|---|---|
| [rth.info](https://www.rth.info/stationen.db/stationen.php) | Stations- und Luftfahrzeugmeldungen | 10:00, 14:00, 18:00 Uhr |
| [tar1090-db](https://github.com/wiedehopf/tar1090-db) | Kennzeichen zu ICAO-Code | 09:30 Uhr; bei neuem Kennzeichen gegebenenfalls zusätzlich |
| ADS-B Exchange und Airplanes.live | Externe Tracking-Zielseiten | Kein automatischer Abruf |

Forgejo Actions übernimmt Tests, Datenimport und statischen Build. `main` enthält Quellcode, Konfiguration, Tests und Workflows. Der getrennte Branch `gh-pages` enthält ausschließlich den Inhalt von `dist/`, einschließlich `data/stations.json`, `CNAME` und `.nojekyll`. Eine Forgejo-Push-Spiegelung kann `gh-pages` nach GitHub übertragen; GitHub Pages veröffentlicht den Branch aus dessen Wurzel. `main` erhält keine automatisierten Datencommits.

Jeder Lauf stellt den letzten validierten Snapshot aus `gh-pages` wieder her. Solange dieser Branch noch nicht existiert, kann ein einmaliger Migrationsfallback den bisher veröffentlichten Datensatz laden. Falls auch dieser fehlt, ist ein vollständiger Erstimport nötig; ein fehlgeschlagener Erstimport erzeugt keine leere Website. Bei einem beschädigten Snapshot in einem vorhandenen `gh-pages`-Branch bricht der Lauf ab.

Stündliche Kontrollläufe um `11:30` bis `22:30` Uhr prüfen nur die gespeicherten Erfolgszeiten und Fehlerzustände. Fehlt ein vollständiger geplanter Import, wird der betroffene Datenabruf höchstens zweimal zusätzlich versucht, mit mindestens 60 Minuten Abstand. Teilimporte zählen nicht als vollständiger Erfolg. Ohne Nachholbedarf erfolgen kein Quellenabruf, Build oder Deployment.

## Bereitstellung

Ein Forgejo-Runner mit dem Label `rthwatch-node24` und Node.js 24 ist erforderlich. Der Workflow nutzt die Forgejo-kompatible Checkout-Action und standardmäßig den kurzlebigen, repositorybezogenen `FORGEJO_TOKEN`. Dieser muss Git-Commits nach `gh-pages` pushen dürfen. Falls lokale Branch-Regeln das verhindern, kann ein repositorybezogenes Secret `RTH_WATCH_DEPLOY_TOKEN` verwendet werden. Die optionale Actions-Variable `RTH_WATCH_CI_EMAIL` steuert die technische Commit-E-Mail; ohne sie wird `ci@rth-watch.invalid` verwendet.

Der erste produktive Lauf wird in Forgejo auf `main` mit `workflow_dispatch` und dem Modus `full` gestartet. Er erstellt `gh-pages` automatisch als unabhängigen Orphan Branch. Nach Prüfung des Builds und der Spiegelung wird GitHub Pages auf **Deploy from a branch → gh-pages → /(root)** umgestellt. Die Custom Domain ist `rthwatch.nolden.cloud`; HTTPS und die öffentliche Veröffentlichung sind separat zu prüfen. Normale Deployments übernehmen die Historie von `gh-pages`. Sie verwenden keinen Force-Push, und ein veralteter `main`-Stand oder ein konkurrierender Push führt zum Abbruch.

Manuelle Modi: `full` aktualisiert beide Quellen, `stations` nur Stationsdaten mit bedarfsweisem ICAO-Abruf, `aircraft` die ICAO-Datenbank, `publish` erzeugt die Website aus dem bestehenden Snapshot mit aktuellen Overrides, und `reconcile` holt nur fällige Importe nach. Relevante Pushes auf `main` lösen `publish` aus; reine Dokumentationsänderungen und Pushes auf `gh-pages` lösen keinen Import aus.

## Lokale Entwicklung

```bash
npm ci
npm test
node scripts/generate.mjs --mode=publish
python3 -m http.server 8080 -d dist
```

`publish` benötigt einen validierten Snapshot unter `.state/stations.json`; ohne diesen führt der Generator einen vollen Bootstrap aus. Liveimporte sollten nur im Rahmen der Nutzungsbedingungen der Datenquellen ausgeführt werden. Lokale und generierte Daten sind von `main` ausgeschlossen. Die versionierten Dateien `config/station-overrides.json` und `config/hex-overrides.json` bleiben Eingaben.

## Projektdateien

- `.forgejo/workflows/pages.yml`: produktiver Import- und Veröffentlichungsworkflow.
- `.forgejo/workflows/runner-test.yml`: manuell startbare Runner-Diagnose.
- `scripts/`: Moduswahl, Wiederherstellung, Generator und Deployment.
- `src/`: Parser, HTTP-Abruf, Validierung, Datenpipeline und Reconcile.
- `public/`: statisches Dashboard mit relativen Asset-Pfaden.
- `docs/`: [Technische Dokumentation](docs/DOKUMENTATION.md), [manuelle Zuordnungen](docs/MANUELLE-ZUORDNUNGEN.md) und [Teststatus](docs/TESTPROTOKOLL.md).

RTH Watch steht in keiner offiziellen Verbindung zu rth.info, ADS-B Exchange, Airplanes.live oder dem tar1090-db-Projekt. Externe Daten und Links hängen von deren Verfügbarkeit und Nutzungsbedingungen ab.
