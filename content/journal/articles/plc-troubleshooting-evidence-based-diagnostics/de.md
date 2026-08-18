# SPS-Fehlersuche mit belegbasierter Diagnose

## Zusammenfassung

Die meiste industrielle Fehlersuche ist Bauteiltausch, der als Diagnose auftritt: erst den Sensor tauschen, dann die Baugruppe, dann den Antrieb — und das Problem für gelöst erklären, sobald das Symptom aufhört. Manchmal führt das zum Ziel. Es erzeugt kein Verständnis, ist nicht lehrbar und versagt vollständig bei sporadischen Fehlern — also genau bei denen, die die Zeit verbrauchen.

Die Alternative ist Aufteilung: mit einer Messung die Hälfte der Kandidaten ausschließen, wiederholen, und aufhören, wenn ein Bauteil übrig bleibt. Dieser Beitrag benennt die Aufteilungsgrenzen in einem SPS-gesteuerten System, welche Belege vor jedem Eingriff zu sichern sind und welche Disziplin sporadische Fehler beherrschbar macht.

## Die zentrale Grenze: Befehl gegen Rückmeldung

Nahezu jeder binäre Fehler in einem SPS-gesteuerten System teilt sich an einer Stelle: **Kommandiert die Steuerung die Aktion, und bestätigt die Rückmeldung sie?**

Vier Kombinationen, vier völlig verschiedene Untersuchungen:

| Befehl | Rückmeldung | Bedeutung | Wo suchen |
| --- | --- | --- | --- |
| FALSE | FALSE | Es wurde nichts angefordert | Vorgelagert: Freigaben, Verriegelungen, Ablauf |
| TRUE | FALSE | Angefordert, nicht geschehen | Nachgelagert: Ausgang, Verdrahtung, Schütz, Gerät |
| FALSE | TRUE | Ohne Anforderung geschehen | Rückmeldepfad oder echter unbefohlener Betrieb |
| TRUE | TRUE | Es hat funktioniert | Die Beanstandung betrifft etwas anderes |

Diese eine Ablesung schließt den größten Teil der Anlage aus. Die erste Zeile schickt einen ins Programm, die zweite in den Schaltschrank — und beide werden fast nie von derselben Person mit denselben Werkzeugen bearbeitet.

Warum das schwerer wiegt, als es klingt: **Die häufigste vergeudete Diagnose ist die Untersuchung des Befehlspfads, obwohl nie ein Befehl erteilt wurde.** Betriebsmittel, die wegen einer fehlenden Freigabe „nicht anlaufen", sehen exakt so aus wie solche, die wegen einer unterbrochenen Schützspule „nicht anlaufen" — von der Seite der Maschine aus, an der das Bedienpersonal steht.

## Belege, die vor jedem Eingriff zu sichern sind

Sobald jemand anfängt, Dinge zu verändern, ist der ursprüngliche Zustand verloren. Zuerst sichern:

1. **Den Diagnosepuffer der Steuerung** mit Zeitstempeln rund um das Ereignis. Das ist ihre eigene Darstellung, und sie geht bei manchen Aktionen verloren.
2. **Befehls- und Rückmeldezustand** des betroffenen Betriebsmittels.
3. **Freigabe- und Verriegelungszustände einzeln** — nicht das verknüpfte Ergebnis.
4. **Stations- und Kanalstatus** jeder beteiligten Baugruppe.
5. **Zykluszeit**: Minimum, Maximum und aktueller Wert.
6. **Netzwerk-Portstatistik** der betroffenen Stationen: Fehler, Discards, Link-Flapping.
7. **Was sonst geschah** — was anlief, was stoppte, was bedient wurde.
8. **Den Erstwertdatensatz**, falls das Betriebsmittel einen führt.

Die Punkte 4 und 6 werden am häufigsten übersprungen und sind am häufigsten entscheidend. Ein Eingang, dessen Station ausgefallen ist, ist kein Messwert; Logik, die den Stationsstatus nicht auswertet, rechnet mit eingefrorenen oder genullten Werten, als wären sie real — und nichts in der Programmsicht zeigt das an.

