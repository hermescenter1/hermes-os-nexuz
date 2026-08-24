# Netzqualität in der Industrie: Oberschwingungen, Flicker und Spannungsstörungen

## Zusammenfassung

„Wir haben ein Netzqualitätsproblem“ ist keine Diagnose. Es ist eine Kategorie, und diese Kategorie enthält Erscheinungen, die fast nichts gemeinsam haben außer der Tatsache, dass sie alle als Abweichung von einer idealen sinusförmigen Versorgung auftreten.

Eine Oberschwingung ist eine stationäre, periodische Verformung der Kurvenform. Ein Spannungseinbruch ist ein kurzzeitiger Verlust an Höhe über wenige Perioden. Flicker ist eine wiederkehrende Schwankung, langsam genug für das menschliche Auge und schnell genug, um zu stören. Eine Transiente ist eine Auslenkung im Bereich von Mikro- bis Millisekunden. Unsymmetrie ist eine Asymmetrie zwischen den Außenleitern. Kommutierungseinbrüche sind eine wiederkehrende hochfrequente Störung, die Stromrichter der Spannung aufprägen. Sie haben andere Ursachen, andere Betroffene, andere Messtechnik und — das ist der Punkt, der Geld kostet — andere Abhilfen. Eine Maßnahme, die eine davon löst, bewirkt für die übrigen typischerweise nichts, und in mindestens einem bekannten Fall verschlimmert sie eine andere.

Dieser Beitrag trennt die Erscheinungen, erklärt, was jede Messung physikalisch zeigen kann, und ordnet jeder die Maßnahme zu, die sie tatsächlich adressiert. Das antriebsspezifische Ein- und Ausgangsverhalten, das vieles davon erzeugt — Eingangsgleichrichterstrom, Ausgangsflanken, Kabel- und Erdungspraxis —, behandelt der Begleitbeitrag zu Antriebsoberschwingungen und EMV; Blindleistungskompensation und Resonanz stehen im Begleitbeitrag zu Kondensatoranlagen. Was folgt, ist die Sicht auf Anlagenebene: was im Netz geschieht, wie man es ehrlich sichtbar macht und was daraus folgt.

## Die Familie, getrennt betrachtet

| Erscheinung | Zeitcharakter | Typischer Ursprung | Stört oder schädigt typischerweise |
| --- | --- | --- | --- |
| **Oberschwingungen** | Stationär, periodisch | Strom nichtlinearer Lasten | Transformatoren, Neutralleiter, Kondensatoren, Motoren |
| **Spannungseinbruch** | Ereignis, Perioden bis Sekunden | Fehler anderswo, Anlauf großer Motoren | Schütze, Antriebe, SPS-Netzteile, Relais |
| **Unterbrechung** | Ereignis, ab wenigen Perioden | Schutzauslösung, Versorgungsverlust | Alles ohne Überbrückung |
| **Flicker** | Wiederkehrend, Sekundenbruchteile bis Sekunden | Zyklische oder schwankende Lasten | Menschliche Wahrnehmung über Beleuchtung |
| **Transiente** | Impuls oder Schwingung, µs bis ms | Blitz, Schalthandlungen | Isolierung, Elektronik, Zwischenkreise |
| **Unsymmetrie** | Stationäre Asymmetrie | Ungleiche einphasige Last, Fehler | Asynchronmotoren, Stromrichter |
| **Kommutierungseinbrüche** | Wiederkehrend, hochfrequent | Netzgeführte Stromrichter | Nulldurchgangserkennung, Elektronik |
| **Frequenzabweichung** | Langsam | Ungleichgewicht Erzeugung/Last | Zeitreferenzen, generatorgespeiste Inseln |

**Zwei Beobachtungen aus dieser Tabelle bestimmen alles Weitere.** Erstens unterscheiden sich die *Betroffenen*. Ein Betrieb, dessen Klage „die Antriebe lösen dauernd aus“ lautet, und einer, dessen Klage „der Transformator läuft heiß“ lautet, beschreiben fast sicher nicht dieselbe Erscheinung. Zweitens verlangen stationäre und ereignishafte Erscheinungen grundlegend verschiedene Messungen — und ein für die eine konfiguriertes Gerät ist für die andere strukturell blind.

