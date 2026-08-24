# Oberschwingungen, EMV und Motorleitungen bei Frequenzumrichtern

## Zusammenfassung

Zwei völlig verschiedene physikalische Probleme werden unter „Umrichterstörungen“ abgelegt, und ihre Vermengung ist der Grund, weshalb Gegenmaßnahmen so oft danebengreifen.

**Auf der Eingangsseite** entnimmt der Gleichrichter Strom in Impulsen statt sinusförmig. Das ist ein niederfrequentes Netzqualitätsproblem, gemessen in Ordnungszahlen der Netzfrequenz, und seine Folgen sind Erwärmung, Resonanz und Beeinflussung anderer Betriebsmittel am selben Netz.

**Auf der Ausgangsseite** schaltet der Wechselrichter schnell und erzeugt steile Spannungsflanken sowie einen hochfrequenten Strom, der zu seiner Quelle zurückfinden muss. Das ist ein Problem der elektromagnetischen Verträglichkeit, gemessen in Nanosekunden und Megahertz, und seine Folgen sind Isolationsbelastung, Lagerschäden und Störung benachbarter Signalkreise.

Andere Mechanismen, andere Maßnahmen, andere Messungen. Dieser Beitrag behandelt beides getrennt und verzichtet bewusst auf zitierte Grenzwerte, weil diese von der Installation, der angewandten Norm und dem Verknüpfungspunkt abhängen — alles Dinge, die für den konkreten Standort ermittelt und nicht anderswoher übernommen gehören.

## Die Eingangsseite: woher der Oberschwingungsstrom kommt

Ein üblicher Umrichter gleichrichtet das Netz auf einen von Kapazität gestützten Zwischenkreis. Strom fließt nur, solange die Netzspannung die Zwischenkreisspannung übersteigt — statt einer Sinuskurve entnimmt der Umrichter also kurze, hohe Spitzen nahe den Spannungsscheiteln. In eine Fourierreihe zerlegt, enthält dieser Impulsverlauf die Grundschwingung und einen charakteristischen Satz höherer Ordnungen.

**Die wichtigste Unterscheidung dieses Feldes:**

- **Der Oberschwingungsstrom ist eine Eigenschaft der Last.** Der Umrichter entnimmt ihn unabhängig davon, woran er hängt.
- **Die Spannungsverzerrung ist eine Eigenschaft der Installation.** Sie entsteht, wenn der Oberschwingungsstrom durch die Netzimpedanz fließt. Derselbe Umrichter erzeugt an einem steifen Netz weniger Spannungsverzerrung als an einem weichen.

**Deshalb kann die Stromverzerrungsangabe eines Umrichters allein die Frage „verursacht das hier ein Problem“ nicht beantworten.** Die Antwort hängt von der Netzimpedanz ab, von der Menge sonstiger verzerrender Last und davon, was sonst angeschlossen ist. Es ist eine Systemrechnung.

**Eine zweite Falle verdient einen Namen: eine Verzerrung, ausgedrückt als Prozentsatz des tatsächlichen Stroms, kann bei Teillast irreführen.** Ein schwach belasteter Umrichter kann eine hohe prozentuale Verzerrung zeigen, während sein absoluter Oberschwingungsstrom klein und harmlos ist. Prozentwerte aus verschiedenen Lastpunkten zu vergleichen vergleicht nichts. Wo ein Urteil zählt, arbeitet man mit Oberschwingungsstrombeträgen und der daraus folgenden Spannungsverzerrung.

## Was Oberschwingungen tatsächlich bewirken

Die Folgen sind mechanisch und thermisch, nicht abstrakt:

| Wirkung | Mechanismus |
| --- | --- |
| Transformatorerwärmung | Zusatzverluste durch Oberschwingungsströme; Wirbelstromverluste steigen stark mit der Frequenz |
| Kabelerwärmung | Höherer Effektivstrom für dieselbe Nutzleistung, dazu Skineffekt bei höheren Ordnungen |
| Kondensatorbelastung | Die Kondensatorimpedanz sinkt mit der Frequenz, sodass Oberschwingungsspannung überproportionalen Strom treibt |
| Resonanz | Zusammenspiel von Netzinduktivität und installierter Kapazität, das eine Ordnung verstärkt |
| Fehlfunktion | Schutz und Messung verhalten sich an verzerrten Kurvenformen unerwartet |
| Motorerwärmung | Wo Motoren direkt aus einem verzerrten Netz gespeist werden, nicht über einen Umrichter |

