# Motorschutz und Fehlerdiagnose in der Industrie

## Zusammenfassung

Motorschutz ist eine Sammlung von Modellen. Die Überlastfunktion modelliert die Wicklungstemperatur aus dem Strom. Die Unsymmetriefunktion modelliert die Rotorerwärmung aus der Differenz der Phasenströme. Die Blockierfunktion modelliert den Hochlauf aus der verstrichenen Zeit. Keine misst das, was sie schützt, und jede hat deshalb einen definierten blinden Fleck.

Das ist keine Kritik — die Modelle sind gut und günstig —, aber es ist der Schlüssel zur Diagnose. **Wenn ein Motor auslöst und nichts defekt erscheint, lautet die nützliche Frage nicht „warum hat das Relais sich falsch verhalten“, sondern „welche Größe musste das Modell annehmen, und stimmte die Annahme?“**

**Sicherheitshinweis.** Dieser Beitrag behandelt Schutztechnik und Diagnose. Prüfungen, Isolationsmessungen und Arbeiten an Motoren oder ihren Stromkreisen erfordern Freischalten, Feststellen der Spannungsfreiheit, gegebenenfalls Entladen gespeicherter Energie und das Bewusstsein, dass drehende Maschinen auf Fernbefehl anlaufen können. Alle diese Arbeiten sind qualifiziertem Personal nach den Verfahren des Standorts vorbehalten.

## Was jede Funktion erkennt — und was sie nicht sieht

| Funktion | Erkennt | Blind für |
| --- | --- | --- |
| Thermische Überlast | Dauerstrom über der thermischen Fähigkeit, zeitlich integriert | Umgebungstemperatur, Kühlungsverlust, nicht beobachtete Vorgeschichte, Betrieb bei niedriger Drehzahl |
| Kurzschluss (unverzögert) | Sehr hohen Fehlerstrom, sofort | Alles unterhalb der Schwelle; muss über dem Anlaufstrom liegen |
| Erdschluss | Über Erde zurückfließenden Strom als Zeichen von Isolationsversagen | Windungsschlüsse, die noch keine Erdverbindung haben |
| Phasenausfall / Unsymmetrie | Unterschied der Phasenströme und den Gegensystemanteil | Die Ursache der Unsymmetrie — Motor, Netz oder Anschluss |
| Blockierter Läufer | Hohen Strom über die erwartete Hochlaufzeit hinaus | Ob die Ursache mechanisch, elektrisch oder netzseitig ist |
| Anlaufhäufigkeit | Zahl und Abstand der Anläufe gegen ein zulässiges Regime | Die tatsächliche Rotortemperatur |
| Wicklungstemperatur (direkt) | Die tatsächliche Temperatur am Sensorort | Hotspots abseits des Sensors; Lagerzustand |
| Unterspannung | Netzspannung unter einer Schwelle | Ob Motor oder Netz die Ursache war |

**Das Muster verdient eine klare Formulierung: strombasierter Schutz schließt auf Wärme, und dieser Schluss versagt, sobald sich das Verhältnis von Strom und Wärme ändert.** Es ändert sich mit der Umgebungstemperatur, mit dem Kühlluftstrom, mit der Drehzahl bei umrichtergespeisten Motoren und mit dem Anteil des Stroms, der Gegensystem ist.

## Das thermische Modell und seine Annahmen

Die Überlastfunktion führt einen thermischen Zustand mit — eine laufende Schätzung der Wicklungstemperatur aus Stromverlauf und einer für den Motor gewählten Zeitkonstante.

Drei darin enthaltene Annahmen sind im Betrieb häufig unwahr:

**Die Umgebungstemperatur entspricht der Auslegung.** Das Modell ist um einen Bezugswert kalibriert. In einem heißen Elektroraum, auf einer heißen Maschinenbühne oder neben einem Ofen startet die Wicklung wärmer als angenommen und erreicht ihre Grenze bei geringerem Strom. Manche Relais nehmen eine Umgebungstemperatur entgegen; die meisten nicht — und wo sie es tun, ist der Eingang oft unbeschaltet.