## Was das Messfenster sichtbar werden lässt

Dieser Abschnitt entscheidet über den Erfolg einer Untersuchung, und hier scheitern die meisten.

**Ein Netzqualitätsgerät zeichnet die Kurvenform nicht durchgehend auf.** Es berechnet Größen über ein Grundmessintervall und aggregiert diese für die Speicherung zu längeren Intervallen. Der genormte Ansatz — jener, um den die Geräteklassen in IEC 61000-4-30 herum aufgebaut sind — nimmt ein kurzes Grundfenster von wenigen Perioden und aggregiert über Zwischenintervalle bis auf zehn Minuten und zwei Stunden.

**Die Folge ist unmissverständlich: ein auf zehn Minuten aggregierter Effektivwertverlauf kann einen Einbruch von 100 ms nicht zeigen.** Der Einbruch wird in 600 Sekunden normaler Spannung hineingemittelt und verschwindet in einer Kurve, die unauffällig aussieht. Das ist der mit Abstand häufigste Grund, aus dem eine Untersuchung mit „kein Netzqualitätsproblem feststellbar“ endet, während der Prozess weiterhin stehen bleibt.

Vier Regeln folgen daraus, und sie sind nicht optional:

- **Die Ereigniserfassung muss aktiviert und sinnvoll geschwellt sein**, getrennt von der Trendaufzeichnung. Einbrüche, Überhöhungen und Unterbrechungen werden als Ereignisse mit Restspannung und Dauer erfasst, nicht als Trendabtastwerte.
- **Transienten verlangen eine Abtastrate, die die Trendfunktion nicht verwendet.** Ein Gerät, das Oberschwingungen zuverlässig aufzeichnet, erfasst einen Impuls unter Umständen überhaupt nicht. Wird eine Transiente vermutet, muss diese Fähigkeit ausdrücklich vorhanden und ausdrücklich scharfgeschaltet sein.
- **Dort messen, wo der Betroffene sitzt, nicht nur an der Einspeisung.** Sowohl die Spannungsverzerrung als auch die Einbruchstiefe ändern sich über das Netz hinweg. Eine Messung an der Haupteinspeisung beantwortet eine Frage über die Versorgung; eine Messung an der auslösenden Anlage beantwortet die tatsächlich gestellte Frage.
- **Über einen Zeitraum aufzeichnen, der den Betriebszyklus abdeckt.** Eine Zweistundenmessung an einem ruhigen Nachmittag beweist nichts über eine Erscheinung, die beim Schichtwechsel, beim Chargenwechsel oder bei einem bestimmten Produkt auftritt.

**Die Zeitsynchronisation zwischen den Messpunkten macht aus Daten eine Schlussfolgerung.** Zwei synchronisierte Aufzeichner — einer vorgelagert, einer nachgelagert — beantworten die Frage „kam das aus dem Netz oder von uns?“ weit zuverlässiger als jeder Einzelpunktkennwert. Ohne gemeinsame Zeit sind zwei Aufzeichnungen zwei Anekdoten.

**Und schließlich: den Betroffenen genauso aufzeichnen wie die Versorgung.** Das Antriebsfehlerprotokoll, der SPS-Ereigniszeitstempel und die Aufzeichnung des Schutzrelais sind Beweismittel, und ihr Abgleich mit dem Störungszeitstrahl ist es, was Kausalität statt Gleichzeitigkeit belegt. Eine Störung, die häufig auftritt, aber nie mit einer Auslösung zusammenfällt, ist nicht deren Ursache.

## Oberschwingungen: eine Stromerscheinung mit Spannungsfolge

**Die Last zieht nichtsinusförmigen Strom; das Netz macht daraus Spannungsverzerrung.** Wo dieser Strom auf die Impedanz des Netzes trifft, entwickelt er bei jeder Oberschwingungsfrequenz eine Spannung, und die so verzerrte Spannung wird dann jeder anderen Last an derselben Schiene aufgeprägt. Dieser eine Satz enthält die gesamte Zurechnungslogik: Stromverzerrung gehört der Last, die sie erzeugt, und Spannungsverzerrung ist ein gemeinsamer Zustand am Verknüpfungspunkt.

