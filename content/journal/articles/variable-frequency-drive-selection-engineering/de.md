# Auswahl und Auslegung von Frequenzumrichtern

## Zusammenfassung

Die Umrichterauswahl wird routinemäßig auf den Abgleich der Kilowatt zweier Typenschilder verkürzt. Das funktioniert oft genug, um sich als Gewohnheit zu halten, und versagt genau in den Anwendungen, in denen ein Umrichter am wertvollsten ist: hohes Losbrechmoment, dauerhafter Betrieb bei niedriger Drehzahl, große Schwungmassen und Lasten, die Energie zurückschieben.

Ein Umrichter ist eine Stromquelle mit thermischer Grenze und definierter Überlastfähigkeit, die einen Motor speist, dessen Kühlung von seiner eigenen Drehzahl abhängt. Jede folgenreiche Auswahlfrage ergibt sich aus diesem Satz und nicht aus der Leistungsangabe.

**Sicherheitshinweis.** Dieser Beitrag behandelt Auswahl, Auslegung und Inbetriebnahme. Arbeiten an Umrichtern betreffen gespeicherte Zwischenkreisenergie, die nach dem Freischalten bestehen bleibt, sowie drehende Maschinen, die auf Fernbefehl anlaufen können. Alle Arbeiten sind qualifiziertem Personal nach den Freischalt- und Sicherheitsverfahren des Standorts vorbehalten.

## Bei der Last beginnen, nicht beim Motor

Die Momenten-Drehzahl-Kennlinie der Last bestimmt fast alles Weitere.

| Lastart | Momentenverhalten | Typische Beispiele | Folge für die Auswahl |
| --- | --- | --- | --- |
| Quadratisches Moment | Moment steigt mit dem Quadrat, Leistung mit der dritten Potenz der Drehzahl | Kreiselpumpen und Ventilatoren | Geringere Überlastbetriebsart genügt; starker Energiefall |
| Konstantes Moment | Moment über die Drehzahl etwa konstant | Förderbänder, Verdrängerpumpen, Rührwerke, Extruder | Höhere Überlastbetriebsart; Kühlung bei niedriger Drehzahl kritisch |
| Konstante Leistung | Moment fällt oberhalb der Grunddrehzahl | Wickler, Spindeln, Werkzeugmaschinen | Feldschwächverhalten und Motorfähigkeit sind bestimmend |

**Für Kreiselmaschinen sind die Ähnlichkeitsgesetze die Grundlage des Energiefalls** — und sie verdienen eine genaue Formulierung, weil sie zugleich die Grundlage der häufigsten Überschätzung sind:

```text
Q2 / Q1 = N2 / N1              flow scales with speed
H2 / H1 = (N2 / N1)^2          head scales with speed squared
P2 / P1 = (N2 / N1)^3          shaft power scales with speed cubed

  Q = flow, H = head, N = speed, P = shaft power
  Subscript 1 = original condition, 2 = new condition
```

**Gültig sind sie unter der Annahme einer Anlagenkennlinie durch den Ursprung — also reibungsdominiert, ohne statische Förderhöhe.** Hebt eine Pumpe Flüssigkeit auf eine feste Höhe oder gegen einen festen Druck, ist ein Teil der Förderhöhe statisch und sinkt mit der Drehzahl nicht. Das Gesetz der dritten Potenz überschätzt die Einsparung dann, mitunter erheblich, und eine Anlage mit hohem statischem Anteil hat womöglich nur einen schmalen nutzbaren Drehzahlbereich, bevor der Förderstrom ganz abreißt.

**Die daraus folgende Praxis: Den Energiefall aus der realen Anlagenkennlinie und dem Betriebsprofil ableiten, nicht aus dem Gesetz der dritten Potenz auf ein Typenschild angewandt.** Eine so begründete Installation, die sich als statisch dominiert erweist, liefert weniger als versprochen — und der Umrichter wird für einen Modellfehler verantwortlich gemacht.

## Dimensionierung: Strom und Betriebsart, nicht Kilowatt

**Nach dem tatsächlichen Motorstrom im ungünstigsten Betriebsfall auswählen und bestätigen, dass die Überlastfähigkeit des Umrichters das geforderte Moment für die geforderte Dauer abdeckt.**

