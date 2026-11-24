# RTH Watch v2.2.0 – Technische Dokumentation

**Plattform:** Forgejo Actions für CI/CD; GitHub Pages für statisches Hosting.
**Runtime:** Node.js 24 im kurzlebigen Workflow-Container; kein dauerhafter Anwendungsserver.
**Zeitzone:** Europe/Berlin.

## Architektur und Datenhaltung

```text
main (Quellcode, Konfiguration, Tests)
  └─ Forgejo Actions: Test → Restore → Import/Build → Validierung
       └─ isoliertes Git-Repository → gh-pages (nur dist/)
            └─ Forgejo-Push-Spiegelung → GitHub gh-pages → GitHub Pages
```

Der Generator erstellt `dist/index.html`, `dist/assets/`, `dist/data/stations.json`, `dist/.nojekyll` und `dist/CNAME` sowie weitere zulässige statische Dateien aus `public/`. Der `CNAME`-Inhalt lautet `rthwatch.nolden.cloud`. Assets und JSON werden relativ geladen. Browserfavoriten bleiben im `localStorage` des jeweiligen Browsers und verwenden weiterhin `rth-watch:favorites:v2` mit Lese-Fallback auf `rotorwatch:favorites:v1`.

Das JSON-Schema bleibt bei Version 2. Es trennt `sourceStations` von der nach Overrides berechneten Anzeige `stations` und enthält nur aktuell benötigte `registrations`, nicht die vollständige ICAO-Datenbank. `status.lastStationsSync` zeigt den letzten wenigstens teilweise erfolgreichen Abruf; `status.lastStationsCompleteSync` kennzeichnet nur einen vollständigen Stationsimport. `status.lastAircraftSync` wird nur nach erfolgreichem ICAO-Abruf gesetzt. `status.lastResult` hält Anzahl und IDs fehlgeschlagener Stationsdetails. `status.reconcile` enthält pro Quelle Termin, Versuchszahl und letzten Nachholversuch. Diese beiden neuen Statusfelder sind rückwärtskompatibel.

## Datenquellen und Verarbeitung

`src/parse.js` wählt RTH-, Dual-Use- und ITH-Stationen sowie passende Rufnamen aus und parst deren Detailseiten. Der vorhandene HTTP-Client in `src/feed.js` nutzt maximal zwei Versuche mit standardmäßig 45 Sekunden Timeout und einer Pause von zwei Sekunden vor einem erneuten Versuch. Zwischen Stationsdetails liegen 1.200 Millisekunden. `RTH_MIN_STATIONS=15` und die Plausibilitätsgrenze von 65 % des vorherigen Bestands schützen vor verdächtig kleinen Übersichten.

Bei einem vollständigen Quellenfehler bleiben vorhandene Stationsdaten erhalten. Einzelne ausgefallene Detailseiten behalten ihre bisherigen Einträge; nur ein vollständig plausibler Abruf kann entfallene Stationen entfernen. Bei einem ICAO-Downloadfehler bleiben bekannte Zuordnungen erhalten. Manuelle Stations-Overrides haben Vorrang vor rth.info; bei ICAO gilt stationsspezifischer Override vor globalem Hex-Override vor tar1090-db. Die URL-Validierung externer Links bleibt bestehen.

Ein Lauf stellt vor dem Import `gh-pages:data/stations.json` wieder her und validiert den Snapshot. Existiert der Branch, führt ein fehlender oder beschädigter Snapshot zum Abbruch. Nur solange `gh-pages` fehlt, versucht die Wiederherstellung den bisher veröffentlichten HTTPS-Snapshot und danach optional einen mit `RTH_WATCH_MIGRATION_BACKUP` bezeichneten lokalen Migrationsdatensatz. Ohne gültige Alt-Daten startet der Generator einen vollen Erstimport; dessen Fehlschlag verhindert die erste Veröffentlichung. Die öffentliche Website wird nach Bestehen der initialen Migration nicht mehr als Fallback verwendet.

## Zeitplan, Modi und Nachholen