```text
THD_V = √( Σ V_h² ) / V_1   for h = 2, 3, 4, …    voltage distortion
THD_I = √( Σ I_h² ) / I_1   for h = 2, 3, 4, …    current distortion

  V_h, I_h  = r.m.s. value of the harmonic of order h
  V_1, I_1  = r.m.s. value of the fundamental component

Assumptions and limits:
  - THD is defined against the FUNDAMENTAL, so THD_I rises at light load
    even when the absolute harmonic current is falling — a high THD_I on a
    lightly loaded feeder can be harmless
  - demand-referred indices exist precisely to remove that artefact by
    relating harmonic current to a demand current rather than to the
    instantaneous fundamental
  - the summation is truncated at the instrument's highest measured order;
    two instruments with different limits report different THD
  - THD says nothing about WHICH orders are present, and the orders are
    what determine the effect
```

**Welche Ordnungen auftreten, bestimmt die Stromrichtertopologie.** Ein sechspulsiger Gleichrichter erzeugt die charakteristischen Ordnungen h = 6k ± 1, also die 5., 7., 11., 13. und so fort. Eine zwölfpulsige Anordnung hebt die niedrigsten davon auf und lässt h = 12k ± 1 übrig, beginnend bei der 11. **Einphasige Elektroniklasten sind eine andere Population:** Sie erzeugen durch drei teilbare Ordnungen (3., 9., …), die Nullsystemgrößen sind und sich daher im Neutralleiter eines Vierleitersystems *addieren* statt aufzuheben. Deshalb kann ein Neutralleiter in der Verteilung eines Büros oder einer Warte mehr Strom führen als jeder Außenleiter, und deshalb ist eine Dreieckswicklung — die Nullsystemstrom in sich kreisen lässt, statt ihn weiterzugeben — in der Transformatoranordnung von Bedeutung.

**Die Wirkungen sind spezifisch, und jede hat ihren eigenen Mechanismus:**

- **Transformatorerwärmung.** Die Wirbelstromverluste steigen mit der Frequenz stark an, sodass Oberschwingungsstrom einen Transformator weit stärker erwärmt als derselbe Effektivwert bei Grundfrequenz. Ein Transformator, der stark verzerrte Last speist, wird mit Blick darauf ausgewählt — entweder über eine ausgewiesene Belastbarkeit für Oberschwingungslast oder über eine ausdrückliche Leistungsminderung.
- **Neutralleiterüberlastung** durch die genannten durch drei teilbaren Ordnungen, in einem Leiter, der historisch oft kleiner als die Außenleiter ausgeführt wurde.
- **Kondensatorbelastung**, weil die kapazitive Impedanz mit der Frequenz fällt — und, gravierender, die Resonanzwechselwirkung aus dem Kondensatorbeitrag.
- **Motorerwärmung**, da Oberschwingungssysteme Felder erzeugen, die kein nutzbares Drehmoment, wohl aber Verluste hervorbringen.
- **Verhalten von Mess- und Schutztechnik**, wo ein Gerät, das Mittel- oder Spitzenwert statt echten Effektivwert erfasst, auf verzerrter Kurvenform falsch anzeigt.

**Zu Grenzwerten: nicht aus dem Gedächtnis arbeiten.** Es gibt breit angewandte Rahmenwerke für Oberschwingungsgrenzwerte, aber sie sind an einem festgelegten Punkt definiert, sie hängen von Systemgrößen wie dem Kurzschlussverhältnis an diesem Punkt ab, sie unterscheiden Stromgrenzwerte (Verantwortung der Last) von Spannungsgrenzwerten (Zustand des Netzes), und sie unterscheiden sich zwischen Normen und Ausgaben. Der maßgebende Grenzwert für einen Standort steht im Anschlussvertrag und in der anwendbaren Normausgabe — nicht in der Erinnerung an ein früheres Projekt.

