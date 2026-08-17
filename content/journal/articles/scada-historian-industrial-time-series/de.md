# SCADA-Historian-Architektur und industrielle Zeitreihen

## Zusammenfassung

Ein Historian ist keine relationale Datenbank, die zufällig Zeitstempel speichert. Er ist ein System, das für eine Frageform optimiert ist — *was tat dieser Wert zwischen diesen beiden Zeitpunkten* — über sehr viele Signale, über Jahre, mit einer Erfassung, die nicht stehenbleiben darf, wenn der Verbraucher stehenbleibt.

Die Entscheidungen, die bestimmen, ob er diese Frage beantworten kann, fallen zur Projektierungszeit: wie ein Wert als aufzeichnungswürdig gilt, von wessen Uhr der Zeitstempel stammt und was mit den Daten geschieht, während das Archiv nicht erreichbar ist. Alle drei werden getroffen, lange bevor jemand die Frage stellt, für die das Archiv existiert.

## Was ein Historian ist — und was nicht

Vier Systeme werden regelmäßig vermengt, und die Folgen einer falschen Wahl sind strukturell, nicht kosmetisch:

| System | Optimiert für | Charakteristische Frage | Schlecht geeignet für |
| --- | --- | --- | --- |
| Historian | Dichte Zeitreihen über lange Horizonte | „Was tat TI-401 letzten Dienstag?" | Transaktionen, relationale Verknüpfungen |
| Transaktionale Datenbank | Konsistente mehrzeilige Schreibvorgänge | „Welcher Auftrag betrifft dieses Objekt?" | Millionen Messwerte je Messstelle |
| Ereignis-/Nachrichtenspeicher | Diskrete geordnete Datensätze | „Welche Ereignisfolge trat auf?" | Kontinuierliche Analogtrends |
| Analyseplattform | Modellierung über große Datenmengen | „Welche Größen sagen diesen Ausfall vorher?" | Das System of Record zu sein |

Zwei Fehler, die diese Tabelle verhindert:

**Eine transaktionale Datenbank als Historian nutzen.** Das funktioniert im Pilotmaßstab und verschlechtert sich mit wachsender Messwertzahl, weil Zeile-pro-Messwert-Speicherung und Allzweckindizierung nicht das sind, was diese Last braucht.

**Die Analyseplattform als Archiv behandeln.** Analysespeicher werden häufig neu aufgebaut, neu modelliert und migriert. Lebt die maßgebliche Aufzeichnung dort, hängt die Anlagenhistorie an einem System, dessen Lebenszyklus von Data-Science-Werkzeugen bestimmt wird und nicht von den Aufbewahrungspflichten der Anlage.

**Ereignisse gehören zum Trend, sind aber nicht dasselbe.** Ein Trend beantwortet „wie hoch war der Druck"; ein Ereignisdatensatz beantwortet „wann änderte sich der Ventilbefehl und wer gab ihn". Die Rekonstruktion eines Vorfalls braucht beides, korreliert auf gemeinsamer Zeitbasis — das stärkste praktische Argument für eine einzige Zeitquellen-Hierarchie.

## Erfassungsstrategie

Die folgenreichste Projektierungsentscheidung ist, wann ein Messwert überhaupt aufzeichnungswürdig ist.

**Periodische Abtastung** zeichnet in festem Intervall auf, unabhängig von Änderungen. Sie ist im Speicherbedarf vorhersagbar und einfach zu durchdenken — und sie ist bei stabilen Signalen verschwenderisch und blind für schnelle Änderungen zwischen den Abtastungen.

**Ausnahme- bzw. Hysterese-Erfassung** zeichnet nur auf, wenn sich ein Wert um mehr als einen projektierten Betrag vom zuletzt aufgezeichneten entfernt. Ruhige Signale kosten fast nichts; aktive zeichnen mit ihrer natürlichen Rate auf.

Bei der Hysterese werden Archive still ruiniert. Zu eng eingestellt füllt sich das Archiv mit Rauschen und das Speicherwachstum wird unbeherrschbar. Zu weit eingestellt wird **reales Prozessverhalten verworfen und ist nicht wiederherstellbar** — die Daten wurden nie geschrieben.

