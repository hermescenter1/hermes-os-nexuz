# PROFIBUS-Diagnose und Fehleranalyse

## Zusammenfassung

Ein PROFIBUS-Segment fällt fast nie plötzlich aus. Es degradiert — leise, über Monate — während der Wiederholungsmechanismus des Protokolls diese Degradation vor allen Beteiligten verbirgt. Wenn schließlich eine Station ausfällt und jemand gerufen wird, ist das Segment längst nicht mehr gesund, und das Ereignis, das den Zustand endlich sichtbar gemacht hat, hat mit der zugrunde liegenden Störung oft nichts zu tun.

Genau diese Lücke zwischen *dem Beginn eines Fehlers* und *seiner Sichtbarkeit* ist der Grund, weshalb PROFIBUS-Fehlersuche so häufig in Gerätetausch mündet. Dieser Beitrag handelt davon, sie zu schließen: welche Belege es gibt, was jeder einzelne unterscheidet und wie sich ein Fehler der physikalischen Ebene systematisch eingrenzen lässt, statt Teile zu tauschen, bis das Symptom weiterwandert.

## Warum Wiederholungen die eigentliche Zustandsgröße sind

PROFIBUS ist ein Master-Slave-Bus auf einem gemeinsamen differenziellen Adernpaar. Wird ein Telegramm gestört, wiederholt der Master es. Die Wiederholung gelingt meist, die Prozessdaten kommen an, und nichts in der Anlage weist darauf hin, dass etwas geschehen ist.

**Das ist die wichtigste Tatsache der PROFIBUS-Diagnose: Ein Segment kann jahrelang mit einer erheblichen Wiederholungsrate laufen und vollkommen gesund wirken.** Wiederholungen verbrauchen Busbandbreite und verdecken ein physikalisches Problem, das sich in den meisten Fällen langsam verschlimmert. Eine Station „fällt aus“ erst, wenn die Wiederholungen nicht mehr gelingen — ein Schwelleneffekt, nicht der Beginn des Problems.

Die praktischen Folgen:

- **Die Wiederholungsrate ist der Frühindikator; die Zahl der Ausfälle ist ein Spätindikator.** Eine Instandhaltung, die auf Ausfälle reagiert, reagiert auf das Ende eines langen Prozesses.
- **Ein Segment ohne Wiederholungen und eines mit gelegentlichen Wiederholungen sind qualitativ verschieden**, auch wenn beide „funktionieren“. Das zweite hat einen Defekt.
- **Die Wiederholungsrate ist messbar** — über Busdiagnosewerkzeuge und über die Diagnosefunktionen mancher Infrastrukturkomponenten. Misst sie nichts am Segment, hat das Segment überhaupt keine Zustandsgröße.

**Die daraus folgende Empfehlung kostet fast nichts: die Wiederholungsrate je Station erfassen, solange die Anlage als gesund gilt, und jeden Anstieg als Befund der physikalischen Ebene behandeln.** Es ist dasselbe Prinzip wie die Baseline von Portzählern in einem Ethernet-Netz — und hier noch wertvoller, weil das Protokoll das Symptom aktiv verbirgt.

## Der Fehler sitzt auf der physikalischen Ebene

PROFIBUS DP läuft über ein differenzielles Adernpaar mit definierter Linientopologie, und die überwiegende Mehrheit der Fehler ist physikalischer Natur. Eine kurze Liste, geordnet danach, wie oft sich der jeweilige Punkt als Ursache erweist:

**Abschluss.** Jedes Segment braucht einen aktiven Abschluss an beiden Enden — und nur dort. Zwei Varianten dominieren:

- **Ein Abschluss ohne Spannung.** Der aktive Abschluss im Standard-Busstecker wird aus der Station gespeist, an der er steckt. Wird die Endstation abgeschaltet — für Wartung, für einen Umbau oder weil sie defekt ist — verliert das Segment seinen Abschluss, während der Rest des Busses weiterläuft. Das Symptom ist eine segmentweite Degradation, die immer dann auftritt, wenn ein bestimmter Schrank spannungsfrei ist: genau die Art Korrelation, die niemandem auffällt.
- **Abschluss irgendwo in der Mitte eingeschaltet.** Ein Stecker in der Mitte der Linie mit aktiviertem Abschluss belastet den Bus und erzeugt Reflexionen. Ohne Öffnen der Stecker ist das unsichtbar, und es entsteht häufig bei einem Umbau, wenn eine Station versetzt wird und der Stecker mitgeht.

