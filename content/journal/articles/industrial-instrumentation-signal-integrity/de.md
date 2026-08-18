# Architektur industrieller Messtechnik und Signalintegrität

## Zusammenfassung

Die meisten Messtechnikprobleme, die als „Störungen“ vorgetragen werden, sind Architekturprobleme in Verkleidung. Das Kabel ist selten die Ursache; das Kabel ist die Stelle, an der die Folge sichtbar wird.

Die Wurzel ist begrifflich. Fünf verschiedene ingenieurtechnische Begriffe teilen sich überlappenden Wortschatz, erscheinen auf denselben Zeichnungen und landen oft auf benachbarten Klemmen: **Schutzerdung**, **Schirmanbindung**, **Funktionsbezug**, **Signalrückleitung** und **Gleichtaktunterdrückung**. Sie sind nicht austauschbar, sie sind keine Abstufungen derselben Sache, und ein Betrieb, der sie zu einem einzigen Begriff namens „Erde“ zusammenzieht, erzeugt Messsysteme, die sich nicht diagnostizieren lassen — weil der Wortschatz, den man zur Beschreibung des Fehlers braucht, vor Ort nicht existiert.

Dieser Beitrag behandelt Messtechnik als Architektur: was die fünf Begriffe sind und warum jeder eine eigene Entscheidung braucht, wie sich Signalkategorien unterscheiden und warum das die Verlegung bestimmt, die tatsächlichen Abwägungen zwischen zentraler Rangierung und dezentraler E/A, warum Feldverteiler die Langzeitzuverlässigkeit stärker bestimmen als jede Kabelspezifikation, wie man ein Schirmkonzept statt einer Schirmgewohnheit festlegt, wo Trennung hingehört, und warum Gleichtakt ein Fehlermodus ist und keine Störungsstufe.

Die allgemeinen Schutzerdungsregeln stehen im Begleitbeitrag zur industriellen Erdung, das elektrische Verhalten einer einzelnen Messkette in den Begleitbeiträgen zu 4–20-mA-Kreisen und die Störerseite von Antriebsinstallationen im Begleitbeitrag zu Antriebsoberschwingungen und EMV. Dieser Beitrag ist die Ebene darüber: wie das messtechnische System angelegt ist und was diese Anlage möglich oder unmöglich macht.

## Fünf Begriffe, die getrennt bleiben müssen

| Begriff | Was er ist | Was er nicht ist |
| --- | --- | --- |
| **Schutzerdung (PE)** | Ein Fehlerstrompfad, damit Schutzeinrichtungen ansprechen; eine Sicherheitsfunktion | Ein Signalbezug, ein Schirm oder ein Rückleiter |
| **Schirmanbindung** | Anschluss eines Kabelschirms an ein definiertes Potential zur Kopplungsbeherrschung | Ein Schutzleiter — und niemals eine Signalrückleitung |
| **Funktionsbezug** | Das Potential, gegen das eine Messung definiert ist — die „Null“ des Messsystems | Eine Schutzerde, und nicht automatisch auf Erdpotential |
| **Signalrückleitung** | Der Leiter, der den Rückstrom des Signals tatsächlich führt | Der Bezug — und nicht der Schirm |
| **Gleichtaktunterdrückung** | Die Fähigkeit des Empfängers, eine auf beiden Eingängen gleich anliegende Spannung zu ignorieren | Eine Eigenschaft der Verdrahtung — sie gehört zum Eingangskreis |

**Die Folgen des Zusammenziehens sind konkret, nicht vage.** Einen Schirm als Signalrückleitung zu verwenden führt jeden im Schirm induzierten Strom direkt in die Messung. Den Schutzleiter als Bezug zu verwenden bringt jeden Fehlerstrom und jeden hochfrequenten Rückweg aus Stromrichtern in die „Null“ des Messsystems. Gleichtaktunterdrückung für eine Verdrahtungseigenschaft zu halten führt dazu, dass Kabel umverlegt werden, obwohl das eigentliche Problem darin besteht, dass das Feldgerät außerhalb des zulässigen Gleichtaktbereichs des Eingangs liegt.

**Ein Betrieb kann vorbildliche Schutzerdung und miserable Signalintegrität haben — und umgekehrt.** Es sind zwei getrennte Auslegungen, die sich Hardware teilen.

## Signalkategorien und warum sie getrennt verlegt werden

Messleitungen werden getrennt verlegt, weil sich Signalkategorien um Größenordnungen im Pegel, in der Bandbreite und in ihrer Wirkung auf die Nachbarn unterscheiden.

