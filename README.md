# Ascandir - DnD5e Action Economy

Aktionsökonomie für Foundry VTT (v14) mit dem Spielsystem D&D 5e (6.x).

## Funktionen

### Reaktionen im Kampf verfolgen

Sobald eine Kreatur **im laufenden Kampf außerhalb ihres eigenen Zugs** etwas nutzt, das eine Aktion,
Bonusaktion oder Reaktion kostet – etwa einen Gelegenheitsangriff, *Schild* oder *Höllischer Tadel* –,
bekommt sie den Zustand **„Reaktion verbraucht“**.

- Der Zustand trägt den Namen der genutzten Fähigkeit, z. B. **„Reaktion verbraucht: Schild“**
  (sichtbar am Token, im Token-HUD und auf dem Charakterbogen unter Effekte).
- Zu **Beginn des nächsten eigenen Zugs** verschwindet der Zustand automatisch.
- Wird der Kampf beendet oder zurückgesetzt, verlieren alle Teilnehmer den Zustand.
- Außerhalb des Kampfes passiert nichts.
- Der Spielleiter kann den Zustand jederzeit von Hand über das Token-HUD setzen oder entfernen.

### Einstellungen (nur Spielleiter)

| Einstellung | Wirkung |
|---|---|
| **Wessen Reaktionen verfolgen?** | Nur Spielercharaktere (Standard) oder alle Kampfteilnehmer inkl. NSC. |
| **Reaktion im eigenen Zug zählt** | Wer eine Reaktions-Fähigkeit im eigenen Zug nutzt, hat bis zum nächsten Zug keine Reaktion mehr (Standard: an). |
| **Bei bereits verbrauchter Reaktion** | Warnen (Standard), Spielern die Nutzung verbieten oder nichts tun. Der Spielleiter wird nie blockiert. |

**Hinweise**

- Gezählt werden Fähigkeiten, deren Aktivierung im Gegenstand auf *Aktion*, *Bonusaktion* oder
  *Reaktion* steht. Legendäre Aktionen, Hortaktionen und passive Effekte zählen nicht.
- Das Entfernen beim Zugwechsel übernimmt der Spielleiter-Client. Ist kein Spielleiter online,
  macht es der Spieler, der den Zug weiterschaltet.

## Installation

In Foundry unter **Add-on-Module → Modul installieren** diese Manifest-URL eintragen:

```
https://github.com/Ascandir/Ascandir---DnD5e-Action-Economy/releases/latest/download/module.json
```

Updates erscheinen danach automatisch in Foundry, sobald eine neue Version veröffentlicht ist.