Die Regel, die beides vermeidet: **Die Hysterese ist aus dem Rauschband der Messung und der kleinsten technisch bedeutsamen Änderung abzuleiten**, nicht als runder Prozentsatz für alle Messstellen zu wählen. Ein Druck mit ±0,02 bar Sensorrauschen und 0,1 bar kleinster bedeutsamer Auslenkung hat eine begründbare Hysterese. Ein anlagenweit angewandtes 1 % ist eine Vermutung, die bei verschiedenen Messstellen in beide Richtungen falsch sein wird.

Eine verwandte Warnung: **Eine Hysterese, die groß genug ist, um einen kurzen Ausschlag zu unterdrücken, macht diesen Ausschlag für immer unsichtbar.** Soll das Archiv Störungsuntersuchungen tragen, verdienen die an Auslösungen beteiligten Messstellen engere Hysteresen als der Rest — oder periodische Erfassung mit prozessgerechter Rate.

## Zeitstempeltreue

Der Zeitstempel ist der Teil eines Messwerts, der am häufigsten auf eine Weise falsch ist, die niemand bemerkt.

Drei Orte der Stempelung, in absteigender Treue:

1. **Am Gerät**, als die Messung entstand. Höchste Treue; setzt Gerätefähigkeit und eine disziplinierte Zeithierarchie voraus.
2. **Am Collector**, beim Abfragen des Werts. Trägt die Abfragezeit, nicht die Ereigniszeit — ein Fehler in Höhe des Abfrageintervalls.
3. **Am Historian**, beim Schreiben. Trägt die Speicherzeit einschließlich Warteschlangen- und Netzverzögerung. Die schlechteste Option und leider mitunter die Voreinstellung.

Die praktische Folge: **Ein Archiv mit Schreibzeit-Stempeln kann keine Ereignisreihenfolge stützen**, denn die aufgezeichnete Reihenfolge ist die des Eintreffens, nicht die des Auftretens. Während einer Störung — genau dann, wenn die Reihenfolge zählt — ist die Eintreffreihenfolge am stärksten verzerrt, weil dann die Warteschlangen am längsten sind.

Zwei unterstützende Entscheidungen:

- **UTC speichern, lokal darstellen.** Lokalzeitspeicherung erzeugt an den Sommerzeitgrenzen jährlich eine mehrdeutige und eine fehlende Stunde, und ein mehrjähriges Archiv enthält beide.
- **Den Quellzeitstempel erhalten statt ihn zu überschreiben.** Kommt ein Wert verspätet über Store-and-Forward, gehört er zu seiner Entstehungszeit abgelegt, nicht zur Ankunftszeit.

## Store-and-Forward

Store-and-Forward entscheidet, ob ein Historian-Ausfall zu einer dauerhaften Datenlücke wird.

Der Collector puffert lokal, solange der Historian nicht erreichbar ist, und sendet nach der Wiederherstellung nach — jeden Messwert mit seinem ursprünglichen Zeitstempel. Damit erzeugt ein zweistündiger Archivausfall eine zweistündige Verzögerung. Ohne ihn erzeugt er ein zweistündiges Loch.

Der Auslegungsparameter ist die **Puffertiefe**, und sie gehört abgeleitet statt voreingestellt: der längste realistische Ausfall — einschließlich eines geplanten Serverwartungsfensters oder eines Wochenendausfalls mit Reaktion am Montag — multipliziert mit der Erfassungsrate. Ein für Minuten dimensionierter Puffer läuft beim ersten echten Vorfall über.

Der so verhinderte Fehler ist der grausamste im Historian-Betrieb: **Genau für die Dauer des Ereignisses fehlen die Daten, die es erklären würden**, weil dieselbe Störung, die die Anlage traf, auch die Erfassung traf.

## Komprimierung und Aufbewahrung

Zwei Mechanismen verringern das gespeicherte Volumen und unterscheiden sich in der Umkehrbarkeit:

**Verlustfreie Speicherkomprimierung** verringert Bytes, ohne Messwerte zu verwerfen. Immer akzeptabel.

**Verlustbehaftete Archivreduktion** — Verfahren vom Typ Swinging Door, die nur die zur Rekonstruktion innerhalb einer Toleranz nötigen Werte behalten — verwirft Daten dauerhaft. Oft ist das richtig, aber es ist eine Entscheidung darüber, welche künftigen Fragen beantwortbar bleiben, und sie gehört als solche getroffen.