**Die Kühlung ist intakt.** Ein zugesetzter Filter, ein defekter Wellenlüfter, ein verschmutzter Kühlmantel oder ein umrichtergespeister Motor bei reduzierter Drehzahl senken alle die Kühlung, während der Strom gleich bleibt. Das Modell sieht unveränderten Strom und schließt auf unveränderte Temperatur — was genau falsch ist.

**Der thermische Zustand ist kontinuierlich.** Ein Relais, das getauscht, spannungsfrei geschaltet oder zurückgesetzt wurde, startet mit einem angenommenen Zustand. Ein Motor, der gerade zwei schwere Anläufe hinter sich hat und beim dritten auslöst, wird korrekt geschützt; ein Relais, das zwischendurch sein Gedächtnis verloren hat, schützt nicht.

**Wo diese Annahmen nicht garantiert werden können, ist die direkte Temperaturmessung in der Wicklung die Antwort**, weil sie genau die Größe misst, die das Modell schätzen wollte. Sie ist bei Neumaschinen günstig, bei vielen nachrüstbar — und sie verwandelt eine ganze Klasse unerklärter Ausfälle in einen Messwert.

## Unsymmetrie: ein Rotorproblem, das wie ein Statorproblem aussieht

Spannungsunsymmetrie ist einer der folgenreichsten und am wenigsten sichtbaren Einflüsse auf die Motorlebensdauer.

**Der Mechanismus.** Ein unsymmetrisches Drehstromsystem lässt sich in ein Mitsystem, das nutzbares Moment erzeugt, und ein Gegensystem zerlegen, das ein gegen den Rotor drehendes Feld erzeugt. Dieses gegenläufige Feld erscheint dem Rotor mit nahezu doppelter Netzfrequenz, wo die Rotorimpedanz klein ist — eine kleine Gegensystemspannung treibt also einen überproportional großen Gegensystemstrom, und dieser Strom erwärmt den Rotor.

Zwei Folgerungen lohnen die Verinnerlichung:

- **Eine kleine Spannungsunsymmetrie erzeugt eine deutlich größere Stromunsymmetrie.** Nur die Spannung zu messen und zu schließen „das sind ja nur wenige Prozent“ unterschätzt die Wirkung am Motor.
- **Die Erwärmung konzentriert sich im Rotor**, den die meisten Schutzfunktionen nicht direkt sehen und den kein Wicklungstemperatursensor misst.

**Diagnostisch ist Unsymmetrie ein starker Kandidat, sobald gleichartige Motoren bei gleicher Betriebsart unterschiedlich reagieren**, denn das Netz ist eines der wenigen Dinge, die sich zwischen ihnen unterscheiden können. Ebenso, wenn die Auslösungen mit dem Betrieb großer einphasiger Verbraucher am selben Netz korrelieren.

**Der Phasenausfall ist der Extremfall.** Bei einer offenen Phase kann ein belasteter Motor weiterdrehen, während die verbleibenden Phasen deutlich höheren Strom führen. Ob das thermische Modell das rechtzeitig erfasst, hängt von Belastung und Einstellungen ab — deshalb existiert eine eigene Unsymmetrie- und Phasenausfallfunktion, statt sich auf die Überlast zu verlassen.

## Anlauf, Blockieren und der Preis der Wiederholung

Der Anlauf ist die thermisch anspruchsvollste Handlung eines Motors. Der Strom ist hoch, und weil der Schlupf hoch ist, geht der größte Teil dieser Energie in den Rotor.

