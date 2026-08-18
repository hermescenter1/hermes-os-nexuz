# PID-Regelung: praktische Einstellung und Fehleranalyse

## Zusammenfassung

Ein Regelkreis, der sich nicht wie gewünscht verhält, wird fast immer so beschrieben, als bräuchte er eine neue Einstellung. Diese Beschreibung ist eine Hypothese, und sie ist meist falsch.

**Ein schwingender Regelkreis hat mindestens acht verschiedene Ursachen**: zu aggressiver P-Anteil, zu schneller I-Anteil, Ventilhaftreibung, Stellgrößenbegrenzung mit Windup, größere Totzeit als die Einstellung unterstellt, mit dem Durchsatz veränderliche Totzeit, eine äußere Störung oder Wechselwirkung mit einem anderen Kreis, und Messrauschen, das für Prozessbewegung gehalten wird. **Zwei dieser acht sind die Einstellung.** Die übrigen sechs bleiben von einer Neueinstellung unberührt, und mehrere werden durch das Zurücknehmen der Verstärkung nach einem erfolglosen Versuch sogar *schlimmer* — denn ein langsamerer Kreis erzeugt eine langsamere, sanftere Schwingung, die wie Fortschritt aussieht.

Dieser Beitrag behandelt PID als diagnostische Disziplin: was jeder Anteil bewirkt und warum ein Parametersatz ohne die Reglerform bedeutungslos ist, welche Streckeneigenschaften überhaupt bestimmen, was erreichbar ist, wie man eine Sprungantwort liest, warum Windup ein struktureller Fehler und kein Einstellfehler ist, wie D-Anteil und Rauschen zusammenwirken, und — im Zentrum — wie man die acht Ursachen unterscheidet.

**Eine Prüfung beherrscht alles: den Kreis auf Hand schalten.** Läuft die Schwingung weiter, während der Regler nicht mehr eingreift, ist der Regler nicht die Ursache, und jede Stunde an Parametern ist verschwendet. Dieser eine Schritt, zuerst getan, klärt einen großen Teil der Kreise, die über Jahre wiederholt „nachgestellt“ wurden.

## Was jeder Anteil bewirkt und warum die Form zählt

**Der P-Anteil** reagiert auf die jetzt bestehende Regelabweichung. Er liefert die Schnelligkeit. An einer selbstregelnden Strecke hinterlässt er eine bleibende Regelabweichung, denn eine von null verschiedene Stellgröße verlangt eine von null verschiedene Abweichung, um sie zu erzeugen. Wie viel P-Anteil ein Kreis verträgt, begrenzt die Phasenverzögerung der Strecke: Jenseits eines Punktes kommt die Korrektur zu spät, um zu helfen, und hält stattdessen eine Schwingung aufrecht.

**Der I-Anteil** beseitigt die bleibende Abweichung durch Aufsummieren über die Zeit. Er ist zugleich der Anteil, der einen Kreis am zuverlässigsten destabilisiert, weil Integration Phase verzögert, und der Anteil, der aufläuft. **Der I-Anteil ist ein Preis für die Beseitigung der bleibenden Abweichung**, und die richtige Menge ist die langsamste, die sie in betrieblich brauchbarer Zeit entfernt — nicht die schnellste, die der Kreis erträgt.

**Der D-Anteil** reagiert auf die Änderungsgeschwindigkeit. Er liefert Phasenvorhalt, der mehr P-Anteil erlaubt, als sonst stabil wäre, und er ist an Strecken mit erheblicher thermischer Verzögerung und sauberer Messung wirklich wertvoll. Er verstärkt aber auch hochfrequente Anteile, weshalb er fast immer gefiltert und häufig ganz abgeschaltet wird. **Ein D-Anteil auf einer verrauschten Messung ist eine Methode, Rauschen auf das Ventil zu legen.**

**Der Punkt, der die Übernahme von Parametern zwischen Systemen zunichtemacht**, ist, dass „PID“ eine Familie von Strukturen bezeichnet, nicht einen Algorithmus:

- **Die Form** — ob die Verstärkung alle drei Anteile multipliziert (Standard- oder Idealform), die Anteile unabhängig sind (Parallelform) oder in Reihe angeordnet sind — ändert die Bedeutung eines gegebenen Zahlensatzes.
- **Die Einheiten** — Verstärkung oder Proportionalband; Nachstellzeit in Sekunden, Minuten oder Wiederholungen je Minute; Vorhaltzeit in Sekunden oder Minuten — unterscheiden sich zwischen Plattformen und sind mitunter Kehrwerte voneinander.
- **Die Lage von P- und D-Anteil** — auf der Abweichung oder auf der Messgröße — ändert die Reaktion auf Sollwertsprünge, ohne die Störreaktion zu ändern. D auf der Abweichung erzeugt bei jedem Sollwertsprung einen kräftigen Stoß; D auf der Messgröße nicht.