Die entscheidenden Größen:

- **Dauerstrom** im Betriebspunkt — nicht der Bemessungsstrom des Motors, wenn dieser für die Last überdimensioniert ist, und nicht weniger, wenn der Motor tatsächlich nahe seiner Bemessung läuft.
- **Losbrech- und Beschleunigungsmoment**, ausgedrückt als Strom und Dauer. Umrichter geben eine Überlastfähigkeit als Prozentsatz des Bemessungsstroms für eine genannte Zeit an; der Anwendungsbedarf muss darin Platz finden.
- **Betriebsspiel.** Häufige Anläufe, wiederholtes Beschleunigen großer Schwungmassen oder häufiges Reversieren belasten den Umrichter thermisch auf eine Weise, die eine stationäre Rechnung nicht erfasst.
- **Derating für Umgebungstemperatur und Aufstellhöhe**, angewandt vor dem Vergleich mit der Anforderung, nicht danach.
- **Taktfrequenz.** Ihre Erhöhung senkt Geräusch und verbessert den Stromverlauf und erhöht die Umrichterverluste — was den nutzbaren Strom verringert. Sie ist ein Auswahlparameter, keine Inbetriebnahme-Vorliebe.

**Zwei Lasten mit gleicher Motorleistung können verschiedene Umrichter verlangen**, und der Unterschied ist die Betriebsart. Ein Ventilator und ein Brecher gleicher Bemessung sind nicht dieselbe Auswahlaufgabe.

## Motorkühlung bei niedriger Drehzahl

Das ist die Randbedingung, die am häufigsten erst nach der Montage entdeckt wird.

Ein oberflächengekühlter Motor wird von einem Lüfter auf der eigenen Welle gekühlt. **Bei reduzierter Drehzahl sinkt die Kühlung, während das Lastmoment — bei konstantem Moment — nicht sinkt.** Ein dauerhaft mit einem Drittel der Drehzahl und vollem Moment laufendes Förderband bedeutet einen Motor bei vollem Strom mit einem Bruchteil seines Kühlluftstroms.

Die verfügbaren Antworten:

- **Fremdbelüftung** — ein separat gespeister Lüfter, der die Kühlung drehzahlunabhängig sicherstellt.
- **Ein Motor, der für Umrichterbetrieb über den geforderten Drehzahlbereich bemessen ist** und dessen thermische Fähigkeit für Dauerbetrieb bei niedriger Drehzahl angegeben ist.
- **Den Motor größer wählen**, sodass die verringerte Kühlung zur verringerten thermischen Belastung passt — oft die unelegante und manchmal die praktikabelste Lösung.
- **Eine begrenzte Niedrigdrehzahl-Betriebsart akzeptieren**, dokumentiert, mit einem Schutz, der sie durchsetzt.

**Der thermische Motorschutz muss das abbilden.** Ein rein stromabhängiger Überlastschutz weiß nicht, dass die Kühlung gesunken ist. Wo Dauerbetrieb bei niedriger Drehzahl vorgesehen ist, ist die direkte Temperaturmessung in der Wicklung die belastbare Antwort — und sie gibt dem Umrichter etwas Besseres als ein Modell zum Schützen.

## Bremsen, Rückspeisung und die Energie, die irgendwohin muss

Sobald die Last den Motor treibt statt umgekehrt — eine verzögernde Schwungmasse, ein absenkendes Hubwerk, ein abwärts fördernder Gurt, ein windmühlender Ventilator —, fließt Energie in den Umrichter zurück und hebt die Zwischenkreisspannung. Der Umrichter löst wegen Überspannung aus, sofern der Entwurf nicht entschieden hat, wohin diese Energie geht.

Vier Strategien, gewählt nach Energiemenge und Häufigkeit:

| Strategie | Wohin die Energie geht | Geeignet für |
| --- | --- | --- |
| Verlängerte Verzögerungsrampe | Über längere Zeit in Last- und Motorverlusten abgebaut | Gelegentliche Stopps mit verfügbarer Zeit |
| Bremswiderstand | In einem Widerstand in Wärme umgesetzt | Intermittierendes Bremsen; Betriebsspiel und Widerstandsbemessung sind zu rechnen |
| Rückspeisefähiger / aktiver Netzstromrichter | Ins Netz zurückgeführt | Dauernde oder häufige Rückspeisung; höhere Kosten, bessere Effizienz |
| Mechanische Bremse | Reibung, außerhalb des elektrischen Systems | Halten statt geregeltes Verzögern |

