# Bedienoberflächen für Störungssituationen entwerfen

## Zusammenfassung

Nahezu der gesamte Entwurfsaufwand für HMI fließt in den Zustand, in dem sich eine Anlage fast immer befindet. Das ist nachvollziehbar und weitgehend falsch platziert. Im Normalbetrieb ist die Oberfläche eine Beobachtungsfläche, und eine mittelmäßige lässt sich ertragen. In einer Störungssituation wird sie zum Entscheidungsinstrument, und ihre Schwächen werden genau in dem Moment zu den Schwächen des Bedieners, in dem es darauf ankommt.

Die Entwurfsaufgabe ist genau umrissen: Die Oberfläche muss nützlich bleiben, wenn die bei ihr ankommende Information *schlechter* ist als sonst — weniger vertrauenswürdige Messwerte, mehr gleichzeitige Meldungen und weniger Zeit. Die meisten Bilder sind unter der gegenteiligen Annahme entworfen.

## Warum das zählt

> Dieser Beitrag setzt die allgemeinen Grundsätze des High-Performance-HMI-Entwurfs — Hierarchie, Farbdisziplin, Faceplates, Navigation — voraus und wiederholt sie nicht. Sein Thema ist, was sich ändert, wenn der Prozess den Normalzustand verlässt.

Drei Eigenschaften von Störungssituationen bestimmen den gesamten Entwurf:

**Die Information verschlechtert sich genau dann, wenn sie am dringendsten gebraucht wird.** Die Messstelle, die sagen könnte, was geschieht, ist oft genau die ausgefallene — oder sie misst unter einer Bedingung, für die sie nicht kalibriert wurde. Eine Oberfläche, die jede Zahl mit gleicher Sicherheit darstellt, ist in diesem Zustand aktiv irreführend.

**Die Aufmerksamkeit verengt sich unter Belastung.** Periphere Information wird nicht mehr verarbeitet. Ein Bild, dessen kritischer Inhalt über den Bildschirm verteilt ist, verlässt sich auf ein Blickverhalten, das dann nicht mehr stattfindet.

**Der Bediener muss eine kausale Geschichte bilden, nicht Werte ablesen.** Die Frage lautet nie „wie hoch ist der Füllstand?“. Sie lautet: „warum ist das passiert, was tut es jetzt, und was geschieht, wenn ich nichts tue?“ Oberflächen, die die erste Frage gut und die anderen drei überhaupt nicht beantworten, sind verbreitet.

## Meldungsfluten

Fluten sind nicht allein ein Problem der Meldungsrationalisierung; sie sind ein Darstellungsproblem mit eigener Entwurfsantwort.

> Meldungsphilosophie, Rationalisierung, Kennzahlen und der Lebenszyklus, der die Häufigkeit von Fluten senkt, werden in den Begleitbeiträgen zum Meldungsmanagement behandelt. Dieser Abschnitt behandelt das Verhalten der Oberfläche, wenn die Flut bereits läuft.

**Eine chronologische Liste ist während einer Flut die denkbar schlechteste Darstellung** — und die häufigste. Sie zeigt fünfzig Folgen und eine Ursache in Eingangsreihenfolge, wobei die Ursache meist weit oben steht und bereits aus dem Bild gescrollt ist.

Wirksame Entwurfsantworten:

- **Erstmeldungserfassung.** Das auslösende Ereignis, gespeichert und separat dargestellt, ist die wertvollste Einzelinformation in einer Flut. Es muss die Flut überleben, statt eine Zeile in ihr zu sein.
- **Gruppierung nach Anlagenbereich oder Ursache**, sodass eine Flut als „Einheit 3 hat ausgelöst“ erscheint und nicht als sechzig unabhängige Tatsachen.
- **Sichtbare Unterdrückung.** Meldungen, die während eines bekannten Zustands konstruktiv unterdrückt werden, sind legitim; eine Unterdrückung, die der Bediener nicht sieht, ist eine Gefährdung — er kann „ruhig“ nicht von „stummgeschaltet“ unterscheiden.
- **Eine Ratenanzeige.** Zu wissen, dass Meldungen schneller eintreffen, als sie gelesen werden können, ist selbst eine Information: Sie sagt dem Bediener, die Liste zu verlassen und den Prozess anzusehen.

