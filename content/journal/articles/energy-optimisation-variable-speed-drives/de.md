# Energieoptimierung mit drehzahlvariablen Antrieben

## Zusammenfassung

Energievorschläge für Drehzahlregelung stützen sich meist auf eine einzige Zahl: einen Einsparprozentsatz, angewandt auf eine Typenschildleistung, multipliziert mit angenommenen Betriebsstunden. Nahezu jedes enttäuschende Projekt begann mit genau dieser Rechnung, und nahezu jedes erfolgreiche damit, sie zu verwerfen.

**Die Einsparung steckt nicht im Umrichter. Sie steckt in der Differenz zwischen der Energie, die die Maschine über ihr reales Betriebsprofil verbraucht, und der Energie, die dasselbe Betriebsprofil bei variabler Drehzahl erfordert.** Wo die Maschine den größten Teil ihres Lebens bei voller Leistung läuft, kann diese Differenz negativ sein, denn die Verluste des Umrichters fallen an, ob er etwas verlangsamt oder nicht.

Dieser Beitrag handelt davon, jene Differenz ehrlich zu bestimmen — die Physik, die die Einsparung erzeugt, die vier Mechanismen, die sie aufzehren, und die Messdisziplin, die ein reales Ergebnis von einem modellierten trennt.

## Woher die Einsparung tatsächlich kommt

Eine drehzahlfeste Kreiselmaschine, die über Drosselung geregelt wird, erzeugt mehr Förderhöhe als der Prozess braucht, und vernichtet den Überschuss anschließend an einem Ventil oder einer Klappe. Der Motor liefert die Leistung weiterhin; das Ventil wandelt den Überschuss in Turbulenz und Wärme.

Drehzahlregelung entfernt den Überschuss an der Quelle: Das Laufrad leistet weniger, statt volle Arbeit gegen eine Drosselung zu leisten.

Für eine Kreiselmaschine gelten die Skalierungsbeziehungen:

```text
Q2 / Q1 = N2 / N1              flow scales with speed
H2 / H1 = (N2 / N1)^2          head scales with speed squared
P2 / P1 = (N2 / N1)^3          shaft power scales with speed cubed

  Q = flow, H = head, N = rotational speed, P = shaft power
  Subscript 1 = reference condition, 2 = new condition

Assumptions and limits:
  - applies to the MACHINE (pump or fan), not to the installed system
  - assumes geometric similarity and constant efficiency between the
    two conditions, which is an approximation that weakens as speed falls
  - the operating point is set by where the machine curve meets the
    SYSTEM curve; the cube relationship describes the machine, and only
    describes the installation when the system curve passes through the origin
```

**Diese letzte Zeile ist die wichtigste Einschränkung des Fachgebiets** — und diejenige, die aus den meisten Vorschlägen verschwindet.

## Die vier Dinge, die die Einsparung aufzehren

### 1. Statische Förderhöhe

Eine Anlagenkennlinie geht nur dann durch den Ursprung, wenn jeder Anteil des Widerstands vom Förderstrom selbst erzeugt wird. Geodätische Höhe und Behältergegendruck sind das nicht: Sie liegen schon bei null Förderstrom an und bleiben bei jeder Drehzahl bestehen, sodass dieser Anteil der Aufgabe durch Verlangsamen der Maschine nicht verringert werden kann.

```text
H_system = H_static + H_friction(Q)

  H_static   = fixed component: elevation, vessel pressure, back pressure
  H_friction = flow-dependent component, rising with flow
```

Daraus folgen unmittelbar zwei Punkte:

- **Das Gesetz der dritten Potenz überschätzt die Einsparung**, teils erheblich, weil die Maschine die statische Höhe weiter erzeugen muss, wie wenig sie auch fördert.
- **Es gibt eine minimale nutzbare Drehzahl**, unterhalb derer die Maschine weniger Höhe erzeugt als statisch gefordert und der Förderstrom vollständig abreißt. Eine Anlage mit hohem statischem Anteil hat unter Umständen einen weit schmaleren nutzbaren Drehzahlbereich als der Umrichter.

**Eine statisch dominierte Anlage ist kein schlechter Kandidat — aber ihre Einsparung ist aus ihrer eigenen Kennlinie zu rechnen und wird dem Gesetz der dritten Potenz nicht ähneln.**

### 2. Maschinenwirkungsgrad abseits des Auslegungspunkts