**Der Bremswiderstand ist die am häufigsten ungerechnet getroffene Wahl.** Seine Bemessung ist nicht allein die Spitzenleistung; sie ist die Energie je Bremsvorgang mal Wiederholrate — und ein für gelegentliche Stopps ausgelegter Widerstand überhitzt an einer Maschine, die alle neunzig Sekunden anhält.

**Dauerhafte Rückspeisung ist ein anderes Problem als Anhalten.** Ein beladen abwärts fördernder Gurt speist während seiner gesamten Betriebszeit zurück. Ein Widerstand verwandelt diese Energie dauerhaft in Wärme im Elektroraum — ein Energie- und ein Kühlaufwand —, während ein aktiver Netzstromrichter sie ins Netz zurückgibt. Die Entscheidung ist eine Energie- und Kühlrechnung, keine Vorliebe.

**Ein Umrichter, der beim Verzögern wegen Zwischenkreisüberspannung auslöst, ist nicht defekt.** Er meldet, dass die Bremsstrategie nicht Teil der Auswahl war.

## Netzbedingungen

Der Umrichter sieht das Netz durch seinen Gleichrichter, und mehrere Netzeigenschaften verändern, was er leisten kann.

- **Spannungstoleranz und Einbrüche.** Die Überbrückungsfähigkeit bei einem kurzen Einbruch hängt von der gespeicherten Zwischenkreisenergie und der Parametrierung ab. Wo Einbrüche häufig sind, ist das gewünschte Verhalten — auslösen, überbrücken oder geregelt aus der Lastschwungmasse verzögern — eine Entwurfsentscheidung, die parametriert und getestet gehört.
- **Spannungsunsymmetrie** belastet den Gleichrichter ungleich und erhöht die Zwischenkreiswelligkeit. Wo sie erheblich ist, gehört sie in die Auswahl und verlangt gegebenenfalls zusätzliche Netzdrosselung.
- **Netzimpedanz.** Ein steifes Netz ergibt geringere Verzerrung und höheren Kurzschlussstrom; ein weiches das Gegenteil. Beides zählt, und beides ist eine Eigenschaft der Installation.
- **Generatorbetrieb** verdient ausdrückliche Behandlung: begrenzter Kurzschlussstrom, Empfindlichkeit gegenüber harmonischer Verzerrung und — wesentlich — begrenzte oder fehlende Fähigkeit, zurückgespeiste Energie aufzunehmen. Ein rückspeisender Netzstromrichter am Generator ist eine Systemfrage, keine Umrichteroption.

> Harmonische Ströme, ihre Wirkung auf die Installation und die Minderungsmaßnahmen behandelt der Begleitbeitrag zu Oberschwingungen, EMV und Motorleitungen ausführlich. Für die Auswahl gilt: Das harmonische Verhalten ist eine Eigenschaft der Eingangsstufe und gehört in die Spezifikation, nicht in die nachträgliche Entdeckung.

## Umgebung, Kühlung und physische Integration

Umrichter sind wirkungsgradstark und setzen dennoch einen spürbaren Anteil ihrer Leistung in Wärme um — vollständig in Schrank oder Raum.

- **Derating für Umgebungstemperatur und Aufstellhöhe** gilt vor jeder anderen Rechnung.
- **Die Wärmeeinbringung in den Raum ist eine Entwurfslast.** Umrichter in einen bestehenden Elektroraum zu ergänzen, ohne die Kühlung neu zu rechnen, ist ein zuverlässiger Weg, jedes Gerät darin zu deraten.
- **Luftwege, Filter und deren Pflege** gehören zum Entwurf. Ein Filter ohne Verantwortlichen wird irgendwann der Grund sein, weshalb ein Umrichter deratet oder auslöst.
- **Staub, korrosive Atmosphäre, Feuchte und Kondensation** bestimmen die Gehäusespezifikation. Kondensationsheizung zählt in unbeheizten Gebäuden und bei lange stillstehenden Anlagenteilen.
- **Vibration** in Fördertechnik und mobilen Anwendungen beeinflusst Befestigung und Steckverbinderwahl.

