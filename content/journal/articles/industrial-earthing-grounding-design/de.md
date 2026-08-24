# Erdung und Potentialausgleich in Industrieanlagen

## Zusammenfassung

„Erde“ ist ein einzelnes Wort für mindestens fünf verschiedene ingenieurtechnische Aufgaben. Sie haben unterschiedliche Zwecke, unterschiedliche Auslegungsregeln, unterschiedliche Prüfverfahren und unterschiedliche Folgen im Versagensfall. In vielen Anlagen teilen sie sich Leiter, und sie teilen sich immer die Begriffe — und dieser geteilte Wortschatz ist der Ursprung der meisten ernsten Fehler dieses Fachgebiets.

Die fünf sind: die **Schutzerdung**, die einen Fehlerstrompfad bereitstellt, damit Schutzeinrichtungen ansprechen; der **Potentialausgleich**, der die Spannungsdifferenz zwischen gleichzeitig berührbaren Teilen begrenzt; die **Systemerdung**, die das Verhältnis der aktiven Leiter zur Erde festlegt und damit bestimmt, was bei einem Erdschluss geschieht; die **Funktionserdung**, die einen Bezug für Messung und Signalübertragung bereitstellt; und die **Blitz- und Stoßstromableitung**, die energiereichen Transienten einen kontrollierten Weg gibt.

Ein sechster Punkt gehört nur deshalb in diese Aufzählung, um aus ihr ausgeschlossen zu werden. **Der Neutralleiter ist ein aktiver Leiter.** Er ist keine Erde, kein Potentialausgleichsleiter und kein Signalbezug — und ihn für eines davon zu halten, ist der folgenreichste Irrtum dieses Themas.

Dieser Beitrag trennt die Aufgaben, arbeitet die Systemarten durch, die das Verhalten bei Erdschluss bestimmen, erklärt, was ein Erder tatsächlich leistet, und behandelt die Bezugs- und Schirmfragen, über die Elektro- und Steuerungstechnik streiten. Die hochfrequente Erdung von Antriebsinstallationen und die Schirmpraxis von Messkreisen stehen in den Begleitbeiträgen zu Antriebs-EMV und zu 4–20-mA-Kreisen; hier geht es um die anlagenweite Sicht.

**Sicherheitsgrenze.** Alles hier Beschriebene ist Auslegungs- und Prüfhinweis. Zur Erdungsprüfung gehören Messungen, die im spannungsfreien Zustand durchzuführen sind, Messungen, die bestimmte Geräte und Verfahren verlangen, und Messungen, deren fehlerhafte Ausführung gefährlich ist. All das ist Arbeit befähigter Personen unter dem sicheren Arbeitssystem des Standorts und der geltenden nationalen Norm. Was hier steht, beschreibt Entwurf und Nachweis — es beschreibt an keiner Stelle Tätigkeiten an aktiven Teilen.

## Fünf Aufgaben, ein Wort

| Funktion | Wozu sie dient | Wie ihr Versagen aussieht |
| --- | --- | --- |
| **Schutzerdung (PE)** | Niederimpedanter Fehlerpfad, damit der Schutz abschaltet | Fehler besteht fort, berührbares Metall bleibt gefährlich |
| **Potentialausgleich** | Alles Berührbare auf gleichem Potential | Gefährliche Spannung zwischen zwei berührten Flächen |
| **Systemerdung** | Legt das Verhältnis aktiver Leiter zur Erde fest | Falsche Schutzmaßnahme für die Systemart gewählt |
| **Funktionserdung** | Stabiler Bezug für Messung und Signale | Störungen, Drift, nicht wiederholbare Messwerte |
| **Blitz- und Stoßstromableitung** | Kontrollierter Weg für energiereiche Transienten | Überschlag, Gerätezerstörung, Näherungsüberschläge |

