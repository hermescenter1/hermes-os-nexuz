# Blindleistungskompensation und Kondensatoranlagen

## Zusammenfassung

Eine Kondensatoranlage leistet eines: Sie stellt Blindleistung örtlich bereit, damit das Netz sie nicht liefern muss. Das ist wirklich wertvoll — es senkt den Strom bei gleicher Wirkleistung, entlastet Kabel- und Transformatorkapazität, verringert Verluste und Spannungsfall und senkt bei vielen Tarifen die Rechnung.

**Oberschwingungsverzerrung verringert sie nicht.** Eine Kompensationsanlage ist kein Filter, und in einem Netz mit nennenswerter verzerrender Last ist sie das Betriebsmittel, das am ehesten durch die Verzerrung Schaden nimmt — und dasjenige, das die Verzerrung über Resonanz am ehesten verschlimmert.

Diese beiden Absätze enthalten das meiste, was in diesem Feld schiefgeht. Der Rest des Beitrags behandelt die Auslegung, die eine Anlage, die zwanzig Jahre lang still Geld spart, von einer trennt, die Sicherungen auslöst, Becher aufwölbt und das Netz lauter macht, als es vor ihrer Installation war.

**Sicherheitshinweis.** Kondensatoren speichern Energie und bleiben nach dem Freischalten gefährlich. Arbeiten erfordern Freischalten, Sichern, die vom Hersteller angegebene Entladezeit, das Feststellen der Spannungsfreiheit an den Klemmen und befähigtes Personal nach den Regeln des Standorts. Entladeeinrichtungen können ausfallen; das Feststellen der Spannungsfreiheit ist nicht optional, und ein Entladewiderstand ersetzt es nicht.

## Verschiebung, Verzerrung und wahrer Leistungsfaktor

Diese Unterscheidung ist die Grundlage jeder richtigen Entscheidung in diesem Beitrag.

```text
S² = P² + Q²                       apparent, active and reactive power
PF_true = P / S                    true (total) power factor, by definition
PF_true ≈ PF_displacement × PF_distortion

  P  = active power (W)          — the power that does work
  Q  = reactive power (var)      — the exchange associated with magnetising
                                   inductance, at the fundamental frequency
  S  = apparent power (VA)       — the product of r.m.s. voltage and current
  PF_displacement = cos φ        — the phase displacement between the
                                   FUNDAMENTAL voltage and current
  PF_distortion                  — the factor accounting for harmonic current

Assumptions and limits:
  - S² = P² + Q² is exact only for sinusoidal conditions; with distortion
    present, an additional distortion power term exists and this simple
    triangle no longer closes
  - cos φ describes only the fundamental; it is NOT the true power factor
    when the current is distorted
  - the product relationship above is the standard engineering decomposition,
    not an exact identity for every waveform
```

**Kondensatoren wirken ausschließlich auf den Verschiebungsanteil.** Sie liefern Blindleistung der Grundschwingung und verbessern cos φ. Für den Verzerrungsfaktor besitzen sie keinen Wirkmechanismus.

**Die praktische Folge — und der häufigste Fehler dieses Feldes:** Misst eine Anlage einen schlechten *wahren* Leistungsfaktor, der überwiegend aus Oberschwingungsstrom stammt — etwa in einem Betrieb voller Gleichrichterlasten —, verbessert der Einbau von Kondensatoren den cos φ, ändert an der gemessenen Scheinleistung womöglich sehr wenig und setzt die Kondensatoren genau dem Oberschwingungsstrom aus, der das Problem verursacht hat.

**Vor jeder Auslegung klären, welcher Anteil defizitär ist.** Eine Messung, die nur „Leistungsfaktor“ meldet, ohne zu sagen, ob Verschiebungs- oder wahrer Faktor, genügt zur Dimensionierung nicht.

## Wo kompensiert wird