| Kategorie | Typischer Charakter | Vorherrschende Anfälligkeit |
| --- | --- | --- |
| **Kleinsignal-Analog** (Thermoelement, Brücke, pH) | Millivolt, hoher Quellwiderstand | Kapazitive und magnetische Kopplung; Thermospannungen an Verbindungen |
| **Widerstandsthermometer** | Kleine Widerstandsänderungen, als Spannung gemessen | Leitungswiderstand, Übergangswiderstände, Eigenerwärmung |
| **4–20-mA-Kreise** | Stromgetrieben, niederohmig | Vergleichsweise unempfindlich, aber nicht gegen Gleichtakt |
| **Impuls und Frequenz** (Durchfluss, Drehgeber) | Flankendefiniert | Ein einzelner induzierter Impuls wird als Datum gezählt |
| **Binär 24 V DC** | Robust, aber Quelle von Schalttransienten | Kontaktprellen, induktive Rückschläge von Relais und Ventilen |
| **Digitaler Feldbus** | Definierte elektrische Schicht mit eigenen Regeln | Abschluss, Topologie, Segmentlängengrenzen |
| **Eigensichere Stromkreise** | Energiebegrenzt durch Zertifizierung | Getrennt aus *Sicherheits*gründen, nicht aus EMV-Gründen |
| **Energie- und Antriebsausgangsleitungen** | Die Störer | Sie sind keine Opfer, sie sind die Quelle |

**Zwei davon verdienen Nachdruck, weil sie routinemäßig falsch behandelt werden.**

**Impuls- und Frequenzsignale versagen anders als analoge Signale.** Ein durch Einkopplung gestörtes Analogsignal liest leicht falsch; ein gestörter Impulseingang liest *zusätzliche Zählungen*, und der entstehende Fehler ist kein kleiner Offset, sondern eine erfundene Menge. Ein Durchflusszähler, der Volumen gewinnt, sobald ein naher Antrieb startet, hat kein Kalibrierproblem.

**Eigensichere Stromkreise werden aus einem anderen Grund getrennt als alles andere in dieser Liste.** Ihre Trennung und Kennzeichnung ist eine Anforderung der Ex-Auslegung, keine EMV-Maßnahme, und sie ist gegenüber Bequemlichkeit nicht verhandelbar. Das Zusammenspiel beider Disziplinen behandelt ein späterer Abschnitt.

**Die Verdrahtung von Widerstandsthermometern verdient eine präzise Aussage**, denn sie ist eine häufige Quelle stabiler, aber falscher Messwerte. Eine Zweileiterschaltung nimmt den Leitungswiderstand in die Messung auf. Eine Dreileiterschaltung kompensiert ihn *unter der Annahme identischer Leitungen*, die ein repariertes oder verlängertes Kabel verletzen kann. Eine Vierleiterschaltung entfernt den Leitungswiderstand vollständig. **Der Unterschied zeigt sich nicht als Störung, sondern als Offset — deutlich schwerer zu bemerken und deutlich leichter falsch wegzukalibrieren.**

## Wo die E/A sitzt: drei Architekturen

| | **Zentrale E/A mit Rangierung** | **Dezentrale E/A im Feld** | **Digitale Feldgeräte / Feldbus** |
| --- | --- | --- | --- |
| **Feldverkabelung** | Größtes Volumen — jedes Signal läuft in den Raum | Reduziert auf Netzwerk und Versorgung | Am geringsten — Multidrop- oder Segmentverdrahtung |
| **Umgebung der Elektronik** | Kontrollierter Raum | Feld: Temperatur, Vibration, Korrosion, Betauung | Auf die Geräte selbst verteilt |
| **Fehlerdomäne** | Je Kanal oder je Baugruppe | Je Knoten — ein Ausfall trifft viele Signale | Je Segment oder je Gerät |
| **Änderungskosten** | Gering mit Rangierung, hoch bei Direktauflegung | Mittel — Knoten haben endliche Kapazität | Abhängig von Segmentbelegung und Topologieregeln |
| **Diagnosetiefe** | Kanaldiagnose auf Baugruppenebene | Knotendiagnose plus Netzwerkzustand | Gerätediagnose, die reichhaltigste der drei |
| **Zusätzliche Abhängigkeit** | Keine über den Baugruppenträger hinaus | Netzverfügbarkeit und Feldversorgung | Netzverfügbarkeit, Konfigurationsverwaltung, Werkzeuge |