**Die entscheidende Eigenschaft dieser Tabelle ist, dass ein Leiter mehrere Funktionen tragen kann, während er nur die Anforderungen einer einzigen erfüllt.** Ein Schutzleiter, der als Fehlerpfad völlig ausreichend ist, kann ein schlechter Signalbezug sein, weil er Fehlerstrom und Störungen führt und weil seine Impedanz bei hoher Frequenz in keinem Verhältnis zu seiner Impedanz bei Netzfrequenz steht. Umgekehrt hat ein für einen sauberen Bezug gewählter Leiter keine Schutzaufgabe und darf für eine solche niemals herangezogen werden.

## Der Neutralleiter ist keine Erde

**Im Normalbetrieb führt der Neutralleiter Strom.** In einem symmetrischen Drehstromsystem wenig, in einem unsymmetrischen die Unsymmetrie, und in einem System mit einphasigen Elektroniklasten kann er erheblichen durch drei teilbaren Oberschwingungsstrom führen. Weil er Strom führt, entwickelt er über seine Länge eine Spannung — der Neutralleiter an einer Unterverteilung liegt also nicht auf demselben Potential wie der Neutralleiter an der Quelle.

Daraus folgen drei Dinge, die viel vom beobachteten Anlagenverhalten erklären:

**Alles, was auf den Neutralleiter bezogen ist, wandert mit.** Messtechnik, Steuerkreisbezüge und Messsysteme, die an einen Neutralleiter gebunden sind, erben jede Spannung, die dieser entwickelt.

**Ein kombinierter Neutral- und Schutzleiter legt diesen Strom auf das Schutzsystem.** Wo sich beide Funktionen einen Leiter teilen (ein PEN-Leiter, das TN-C-System), fließt Laststrom in demselben Leiter, der auch die berührbaren Metallteile einbindet, und die von diesem Strom erzeugten Potentialdifferenzen erscheinen an den Metallteilen der Anlage.

**Ein unterbrochener PEN-Leiter ist eine schwere Gefahr.** Öffnet sich der kombinierte Leiter, können daran angeschlossene Körper in Richtung Außenleiterpotential steigen, und es gibt keine Schutzeinrichtung, deren normale Funktion das erkennt.

**Die daraus folgende Regel ist eindeutig: Sind Neutral- und Schutzleiter einmal getrennt, werden sie nachgelagert nie wieder verbunden.** Eine einzige Wiederverbindung — eine nachgerüstete Verteilung mit gesetzter Brücke, eine Maschine mit gebrücktem N und PE, eine für eine andere Systemart verdrahtete Steckdose — bringt Laststrom dauerhaft in das Schutz- und Potentialausgleichssystem. Sie meldet sich meist nicht als Sicherheitsalarm, sondern als unerklärliches Störungsproblem oder als messbarer Strom in einem Potentialausgleichsleiter — weshalb dieser elektrische Fehler häufig von der Steuerungstechnik gefunden wird.

## Systemarten und was sie entscheiden

Die Systemart bestimmt, wie viel Strom bei einem Erdschluss fließt, und damit, welche Schutzmaßnahme ihn erkennen kann. **Das ist eine Auslegungsentscheidung, die der Auswahl der Schutzgeräte vorausgeht, nicht umgekehrt.**

| Systemart | Rückweg des Erdschlussstroms | Was den ersten Fehler klären muss | Charakteristische Folge |
| --- | --- | --- | --- |
| **TN-S** | Metallischer PE-Leiter zurück zur Quelle | Überstromschutz oder Fehlerstromschutz | Hoher Fehlerstrom, schnelle Abschaltung, sauberer Bezug |
| **TN-C** | Kombinierter PEN-Leiter | Überstromschutz | Laststrom auf dem Schutzsystem; kein Fehlerstromschutz vor der Trennung möglich |
| **TN-C-S** | PEN bis zur Trennstelle, danach getrennter PE | Nach der Trennstelle wie TN-S | Nur korrekt, wenn die Trennung einmal erfolgt und nie aufgehoben wird |
| **TT** | Über Anlagenerder, Erdreich und Quellenerder | Fehlerstromschutz | Schleifenimpedanz ist für Überstromgeräte normalerweise viel zu hoch |
| **IT** | Kein gewollter niederimpedanter Pfad; erster Fehlerstrom klein | Nichts schaltet ab — der Fehler wird erkannt und gemeldet | Versorgungskontinuität bleibt erhalten; der zweite Fehler ist der gefährliche |