## Spannungseinbrüche: die teure Erscheinung

**Nach industrieller Auswirkung sind Spannungseinbrüche meist die dominierende Netzqualitätserscheinung**, und sie sind diejenige, der die Geräte, die man instinktiv kauft, am wenigsten beikommen.

**Die meisten Einbrüche entstehen außerhalb des Werks.** Ein Fehler irgendwo im angeschlossenen Netz drückt die Spannung großflächig, bis der Schutz ihn klärt — deshalb korrelieren Einbrüche mit Wetterlagen und mit Ereignissen in Kilometern Entfernung, und deshalb treten sie gehäuft auf. Im Werk selbst erzeugen der Direktanlauf großer Maschinen und das Zuschalten von Transformatoren eigene Einbrüche.

**Ein Einbruch wird durch Restspannung und Dauer beschrieben** — wie tief, wie lang. Zwei weitere Merkmale sind für empfindliche Betriebsmittel wesentlich: der **Phasenwinkelsprung**, der viele Einbrüche begleitet, und der **Punkt auf der Kurve**, an dem der Einbruch beginnt und endet. Die Empfindlichkeit eines Betriebsmittels wird üblicherweise als Spannungstoleranzhüllkurve ausgedrückt; kurvenbasierte Beschreibungen wie die ITIC/CBEMA-Familie und Gerätespezifikationen wie SEMI F47 für die Halbleiterfertigung existieren genau dafür, Empfindlichkeit zu einer spezifizierbaren statt einer entdeckten Eigenschaft zu machen.

**Die entscheidende ingenieurtechnische Einsicht lautet: Ein Einbruch ist fehlende Energie.** Kein Filter, keine Drossel und kein Kondensator kann sie zurückgeben. Was einen Einbruch überbrücken soll, muss entweder Energie speichern oder deren Fehlen ertragen. Diese Unterscheidung streicht die meisten Produkte, zu denen man beim Thema greift.

**Das schwächste Glied ist fast nie das teuerste Gerät.** Ein Antrieb mit gut geladenem Zwischenkreis und kinetischer Pufferung überbrückt einen Einbruch, den eine schlichte Wechselstrom-Schützspule nicht überbrückt — der Antrieb überlebt, das ihn speisende Schütz fällt ab, und der Prozess steht trotzdem. Praktische Überbrückungsfähigkeit entsteht deshalb zuerst auf der *Steuerungsebene*:

- Die Steuerversorgung stützen — SPS, E/A und Steuerstromkreise —, wo die benötigte Energie klein ist.
- Das Schützabfallen gezielt angehen, über Spulenanordnungen, die den Einbruch vertragen, oder über eine Steuerlogik, die keine ununterbrochene Spule voraussetzt.
- Die Überbrückungsfunktion des Antriebs bewusst nutzen und wissen, was ihr Eingreifen mit dem Prozess macht.
- Den Wiederanlauf entwerfen. Ein Werk, das den Einbruch elektrisch übersteht, aber nicht geordnet wieder anfahren kann, hat aus einem Sekundenereignis eine Stunde Produktionsverlust gemacht.

## Flicker: eine Wahrnehmungs-, keine Elektrogröße

**Flicker ist der einzige Eintrag dieser Familie, der über die menschliche Wahrnehmung definiert ist.** Es ist der Seheindruck, den wiederkehrende Schwankungen der Versorgungsspannung über die Beleuchtung hervorrufen, und die gemessene Größe ist bewusst nicht „Spannungsänderung“, sondern die Stärke der wahrgenommenen Wirkung.

**Ein Flickermeter bildet die Kette Lampe → Auge → Gehirn nach** und liefert Störstärkekennwerte: einen Kurzzeitwert, über zehn Minuten ermittelt, und einen Langzeitwert, der aus zwölf aufeinanderfolgenden Kurzzeitwerten über ein Zweistundenfenster aggregiert wird. Die Skala ist so verankert, dass der Wert Eins der Bezugsschwelle der Wahrnehmbarkeit entspricht, mit der das Gerät kalibriert ist.

