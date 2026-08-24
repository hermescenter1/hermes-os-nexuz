# KOP versus SCL: Sprachwahl je Funktion

## Zusammenfassung

Die Debatte KOP gegen Text wird meist als Frage des Geschmacks, der Generation oder der Herstellerbindung geführt. Sie ist nichts davon. Die IEC 61131-3 definiert mehrere Sprachen genau deshalb, weil verschiedene Klassen von Steuerungslogik verschiedene Anforderungen haben. Die nützliche Ingenieurfrage lautet nicht „welche Sprache ist besser", sondern „welche Sprache macht *diese* Funktion korrekt und für diejenigen diagnostizierbar, die sie diagnostizieren müssen".

Dieser zweite Halbsatz entscheidet mehr reale Fälle als jedes Argument über Ausdrucksmächtigkeit.

## Warum das relevant ist

Zwei Fehlermuster entstehen aus einer falschen Wahl, und sie sind Spiegelbilder.

**Algorithmische Logik in KOP gepresst.** Eine Berechnung mit bedingten Verzweigungen, Iteration und Zwischenergebnissen, ausgedrückt als vierzig Netzwerke aus Kontakten und Transferanweisungen. Es funktioniert. Es ist unlesbar, nicht prüfbar, und jede Änderung riskiert einen Fehler, den kein Prüfer findet, weil niemand vierzig Netzwerke Arithmetik im Kopf behalten kann.

**Maschinenverriegelung vollständig in Text.** Die Anlaufbedingungen eines Förderers als mehrzeiliger boolescher Ausdruck. Kompakt und korrekt. Um drei Uhr morgens muss eine Instandhaltungsfachkraft wissen, *welche* Bedingung den Anlauf blockiert — und ein online beobachteter Textausdruck zeigt ihr ein einzelnes FALSE.

Beide Mängel sind bei der Inbetriebnahme unsichtbar, solange der Autor anwesend ist und sich an alles erinnert. Beide treten später auf, zum schlechtesten Zeitpunkt, vor der Person mit den wenigsten Mitteln, damit umzugehen.

## Das Argument, das die meisten Fälle tatsächlich entscheidet

Online-Diagnosefähigkeit ist weit häufiger die entscheidende Eigenschaft als Ausdrucksmächtigkeit.

Der echte technische Vorteil von KOP ist nicht, dass es „wie ein Stromlaufplan aussieht". Er besteht darin, dass **die Online-Ansicht den Zustand jedes Elements gleichzeitig und räumlich angeordnet zeigt**. Wer auf ein Netzwerk sieht, erkennt, welcher Kontakt offen ist. Das ist die Antwort auf „warum lief es nicht an" — ohne Lesen, ohne Debugger und ohne Programmverständnis.

Text hat dafür keine Entsprechung. Die Online-Beobachtung eines booleschen Ausdrucks zeigt typischerweise das Ergebnis, nicht den Term, der es erzeugt hat. Um die blockierende Bedingung zu finden, muss die Instandhaltung den Ausdruck lesen und gedanklich auswerten — oder der Programmierer muss den Bedarf vorhergesehen und die Zwischenterme in benannte Variablen geschrieben haben.

Genau darin liegt die praktische Auflösung, und sie verdient eine eigene Regel: **Wird Verriegelungslogik in Text geschrieben, müssen die einzelnen Bedingungen benannten, beobachtbaren Variablen zugewiesen werden — sie dürfen keine Terme innerhalb eines Ausdrucks bleiben.** Das stellt den größten Teil des Diagnosevorteils von KOP zu geringen Kosten an Ausführlichkeit wieder her.

## Wo welche Sprache gewinnt

| Logikklasse | Bessere Sprache | Begründung |
| --- | --- | --- |
| Verriegelungen, Freigaben, Auslösebedingungen | KOP | Online-Zustand je Bedingung sichtbar |
| Motor-/Ventilsteuerung mit Rückmeldung | KOP | Instandhaltungspublikum, einfache Boolesche Logik |
| Arithmetik, Skalierung, technische Einheiten | SCL | Ausdrücke sind als Netzwerke unlesbar |
| Schleifen und Iteration über Felder | SCL | KOP kennt keine natürliche Iteration |
| Rezeptur- und Parameterverwaltung | SCL | Umgang mit strukturierten Daten |
| Zustandsautomaten | SCL (`CASE`) | Ein Konstrukt zeigt den gesamten Automaten |
| Kommunikation und Protokollverarbeitung | SCL | Byte- und Zeichenkettenverarbeitung |
| Validierung analoger Signale | SCL | Vergleichsketten und Hysterese |
| Zeitliche Ablauffolge physischer Schritte | Beides — nach Publikum entscheiden | Beides trägt; die Instandhaltungskompetenz entscheidet |

Die letzte Zeile verlangt Urteilsvermögen statt einer Regel. Deshalb ist der nächste Abschnitt wichtig.

## Das Publikum ist eine Entwurfseingangsgröße