**Im TN-System fließt der Fehlerstrom metallisch zurück**, ein Erdschluss verhält sich also elektrisch wie ein Kurzschluss, und das Überstromgerät sieht ihn. Deshalb ist TN der industrielle Normalfall: Der ohnehin vorhandene Schutz erledigt die Aufgabe — vorausgesetzt, die Schleifenimpedanz ist niedrig genug, damit das Gerät innerhalb der geforderten Zeit anspricht. **Diese Voraussetzung ist eine Messung, keine Annahme** — die Fehlerschleifenimpedanz wird bei der Inbetriebnahme und nach jeder Änderung nachgewiesen, denn ein verlängerter Stromkreis oder eine zusätzliche Abzweigstelle kann einen zuvor konformen Kreis ohne sichtbare Veränderung aus der Konformität schieben.

**Im TT-System verläuft die Fehlerschleife durch das Erdreich**, und Erdreich ist bei diesen Impedanzen in keinem nützlichen Sinn ein Leiter. Die Schleifenimpedanz ist normalerweise viel zu hoch, als dass ein Überstromgerät ansprechen könnte — deshalb ist **der Fehlerstromschutz in TT-Anlagen die wesentliche Schutzmaßnahme** und keine wahlfreie Ergänzung.

**Im IT-System ist die Quelle nicht starr geerdet** — sie ist entweder von Erde getrennt oder über eine hohe Impedanz angebunden. Ein erster Erdschluss treibt daher nur einen kleinen Strom und schafft für sich keine gefährliche Lage, sodass die Anlage weiterläuft. Genau diese Eigenschaft ist der ganze Grund für diese Systemart: Sie wird eingesetzt, wo eine ungeplante Abschaltung weniger hinnehmbar ist als ein kontrolliertes Herunterfahren zu einem gewählten Zeitpunkt, etwa in kontinuierlichen Prozessen und bestimmten kritischen Anlagen.

**Die Pflichten, die mit einem IT-System einhergehen, werden regelmäßig vergessen.** Der erste Fehler muss *erkannt* werden, was eine ständige Isolationsüberwachung und ein Reaktionsverfahren erfordert — ein IT-System mit überbrückter oder unbeachteter Isolationsüberwachung ist stillschweigend zu einem ungeerdeten System ohne Fehleranzeige geworden. Der erste Fehler muss anschließend *gefunden und behoben* werden, denn solange er besteht, ist das System praktisch geerdet, und ein zweiter Fehler an einem anderen Außenleiter erzeugt einen Fehler zwischen Außenleitern über die Schutzleiter. **Ein IT-System, dessen erster Fehler als zu quittierende Meldung statt als zu behebender Mangel behandelt wird, läuft auf seiner letzten verbliebenen Schutzebene.**

## Der Erder: was er leistet und was nicht

Dieser Abschnitt korrigiert das hartnäckigste Missverständnis des Fachgebiets.

**In einer TN-Anlage klärt der Erder keine Erdschlüsse.** Das tut der Schutzleiter. Die Aufgaben des Erders sind, das Potentialverhältnis des Systems zur Erde herzustellen, Blitz- und Stoßenergie einen Weg zu geben und als Bezug zu dienen — alles wesentlich, und nichts davon ist „Fehlerstrom ins Erdreich leiten“. Eine Anlage mit hervorragendem Erder und mangelhaftem Schutzleiter ist gefährlich; eine Anlage mit bescheidenem Erder und intaktem, nachgewiesenem Schutzsystem ist es nicht.

