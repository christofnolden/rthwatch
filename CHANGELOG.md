# RTH Watch – Änderungsprotokoll

## 2.0.0 – 27.09.2026

**GitHub Pages Edition und Umbenennung von RotorWatch in RTH Watch.**

- Bestehendes Dark-Mode-Dashboard und mobiles Layout übernommen, neue Projektbezeichnung und relative Asset-/JSON-Pfade.
- Statt `/api/stations` wird die statische Datei `./data/stations.json` geladen. Dadurch sind GitHub-Projektseiten und eigene Domains möglich.
- Automatischer Import per GitHub Actions: ICAO 09:33, Stationsdaten 10:07 / 14:07 / 18:07 (Europe/Berlin).
- Aus der ersten Docker-Version übernommene Stationsparser- und Auswahlregeln; maximal zwei Netzwerkversuche mit 45 s Timeout.
- Datensatz als statisches JSON mit getrennten Roh- und Anzeigeinformationen, ohne SQLite oder Node-Dauerdienst.
- Datenwiederherstellung aus GitHub-Actions-Artefakten, Fallback auf bereits veröffentlichte Pages-JSON; keine laufend generierten Dateien in Git.
- Neue `config/station-overrides.json` zur dauerhaften Korrektur der Maschine pro Stations-ID; bestehende `config/hex-overrides.json` für ICAO-Korrekturen.
- Eindeutige Kennzeichnung manueller Zuordnungen im Dashboard; Warnung bei mehr als 30 Stunden alten Stationsdaten.
- Browserfavoriten auf `rth-watch:favorites:v2` umgestellt, Fallback-Lesen des bisherigen RotorWatch-Schlüssels auf derselben Origin.
- `.gitignore`, automatische Tests, technische Dokumentation und Bereitstellungshinweise ergänzt.

### Bewusste Änderungen

`Dockerfile`, `docker-compose.yml`, `src/server.js`, `src/scheduler.js`, `src/db.js` und das alte SQLite-Verwaltungsskript gehören nicht zur Pages-Edition. Die unveränderte v1-Installation kann separat betrieben werden.

### Offener erster Integrationstest

Der vollständige Abruf **aller** externen Stationsseiten und die Cheerio-abhängigen Tests werden beim ersten GitHub-Actions-Durchlauf durchgeführt. Details: [docs/TESTPROTOKOLL.md](docs/TESTPROTOKOLL.md).