| Anordnung | Wo der Blindstrom nicht mehr fließt | Passend für |
| --- | --- | --- |
| **Einzelkompensation** (an der Maschine) | Der gesamte Weg zurück zur Quelle, einschließlich des Maschinenabgangs | Große Motoren mit langen Laufzeiten |
| **Gruppenkompensation** (an MCC oder Unterverteilung) | Alles vor dieser Verteilung | Gemeinsam geschaltete Lastgruppen |
| **Zentralkompensation** (an der Hauptverteilung) | Nur vor der Hauptverteilung | Schwankende Gesamtlast, tarifgetriebene Korrektur |

**Die Zentralkompensation ist am verbreitetsten und entlastet am wenigsten.** Sie senkt den Strom, den Transformator und Netzbetreiber sehen — üblicherweise das, was der Tarif misst —, tut aber nichts für Kabel und Schaltgeräte hinter der Anlage.

**Die Einzelkompensation am Motor birgt eine spezielle Gefahr, die zu beachten ist.** Ein direkt an den Motorklemmen angeschlossener Kondensator bleibt angeschlossen, wenn der Motor im Auslauf abgeschaltet wird. Die Maschine kann sich dann aus dem Kondensator selbst erregen, als Generator wirken und an ihren Klemmen Spannungen über der Nennspannung erzeugen — eine Gefahr für die Isolierung und für jeden, der die Maschine für spannungsfrei hält. Etablierte Praxis ist, solche Kondensatoren konservativ im Verhältnis zum Magnetisierungsbedarf des Motors und nach den Angaben des Motorherstellers zu bemessen, gerade damit sich eine Selbsterregung nicht halten kann. **Bei umrichtergespeisten Maschinen dürfen zwischen Umrichter und Motor überhaupt keine Kondensatoren geschaltet werden.**

## Stufung und Reglerverhalten

Eine automatische Anlage folgt der schwankenden Last durch Zu- und Abschalten von Stufen.

- **Die kleinste Stufe bestimmt die Auflösung.** Die Korrektur kann nur so fein sein wie die kleinste verfügbare Stufe, und der Restwert schwankt um bis zu diesen Betrag.
- **Die Stufenzahl bestimmt die Nachführgüte** — und wie viel Schalttechnik zu warten ist.
- **Zu feine Stufung erzeugt übermäßiges Schalten**, und jeder Schaltvorgang ist eine Beanspruchung des Schützes und ein Transient im Netz.
- **Zu grobe Stufung erzeugt Pendeln** — der Regler schaltet zu, überkompensiert, schaltet ab und beginnt von vorn.

**Der Regler braucht drei richtig eingestellte Dinge, und das dritte geht schief:**

- Einen Sollwert als Leistungsfaktor oder als Blindleistungsvorgabe.
- Eine Hysterese und eine Zeitverzögerung, damit kurzzeitige Lastwechsel keine Schaltvorgänge auslösen.
- **Eine Strommessung, die die Last erfasst und nicht die Kondensatoren.** Der Messwandler muss so angeordnet sein, dass er den gesamten Laststrom einschließlich der kompensierten Last erfasst, und seine Polarität muss stimmen. Ein falsch angeordneter Wandler — der nur einen Teil der Last erfasst oder den Anlagenstrom mitmisst — erzeugt einen Regler, der unsinnig arbeitet: zuschaltet bei Schwachlast, verweigert bei Volllast oder pendelt. Das gehört zu den häufigsten Inbetriebnahmemängeln und ist ohne Messung unsichtbar.

## Schaltbeanspruchung und gespeicherte Energie

**Kondensatorschalten ist eine ungewöhnlich harte Beanspruchung.** Das Zuschalten erzeugt einen hochfrequenten Einschaltstrom, dessen Scheitelwert den Betriebsstrom weit übersteigt, weil sich der Kondensator zunächst wie ein Kurzschluss verhält.

**Das Zuschalten gegen bereits geladene Stufen ist der ungünstigste Fall.** Wird eine Stufe zugeschaltet, während andere bereits am Netz sind, entladen sich die geladenen Kondensatoren über einen sehr niederohmigen Pfad in die neue Stufe und erzeugen einen erheblich höheren Einschaltstrom als das Zuschalten einer einzelnen Stufe aus dem Netz.