**Ein Parametersatz ist deshalb nur zusammen mit Reglerform, Einheiten und Anteilslage sinnvoll.** Zahlen von einem alten auf einen neuen Regler zu kopieren, ohne alle drei zu übersetzen, ist ein bewährter Weg zu einem Kreis, der nie funktioniert hat und sich nicht erklären lässt.

## Die Strecke bestimmt das Erreichbare

Drei Streckeneigenschaften legen den Leistungsrahmen fest, und keine Einstellung verschiebt diesen Rahmen.

**Die Streckenverstärkung** ist die Bewegung der Messgröße je Änderung der Stellgröße. Sie ist selten konstant: die installierte Ventilkennlinie, ein nichtlinearer Prozesszusammenhang und eine wechselnde Last verschieben sie alle. **Ein an einem Arbeitspunkt eingestellter Kreis kann an einem anderen träge und an einem dritten instabil sein**, und das ist eine Streckeneigenschaft, kein Reglermangel.

**Die Zeitkonstante** beschreibt, wie schnell die Strecke reagiert, nachdem sie zu reagieren begonnen hat.

**Die Totzeit** beschreibt, wie lange es dauert, bis sie überhaupt zu reagieren beginnt. **Das Verhältnis von Totzeit zu Zeitkonstante ist die einzige Zahl, die die Schwierigkeit eines Kreises vorhersagt.** Ist die Totzeit klein gegenüber der Zeitkonstante, ist enge Regelung unproblematisch. Dominiert die Totzeit, ist der Kreis grundsätzlich begrenzt: Der Regler handelt stets auf Grundlage von Informationen über einen bereits veränderten Zustand, und keine Einstellung hebt das auf. Solche Kreise lassen sich stabil oder schnell machen, aber nicht beides, und etwas anderes zu behaupten erzeugt jahrelange abwechselnde Beschwerden.

**Selbstregelnde und integrierende Strecken verlangen verschiedene Philosophien**, und eine integrierende Strecke wie eine selbstregelnde zu behandeln ist ein häufiger und folgenreicher Fehler.

- Eine **selbstregelnde** Strecke stellt sich nach einem Stellgrößensprung auf einen neuen Beharrungswert ein — Durchfluss durch ein Ventil, Temperatur bei fester Wärmezufuhr und Verlusten.
- Eine **integrierende** Strecke läuft als Rampe und stellt sich nie ein — Füllstand in einem Behälter mit unabhängigem Ablauf, Druck in einem geschlossenen Volumen beim Befüllen. **Die Strecke integriert bereits selbst**, der Regler braucht also nur sehr wenig eigenen I-Anteil. Zu viel erzeugt ein langsames, hartnäckiges Pendeln, das wie Instabilität aussieht und oft mit noch mehr I-Anteil „behoben“ wird, was es verschlimmert.

**Offen instabile Strecken** — manche exothermen Reaktoren, manche Drucksysteme — laufen ohne Regelung vom Arbeitspunkt weg. Sie sind ein Spezialfall mit Sicherheitsbezug und liegen außerhalb der allgemeinen Kreiseinstellung.

## Eine Sprungantwort lesen

Die drei Streckenkennwerte gewinnt man durch Beobachtung, nicht durch Theorie.

**Den Versuch im Handbetrieb durchführen**, damit der Regler nicht gegen das Experiment arbeitet. Die Stellgröße um einen bekannten Betrag sprunghaft ändern, die Messgröße mit ausreichender Auflösung aufzeichnen und das Ergebnis aus der Kurve ablesen: die schließliche Änderung ergibt die Streckenverstärkung, die Verzögerung bis zum Beginn der Bewegung die Totzeit, und die Form des Anstiegs die Zeitkonstante.

Die Disziplin, die den Versuch lohnend macht:

- **An einem repräsentativen Arbeitspunkt prüfen.** Ein Versuch bei 20 % Durchsatz beschreibt die Strecke bei 20 % Durchsatz.
- **In beide Richtungen prüfen.** Eine Antwort, die sich aufwärts und abwärts unterscheidet, belegt eine Nichtlinearität, ein Kennlinienproblem des Ventils oder Haftreibung — und diese Unsymmetrie ist eine der nützlichsten kostenlosen Diagnosen überhaupt.
- **Den Sprung groß genug wählen, um Rauschen und Haftreibung zu überwinden**, und klein genug, um betrieblich vertretbar zu sein. Ein Sprung, der die Haftreibung nicht löst, misst nichts.
- **Dokumentieren.** Ein einmal durchgeführter und erinnerter Sprungversuch ist weit weniger wert als einer, der sich mit dem nächstjährigen vergleichen lässt.

**Die Form selbst trägt Diagnose:**

- Eine Antwort, die sich zunächst in die *falsche* Richtung bewegt, ist eine Allpass-Reaktion, setzt der erreichbaren Güte eine harte Grenze und ist eine Streckeneigenschaft.
- Eine Antwort, die sich nie einstellt, zeigt eine integrierende Strecke an.
- Eine Antwort, deren Verzögerung vom Durchsatz abhängt, zeigt **Transporttotzeit** an, und das verdient Nachdruck: Wo die Verzögerung eine stoffliche Laufzeit ist, **verhält sich die Totzeit umgekehrt zum Durchfluss**. Ein bei Volllast eingestellter Kreis sieht bei halber Last etwa die doppelte Totzeit. Dieser Mechanismus steckt hinter sehr vielen Beschwerden der Art „es schwingt nur bei kleiner Last“.

## Eine Einstellphilosophie statt einer Formel

**Es gibt keine allgemeingültige Einstellformel, und veröffentlichte Regeln sind Startpunkte, keine Antworten.** Jede veröffentlichte Regel kodiert eine angenommene Streckenform und ein angenommenes Ziel — manche minimieren die Ausregelzeit, manche das Überschwingen, manche ein integrales Fehlerkriterium — und zwei Ingenieure, die „die“ Regel auf denselben Kreis anwenden, erhalten zu Recht verschiedene Zahlen, weil sie Verschiedenes optimieren.

**Das Ziel vor jedem Parameter benennen:**

- **Sollwertfolge oder Störunterdrückung?** Die meisten Kreise existieren zur Störunterdrückung, und die meisten Einstellungen werden mit Sollwertsprüngen geprüft. Ein Kreis kann bei Sollwertänderungen hervorragend aussehen und Störungen schlecht unterdrücken.
- **Enge Regelung oder ruhige Stellgröße?** Beides steht in unmittelbarer Spannung. Ein ständig fahrendes Ventil verschleißt; ein in einen anderen Kreis kaskadierter Kreis gibt seine eigene Unruhe weiter.
- **Nützt enge Regelung der Anlage überhaupt?** Ein Ausgleichsbehälter existiert, um Schwankungen aufzunehmen. Seinen Füllstand eng zu regeln reicht jede vorgelagerte Störung unverändert an die nachgelagerte Einheit weiter und hebt den Zweck des Behälters auf. **Mittelwertregelung des Füllstands ist eine bewusste ingenieurtechnische Wahl, kein schlecht eingestellter Kreis.**

**Eine vertretbare Reihenfolge, unabhängig davon, welche veröffentlichte Regel als Startpunkt dient:**

1. Die Streckendynamik durch Versuch am maßgebenden Arbeitspunkt bestimmen.
2. Das Ziel entscheiden und aufschreiben.
3. Konservativ beginnen und den P-Anteil erhöhen, bis die Reaktion akzeptabel ist — dabei die Stellgröße ebenso beobachten wie die Messgröße.
4. I-Anteil nur so schnell hinzufügen, wie zur Beseitigung der bleibenden Abweichung in brauchbarer Zeit nötig.
5. D-Anteil nur erwägen, wo die Totzeit klein gegenüber der Zeitkonstante und die Messung sauber ist, und seinen Filter als Teil der Einstellung behandeln.
6. **Mit einer Störung prüfen, nicht nur mit einem Sollwertsprung.**
7. Parameter, Reglerform, Einheiten, Arbeitspunkt und Datum dokumentieren.

## Begrenzung und Windup: ein struktureller Fehler

**Windup ist kein Einstellfehler und lässt sich nicht wegstellen.** Erreicht die Stellgröße eine Grenze, ist der Kreis offen: Weiteres Aufsummieren kann keine zusätzliche Wirkung erzeugen. Läuft der I-Anteil dennoch weiter auf, bleibt die Stellgröße nach der Umkehr der Abweichung so lange in der Begrenzung, bis dieser Aufbau abgebaut ist — mit einem großen, langsamen Überschwinger, der mit den Verstärkungen nichts zu tun hat.