## Motorisolation, Leitungen und Lager

Der Umrichterausgang ist eine Folge schneller Spannungsflanken statt einer Sinusspannung, und daraus folgen drei Punkte, die zur Auswahlzeit zu entscheiden sind:

- **Belastung der Motorisolation.** Steile Flanken beanspruchen die ersten Windungen der Wicklung. Für Umrichterbetrieb ausgelegte Motoren sind dafür gebaut; ältere oder Allzweckmotoren an langen Leitungen womöglich nicht.
- **Leitungslänge und Wellenreflexion.** Lange Motorleitungen können die Spannung an den Motorklemmen deutlich über den Umrichterausgang überschwingen lassen. Der Hersteller nennt eine maximale Leitungslänge; sie zu überschreiten — oder sich ihr mit einem Motor gewöhnlicher Isolation zu nähern — ist der Punkt, an dem Ausgangsdrosseln oder Filter Teil des Entwurfs werden.
- **Lagerströme.** Gleichtaktspannung kann Strom durch Lager treiben und fortschreitende Schäden erzeugen. Isolierte Lager, Wellenerdung sowie korrekte Leitungs- und Erdungspraxis sind die Gegenmaßnahmen.

Sie gehören in die Auswahl, weil sie verändern, was beschafft wird: den Motor, den Leitungstyp und die Frage, ob ein Ausgangsfilter nötig ist.

## Steuerung, Kommunikation und Sicherheitsfunktionen

**Kommunikation** bringt denselben Nutzen und dieselbe Regel wie anderswo in der Anlage: Drehzahlsollwert, Status, Strom, thermisches Abbild und Fehlercodes über einen Feldbus sind wirklich wertvoll, und **der Umrichter muss sich bei fehlendem Netz sicher und vorhersehbar verhalten**. Stoppfunktionen und relevante Verriegelungen dürfen nicht davon abhängen.

**Integrierte Sicherheitsfunktionen** — am häufigsten ein Safe-Torque-Off-Eingang, der dem Umrichter die Fähigkeit zur Momentbildung nimmt — sind nützlich und werden häufig missverstanden.

**Safe Torque Off verhindert, dass der Umrichter Moment erzeugt. Es ist keine Freischaltung und trennt die Versorgung nicht.** Der Zwischenkreis bleibt geladen, Klemmen bleiben spannungsführend, und nach dem Trennen gilt eine Entladezeit. Instandhaltungsarbeiten verlangen Freischalten und Sichern nach den Verfahren des Standorts; eine Sicherheitsfunktion ist Teil des betrieblichen Sicherheitskonzepts der Maschine und kein Ersatz dafür.

Wo solche Funktionen genutzt werden, gehören Kategorie, Verdrahtung, Reaktion und Rücksetzverhalten in die Sicherheitsbewertung der Maschine, und ihre korrekte Funktion ist bei der Inbetriebnahme nachzuweisen.

## Parametersätze als Konfigurationsobjekte

Das Verhalten eines Umrichters lebt in einem umfangreichen Parametersatz — und in den meisten Anlagen existiert er an genau einer Stelle: im Umrichter.

**Die Folgen eines lässigen Umgangs sind vorhersehbar.** Ein Umrichter fällt aus, ein Ersatzgerät wird mit Werkseinstellungen oder mit Parametern einer anderen Maschine eingebaut, und der Ersatz verhält sich anders — andere Rampen, andere Strombegrenzungen, andere Schutzeinstellungen — auf eine Weise, die womöglich erst bei schwerer Last oder im Fehlerfall auffällt.

Die Praxis, die das verhindert:

- **Den Parametersatz nach der Inbetriebnahme und nach jeder Änderung sichern**, mit Gerätekennung und Datum.
- **Dort ablegen, wo eine Instandhaltungsfachkraft ihn nachts findet**, nicht nur auf dem Notebook einer Ingenieurin.
- **Bewusste Abweichungen vom Standardsatz und ihre Gründe dokumentieren.**
- **Die Ersatzteilstrategie durchgängig verifizieren** — einschließlich der Frage, ob die abgelegte Datei in das konkret bevorratete Ersatzmodell und dessen Firmware-Stand geladen werden kann.