Die technischen Antworten:

- **Schütze für Kondensatorbetrieb**, mit Vorladewiderständen und Voreilkontakten zur Begrenzung des Einschaltstroms. Gewöhnliche Schütze verschweißen im Kondensatorbetrieb, und der Ausfall wird meist der Schützqualität zugeschrieben.
- **Dämpfungs- oder Verdrosselungsdrosseln in Reihe zu jeder Stufe**, deren Einschaltstrombegrenzung ein Nebeneffekt ihres eigentlichen Zwecks ist.
- **Statisches Schalten**, wo die Schalthäufigkeit für mechanische Kontakte ungeeignet ist.

**Gespeicherte Energie ist eine Sicherheitsfrage, keine Unannehmlichkeit.** Ein abgeschalteter Kondensator hält Ladung. Entladeeinrichtungen senken die Klemmenspannung innerhalb einer festgelegten Zeit, und eine Stufe darf vor dem Entladen nicht erneut zugeschaltet werden — das Zuschalten eines geladenen Kondensators erzeugt einen heftigen Transienten. Für Arbeiten an der Anlage: freischalten, die vom Hersteller angegebene Entladezeit abwarten und dann **die Spannungsfreiheit an den Klemmen feststellen**. Ein Entladewiderstand ist ein Bauteil, das offen ausfallen kann, und genau dafür existiert die Feststellung.

## Resonanz: der Mechanismus, der aus einer Anlage ein Problem macht

Dieser Abschnitt entscheidet, ob eine Kompensationsanlage in einem modernen Industrienetz ein Gewinn ist.

**Kondensatoranlage und Netzinduktivität bilden einen Parallelschwingkreis.** Bei der Resonanzfrequenz wird die Impedanz, die eine Oberschwingungsstromquelle sieht, groß, und die Oberschwingungsspannung — zusammen mit dem zwischen Kondensatoren und Netz kreisenden Strom — wird weit über das hinaus verstärkt, was die verzerrenden Lasten selbst einspeisen.

Eine Abschätzung, wo diese Resonanz liegt:

```text
h_r ≈ √( S_sc / Q_c )              APPROXIMATE, FOR SCREENING ONLY

  h_r  = resonant harmonic order (dimensionless, relative to the
         fundamental frequency)
  S_sc = short-circuit level at the busbar where the bank is connected (VA)
  Q_c  = reactive power of the connected capacitance at nominal voltage (var)

Assumptions and limits:
  - treats the supply as a simple inductance and the bank as a simple
    capacitance; real networks contain other capacitance (cables, other banks)
    and other inductance, which shift the actual resonance
  - S_sc must be the value at the bank's busbar in the operating configuration
    being considered, and it CHANGES with network configuration
  - this is a screening estimate to identify risk, not a substitute for a
    harmonic study
```

**Zwei Folgen machen das zu mehr als einer akademischen Sorge.**

**Erstens hat eine gestufte Anlage in jeder Stufenkombination eine andere Resonanzordnung.** Schaltet der Regler Stufen, ändert sich die zugeschaltete Kapazität, und die Resonanz wandert. Eine Anlage kann in den meisten Kombinationen völlig unauffällig sein und in einer resonant — was einen Fehler erzeugt, der sporadisch auftritt, mit der Last korreliert und äußerst verwirrend bleibt, bis jemand die Verzerrung mit bewusst zu- und abgeschalteten Stufen misst.

**Zweitens ändert sich die Kurzschlussleistung des Netzes.** Der Betrieb mit einem statt zwei Transformatoren oder am Generator verschiebt die Resonanz. Eine im Normalbetrieb unbedenkliche Anlage kann in der Wartungskonfiguration resonant sein.

**Die erkennbaren Symptome der Resonanz** sind ansprechende Kondensatorsicherungen ohne erkennbaren Anlass, ausfallende oder sich wölbende Kondensatoren, Transformatorerwärmung und -geräusche sowie eine Verzerrung, die sich nach der Installation oder nach dem Zuschalten einer Stufe messbar verschlechtert hat.