**Anti-Windup ist eine Reglerfunktion.** Sie muss vorhanden, aktiviert und richtig parametriert sein; moderne Regler bieten sie, und der Fehler besteht meist darin, dass die Vorstellung des Reglers von der Grenze nicht der Wirklichkeit entspricht.

**Diese Diskrepanz ist der praktisch bedeutsame Teil.** Die maßgebenden Grenzen sind nicht nur 0 und 100 %:

- Ein Ventil, das bei 70 % des Stellbereichs voll offen ist, ist bei 70 % begrenzt, und ein Regler, der seine Grenze bei 100 % vermutet, läuft über die restlichen 30 % bereitwillig auf.
- Eine Stellgröße, die einen unterlagerten Regler führt, der selbst begrenzt ist, ist faktisch begrenzt.
- Ein Antrieb an der Drehmoment- oder Stromgrenze ist begrenzt, ganz gleich, was sein Drehzahlsollwert sagt.

**In Kaskaden pflanzt sich Windup fort.** Ist ein unterlagerter Kreis auf Hand, an einer Grenze oder anderweitig nicht folgefähig, arbeitet der überlagerte Kreis offen und läuft auf, sofern man es ihm nicht mitteilt. **Externer Reset, Rückrechnung und gleichwertige Mechanismen existieren genau dafür, die Botschaft „ich kann dir nicht folgen“ vom inneren an den äußeren Kreis zu übermitteln**, und eine Kaskade ohne einen davon hat ein Windup-Problem, das auf die erste Auslenkung des inneren Kreises wartet.

**Die diagnostische Signatur ist eindeutig:** Ein Kreis, der sich im Normalbetrieb akzeptabel verhält und *nur nach einer Zeit an einer Grenze* stark überschwingt, hat ein Windup-Problem. Ihn nachzustellen verschlechtert den Normalbetrieb, um einen Zustand zu behandeln, der nur in der Begrenzung auftritt.

## D-Anteil, Rauschen und Filterung

Differenzieren verstärkt hochfrequente Anteile. Messrauschen ist hochfrequent. Die Folgen ergeben sich unmittelbar.

**Der D-Anteil wird deshalb stets mit Filter verwendet**, und die Filterzeitkonstante ist ein Einstellparameter mit Zielkonflikt, keine verborgene Voreinstellung. **Der Filter ist nicht kostenlos**: Er fügt Verzögerung hinzu — genau das, was der D-Anteil ausgleichen sollte.

**Rauschen beheben, bevor man es filtert.** Ist eine Messung wegen eines Signalintegritätsproblems verrauscht — ein Gleichtaktproblem, ein fehlgeschlagenes Schirmkonzept, eine unpassende Abtastrate —, dann behandelt eine Filterung im Regler ein Symptom an der falschen Stelle und zerstört zugleich Nachweise. Die Begleitbeiträge zu Messtechnikarchitektur und Stromkreisen behandeln die Mechanismen; hier zählt, dass ein Filter, der einen Trend beruhigen soll, genau die Information entfernt, die den eigentlichen Fehler benannt hätte.

**Und die diagnostisch entscheidende Unterscheidung:**

| | **Messrauschen** | **Prozessschwingung** |
| --- | --- | --- |
| Frequenz | Hoch, oft nahe der Abtastrate | Mit einer Periode aus der Kreisdynamik |
| Bezug zur Stellgröße | Unkorreliert | Korreliert, mit fester Phasenbeziehung |
| Im Handbetrieb | Weiterhin vorhanden | Verschwindet meist — außer bei äußerer Ursache |
| Wirkung des Zurücknehmens | Keine | Amplitude und Periode ändern sich |

## Die Differentialdiagnose eines schwingenden Kreises

Das ist der Kern dieses Beitrags. **Zuerst den Kreis auf Hand schalten und die Stellgröße festhalten.**