Die Entwurfsabsicht, die man festhalten sollte: **während einer Flut besteht die Aufgabe der Oberfläche darin, die Liste zu einer Situation zu verdichten, nicht die Liste getreu abzubilden.**

## Erstmeldung und kausaler Kontext

Die Erstmeldung — welche Bedingung zuerst gewirkt hat — entscheidet zwischen einer Diagnose in einer Minute und einer in dreißig.

Was sie brauchbar macht:

- **Sie muss an der Quelle erfasst werden.** Die Rekonstruktion der ersten Ursache aus Zeitstempeln auf Leitebene scheitert, wenn Zyklus- und Kommunikationsverzögerungen größer sind als der Abstand zwischen den Ereignissen — was bei einer schnellen Auslösekette in der Regel der Fall ist.
- **Sie muss speichern.** Die auslösende Bedingung ist häufig verschwunden, bis jemand hinsieht — ein Druck, der kurz ausschlug und zurückging, ein Kontakt, der 200 ms öffnete.
- **Sie muss in einem Schritt von dort erreichbar sein, wo der Bediener ohnehin ist.** Eine Erstmeldung, für die man auf ein Diagnosebild wechseln muss, wird nach dem Ereignis konsultiert, nicht währenddessen.

**Die Anzeige von Verriegelungen und Freigabebedingungen gehört ebenfalls hierher.** Wird ein Start verweigert, muss die Oberfläche zeigen, *welche* Freigabe fehlt — nicht bloß, dass der Start scheiterte. Die Alternative ist ein Bediener, der wiederholt eine Taste drückt, während der Grund in einer Logik liegt, die vom Leitstand aus nicht sichtbar ist — ein Fehlermuster, das in praktisch jeder Anlage mit komplexer Startsequenz auftritt.

## Ausgefallene Messtechnik

Das ist der Abschnitt, der am häufigsten vollständig fehlt — und der mit der größten Konsequenz.

**Ein ausgefallener Messwert darf nie aussehen wie ein gültiger.** Drei Zustände müssen auf den ersten Blick unterscheidbar sein:

| Zustand | Bedeutung | Was die Anzeige vermitteln muss |
| --- | --- | --- |
| Gut | Messwert aktuell und im Bereich | Normale Darstellung |
| Veraltet | Letzter bekannter Wert, Kommunikation verloren | Wert sichtbar, klar als nicht aktuell gekennzeichnet |
| Schlecht | Sensorfehler, außerhalb des Bereichs, ausgefallen | Wert zurückhalten oder ausdrücklich als ungültig zeigen |

Der gefährliche Fall ist **veraltet**, denn ein eingefrorener Wert sieht exakt aus wie ein stabiler Prozess. Wer einen Füllstand betrachtet, der sich seit vier Minuten nicht bewegt hat, zieht den einen Schluss, wenn er stabil ist, und den entgegengesetzten, wenn die Anzeige schlicht tot ist — und nichts an einer ungekennzeichneten Zahl unterscheidet die beiden.

**Abgeleitete und berechnete Werte erben die Qualität ihrer Eingänge.** Eine aus einem ausgefallenen Messumformer gebildete Durchflusssumme sollte sichtbar degradieren, statt weiter eine plausibel wirkende Zahl aufzuaddieren. Wo eine Berechnung stillschweigend einen Vorgabewert für einen schlechten Eingang einsetzt, wird die Anzeige selbstbewusst falsch — und das ist schlimmer als nicht verfügbar.