## Verdrosselung: was sie bewirkt und was nicht

**Eine verdrosselte Anlage schaltet jeder Kondensatorstufe eine Drossel vor**, so gewählt, dass die Serienresonanz dieses Drossel-Kondensator-Zweigs *unterhalb* der niedrigsten im Netz vorhandenen bedeutsamen Ordnung liegt.

**Die Wirkung:** Oberhalb des Abstimmpunkts verhält sich der Zweig induktiv statt kapazitiv. Da er bei den vorhandenen Ordnungen nicht mehr kapazitiv ist, kann er dort mit dem Netz keine Parallelresonanz bilden. Das Resonanzrisiko wird konstruktiv beseitigt statt in der Hoffnung, dass die betreffende Ordnung im Netz fehlt.

**Drei regelmäßig übersehene Punkte:**

**Eine verdrosselte Anlage ist kein Oberschwingungsfilter.** Sie schützt sich selbst und das Netz vor Resonanz. Sie ist nicht zur Aufnahme von Oberschwingungsstrom ausgelegt, und sie als Oberschwingungsminderung zu spezifizieren ist eine Fehlbezeichnung. Ein **Saugkreis** — bewusst *auf* eine Ordnung abgestimmt, um ihr eine niedrige Impedanz zu bieten und sie aufzunehmen — ist ein anderes Betriebsmittel mit anderer Auslegungsgrundlage und verlangt eine Netzstudie, weil er mit allem an der Schiene wechselwirkt und Oberschwingungsstrom anderer Lasten anziehen kann.

**Verdrosselung erhöht die Spannung am Kondensator.** Die Drosselspannung addiert sich bei Grundfrequenz zur Kondensatorspannung, sodass die Kondensatoren einer verdrosselten Anlage für eine Spannung über der Netznennspannung bemessen sein müssen. Standardkondensatoren in einer verdrosselten Anordnung altern vorzeitig.

**Verdrosselung verändert die abgegebene Blindleistung** gegenüber denselben Kondensatoren ohne Drosseln; die Anlagenleistung ist daher für die verdrosselte Anordnung zu rechnen und nicht aus der Kondensatorbemessung allein.

**Wann verdrosselt wird:** wo nennenswerte verzerrende Last vorhanden oder geplant ist. In einem modernen Industrienetz mit Umrichtern, Gleichrichtern und Elektroniklasten ist Verdrosselung die Normalerwartung und keine Zusatzausstattung. Wo die Lage unklar ist, ist eine Messung des vorhandenen Oberschwingungsspektrums die Entscheidungsgrundlage.

## Kondensatorbelastung, Umgebung und Schutz

**Die Kondensatorimpedanz sinkt mit der Frequenz**, sodass Oberschwingungsspannung überproportionalen Strom in die Kondensatoren treibt. Die Folge ist eine Erwärmung zusätzlich zum Grundschwingungsstrom, und die Schadensfolge — Erwärmung, Dielektrikumsabbau, Aufwölbung, Sicherungsauslösung oder Bersten — ist charakteristisch.

**Überspannung ist der zweite Hauptstressor.** Die Kondensatorlebensdauer hängt stark von der Spannung ab, und dauerhafte Überspannung — einschließlich der systembedingt erhöhten Spannung einer verdrosselten Anordnung und des Spannungsanstiegs durch Überkompensation bei Schwachlast — verkürzt sie.

**Die Temperatur ist der dritte.** Die Lebensdauer sinkt mit der Umgebungstemperatur deutlich, und ein Anlagengehäuse mit Drosseln ist selbst eine Wärmequelle. Lüftung, Filter und Abstände gehören zum Entwurf, und ein zugesetzter Filter ist ein lebensdauerverkürzender Mangel und keine Reinigungsfrage.

**Ein angemessener Anlagenschutz umfasst:**