**Typische Quellen sind Lasten, die schnell und wiederholt schwanken**, nicht Lasten, die schlicht groß sind: Lichtbogenöfen, Widerstands- und Lichtbogenschweißen, Walzwerke, Brecher, Sägewerke, große Kolbenverdichter und Schalthandlungen an schwankender Erzeugung.

**Zwei Punkte werden regelmäßig verwechselt, und beide sind wesentlich:**

**Flicker ist nicht Oberschwingung, und eine Oberschwingungsmessung erfasst ihn nicht.** Beides kann nebeneinander bestehen — ein Lichtbogenofen erzeugt beides sowie Zwischenharmonische —, aber es sind getrennte Größen mit getrennter Bewertung, und die Minderung des einen mindert das andere nicht.

**Das klassische Flickermeter ist um die Reaktion einer Glühlampe als Bezugslampe herum aufgebaut.** Moderne Beleuchtungstechnologien reagieren auf Spannungsschwankungen nicht identisch, sodass gemessener Kennwert und Beschwerden aus der Produktion in beide Richtungen auseinanderlaufen können. Die Messung bleibt das richtige vertragliche und vergleichende Instrument; sie sollte aber nicht als vollständige Vorhersage dessen gelten, was Menschen unter einer bestimmten installierten Beleuchtungstechnik tatsächlich sehen.

**Die Abhilfe betrifft im Kern die Dynamik der Blindleistung und die Netzsteifigkeit.** Schnelle dynamische Kompensation, ein steiferer Anschluss oder ein eigener Transformator für die störende Last sowie prozessseitige Glättung greifen den Mechanismus an. Eine herkömmliche geschaltete Kondensatoranlage tut das nicht — sie ist für die Schwankung viel zu langsam und war dafür nie gedacht.

## Transienten, Unsymmetrie und Kommutierungseinbrüche

**Transienten** zerfallen in zwei Mechanismen. *Impulsförmige* Transienten sind unidirektionale Auslenkungen aus Blitz oder Schalthandlung und gefährden Isolierung und Elektronik. *Schwingende* Transienten stammen meist aus dem Zuschalten einer Kapazität und sind die klassische Ursache einer Zwischenkreis-Überspannungsauslösung am Antrieb, wenn irgendwo vorgelagert eine Anlage schaltet. Eine nachgelagerte Kapazität kann die eintreffende Transiente verstärken, wenn ihre eigene Resonanzfrequenz in deren Nähe liegt — deshalb tritt der Fehler an einem bestimmten Betriebsmittel auf und nicht gleichmäßig.

Die Abhilfe ist eine abgestimmte Anordnung: Überspannungsschutzgeräte, vom Hauseintritt nach innen gestaffelt und mit einem der Position angemessenen Energieaufnahmevermögen, Netzdrosseln an Stromrichtereingängen und — an der Quelle — Schaltsteuerung an dem Betriebsmittel, das die Transiente erzeugt. **Ein Installationsdetail dominiert die Wirksamkeit von Überspannungsschutzgeräten: die Anschlussleitungslänge.** Die dem geschützten Betriebsmittel tatsächlich zugemutete Spannung ist der Schutzpegel des Geräts zuzüglich des induktiven Spannungsfalls entlang seiner Leitungen während einer steilen Stoßwelle; kurze, direkte, gut angebundene Anschlüsse sind daher keine Ordnungsfrage, sondern Funktion.

**Unsymmetrie** ist eine stationäre Asymmetrie zwischen den drei Außenleitern, beschrieben durch das Verhältnis der Gegensystem- zur Mitsystemkomponente. Ihre industrielle Bedeutung steht in keinem Verhältnis zu ihrer scheinbaren Größe: Eine mäßige Spannungsunsymmetrie treibt in einer Asynchronmaschine eine erheblich größere Stromunsymmetrie, weil die Impedanz der Maschine gegenüber Gegensystemspannung klein ist. Die motorseitigen Folgen und die schutztechnische Antwort behandelt der Begleitbeitrag zum Motorschutz; von der Netzseite her sind die zu suchenden Ursachen ungleiche Verteilung einphasiger Last, eine hochohmige oder sich verschlechternde Verbindung in einem Außenleiter, ein offenes Element oder eine angesprochene Sicherung in einer Kondensatoranlage und eine quellenseitige Asymmetrie. **Unsymmetrie ist nicht Einphasenlauf** — der tatsächliche Verlust eines Außenleiters ist ein Fehlerzustand und kein Qualitätsmerkmal; dagegen wird geschützt, nicht toleriert.