**Die Resonanz verdient Nachdruck, weil sie aus einer akzeptablen Lage eine schädigende macht — und weil der Auslöser meist eine Maßnahme zur Verbesserung ist.**

Blindleistungskompensationskondensatoren bilden mit der Induktivität des speisenden Transformators einen Parallelschwingkreis. Dessen Resonanzfrequenz folgt aus Kapazität und Netzinduktivität. Liegt sie nahe einer Ordnung, die die Installation tatsächlich erzeugt, wird die Schleifenimpedanz bei dieser Ordnung groß, und die Oberschwingungsspannung — sowie der zwischen Kondensator und Netz kreisende Strom — wird weit über das hinaus verstärkt, was der Umrichter selbst einspeist.

**Die praktischen Folgen sind wiedererkennbar:** ansprechende Kondensatorsicherungen ohne erkennbaren Anlass, ausfallende oder sich wölbende Kondensatoren, Erwärmung und Geräusche am Transformator und eine Verzerrung, die sich nach dem Zuschalten von Kondensatoren *verschlechtert* hat.

Die ingenieurtechnische Antwort ist nicht der Verzicht auf Kompensation, sondern deren Verdrosselung: Eine Drossel in Reihe zu jeder Kondensatorstufe verschiebt die Resonanzfrequenz unter die niedrigste bedeutsame Ordnung, sodass der Kreis bei keiner vorhandenen Ordnung resonieren kann. Jede Installation, die nennenswerte Kapazität mit nennenswerter oberschwingungserzeugender Last verbindet, braucht diese Betrachtung ausdrücklich.

## Maßnahmen auf der Eingangsseite, in Eskalationsreihenfolge

Die Maßnahme gehört dorthin, wo das Problem sitzt — ein Umrichter, eine Verteilung oder die gesamte Installation.

- **Netzdrossel oder Zwischenkreisdrossel.** Bringt Impedanz in Reihe zum Gleichrichter, verlängert und senkt den Stromimpuls und verringert den Oberschwingungsgehalt. Günstig, klein, und sie schützt den Umrichter zusätzlich vor Netztransienten. Der Preis ist ein kleiner Spannungsfall und zusätzliche Verluste. Wo nichts anderes vorgesehen ist, wäre dies meist die erste Maßnahme gewesen.
- **Mehrpulsanordnungen.** Zwei Gleichrichterzweige über einen phasenverschiebenden Transformator zu speisen löscht bestimmte Ordnungen durch Gegenphasigkeit. Wirksam und gut verstanden; der Preis sind Transformator, Bauraum und Empfindlichkeit gegenüber Netzunsymmetrie, die die Löschung verschlechtert.
- **Passive Saugkreise.** Ein auf eine Ordnung abgestimmter L-C-Zweig bietet dieser eine niedrige Impedanz. Wirksam bei dieser Ordnung — und ein aktiver Teilnehmer im System: Ein Saugkreis kann Oberschwingungsstrom anderer Lasten derselben Schiene anziehen, und sein Verhalten ändert sich mit Kapazität und Last der Anlage. Er gehört in eine Studie, nicht in eine Katalogauswahl.
- **Aktiver Oberschwingungsfilter oder aktiver Netzstromrichter.** Entweder wird ein Kompensationsstrom eingespeist oder der Umrichter selbst entnimmt nahezu sinusförmigen Strom. Am flexibelsten und am teuersten; der aktive Netzstromrichter erlaubt zusätzlich Rückspeisung, was der eigentliche Grund seiner Wahl sein kann.

**Die Ebene wählen, die zur Problemebene passt.** Ein einzelner auffälliger Umrichter rechtfertigt keinen anlagenweiten Filter, und ein anlagenweites Verzerrungsproblem löst keine Drossel an einer Maschine.