Die Ähnlichkeitsgesetze setzen konstanten Wirkungsgrad voraus, was eine Näherung ist. Entfernt sich eine Pumpe von ihrem Bestpunkt — und genau das tut Drehzahlreduktion in einer statisch dominierten Anlage —, sinkt ihr Wirkungsgrad und kompensiert einen Teil der geringeren hydraulischen Leistung. Ein Modell, das die dritte Potenz auf die Wellenleistung anwendet und die Wirkungsgradverschiebung ignoriert, überzeichnet das Ergebnis.

### 3. Mindestdrehzahlen, die der Prozess vorgibt

Es sind harte Grenzen, sie stammen aus der Verfahrenstechnik und nicht aus der Elektrotechnik, und sie streichen regelmäßig genau den unteren Drehzahlbereich, den die Einsparrechnung vorausgesetzt hat:

- **Mindestförderstrom durch eine Pumpe**, um Rezirkulation und thermische Schädigung zu vermeiden.
- **Mindestgeschwindigkeit in einer Rohrleitung**, um Feststoffe in Schwebe zu halten, oder in einem Kanal, um Staub mitzuführen.
- **Mindestluftmenge** für Verbrennung, Trocknung, Kühlung oder Lüftungsanforderungen.
- **Mindestdurchmischung** für Rühr- oder Wärmeübertragungsaufgaben.
- **Mindestkühlluft** für die Arbeitsmaschine oder den Motor selbst.

**Jede davon kann die gerechnete Einsparung unerreichbar machen**, und keine erscheint in einem elektrischen Modell. Man findet sie, indem man die Verfahrenstechnik fragt, nicht indem man die Pumpenkennlinie betrachtet.

### 4. Verluste, die die Umrüstung hinzufügt

Umrichter und Motor bringen Verluste ein oder verschieben sie:

- **Der Umrichter verliert dauerhaft einen Anteil der Leistung**, und dieser Verlust fällt bei jeder Drehzahl an, auch bei voller. Er ist ein dauerhafter Abzug vom Nutzen.
- **Der Motor ist an einem Umrichter etwas weniger effizient** als am Sinusnetz, wegen des zusätzlichen harmonischen Anteils im Motorstrom.
- **Der Motorwirkungsgrad sinkt bei Teillast**, sodass eine Maschine, die überwiegend schwach belastet läuft, unabhängig vom Umrichter in einem ungünstigeren Bereich arbeitet.
- **Die Kühllast steigt**, wo die Umrichterwärme in einen klimatisierten Elektroraum eingebracht wird; ein Teil der eingesparten Energie wird für die Abfuhr der Wärme des einsparenden Geräts aufgewendet.

**Die ehrliche Folge dieses Abschnitts: Eine Maschine, die überwiegend bei oder nahe voller Leistung läuft, spart am Umrichter keine Energie und verbraucht womöglich etwas mehr.** Der Umrichter kann dennoch gerechtfertigt sein — für Prozessregelung, sanftes Anfahren oder Schutz —, nur nicht mit dem Energieargument.

## Das Betriebsprofil ist die ganze Rechnung

Die richtige Methode ist unspektakulär und wird selten befolgt.

**Messen, wie die Maschine tatsächlich läuft.** Nicht der Auslegungsfall, nicht das Typenschild und nicht die Erinnerung des Bedienpersonals. Förderstrom oder Druck sowie die elektrische Aufnahme über einen Zeitraum aufzeichnen, der die reale Streuung abdeckt — Schichten, Produktwechsel, Tag und Nacht, und die jahreszeitlichen Extreme, falls sie zählen.

Dann das Profil aufbauen:

| Betriebsband | Jahresstunden in diesem Band | Heutige Aufnahmeleistung | Aufnahmeleistung bei Drehzahlregelung | Differenz |
| --- | --- | --- | --- | --- |
| Volllast | … | gemessen | gemessen oder modelliert | meist negativ |
| Teillast, hoch | … | gemessen | aus der Anlagenkennlinie modelliert | positiv |
| Teillast, niedrig | … | gemessen | aus der Anlagenkennlinie modelliert | deutlich positiv |
| Aus | … | 0 | 0 | 0 |

**Die Einsparung ist die Summe über diese Tabelle, nicht der Wert einer einzelnen Zeile.** Eine Maschine mit breitem Betriebsbereich und vielen Teillaststunden ist ein hervorragender Kandidat. Eine Maschine mit achttausend Volllaststunden im Jahr ist es nicht, unabhängig von ihrer Größe.

**Eine nützliche Vorprüfung vor jeder Modellierung: Wie weit ist das Drosselorgan geöffnet, und über welchen Anteil des Jahres?** Ein Ventil, das meistens fast ganz offen steht, sagt Ihnen, dass es kaum Überschussenergie zurückzugewinnen gibt.