**Steckverbinderfehler.** Der häufigste einzelne Ort eines PROFIBUS-Problems liegt im Stecker, und die wiederkehrenden Varianten sind banal: Adern in den falschen Klemmen, vertauschte ein- und ausgehende Paare, eine nie festgezogene Schraube, ein Schirm, der über der Isolation statt über dem Geflecht geklemmt wurde, oder ein Kabel unter Zug, das eine Ader langsam gelöst hat.

**Schirm und Potentialausgleich.** Der Schirm muss an jeder Station korrekt aufgelegt werden, großflächig geklemmt statt über einen Beidraht. Stehen Schränke auf unterschiedlichem Erdpotential, fließt Schirmstrom und koppelt Störungen auf das Adernpaar. Ein ausreichend dimensionierter Potentialausgleichsleiter entlang der Kabeltrasse beseitigt den Mechanismus; ohne ihn behebt keine noch so sorgfältige Steckerarbeit das Symptom.

**Stichleitungen.** Abzweige von der Hauptlinie erzeugen Reflexionen. Bei niedrigen Übertragungsraten tolerierbar, mit steigender Rate zunehmend schädlich. Stiche, die bei einem Umbau entstanden, um ein Gerät bequem zu erreichen, sind die klassische Ursache eines Segments, das „gut war, bis wir diese Ventilinsel angebaut haben“.

**Kabeltyp und Verlegung.** Das spezifizierte Buskabel existiert, weil seine Impedanz und sein Aufbau Teil des Übertragungsentwurfs sind. Ein Allzweckkabel einzusetzen, „weil es im Lager lag“, erzeugt ein Segment, das bei der Inbetriebnahme funktioniert und ausfällt, sobald sich die Bedingungen ändern. Eine Verlegung neben Motor- und Antriebsleitungen bringt Störungen ein, die mit dem Anlagenbetrieb korrelieren und nicht mit irgendetwas auf dem Bus.

## Übertragungsrate, Länge und Topologie

Drei zusammenhängende Randbedingungen entscheiden, ob ein Segment innerhalb seiner Auslegung liegt.

**Übertragungsrate und Segmentlänge stehen im Zielkonflikt.** Der Standard tabelliert für jede Übertragungsrate eine maximale Segmentlänge beim spezifizierten Kabeltyp, und die zulässige Länge fällt mit steigender Rate deutlich. Der ingenieurtechnische Punkt sind nicht die konkreten Zahlen — die gehören aus dem Standard für das eingesetzte Kabel gelesen — sondern das Verhalten: **ein Segment, das bei niedriger Rate bequem innerhalb der Grenzen lag, kann weit außerhalb liegen, nachdem jemand die Übertragungsrate zur Verkürzung der Zykluszeit angehoben hat.** Diese Änderung geschieht in Software, in Minuten, und ihre physikalische Folge bleibt unsichtbar, bis sie es nicht mehr ist.

**Die Zahl der Stationen je Segment ist durch die Eigenschaften der RS-485-Treiber begrenzt** — deshalb sind 32 Teilnehmer je Segment, Repeater eingeschlossen, eine harte strukturelle Randbedingung und keine Empfehlung. Der Adressraum ist größer als die Segmentkapazität, was Personen, die einen Bus erweitern, regelmäßig überrascht.

**Repeater erweitern das Netz und bringen eigene Eigenschaften mit.** Jeder Repeater erzeugt ein neues Segment mit eigenem Abschlussbedarf an beiden Enden, fügt Laufzeit hinzu, die in den Busparametern zu berücksichtigen ist, und wird zu einer Komponente, deren Ausfall alles dahinter entfernt.