| Ursache | Signatur | Unterscheidender Nachweis |
| --- | --- | --- |
| **P-Anteil zu aggressiv** | Schwingung mit einer Periode aus der Kreisdynamik; wächst mit der Verstärkung | Stoppt auf Hand; Amplitude reagiert direkt auf Verstärkungsänderungen |
| **I-Anteil zu schnell** | Langsameres Pendeln, größeres Überschwingen nach Störungen | Stoppt auf Hand; reagiert auf die Nachstellzeit, nicht auf die Verstärkung |
| **Ventilhaftreibung** | Grenzzyklus, bei dem die Stellgröße glatt rampt und die Messgröße springt | **Zurücknehmen verlangsamt den Zyklus, beseitigt ihn nicht**; die beiden Kurven haben verschiedene Formen |
| **Stellgrößenbegrenzung mit Windup** | Großes Überschwingen nur nach einer Zeit an der Grenze | Die Stellgrößenkurve liegt vor der Auslenkung an einer Grenze |
| **Größere Totzeit als angenommen** | Schwingung mit einer Periode aus der Totzeit | Sprungversuch zeigt die wahre Totzeit; Zurücknehmen stabilisiert |
| **Mit dem Durchsatz veränderliche Totzeit** | Bei einer Produktionsrate stabil, bei einer anderen schwingend | Sprungversuch bei beiden Raten; die Verzögerung unterscheidet sich |
| **Äußere Störung oder Kreiswechselwirkung** | Schwingung mit einer Periode ohne Bezug zu diesem Kreis | **Läuft auf Hand weiter**; korreliert mit einem anderen Kreis oder einer anderen Einheit |
| **Messrauschen** | Hochfrequent, ohne Bezug zur Stellgröße | Auf Hand vorhanden; am Messumformer sichtbar |
| **Streckenverstärkung mit dem Arbeitspunkt verändert** | War in Ordnung, ist es nach einer Raten- oder Zusammensetzungsänderung nicht mehr | Sprungversuch heute gegen die Inbetriebnahmeaufzeichnung |
| **Nichtlinearität** | Schwingt nur in einer Richtung oder nur in einem Bereichsteil | Sprungversuche aufwärts und abwärts, an mehreren Arbeitspunkten |

**Zwei aus dieser Tabelle abgeleitete Regeln sind mehr wert als jede Einstellmethode.**

**Läuft es auf Hand weiter, ist es nicht der Regler.** Der Kreis ist dann ein Störunterdrückungs-, ein Wechselwirkungs- oder ein Messtechnikproblem, und keine Parameteränderung hilft.

**Verlangsamt das Zurücknehmen die Schwingung, ohne sie zu beseitigen, das Stellglied verdächtigen.** Eine einstellungsbedingte Schwingung verschwindet beim Zurücknehmen. Ein Haftreibungs-Grenzzyklus bleibt mit längerer Periode und kleinerer Amplitude bestehen, was wie Besserung aussieht und keine ist — es ist derselbe Mangel, nur langsamer.

## Ventilhaftreibung und das Stellglied

Haftreibung ist die am häufigsten falsch zugeordnete Ursache schlechter Regelgüte und verdient es, auf den ersten Blick erkannt zu werden.

**Der Mechanismus:** Haftreibung bedeutet, dass sich das Ventil erst bewegt, wenn die Signaländerung eine Schwelle überschreitet, und dann über die beabsichtigte Stellung hinausspringt. Der Regler sieht die entstehende Abweichung und kehrt um, das Ventil bleibt wieder haften, und der Kreis geht in einen selbsterhaltenden Grenzzyklus über.

**Die erkennbare Signatur** ist der Formunterschied der beiden Kurven: **Die Stellgröße rampt glatt, während die Messgröße in Stufen springt.** Kein Einstellproblem erzeugt dieses Muster, und keine Neueinstellung entfernt es — der Kreis schwingt, weil das Stellglied unstetig ist, und der Regler tut genau das Richtige.

**Andere Stellgliedfehler haben eigene Symptome:**

- **Hysterese oder Spiel** erzeugt ein Totband bei Richtungsumkehr, sodass der Kreis auf Störungen in beiden Richtungen unsymmetrisch reagiert.
- **Ein überdimensioniertes Ventil** erbringt seine ganze nützliche Stellwirkung im ersten kleinen Teil des Hubs, die wirksame Streckenverstärkung ist also sehr hoch und der Kreis bei kleinem Durchfluss schwer oder nicht regelbar — ein Auslegungsproblem, das als Einstellproblem vorgetragen wird.
- **Ein unterdimensioniertes Ventil** geht in die Begrenzung, und der Kreis erreicht den Sollwert schlicht nicht.
- **Eine unpassende Grundkennlinie** relativ zum installierten Druckgefälle erzeugt eine über den Bereich stark veränderliche Streckenverstärkung, sodass keine einzelne Einstellung überall funktioniert.
- **Der Stellungsregler ist selbst ein Regelkreis.** Ein schlecht eingestellter oder ausfallender Stellungsregler erzeugt Überschwingen, träge Reaktion oder Pendeln, das wie ein Prozessproblem aussieht, und wird durch den Vergleich von Stellungssollwert und Stellungsrückmeldung diagnostiziert, nicht durch Beobachtung des Prozesses.
- **Probleme der Luftversorgung** erzeugen langsame und unvollständige Hübe, oft sporadisch und oft korreliert mit anderen Verbrauchern.