**Die Abwägung, die niemand ausspricht, ist die Lage der Fehlerdomäne.** Zentrale E/A konzentriert Kosten im Kabel und hält Ausfälle klein: Ein ausgefallener Kanal ist eine Messung. Dezentrale E/A tauscht Kabel gegen ein Netzwerk und verlagert Elektronik in die Umgebung, was eine echte Zuverlässigkeitsentscheidung ist — und sie verschiebt die Fehlerdomäne von einem Signal auf die Signale eines Knotens, was erheblich zählt, wenn dieser Knoten mehrere Messungen derselben Prozesseinheit trägt.

**Die Verteilung von Signalen auf Knoten sollte daher der Prozesslogik folgen, nicht der Kabelbequemlichkeit.** Alle drei Messungen eines kritischen Regelkreises auf denselben dezentralen Knoten zu legen, ist eine Entscheidung, die niemand absichtlich getroffen hat, die aber viele Anlagen getroffen haben.

**Rangierung existiert für Änderungen, nicht für Ordnung.** Ein System, das vom Feldkabel direkt auf die E/A-Baugruppe aufgelegt ist, ist billiger zu bauen und wesentlich teurer zu ändern: Jede Änderung berührt die Baugruppe. Ein Rangierverteiler entkoppelt die Feldauflegung von der E/A-Zuordnung, und genau das macht eine Anlage über zwanzig Jahre änderbar. Betriebe, die auf Rangierung verzichtet haben, um Investitionskosten zu sparen, zahlen sie bei jeder späteren Änderung mit Zinsen zurück.

## Feldverteiler: der Zuverlässigkeitsfaktor, den niemand spezifiziert

Feldgehäuse bestimmen die messtechnische Langzeitzuverlässigkeit verlässlicher als jede Kabelspezifikation — und sie sind der am wenigsten durchkonstruierte Teil der meisten Planungen.

**Wassereintritt ist meist kein Schutzartproblem, sondern ein Detailproblem.** Ein Gehäuse mit völlig ausreichender Schutzart füllt sich mit Wasser, weil Verschraubungen auf der Oberseite sitzen, weil die Verschraubung nicht auf den richtigen Kabeldurchmesser angezogen wurde oder weil das Kabel selbst Wasser aus einer höheren Stelle in seinen Zwischenräumen herabgeführt hat. **Der im Feld tatsächlich dominierende Mechanismus ist Betauung**, getrieben vom täglichen Temperaturwechsel: Das Gehäuse atmet, feuchte Luft tritt ein, die Feuchte bleibt. Belüftungs-Entwässerungselemente, Verschraubungen auf den unteren Flächen und eine abwärts geführte Tropfschleife sind allesamt billig und allesamt häufig nicht vorhanden.

**Die Schirmdurchgängigkeit wird am häufigsten im Feldverteiler unterbrochen — oder versehentlich hergestellt.** Ein Schirm auf einer Klemme, die auch mit dem Gehäuse verbunden ist, in einem Gehäuse, das mit dem Stahlbau verbunden ist, ist soeben an einer Stelle geerdet worden, die niemand dokumentiert hat. Multipliziert mit einem Dutzend Kästen ist das Schirmkonzept der Anlage das, was bei der Montage geschah.

**Trennung, die an der Verschraubungsplatte endet, ist keine Trennung.** Über den Standort hinweg sorgfältig getrennte Signalkategorien werden routinemäßig in einem kleinen Gehäuse wieder zusammengeführt, in dem alle Adern eine Klemmenreihe teilen.

**Der Klemmentyp zählt unter Vibration**, und Reservekapazität zählt für die nächsten zehn Jahre. Ein ohne Reserveklemmen montierter Feldverteiler garantiert, dass das nächste Messgerät einen zweiten Kasten, ein zusätzliches Kabel und eine undokumentierte Topologie bekommt.

## Verlegung, Trennung und Schleifenfläche

Die Physik lässt sich in zwei Sätze fassen. **Magnetische Kopplung wird von der Fläche der Schleife bestimmt, die Signal und Rückleitung bilden** — deshalb ist die verdrillte Doppelader Standard, und deshalb ist ein Signal, dessen Rückleitung anders geführt ist, unabhängig von seinem Schirm exponiert. **Kapazitive Kopplung wird von der Nähe und von der Impedanz des Opferkreises bestimmt** — deshalb sind hochohmige Kleinsignale die verwundbaren, und deshalb ist ein niederohmiger Stromkreis vergleichsweise robust.