**Diagnoserepeater lohnen ihren Preis auf langen oder auffälligen Segmenten**, weil sie einen physikalischen Fehler entlang des Kabels lokalisieren können, statt nur zu melden, dass einer existiert. Ein Werkzeug, das sagt „etwa in dieser Entfernung auf diesem Segment liegt ein Fehler“, verwandelt einen Tag Anlagenrundgang in eine gezielte Prüfung.

## Das Signal lesen

Eine detaillierte Signalanalyse ist Spezialistenarbeit, aber die begrifflichen Zusammenhänge lohnen sich, weil sie eine Oszilloskop- oder Analysatoraufzeichnung von Dekoration in einen Beleg verwandeln.

| Was das Signal zeigt | Typische physikalische Ursache |
| --- | --- |
| Überschwingen und Nachschwingen nach jedem Flankenwechsel | Fehlender oder unwirksamer Abschluss; Reflexionen |
| Verringerte Differenzamplitude | Überlast, zusätzliche Abschlüsse, Teilbruch oder zu große Länge für die Rate |
| Unsymmetrie zwischen den beiden Leitungen | Verschlechterte Verbindung einer Ader — eine Klemme, eine Schirmklemme, ein Stecker |
| Störbursts, die mit Anlagenereignissen korrelieren | Einkopplung aus benachbarten Energieleitungen oder Antriebsschaltungen |
| Verzerrung, die entlang des Segments zunimmt | Kumulative Belastung oder ein Fehler zum fernen Ende hin |

**Die Deutungsdisziplin zählt mehr als das Messgerät.** Eine Aufzeichnung mit Nachschwingen sagt, dass der Abschluss irgendwo falsch ist; sie sagt nicht, wo. In Kombination mit der Frage, *welche Stationen Wiederholungen melden*, verengt sich der Ort, denn die Wirkung einer Reflexion ist entlang der Linie nicht gleichmäßig.

**Messungen am spannungsfreien Bus sind ergänzend und billiger.** Der Widerstand über dem Adernpaar bei abgeschaltetem Segment gibt einen schnellen Hinweis darauf, ob die erwartete Zahl von Abschlüssen vorhanden ist. Er ersetzt keine Messung im Betrieb, findet aber die beiden häufigsten Abschlussfehler in Minuten und ohne Analysator.

## Eine systematische Fehlereingrenzung

Das zu vermeidende Muster ist bekannt: Eine Station fällt aus, das Gerät wird getauscht, das Symptom verschwindet für eine Woche, eine andere Station fällt aus — und nach vier Tauschaktionen ist das Segment weiterhin gestört und das Ersatzteilbudget aufgebraucht.

Ein Vorgehen, das dies vermeidet:

1. **Belege sammeln, bevor irgendetwas angefasst wird.** Welche Stationen melden Wiederholungen, mit welcher Rate, und welche sind ausgefallen — und ob die Ereignisse mit einer Anlagenbedingung korrelieren, etwa einem anlaufenden Antrieb, einem fahrenden Kran, einem geöffneten Schrank, einem Schichtmuster oder einer Temperatur.
2. **Feststellen, ob das Problem eine Station oder ein Segment betrifft.** Das ist die entscheidende Verzweigung; sie wird unten ausgeführt.
3. **Die Auslegung auf dem Papier prüfen, bevor gemessen wird.** Stationszahl je Segment, tatsächliche Kabellänge gegen die zulässige Länge für die projektierte Rate, Kabeltyp, Zahl und Lage der Repeater. Über Jahre erweiterte Segmente scheitern an dieser Prüfung häufig, und keine Messung repariert ein Segment, das für seine Übertragungsrate schlicht zu lang ist.
4. **Den Abschluss ausdrücklich prüfen.** Beide Enden abgeschlossen und mit Spannung versorgt; in der Mitte nichts abgeschlossen. Eine Fünf-Minuten-Prüfung, die einen erheblichen Teil der Fälle löst.
5. **Das Segment halbieren.** Wo der Fehler noch nicht lokalisiert ist, das Segment teilen und jede Hälfte prüfen. Die binäre Suche konvergiert schnell und braucht keine Spezialausrüstung — ihr Preis ist Produktionszeit, weshalb sie nach den billigeren Prüfungen kommt und nicht zuerst.
6. **Mit der Anlage korrelieren, nicht nur mit dem Bus.** Ein Fehler, der nur beim Anlauf eines bestimmten Motors auftritt, ist ein Einkopplungsproblem, und seine Lösung liegt in der Kabelverlegung oder im Potentialausgleich — nirgendwo auf dem Bus.
7. **Immer nur eine Sache ändern und neu messen.** Zwei gleichzeitige Änderungen machen das Ergebnis unauswertbar, und eine unausgewertete Abhilfe kehrt zurück.

