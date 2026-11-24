# RTH Watch v2.2.0 – Test- und Integrationsstatus

**Stand:** 24.11.2026

Die lokale Test-Suite umfasst 32 erfolgreiche Tests und führt Parser-, HTTP-, Pipeline-, Link-, Favoriten- und Migrationsprüfungen aus. Die Git-Integrationstests verwenden ausschließlich temporäre lokale Bare-Repositories. Sie prüfen Orphan-Initialisierung, sauberen Deployment-Tree, reguläre Historie, unveränderten Output, Snapshot-Restore, beschädigte Snapshots, veraltete Source-Commits und konkurrierende Pushes. Reconcile-Tests prüfen Berliner Sommer-/Winterzeit, Teilimporte, persistente Versuchszähler und Mindestabstand.

Auszuführen:

```bash
npm test
for f in src/*.js scripts/*.mjs public/assets/*.js test/*.js; do node --check "$f"; done
```

Der Workflow selbst benötigt eine Syntax-/Strukturprüfung und einen echten ersten Forgejo-Lauf. Lokale Tests können weder die produktiven Branch-Berechtigungen noch die Forgejo-Spiegelung oder die GitHub-Pages-Umstellung bestätigen. Der erste `full`-Import mit allen realen Stationsseiten und ein anschließender `reconcile`-Kontrolllauf sind nach dem Commit in Forgejo zu prüfen. Ein erfolgreicher Push nach Forgejo muss getrennt von der GitHub-Spiegelung und der öffentlichen Pages-Ausgabe kontrolliert werden.