**Redundante oder verwandte Messstellen lohnen im gestörten Zustand eine gemeinsame Darstellung.** Zwei Geräte, die normalerweise übereinstimmen und nun auseinanderlaufen, sind eine Diagnose; jedes für sich ist nur eine Zahl.

## Betriebsart und eingeschränkter Betrieb

Anlagen gehen selten unmittelbar von „läuft“ auf „steht“. Sie durchlaufen Zwischenzustände, und Oberflächen bilden diese Zustände häufig überhaupt nicht ab.

Der Bediener muss ohne Nachfragen wissen:

- **In welcher Betriebsart jede größere Einheit steht** — Automatik, Hand, Vor Ort, außer Betrieb, Wartungsübersteuerung.
- **Welche Regelkreise auf Hand stehen** und seit wann. Ein nach dem Schichtwechsel auf Hand belassener Regler ist ein bekannter Vorbote einer Prozessabweichung — und unsichtbar, solange die Anzeige ihn nicht sichtbar macht.
- **Welche Schutzfunktionen überbrückt oder übersteuert sind**, und wie lange schon. Überbrückungen sind betrieblich manchmal nötig; eine nicht erfasste, nicht angezeigte Überbrückung ist keine Überbrückung mehr, sondern eine verborgene Änderung des Schutzverhaltens der Anlage.
- **Wozu die Anlage aktuell in der Lage ist.** Der Betrieb mit einer von zwei Pumpen und einem nicht verfügbaren Kühlstrang ist eine andere Anlage als die, welche die Anzeige normalerweise abbildet.

**Der Entwurfsgrundsatz: eingeschränkte Leistungsfähigkeit muss sichtbar sein, ohne dass der Bediener sie aus Komponentenzuständen erschließen muss.** Aus vier einzelnen Pumpensymbolen abzuleiten, dass keine Kühlreserve mehr besteht, ist genau die Denkarbeit, die unter Belastung ausfällt.

## Prozessabweichungen

Eine Abweichung ist ein Verlauf und kein Wert, und Oberflächen, die um Momentanwerte herum gebaut sind, werden ihr durchgängig nicht gerecht.

**Trends sind Entscheidungshilfe, nicht Historie.** Ein Wert von 78 % sagt wenig; ein Wert von 78 %, der vor vier Minuten bei 45 % lag, sagt etwas Bestimmtes. Im gestörten Zustand muss der Verlauf der Schlüsselgrößen dort sichtbar sein, wo der Bediener hinsieht — nicht einen Navigationsschritt entfernt.

Entwurfselemente, die bei Abweichungen zählen:

- Trends mit **einem zur Prozesszeitkonstante passenden Zeitfenster**. Ein Ein-Stunden-Fenster auf einem schnellen Prozess zeigt eine senkrechte Linie; ein Fünf-Minuten-Fenster auf einem langsamen zeigt Rauschen.
- **In den Trend eingezeichnete Grenzwerte**, damit Nähe räumlich statt rechnerisch erfassbar wird.
- **Explizit dargestellte Änderungsrate**, wo sie die Entscheidung bestimmt. Bei manchen Prozessen entscheidet die Geschwindigkeit einer Größe stärker über die Reaktion als ihr aktueller Wert.
- **Verwandte Größen auf gemeinsamer Zeitachse**, denn die Beziehung zweier Kurven ist häufig die Diagnose selbst.

## Überladung der Oberfläche vermeiden

Jedes Element in diesem Beitrag fügt Information hinzu, und die übergeordnete Entwurfsrandbedingung zieht in die Gegenrichtung: **eine Oberfläche, die in einer Störungssituation mehr zeigt, hat die Situation meist verschlechtert.**

Beides zu vereinbaren heißt zu entscheiden, was *entfällt*:

- Dekoration, Verläufe, dreidimensionale Effekte und Animation verbrauchen Aufmerksamkeit und übermitteln nichts. Ihr Preis ist im Normalbetrieb unsichtbar und im Ereignis erheblich.
- Detailtiefe, die zur Normalüberwachung passt, darf zurücktreten, wenn sich die Lage ändert; nicht alles, was sonst sichtbar ist, muss sichtbar bleiben.
- Popups, die mitten in einer sich entwickelnden Lage eine Quittierung verlangen, sind eine Unterbrechung im denkbar ungünstigsten Moment.
- Die Zahl der Navigationsschritte zwischen Bemerken und Verstehen ist ein Entwurfsparameter. Unter Belastung sind drei Schritte oft gleichbedeutend mit unendlich.

**Ein brauchbarer Test: Kann der Bediener die Fragen „was ist gestört, was hat es ausgelöst, was tut es jetzt und was soll ich tun“ beantworten, ohne das Bild zu verlassen, auf dem er ist?** Wenn nicht, verlangt der Entwurf Navigation genau dann, wenn Navigation am unwahrscheinlichsten ist.

## Sichere Rückführung

Die Rückführung erhält weniger Entwurfsaufmerksamkeit als das Ereignis selbst — und genau dort entsteht am häufigsten der zweite Vorfall.

Was die Oberfläche unterstützen sollte:

- **Wo die Anlage in der Rückführungssequenz gerade steht**, falls eine Sequenz existiert. Wiederanfahrprozeduren stehen häufig in einem Dokument, während die Anlage auf einem Bildschirm läuft.
- **Was vor dem nächsten Schritt erfüllt sein muss** — wiederum Freigaben, dargestellt als Checklistenzustand statt als Verweigerung nach dem Versuch.
- **Was zurückgesetzt wurde und was nicht.** Eine gespeicherte Auslösung, die an einer Stelle quittiert wurde und an einer anderen nicht, ist eine klassische Ursache für eine zweite Auslösung wenige Minuten später.
- **Was aus dem Ereignis noch überbrückt ist.** Während der Störung gesetzte Übersteuerungen müssen bei der Rückführung sichtbar sein, sonst werden sie versehentlich dauerhaft.

**Die Rückführung ist auch der Zeitpunkt, an dem die Aufzeichnung entsteht.** Eine Oberfläche, die das Festhalten des Geschehenen leicht macht — ein Schnappschuss, eine Anmerkung, ein gesichertes Ereignisfenster — ermöglicht eine Nachbetrachtung mit Belegen statt mit Erinnerungen.

## Fehlermodi

**Chronologische Meldungsliste als einzige Darstellung.** Die Ursache ist eine Zeile unter sechzig und bereits aus dem Bild.

**Keine Erstmeldung oder eine auf Leitebene abgeleitete.** Die Sequenzrekonstruktion scheitert, weil die Ereignisse enger liegen als der Abtastzyklus.

**Eingefrorene Werte, nicht von stabilen unterscheidbar.** Kommunikationsverlust liest sich als ruhiger Prozess.

**Berechnungen, die Vorgabewerte für schlechte Eingänge einsetzen.** Die Anzeige ist selbstbewusst falsch.

**Verriegelungsverweigerung ohne Begründung.** Der Bediener versucht es erneut; die blockierende Freigabe ist vom Leitstand aus unsichtbar.

**Nicht angezeigte Handregler und Überbrückungen.** Ein Betriebszustand, den niemand sieht, wird zu einem, an den sich niemand erinnert.

**Trends einen Navigationsschritt entfernt.** Der Verlauf, der die Lage erklärt, ist nicht dort, wo die Aufmerksamkeit ist.

**Rückführung nach Papierprozedur, während die Anlage auf dem Bildschirm läuft.** Schritte werden übersprungen oder wiederholt; eine zweite Auslösung folgt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Eine Prozesseinheit löst aus. Die Meldungsliste erhält binnen einer Minute über achtzig Einträge. Die Bediener isolieren die Einheit sicher, doch der Wiederanlauf verzögert sich, während die Ursache gesucht wird — und diese Verzögerung macht den Großteil des Produktionsverlusts aus.