## Die Ausgangsseite: steile Flanken und ein Strom, der zurück muss

Der Wechselrichter erzeugt die Motorspannung durch schnelles Umschalten zwischen den Zwischenkreisschienen. Das Ergebnis sind steilflankige Impulse, und daraus folgen zwei verschiedene Erscheinungen.

### Wellenreflexion und Motorisolation

Eine Motorleitung ist eine Leitung mit eigenem Wellenwiderstand. Der Motor stellt eine deutlich höhere Impedanz dar. Trifft ein steilflankiger Impuls auf diese Fehlanpassung, wird er reflektiert, und die reflektierte Welle überlagert sich der ankommenden — **die Spannung an den Motorklemmen kann die Umrichterausgangsspannung damit erheblich übersteigen.**

Zwei Größen bestimmen die Schwere:

- **Die Anstiegszeit.** Schnellere Flanken verschlimmern den Effekt und lassen ihn schon bei kürzeren Leitungen auftreten.
- **Die Leitungslänge.** Jenseits einer Länge, die von Anstiegszeit und Ausbreitungsgeschwindigkeit abhängt, trifft die Reflexion ein, während die Flanke noch steigt, und das Überschwingen nähert sich seinem Maximum.

Die Belastung trifft die ersten Windungen der Wicklung, und die Ausfallart ist eine fortschreitende Isolationsschädigung mit anschließendem Wicklungsfehler, der von außen wie ein Qualitätsproblem des Motors aussieht.

**Maßnahmen, vom Günstigsten an:** die Leitung kurz halten; einen für Umrichterbetrieb bemessenen Motor verwenden; eine du/dt-Drossel zur Flankenverflachung einsetzen; bei langen Strecken oder gewöhnlichen Motoren ein Sinusfilter zur Rekonstruktion einer nahezu sinusförmigen Ausgangsspannung vorsehen. Hersteller nennen maximale Leitungslängen mit und ohne Filter — diese Angabe ist die Entwurfsgrenze und gehört dem Gerät entnommen, nicht angenommen.

### Gleichtaktstrom und sein Rückweg

Das Schalten erzeugt außerdem eine Gleichtaktspannung — eine Verschiebung des gesamten Drehstromsystems gegenüber Erde. Da Kapazität von Wicklungen und Leitung gegen Erde besteht, treibt diese Spannung einen hochfrequenten Strom nach Erde. **Dieser Strom kehrt auf irgendeinem Weg zum Umrichter zurück; der Entwurf entscheidet, auf welchem.**

Bietet der Entwurf einen Weg niedriger Impedanz — eine symmetrische geschirmte Motorleitung, an beiden Enden rundum aufgelegt —, kehrt der Strom über den Schirm nahe den verursachenden Leitern zurück, und die Schleifenfläche bleibt klein.

Bietet er ihn nicht, sucht der Strom sich einen anderen Weg: durch die Motorlager, über Maschinenrahmen und Stahlbau, über die Erdleiter anderer Betriebsmittel oder über die Schirme von Signal- und Netzwerkleitungen, die zufällig dieselbe Trasse teilen. Jeder dieser Wege ist ein Symptom, dessen Diagnose Wochen kostet.

**Deshalb ist die Schirmauflage nicht kosmetisch.** Ein über einen kurzen Beidraht einseitig aufgelegter Schirm ist bei diesen Frequenzen eine Induktivität und bietet keinen Rückweg. Die rundum geschlossene Auflage an Umrichter *und* Motor ist der Mechanismus — und eine der wenigen EMV-Maßnahmen, die an beiden Enden ausgeführt werden muss.

## Lagerströme

Lagerschäden an umrichtergespeisten Motoren haben zwei Hauptmechanismen, die verschiedene Gegenmaßnahmen verlangen.

**Entladeströme.** Die Gleichtaktspannung liegt über dem Schmierfilm zwischen Wälzkörpern und Laufbahn. Solange der Film isoliert, baut sich Spannung auf; bricht er durch, entlädt es sich kurz. Millionenfach wiederholt erodieren diese Entladungen die Laufbahn, erzeugen das typische Riffelmuster und schließlich den Ausfall.

