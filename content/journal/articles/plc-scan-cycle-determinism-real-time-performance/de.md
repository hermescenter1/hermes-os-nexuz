# SPS-Zykluszeit, Determinismus und Reaktionszeit

## Zusammenfassung

Fragt man nach der Reaktionsgeschwindigkeit einer SPS, bekommt man meist die Zykluszeit genannt. Dieser Wert ist real — und fast nie der dominierende Term. Die Zeit zwischen einem physischen Ereignis und einer physischen Reaktion ist eine Kette aus vier Beiträgen, und die Programmbearbeitung ist häufig der kleinste davon.

Dieser Beitrag behandelt Reaktionszeit als Budget mit benannten Termen, trennt Determinismus von Geschwindigkeit und erklärt, warum Jitter — die Schwankung zwischen Zyklen — Abläufe weit früher bricht als die mittlere Zykluszeit.

## Das Prozessabbild: Was das Programm tatsächlich sieht

Das zyklische Bearbeitungsmodell ist die Grundlage, und sein Missverständnis erzeugt eine spezifische Fehlerklasse.

```text
1. Eingaenge ins Prozessabbild lesen
2. Programm gegen das Abbild bearbeiten
3. Ausgangsabbild auf die physischen Ausgaenge schreiben
4. Nebenaufgaben (Kommunikation, Diagnose)
   -> wiederholen
```

Die maßgebliche Folge: **Das Programm sieht nicht das Feld, sondern eine Momentaufnahme.** Ein Eingang, der sich innerhalb eines Zyklus ändert und zurückfällt, hat für das Programm nie existiert. Ein Impuls kürzer als die Zykluszeit wird nicht „manchmal verpasst" — er ist systematisch unsichtbar.

Das ist kein Mangel. Genau das macht das Modell deterministisch: Die Logik wird gegen einen konsistenten Wertesatz bearbeitet, der sich nicht mitten im Zyklus unter ihr verändern kann. Es bedeutet aber, dass jedes Ereignis kürzer als der Zyklus eine andere Behandlung braucht — einen Prozessalarm, eine schnelle Task oder eine Speicherung im Gerät selbst. Zu entscheiden „die SPS bekommt das mit", ohne die Impulsdauer gegen die Zykluszeit zu prüfen, ist einer der häufigsten Zeitfehler in der industriellen Steuerungstechnik.

## Das Latenzbudget

Die Reaktionszeit auf ein Feldereignis lautet:

```text
t_Reaktion = t_Erfassung        (Geraet + Eingangsfilter)
           + t_EA_Update        (Aktualisierungsrate der Station)
           + t_Netz             (Uebertragung + Jitter)
           + t_Zyklus           (bis zu ein voller Zyklus, bevor der Eingang
                                 gelesen wird, plus Bearbeitung)
           + t_Ausgabe          (Ausgabe schreiben + Stationsaktualisierung)
           + t_Aktor            (Relais, Ventil, Antriebsreaktion)
```

Zwei Eigenschaften dieser Kette werden regelmäßig unterschätzt.

**Ein Signal kann fast einen vollen Zyklus auf das Einlesen warten.** Wird ein Eingang unmittelbar nach dem Lesen des Eingangsabbilds aktiv, wartet er bis zum nächsten Lesen. Deshalb liegt die Worst-Case-Eingangslatenz rund einen Zyklus über dem Mittelwert, nicht bei null.

**Die mechanischen und elektrischen Terme dominieren oft.** Ein auf einige Millisekunden gesetzter Eingangsfilter oder ein Ventil mit einer Stellzeit von einigen zehn Millisekunden kann den gesamten Steuerungsbeitrag übersteigen. Den Zyklus zu optimieren, wenn der Aktor die Grenze setzt, bringt keine messbare Verbesserung und verbraucht Ingenieurzeit.

Die Disziplin besteht schlicht darin, das Budget mit den realen Werten aus Gerätedatenblättern und der tatsächlichen Stationsprojektierung aufzuschreiben — nicht allein über den Zyklus nachzudenken, weil das der Term ist, den das Werkzeug anzeigt.

## Determinismus ist nicht Geschwindigkeit

Das sind unabhängige Eigenschaften, und sie zu vermengen erzeugt reale Entwurfsfehler.

**Geschwindigkeit** ist, wie lange ein Zyklus im Mittel dauert.
**Determinismus** ist, wie eng diese Zeit begrenzt ist.

Eine Steuerung mit 10 ms mittlerem Zyklus und ±0,2 ms Schwankung ist für koordinierte Bewegung weit brauchbarer als eine mit 4 ms Mittel und ±6 ms Schwankung — obwohl sie im Mittel langsamer ist. Die zweite Steuerung ist schneller und auf keinen vorhersagbaren Zeitpunkt verlässlich.

**Jitter ist es, was Abläufe bricht.** Logik, die eine Dauer durch Zählen von Zyklen bestimmt oder annimmt, zwei durch ein bekanntes Intervall getrennte Ereignisse würden in einem bestimmten Verhältnis gesehen, versagt, wenn der Abstand zwischen Zyklen schwankt. Der Fehler ist sporadisch und lastabhängig — die am schwersten zu diagnostizierende Art.