- **Blockier- und Hochlaufüberwachung** unterscheidet „hoher Strom während eines normalen Hochlaufs“ von „hoher Strom, der nicht endet“. Das Unterscheidungsmerkmal ist die Zeit: Ein Hochlauf, der seine erwartete Dauer überschreitet, ist eine Blockierung — ob die Ursache eine verklemmte Last, ein zu weiches Netz oder ein mechanischer Fehler ist.
- **Die unverzögerte Kurzschlussschwelle muss über dem Anlaufstrom liegen.** Liegt sie darunter, löst der Motor bei jedem Anlauf aus, und dann wird die Schwelle üblicherweise angehoben, bis die Auslösungen aufhören — womöglich über den richtigen Wert hinaus. Die korrekte Reihenfolge ist, sie aus der Kurzschlussstudie und dem Anlaufstrom zu bestimmen, nicht aus Versuch und Irrtum.
- **Anlaufzählung und Wiederanlaufsperre existieren, weil sich Rotorwärme summiert.** Ein Motor, der anläuft, wegen einer Prozessstörung auslöst, sofort wieder gestartet wird und erneut auslöst, wird einer Betriebsart ausgesetzt, die das Anlaufregime des Herstellers vermutlich nicht erlaubt. Wo der Prozess wiederholte Startversuche begünstigt, muss dieses Regime im Schutz durchgesetzt werden, nicht in der Hoffnung.

**Eine brauchbare diagnostische Unterscheidung: Auslösungen während des Hochlaufs deuten auf Last, Netz oder Hochlaufeinstellung; Auslösungen im Dauerbetrieb auf Belastung, Kühlung, Umgebungstemperatur oder Unsymmetrie.** Auf welcher Seite des Anlaufs die Auslösung liegt, streicht die Hälfte der Kandidaten.

## Isolation und Erdschluss

**Der Erdschlussschutz erfasst am ehesten einen sich entwickelnden Fehler früh**, weil Isolationsschädigung meist Erde erreicht, bevor sie zum Phasenfehler wird. Empfindlichkeit zählt: Eine Summenstrommessung, die alle Leiter umfasst, erkennt einen kleinen Reststrom direkt, während seine Ableitung aus drei getrennten Phasenmessungen durch deren Genauigkeit begrenzt ist.

**Isolationsprüfung ist ein Trend, kein Urteil.** Ein einzelner Isolationswiderstandswert ist eine schwache Aussage, weil er stark von Temperatur und Feuchte abhängt. Wirklich aussagekräftig sind:

- **Dieselbe Prüfung, an denselben Punkten, temperaturkorrigiert und mit der eigenen Historie der Maschine verglichen.** Ein Wert, der sich in zwei Jahren halbiert hat, sagt mehr als jede absolute Zahl.
- **Das Polarisationsverhalten über die Zeit**, das eine saubere, aber feuchte Wicklung von einer geschädigten unterscheidet.
- **Das Muster über die Phasen**, denn Asymmetrie deutet auf ein örtliches Problem.

Isolationsprüfungen setzen einen freigeschalteten Motor und einen entladenen Stromkreis voraus und erfolgen nach den Verfahren des Standorts durch qualifiziertes Personal.

## Mechanische Belege und wo der Schutz zu spät kommt

Elektrischer Schutz sieht mechanische Probleme nur über ihre elektrischen Folgen — und meist spät.

- **Lagerschädigung** ist mit Schwingungsüberwachung lange erkennbar, bevor sie im Strom sichtbar wird. Wenn ein ausfallendes Lager den Motorstrom messbar anhebt, ist die Restlebensdauer kurz.
- **Ausrichtungs- und Kupplungsprobleme** belasten den Motor und können Auslösungen verursachen, während der Motor selbst gesund ist.
- **Probleme der Arbeitsmaschine** — eine teilverstopfte Pumpe, ein Band mit schwergängiger Rolle, ein verschmutzter Ventilator — erscheinen als Überlastauslösung an einem einwandfrei arbeitenden Motor.
- **Läuferfehler und Luftspaltexzentrizität** haben charakteristische Signaturen in Schwingung und Motorstromspektrum und bleiben dem Schutz praktisch verborgen, bis sie schwer werden.

**Die praktische Folge: Eine Überlastauslösung belegt, dass der Motor mehr Strom zieht, als das Modell zulässt. Sie sagt nichts darüber, ob der Motor das Problem ist.** Der häufigste teure Fehler dieses Feldes ist der Tausch eines Motors, dessen einziges Vergehen darin bestand, zu tun, was seine Last verlangte.