**Kreisströme.** In größeren Maschinen induziert hochfrequente Flussunsymmetrie eine Spannung längs der Welle, die einen Strom im Kreis aus Welle, Lagern und Gehäuse treibt. Dieser Mechanismus wächst mit der Baugröße.

**Maßnahmen nach Mechanismus:**

- Ein isoliertes Lager — üblicherweise an der Nichtantriebsseite — unterbricht den Kreisstrompfad.
- Eine Wellenerdungsbürste oder ein Erdungsring bietet einen niederimpedanten Weg am Lager vorbei.
- Ein Gleichtaktkern oder ein Sinusfilter verringert die Ursache, statt sie umzuleiten.
- Korrekte geschirmte Leitung mit rundum geschlossener Auflage verringert den verfügbaren Strom.

**Die diagnostische Signatur lohnt das Wiedererkennen:** Motoren, die in wiederkehrenden Abständen ausfallen, mit Lager- statt Wicklungsschaden, an umrichtergespeisten Anwendungen — besonders wo die Motorleitung ungeschirmt ist oder der Schirm über einen Beidraht aufgelegt wurde. Dieses Muster ist ein Entwurfsbefund und kein Schmier- oder Lieferantenproblem, und ewig im selben Takt Lager zu tauschen ist die teure Alternative zur Behebung.

## Verkabelung, Trassenführung und Hochfrequenzerdung

- **Den vom Umrichterhersteller spezifizierten Leitungstyp verwenden**, und zwar über die gesamte Länge. Eine geschirmte Leitung, die die letzten Meter in der Maschine ungeschirmt weitergeht, ist genau dort ungeschirmt, wo die Kopplung zählt.
- **Symmetrischer Aufbau zählt.** Leitungen mit symmetrisch angeordneten Schutzleitern halten die Stromverteilung ausgewogen und verringern das äußere Feld.
- **Motorleitungen von Signal-, Mess- und Netzwerkleitungen trennen.** Die Motorleitung ist die störintensivste Leitung der Anlage. Getrennte Kanäle, getrennte Pritschen, und wo Kreuzungen unvermeidlich sind, rechtwinklig kreuzen.
- **Hochfrequenzerdung ist nicht dasselbe wie Schutzerdung.** Ein langer, dünner Schutzleiter genügt dem Fehlerschutz vollkommen und ist bei Megahertz nutzlos, weil seine Induktivität dominiert. Hochfrequente Anbindung verlangt kurze, breite, induktivitätsarme Verbindungen zu einer gemeinsamen metallischen Struktur — mit dem Gehäuse verbundene Montageplatten, blanke Kontaktflächen, verbundene Kabelpritschen.
- **Ableitstrom.** EMV-Filter führen konstruktionsbedingt einen dauerhaften Ableitstrom nach Erde. Das hat Folgen für die Auswahl von Fehlerstromschutzeinrichtungen und für die Bemessung von Erdleitern und ist eine häufige Ursache unerklärter Auslösungen, wenn Umrichter an Stromkreise kommen, deren Schutzorgan für eine andere Lastart gewählt wurde.

## Inbetriebnahme und Messung

**Vorher messen, nicht nur nachher.** Eine Basislinie von Spannungsverzerrung und Stromverlauf vor der Installation von Umrichtern — oder vor jeder Erweiterung — macht aus einer späteren Diskussion eine Analyse. Es ist dieselbe Disziplin wie die Baseline von Netzwerkzählern und wird aus denselben Gründen übersprungen.

Was sich zu messen lohnt und welche Frage jede Messung beantwortet:

| Messung | Beantwortete Frage |
| --- | --- |
| Eingangsstromverlauf und Oberschwingungsspektrum bei Nennlast | Was entnimmt der Umrichter tatsächlich? |
| Spannungsverzerrung am Verknüpfungspunkt | Was erlebt die Installation, was sehen andere Verbraucher? |
| Verzerrung mit und ohne zugeschaltete Kondensatorstufen | Gibt es eine Resonanz, und bei welcher Ordnung? |
| Transformator- und Kabeltemperatur unter Last | Ist die Oberschwingungserwärmung praktisch relevant? |
| Klemmenspannung des Motors, mit für die Flankenzeiten geeigneter Messtechnik | Liegt das Reflexionsüberschwingen im Rahmen des Motors? |
| Durchgang von Anbindung und Schirm, beide Enden | Hat der Gleichtaktstrom seinen vorgesehenen Weg? |
| Ableitstrom nach Erde | Ist die Schutzorganauswahl verträglich? |