Die praktischen Regeln folgen unmittelbar:

- **Signal und Rückleitung immer gemeinsam führen.** Eine Trassenführung, die sie trennt, erzeugt eine Schleife von der Größe des Gebäudes.
- **Kabel Kategorien zuordnen und Mindestabstände sowie zulässige Parallellauflängen festlegen**, und diese am As-built prüfen, nicht an der Planung.
- **Rechtwinklig kreuzen**, wo sich Trassen schneiden müssen.
- **Getrennte oder physisch unterteilte Trassen zwischen Störer- und Opferkategorien verwenden** — und bedenken, dass ein metallischer Trennsteg nur hilft, wenn er durchgehend und angebunden ist.
- **„Getrennt verlegt“ muss über die gesamte Strecke gelten.** Ein Kabel, das an beiden Enden getrennt ist und dazwischen vierzig Meter dieselbe Trasse teilt, ist nicht getrennt; im Parallellauf geschieht die Kopplung.
- **Antriebsausgangsleitungen sind eine eigene Kategorie** und gehören zur Behandlung im Antriebs-EMV-Beitrag, nicht in die allgemeine Energiekategorie.

## Schirmkonzept statt Schirmgewohnheit

**Ein Schirm adressiert einen Mechanismus, und verschiedene Mechanismen verlangen verschiedene Anbindungen.**

- **Kapazitive (elektrostatische) Kopplung** wird beherrscht, indem der Schirm auf einem definierten Potential gehalten wird. Bei niedriger Frequenz erreicht ein einseitiger Anschluss das und vermeidet einen Ausgleichsstrom im Schirm.
- **Magnetische Kopplung** wird von einem elektrostatischen Schirm überhaupt nicht adressiert; sie wird durch kleinere Schleifenfläche adressiert — Verdrillung — und, wo ein Schirm helfen soll, durch einen Schirm, der Strom führen kann, was eine Folie-mit-Beilaufdraht-Konstruktion schlecht tut.
- **Hochfrequente Kopplung** verlangt, dass der Schirm Rückstrom führt, was eine niederinduktive 360-Grad-Anbindung und in der Regel einen beidseitigen Anschluss erfordert. Bei hoher Frequenz ist ein über einen Beilauf angebundener „einziger Punkt“ überhaupt kein Punkt; der Beilauf ist eine Induktivität.

**Die architektonische Entscheidung besteht darin, je Signalkategorie ein Schirmkonzept festzulegen und in die Spezifikation zu schreiben**, und es dann im Rangierschrank und in jedem Feldverteiler durchzusetzen. Der Fehlerzustand ist nicht ein falsches Konzept, sondern ein *gemischtes*: Zwei Geräte an demselben Kabel mit unterschiedlichen Annahmen erzeugen einen Ausgleichsstrom, den niemand geplant hat.

**Zwei absolute Sätze lohnen die klare Formulierung.** Ein Schirm ist niemals eine Signalrückleitung. Und ein an beiden Enden in zwei verschiedene Erdungssysteme aufgelegter Schirm ist kein Schirm — er ist eine Verbindung zwischen zwei Systemen, die den von ihrer Potentialdifferenz getriebenen Strom direkt entlang der Signalleitung führt.

## Trennung als Architekturentscheidung

Galvanische Trennung leistet drei Dinge und nur drei: Sie bricht eine leitende Schleife zwischen zwei Bezugspotentialen auf, sie legt fest, zu welchem Bezug die Messung gehört, und sie begrenzt die Gleichtaktspannung, der der Eingangskreis ausgesetzt ist.

**Sie unterdrückt keine Gegentaktstörungen.** Eine Störung, die zwischen den beiden Signaladern erscheint, passiert einen Trennverstärker so getreu wie das Signal selbst. Deshalb ist „wir haben einen Trennverstärker eingebaut und es half nicht“ ein so häufiger Befund: Das Gerät war richtig, der Fehler war Gegentakt.

**Die architektonische Frage ist die Granularität.** Kanaltrennung, Gruppentrennung und Trennung einer einzigen Bank sind drei verschiedene Produkte mit drei verschiedenen Folgen:

- **Kanal-zu-Kanal-Trennung** zählt, wenn Feldgeräte wirklich auf unterschiedlichen Potentialen sitzen — andere Bauwerke, lange Strecken, getrennt geerdete Prozessanschlüsse.
- **Gruppentrennung** schützt das System gegen das Feld, lässt aber Kanäle innerhalb der Gruppe über ihren gemeinsamen Bezug wechselwirken.
- **Eine einzige getrennte Bank** ist im Wesentlichen eine Trenngrenze für alles und reicht nur, wenn alle Feldgeräte einen Bezug teilen.