**In einer TT-Anlage ist der Erder tatsächlich Teil der Fehlerschleife**, weshalb sein Zustand dort in einer Weise zählt wie sonst nirgends — und weshalb der Fehlerstromschutz, der auf keine niedrige Schleifenimpedanz angewiesen ist, den eigentlichen Schutz liefert.

**Es gibt keinen allgemeingültigen Zielwert für den Erdungswiderstand.** Der erforderliche Wert hängt davon ab, wofür der Erder da ist — Blitzschutzfunktion, Abschaltbedingung einer TT-Anlage, Funktionsbezug, eine bestimmte Normanforderung für eine bestimmte Anlagenart — sowie vom spezifischen Erdwiderstand, der Erdergeometrie und den geltenden nationalen Regeln. Eine erinnerte Zahl aus einem früheren Projekt ist keine Auslegungsgrundlage. **Der richtige Wert ist der aus der anwendbaren Anforderung für die tatsächliche Funktion abgeleitete, und er gehört in die Auslegung, nicht in die Gewohnheit.**

**Der Erdungswiderstand ist keine Konstante.** Er ändert sich mit Bodenfeuchte und Temperatur, sodass eine Inbetriebnahmemessung bei nassen Verhältnissen deutlich besser ausfallen kann als derselbe Erder in einer Trockenperiode. Eine Auslegung, die ihre Anforderung am Prüftag nur knapp erfüllt, erfüllt sie nicht ganzjährig.

**Einen Erder zu messen heißt, das Gemessene zu isolieren.** Ein Erder, der mit der Anlage, dem Stahlbau, Kabelbewehrungen und metallenen Versorgungsleitungen verbunden ist, wird parallel zu all dem gemessen, und der abgelesene Wert ist der Widerstand dieses ganzen Netzwerks — oft eine beruhigend kleine Zahl, die über den Erder nichts aussagt. Eine aussagekräftige Messung verlangt entweder eine sachgerechte Trennung unter einem kontrollierten Verfahren oder ein Messverfahren, das für angeschlossene Erder ausgelegt ist. **Ein niedriger Wert an einem angeschlossenen Erder belegt nicht, dass der Erder gut ist; er belegt, dass noch etwas anderes geerdet ist.**

## Potentialausgleich: die Funktion, die Menschen tatsächlich schützt

**Der Schutz gegen elektrischen Schlag wirkt nicht dadurch, dass Strom ins Erdreich geschickt wird.** Er wirkt dadurch, dass im Fehlerfall die gleichzeitig berührbaren leitfähigen Teile im Potential nicht nennenswert voneinander abweichen und dass der Fehler schnell abgeschaltet wird.

**Der Hauptpotentialausgleich** verbindet die Haupterdungsschiene der Anlage mit den in das Gebäude eintretenden metallenen Versorgungsleitungen und mit der Baustruktur. **Der zusätzliche Potentialausgleich** tut dasselbe örtlich, wo das Risiko es verlangt. In einem Industriebetrieb wirken Stahlbau, Rohrleitungen, Kabelpritschen, Maschinenrahmen, Geländer und Behälterwandungen alle mit, und die Entwurfsabsicht ist, dass sie ein durchgehendes, niederimpedantes Netz bilden statt einer Menge unabhängig geerdeter Inseln.

**Zwei Eigenschaften eines gesunden Potentialausgleichs sind erwähnenswert, weil sie zugleich seine beste Diagnostik sind:**

**Ein Potentialausgleichsleiter führt im Normalbetrieb keinen Strom.** Er existiert für Fehler- und Transientenzustände. **Ein messbarer stationärer Strom in einem Potentialausgleichsleiter ist Beleg für einen Mangel** — meist ein irgendwo nachgelagert wieder verbundener Neutral- und Schutzleiter, mitunter ein Parallelpfad durch Betriebsmittel, gelegentlich ein echter Isolationsfehler. Das ist ein Befund zum Untersuchen, keine Kuriosität.