## Kaskadenregelung und Störgrößenaufschaltung

**Die Kaskade existiert, um eine Störung vor dem äußeren Kreis zu verbergen.** Die klassischen Anordnungen — Durchflussregelung innerhalb einer Temperaturregelung, Ventilstellung innerhalb einer Durchflussregelung — legen einen schnellen inneren Kreis um die am häufigsten gestörte Größe, damit der äußere Kreis eine berechenbare Stellgröße sieht.

**Die Voraussetzung ist ein Geschwindigkeitsabstand.** Der innere Kreis muss deutlich schneller sein als der äußere. Bei ähnlicher Dynamik wechselwirken sie, und das Ergebnis ist eine Schwingung, die keine der beiden Einstellungen erklärt.

**Die Reihenfolge liegt fest: zuerst der innere Kreis, dann der äußere mit dem inneren auf Automatik.** Den äußeren Kreis gegen einen inneren im Handbetrieb einzustellen erzeugt Parameter für ein System, das im Betrieb nicht existieren wird.

**Die Fehlermodi sind wenige und vorhersehbar:**

- Der innere Kreis bleibt auf Hand, der äußere arbeitet offen und läuft auf.
- Der innere Kreis geht in die Begrenzung, und der äußere fordert weiter.
- Beide Kreise haben ähnliche Reaktionszeiten und arbeiten gegeneinander.
- Der äußere Kreis wird nachgestellt, um ein Problem zu beheben, das im inneren liegt.

**Die Störgrößenaufschaltung wirkt auf eine gemessene Störung, bevor deren Wirkung in der Messgröße erscheint.** Sie ist die richtige Antwort auf eine große, messbare Störung an einer Strecke mit erheblicher Totzeit, weil Rückführung auf etwas, das sie noch nicht gesehen hat, nicht reagieren kann. Sie braucht ein Modell der Störwirkung, verliert mit dessen Drift an Güte und **ersetzt die Rückführung nie** — sie wird zu ihr addiert, und der Rückführkreis bleibt für alles zuständig, was das Modell nicht erfasst.

## Inbetriebnahme

- Reglerform, Einheiten, Anteilslage und Parametersatz dokumentieren — eine Einstellung ohne ihre Struktur ist weder reproduzierbar noch übertragbar.
- Sprungversuche an den tatsächlich genutzten Arbeitspunkten in beide Richtungen durchführen und dokumentieren.
- Die Stellgrößengrenzen prüfen und bestätigen, dass die Begrenzungsbehandlung des Reglers der physischen Wirklichkeit des Stellglieds entspricht.
- Das Anti-Windup-Verhalten prüfen, indem der Kreis absichtlich in die Begrenzung gefahren und die Rückkehr beobachtet wird.
- In Kaskaden bestätigen, dass der Zustand des inneren Kreises an den äußeren gemeldet wird, und den inneren Kreis auf Hand schalten, um die Reaktion des äußeren zu sehen.
- Die Störunterdrückung prüfen, nicht nur die Sollwertreaktion.
- Das Stellglied prüfen: voller Hub, Reaktion auf kleine Sprünge in beiden Richtungen, Stellungsrückmeldung gegen Sollstellung.
- Sollwert, Messgröße und Stellgröße gemeinsam mit einer Auflösung aufzeichnen, die eine spätere Diagnose trägt.

## Fehlermodi

**Jede Schwingung der Einstellung zugeschrieben.** Sechs der acht Ursachen bleiben von Parametern unberührt.

**Nachstellen versucht, bevor der Kreis auf Hand geschaltet wurde.** Die eine Prüfung, die es in zwei Minuten geklärt hätte.

**Zurücknehmen bei einem Haftreibungs-Grenzzyklus als Erfolg gewertet.** Derselbe Mangel, langsamerer Zyklus.