- Überstromschutz, bemessen für den Anlagenstrom einschließlich Oberschwingungsanteil und Einschaltbeanspruchung.
- **Unsymmetrieschutz** bei mehrelementigen Anlagen, der den Ausfall einzelner Elemente erkennt, bevor die verbleibenden überlastet werden und kaskadierend ausfallen. Das ist der Schutz, der am häufigsten fehlt und am ehesten einen Totalverlust verhindert hätte.
- Überspannungsschutz, da Kondensatoren spannungsempfindlich sind.
- Einzelelementsicherungen, wo die Bauform sie vorsieht.

## Überkompensation, Schwachlast und Generatorbetrieb

**Überkompensation erzeugt einen kapazitiven (voreilenden) Leistungsfaktor**, und ihre Folgen sind nicht spiegelbildlich zum induktiven Betrieb:

- **Spannungsanstieg** am Anschlusspunkt, der Kondensatoren und andere Betriebsmittel belastet.
- **Tarifnachteile in der Gegenrichtung** bei vielen Vertragsgestaltungen.
- **Feste Kompensation bei Schwachlast ist die übliche Ursache.** Eine für Volllast bemessene Anlage ist nachts, an Wochenenden und in Stillständen überdimensioniert, und eine feste Anlage kann nicht abschalten.

**Der Generatorbetrieb verlangt eine ausdrückliche Entwurfsentscheidung.** Die Erregerregelung eines Generators ist darauf ausgelegt, Blindleistung zu liefern, nicht sie aufzunehmen, und ein voreilender Leistungsfaktor kann ihn in Richtung Instabilität oder Erregerverlust treiben. **Etablierte Praxis ist, die Kompensation im Ersatzstrombetrieb abzuschalten oder ausdrücklich zu steuern**, und die Umschaltlogik sollte das umsetzen, statt es dem Gedächtnis des Bedienpersonals zu überlassen.

**Umrichterreiche Anlagen verdienen einen eigenen Warnhinweis.** Der Gleichrichtereingang eines Umrichters weist typischerweise bereits einen hohen *Verschiebungsfaktor* auf — es gibt kaum Grundschwingungsblindleistung zu kompensieren. Ist der gemessene *wahre* Leistungsfaktor dennoch schlecht, stammt das Defizit aus der Verzerrung, und Kondensatoren beheben es nicht, während sie dem verursachenden Oberschwingungsstrom ausgesetzt werden. **Die richtige Reaktion ist eine Oberschwingungsbetrachtung, keine Kompensationsanlage.**

## Inbetriebnahme und Instandhaltung

**Vor der Auslegung messen:**

- Verschiebungsfaktor und wahren Leistungsfaktor getrennt, am vorgesehenen Anschlusspunkt.
- Das Oberschwingungsspektrum bei repräsentativer Last — eine Schwachlastmessung bildet den maßgebenden Zustand nicht ab.
- Die Kurzschlussleistung an der Schiene, in jeder Betriebskonfiguration.
- Das Lastprofil über die Zeit, damit die Stufung der realen Schwankung entspricht und nicht der Spitze.

**Bei der Inbetriebnahme:**

- Anordnung und Polarität des Regler-Messwandlers anhand des beobachteten Verhaltens bei bekannter Laständerung prüfen.
- Bestätigen, dass jede Stufe zu- und abschaltet und die erreichte Korrektur der Stufenleistung entspricht.
- Die Entladung verifizieren: den Spannungsabfall an den Klemmen nach dem Abschalten gegen die angegebene Zeit messen.
- **Die Verzerrung mit bewusst zu- und abgeschalteten Stufen messen**, in allen betriebsmöglichen Konfigurationen. Das ist der praktische Resonanztest und dauert eine Stunde.
- Temperaturen im Gehäuse bei Dauerlast dokumentieren.

**In der Instandhaltung:**

- Auf aufgewölbte Becher, Verfärbungen und angesprochene Sicherungen prüfen — ein ausgefallenes Element in einer ungeschützten Anlage ist die Vorstufe einer Kaskade.
- Entladeeinrichtungen prüfen; sie fallen still aus.
- Lüftungswege und Filter frei halten.
- Schützkontakte prüfen, die eine ungewöhnlich harte Beanspruchung tragen.
- **Die Anlage neu bewerten, sobald verzerrende Last hinzukommt**, denn das Netz, für das sie ausgelegt wurde, existiert nicht mehr.