**Bei umrichtergespeisten Motoren** gehören das Kühlungsproblem bei niedriger Drehzahl und der Lagerstrommechanismus zu den Begleitbeiträgen über VFD-Auswahl sowie über Oberschwingungen, EMV und Motorleitungen. Beide erzeugen Ausfälle, die wie Motorqualitätsprobleme aussehen und keine sind.

## Eine Auslösung als Beleg lesen

Eine Auslösung ist ein Datenpunkt, und moderne Schutzgeräte zeichnen genug auf, um daraus einen starken zu machen. Was zu erfassen ist, bevor irgendetwas zurückgesetzt wird:

| Beleg | Was er unterscheidet |
| --- | --- |
| Die vom Relais genannte Auslöseursache | Welches Modell seine Grenze erreicht hat |
| Gemessene Phasenströme im Auslösemoment | Überlast gegenüber Unsymmetrie gegenüber Blockierung |
| Thermischer Zustand bei und vor der Auslösung | Ob das Modell schon aus früheren Ereignissen aufgeladen war |
| Zeit vom Anlauf bis zur Auslösung | Anlaufproblem gegenüber Betriebsproblem |
| Spannung und Unsymmetrie bei der Auslösung | Netzseitige gegenüber lastseitiger Ursache |
| Trend des Betriebsstroms über Wochen | Allmähliche mechanische Veränderung gegenüber plötzlicher |
| Zahl und Zeitpunkte der letzten Anläufe | Betriebsart über dem zulässigen Anlaufregime |
| Umgebungstemperatur und Kühlzustand | Ob die Annahmen des thermischen Modells trugen |
| Prozessbedingungen zur fraglichen Zeit | Material, Verstopfung, Temperatur, Produktwechsel |
| Verhalten gleichartiger Motoren derselben Betriebsart | Ob die Ursache gemeinsam oder örtlich ist |

**Die letzte Zeile ist der wertvollste verfügbare Vergleich.** Zwei identische Motoren gleicher Betriebsart, die sich unterschiedlich verhalten, unterscheiden sich in etwas — Netz, Kühlung, mechanischer Zustand oder Einstellung —, und aufzuzählen, was sich unterscheidet, ist meist schneller als jede Messung.

## Unnötige oder echte Auslösung?

Die Unterscheidung zählt, weil die Reaktionen entgegengesetzt sind: Eine echte Auslösung bedeutet, dass sich etwas in der Anlage verändert hat; eine unnötige bedeutet, dass an den Annahmen oder Einstellungen des Schutzes etwas nicht stimmt.

| Beobachtung | Deutung |
| --- | --- |
| Überlastauslösung, aufgezeichneter Strom im Normalband | Die Annahmen des thermischen Modells trugen nicht — Umgebung, Kühlung, aufgeladener Zustand — oder die Einstellung passt nicht zur Betriebsart |
| Überlastauslösung, aufgezeichneter Strom deutlich erhöht | Eine echte Laständerung: mechanisch, prozessseitig oder netzseitig |
| Auslösung bei jedem Anlauf, normaler Betriebsstrom | Hochlaufzeit über der Einstellung, oder unverzögerte Schwelle unter dem Anlaufstrom |
| Auslösungen gehäuft bei Hitze oder in einer Schicht | Umgebungstemperatur oder Kühlung |
| Auslösungen an mehreren Motoren gleichzeitig | Netzereignis, nicht die Motoren |
| Auslösung an einem von mehreren identischen Motoren | Örtlich: Netzanschluss, Kühlung, mechanischer Zustand oder Einstellungen dieses Relais |
| Auslösung direkt nach einem Relaistausch | Einstellungen nicht übertragen oder thermischer Zustand zurückgesetzt |
| Auslösungen nehmen über Monate zu | Fortschreitende mechanische oder Isolationsschädigung |

**Die zugrunde liegende Regel: Nie eine Schutzeinstellung ändern, um eine Auslösung abzustellen, bevor die Belege zeigen, dass die Einstellung falsch war.** Eine Schwelle anzuheben, die einen realen Zustand korrekt gemeldet hat, entfernt den Schutz und lässt den Zustand bestehen.

## Ein systematisches Vorgehen