**Isolierte geerdete Strukturen sind die Gefahr, nicht die Lösung.** Zwei metallene Strukturen, die jeweils mit Erde, aber nicht miteinander verbunden sind, können bei einem Fehler oder Blitzereignis erheblich im Potential abweichen, und die Differenz erscheint an dem, was sie überbrückt — einschließlich eines Menschen, einer Signalleitung oder eines Messgeräts. Deshalb lautet der Grundsatz in Industrieanlagen *alles miteinander verbinden*, und deshalb gibt es den nächsten Abschnitt.

## Funktionserdung, Signalbezug und Schirme

Hier treffen sich Elektro- und Steuerungstechnik, und hier entsteht üblicherweise der Streit.

**Eine Funktionserde ist keine Schutzerde.** Sie existiert, damit eine Messung oder eine Kommunikation einen stabilen Bezug hat. Sie trägt keine Schutzaufgabe, sie ersetzt keinen Schutzleiter, und ein Betriebsmittel mit Funktionserdungsanforderung braucht weiterhin einen für seine Schutzaufgabe bemessenen und nachgewiesenen Schutzleiter.

**Ein Schutzleiter ist kein guter Signalbezug.** Er ist mit allem verbunden, er führt im Fehlerfall Fehlerstrom, er führt den Rückweg hochfrequenter Ströme aus Stromrichtern, und seine Impedanz steigt mit der Frequenz. Eine empfindliche Messung direkt auf ihn zu beziehen, heißt, all das zu erben.

**Ein Kabelschirm ist wieder etwas Drittes.** Er wird angebunden, um Kopplung zu beherrschen, und die richtige Anbindung hängt vom adressierten Kopplungsmechanismus und von der Frequenz ab — ein Schirm gegen niederfrequente elektrostatische Kopplung und ein Schirm gegen hochfrequente Kopplung werden nicht gleich angebunden, und die Anbindung für den einen kann für den anderen ein Ausgleichsstromproblem schaffen. Die Einzelheiten zu Messkreisen und Antriebsleitungen stehen in den Begleitbeiträgen; hier zählt nur: **„den Schirm erden“ ist keine Spezifikation.**

**Die Einpunktregel und ihre Grenze.** Einen Bezug an einem einzigen Punkt herzustellen vermeidet Ausgleichsströme bei Netzfrequenz, weshalb es der klassische Rat für niederfrequente Signalübertragung ist. Mit steigender Frequenz trägt das nicht mehr, weil die Induktivität eines Leiters sein Verhalten bestimmt und ein über einen langen Leiter angebundener „einziger Punkt“ bei hoher Frequenz gar kein einziger Punkt ist. Hochfrequenzpraxis verlangt daher kurze, breite, mehrfache Anbindungen — die entgegengesetzte Anordnung. **Keine der beiden Regeln gilt allgemein; der Frequenzinhalt der Störung entscheidet, welche zutrifft**, und eine Anlage mit langsamer Messtechnik und schnellen Stromrichtern enthält beide Probleme.

**Der separate „saubere Erder“ ist der Fehler, dessentwegen dieser Abschnitt existiert.** Die Überlegung dahinter ist eingängig: Ist die Anlagenerde verschmutzt, gebe man dem empfindlichen Gerät seinen eigenen ruhigen Erder, getrennt vom schmutzigen. Das Ergebnis sind zwei geerdete Systeme, die nicht miteinander verbunden sind. Bei einem Erdschluss oder Blitzereignis entsteht zwischen ihnen eine erhebliche Potentialdifferenz — und sie erscheint an den Signalleitungen zwischen dem empfindlichen Gerät und dem Rest der Anlage. **Das ist zugleich eine Gefährdung und der wirksamste verfügbare Störeinkopplungsmechanismus**, und es verschlimmert das ursprüngliche Problem zuverlässig.