**Kommutierungseinbrüche** entstehen an netzgeführten Stromrichtern: Während der Kommutierung schließt der Stromrichter zwei Außenleiter kurzzeitig über die Netzimpedanz kurz und erzeugt einen wiederkehrenden Einbruch in der Spannungskurve. Seine Tiefe hängt von der Impedanz zwischen Stromrichter und Beobachtungspunkt ab — weshalb eine Netzdrossel den vorgelagert sichtbaren Einbruch verringert und fester Bestandteil der Antwort ist. Kommutierungseinbrüche sind wesentlich, weil sie Betriebsmittel stören, die auf Nulldurchgangserkennung oder saubere Flanken angewiesen sind — Synchronisierschaltungen, manche Zeit- und Steuerelektronik —, und weil ein Spektrum niedriger Ordnungen sie nur schlecht abbildet.

## Die Maßnahme zur Erscheinung passend wählen

| Erscheinung | Was tatsächlich hilft | Was nicht hilft |
| --- | --- | --- |
| **Oberschwingungen** | Drosseln und Zwischenkreisdrosseln, mehrpulsige oder aktive Eingangsstufen, ausgelegte Saugkreise, aktive Filter, entsprechend bemessene Transformatoren | Einfache Kondensatoranlagen, Allzweck-USV, größere Kabel |
| **Spannungseinbrüche** | Gespeicherte Energie, Stützung der Steuerversorgung, Maßnahmen an Schützspulen, Antriebsüberbrückung, entworfener Wiederanlauf | Filter, Drosseln, Kondensatoren |
| **Flicker** | Schnelle dynamische Kompensation, steiferer Anschluss, prozessseitige Glättung | Geschaltete Kondensatoranlagen, Oberschwingungsfilter |
| **Transienten** | Abgestimmte Überspannungsschutzgeräte mit kurzen Leitungen, Netzdrosseln, Schaltsteuerung an der Quelle | Oberschwingungsfilter, Blindleistungskompensation |
| **Unsymmetrie** | Lastumverteilung, Instandsetzung der Verbindung, Korrektur der Anlage, motorseitiger Schutz | Filter, Kondensatoren |
| **Kommutierungseinbrüche** | Netzdrosseln, Trennung empfindlicher Stromkreise, Stromrichtertopologie | Rein trendbasierte Oberschwingungsmessung |

**Eine Zeile verdient Nachdruck, weil sie die teuerste Gewohnheit dieses Feldes ist: Kondensatoren in ein verzerrtes Netz einzubringen.** Blindleistungskompensation und Oberschwingungsminderung sind verschiedene ingenieurtechnische Aufgaben, und eine unverdrosselte Anlage in einem Netz mit nennenswerter verzerrender Last kann die Spannungsverzerrung über Resonanz verschlechtern statt verbessern. Dieser Mechanismus ist im Kondensatorbeitrag vollständig dargestellt; hier genügt: „Blindleistungskompensation“ ist keine Antwort auf einen Oberschwingungsbefund.

## Fehlermodi

**Trend konfiguriert, Ereigniserfassung nicht aktiviert.** Wochen an Daten, die nichts belegen, und das Ergebnis „kein Problem feststellbar“, während der Betrieb weiter stehen bleibt.

**Nur an der Einspeisung gemessen.** Die Störung, die das Betriebsmittel tatsächlich erlebt, wurde nie aufgezeichnet.

**Zwei Stunden an einem ruhigen Tag gemessen.** Der Betriebszustand, der die Erscheinung erzeugt, trat im Messfenster nie auf.