Aufbewahrung ist eine gestufte Entscheidung, keine einzelne Zahl:

| Stufe | Typischer Horizont | Treue | Dient |
| --- | --- | --- | --- |
| Online / heiß | Jüngster Betriebszeitraum | Volle erfasste Auflösung | Betrieb, Fehlersuche |
| Nearline | Mittelfristig | Voll oder leicht reduziert | Engineering-Analyse, Trends |
| Archiv | Langfristig | Reduziert oder aggregiert | Compliance, Langzeitanalyse |

Zwei Randbedingungen gehören ausdrücklich abgeglichen: was regulatorische und vertragliche Pflichten aufzubewahren verlangen, und was technische Untersuchungen realistisch brauchen. Wo sie auseinandergehen, gilt die längere Anforderung — und wo eine verlustbehaftete Reduktion vor dem regulatorischen Horizont greift, ist das eine Compliance-Entscheidung, keine Speicheroptimierung.

## Datenqualität

Ein Historian, der nur Werte speichert, verwirft die Information, die zu ihrer Deutung nötig ist. Ein gespeicherter Wert sollte seine Qualität tragen, und Verbraucher sollten sie respektieren.

Die wichtigste Unterscheidung: **Eine Lücke und eine flache Linie sind verschiedene Tatsachen.** Ein Zeitraum mit gescheiterter Erfassung ist unbekannte Datenlage; ein Zeitraum ohne echte Wertänderung ist bekannte. Werden beide als „keine Werte" gespeichert, kann eine Auswertung drei Jahre später nicht unterscheiden, ob der Prozess stabil war oder der Collector stand — und wird meist Ersteres annehmen.

Dasselbe gilt für Aggregate. Ein Mittelwert über ein Fenster mit Erfassungslücke ist der Mittelwert der vorhandenen Werte, dargestellt, als beschriebe er das ganze Fenster. Aggregate sollten eine Vollständigkeitskennung tragen, oder die Lücke muss in dem sichtbar sein, was sie verarbeitet.

## OT/IT-Anbindung

Das tragfähige Muster ist Replikation in eine DMZ, nicht direkter Unternehmenszugriff auf den OT-seitigen Historian:

```text
Enterprise / IT
      |
  Firewall
      |
Industrial DMZ -- historian replica, reporting, analytics feed
      |
  OT firewall     (one-directional replication)
      |
OT zone -- primary historian, collectors, SCADA
      |
PLC / RTU / field devices
```

Drei Gründe, die die zusätzliche Komponente rechtfertigen:

- **Verfügbarkeitsentkopplung.** Eine Berichtsabfrage kann die anlagenseitige Erfassung nicht beeinträchtigen.
- **Lebenszyklus-Unabhängigkeit.** Analysewerkzeuge ändern sich weit häufiger als Prozessleitsysteme und können das ohne Änderungsdiskussion am Leitnetz tun.
- **Zonenintegrität.** Die OT-Zone hat keinen eingehenden Geschäftsverkehr — der praktische Ausdruck des Zone-and-Conduit-Denkens der IEC 62443.

Für die Schnittstelle selbst sind OPC UA und OPC Historical Access die verbreiteten normbasierten Wege, mit derselben Einschränkung wie überall: eine bewusste, dokumentierte Teilmenge veröffentlichen statt der internen Tag-Struktur, sonst wird die interne Benennung zum externen Vertrag.

Die ISA-95-Schichtung ist das nützliche Denkmodell dafür, was wohin gehört — der Historian sitzt an der Grenze, an der Daten der Feldebene zu etwas werden, das das Unternehmen verbraucht, und diese Grenze verdient eine ausdrückliche Schnittstelle statt geteilter Zugangsdaten.

## Fehlerbilder

**Hysterese zu weit.** Reales Prozessverhalten wurde nie aufgezeichnet. Bei einer Untersuchung entdeckt und nicht wiederherstellbar — die Werte existieren nicht.

**Hysterese zu eng.** Der Speicher wächst schneller als geplant; die Aufbewahrung wird gekürzt; Langzeitanalysen werden aus Gründen unmöglich, die mit ihrem Wert nichts zu tun haben.