Die ingenieurtechnische Folgerung: **Minimum, Maximum und aktuelle Zykluszeit messen und dokumentieren — nicht nur den aktuellen Wert.** Der aktuelle Wert sagt fast nichts. Das Maximum nennt den Worst Case, den die Abläufe vertragen müssen, und die Streuung sagt, ob das System überhaupt deterministisch ist.

## Taskstruktur und Priorität

Moderne Steuerungen bearbeiten mehrere Tasks unterschiedlicher Priorität. Die Anwendungsentscheidungen:

| Tasktyp | Typische Nutzung | Entwurfswarnung |
| --- | --- | --- |
| Zyklisch (Haupt) | Der Großteil der Anwendungslogik | Wächst über die Projektlaufzeit unbemerkt |
| Weckalarm / zeitgesteuert | Regelkreise, schnelle Überwachung | Jede Millisekunde Inhalt kostet den Hauptzyklus |
| Prozessalarm | Ereignisse kürzer als der Hauptzyklus | Handler minimal halten |
| Anlauf | Initialisierung | Ausgänge nie undefiniert lassen |
| Fehlertasks | Fehlerbehandlung | Ihr Fehlen ändert das Steuerungsverhalten |

Der häufigste Strukturfehler ist, **eine schnelle zyklische Task als allgemeinen Behälter für „wichtige Logik" zu verwenden.** Eine 10-ms-Task läuft hundertmal pro Sekunde. Dort abgelegte Logik, die diese Rate nicht braucht, verbraucht CPU-Leistung, die dem Hauptzyklus dann fehlt — und weil sie ihn unterbricht, erhöht sie zusätzlich dessen Jitter.

Die anzuwendende Regel: Inhalt gehört nur dann in eine schnelle Task, wenn eine formulierte Anforderung diese Rate verlangt. „Dort fühlte es sich sicherer an" ist keine Anforderung und hat messbare Kosten.

**Alarm-Handler bleiben kurz.** Ein langer Handler blockiert die Bearbeitung niedrigerer Priorität über seine gesamte Dauer und verwandelt einen Alarm, der die Reaktionsfähigkeit verbessern sollte, in eine Jitterquelle für alles andere.

## Wo die Zeit tatsächlich hingeht

Ist ein Zyklus länger als erwartet, sind die üblichen Beiträge — grob nach Häufigkeit:

- **Kommunikationslast.** Azyklischer Verkehr — pollende HMI-Clients, angeschlossene Diagnosewerkzeuge, Datenaufzeichnung — konkurriert mit der zyklischen Bearbeitung. Eine am ruhigen Prüfplatz gemessene Zykluszeit ist nicht die Zykluszeit im Betrieb mit sechs HMI-Clients.
- **Schleifen mit datenabhängiger Grenze.** Eine Schleife, deren Durchlaufzahl von Prozessdaten abhängt, macht die Zykluszeit von Prozessdaten abhängig. Jede Schleife explizit begrenzen.
- **Blockierende Anweisungen.** Manche Kommunikations- und Dateioperationen dauern mehrere Zyklen oder blockieren. Ihr Verhalten muss bekannt sein, nicht angenommen.
- **Angesammelte Logik.** Die häufigste und unspektakulärste Ursache: drei Jahre Ergänzungen, von denen keine für sich ins Gewicht fiel.

## Fehlerbilder

**Der Impuls, der nie gesehen wird.** Ein Näherungsschalter erzeugt ein Signal kürzer als die Zykluszeit. Das Programm verpasst es systematisch, aber nur bei hoher Produktionsgeschwindigkeit — es erscheint also als geschwindigkeitsabhängiger sporadischer Fehler und wird dem Sensor angelastet.

**Schleichende Zykluszeit bis zum Zeitfehler.** Logik sammelt sich, bis die Überwachungszeit überschritten wird. Die Reaktion der Steuerung ist ein projektiertes Verhalten — wurde die Zeitfehlerbehandlung nie ausgelegt, kann das Ergebnis ein Steuerungsstopp sein.

**Zyklen als Uhr zählen.** Logik, die zur Zeitmessung Zyklen zählt, liefert eine lastabhängige Zeit. Sie funktioniert bei der Inbetriebnahme und driftet im Betrieb.

**Reihenfolgeabhängige Logik.** Zwei Bausteine, deren Korrektheit davon abhängt, welcher zuerst bearbeitet wird. Funktioniert, bis jemand die Aufrufe umsortiert oder eine schnelle Task dazwischen unterbricht.

**Überlauf der schnellen Task.** Ein Weckalarm, dessen Inhalt nicht in sein Intervall passt. Das Überlaufverhalten ist plattformabhängig und nie gutartig — und der Zustand kann unbemerkt bestehen bleiben, wenn ihn nichts auswertet.

## Diagnose: einen Zeitfehler untersuchen

*Das Folgende ist ein illustratives ingenieurtechnisches Szenario.*