Der später zusammengetragene Befund: Auslösende Bedingung war ein einzelner Messumformer, der auf einen Wert außerhalb des Bereichs ausfiel, seinen Regelkreis in den Anschlag trieb und sich fortpflanzte. In der Meldungsliste erschien die Umformerstörung als ein Eintrag inmitten der Flut, in der Darstellung nicht von den achtzig Folgemeldungen zu unterscheiden. Im Prozessbild wurde der Wert dieses Umformers weiterhin im gleichen Stil dargestellt wie jeder gültige Messwert — das Bild kannte keine Darstellung für „schlecht“.

Zwei fehlende Entwurfselemente machten aus einer Fünf-Minuten-Diagnose eine Stunde: keine gespeicherte Erstmeldung und keine visuelle Kennzeichnung ungültiger Daten. Keines ist teuer zu beheben; beide wurden schlicht nie spezifiziert, weil das Bild für eine normal laufende Anlage entworfen worden war.

Die Korrektur ist unspektakulär und strukturell: das auslösende Ereignis in der Steuerung erfassen und speichern, schlechte und veraltete Qualität überall dort erkennbar darstellen, wo ein Wert erscheint, und die Erstmeldung dorthin legen, wo der Bediener ohnehin hinsieht. Nichts davon verändert den Prozess; alles davon verändert, wie schnell er verstanden wird.

## Empfohlene Praxis

- Den gestörten Fall ausdrücklich entwerfen; ihn nicht als Normalbild unter Stress behandeln.
- Die Erstmeldung an der Quelle erfassen und speichern und dort anzeigen, wo der Bediener ohnehin ist.
- Fluten als Situation darstellen — gruppiert, mit Ratenanzeige, mit sichtbarer Unterdrückung — nicht als getreue chronologische Liste.
- Gute, veraltete und schlechte Daten überall visuell unterscheidbar machen, wo ein Wert erscheint.
- Abgeleitete Werte mit ihren Eingängen degradieren lassen, statt Vorgabewerte einzusetzen.
- Zeigen, warum eine Freigabe oder Verriegelung blockiert, nicht nur dass sie blockiert hat.
- Handregler, aktive Überbrückungen und Übersteuerungen mit verstrichener Zeit anzeigen.
- Eingeschränkte Anlagenfähigkeit direkt anzeigen, nicht aus Komponentenzuständen ableitbar machen.
- Trends mit Grenzwerten und passendem Zeitfenster dorthin legen, wo entschieden wird.
- Dekoration und unnötige Details entfernen; den Entwurf an Navigationsschritten unter Belastung messen.
- Die Rückführung am Bildschirm unterstützen: Position in der Sequenz, offene Freigaben, Rücksetzstand, verbliebene Überbrückungen.
- Bilder nach realen Ereignissen überprüfen und diese als den Test nutzen, den der Entwurf nie hatte.

## Fazit

Eine Oberfläche für Störungssituationen ist keine detailreichere Fassung der normalen Oberfläche. Sie wird gegen andere Annahmen entworfen: weniger vertrauenswürdige Daten, weniger verfügbare Aufmerksamkeit, weniger Zeit — und eine Frage, die kausal statt numerisch ist.

Die einzelnen Elemente sind für sich genommen bescheiden — gespeicherte Erstmeldung, qualitätsdifferenzierte Werte, sichtbare Überbrückungen, Trends mit Grenzwerten, begründete Freigaben — und gemeinsam entscheiden sie darüber, ob ein Ereignis in Minuten oder in Stunden verstanden wird. Der Grund für ihr häufiges Fehlen ist weder Kosten noch Schwierigkeit. Es ist, dass das Bild von Menschen spezifiziert wurde, die sich die Anlage im Betrieb vorstellten — und von Menschen benutzt wird, deren Anlage steht.