**Der Fehlermodus besteht darin, Gruppentrennung zu wählen und die Gruppe dann mit Geräten zu füllen, die einzeln an ihren Prozessanschlüssen geerdet sind.** Jedes dieser Geräte prägt sein lokales Potential dem gemeinsamen Gruppenbezug auf, und die Kanäle stören einander über einen Weg, den die Zeichnung nicht zeigt.

## Gleichtakt ist ein Fehlermodus, keine Störungsstufe

Diese Unterscheidung klärt einen großen Teil des „unerklärlichen“ Messverhaltens.

**Gleichtaktspannung ist eine Spannung, die auf beiden Signalleitern gleich gegenüber dem Bezug des Empfängers anliegt.** Sie entsteht aus Potentialdifferenzen zwischen dem Bezugsort des Feldgeräts und dem der Eingangsbaugruppe, aus kapazitiver Kopplung, die beide Leiter gemeinsam anhebt, und aus erdfreien Quellen ohne jede definierte Beziehung zum Empfänger.

**Zwei getrennte Angaben bestimmen das Ergebnis, und ihre Verwechslung ist die Falle:**

- **Das Gleichtaktunterdrückungsverhältnis** beschreibt, wie viel einer Gleichtaktspannung als scheinbares Gegentaktsignal erscheint. Ein hohes Verhältnis bedeutet gute Unterdrückung.
- **Der Gleichtaktbereich** beschreibt das Spannungsfenster, in dem der Eingangskreis überhaupt arbeitet. **Außerhalb dieses Bereichs ist Unterdrückung bedeutungslos** — der Eingang arbeitet nicht mehr linear, und der Messwert ist nicht verrauscht, sondern sinnlos.

**Die Diagnose dauert zwei Minuten und wird fast nie durchgeführt: die Spannung zwischen dem Bezug des Feldgeräts und dem Bezug der Eingangsbaugruppe messen**, in dem Zustand, in dem der Fehler auftritt. Bewegt sich diese Spannung, wenn ein Antrieb startet, ist das Problem ein Gleichtaktproblem, und ein Umverlegen der Signalleitung wird es nicht beheben. Der allgemeine Mechanismus hinter solchen Potentialdifferenzen — Strom im Erdungssystem und Strukturen auf unterschiedlichem Potential — gehört zum Erdungsbeitrag; hier zählt, dass die messtechnische Architektur bestimmt, wie stark die Messung ihm ausgesetzt ist.

## Eigensicherheit: die Schnittstelle, nicht die Auslegung

Ex-Auslegung ist eine eigene Disziplin mit eigenem Zertifizierungsrahmen, und dieser Abschnitt beschreibt nur, wo sie die messtechnische Architektur berührt.

**Zertifiziert wird ein System, kein Gerät.** Ein eigensicherer Stromkreis wird als Kombination aus Feldgerät, zugehörigem Betriebsmittel (Barriere oder Trennverstärker) und der Verbindungsleitung zertifiziert, deren Kapazität und Induktivität Teil der Zertifizierung sind. **Damit sind Kabeltyp und Kabellänge Sicherheitsparameter**, keine Montagebequemlichkeiten, und ein aus Verfügbarkeitsgründen ersetztes Kabel kann die Zertifizierung ohne jede sichtbare Änderung entwerten.

**Der Barrierentyp verändert die Erdungsarchitektur.** Eine Zener-Barriere ist für ihre Funktion auf eine Verbindung zu einer definierten eigensicheren Erde angewiesen, was diese Erde zu einem sicherheitsrelevanten Element mit eigenen Anforderungen macht. Eine galvanisch trennende Schnittstelle ist es nicht, was diese Abhängigkeit vollständig entfernt und einer der Gründe für ihre häufige Bevorzugung in Neuplanungen ist.

**Trennung und Kennzeichnung sind Anforderungen, keine Gepflogenheiten.** Eigensichere Stromkreise werden durchgängig getrennt und erkennbar geführt — Kabel, Verschraubung, Klemme, Rangierung — und diese Disziplin muss jede spätere Änderung überleben, was genau die Stelle ist, an der sie üblicherweise scheitert.

**Alles in diesem Bereich unterliegt den geltenden Normen, den Gerätezertifikaten und der Ex-Dokumentation des Standorts.** Nichts in diesem Beitrag ersetzt sie.

