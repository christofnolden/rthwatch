# RTH Watch v2.2.1 – Test- und Integrationsstatus

**Stand:** 25.11.2026

Die lokale Test-Suite führt Parser-, HTTP-, Pipeline-, Link-, Favoriten- und Migrationsprüfungen aus. Die Git-Integrationstests verwenden ausschließlich temporäre lokale Bare-Repositories. Sie prüfen Orphan-Initialisierung, sauberen Deployment-Tree, reguläre Historie, unveränderten Output, Snapshot-Restore, beschädigte Snapshots, veraltete Source-Commits und konkurrierende Pushes. Reconcile-Tests prüfen Berliner Sommer-/Winterzeit, Teilimporte, persistente Versuchszähler und Mindestabstand.

Die Workflow-Regressionstests prüfen die drei Zeitpläne in `Europe/Berlin`, feste Modi bei fehlendem oder leerem Cron-Feld, Wiederholungen, manuelle Modi, die Beschränkung auf `main` und die gemeinsame Serialisierung. Die Git-Integrationstests prüfen weiterhin, dass ein unveränderter Build keinen Deployment-Commit erzeugt.

Lokale Prüfung

```bash
npm test
for f in src/*.js scripts/*.mjs public/assets/*.js test/*.js; do node --check "$f"; done
```

Die YAML-Dateien wurden lokal auf Syntax, Auslöser sowie die Eingaben des gemeinsamen Workflows geprüft. Nach der Bereitstellung sind in Forgejo die Registrierung der drei Zeitpläne, die Auflösung des gemeinsamen Jobs und ein erfolgreicher Start je geplantem Modus zu prüfen. Bei produktiven Läufen sind außerdem die dateiübergreifende Serialisierung und der Zugriff mit dem Workflow-Token beziehungsweise dem optionalen Repository-Secret zu verifizieren.