**Parameter zwischen Reglern anderer Form oder Einheiten kopiert.** Zahlen übertragen, Bedeutung verloren.

**I-Anteil erhöht, um das langsame Pendeln einer integrierenden Strecke zu beheben.** Das Gegenteil der nötigen Änderung.

**Enge Füllstandsregelung an einem Ausgleichsbehälter.** Störungen werden konstruktionsbedingt weitergereicht.

**Kreis nur mit Sollwertsprüngen geprüft.** Ausgezeichnete Folge, schlechte Unterdrückung — und der Kreis existiert für die Unterdrückung.

**D-Anteil an einer verrauschten Messung aktiviert.** Rauschen wird auf das Ventil übertragen.

**Filter eingebaut, um Rauschen zu verbergen, das ein Signalintegritätsmangel ist.** Symptom im Regler behandelt, Nachweis zerstört.

**Anti-Windup-Grenzen, die den physischen Grenzen nicht entsprechen.** Der Regler läuft über einen Bereich auf, den das Ventil nicht hat.

**Kaskade mit innerem Kreis auf Hand eingestellt.** Parameter für ein System, das nicht existieren wird.

**Zustand des inneren Kreises nicht an den äußeren gemeldet.** Windup bei jeder inneren Auslenkung.

**Überdimensioniertes Ventil als Einstellproblem diagnostiziert.** Die ganze Stellwirkung liegt im ersten Hubabschnitt.

**Stellungsreglerprobleme als Prozessprobleme diagnostiziert.** Ein innerer Regelkreis, den niemand angesehen hat.

**Ein Parametersatz über einen weiten Durchsatzbereich mit Transporttotzeit.** Bei einer Rate stabil, bei einer anderen schwingend — konstruktionsbedingt.

**Sprungversuch nur in eine Richtung.** Nichtlinearität und Haftreibung beide unsichtbar.

**Einstellung geändert, ohne festzuhalten, was sie war und warum.** Keine Bezugsgröße und kein Weg, Verbesserung von Drift zu unterscheiden.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Temperaturregelkreis eines kontinuierlichen Prozesses ist bei voller Produktionsrate stabil und gutmütig. Bei reduzierter Rate schwingt er anhaltend. Über zwei Jahre wurde der Kreis viermal nachgestellt, jedes Mal mit etwas kleinerer Verstärkung. Der Betrieb meldet nun, der Betrieb bei kleiner Rate sei akzeptabel, der Kreis sei aber bei voller Rate träge und erhole sich langsam von Störungen.

```text
Symptom:
A temperature loop that oscillates at reduced production rate and is
sluggish at full rate, after repeated reductions in controller gain.

Evidence:
- the measurement is taken downstream of the heating point, with a material
  transit distance between them
- step tests at full rate show a short delay before the measurement begins
  to move; step tests at half rate show a delay roughly twice as long
- the process gain measured at the two rates is similar; only the delay
  differs materially
- the oscillation period at reduced rate is consistent with the longer delay
- the oscillation stops when the loop is placed in manual
- the controller output trace and the measurement have the same shape during
  the oscillation; the output does not ramp while the measurement steps
- the valve strokes smoothly and responds symmetrically to small steps in
  both directions
- the original commissioning record documents a step test performed at full
  production rate only
- each successive retuning reduced gain and left integral time unchanged

Reasoning:
The delay between the heating point and the measurement is a transport delay:
material has to travel from one to the other. Its duration is therefore set by
throughput, and at half rate it is roughly double. Dead time is not a constant
of this process — it is a function of the operating rate.

The loop was commissioned against a step test performed at full rate, so its
parameters were correct for the shortest dead time the process ever exhibits.
At reduced rate the controller is acting on information that is twice as old
as its tuning assumes, which is the classic condition for sustained
oscillation. The fact that the oscillation stops in manual confirms the
controller is participating; the fact that output and measurement share a
shape rules out a stiction limit cycle; the symmetric valve response and the
similar measured process gain rule out the final element and a gain change.

The four retunings addressed the symptom at the worst-case operating point by
detuning for it, which necessarily degraded performance at every other
operating point. Each step was locally rational and the sequence produced a
loop tuned for a condition the plant rarely runs at.

Next investigations:
- characterise the delay across the full operating range rather than at two
  points, and confirm it scales as transport delay would
- decide the control objective explicitly: acceptable at all rates with one
  parameter set, or best achievable at each rate
- evaluate the available options against that objective — tuning for the
  worst-case dead time and accepting the resulting sluggishness, scheduling
  parameters against throughput, using a control structure intended for
  dead-time-dominant processes, or relocating the measurement closer to the
  heating point to reduce the transport delay itself
- re-baseline with step tests at several rates and record them with the rate
  at which each was taken
```