Für die elektrische Messung selbst:

```text
P = √3 × V × I × PF

  P  = three-phase active power (W)
  V  = line-to-line voltage (V)
  I  = line current (A)
  PF = power factor, defined as P / S (true power factor)

Assumptions and limits:
  - balanced three-phase system
  - PF here must be the TRUE power factor, not the displacement factor;
    with distorting loads the two differ and using the displacement value
    will overstate the real power
  - for a drive input, distortion is significant, so an instrument that
    measures true power directly is preferable to this calculation
```

## Überdimensionierung: die billigere Korrektur, die übersprungen wird

Anlagen, in denen ein Umrichter spektakuläre Einsparungen zu liefern scheint, sind sehr häufig Anlagen mit einer überdimensionierten Maschine, die zum Ausgleich stark gedrosselt wird. Der Umrichter senkt den Verbrauch tatsächlich — und zwar indem er die Folgen eines Auslegungsfehlers verwaltet, statt ihn zu beheben.

Vor der Spezifikation eines Umrichters verdienen die Alternativen einen fairen Vergleich:

- **Laufrad abdrehen oder tauschen**, passend zur tatsächlichen Aufgabe. Günstig, dauerhaft, ohne zusätzliche Komplexität, ohne Leistungselektronik im Betriebspfad.
- **Die Maschine ersetzen**, wo die Fehlanpassung groß ist; das bringt zugleich eine moderne Effizienzklasse und häufig einen kleineren Motor.
- **Die Regelungsphilosophie ändern** — etwa zwei Maschinen staffeln statt eine zu drosseln, oder eine unnötige Druckanforderung stromaufwärts beseitigen.

**Der ehrlich zu ziehende Vergleich: Eine überdimensionierte Maschine bei reduzierter Drehzahl trägt weiterhin die Verluste eines überdimensionierten Motors**, und der Umrichter muss dauerhaft im Teilbereich arbeiten, um auszugleichen, was eine mechanische Änderung einmalig behoben hätte.

Wo die Aufgabe wirklich schwankt, ist der Umrichter die richtige Antwort und das Abdrehen des Laufrads nicht. Wo die Aufgabe konstant und die Maschine zu groß ist, ist der Umrichter ein teurer Weg, die eigentliche Korrektur zu vermeiden.

## Leistungsfaktor, Oberschwingungen und der Rest der Installation

**Der Verschiebungsfaktor am Umrichtereingang ist typischerweise hoch** — Gleichrichter und Zwischenkreis führen dazu, dass der Grundschwingungsstrom nahezu in Phase mit der Spannung liegt. Das wird häufig als Vorteil zitiert und ist für sich genommen irreführend.

**Der wahre Leistungsfaktor ist P/S und schließt die Verzerrung ein.** Ein Umrichter mit stark verzerrtem Strom hat eine Scheinleistung deutlich über dem, was der Verschiebungsfaktor nahelegt; der wahre Leistungsfaktor ist entsprechend niedriger. Wo ein Tarif oder ein Netzbetreiberlimit auf gemessener Scheinleistung oder dem wahren Leistungsfaktor beruht, bringt die Umstellung auf Umrichter nicht die Verbesserung, die der Verschiebungswert verspricht.

**Und die Folgen auf Anlagenebene sind real:**

- Dauerhafter Oberschwingungsstrom, dessen thermische und Resonanzfolgen an anderer Stelle dieser Reihe eigenständig behandelt werden.
- Bestehende Kompensationsanlagen, die vor der Umrüstung korrekt waren und danach resonieren können.
- Zusätzliche Wärme in Elektroräumen — zugleich Kühllast und Deratingfaktor für jedes Gerät darin.

**Das gehört in die Lebenszykluskalkulation, nicht in eine Fußnote.** Eine Umrüstung, die an der Maschine Energie spart und Oberschwingungsminderung sowie zusätzliche Kühlung erfordert, hat eine andere Wirtschaftlichkeit als der ursprüngliche Vorschlag.

## Bypass und betriebliche Abwägungen

**Eine Bypass-Anordnung** — die den Motor bei Umrichterausfall direkt am Netz laufen lässt — lohnt dort, wo Verfügbarkeit schwerer wiegt als das letzte Einsparprozent. Sie erlaubt außerdem Volllastbetrieb ohne Umrichterverluste bei Maschinen, deren Profil lange Volllastphasen enthält.

Weitere Abwägungen, die im Entwurf getroffen und im Betrieb spürbar werden:

- **Der Regelkreis.** Die gedrosselte Maschine hatte ein Ventil als Stellglied; die drehzahlgeregelte hat den Umrichter. Der Kreis muss neu eingestellt werden, und sein Verhalten bei Mindestdrehzahl und beim Übergang in den Stillstand gehört definiert.
- **Zusätzliche Abhängigkeit.** Die Produktion hängt nun an einem leistungselektronischen Gerät mit Parametersatz, Firmwarestand und Ersatzteilstrategie.
- **Messtechnik.** Drehzahlregelung braucht eine vertrauenswürdige Prozessmessung; ein aus schlechtem Signal geregelter Umrichter verschlechtert den Prozess.
- **Bedienverhalten.** Wo zuvor von Hand gedrosselt wurde, muss die neue Regelungsphilosophie verstanden und akzeptiert werden — sonst wird das Ventil einfach wieder geschlossen, während der Umrichter mit voller Drehzahl läuft: ein Ergebnis, das energetisch negativ und zugleich schwer zu entdecken ist.

## Messung und Nachweis

Der Unterschied zwischen behaupteter und nachgewiesener Einsparung ist eine vor Beginn vereinbarte Methode.

**Zuerst eine Basislinie erheben.** Die elektrische Aufnahme der bestehenden Maschine gegen ihre Prozessleistung — Förderstrom, Druck, Produktionsrate — über einen repräsentativen Zeitraum messen. Eine in einer untypischen Woche erhobene Basislinie erzeugt eine Zahl, über die jahrelang gestritten wird.

**Die Nachweismethode vorab vereinbaren**, einschließlich:

- Messpunkte und Instrumente und wer für sie verantwortlich ist.
- Die Normierungsgröße — Produktionsrate, Umgebungstemperatur, Durchsatz, Jahreszeit —, denn rohe Kilowattstunden über eine Periode mit veränderter Produktion zu vergleichen beweist nichts.
- Den Vergleichszeitraum, lang genug, um dieselbe Streuung wie die Basislinie abzudecken.
- Was als Erfolg gilt, als Bandbreite formuliert statt als Punktwert.

**Danach dasselbe messen.** Der häufigste Nachweisfehler ist der Vergleich eines modellierten „Vorher“ mit einem gemessenen „Nachher“ — oder einer Sommer-Basislinie mit einem Winterergebnis.

**Das Profil aufbewahren.** Das Betriebsprofil, das die Investition begründet hat, ist zugleich die Referenz, um spätere Abweichungen zu erkennen — eine geänderte Einstellung, ein wieder geschlossenes Ventil, eine angehobene Mindestdrehzahl —, die die Einsparung still beseitigen.

## Fehlermodi

**Gesetz der dritten Potenz auf eine statisch dominierte Anlage angewandt.** Das Modell verspricht weit mehr, als die Physik zulässt.

**Mindestdrehzahlgrenzen erst nach der Installation entdeckt.** Der nutzbare Bereich ist ein Bruchteil des angenommenen.

**Maschine läuft den größten Teil des Jahres auf Volllast.** Die Umrichterverluste machen das Ergebnis negativ.

**Überdimensionierte Maschine bleibt überdimensioniert.** Der Umrichter kompensiert dauerhaft eine einmalige mechanische Korrektur.

**Verschiebungsfaktor als wahrer Leistungsfaktor zitiert.** Der Tarifvorteil bleibt aus.

**Bestehende Kompensation nicht neu bewertet.** Resonanz zeigt sich Monate später.

**Kühlung des Elektroraums nicht nachgerechnet.** Ein Teil der Einsparung geht für die Abfuhr der Umrichterwärme drauf.

**Regelkreis nicht neu eingestellt.** Instabilität oder Rückkehr zur Handdrosselung bei voller Drehzahl.

**Keine Basislinie gemessen.** Das Ergebnis lässt sich nicht zeigen, nur behaupten.

**Nachweis gegen einen anderen Betriebszeitraum.** Der Vergleich ist in beide Richtungen bedeutungslos.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Wasserversorger rüstet eine Transportpumpstation auf Drehzahlregelung um. Der Business Case beruht auf dem Gesetz der dritten Potenz, angewandt auf die Nennbedingungen der Pumpen, unterstellt Betrieb über einen weiten Förderbereich und prognostiziert eine hohe Jahreseinsparung.

Nach einem Jahr ist der gemessene Verbrauch gesunken — um einen Bruchteil der Prognose.