Richtig ist ein einziges durchverbundenes Erdungssystem, dessen Bezugstopologie *innerhalb* dessen bewusst ausgelegt wird: getrennte Bezugsleiter, die mit ihren Signalen mitgeführt werden, kontrollierte Anbindungspunkte, getrennte Kabelwege und Aufmerksamkeit dafür, wo der Rückstrom von Stromrichtern tatsächlich fließt. Ruhige Bezüge entstehen durch die Kontrolle von Strompfaden, nicht durch die Trennung von Strukturen.

## Blitz und Stoßspannung: die Schnittstelle

Eine Blitzschutzanlage ist eine eigene Auslegungsdisziplin mit eigener Norm, eigener Risikobewertung und eigenen Qualifikationen — Fangeinrichtungen, Ableitungen, Trennungsabstände und Erderanordnung sind keine allgemeine Elektroplanung.

**Was an der Schnittstelle zählt, ist einfach gesagt und wird oft nicht getan.** Alle eintretenden Versorgungsleitungen und alle wesentlichen Metallteile werden am Eintrittspunkt eingebunden, damit eine Transiente, die das Potential der Struktur anhebt, alles gemeinsam anhebt, statt eine Differenz über die Geräte im Inneren zu treiben. Überspannungsschutzgeräte werden anschließend nach Position abgestimmt, vom Hauseintritt nach innen gestaffelt, mit einem der jeweiligen Lage angemessenen Energieaufnahmevermögen.

**Zwei Installationsrealitäten entscheiden, ob das funktioniert.** Die erste ist die Einbindung am Eintritt: Eine Leitung, die an einer Stelle in das Gebäude gelangt und an einer anderen eingebunden wird, trägt im Ereignisfall eine Differenz. Die zweite ist die Anschlussleitungslänge der Überspannungsschutzgeräte, deren Wirksamkeit von der bei einer steilen Transiente entlang ihrer Leitungen entstehenden induktiven Spannung bestimmt wird — ein Punkt, der im Begleitbeitrag zur Netzqualität weiter ausgeführt ist.

## Fehlermodi

**Neutral- und Schutzleiter nachgelagert der Trennstelle wieder verbunden.** Laststrom dauerhaft im Schutz- und Potentialausgleichssystem.

**Separater isolierter Erder für „Messerde“ oder „saubere Erde“.** Potentialdifferenz an Signalleitungen bei Fehlern und Blitz; Gefährdung und Störquelle zugleich.

**Fehlerschleifenimpedanz nie nachgewiesen oder nach Änderung nicht erneut nachgewiesen.** Ein Schutz, dessen Ansprechen unterstellt und nie gezeigt wurde.

**Erder im angeschlossenen Zustand gemessen.** Ein niedriger Wert, der das Netzwerk beschreibt, nicht den Erder.

**Eine erinnerte Widerstandszahl als allgemeiner Zielwert angewandt.** Die falsche Anforderung für die tatsächliche Funktion.

**Erder auf Grundlage einer Messung in der nassen Jahreszeit abgenommen.** Am Prüftag konform, einen Teil des Jahres nicht.

**IT-System mit überbrückter oder ignorierter Isolationsüberwachung.** Ein ungeerdetes System ohne Fehleranzeige.

**IT-System, das mit einem quittierten statt behobenen ersten Fehler weiterläuft.** Betrieb auf der letzten Schutzebene.

**TT-Anlage, die sich bei Erdschluss auf Überstromschutz verlässt.** Eine Schleifenimpedanz, die den nötigen Strom nicht liefert.

**Schutzleiter als Rückleiter eines Steuerstromkreises verwendet.** Strom im Schutzsystem, planmäßig.

**Funktionserde als Ersatz für einen Schutzleiter.** Kein nachgewiesener Schutzpfad.