> Die weitergehende Disziplin — Konfigurationen sichern, Wiederherstellungen verifizieren und Werkzeugversionen verfügbar halten — behandelt der Begleitbeitrag zur industriellen Cybersicherheit; Umrichter gehören zu den Asset-Klassen, die in solchen Sicherungen am häufigsten fehlen.

## Inbetriebnahme

- **Motordaten korrekt eingeben** und, wo vorhanden, die Identifikations- oder Autotune-Routine ausführen; ein Umrichter, der einen Motor aus falschen Daten regelt, rät.
- **Den Richtungsbefehl des Umrichters** vor dem Kuppeln gegen die tatsächliche Wellendrehung prüfen; am Umrichter ist die Richtung ein Parameter und keine Ader.
- **Rampen aus Prozessanforderung und Bremsstrategie festlegen** und die Verzögerung unter der ungünstigsten realistischen Last verifizieren.
- **Strombegrenzungen und thermischen Motorschutz verifizieren**, einschließlich des Niedrigdrehzahlfalls, wenn Dauerbetrieb dort vorgesehen ist.
- **Die Sicherheitsfunktion nachweisen** sowie das Verhalten bei Kommunikationsverlust, Steuerspannungsverlust und Netzspannungseinbruch.
- **Wiederanlaufverhalten bestätigen** — der Umrichter darf nach einer Störung oder Netzunterbrechung nicht selbsttätig anlaufen, sofern das nicht ausdrücklich ausgelegt und bewertet wurde.
- **Temperaturen unter Dauerlast messen**, im Schrank und im Raum.
- **Den Parametersatz sichern und archivieren** und im Instandhaltungssystem vermerken.

## Fehlermodi

**Nach kW allein ausgewählt.** Für einen Ventilator ausreichend, für einen Brecher gleicher Bemessung nicht.

**Überlastbetriebsart nicht geprüft.** Der Umrichter löst beim Anlauf einer Last aus, die er tragen sollte.

**Dauerbetrieb bei niedriger Drehzahl ohne Fremdbelüftung.** Der Motor überhitzt bei einem Strom, den der Schutz für normal hält.

**Keine Bremsstrategie.** Zwischenkreisüberspannung beim Verzögern, dem Umrichter angelastet.

**Bremswiderstand nach Spitze statt nach Betriebsspiel bemessen.** Er überhitzt an einer häufig anhaltenden Maschine.

**Rückspeisung auf einen Generator.** Ein Systemproblem, entdeckt bei der Inbetriebnahme.

**Leitungslänge über dem genannten Maximum.** Isolationsbelastung und unerklärte Ausfälle Jahre später.

**Umrichter ohne neue Wärmelastrechnung ergänzt.** Jedes Gerät im Raum ist derated.

**Safe Torque Off als Freischaltung behandelt.** Ein gravierendes Sicherheitsmissverständnis.

**Parametersatz nur im Umrichter.** Das Ersatzgerät verhält sich anders, und niemand kann sagen wie.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Eine Fördertechnikanlage ersetzt den Festdrehzahlantrieb eines abwärts fördernden Gurts durch einen Frequenzumrichter, dimensioniert nach der Motorleistung. Ziele sind geregeltes Anfahren und Drehzahlabgleich mit dem nachgelagerten Prozess; beides wird erreicht.

Der Gurt fördert beladen abwärts. Bei der Inbetriebnahme funktioniert alles: Der Gurt wird leer und teilbeladen gefahren, und der Umrichter verhält sich korrekt. Sobald Produktionslast anliegt, löst der Umrichter wegen Zwischenkreisüberspannung aus — zunächst beim Anhalten, später im Dauerbetrieb.

Die Belege sind eindeutig, sobald die Frage richtig gestellt ist. Die Auslösungen treten auf, wenn die Gurtbeladung eine Schwelle übersteigt — also wenn die Gewichtskomponente der Last die Reibungsverluste übersteigt und der Gurt beginnt, den Motor zu treiben. Der Umrichter versagt nicht bei der Regelung; ihm wird Energie zugeführt, für die er keinen Ort hat. Beim Anhalten kommt die gespeicherte kinetische Energie des beladenen Gurts hinzu.