**Zwei Vorbehalte.** Oberschwingungsmessungen sind lastabhängig; eine Messung bei geringer Last sagt wenig über den relevanten Zustand. Und Messungen in diesen Frequenzbereichen verlangen geeignete Messtechnik und — sofern spannungsführende Anlagen betroffen sind — qualifiziertes Personal nach den Verfahren des Standorts.

## Fehlersuche nach Mechanismus

| Symptom | Wahrscheinlicher Mechanismus | Bereich |
| --- | --- | --- |
| Kondensatorsicherungen sprechen an, Kondensatoren fallen aus | Resonanz verstärkt eine Ordnung | Eingangsseite |
| Verzerrung nach Zuschalten von Kondensatoren schlechter | Durch die Kapazität eingeführte Resonanz | Eingangsseite |
| Transformator heiß bei normalem Effektivstrom | Oberschwingungsverluste | Eingangsseite |
| Wiederholte Lagerausfälle in ähnlichem Abstand | Gleichtaktentladung oder Kreisstrom | Ausgangsseite |
| Wicklungsschäden an langen Leitungen | Überspannung durch Wellenreflexion | Ausgangsseite |
| Mess- oder Netzwerkstörungen, sobald ein Umrichter läuft | Gleichtaktstrom auf ungewolltem Rückweg | Ausgangsseite |
| Fehlerstromschutz löst beim Anlauf aus | Ableitstrom des EMV-Filters | Installation |
| Motorgeräusch ändert sich mit der Taktfrequenz | PWM-Oberschwingungen im Motor | Ausgangsseite |

**Das Denkmuster: Symptome auf der Netzseite des Umrichters deuten auf niederfrequente Oberschwingungen; Symptome am Motor, an den Lagern oder in benachbarten Signalkreisen auf hochfrequenten Gleichtakt und du/dt.** Zu klären, auf welche Seite ein Symptom gehört, streicht die Hälfte der möglichen Ursachen vor der ersten Messung.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein petrochemischer Standort stellt mehrere große Pumpen auf Drehzahlregelung um, um die Regelgüte zu verbessern und Energie zu sparen. Die Umrichter sind korrekt dimensioniert und jeweils mit einer Netzdrossel ausgestattet. Die Inbetriebnahme verläuft ereignislos, die Einsparungen stellen sich ein.

Vier Monate später verliert der Standort Kondensatorsicherungen in der Blindleistungskompensation derselben Schaltanlage. Zwei Kondensatoren werden getauscht. Der speisende Transformator wird als heißer und lauter als zuvor gemeldet, wenn auch innerhalb seiner Bemessung.

Die Belege ordnen sich sauber, sobald die richtige Messung erfolgt. Die Spannungsverzerrung an der Schaltanlage wird mit zu- und abgeschalteter Kompensation gemessen. **Bei abgeschalteter Kompensation ist die Verzerrung moderat und passend zu Oberschwingungsstrom und Netzimpedanz. Mit zugeschalteter Kompensation steigt die Verzerrung bei einer bestimmten Ordnung stark an.** Das ist die Signatur einer Parallelresonanz: Kapazität der Kompensation und Induktivität des Transformators resonieren nahe einer Ordnung, die die Umrichter tatsächlich erzeugen, und der entstehende Kreisstrom fließt zwischen Kondensatoren und Netz.

Nichts ist defekt. Die Umrichter erzeugen den Oberschwingungsstrom, den sie immer erzeugen würden; die Kompensation ist seit Jahren in Betrieb und war völlig angemessen, bevor es an dieser Schiene Oberschwingungsquellen gab. **Beide waren einzeln richtig und gemeinsam unverträglich, und niemand hat die Kompensation beim Ergänzen der Umrichter neu betrachtet.**