## Fehlermodi

**Anlage zur Korrektur eines verzerrungsbedingten wahren Leistungsfaktors installiert.** Keine Tarifverbesserung, und die Kondensatoren werden vom Oberschwingungsstrom belastet.

**Unverdrosselte Anlage in einem Netz mit nennenswerter Verzerrung.** Resonanz, Sicherungsauslösungen, Kondensatorausfälle, verschlechterte Verzerrung.

**Verdrosselte Anlage mit Kondensatoren in Standardspannung.** Verkürzte Lebensdauer durch die erhöhte Kondensatorspannung.

**Verdrosselte Anlage als Oberschwingungsminderung spezifiziert.** Sie schützt vor Resonanz; sie nimmt keine Oberschwingungen auf.

**Regler-Messwandler falsch angeordnet oder verpolt.** Die Anlage schaltet unsinnig, und niemand bemerkt es, bis Rechnung oder Ausfälle eintreffen.

**Gewöhnliche Schütze zum Kondensatorschalten verwendet.** Verschweißte Kontakte, der Schützqualität angelastet.

**Stufe vor der Entladung wieder zugeschaltet.** Heftiger Transient, Schaden an Schütz und Kondensator.

**Kein Unsymmetrieschutz an mehrelementiger Anlage.** Ein Element fällt aus, die übrigen werden überlastet, und die Anlage ist verloren.

**Feste Kompensation in einem Betrieb mit Schwachlastphasen.** Überkompensation, voreilender Leistungsfaktor und Spannungsanstieg.

**Anlage im Ersatzstrombetrieb zugeschaltet gelassen.** Voreilender Leistungsfaktor an einer Maschine, die Blindleistung liefern soll.

**Anlage nach dem Zubau von Umrichtern nicht neu bewertet.** Die Resonanzbedingung hat sich geändert, und niemand hat nachgerechnet.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Die Einspeisung einer Verdichterstation wird auf Scheinleistung abgerechnet. Eine Rechnungsprüfung zeigt einen dauerhaft schlechten Leistungsfaktor, und eine automatische Kompensationsanlage wird spezifiziert und an der Hauptverteilung installiert. Die Anlage ist unverdrosselt und nach dem gemessenen Blindleistungsbedarf bemessen.

Nach der Installation verbessert sich der gemessene cos φ erwartungsgemäß. Die abgerechnete Scheinleistung ändert sich kaum. Binnen weniger Monate beginnen Kondensatorsicherungen anzusprechen.

```text
Symptom:
Correction achieved on cos φ, no meaningful reduction in billed kVA,
followed by capacitor fuse operations.

Evidence:
- most of the station load is fed through rectifier front ends
- measured displacement power factor before installation was already
  reasonably high
- measured TRUE power factor before installation was substantially lower
  than the displacement value
- the harmonic current spectrum at the main board shows significant
  content at low orders
- distortion measured with the bank switched out is moderate; with certain
  step combinations connected it rises sharply at one order
- the failed capacitors show thermal signatures rather than mechanical damage

Reasoning:
Two separate findings, with one root. First, the power factor deficit was
mostly a DISTORTION deficit, not a displacement deficit — and capacitors act
only on displacement, which is why cos φ improved while the metered apparent
power did not. Second, adding undetuned capacitance to a network with
significant harmonic sources created a parallel resonance near an order that
is present, which amplified the harmonic current circulating through the
capacitors and overheated them. The step-dependent distortion measurement is
the signature: the resonant order moves as the controller switches steps.

Next investigations:
- confirm the harmonic spectrum and the busbar short-circuit level in each
  operating configuration
- screen the resonant order for each step combination against the measured spectrum
- determine what share of the metered apparent power is attributable to
  distortion rather than displacement
- evaluate detuning the existing bank versus harmonic mitigation at the sources
```