## Eine diagnostizierbare Anlage entwerfen

Diagnostizierbarkeit ist eine Architektureigenschaft, wird zur Entwurfszeit entschieden und lässt sich kaum günstig nachrüsten.

- **Trennklemmen oder Prüfklemmen** im Rangierverteiler, damit ein Kreis ohne Auftrennen von Leitungen partitioniert werden kann.
- **Definierte Einspeisepunkte**, damit ein bekanntes Signal an bekannter Stelle aufgeschaltet und die restliche Kette nachgewiesen werden kann.
- **Kanaldiagnose** aus der E/A — Drahtbruch, Kurzschluss, Bereichsüber- und -unterschreitung — konfiguriert und abgebildet statt in den Voreinstellungen belassen.
- **Gerätediagnose an einer Stelle sichtbar gemacht**, die ein Mensch sieht, statt in einem anzeigelosen Gerät zu verbleiben.
- **Spannungsanzeige an Feldverteilern**, damit die erste Frage jeder Untersuchung ohne Messgerät beantwortbar ist.
- **Ein As-built, das der Wirklichkeit entspricht**, denn eine aus einer falschen Zeichnung abgeleitete Diagnose ist ein verlorener Tag.

## Inbetriebnahme

**Eine Kreisprüfung ist keine Kanalprüfung.** Zu bestätigen, dass eine E/A-Baugruppe einen Strom liest, ist ein Verdrahtungstest. Eine Kreisprüfung bestätigt, dass eine definierte physikalische Eingangsgröße am Messumformer den richtigen Wert, in der richtigen Einheit, mit der richtigen Skalierung und dem richtigen Vorzeichen auf der Anzeige erzeugt, die ein Bediener tatsächlich benutzt — und dass davon getriebene Meldungen und Verriegelungen sich richtig verhalten.

Die Liste vor dem Einschalten und bei der Inbetriebnahme, die sich bezahlt macht:

- Durchgang und Isolationswiderstand an jeder Ader, dokumentiert.
- **Schirmdurchgängigkeit *und* Schirmisolation** — ein Schirm soll auf seiner Strecke durchgehend und außer an seinem definierten Anbindungspunkt von Erde getrennt sein. Beides ist zu prüfen; wer nur den Durchgang prüft, übersieht die versehentliche Verbindung.
- Trennung an der As-built-Trasse geprüft, nicht an der Planungszeichnung.
- Kreiswiderstand gemessen und gegen das Auslegungsbudget verglichen, wo die Signalart eines hat.
- Skalierung und technische Einheiten durchgängig geprüft, einschließlich Vorzeichen und Bereich.
- Gleichtaktspannung zwischen Feld- und Systembezug an einer repräsentativen Auswahl bei laufender Anlage gemessen.
- Diagnose durch Herbeiführen des Zustands geprüft — den Kreis auftrennen und bestätigen, dass die Baugruppe es meldet.
- Jeder Messwert dokumentiert, damit er zur Bezugsgröße wird und nicht zur Erinnerung.

## Dokumentation als Lieferleistung

Ein undokumentiertes messtechnisches System ist nur von dem diagnostizierbar, der es installiert hat — und diese Person geht weiter.

Der Satz, der die Wartbarkeit bestimmt, ist klein: **Kreisschaltbilder**, eine **Kabel- und Klemmenliste**, eine **E/A-Liste mit Skalierung und Meldegrenzen**, das **Schirmkonzept und die Trennkategorien** als geschriebene Regeln, sowie eine **As-built-Nachführdisziplin**, die Änderungen dann erfasst, wenn sie geschehen, und nicht in einem Dokumentationsprojekt drei Jahre später. Das Kennzeichen eines gut geführten Betriebs ist nicht die Güte seiner Erstdokumentation, sondern ob die letzten fünf Änderungen darin erscheinen.

## Fehlermodi

**Schirm als Signalrückleitung verwendet.** Jeder im Schirm induzierte Strom gelangt direkt in die Messung.

**Schutzleiter als Funktionsbezug verwendet.** Fehlerstrom und Stromrichter-Rückstrom erreichen die Null des Messsystems.

**Schirm beidseitig in zwei verschiedene Erdungssysteme aufgelegt.** Eine Verbindung zwischen Systemen, geführt entlang der Signalleitung.

**Gemischtes Schirmkonzept im Betrieb.** Ausgleichsströme überall dort, wo zwei Annahmen aufeinandertreffen.