1. **Die Belege sichern.** Die Auslösedaten vor dem Zurücksetzen aufzeichnen. Nach dem Reset sind thermischer Zustand und oft die Messwerte verloren.
2. **Feststellen, auf welcher Seite des Anlaufs die Auslösung lag.** Das halbiert die Kandidatenliste sofort.
3. **Mit gleichartigen Motoren derselben Betriebsart vergleichen.** Was mehrere betrifft, zeigt aufs Netz; was einen betrifft, zeigt nach örtlich.
4. **Die Annahmen des thermischen Modells prüfen** — Umgebung, Kühlung, jüngste Anläufe, ob das Relais zurückgesetzt wurde —, bevor der Motor infrage gestellt wird.
5. **Elektrisch von mechanisch über den Trend trennen:** eine plötzliche Änderung zeigt auf Netz oder Prozess, eine allmähliche auf mechanische oder Isolationsschädigung.
6. **Vor dem Motor die Arbeitsmaschine ansehen.** Sie ist die häufigere Ursache und die günstigere Prüfung.
7. **Eine Sache ändern und beobachten.** Zwei gleichzeitige Änderungen machen das Ergebnis unauswertbar.
8. **Die Lösung mit den Belegen dokumentieren**, denn derselbe Motor wird in zwei Jahren erneut auslösen, und jemand anderes wird nachsehen.

## Fehlermodi

**Thermische Einstellung aus dem Typenschildstrom ohne Prüfung von Betriebsfaktor und Betriebsart.** Ein Schutz, der entweder zu träge ist oder grundlos auslöst.

**Verfügbarer Umgebungstemperatureingang nicht beschaltet.** Das Modell läuft auf einem Vorgabewert, der nicht zum Raum passt.

**Unbemerkte Kühlungsverschlechterung.** Filter, Lüfter, Kühlmantel — der Schutz sieht keine Stromänderung.

**Unverzögerte Schwelle angehoben, bis die Auslösungen aufhörten.** Der Kurzschlussschutz ist nun unempfindlicher als von der Studie vorgesehen.

**Unsymmetrieschutz deaktiviert, um Auslösungen zu unterbinden.** Die Rotorerwärmung läuft unbeobachtet weiter.

**Isolationswiderstand nach einem Einzelwert beurteilt.** Fehlalarm und falsche Sicherheit sind gleichermaßen möglich.

**Relais ohne Übertragung der Einstellungen getauscht.** Entdeckt beim ersten außergewöhnlichen Ereignis.

**Auslösedaten vor der Aufzeichnung zurückgesetzt.** Jede weitere Diagnose beginnt blind.

**Motor wegen eines Lastfehlers getauscht.** Der neue Motor löst bei derselben Betriebsart aus.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Kraftwerk betreibt zwei identische Kühlwasserpumpen in gleicher Betriebsart im Wochenwechsel. Über mehrere Monate löst eine davon zunehmend häufig wegen thermischer Überlast aus; die andere nie. Der Motor wird getauscht. Die Auslösungen setzen sich am Ersatzmotor fort.

Die Belegaufnahme ist der Wendepunkt.

Die Auslösedaten zeigen erhöhte, aber nicht dramatisch hohe Ströme — und, entscheidend, **die Phasenströme sind merklich ungleich.** Die Aufzeichnungen der gesunden Pumpe zeigen bei gleicher Last symmetrische Ströme. Beide Motoren sind mechanisch in Ordnung, und die Pumpenbetriebsart ist identisch; der Unterschied liegt also weder im Motor noch in der Last.

Die Messung an der Schaltanlage zeigt eine prozentual kleine Spannungsunsymmetrie, die größer ausfällt, wenn ein nahegelegener einphasiger Verbraucher in Betrieb ist. Die betroffene Pumpe wird aus einem Abschnitt gespeist, in dem diese Unsymmetrie ausgeprägter ist.

Der Mechanismus vervollständigt das Bild: Das Gegensystem treibt einen überproportional großen Strom im Rotor und erwärmt ihn, während der Statorstrom — die vom thermischen Modell beobachtete Größe — nur mäßig steigt. Das Relais verhält sich nicht falsch; es schützt einen Motor, der tatsächlich heißer läuft, als sein Statorstrom allein nahelegt, und die Reserve des Modells wird von einer Erwärmung aufgezehrt, die es nicht zuordnen kann.