**Schirm aus Gewohnheit statt nach Mechanismus angebunden.** Entweder ohne Nutzen oder mit einem Ausgleichsstrom als neuem Fehler.

**Einpunktbezug auf ein Hochfrequenzproblem angewandt.** Ein „einziger Punkt“, der bei der maßgebenden Frequenz eine Induktivität ist.

**Stationärer Strom im Potentialausgleichsleiter gemessen und als normal hingenommen.** Ein Mangel, der unbehoben weiterläuft.

**Maschine versetzt, Schutzleiter verlängert, nichts nachgemessen.** Ein zuvor konformer Stromkreis still außerhalb seiner Grenzen.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Analysatorschrank in einem Prozessbereich liefert instabile Messwerte. Die Instabilität tritt sporadisch auf, korreliert lose mit der Anlagenaktivität und zeigt sich in ruhigen Zeiten nicht. Auf den Hinweis hin, die Anlagenerde sei „schmutzig“, wird außerhalb des Gebäudes ein eigener Erdspieß gesetzt und ein eigener Leiter zur Bezugsschiene des Schranks geführt, bewusst vom Erdungssystem der Anlage ferngehalten. Die Instabilität wird schlimmer und umfasst nun auch gelegentliche Kommunikationsfehler auf der Verbindung zum Leitsystem.

```text
Symptom:
Unstable analyser readings and intermittent communication faults, worse
after a dedicated isolated earth rod was installed for the cabinet.

Evidence:
- the instability correlates with the operation of a large converter-fed
  drive in an adjacent area, not with the analyser's own process
- the analyser cabinet is bonded to the new rod and, through its cable
  gland plate and the signal cable screen, is also in contact with the
  plant earthing system
- a measurement between the cabinet reference bar and the local plant
  earthing shows a varying potential difference, largest when the drive runs
- the signal cable screen between the cabinet and the control system is
  terminated at both ends
- the communication faults began only after the dedicated rod was installed
- no other analyser cabinet in the plant has a dedicated electrode, and
  none of them shows the fault

Reasoning:
The dedicated rod created a second earthed system that is not bonded to the
first. The two systems sit at different potentials whenever significant
current flows in the plant earthing — which, in this area, is whenever the
converter-fed drive operates and its high-frequency return current circulates
through the earthing network. The cabinet is nevertheless connected to both
systems through the cable entries and the screen, so the potential difference
between them appears across the cabinet's own reference and across the signal
cable that bridges them. The isolation intended to keep the reference quiet
instead placed the reference across the difference. The communication faults
appeared at the same time because the same difference is impressed on the
link. This arrangement is also a shock hazard during an earth fault or a
lightning event, independent of the measurement problem.

Next investigations:
- confirm the potential difference between the two earthing systems under
  controlled drive operation
- establish the drive's actual high-frequency return path and whether it is
  routed through the earthing network or through a dedicated route
- review the screen termination against the coupling mechanism being addressed
- plan the bonding of the dedicated rod into the plant earthing system, and
  the reference topology that replaces the intended isolation
```

Die Abhilfe ist das Gegenteil des Eingriffs: **den Erdspieß in das Erdungssystem der Anlage einbinden, statt ihn getrennt zu halten**, und den ruhigen Bezug über die Kontrolle der Strompfade herstellen — den Rückweg des Stromrichters bewusst führen, die Schirmanbindung gegen den tatsächlichen Kopplungsmechanismus prüfen und Kabelwege trennen — statt über die Trennung von Strukturen.

**Die übertragbare Lehre lautet: Die Trennung geerdeter Strukturen erzeugt keine Ruhe; sie erzeugt eine Spannungsdifferenz und legt dann Ihre Signalleitung darüber.** Jedes geerdete Teil einer Anlage wird am Ende über irgendetwas mit jedem anderen geerdeten Teil verbunden sein. Die ingenieurtechnische Wahl besteht darin, ob diese Verbindung ein geplanter Potentialausgleichsleiter ist oder der Eingangskreis eines Messgeräts.

