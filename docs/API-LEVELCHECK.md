# Trainingscenter ↔ Levelcheck API

Basis-URL: dieselbe Host-URL wie die bestehende Training-API.  
CORS: wie bei `/api/training/status` und `/api/training/results` (u. a. `https://trainingscenter.streetsoflogic.de`).  
Kennung: Query/Body-Feld `t` (Training-Token), gleiche Prüfung wie bei den bestehenden Endpunkten.

## `GET /api/training/status?t=…`

Unverändertes Antwortformat plus **zusätzliches** Feld `levelchecks`:

```json
{
  "zielnote": 2,
  "halte": { "…": { } },
  "levelchecks": [
    {
      "id": "uuid-des-checkpoints",
      "titel": "Levelcheck 1",
      "datum": "2026-11-24",
      "level": "rookie",
      "wz": ["qg-01", "qg-02"],
      "aufgaben": 10,
      "schwelle": 7,
      "status": "offen",
      "richtig": null,
      "bestaetigtAm": null
    }
  ]
}
```

- `level`: `rookie` | `operator` | `streetLegend`
- `status`: `geplant` | `offen` | `eingetragen` | `bestätigt` | `nicht_bestanden` | `nicht_teilgenommen`
- `wz`: Trainingscenter-Was-Ziel-IDs (z. B. `qg-01` …), keine internen DB-UUIDs
- `bestaetigtAm`: Freigabe-Datum (`YYYY-MM-DD`) oder `null` (für 7-Tage-„bestanden“-Fähnchen)
- Nur Levelchecks der Klasse der Kennung, gefiltert auf das Thema der Kennung
- Sortiert nach Datum aufsteigend
- Freigegebene Termine: bis 14 Tage zurück sichtbar

## `POST /api/training/levelcheck`

Body:

```json
{ "t": "<token>", "levelcheckId": "<checkpoint-uuid>", "richtig": 7 }
```

- Erlaubt nur bei Status `offen` oder `eingetragen`
- `richtig`: ganze Zahl 0…`aufgaben` (Standard 10)
- Antwort: derselbe Eintrags-Shape wie in `levelchecks[]` (mit aktualisiertem `status` / `richtig`)
- Bei geplant / freigegeben / ungültigem Token: Fehlerstatus wie bei `/results` (400/404/410)

## `OPTIONS /api/training/levelcheck`

CORS-Preflight, analog zu den anderen Training-Endpunkten.