Am Umrichter ist nichts defekt, und die Leistungsangabe war in dem Sinne korrekt, in dem sie geprüft wurde. Die Auswahl hat die grundlegende Eigenschaft der Last übergangen: **es ist eine treibende Last, die im Normalbetrieb dauerhaft zurückspeist — nicht nur beim Verzögern.**

Die Abhilfe hängt von der Energiemenge ab. Wo die Rückspeisung dauerhaft und erheblich ist, ist ein Bremswiderstand die falsche Antwort — er verwandelt die potenzielle Energie der Anlage in jeder Stunde jeder Schicht in Wärme im Elektroraum und erzeugt damit Energiekosten und Kühllast. Ein aktiver Netzstromrichter, der die Energie ins Netz zurückgibt, ist die passende Lösung — und ein anderes Betriebsmittel mit anderen Kosten, Abmessungen und Netzanforderungen.

**Die übertragbare Lehre trennt Umrichterauswahl von Umrichterbeschaffung: Die Frage „wie viel Energie gibt diese Last zurück, und wie oft?“ muss vor der Gerätewahl gestellt werden, weil ihre Antwort die Gerätewahl verändert.**

## Empfohlene Praxis

- Mit der Momenten-Drehzahl-Kennlinie und dem Betriebsprofil der Last beginnen; die Last klassifizieren, bevor Produkte betrachtet werden.
- Energieeinsparungen aus der realen Anlagenkennlinie ableiten; das Gesetz der dritten Potenz nur bei vernachlässigbarer statischer Förderhöhe ansetzen.
- Nach Strom und Überlastbetriebsart für die geforderte Dauer dimensionieren, nicht nach Typenschild-Kilowatt.
- Derating für Umgebung, Aufstellhöhe und Taktfrequenz vor dem Vergleich mit der Anforderung anwenden.
- Die Motorkühlung für Dauerbetrieb bei niedriger Drehzahl ausdrücklich lösen; direkte Wicklungstemperaturmessung bevorzugen.
- Brems- oder Rückspeisestrategie aus Energie je Vorgang und Wiederholrate ableiten; Widerstände nach Betriebsspiel bemessen.
- Rückspeisung auf einen Generator als Systemfrage behandeln.
- Das Verhalten bei Netzeinbrüchen und Unsymmetrie festlegen und testen.
- Die Umrichterwärme in die Kühlrechnung des Raums aufnehmen und Verantwortliche für Filter und Luftführung benennen.
- Leitungslänge gegen das genannte Maximum prüfen und Motorisolation, Ausgangsfilter, Lagerisolation und Wellenerdung entsprechend festlegen.
- Stoppfunktionen und Verriegelungen unabhängig vom Kommunikationsnetz halten.
- Safe Torque Off nie als Freischaltung behandeln; für Instandhaltung Freischalten und Sichern verlangen und die Zwischenkreis-Entladezeit einhalten.
- Parametersätze nach Inbetriebnahme und nach jeder Änderung sichern, für die Instandhaltung erreichbar ablegen und die Ladbarkeit ins Ersatzgerät verifizieren.
- Wiederanlaufverhalten, Sicherheitsfunktionen, thermischen Schutz und Verzögerung unter realistischer Last bei der Inbetriebnahme verifizieren.

## Fazit

Ein Frequenzumrichter wird als Komponente gekauft und verhält sich als Teil eines Systems, das die Mechanik der Last, die Kühlung des Motors, die Steifigkeit des Netzes, die Temperatur des Raums und die Leitung dazwischen umfasst. Jeder der hier beschriebenen Fehler entsteht dadurch, dass die Komponente ausgewählt und das System versehentlich mitgeerbt wurde.

Die Disziplin ist bescheiden und gleichbleibend: die Last klassifizieren, nach Strom und Betriebsart dimensionieren, entscheiden, wohin die Bremsenergie geht, den Motor für den tatsächlich gefahrenen Drehzahlbereich schützen und den Parametersatz als technische Aufzeichnung behandeln statt als Einstellung in einem Gehäuse. So gemacht, ist ein Umrichter eines der zuverlässigsten Betriebsmittel einer Anlage. Allein nach Typenschildleistung ausgewählt, wird er zu der Komponente, die scheinbar immer dann versagt, wenn die Anwendung etwas tut, das die Spezifikation nie beschrieben hat.