## Empfohlene Praxis

- Vor der Leiterauslegung die Funktion benennen: Schutzerdung, Potentialausgleich, Systemerdung, Funktionsbezug oder Stoßstromableitung. Sie sind nicht austauschbar.
- Den Neutralleiter in jeder Auslegungsentscheidung als aktiven Leiter behandeln und nie als Bezug oder Schutzpfad.
- Die Systemart zuerst festlegen, denn sie bestimmt, welche Schutzmaßnahme überhaupt wirken kann.
- Neutral- und Schutzleiter einmal an einer definierten Stelle trennen und das Verbot der nachgelagerten Wiederverbindung durch Auslegung, Kennzeichnung und Prüfung durchsetzen.
- Fehlerstromschutz einsetzen, wo die Systemart ihn verlangt, statt anzunehmen, Überstromgeräte sähen einen Erdschluss.
- Im IT-System die Isolationsüberwachung als Teil des Schutzes behandeln und den ersten Fehler als zu ortenden und zu behebenden Mangel, nicht als zu quittierende Meldung.
- Die Fehlerschleifenimpedanz bei der Inbetriebnahme messtechnisch nachweisen und nach jeder Änderung von Leitungslänge oder Anschlüssen erneut nachweisen.
- Den erforderlichen Erdungswiderstand aus der anwendbaren Funktion und Norm ableiten; nie eine Zahl aus dem Gedächtnis oder von einem anderen Standort übernehmen.
- Erder mit einem Verfahren messen, das den Erder misst, und vor der Abnahme die jahreszeitliche Schwankung berücksichtigen.
- Alle metallenen Strukturen und Versorgungsleitungen in ein durchgehendes System einbinden; isolierte geerdete Inseln als Mangel behandeln.
- Jeden stationären Strom in einem Potentialausgleichsleiter untersuchen, statt ihn hinzunehmen.
- Nie einen separaten isolierten Erder für empfindliche Geräte setzen; ruhige Bezüge über die Kontrolle der Strompfade innerhalb eines durchverbundenen Systems herstellen.
- Die Schirmanbindung nach Kopplungsmechanismus und Frequenz spezifizieren, nicht nach Gewohnheit.
- Den Einpunktbezug nur anwenden, wo der Frequenzinhalt es rechtfertigt, und kurze, breite, mehrfache Anbindungen verwenden, wo hochfrequentes Verhalten bestimmt.
- Alle eintretenden Versorgungsleitungen am Eintrittspunkt einbinden und Überspannungsschutzgeräte nach Position staffeln, mit kurzen Anschlussleitungen.
- Erdungsauslegung, Messwerte und Datum dokumentieren und nach Änderungen erneut prüfen — ein Erdungssystem wird von jeder Anlagenänderung verändert und von fast keiner überprüft.

## Fazit

Die Erdung belohnt sprachliche Genauigkeit stärker als fast jedes andere Thema der industriellen Elektrotechnik. Die meisten Fehlschläge sind keine Rechen- oder Ausführungsfehler, sondern Definitionsfehler — ein Leiter, dem eine Aufgabe zugemutet wird, für die er nicht ausgelegt ist; ein Erder, der einen Fehler klären soll, den er nicht sieht; ein Bezug, der so isoliert wird, dass eine Differenz über ihm garantiert ist.

Trennen Sie die fünf Funktionen in der Auslegung und halten Sie sie in der Sprache getrennt. Legen Sie die Systemart vor der Schutzauswahl fest. Weisen Sie messtechnisch nach statt zeichnerisch, und weisen Sie nach jeder Änderung erneut nach. Und widerstehen Sie der Intuition, Trennung erzeuge Ruhe: In einer Industrieanlage ist am Ende alles Leitfähige mit allem anderen verbunden, und die einzige echte Wahl ist, ob diese Verbindung geplant war oder entdeckt wurde.