**Keine Zeitsynchronisation zwischen den Messpunkten.** Vor- und nachgelagert sind nicht vergleichbar, die Quelle bleibt unbestimmt.

**Versorgung aufgezeichnet, Betroffener nicht.** Der Zusammenhang zwischen Störung und Auslösung wird behauptet statt gezeigt.

**Hoher THD_I bei Schwachlast als Befund gewertet.** Der Kennwert stieg, weil die Grundschwingung fiel; der absolute Oberschwingungsstrom nicht.

**Oberschwingungsgrenzwerte aus dem Gedächtnis angewandt.** Der falsche Kennwert, am falschen Punkt, aus der falschen Ausgabe.

**Einbrüche als Oberschwingungsproblem diagnostiziert.** Ein Filter wird beschafft, und die Auslösungen bleiben unverändert.

**Überbrückung am Antrieb ausgelegt, nicht am Schütz.** Das teure Betriebsmittel überlebt, die billige Spule nicht, die Produktion steht ohnehin.

**Flickerbeschwerden mit einer geschalteten Kondensatoranlage beantwortet.** Für den Mechanismus bei Weitem zu langsam.

**Überspannungsschutz mit langen, geschlungenen Leitungen installiert.** Das geschützte Betriebsmittel sieht den Schutzpegel zuzüglich eines erheblichen induktiven Spannungsfalls.

**Unsymmetrie nur am Motor untersucht.** Das ausgefallene Kondensatorelement oder die sich verschlechternde Außenleiterverbindung vorgelagert wird nie gefunden.

**Kondensatoren in ein verzerrtes Netz eingebracht, um „die Netzqualität zu verbessern“.** Resonanz, und ein schlechterer Zustand als zuvor.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Eine Verpackungslinie bleibt mehrmals im Monat stehen. Jeder Stillstand ist kurz, kein Betriebsmittel wird beschädigt, und der Wiederanlauf kostet vierzig Minuten Räumen und Neusequenzieren. Eine Netzqualitätsuntersuchung wird beauftragt; der Bericht stellt erhöhte Stromverzerrung auf dem Abgang fest und empfiehlt ein Oberschwingungsfilter. Das Filter wird eingebaut. Die Stillstände gehen unverändert weiter.

```text
Symptom:
Intermittent line stoppages, no damage, unaffected by an installed
harmonic filter.

Evidence:
- the original survey used trend recording only; no dip events were captured
- the drive fault log records DC bus undervoltage at each stoppage
- several stoppage timestamps coincide with regional weather activity
- a second measurement with event capture enabled records short voltage
  dips of a few cycles at the plant incomer, several per week
- a synchronised recorder inside the line panel shows the same events with
  similar residual voltage — the dips are arriving from the supply, not
  being produced within the line
- the elevated current distortion in the original report was measured
  during a low-throughput period; the absolute harmonic current was modest
- the first device to change state at each event is a contactor in the
  infeed section, not the drive

Reasoning:
Two independent errors. The original measurement could not see the actual
phenomenon: a trend-only recording averages a few-cycle dip into a ten-minute
value and shows nothing. And the index it did report — current distortion
relative to a reduced fundamental — was an artefact of light loading rather
than evidence of a harmonic problem. The dips are supply-originated, and the
plant's susceptibility is set by a contactor that releases before the drive
reaches its own undervoltage limit. A harmonic filter cannot address any part
of this, because a dip is an absence of energy and a filter does not store any.

Next investigations:
- characterise the dip population by residual voltage and duration over a
  period covering the full operating cycle
- compare that population against the voltage-tolerance envelope of each
  critical device in the infeed section
- determine which specific elements release first, and at what depth
- evaluate control-supply hold-up and contactor drop-out measures against
  the measured dip population
- design and test a controlled restart sequence, since some dips will always
  exceed whatever tolerance is engineered
```