```text
Symptom:
Measured energy saving substantially below the projected figure.

Evidence:
- the station lifts water to a reservoir at a fixed elevation
- measured discharge pressure at reduced flow falls only slightly
- pump speed rarely goes below roughly three-quarters of rated
- below that speed, delivered flow collapses toward zero
- input power at reduced flow is well above the cube-law prediction
- drive input power at full speed is slightly above the previous
  direct-on-line figure for the same duty

Reasoning:
The system is static-head dominated. Most of the head is elevation,
which does not reduce with speed, so the machine must maintain nearly
full head across the flow range and the cube relationship does not
describe this installation. The narrow usable speed range is the same
physics seen from the other side: below the speed at which the pump
generates the static head, no flow is delivered at all. The full-speed
figure reflects the drive's own losses, which the original model omitted.

Next investigations:
- construct the actual system curve, separating static and friction head
- recompute the saving from the measured duty profile against that curve
- confirm minimum-flow and velocity constraints from process requirements
- assess whether pump selection or staging, rather than speed, matches the duty
```

Nichts ist gescheitert. Die Umrichter arbeiten korrekt, die Pumpen sind in Ordnung, und eine reale Einsparung wurde erzielt. Falsch war das Modell: Eine Beziehung, die eine Maschine beschreibt, wurde auf eine Installation angewandt, deren Anlagenkennlinie nicht durch den Ursprung geht.

**Die Abhilfe ist analytisch statt physisch** — Neuberechnung gegen die reale Anlagenkennlinie und die Prüfung, ob die Staffelung zweier Maschinen dieser Aufgabe besser entspricht als die Modulation einer. Der übertragbare Punkt: Derselbe Umrichter hätte an einer reibungsdominierten Anlage nahezu die Prognose erreicht, und der Unterschied zwischen beiden Ergebnissen war entschieden, bevor irgendein Gerät beschafft wurde.

## Empfohlene Praxis

- Vor jeder Modellierung das tatsächliche Betriebsprofil messen; Förderstrom, Druck und elektrische Aufnahme über einen repräsentativen Zeitraum aufzeichnen.
- Die Anlagenkennlinie aufstellen und statische von Reibungsförderhöhe trennen; das Gesetz der dritten Potenz nur bei vernachlässigbarem statischem Anteil ansetzen.
- Mindestdrehzahlgrenzen mit der Verfahrenstechnik klären, bevor ein Drehzahlbereich angenommen wird.
- Umrichterverluste, Motorwirkungsgrad bei Teillast und zusätzliche Raumkühlung als dauerhafte Abzüge einrechnen.
- Kandidaten danach vorprüfen, wie weit das Drosselorgan offen ist und über welchen Anteil des Jahres.
- Vor der Umrichterspezifikation die Alternativen vergleichen — Laufrad abdrehen, richtige Auslegung, Staffelung, Beseitigung unnötiger Druckanforderungen.
- In Tarif- oder Scheinleistungsargumenten den wahren Leistungsfaktor verwenden, nicht den Verschiebungsfaktor.
- Bestehende Kompensationsanlagen und die Raumkühlung als Teil der Umrüstung neu bewerten.
- Einen Bypass vorsehen, wo Verfügbarkeit zählt oder lange Volllastphasen zu erwarten sind.
- Den Regelkreis neu einstellen und das Verhalten bei Mindestdrehzahl und im Stillstand definieren.
- Mess- und Nachweismethode, Normierungsgröße und Vergleichszeitraum vor Beginn vereinbaren.
- Das Betriebsprofil als Referenz für spätere Abweichungen aufbewahren.

## Fazit

Drehzahlvariable Antriebe sparen Energie, indem sie eine Verschwendung beseitigen, die nur in manchen Anlagen existiert. Wo eine Maschine den größten Teil ihres Lebens stark gedrosselt wird, ist die Verschwendung groß und der Umrichter gewinnt das meiste davon zurück. Wo die Maschine nahe Volllast läuft, gibt es wenig zurückzugewinnen, und die Umrüstung fügt Verluste hinzu.

Die Ingenieurarbeit, die beide Fälle trennt, ist nicht anspruchsvoll: das Betriebsprofil messen, die reale Anlagenkennlinie aufstellen, die Mindestdrehzahlen beim Prozess erfragen, die zusätzlichen Verluste abziehen und vorab vereinbaren, wie das Ergebnis nachgewiesen wird. Projekte, die das tun, liefern Ergebnisse, die einer Prüfung standhalten. Projekte, die mit einem Prozentsatz und einem Typenschild beginnen, liefern eine Zahl, die jahrelang verteidigt werden muss.
