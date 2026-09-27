# RTH Watch – Manuelle Stations- und ICAO-Zuordnungen

Automatisch erfasste Stationsinformationen können verzögert aktualisiert werden oder vorübergehend nicht verfügbar sein. Zwei versionierte JSON-Konfigurationsdateien ermöglichen deshalb die gezielte Korrektur von Registrierungen und ICAO-Adressen. Die manuelle Konfiguration bleibt erhalten, bis der betreffende Eintrag entfernt wird.

> Manuelle Zuordnungen sind keine Bestätigung durch die ursprüngliche Datenquelle. Die Zuverlässigkeit der eingetragenen Registrierung und ICAO-Adresse muss unabhängig geprüft werden.

## 1. Stations-ID ermitteln

Die Stations-ID steht im RTH-Info-Link der jeweiligen Dashboard-Zeile und in der veröffentlichten Datei `data/stations.json`. Beispiel:

```text
https://www.rth.info/stationen.db/station.php?id=1&show=1
                                                 ^ ID 1
```

Die **numerische Stations-ID** ist der Schlüssel eines Stations-Overrides. Der Rufname dient nicht als Schlüssel, da er sich ändern kann.

## 2. Stationszuordnung festlegen

Datei: `config/station-overrides.json`

```json
{
  "1": {
    "registration": "D-HXAD",
    "icao": "3e0f5f",
    "note": "Manuell bestätigte Maschinenzuordnung"
  }
}
```

Das Beispiel zeigt das Dateiformat und ist keine aktuelle Aussage über die Maschine an Station 1. Das Feld `icao` ist optional, wenn die Registrierung bereits automatisch aufgelöst wird:

```json
{
  "1": {
    "registration": "D-HXAD"
  }
}
```

Ist die automatische Zuordnung nicht verfügbar, wird ohne hinterlegten ICAO-Code kein Tracking-Link generiert.

## 3. ICAO-Adresse global korrigieren

Datei: `config/hex-overrides.json`

```json
{
  "D-HXAD": "3e0f5f"
}
```

Ein globaler ICAO-Override wirkt für jede Station mit der entsprechenden Registrierung, sofern kein stationsspezifischer ICAO-Code Vorrang hat.

## 4. Prioritäten

**Registrierung einer Station:**

1. Manueller Eintrag in `station-overrides.json`
2. Letzte erfolgreich erfasste Registrierung von rth.info

**ICAO-Adresse:**

1. Optionaler ICAO-Code des Stations-Overrides
2. Globaler Eintrag in `hex-overrides.json`
3. Letzte gültige automatische Zuordnung aus tar1090-db
4. Keine Zuordnung: kein Tracking-Link

Eine manuelle Stationszuordnung erhält im Dashboard die Kennzeichnung **MANUELL**. Das frühere rth.info-Sichtungsdatum wird nicht fälschlich als Bestätigung des manuellen Eintrags angezeigt.

## 5. Änderungen veröffentlichen

1. JSON-Datei im maßgeblichen Quellrepository ändern und committen.
2. Die Änderung in den `main`-Branch des GitHub-Repositories übernehmen.
3. Der Workflow veröffentlicht bei relevanten `main`-Pushes in der Regel automatisch mit dem letzten gültigen Datensatz. Alternativ **Actions → RTH Watch - update data and publish Pages → Run workflow → `publish`** ausführen.
4. Nach abgeschlossenem Pages-Deployment das Dashboard neu laden und Registrierung, Status **MANUELL** sowie Tracking-Link prüfen.

Ein erneuter Abruf von rth.info ist für das Wirksamwerden vorhandener Stations-Overrides nicht erforderlich. Bei einem zuvor noch nie erfolgreich durchgeführten Erstimport ist dagegen zunächst ein vollständiger Datensatz notwendig.

## 6. Override entfernen

Den betreffenden Stations- oder ICAO-Eintrag aus der JSON-Datei entfernen und erneut veröffentlichen. Leere Konfigurationsdateien müssen weiterhin gültiges JSON enthalten:

```json
{}
```

Nach dem Entfernen eines Stations-Overrides gilt wieder der letzte erfolgreich gespeicherte Datensatz der Originalquelle. Bei Bedarf kann anschließend ein manueller Workflow-Lauf im Modus `stations` gestartet werden.

## 7. Hinweise

- Änderungen an der versionierten Konfiguration sind öffentlich sichtbar, wenn das Repository öffentlich ist. Keine vertraulichen Informationen in Notizen oder JSON-Dateien ablegen.
- Beide Dateien müssen syntaktisch gültiges JSON enthalten; ungültige Einträge führen absichtlich zu einem fehlgeschlagenen Build.
- Eine neue Station kann nicht ausschließlich durch einen Override erzeugt werden. Eine Stations-ID muss bereits im gültigen Importbestand enthalten sein.
- Favoriten werden unabhängig von der Registrierung pro Stations-ID im jeweiligen Browser gespeichert.