Die Abhilfe ist gegenüber dem Filter unspektakulär und günstig: die Steuerversorgung stützen, die identifizierten Schütze angehen, die Überbrückungskonfiguration des Antriebs bestätigen und eine Wiederanlaufsequenz bauen, die die Linie in Minuten statt in vierzig Minuten zurück in die Produktion bringt. **Die übertragbare Lehre ist, dass die Gerätekonfiguration die Diagnose bestimmt hat.** Die Erscheinung wurde nicht gemessen, also wurde eine Erscheinung beschuldigt, die gemessen worden war.

## Empfohlene Praxis

- „Netzqualitätsproblem“ als Kategorie behandeln, die vor jeder Gerätespezifikation in eine konkrete Erscheinung aufzulösen ist.
- Zuerst entscheiden, ob die Klage einen stationären Zustand oder ein Ereignis beschreibt, denn das bestimmt Gerät und Konfiguration.
- Ereignis- und Transientenerfassung ausdrücklich aktivieren; eine Trendaufzeichnung ist für Einbrüche und Impulse strukturell blind.
- Am betroffenen Betriebsmittel ebenso messen wie an der Einspeisung und die Aufzeichner zeitlich synchronisieren.
- Über einen Zeitraum aufzeichnen, der den vollständigen Betriebszyklus einschließlich Schicht- und Produktwechsel abdeckt.
- Die Beweismittel des Betroffenen erheben — Antriebsfehlerprotokolle, SPS-Ereigniszeitstempel, Relaisaufzeichnungen — und vor jeder Kausalitätsaussage mit dem Störungszeitstrahl abgleichen.
- Stromverzerrung, die einer Last zurechenbar ist, von Spannungsverzerrung unterscheiden, die ein gemeinsamer Zustand an einem Punkt ist.
- THD im Verhältnis zur Auslastung deuten; ein hohes Verzerrungsverhältnis bei Schwachlast ist nicht automatisch ein Befund.
- Oberschwingungsgrenzwerte aus der anwendbaren Normausgabe und dem Anschlussvertrag am festgelegten Punkt entnehmen, nicht aus dem Gedächtnis.
- Spannungseinbrüche als Energieproblem behandeln und Überbrückung dort aufbauen, wo die nötige Energie am kleinsten ist — auf der Steuerungsebene — bevor Speicher auf Prozessebene erwogen wird.
- Feststellen, welches Betriebsmittel während eines Einbruchs zuerst abfällt, statt anzunehmen, es sei das komplexeste.
- Die Wiederanlaufsequenz entwerfen, denn Toleranz ist endlich und manche Ereignisse überschreiten sie immer.
- Flicker mit einem Flickermeter bewerten, nicht mit einem Oberschwingungsanalysator, und beim Vergleich mit Beschwerden die Glühlampen-Bezugsbasis der Messung mitdenken.
- Überspannungsschutz mit kurzen, direkten, gut angebundenen Leitungen installieren und die Geräte nach Position und Energieaufnahmevermögen staffeln.
- Unsymmetrie im gesamten Netz untersuchen — einphasige Verteilung, Verbindungsgüte, Kondensatorelemente — und nicht nur an dem Motor, der ausgelöst hat.
- Blindleistungskompensation nie als Oberschwingungsminderung behandeln.

## Fazit

Die Disziplin der Netzqualitätsarbeit liegt fast vollständig im ersten Schritt: die Erscheinung zu benennen, bevor die Abhilfe beschafft wird. Jede Erscheinung dieser Familie ist für sich gut verstanden, und die zugehörige Abhilfe ist ausgereift, verfügbar und wirksam. Die Fehlschläge sind Fehlschläge der Identifikation — ein Gerät für stationäre Größen auf ein Ereignisproblem gerichtet, ein wegen der Auslastung falsch gelesener Kennwert, ein Kategoriename, der für eine Diagnose gehalten wird.

Konfigurieren Sie die Messung für die Erscheinung, die Sie tatsächlich vermuten, messen Sie dort, wo das betroffene Betriebsmittel steht, synchronisieren Sie die Uhren und erheben Sie die Beweismittel des Betroffenen neben denen der Versorgung. Tun Sie das, und die Abhilfe wählt sich meist von selbst — und sie ist häufig günstiger, kleiner und gezielter als die, die man ohne diese Arbeit beschafft hätte.