| Termin (Berlin) | Modus | Wirkung |
|---|---|---|
| 09:30 täglich | `aircraft` | ICAO-Datenbank aktualisieren |
| 10:00, 14:00, 18:00 täglich | `stations` | Stationsdaten aktualisieren; ICAO bei Bedarf |
| 11:30–22:30 stündlich | `reconcile` | Fehlende vollständige Termine prüfen und nötige Quellen nachholen |
| Relevanter Push auf `main` | `publish` | Snapshot mit aktuellem Code und Overrides neu ausgeben |

`workflow_dispatch` erlaubt `full`, `stations`, `aircraft`, `publish` und `reconcile`. Der Modus wird aus Forgejo-Ereignis und dessen Cron-Ausdruck bestimmt. Nur `refs/heads/main` darf veröffentlichen. Der gemeinsame Concurrency-Schlüssel `rth-watch-pages` serialisiert die Läufe mit `cancel-in-progress: false`; ein zusätzlicher Vergleich mit dem aktuellen `main`-SHA verhindert den Rollback durch einen älteren Lauf.

Reconcile verwendet die tatsächlichen UTC-Zeitpunkte der lokalen Berliner Termine und berücksichtigt Sommer- und Winterzeit. Ein teilweiser Stationsimport schließt den Termin nicht ab. Offene Termine beider Quellen werden in einem `full`-Lauf zusammengefasst. Pro Quelle und regulärem Termin gibt es höchstens zwei zusätzliche Versuche im Abstand von mindestens 60 Minuten. Der Versuchszähler liegt im veröffentlichten Snapshot und überlebt Runner-Neustarts. Ein Kontrolllauf ohne Bedarf ruft keine Datenquelle ab, baut keine Website und erzeugt keinen Deployment-Commit. Die geplanten Termine liegen außerhalb der Umstellungsstunden der Sommerzeit.

## Deployment und Sicherheit

`src/deploy.js` validiert `dist/`, einschließlich JSON, CNAME, `.nojekyll` und sicherer Dateitypen. Ein temporäres Git-Repository übernimmt ausschließlich diese Dateien. Fehlt `gh-pages`, wird dort ein Orphan Branch erzeugt; andernfalls wird der aktuelle Branch geholt und dessen Historie fortgeführt. Der beim Restore beobachtete `gh-pages`-Commit wird vor dem Deployment erneut geprüft. Vor dem Push werden `main` und `gh-pages` nochmals gelesen. Änderungen am Remote oder ein abgewiesener Push brechen kontrolliert ab. Der Push geht ausschließlich an den anhand `FORGEJO_SERVER_URL` geprüften Forgejo-Remote und verwendet keinen Force-Push. Bei identischem Output wird kein Commit erzeugt; `generatedAt` bleibt bei unverändertem Datensatz erhalten.

Die Authentifizierung nutzt bevorzugt den kurzlebigen repositorybezogenen `FORGEJO_TOKEN`. Ein `GIT_ASKPASS`-Skript im temporären Verzeichnis übergibt den Token nur während der Git-Operationen. Das optionale Repository-Secret `RTH_WATCH_DEPLOY_TOKEN` kann Branch-Berechtigungsprobleme lösen. `RTH_WATCH_CI_EMAIL` ist eine optionale Actions-Variable. Token werden weder in Git-URLs noch in Commit-Nachrichten oder `dist/` gespeichert. Die Checkout-Action persistiert keine Credentials. Fremde Pull Requests lösen diesen Workflow nicht aus.

Ein erfolgreicher Forgejo-Push belegt noch keine erfolgreiche Spiegelung oder GitHub-Pages-Veröffentlichung. Diese Schritte sind bei der Inbetriebnahme separat zu prüfen. Das Dashboard ist eine Informationsanzeige und bestätigt keinen aktuellen Standort oder Flug eines Luftfahrzeugs.

## Referenzen

- [Forgejo Actions v17 – Referenz](https://forgejo.org/docs/v17.0/user/actions/reference/)
- [Forgejo Actions v17 – Grundbegriffe und Token](https://forgejo.org/docs/v17.0/user/actions/basic-concepts/)
- [Forgejo Actions v17 – Sicherheit](https://forgejo.org/docs/v17.0/user/actions/security/)
- [Forgejo – Repository-Spiegelung](https://forgejo.org/docs/v17.0/user/repo-mirror/)
- [GitHub Pages – Veröffentlichung aus einem Branch](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