Die Abhilfe ist die Verdrosselung — Drosseln in Reihe zu jeder Kondensatorstufe, sodass die Resonanzfrequenz unter der niedrigsten bedeutsamen Ordnung liegt — nach einer Studie, die vorhandene Ordnungen, Stufen und Netzimpedanz ermittelt. Kondensatoren in der bestehenden Anordnung zu tauschen hätte sich unbegrenzt fortgesetzt.

**Der übertragbare Punkt wiederholt sich, sobald sich eine Installation ändert: Eine oberschwingungserzeugende Last hinzuzufügen verändert die elektrische Umgebung jedes anderen Betriebsmittels an dieser Schiene — und die Kompensationsanlage ist die Komponente, die das am ehesten zuerst bemerkt.**

## Empfohlene Praxis

- Die beiden Probleme ausdrücklich trennen: niederfrequente Oberschwingungen am Eingang, hochfrequente EMV am Ausgang. Getrennt diagnostizieren und mindern.
- Stromverzerrung als Eigenschaft des Umrichters, Spannungsverzerrung als Eigenschaft der Installation behandeln; gegen die reale Netzimpedanz bewerten.
- Oberschwingungsstrombeträge vergleichen, nicht Prozentwerte aus verschiedenen Lastpunkten.
- Jede Installation mit Kompensationskondensatoren und oberschwingungserzeugender Last auf Resonanz prüfen und gegebenenfalls verdrosseln.
- Netz- oder Zwischenkreisdrosseln als erste Standardmaßnahme vorsehen; auf Basis einer Studie zu Mehrpuls-, Passiv- oder Aktivlösungen eskalieren.
- Die Maßnahmenebene an die Problemebene anpassen — ein Umrichter, eine Schiene oder die Installation.
- Vor der Installation von Umrichtern und vor jeder Erweiterung eine Netzqualitäts-Basislinie aufnehmen.
- Leitungslänge gegen die Herstellerangabe prüfen; umrichtertaugliche Motoren, du/dt-Drosseln oder Sinusfilter vorsehen, wo sie erreicht oder überschritten wird.
- Die spezifizierte symmetrische Schirmleitung über die gesamte Strecke einsetzen, an Umrichter und Motor rundum aufgelegt.
- Kurze, breite, induktivitätsarme Hochfrequenzanbindungen schaffen; für EMV nicht auf den Schutzleiter vertrauen.
- Lagerströme nach Mechanismus angehen: isoliertes Lager gegen Kreisstrom, Wellenerdung gegen Entladung, Filter zur Quellenreduktion.
- Motorleitungen von Signal- und Netzwerktrassen trennen; unvermeidbare Kreuzungen rechtwinklig ausführen.
- Den Ableitstrom der EMV-Filter bei Auswahl der Fehlerstromschutzeinrichtung und Bemessung der Erdleiter berücksichtigen.
- Bei realistischer Last, mit geeigneter Messtechnik und durch qualifiziertes Personal messen.

## Fazit

Umrichter benehmen sich nicht schlecht; sie verhalten sich genau so, wie es ihre Leistungselektronik verlangt, und die Installation kommt dem entgegen — oder entdeckt es. Dieses Entgegenkommen teilt sich sauber an einer Frequenzgrenze: darunter lautet die Frage, wie viel Oberschwingungsstrom in welche Impedanz fließt und ob etwas in der Anlage damit resoniert. Darüber lautet sie, wie steil die Flanken sind und ob der hochfrequente Strom einen definierten Rückweg hat.

Nahezu jede teure Überraschung dieses Feldes entsteht daraus, eine dieser beiden Fragen für die andere zu halten — einen Eingangsfilter gegen Lagerschäden einzubauen, die Motorqualität für ein Reflexionsproblem verantwortlich zu machen oder einer Installation Kondensatoren hinzuzufügen, die gerade Oberschwingungsquellen bekommen hat. Ist die Trennung richtig, sind die Maßnahmen gewöhnliches Engineering: eine Drossel, eine verdrosselte Kompensation, die spezifizierte Leitung und ein an beiden Enden sauber aufgelegter Schirm.