**Ein Motortausch konnte nie helfen, weil der Motor nie der Fehler war.**

Die Abhilfe liegt netzseitig: die einphasige Belastung gleichmäßiger auf die Phasen verteilen und, wo eine Restunsymmetrie bleibt, den Unsymmetrieschutz auf die Toleranz des Motors einstellen, statt ihn zum Abstellen der Auslösungen zu deaktivieren.

**Die übertragbare Lehre lieferte der Vergleich der identischen Pumpen kostenlos: Wenn zwei Maschinen gleicher Betriebsart sich unterschiedlich verhalten, liegt der Unterschied nicht in der ausfallenden Maschine — sondern in dem, was zwischen beiden nicht identisch ist.**

## Empfohlene Praxis

- Den thermischen Schutz aus der tatsächlichen thermischen Fähigkeit und der realen Betriebsart einstellen, nicht allein aus dem Typenschildstrom.
- Einen Umgebungstemperatureingang beschalten, wo das Relais ihn bietet, oder direkte Wicklungstemperaturmessung nutzen, wo Umgebung und Kühlung nicht garantiert sind.
- Kühlungsverlust als Schutzlücke behandeln: strombasierte Modelle sehen ihn nicht.
- Den unverzögerten Schutz aus Kurzschlussstudie und Anlaufstrom einstellen und nie bloß zum Abstellen von Auslösungen anheben.
- Unsymmetrie- und Phasenausfallschutz aktiv und auf die Motortoleranz eingestellt lassen; nicht zur Symptomunterdrückung deaktivieren.
- Die Netzunsymmetrie untersuchen, sobald gleichartige Motoren derselben Betriebsart unterschiedlich reagieren.
- Das zulässige Anlaufregime im Schutz durchsetzen, wo der Prozess wiederholte Startversuche begünstigt.
- Empfindlichen Erdschlussschutz nutzen, um Isolationsschädigung vor dem Phasenfehler zu erfassen.
- Isolationsmessungen temperaturkorrigiert trenden; nie nach einem absoluten Einzelwert urteilen.
- Schwingungsüberwachung dort ergänzen, wo ein Lagerausfall echte Folgen hat; der elektrische Schutz kommt bei mechanischen Fehlern zu spät.
- Auslösedaten — Ursache, Ströme, thermischer Zustand, Zeitpunkte — vor jedem Reset aufzeichnen.
- Den Vergleich mit gleichartigen Motoren derselben Betriebsart als ersten Diagnoseschritt setzen.
- Die Arbeitsmaschine prüfen, bevor der Motor verurteilt wird.
- Einstellungen bei jedem Relaistausch übertragen, verifizieren und dokumentieren.
- Jeweils eine Einstellung ändern und danach die Auslösedaten erneut aufzeichnen, damit das Relais selbst den Nachweis der Wirkung trägt.

## Fazit

Motorschutz funktioniert gut und versagt auf vorhersehbare Weise, und beides hat dieselbe Quelle: Er schützt durch Modellieren statt durch Messen. Die Überlastfunktion ist eine gute Schätzung der Wicklungstemperatur, solange Umgebung, Kühlung und thermische Vorgeschichte sich wie angenommen verhalten — und sie liegt still daneben, wenn nicht. Die Unsymmetriefunktion beobachtet eine Statorgröße, um auf Rotorerwärmung zu schließen. Die Blockierfunktion beobachtet eine Uhr.

Diagnose ist deshalb weitgehend die Disziplin, zu fragen, welche Annahme versagt hat — und der billigste Weg, das zu fragen, ist der Vergleich der auslösenden Maschine mit der danebenstehenden, die es nicht tut. Konsequent angewandt verhindert diese Gewohnheit das teuerste Ergebnis dieses Feldes: nicht einen Motorausfall, sondern einen getauschten Motor, der nie schuld war — gefolgt von derselben Auslösung am neuen.