**Symptom:** Eine Verpackungslinie weist sporadisch Produkt aus, häufiger bei höherer Liniengeschwindigkeit. Die Ausschussentscheidung beruht auf einem Sensorwert in Korrelation mit einer Geberposition.

**Zu erhebende Belege:**

- Minimum, Maximum und aktuelle Zykluszeit unter Produktionslast
- die projektierte E/A-Aktualisierungsrate der Station mit dem Sensor
- die tatsächliche Impulsdauer des Sensors bei den fehlerhaften Geschwindigkeiten
- die Eingangsfiltereinstellung der Baugruppe
- ob die Fehlerrate mit der Liniengeschwindigkeit, der Zahl der HMI-Clients oder beidem korreliert
- die Netzwerk-Portstatistik dieser Station

**Schlussfolgerung:** Ist die Impulsdauer bei der fehlerhaften Geschwindigkeit kürzer als das E/A-Aktualisierungsintervall, geht das Signal verloren, bevor das Programm es überhaupt sieht — keine Programmoptimierung hilft, und die Abhilfe ist eine schnellere Stationsaktualisierung, ein Prozessalarm oder eine Speicherung im Gerät. Ist der Impuls deutlich länger, springt aber die maximale Zykluszeit beim Verbinden von HMI-Clients, ist Kommunikationslast die Ursache, die den Jitter aufbläht. Trifft keines zu, ist die Geberkorrelationslogik selbst verdächtig.

Die drei Befunde haben drei unabhängige Abhilfen. Zuerst zu messen trennt sie; zuerst das Programm zu ändern verbraucht die Schicht.

## Hinweise zur Inbetriebnahme

- **Zykluszeit unter realistischer Last messen** — HMI-Clients verbunden, Diagnose aktiv, bei Produktionsrate. Eine Prüfplatzmessung ist keine Basislinie.
- **Minimum, Maximum und Mittelwert bei der Übergabe dokumentieren.** Nur so ist eine spätere Leistungsfrage beantwortbar.
- **Jeden schnellen Impuls gegen die tatsächliche E/A-Aktualisierungsrate prüfen**, nicht gegen die Zykluszeit. Die Stationsaktualisierung ist meist die bindende Randbedingung.
- **Echte Reserve belassen.** Eine nahe an ihrer Überwachungsgrenze übergebene Steuerung hat keinen Raum für die Diagnose, die eine künftige Untersuchung braucht.
- **Den Zeitfehlerpfad gezielt prüfen**, statt sein Verhalten anzunehmen.

## Sicherheitstechnische Hinweise

Wo eine Reaktionszeit Teil einer Sicherheitsfunktion ist, ist sie eine Eigenschaft der gesamten Kette — Sensor, Logik, Endglied — und wird nach den für die Anlage geltenden Normen zur funktionalen Sicherheit ausgelegt und nachgewiesen. Die Sicherheitsreaktionszeit ist nicht die Zykluszeit, und das Zeitverhalten einer Sicherheitsfunktion wird nie durch Messung an der Standardsteuerung festgestellt.

Der praktische Punkt für die Standardsteuerung: Im Standardsystem realisierte Schutzverriegelungen haben eine Reaktionszeit, die bekannt und benannt sein muss — denn irgendwann fragt jemand danach, und „etwa ein Zyklus" ist keine Antwort, die eine Prüfung übersteht.

## Empfohlene Vorgehensweise

- Das Latenzbudget mit realen Geräte- und Stationswerten aufschreiben, bevor irgendetwas optimiert wird.
- Determinismus und Geschwindigkeit als getrennte Anforderungen behandeln; den zulässigen Jitter festlegen.
- Minimum, Maximum und Mittelwert der Zykluszeit dokumentieren — nie nur den aktuellen Wert.
- Die Impulsbreite jedes schnellen Signals gegen die E/A-Aktualisierungsrate prüfen.
- Logik nur dann in eine schnelle Task legen, wenn eine formulierte Anforderung diese Rate verlangt.
- Alarm-Handler minimal halten.
- Jede Schleife explizit begrenzen; die Durchlaufzahl nie von Prozessdaten abhängen lassen.
- Zeit nie durch Zyklenzählen messen; einen echten Zeitgeber verwenden.
- Zeitfehler- und Überlaufverhalten auslegen statt erben.

## Fazit

Reaktionszeit in einem Steuerungssystem ist eine Kette, und der Steuerungszyklus ist ein Glied davon — oft nicht das längste. Sie gut auszulegen heißt, das Budget mit realen Werten aufzuschreiben, Mittelwert und Worst Case zu unterscheiden und Jitter als spezifizierte Eigenschaft zu behandeln statt als etwas, das man später entdeckt.

Die wertvollste Gewohnheit ist zugleich die billigste: Minimum, Maximum und Mittelwert unter realistischer Last messen und dokumentieren. Fast jede schwierige Zeituntersuchung beginnt mit der Frage, ob sich das Zeitverhalten verändert hat — und fast keine kann sie beantworten.