Schritt 2 entscheidet über alles Weitere und sei daher vollständig ausgeführt:

- **Mehrere Stationen degradieren gemeinsam** — das deutet auf eine gemeinsame Ursache: Abschluss, ein Schirm- oder Potentialausgleichsproblem, eine gemeinsame Verlegungsexposition oder ein Segment außerhalb der Länge-Raten-Auslegung.
- **Eine Station degradiert isoliert** — das deutet auf etwas Lokales: ihren Stecker, ihre Stichleitung, ihre eigene Hardware oder ihre Lage am Linienende, wo der Abschluss zählt.

**Die Regel, die all dem zugrunde liegt: ein Gerät nur dann tauschen, wenn die Belege auf dieses Gerät zeigen.** Eine ausfallende Station ist häufiger das Opfer ihrer Position auf einem degradierten Segment als die Ursache der Degradation.

## Fehlermodi

**Endstation spannungsfrei.** Abschluss verloren; das ganze Segment degradiert, sobald dieser Schrank aus ist.

**Abschluss mitten im Segment aktiviert.** Reflexionen und Belastung; ohne Steckeröffnung unsichtbar.

**Übertragungsrate ohne Längenprüfung erhöht.** Das Segment verlässt seine Auslegung; Ausfälle beginnen Wochen später.

**Segment über die Teilnehmergrenze hinaus erweitert.** Die Signalpegel verschlechtern sich für alle.

**Stichleitung aus Bequemlichkeit ergänzt.** Reflexionen proportional zur Übertragungsrate.

**Schirm über Beidraht statt geklemmt.** Die wirksame Schirmung geht genau am Eintrittspunkt verloren.

**Kein Potentialausgleich zwischen Schränken.** Schirmstrom koppelt Störungen ein; Steckerarbeit löst das nie.

**Allzweckkabel eingesetzt.** Impedanzfehlanpassung; funktioniert bei der Inbetriebnahme, versagt später.

**Buskabel im selben Kanal wie Motorleitungen.** Die Störung korreliert mit dem Anlagenbetrieb, nicht mit dem Bus.

**Wiederholungen nie gemessen.** Das Segment hat keine Zustandsgröße, und das erste Symptom ist ein Ausfall.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Eine Fertigungslinie meldet sporadische Ausfälle einer einzelnen dezentralen IO-Station, etwa wöchentlich, stets kurz. Über drei Monate wurden sowohl die Station als auch ihr Stecker getauscht. Die Ausfälle bleiben.

Die Belegaufnahme verändert die Fragestellung. Ein Busanalysator zeigt, dass die betroffene Station nicht die einzige mit Wiederholungen ist — vier Stationen weisen erhöhte Wiederholungsraten auf, und es sind die vier am weitesten entfernten des Segments. Die ausfallende Station ist schlicht die letzte und überschreitet daher als erste die Schwelle. Sie war nie die defekte Komponente; sie war die exponierteste.

Die Auslegungsprüfung findet die zugrunde liegende Bedingung: Das Segment wurde vor zwei Jahren für eine neue Maschine erweitert, und die Übertragungsrate wurde im Jahr darauf zur Verkürzung der Zykluszeit angehoben. Jede Änderung war für sich vernünftig. Zusammen brachten sie das Segment über die zulässige Länge für seine Übertragungsrate hinaus, und die Stationen am fernen Ende arbeiten mit der geringsten Signalreserve.

Die Korrektur ist architektonisch statt komponentenbezogen: einen Repeater einfügen, um das Segment zu teilen und den fernen Stationen ihre Reserve zurückzugeben, und die beiden neuen Segmentenden korrekt abschließen. Die Wiederholungsraten fallen an allen vier Stationen auf ihren Ausgangswert.