**Zwei übertragbare Lehren.** Erstens: **Die Totzeit ist an jedem Kreis, dessen Verzögerung eine Laufzeit ist, eine Prozessgröße**, und ein einzelner Parametersatz kann einen weiten Durchsatzbereich nur bedienen, wenn er auf den ungünstigsten Fall eingestellt oder umgeschaltet wird. Zweitens: **Eine Folge lokal vernünftiger Nachstellungen erzeugte ein global schlechtes Ergebnis**, weil jeder Schritt für den in jener Woche beklagten Zustand optimierte und niemand die Strecke erneut prüfte. Der Sprungversuch bei zwei Raten — zwanzig Minuten Arbeit — hätte den Mechanismus vor der ersten Nachstellung benannt.

## Empfohlene Praxis

- Vor jeder Parameteränderung den Kreis auf Hand schalten; läuft die Schwingung weiter, den Regler nicht weiter betrachten.
- Reglerform, Einheiten und Anteilslage zu jedem Parametersatz dokumentieren und beim Übertragen zwischen Plattformen alle drei übersetzen.
- Streckenverstärkung, Totzeit und Zeitkonstante durch Sprungversuch an den maßgebenden Arbeitspunkten in beide Richtungen bestimmen und die Aufzeichnungen aufbewahren.
- Die Erreichbarkeit am Verhältnis von Totzeit zu Zeitkonstante beurteilen und die Grenze annehmen, statt gegen sie einzustellen.
- Integrierende Strecken anders behandeln: Sie brauchen wenig I-Anteil, und mehr davon verschlimmert das langsame Pendeln.
- Das Ziel — Folge oder Unterdrückung, eng oder ruhig — vor der Einstellung benennen und mit einer Störung prüfen, nicht nur mit einem Sollwertsprung.
- Mittelwertregelung einsetzen, wo der Behälter Schwankungen aufnehmen soll, und das als bewusste Wahl dokumentieren.
- Windup als strukturell behandeln: Anti-Windup prüfen und sicherstellen, dass die Reglergrenzen den tatsächlichen Grenzen des Stellglieds entsprechen.
- In Kaskaden zuerst innen einstellen, den Zustand des inneren Kreises an den äußeren melden und den Geschwindigkeitsabstand bestätigen.
- D-Anteil nur bei sauberer Messung und mit bewusst gewähltem Filter einsetzen und Rauschen zuerst an der Quelle beheben.
- Einen Haftreibungs-Grenzzyklus am Formunterschied von Stell- und Messgröße erkennen und Zurücknehmen nicht als Heilung akzeptieren.
- Vor Annahme einer Einstelldiagnose das Stellglied prüfen — Hub, Symmetrie, Auslegung, Kennlinie, Stellungsregler, Luftversorgung.
- Die Strecke nach jeder Änderung von Durchsatz, Einsatzstoff oder Ausrüstung erneut prüfen, die Verstärkung oder Verzögerung verändern kann.
- Jede Einstelländerung mit Datum, Grund und dem Arbeitspunkt dokumentieren, an dem sie bestätigt wurde.

## Fazit

Die Einstellung ist ein kleiner Teil der PID-Ingenieurarbeit. Parameter zählen, aber sie wirken in einem System, dessen Dynamik, Stellglied, Messgüte und Struktur bereits das meiste dessen festgelegt haben, was erreichbar ist — und die weit überwiegende Mehrheit der als schlecht eingestellt beschriebenen Kreise sind in Wahrheit korrekt eingestellte Regler, die vernünftig auf eine Strecke, ein Ventil oder eine Messung reagieren, die nicht das ist, was die Einstellung unterstellte.

Die Disziplin ist daher diagnostisch statt numerisch. Den Kreis auf Hand schalten. Die Formen von Stell- und Messgröße vergleichen. Die Strecke bei der tatsächlich gefahrenen Rate in beide Richtungen sprungprüfen. Fragen, wofür der Kreis da ist, bevor man entscheidet, ob er sich richtig verhält. Meistens liegt die Antwort vor, bevor jemand einen Parameter geändert hat — und wenn eine Parameteränderung wirklich die Antwort ist, wird sie einmal gemacht und hält.