Eine Entwurfsentscheidung, die ignoriert, wer das Ergebnis instand hält, ist unvollständig. Zwei Anlagen mit identischem Prozess können zu Recht gegenteilige Schlüsse ziehen:

- Eine Anlage, deren Instandhaltung aus Elektrofachkräften ohne Softwarehintergrund besteht, die aus der KOP-Online-Ansicht diagnostizieren, sollte ihre Logik auf Betriebsmittelebene in KOP haben. Sie in Text zu schreiben ist technisch vertretbar und betrieblich falsch: Es verlagert jede Fehlerdiagnose von der Fachkraft zu einer Automatisierungsfachkraft, die möglicherweise nicht vor Ort ist.
- Eine Anlage mit einer Automatisierungsgruppe, die die Software besitzt, Versionsverwaltung nutzt und Änderungen prüft, kann Text breiter einsetzen und wird dafür bessere Struktur bekommen.

Das ist kein Qualitätskompromiss. Es ist die Anerkennung, dass zur Qualität eines Programms gehört, ob die Verantwortlichen damit arbeiten können.

## Wo Text nicht optional ist

Manche Logik lässt sich in KOP schlicht nicht gut schreiben, und sie dorthin zu zwingen erzeugt einen Mangel statt einer Stilbeschwerde:

**Iteration.** Vierzig Analogwerte zu verarbeiten verlangt entweder eine Schleife oder vierzig Kopien. KOP liefert die vierzig Kopien — und eine davon wird irgendwann falsch sein.

**Nichttriviale Arithmetik.** Eine mehrgliedrige Berechnung mit Zwischenergebnissen wird zu einer Kette von Transfer- und Rechenanweisungen, in der die eigentliche Formel nicht mehr sichtbar ist. Das lässt sich gegen keine Spezifikation prüfen.

**Strukturierte Daten.** Eine Rezepturstruktur, einen Kommunikationspuffer oder eine Zeichenkette zu bearbeiten ist in Text ausdrückbar und in KOP mühsam.

**Zustandsautomaten.** Eine `CASE`-Anweisung über einen aufgezählten Zustand zeigt den gesamten Automaten an einer Stelle — jeden Zustand, jeden Übergang. Das KOP-Äquivalent verteilt ihn über viele Netzwerke, und Vollständigkeit lässt sich durch Sichtprüfung nicht mehr feststellen.

## Gemischtsprachige Projekte: die maßgeblichen Konventionen

Die meisten ernsthaften Projekte nutzen beides. Drei Konventionen verhindern, dass das schlechter wird als jede Sprache für sich.

**Je Funktion wählen, nicht je Bearbeiter.** Die Regel muss dokumentiert und einheitlich angewendet werden, sonst wird die Sprache zur Signatur dessen, der den Baustein zufällig geschrieben hat, und das Projekt bekommt zwei Dialekte für dieselbe Art von Logik.

**Die Sprachgrenze an der Bausteinschnittstelle halten.** Ein Baustein wird in einer Sprache geschrieben. Feinere Mischung macht den Code schwerer nachvollziehbar als jede Sprache allein und erschwert die Online-Beobachtung.

**Zwischenbedingungen in Text benennen.** Wie oben: Das macht textbasierte Verriegelung diagnostizierbar und ist die Konvention, die die betrieblichen Kosten des Texteinsatzes am stärksten senkt.

Ehrlicherweise gehört auch eine Portabilitätsüberlegung dazu: Die IEC 61131-3 definiert zwar die Sprachen, doch die praktische Übertragbarkeit von SCL zwischen Herstellerplattformen ist durch Dialektunterschiede und herstellerspezifische Erweiterungen begrenzt. Ein Baustein, der zwischen Plattformen wandern soll, wird unabhängig von der Sprache konservativ geschrieben.

## Fehlerbilder

**Unlesbare Arithmetik in KOP.** Die Formel ist aus dem Code nicht mehr rekonstruierbar, also kann niemand bestätigen, dass sie dem Entwurf entspricht. Fehler bleiben bestehen, weil die Prüfung sie nicht entdecken kann.

**Nicht diagnostizierbare Verriegelungen in Text.** Die Instandhaltung kann die blockierende Bedingung nicht ermitteln, also eskaliert die Fehlersuche jedes Mal ins Engineering — eine dauerhafte betriebliche Belastung aus einer einmaligen Entscheidung.

**Iteration per Kopie.** Vierzig nahezu identische Netzwerke, wo eine Schleife hingehört hätte. Der Fehler ist, dass das vierzigste sich auf eine Weise unterscheidet, die niemand bemerkt.

**Sprache nach Gewohnheit des Autors.** Ähnliche Logik existiert im Projekt in beiden Sprachen, also muss eine Instandhalterin beide beherrschen, um überhaupt etwas bearbeiten zu können.