**Schreibzeit-Stempel.** Ereignisreihenfolge stillschweigend ungültig — und am stärksten verzerrt in genau den Störungen, in denen sie gebraucht wird.

**Kein Store-and-Forward oder voreingestellte Puffertiefe.** Die Lücke liegt genau dort, wo das Ereignis war.

**Lücke nicht von flacher Linie unterscheidbar.** Eine Auswertung schließt auf einen stabilen Prozess, während der Collector stand.

**Historian als Transaktionssystem genutzt.** Aufträge, Chargendaten oder Projektierung in einer Zeitreihen-Engine — weder ihr Zugriffsmuster noch ihr Konsistenzmodell.

**Analyseplattform als Aufzeichnung behandelt.** Anlagenhistorie bei einer Werkzeugmigration neu aufgebaut oder verloren.

## Ein repräsentatives Szenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Eine Pumpstation untersucht eine wiederkehrende Überlastauslösung an einer Förderpumpe. Das Archiv zeigt den Motorstrom bei jedem Ereignis als nahezu flache Linie, ohne sichtbaren Ausschlag.

Zwei Projektierungstatsachen erklären das. Der Motorstrom wurde mit 5 % Hysterese erfasst — als anlagenweite Voreinstellung gewählt —, und die Auslösung beruht auf einer kurzen Stromspitze, die relativ deutlich unter dieser Schwelle, absolut aber deutlich über der mechanischen Grenze liegt. Zweitens liegt das Auslöseereignis mit Gerätezeitstempel im Ereignisprotokoll, während die Stromwerte Collector-Abfragezeiten tragen — beide lassen sich nicht eng genug ausrichten, um zu erkennen, was zuerst kam.

Am Historian ist nichts defekt. Beide Mängel sind Jahre alte Projektierungsentscheidungen, und keiner ist rückwirkend behebbar: Die Werte wurden nie geschrieben, und Zeitstempel lassen sich nachträglich nicht verbessern.

Die Abhilfe wirkt nur vorwärts — Hysterese bei auslöserelevanten Messstellen verengen, wo möglich auf Gerätestempelung wechseln — und die allgemeine Lehre ist die unbequeme: **Der Wert eines Archivs wird durch Entscheidungen bestimmt, die getroffen wurden, bevor jemand wusste, was man einmal von ihm wissen will.**

## Empfohlene Vorgehensweise

- Die Speichertechnologie zur Frageform wählen; keine transaktionale Datenbank als Historian und keinen Analysespeicher als Aufzeichnung.
- Hysterese je Messstelle aus Messrauschen und kleinster bedeutsamer Änderung ableiten; nie einen Prozentsatz anlagenweit anwenden.
- Erfassung bei auslöse- und schutzrelevanten Messstellen verengen.
- Wo möglich am Gerät stempeln; nie auf Schreibzeit-Stempelung verlassen.
- UTC speichern; Quellzeitstempel über Store-and-Forward erhalten.
- Die Puffertiefe aus dem längsten realistischen Ausfall dimensionieren, nicht aus einer Voreinstellung.
- Qualität mit dem Wert speichern und Lücken von konstanten Werten unterscheidbar halten.
- Gestufte Aufbewahrung gegen regulatorische Pflicht und technischen Bedarf festlegen.
- Für Unternehmensverbraucher in eine DMZ replizieren; eine bewusste Schnittstelle veröffentlichen, nicht die interne Tag-Struktur.

## Fazit

Historians versagen leise. Sie stürzen nicht während des Vorfalls ab, für den man sie braucht; es stellt sich lediglich heraus, dass sie das Gesuchte nie aufgezeichnet haben — oder mit einem Zeitstempel, der sich mit nichts anderem ausrichten lässt.

Das macht Historian-Engineering ungewöhnlich: Nahezu sein gesamter Wert entscheidet sich bei der Projektierung, und nahezu keiner der entstehenden Mängel ist später behebbar. Die Entscheidungen, die Zeit verdienen, sind daher die langweiligen — Hysterese je Messstelle, Zeitstempelquelle, Puffertiefe und Aufbewahrungsstufen —, denn sie bestimmen, ob das Archiv eine Frage beantworten kann, die noch niemand gestellt hat.