## Die Aufteilungsmethode

**Schritt 1 — Feststellen, dass der Fehler real und reproduzierbar ist.** „Manchmal läuft es nicht an" braucht eine Häufigkeit und eine Korrelation, bevor es eine Fehlermeldung ist. Tritt es einmal pro Schicht und nur in der Nachtschicht auf, ist das bereits ein Beleg.

**Schritt 2 — Befehl und Rückmeldung ablesen.** Nach obiger Tabelle aufteilen.

**Schritt 3 — Ist der Befehl FALSE, die Freigabekette nach oben verfolgen.** Jede Bedingung ist erfüllt oder nicht; die unerfüllte ist die nächste Frage. Hier zahlt sich die Entwurfsentscheidung aus, jede Bedingung einzeln sichtbar zu machen — ohne sie erfordert dieser Schritt eine Automatisierungsfachkraft und das Programm.

**Schritt 4 — Ist der Befehl TRUE und die Rückmeldung FALSE, den physischen Pfad halbieren.** Die Kette lautet: Ausgangsbaugruppe → Feldverdrahtung → Koppelrelais → Schützspule → Schützkontakte → Gerät → Rückmeldekontakt → Eingangsverdrahtung → Eingangsbaugruppe. In der Mitte messen statt von einem Ende her vorzugehen. Jede Messung eliminiert die Hälfte der Restkette.

**Schritt 5 — Die Behebung bestätigen, indem der Fehler reproduziert und dann beseitigt wird.** Ein Symptom, das nach einer Änderung aufhört, beweist nicht, dass die Änderung die Ursache war; viele sporadische Fehler pausieren von selbst. Wo es sicher möglich ist, den Ausgangszustand wiederherzustellen und den Fehler zurückkehren zu sehen, ist der Unterschied zwischen einer Reparatur und einem Zufall.

## Die Disziplin, die das trägt

**Zwischen zwei Beobachtungen nie zwei Dinge ändern.** Das ist die eine Regel, die Diagnose von Raten trennt. Tauscht eine Fachkraft einen Sensor und steckt zugleich einen Stecker neu, und der Fehler hört auf, wurde nichts gelernt — und die unberührte Ursache steckt womöglich noch in dreißig baugleichen Maschinen.

**Messen, nicht folgern.** „Die 24 V müssen in Ordnung sein, die Lampe leuchtet doch" ist eine Folgerung. Die Messung dauert zehn Sekunden und ist entweder ein Beleg oder eine Überraschung.

**Aufschreiben, was gemessen wurde, nicht was gefolgert wurde.** „Klemme 14: 0 V bei Befehl TRUE" übersteht eine Schichtübergabe. „Verdrahtungsproblem" nicht.

## Sporadische Fehler sind ein Messproblem

Ein sporadischer Fehler ist nicht rätselhaft; er ist ein Fehler, dessen auslösende Bedingung noch nicht identifiziert wurde. Produktiv ist, die Korrelation zu suchen, statt zu beobachten und zu warten.

**Gegen alles gleichzeitig Vorhandene korrelieren.** Tageszeit, Produktionsrate, Umgebungstemperatur, welche anderen Betriebsmittel laufen, ob ein Kran vorbeifuhr, ob es regnete, wie viele HMI-Clients verbunden sind. Die Korrelation ist die Diagnose: Ein Fehler oberhalb einer bestimmten Geschwindigkeit ist ein Zeitproblem; einer nur beim Anlauf eines großen Antriebs ist ein Störspannungs- oder Versorgungsproblem; einer nur nachmittags ist thermisch.

**Fortlaufend aufzeichnen statt zuschauen.** Ein Fehler, der einmal pro Schicht auftritt, wird nicht live beobachtet. Eine Datenaufzeichnung auf die Fehlerbedingung triggern und die umgebenden Belege automatisch sichern — das verwandelt Wochen des Wartens in ein Ereignis.