**Text zur Zurschaustellung von Cleverness.** Kompakte Ausdrücke, die beim Schreiben elegant und ein Jahr später undurchsichtig sind. Dichte ist keine Tugend in Software, die eine fremde Person unter Druck debuggen muss.

## Ein durchgerechneter Vergleich

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Man betrachte einen Pumpenanlauf mit fünf Bedingungen: Vor-Ort-Wahlschalter auf AUTOMATIK, keine Überlastauslösung, Saugventil offen, Druckseite unterhalb der oberen Grenze, keine externe Stoppanforderung.

**In KOP** ist das ein Netzwerk mit fünf Reihenkontakten. Online sieht die Fachkraft sofort, welcher Kontakt offen ist. Die Diagnose dauert Sekunden und erfordert kein Softwarewissen.

**In Text als einzelner Ausdruck** ist das eine Zeile. Online sieht die Instandhaltung `Start_Freigabe = FALSE` und erfährt nichts über den Grund.

**In Text mit benannten Zwischenvariablen** wird jede Bedingung einer benannten Variablen zugewiesen und das Ergebnis verknüpft sie. Online sieht die Instandhaltung fünf beobachtbare boolesche Werte und kann die blockierende Bedingung bestimmen — der Diagnosevorteil von KOP ist zurückgewonnen.

Die dritte Form ist ausführlicher als die zweite. Diese Ausführlichkeit ist kein Ballast; sie ist die Diagnoseschnittstelle — und genau das, was die zweite Form weggelassen hat.

## Hinweise zur Inbetriebnahme

- **Verriegelungslogik wird bei der Inbetriebnahme am stärksten beansprucht**, weil Bedingungen häufig nicht erfüllt sind. Welche Sprache auch gewählt wird: Die blockierende Bedingung muss aus der Online-Ansicht erkennbar sein — das früh prüfen, nicht erst in einer Nachtschicht feststellen.
- **Steuern und Simulieren verhalten sich je Sprache und Plattform unterschiedlich.** Vor dem Verlassen auf diese Funktionen ihr Verhalten bestätigen und sicherstellen, dass gesteuerte oder simulierte Werte sichtbar sind, damit keiner in den Produktivbetrieb übergeht.
- **Algorithmischen Text gegen die Spezifikation prüfen, nicht gegen seine eigenen Kommentare.** Ein Kommentar beschreibt die Absicht; nur der Ausdruck beschreibt das Verhalten.

## Sicherheitstechnische Hinweise

Sicherheitsgerichtete Logik wird nach den für die Anlage geltenden Normen zur funktionalen Sicherheit im Sicherheitssystem projektiert, und die verfügbare Sprache ist typischerweise durch die zertifizierte Werkzeugkette eingeschränkt statt frei wählbar. Wo die Werkzeugkette den Sprachumfang begrenzt — und das tut sie meist —, sind diese Einschränkungen Teil des Sicherheitsnachweises und keine Geschmacksfrage.

Das übertragbare Grundprinzip: Für sicherheitsgerichtete Logik ist Prüfbarkeit durch Sichtprüfung mehr wert als Ausdrucksmächtigkeit. Das spricht für das einfachste Konstrukt, das die Funktion abbilden kann — in der Sprache, die die zertifizierte Umgebung bereitstellt.

## Empfohlene Vorgehensweise

- Die Sprache je Funktion nach einer dokumentierten Regel wählen, nicht je Bearbeiter.
- KOP für Verriegelungen, Freigaben und boolesche Logik auf Betriebsmittelebene verwenden, wo die Instandhaltung aus der Online-Ansicht diagnostiziert.
- Text für Arithmetik, Iteration, strukturierte Daten, Kommunikationsverarbeitung und Zustandsautomaten verwenden.
- Werden Verriegelungen in Text geschrieben, jede Bedingung einer benannten, beobachtbaren Variablen zuweisen.
- Die Sprachgrenze an der Bausteinschnittstelle halten.
- Das Instandhaltungspublikum als Entwurfseingangsgröße behandeln und die Annahme dokumentieren.
- In jedem Baustein, der zwischen Plattformen wandern soll, konservativ schreiben.

## Fazit

Die Sprachen der IEC 61131-3 sind keine Konkurrenten, sondern Werkzeuge mit unterschiedlichen Eigenschaften — und die Norm definiert mehrere, weil die industrielle Steuerungstechnik tatsächlich mehrere braucht.

Das ingenieurtechnische Urteil ist enger, als die übliche Debatte nahelegt. KOP ist die bessere Wahl, wo eine Fachkraft den Live-Signalzustand sehen und danach handeln muss. Text ist die bessere Wahl, wo die Logik ein Algorithmus statt einer Bedingungsmenge ist. Und wo Text dennoch für Bedingungen verwendet wird, stellt die Benennung der Zwischenwerte die Diagnosefähigkeit wieder her, die KOP kostenlos geliefert hätte — ein geringer Preis dafür, die Fehlersuche in den Händen derjenigen zu belassen, die neben der Anlage stehen.