**Trennung, die an der Verschraubungsplatte endet.** Über den Standort sorgfältig getrennte Kategorien, in einem kleinen Kasten wieder vereint.

**„Getrennt verlegte“ Kabel mit langem gemeinsamem Parallellauf.** An den Enden getrennt, in der Mitte gekoppelt.

**Zweileiter- oder reparierte Dreileiter-Widerstandsthermometer.** Ein stabiler Offset, leicht wegzukalibrieren und schwer zu bemerken.

**Impulseingänge als robust behandelt, weil sie digital sind.** Induzierte Impulse als Daten gezählt; ein Zähler, der Volumen gewinnt.

**Alle Messungen eines Regelkreises auf einem dezentralen E/A-Knoten.** Ein Knotenausfall entfernt den ganzen Kreis.

**Direktauflegung Feld auf Baugruppe ohne Rangierung.** Billig im Bau; jede künftige Änderung berührt die E/A-Baugruppe.

**Feldverteiler mit Verschraubungen auf der Oberseite und ohne Belüftungs-Entwässerung.** Wasser in einem Gehäuse mit ausreichender Schutzart.

**Keine Reserveklemmen in Feldgehäusen.** Das nächste Messgerät erzeugt eine undokumentierte Paralleltopologie.

**Gruppentrennung, gefüllt mit einzeln geerdeten Feldgeräten.** Kanäle stören einander über einen gemeinsamen Bezug, der auf keiner Zeichnung erscheint.

**Trennverstärker gegen ein Gegentaktproblem eingebaut.** Richtiges Gerät, falscher Fehlermodus.

**Gleichtaktbereich überschritten und als Störung behandelt.** Kabel werden umverlegt, um einen Messwert zu korrigieren, der nicht verrauscht, sondern ungültig ist.

**Eigensicheres Kabel aus Verfügbarkeitsgründen ersetzt.** Zertifizierung entwertet, ohne sichtbare Änderung.

**Kreisprüfung an der E/A-Baugruppe statt durchgängig.** Verdrahtung belegt, Messung nicht.

**Schirmdurchgang geprüft, Schirmisolation nicht.** Versehentliche Verbindungen bestehen die Inbetriebnahme.

**As-built nach Änderungen nicht nachgeführt.** Jede spätere Diagnose beginnt bei einer falschen Karte.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Prozessbereich meldet unstete Messwerte an mehreren Analogeingängen eines dezentralen E/A-Knotens. Das Verhalten tritt sporadisch auf, betrifft einige Kanäle des Knotens und andere nicht, und fällt mit dem Betrieb eines großen stromrichtergespeisten Antriebs im selben Bereich zusammen. Die Messtechnik tauscht zwei Messumformer und ein Kabel ohne Besserung.

```text
Symptom:
Erratic analogue readings on some — not all — channels of one remote I/O
node, correlating with the operation of a nearby converter-fed drive.

Evidence:
- the affected channels all come from transmitters whose housings are in
  metallic contact with earthed process pipework at the measurement point
- the unaffected channels on the same node come from devices with isolated
  field connections
- the node uses group isolation: all channels in the affected group share a
  single reference
- measured between the node's reference and the control-room system
  reference, a varying voltage is present, largest while the drive runs
- the instrument multicore shares a cable tray with the drive's output cable
  for a long parallel run, although both are separated at each end
- the multicore screen is landed on a shield bar in the field enclosure and
  also lands on a shield bar in the marshalling cabinet
- the field enclosure is bonded to local structural steel; the marshalling
  cabinet is bonded to the control building earthing
- replacing transmitters and one cable changed nothing

Reasoning:
This is a common-mode problem, not a differential noise problem, which is why
component replacement had no effect. The earthed transmitters impose their
local potential on the shared group reference; the drive's high-frequency
return current circulating in the earthing network makes that local potential
move relative to the control-room reference; and because the channels are
group-isolated rather than channel-isolated, every device in the group sees
the excursion. The isolated devices on the same node do not, which is the
discriminating observation.

Two installation conditions amplify it. The screen bonded at both ends into
two different earthing systems provides a low-impedance path for that
potential difference to drive current directly along the signal cable. And the
long parallel run beside the drive output cable provides capacitive coupling
along its whole length — the separation at the ends is irrelevant to what
happens in between.

Next investigations:
- measure the reference-to-reference voltage under controlled drive operation
  and correlate it with the reading disturbance
- establish the drive's actual high-frequency return path
- review the shield policy for this cable category and confirm which end is
  the defined bonding point
- verify the segregation of the route along its whole length, not at its ends
- evaluate channel-to-channel isolation, or isolated field connections, for
  the transmitters that are earthed at the process
- confirm the input circuits' common-mode range against the measured
  excursion, since exceeding it invalidates the reading rather than
  degrading it
```