**„Sporadisch" von „systematisch, aber selten ausgelöst" unterscheiden.** Ein Signal kürzer als das E/A-Aktualisierungsintervall wird jedes Mal verpasst, wenn es kurz ist — es *wirkt* nur sporadisch, weil die Bedingung, die einen kurzen Impuls erzeugt, gelegentlich auftritt. Das ist ein systematischer Fehler mit gelegentlichem Auslöser und hat eine völlig andere Abhilfe.

## Ein durchgerechnetes Beispiel

*Das Folgende ist ein illustratives ingenieurtechnisches Szenario.*

**Symptom:** Ein Förderantrieb läuft im Automatikablauf gelegentlich nicht an. Ein manueller Neustart funktioniert immer. Etwa einmal pro Schicht, häufiger in der Nachtschicht.

**Bei drei Ereignissen gesicherte Belege:**

- Befehl TRUE, Laufrückmeldung FALSE, jeweils über das gesamte Anlaufüberwachungsfenster
- Überlastauslösung FALSE
- alle Freigaben zum Befehlszeitpunkt erfüllt
- Diagnosepuffer: bei keinem Ereignis ein Eintrag der Steuerung
- Status der dezentralen Station: kurze Kommunikationsunterbrechung an der Station mit der Laufrückmeldung, zeitgleich mit jedem Ereignis
- Netzwerk-Portstatistik: steigender Discard-Zähler an diesem Port, in Stufen, die jedem Ereignis vorausgehen
- die Nachtschicht betreibt einen zweiten Kran im selben Gang

**Schlussfolgerung:** Der Befehl wurde erteilt, also sind Ablauf und Freigaben entlastet. Die Rückmeldung kam nie. Der Antrieb selbst hat jedoch nie gestört, und der manuelle Neustart funktioniert — unvereinbar mit einem defekten Schütz oder einer defekten Spule. Die zeitgleiche Stationsunterbrechung erklärt es: Die Rückmeldung ging nicht am Gerät verloren, sondern auf dem Transportweg. Der steigende Discard-Zähler lokalisiert das auf einen Port, und die Kran-Korrelation deutet auf eine physikalische Ursache — eine biegebeanspruchte Leitung oder einen durch Bewegung gestörten Stecker.

**Was Bauteiltausch bewirkt hätte:** den Antrieb tauschen (keine Änderung), dann das Schütz (keine Änderung), dann womöglich die SPS-Baugruppe — drei Teile, drei Schichten, und ein weiterhin vorhandener Fehler, weil die eigentliche Ursache eine Leitung ist.

Die entscheidenden Belege — Stationsstatus und Portstatistik — kosten nichts im Auslesen und sind unsichtbar für jeden, der nicht weiß, dass er hinsehen muss.

## Häufige Diagnosefehler

- **Aus dem HMI-Wert diagnostizieren statt aus der Quelle.** Das HMI zeigt, was das Programm berechnet hat — möglicherweise mehrere Umsetzungen vom Feld entfernt.
- **Einem stabilen Messwert vertrauen.** Ein eingefrorener Eingang ist stabil. Eine verstopfte Wirkdruckleitung ebenfalls. Stabilität ist keine Gültigkeit, und ein *zu* ruhiger Wert ist selbst ein Beleg.
- **Zum Prüfen steuern.** Steuern beweist die Logik hinter dem Eingriff; über die Kette davor beweist es nichts — und ein vergessener Steuerungseingriff ist der nächste eigene Fehler.
- **Ohne Belege eskalieren.** Einen Fehler mit „geht nicht" ans Engineering zu geben startet die Diagnose bei null. Erst die gesicherten Belege machen die Eskalation nützlich.
- **Die erste plausible Erklärung annehmen.** Plausibel ist nicht nachgewiesen. Die Prüfung lautet, ob die Erklärung *alle* Belege abdeckt — auch die unbequemen.

## Eine Anlage diagnosefähig machen

Vieles, was Fehlersuche schnell macht, wird zur Entwurfszeit entschieden, und die wertvollsten Punkte sind billig:

- **Stations- und Kanalstatus in der Logik auswerten, die diese Eingänge nutzt.** Diese eine Praxis verwandelt eine ganze Klasse stiller Ausfälle in gemeldete.
- **Jedem Anlagenobjekt ein Statuswort geben**, das „nicht angefordert", „Freigabe fehlt", „gestört" und „im Übergang" unterscheidet.
- **Der Bedienoberfläche ein Ursachenfeld geben**, das die eine derzeit haltende Bedingung benennt, damit die erste Frage jedes Einsatzes schon beantwortet ist.
- **Den Diagnosepuffer** der Instandhaltung zugänglich machen, nicht nur dem Engineering.
- **Erstwerte erfassen** bei jedem Betriebsmittel mit mehreren Auslösequellen.
- **Inbetriebnahme-Basislinien dokumentieren** — Zykluszeit Min/Max, Schleifenwiderstand, Netzwerkfehlerzähler bei null. Fast jede schwierige Untersuchung beginnt mit „hat sich das verändert?", und nur eine Basislinie kann das beantworten.

## Sicherheitstechnische Hinweise

Die Diagnose trägt eine Gefährdung, die die Reparatur nicht hat: Sie erfolgt an einer Anlage, die sich noch bewegen kann. Ein gesetzter Force, eine freigegebene Verriegelung oder ein zur Beobachtung eingeschalteter Stromkreis kann Betriebsmittel anlaufen lassen, neben denen jemand steht; die Dringlichkeit einer Diagnose ändert daran nichts, und der Druck eines Produktionsstillstands ist genau die Lage, in der das Verfahren am wichtigsten ist.

Zwei konkrete Warnungen. **Steuern oder Überbrücken an einer laufenden Anlage verändert, was das Leitsystem tun wird**, und wer das tut, muss wissen, was der erzwungene Zustand für jedes Betriebsmittel bedeutet, das ihn verarbeitet — nicht nur für das untersuchte. **Nichts, was als Schutzebene angerechnet ist, wird zur Diagnosebequemlichkeit überbrückt**; diese Überbrückung unterliegt dem Änderungsmanagement der Anlage, nicht der Dringlichkeit des Fehlers.

## Empfohlene Vorgehensweise

- Befehl und Rückmeldung ablesen, bevor eine Hypothese entsteht.
- Den vollständigen Belegsatz mit Zeitstempeln sichern, bevor etwas verändert wird.
- Den physischen Pfad durch Halbieren aufteilen, nicht von einem Ende her.
- Zwischen zwei Beobachtungen nie zwei Dinge ändern.
- Messwerte dokumentieren, keine Schlussfolgerungen.
- Für sporadische Fehler die Korrelation suchen, nicht auf eine Wiederholung warten.
- Automatische Datenaufzeichnung auf die Fehlerbedingung triggern.
- Eine Behebung dort, wo es sicher ist, durch Entfernen und Wiederherstellen der Ursache bestätigen.
- Stationsstatus, Statuswörter und Erstwerterfassung in die Anwendung entwerfen, damit die Anlage sich selbst erklären kann.

## Fazit

Belegbasierte Diagnose ist keine sorgfältigere Variante des Bauteiltauschs; sie ist eine andere Tätigkeit. Der Tausch fragt „was kann ich ersetzen?". Die Diagnose fragt „was schließen die Belege aus?" — und die zweite Frage konvergiert, während die erste unbegrenzt weiterlaufen kann.

Die Methode ist unspektakulär: an der Befehl-Rückmeldung-Grenze aufteilen, Belege sichern, bevor etwas gestört wird, jeweils nur eine Sache ändern und einen sporadischen Fehler als Korrelation behandeln, die darauf wartet, gefunden zu werden. Was sie möglich macht, wird jedoch weitgehend lange vor dem Fehler entschieden — darin, ob die Anlage so gebaut wurde, dass sie ihren eigenen Zustand meldet, oder so, dass sie schweigt.