Die Lehre ist die, die sich durch die gesamte PROFIBUS-Arbeit zieht: **die ausfallende Station ist meist die mit der geringsten Reserve, nicht die mit dem Defekt.** Sie zu tauschen behandelt den Ort des Symptoms und nicht seine Ursache — und die nächstknappe Station folgt zu gegebener Zeit.

## Inbetriebnahme und Vorbeugung

Der größte Teil der oben beschriebenen Diagnoseschwierigkeit entsteht bei Installation und Umbau und ist weitgehend vermeidbar.

- **Das Segment im Ist-Zustand dokumentieren**: Stationsreihenfolge entlang des physischen Kabels, Längen, Repeaterpositionen, Übertragungsrate, Kabeltyp. Eine logische Adressliste ist keine Topologie, und die Diagnose braucht die Topologie.
- **Den Abschluss bei der Übergabe prüfen**, physisch, mit spannungsversorgten Endstationen.
- **Baseline-Wiederholungsraten je Station messen und dokumentieren.** Das ist die Referenz, die jede spätere Untersuchung braucht.
- **Jede Änderung der Übertragungsrate als Eingriff in die physikalische Ebene behandeln**, der die Prüfung von Länge und Teilnehmerzahl erneut erfordert.
- **Jede Segmenterweiterung als neuen Entwurf behandeln**, nicht als Hinzufügen eines Geräts.
- **Den spezifizierten Kabeltyp bevorraten**, denn die Ersatzlösung entsteht um zwei Uhr nachts, wenn das richtige Kabel fehlt.
- **Stecker mit ihrem Abschlusszustand beschriften**, damit der Abschlussfehler in Segmentmitte sichtbar wird, ohne etwas zu öffnen.

## Empfohlene Praxis

- Wiederholungsraten messen und als Zustandsgröße des Segments behandeln; Baseline bei gesunder Anlage aufnehmen.
- Das Segment vor der Station diagnostizieren; mehrere gemeinsam degradierende Stationen bedeuten eine gemeinsame Ursache.
- Die Auslegung — Länge gegen Übertragungsrate, Teilnehmerzahl, Kabeltyp — vor jeder Messung prüfen.
- Den Abschluss an beiden Enden unter Spannung und nirgendwo sonst verifizieren.
- Stichleitungen beseitigen; jeden Abzweig als zu behebenden Mangel betrachten.
- Schirme an beiden Enden über dem Geflecht klemmen und Potentialausgleich entlang der Kabeltrasse ausführen.
- Buskabel getrennt von Motor- und Antriebsleitungen verlegen; bei Korrelation mit Anlagenereignissen Einkopplung annehmen.
- Auf langen oder historisch auffälligen Segmenten Diagnoserepeater einsetzen, um Fehler entlang des Kabels zu lokalisieren.
- Erst nach den billigen Prüfungen durch Halbieren des Segments eingrenzen.
- Immer nur eine Variable ändern und neu messen.
- Ein Gerät nur tauschen, wenn die Belege auf dieses Gerät zeigen.
- Die physische Topologie dokumentieren und nach jedem Umbau aktualisieren.

## Fazit

PROFIBUS-Diagnose ist überwiegend eine Übung darin, Informationen zurückzugewinnen, die das Protokoll verdeckt. Wiederholungen verbergen die Degradation, die physikalische Ebene beherbergt nahezu alle Fehler, und die Station, die schließlich ausfällt, ist meist die mit der geringsten Reserve und nicht die schuldige.

Das Vorgehen, das funktioniert, ist unspektakulär: Wiederholungen messen und wissen, wie normal aussieht; prüfen, ob das Segment innerhalb seiner Auslegung liegt; Abschluss und Schirmung vor allem anderen kontrollieren; und systematisch eingrenzen statt zu substituieren. Konsequent angewandt macht es aus einer sporadischen Störung ein lokalisierbares Problem — und zwar ohne das Ersatzteilbudget, das der alternative Weg still verbraucht.