**Die übertragbare Lehre lautet: Der unterscheidende Nachweis lag schon am Knoten.** Einige Kanäle waren betroffen und andere nicht, und der Unterschied zwischen ihnen — geerdeter gegenüber getrenntem Feldanschluss — benannte den Mechanismus, bevor irgendetwas gemessen wurde. Ein Betrieb, dessen Wortschatz Gleichtakt von Störung unterscheidet, stellt diese Frage in den ersten zehn Minuten. Ein Betrieb mit nur einem Wort für alles tauscht Messumformer.

## Empfohlene Praxis

- Die fünf Begriffe als fünf getrennte Entscheidungen in die Auslegung schreiben: Schutzerdung, Schirmanbindung, Funktionsbezug, Signalrückleitung und die Gleichtaktanforderung der Eingangskreise.
- Nie einen Schirm als Signalrückleitung und nie einen Schutzleiter als Funktionsbezug verwenden.
- Jedes Kabel einer Signalkategorie zuordnen und je Kategorie Abstände und zulässige Parallellauflängen festlegen.
- Signal und Rückleitung gemeinsam führen, Störertrassen rechtwinklig kreuzen, die Trennung über die gesamte Strecke am As-built prüfen.
- Die E/A-Architektur nach Fehlerdomäne und Änderungskosten wählen, nicht nach Kabelkosten allein, und Signale nach Prozesslogik auf dezentrale Knoten verteilen.
- Rangierung vorsehen, sofern die Anlage nie geändert wird.
- Feldgehäuse ordentlich spezifizieren: Verschraubungslage, Belüftungs-Entwässerung, Tropfschleifen, Klemmentyp für die Vibrationsumgebung und Reservekapazität.
- Die Trennung auch innerhalb der Gehäuse wahren, nicht nur auf der Trasse.
- Je Signalkategorie ein Schirmkonzept festlegen, in die Spezifikation schreiben und in jedem Feldverteiler durchsetzen.
- Die Trenngranularität nach den tatsächlichen Bezugsverhältnissen der Feldgeräte wählen und Kanaltrennung einsetzen, wo Geräte einzeln geerdet sind.
- Von galvanischer Trennung keine Lösung für Gegentaktstörungen erwarten.
- Gleichtaktbereich und Gleichtaktunterdrückung als zwei verschiedene Angaben behandeln und die Bezug-zu-Bezug-Spannung messen, bevor irgendetwas umverlegt wird.
- Vierleiterschaltungen verwenden, wo der Offset zählt, und Dreileiterinstallationen nach jeder Kabelreparatur oder -verlängerung erneut prüfen.
- Die Kabelparameter eigensicherer Stromkreise als Sicherheitsparameter und ihre Trennung als Anforderung behandeln, die jede Änderung überleben muss.
- Diagnostizierbarkeit einplanen: Trennklemmen, Einspeisepunkte, konfigurierte Kanaldiagnose, Spannungsanzeige an Feldverteilern.
- Durchgängig in technischen Einheiten in Betrieb nehmen, die Schirmisolation zusätzlich zum Durchgang prüfen und jeden Messwert als Bezugsgröße dokumentieren.
- Das As-built aktuell halten und die Dokumentationsgüte daran messen, ob die letzten fünf Änderungen darin stehen.

## Fazit

Signalintegrität in der Messtechnik entscheidet sich lange bevor jemand ein Kabel zieht. Sie entscheidet sich, wenn jemand festlegt, ob es Rangierung gibt, ob die Trennung kanal- oder gruppenweise erfolgt, ob das Schirmkonzept geschrieben oder improvisiert ist, ob Feldverteiler konstruiert oder gekauft werden, und ob der Wortschatz des Betriebs ein Gleichtaktproblem von einem verrauschten unterscheiden kann.

Betriebe, die das richtig machen, sind nicht jene mit dem teuersten Kabel. Es sind jene, in denen fünf verschiedene Begriffe fünf verschiedene Namen haben, in denen ein Schirmkonzept als Dokument existiert, in denen das As-built stimmt, und in denen eine Ingenieurin oder ein Ingenieur vor einem unsteten Messwert in den ersten zehn Minuten mit Nachweis sagen kann, welcher der fünf tatsächlich schuld ist.