Die Abhilfe hat zwei unabhängige Teile, und beides als ein Problem zu behandeln führt zur falschen Antwort. Die Verdrosselung beseitigt die Resonanz und schützt die Kondensatoren — sie verbessert die abgerechnete Scheinleistung nicht, weil sie keinen Oberschwingungsstrom entfernt. Die Verzerrung selbst zu verringern, an oder nahe den Umrichtern, adressiert die Abrechnung, und das ist ein anderes Projekt mit anderen Kosten.

**Der übertragbare Punkt ist die Unterscheidung, mit der dieser Beitrag beginnt: Kondensatoren korrigieren die Verschiebung. Ist das Defizit Verzerrung, beantwortet eine Kompensationsanlage eine Frage, die die Anlage nicht gestellt hat — und unverdrosselt verschlimmert sie das eigentliche Problem.**

## Empfohlene Praxis

- Vor jeder Auslegung Verschiebungs- und wahren Leistungsfaktor getrennt messen und feststellen, welcher Anteil defizitär ist.
- Wo das Defizit aus der Verzerrung stammt, es als Netzqualitätsproblem behandeln, nicht als Kompensationsaufgabe.
- Einzel-, Gruppen- oder Zentralkompensation danach wählen, wo der Blindstrom enden soll.
- Motor-Einzelkondensatoren konservativ zum Magnetisierungsbedarf nach Herstellerangabe bemessen, um Selbsterregung auszuschließen; nie Kondensatoren zwischen Umrichter und Motor setzen.
- Stufen aus dem gemessenen Lastprofil bemessen, Auflösung gegen Schalthäufigkeit abwägen, mit Hysterese und Verzögerung gegen Pendeln.
- Anordnung und Polarität des Regler-Messwandlers am beobachteten Verhalten prüfen, nicht am Plan.
- Schaltgeräte für Kondensatorbetrieb spezifizieren und das Zuschalten gegen geladene Stufen berücksichtigen.
- Verdrosseln, wo nennenswerte verzerrende Last besteht oder geplant ist, und Kondensatoren für die dabei erhöhte Spannung spezifizieren.
- Eine verdrosselte Anlage nicht als Oberschwingungsminderung bezeichnen; ein Saugkreis ist ein anderes Betriebsmittel mit eigener Studie.
- Die Resonanzordnung für jede Stufenkombination und jede Netzkonfiguration abschätzen, einschließlich Ein-Transformator- und Generatorbetrieb.
- Mehrelementige Anlagen mit Unsymmetrieschutz sowie Überstrom- und Überspannungsschutz ausrüsten.
- Lüftung vorsehen und Filter- und Temperaturpflege als lebensdauerbestimmend behandeln.
- Die Kompensation im Ersatzstrombetrieb per Schaltungslogik abschalten oder steuern, nicht per Anweisung.
- Das Entladeverhalten bei der Inbetriebnahme verifizieren und vor Arbeiten stets die Spannungsfreiheit feststellen, unabhängig von Entladeeinrichtungen.
- Bei der Inbetriebnahme die Verzerrung mit zu- und abgeschalteten Stufen messen und die Anlage bei jedem Zubau verzerrender Last neu bewerten.

## Fazit

Blindleistungskompensation ist eine ausgereifte, wirtschaftliche und gut verstandene Technik, deren Fehlschläge fast ausschließlich daraus entstehen, dass sie auf das falsche Problem angewandt oder in einem Netz installiert wird, für das sie nicht ausgelegt wurde.

Die zwei Fragen, die die meisten dieser Fehlschläge verhindern, sind einfach. Ist das Leistungsfaktordefizit Verschiebung oder Verzerrung — denn Kondensatoren adressieren nur das Erste? Und enthält das Netz Oberschwingungsquellen — denn wenn ja, ist eine unverdrosselte Anlage keine neutrale Ergänzung, sondern ein aktiver Teilnehmer, der Vorhandenes verstärken kann. Beantworten Sie beide mit Messungen, verdrosseln Sie, wenn die Antwort es verlangt, und eine Kompensationsanlage bleibt eines der ruhigsten und wirtschaftlichsten Betriebsmittel im Elektroraum.
