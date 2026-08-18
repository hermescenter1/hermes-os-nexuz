# USV- und Notstromarchitektur für Automatisierungssysteme

## Zusammenfassung

Die Notstromversorgung eines Automatisierungssystems fällt auf eine charakteristische Weise aus, und es ist fast nie die Weise, auf die man sich vorbereitet. Die Batterie ist das Bauteil, das alle beobachten, budgetieren und planmäßig tauschen. Die Architektur ist das Bauteil, das darüber entscheidet, ob all das etwas genützt hat.

Drei Fehlschläge beherrschen die industrielle Erfahrung. **Die kritische Last wurde nach Schrank statt nach Signalweg definiert**, also überstand die SPS den Ausfall und der Netzwerk-Switch zwischen ihr und der Warte nicht. **Die Anlage ließ sich nicht warten**, also erforderte der Batteriewechsel einen Anlagenstillstand, der so lange aufgeschoben wurde, bis die Batterien unbrauchbar waren. Und **die Anlage stand monatelang in einem Zustand, in dem sie überhaupt keinen Schutz bot** — auf Bypass, Frontanzeige gelb, Meldekontakt in einer Rangierverteilung aufgelegt und nie auf irgendetwas abgebildet, das ein Mensch liest.

Dieser Beitrag behandelt Notstrom als Architektur: was die Topologieklassen tatsächlich zusagen, warum „Bypass“ drei verschiedene Dinge benennt, wie man Lasten nach Folgen statt nach Bequemlichkeit einstuft, wie man Autonomie aus einer Anforderung statt aus einem Katalog ableitet, welche Alterungsnachweise einer Batterie es wert sind, erhoben zu werden, wie USV und Generator zusammenwirken, und was Redundanz leistet und was nicht. Die durchgängig referenzierten allgemeinen Erdungsregeln stehen im Begleitbeitrag zur industriellen Erdung; hier geht es nur um die Teile, die einer Notstromversorgung eigen sind.

**Sicherheitsgrenze.** USV-Anlagen führen nach dem Freischalten des Eingangs weiterhin gespeicherte Energie: Die Batterie ist eine aktive Quelle, die kein vorgelagerter Schalter trennt, und die Gleichstrom-Fehlerenergie an einem Batteriestrang ist erheblich. Batteriewechsel, Bypass-Umschaltungen und Entladeprüfungen unterliegen jeweils den Herstelleranweisungen sowie dem Freigabe- und Freischaltregime des Betriebs, und keine davon erfolgt außerhalb dieser. Nichts hier ist ein Verfahren zum Arbeiten an einer unter Spannung stehenden Anlage.

## Topologie: was die Klassifizierung tatsächlich zusagt

IEC 62040 klassifiziert USV danach, wie weit der Ausgang vom Eingang entkoppelt ist, und die Klassifizierung ist eine Aussage über Abhängigkeit, nicht über Güte.

| Klasse | Verhältnis Ausgang zu Eingang | Verhalten bei einer Netzstörung |
| --- | --- | --- |
| **VFI** (spannungs- und frequenzunabhängig) | Ausgang unabhängig von Eingangsspannung *und* -frequenz | Der Wechselrichter speist die Last bereits; ein Netzausfall ändert nur, woher seine Energie kommt |
| **VI** (spannungsunabhängig) | Ausgangsspannung geregelt, Frequenz folgt dem Eingang | Regelt Spannungsschwankungen aus; die Last folgt der Eingangsfrequenz |
| **VFD** (spannungs- und frequenzabhängig) | Ausgang folgt dem Eingang innerhalb von Grenzen | Reicht Störungen durch, bis umgeschaltet wird |

**Für Automatisierungslasten ist die maßgebende Klasse normalerweise VFI**, und der Grund lohnt die genaue Formulierung: Weil der Wechselrichter die Last ohnehin dauerhaft speist, gibt es beim Netzausfall kein Umschaltereignis. Die Last sieht keine Unterbrechung, keinen Phasensprung und keinen Frequenzsprung. Eine Anlage, die beim Versorgungsverlust *umschalten* muss, hat eine Umschaltzeit, und ob diese Zeit zählt, hängt vom Überbrückungsvermögen jedes dahinterliegenden Netzteils ab — eine Angabe, die für die gesamte Gerätepopulation einer Anlage niemand besitzt.

**Die daraus folgende Unterscheidung bestimmt den Rest der Auslegung: Eine VFI-Anlage schaltet beim Netzausfall nicht um, aber sie schaltet um, wenn der Wechselrichter selbst die Last nicht halten kann.** Diese Umschaltung ist der statische Bypass, und alles daran ist eine Auslegungsentscheidung.

## Drei Dinge, die „Bypass“ heißen

Diese zu vermischen ist das häufigste Architekturmissverständnis im Notstrombereich.

**Der statische Bypass** ist eine automatische, schnelle elektronische Umschaltung, die die Last vom Wechselrichter auf die rohe Bypass-Versorgung legt, wenn der Wechselrichter sie nicht halten kann — eine Überlast jenseits seines Vermögens, ein Wechselrichterfehler, eine Übertemperatur. Er ist eine Schutzfunktion: Er hält die Last unter Spannung, um den Preis der Konditionierung.

Zwei Eigenschaften des statischen Bypasses werden regelmäßig übersehen. **Er verlangt, dass der Wechselrichter mit der Bypass-Quelle synchronisiert ist**, denn eine Umschaltung zwischen zwei nicht synchronisierten Quellen würde der Last einen Phasensprung aufzwingen. Liegt die Bypass-Quelle außerhalb des Synchronisierfensters — falsche Frequenz, falsche Spannung, gar nicht vorhanden —, steht die Umschaltung nicht zur Verfügung, und die USV lässt die Last eher fallen, als auf eine Quelle zu schalten, mit der sie sich nicht verbinden kann. **Und er verlangt, dass die Bypass-Quelle überhaupt existiert**, was zum zweiten Punkt führt: Kommen Bypass-Einspeisung und Gleichrichter-Einspeisung vom selben vorgelagerten Schalter, entfernt eine vorgelagerte Auslösung beide, und der „Bypass“ ist kein unabhängiger Weg.

**Der Wartungsbypass** — auch Wrap-around-Bypass — ist eine manuelle, mechanisch verriegelte Anordnung, die es erlaubt, die gesamte USV samt statischem Schalter und internen Schienen für den Service freizuschalten, während die Last weiter aus dem Netz gespeist wird. Er ist keine Schutzfunktion, sondern ein *Wartbarkeitsmerkmal*, und sein Fehlen hat eine sehr konkrete Folge: **Eine USV ohne Wartungsbypass kann ihre Batterien nicht wechseln, ihre Lüfter nicht tauschen und ihre Kondensatoren nicht warten, ohne die Last fallen zu lassen, für deren Schutz sie existiert.**

Diese Folge verstärkt sich mit der Zeit. Wartung, die einen Anlagenstillstand erfordert, wird aufgeschoben. Lange genug aufgeschoben, erreichen die Batterien einen Zustand, in dem die Anlage die Last ohnehin nicht mehr trüge — und der erste Beleg dafür ist ein Ausfall.

**Die externe Bypass-Einspeisung** ist die Frage, *woher der Bypass-Strom kommt*, und sie verdient eine eigene Entscheidung. Eine getrennte Einspeisung aus einer anderen Verteilung, idealerweise über ein anderes vorgelagertes Gerät, macht aus dem Bypass statt eines schicksalsgleichen Wegs einen wirklich alternativen.

**Auslegungsregel:** statischen Bypass, Wartungsbypass und Bypass-Quelle als drei getrennte Positionen spezifizieren und jede vor der Bestellung im Übersichtsschaltplan bestätigen. Ein Wrap-around-Feld nachträglich in eine laufende Anlage einzubauen, ist ein teures und störendes Projekt.

## Lasteinstufung: nach Signalweg, nicht nach Schrank

Dieser Abschnitt verhindert genau den Fehlschlag im Szenario am Ende dieses Beitrags.

**Nach der Folge des Lastverlusts einstufen, nicht nach der Gerätekategorie:**

| Klasse | Folge des Verlusts | Übliche Versorgung |
| --- | --- | --- |
| **Kritisch** | Unkontrolliertes Prozessverhalten, Verlust der Sicht oder der Steuerung | USV mit Autonomie für die erforderliche Handlung |
| **Wesentlich** | Produktionsverlust mit langem oder teurem Wiederanlauf | Generatorgestützt, teils USV für die Umschaltlücke |
| **Normal** | Unannehmlichkeit, Wiederanlauf ist billig | Normale Versorgung |

**Die Einstufung muss der Funktion folgen, und Funktionen verlaufen quer über Schränke.** Die Verfügbarkeit eines Leitsystems wird vom am schlechtesten gestützten Element seines Signalwegs bestimmt. Diesen Weg ehrlich abzuschreiten ergibt jedes Mal eine überraschende Liste:

- SPS-CPUs, Baugruppenträger und E/A-Netzteile
- Steuerstromversorgungen und die sie speisenden Gleichspannungsnetzteile
- **Netzwerk-Switches, Medienkonverter und Faser-Transceiver auf jedem Abschnitt zwischen Steuerung und Server** — routinemäßig aus der nächstgelegenen Steckdose versorgt
- SCADA-Server, Historians und die Verzeichnis- oder Anmeldedienste, von denen sie abhängen
- Bedienplätze und die Anzeigen, die „Verlust der Sicht“ zu einer realen Kategorie machen
- Feldgeräteversorgung, wo Messumformer aus einer E/A-Baugruppe oder aus einem getrennten Feldnetzteil gespeist werden
- Magnetventilversorgungen, wo die sichere Prozessstellung davon abhängt, dass ein Ventil sich bewegt und nicht stehen bleibt
- Fernwirktechnik und Verbindungen zu Außenstationen, deren Gegenstelle an fremdem Strom hängt

**Zwei Ausschlüsse zählen so viel wie die Aufzählung.** Sicherheitsbezogene Systeme werden nicht dadurch angemessen, dass man sie auf eine USV legt: Ihre Versorgungsanordnung folgt aus ihrer eigenen funktionalen Sicherheitsauslegung, und ihr Verhalten bei Versorgungsverlust ist Teil der Sicherheitsfunktion, nicht ein Erbe der allgemeinen Elektroplanung. Und **Lasten mit hohem Einschaltstrom oder hohem Dauerbedarf gehören überhaupt nicht auf eine kritische Versorgung** — Motoren, Heizungen, Schweißsteckdosen und der Allzweck-Steckdosenstromkreis, in den irgendwann jemand einen Staubsauger steckt. Einschaltstrom am USV-Ausgang löst keinen Schutzschalter elegant aus; er treibt die USV in den statischen Bypass, also genau in den Zustand, in dem der bezahlte Schutz fehlt.

**Das Ergebnis ist eine Lasteinstufungsliste** — ein Dokument, das jeden Stromkreis, seine Klasse, seine Versorgungsquelle und die von ihm bediente Funktion aufführt. Ein Betrieb mit Kabelliste und ohne Lasteinstufungsliste wird über Jahre kleiner Änderungen Stromkreise aus Bequemlichkeit zwischen Versorgungen verschieben, und niemand bemerkt es, bis ein Ausfall das Ergebnis prüft.

## Autonomie ist eine Anforderung, keine Batteriegröße

**Die Autonomie sollte aus dem abgeleitet werden, was während des Ausfalls geschehen muss.** Die möglichen Anforderungen unterscheiden sich wirklich voneinander:

- **Kurze Unterbrechungen überbrücken** — bemessen aus dem gemessenen Ausfallprofil des Standorts, nicht aus einer runden Zahl.
- **Bis zum Generator überbrücken** — bemessen aus der ungünstigsten Start- und Stabilisierungszeit, zuzüglich Umschaltung und einer Reserve für einen fehlgeschlagenen ersten Startversuch.
- **Ein geordnetes Herunterfahren ermöglichen** — bemessen aus der tatsächlichen, gemessenen statt geschätzten Zeit bis zum sicheren Prozesszustand.
- **Einen manuellen Eingriff tragen** — bemessen aus der Zeit, die ein Mensch bis zum Eintreffen und Handeln braucht, die nachts an einem abgelegenen Standort eine andere ist als die im Büro angenommene.

Drei Korrekturen gelten für nahezu jede im Feld angetroffene Auslegungsrechnung:

**Nach der tatsächlichen Last bemessen, aber für die künftige Last auslegen.** Autonomie verhält sich umgekehrt zur Last; eine USV bei einem Bruchteil ihrer Bemessungslast hat weit mehr Autonomie als der Datenblattwert, und alle freuen sich — bis die Last wächst.

**Nach der Kapazität am Lebensdauerende bemessen, nicht nach der Neukapazität.** Die nutzbare Kapazität einer Batterie sinkt über ihre Lebensdauer, und Hersteller definieren ein Lebensdauerende-Kriterium, unterhalb dessen die Batterie als verbraucht gilt. Eine Auslegung, die ihre Autonomieanforderung nur mit neuen Batterien erfüllt, erfüllt sie einen Bruchteil des Wechselintervalls lang.

**Nach der tatsächlichen Umgebungstemperatur bemessen.** Kapazität und Lebensdauer hängen beide von der Temperatur ab, und ein warm laufender Batterieraum liefert heute weniger Kapazität und insgesamt eine kürzere Lebensdauer.

## Batteriealterung: was der Nachweis wert ist

**Die Ladeerhaltungsspannung sagt fast nichts über die Kapazität.** Ein Strang auf korrekter Erhaltungsspannung kann erheblich degradiert sein, denn diese Spannung ist eine Aussage über das Ladegerät, nicht über gespeicherte Energie. Anlagen, die auf dieser Grundlage „Batterie in Ordnung“ melden, melden über das Ladegerät.

**Die Trendbeobachtung von Innenwiderstand oder Leitwert ist ein Screening-Indikator.** Konsistent an denselben Blöcken mit demselben Gerät gemessen, erkennt ein steigender Trend degradierende Blöcke vor dem Ausfall und findet Ausreißer innerhalb eines Strangs. Es ist eine vergleichende Messung — ihr Wert liegt im Verlauf und in der Streuung über den Strang, nicht in einem absoluten Zahlenwert.

**Eine Entladeprüfung ist die einzige direkte Kapazitätsmessung**, und sie ist zugleich die Prüfung, die vermieden wird, weil die Anlage währenddessen nichts schützt. Genau deshalb gehört sie geplant statt improvisiert: auf dem Wartungsbypass, zu einem gewählten Zeitpunkt, mit aufgezeichneter Entladung, damit das Ergebnis ein Verlauf statt eines Bestanden/Nicht-bestanden wird.

**Ein Strang ist ein Reihenkreis**, mit einer unbarmherzigen Folge: Der schwächste Block bestimmt den Strang. Ein Block, der Kapazität verloren hat, begrenzt die Autonomie des ganzen Strangs unabhängig vom Zustand der übrigen, und ein offen ausgefallener Block entfernt den Strang vollständig. Deshalb ist eine Überwachung auf Blockebene, wo sie existiert, mehr wert als eine auf Strangebene, und deshalb ist die Streuung über einen Strang eine nützlichere Zahl als sein Mittelwert.

**Die Chemie bestimmt das Wartungsregime, nicht die Auslegungsabsicht.** Ventilgeregelte Bleibatterien sind kompakt und wartungsarm, aber temperaturempfindlich und zum thermischen Durchgehen fähig; offene Bleibatterien halten länger, verlangen aber einen belüfteten Raum und Elektrolytpflege; lithiumbasierte Systeme bieten höhere Dichte und bessere Temperaturtoleranz, bringen aber ein Batteriemanagementsystem mit, das Teil des Sicherheitsnachweises ist, sowie andere Brand-, Lager- und Transportbedingungen. **Jede davon ist eine andere Wartungs- und Gebäudeverpflichtung**, und die Wahl gehört mit denen getroffen, die sie später warten.

## DC-Anlagen, wo sie zutreffen

In Schaltanlagen und in Teilen vieler Prozessanlagen ist die kritische Versorgung gar keine Wechselstrom-USV, sondern eine DC-Anlage — Batterie, Ladegerät und Gleichstromverteilung für Auslöse- und Einschaltspulen, Schutzrelais sowie einen Teil der Steuerung und der Sicherheitsbeleuchtung.

Drei Merkmale unterscheiden sie von einer AC-USV und verdienen ausdrückliche Erwähnung:

**Die DC-Anlage ist normalerweise ungeerdet**, mit ständiger Isolationsüberwachung. Ein erster Erdschluss wird gemeldet und nicht abgeschaltet — genau wie in einem ungeerdeten Wechselstromsystem und aus demselben Grund: Die Kontinuität der Schutzversorgung wiegt schwerer als das Klären eines einzelnen Fehlers.

**Ein zweiter Erdschluss in einer DC-Anlage kann eine Auslösespule betätigen.** Besteht ein Erdschluss an einem Pol und tritt ein zweiter auf der anderen Seite eines Auslösekreises auf, kann der Fehlerpfad die Spule erregen — eine ungewollte Betätigung ohne jeden Befehl dahinter. **Das macht einen unbehobenen ersten Erdschluss in einer Stations-DC-Anlage zu etwas grundlegend anderem als einer Unannehmlichkeit**, und deshalb ist die Isolationsüberwachung dort eine Schutzfunktion und keine Wartungshilfe.

**Das Ladegerät wird für die Dauerlast zuzüglich der Batterienachladung bemessen**, nicht für die Last allein. Ein nur nach der Last bemessenes Ladegerät führt die Batterie nach einer Entladung langsam oder gar nicht zurück und lässt die Anlage für eine Zeit ohne Autonomie, die niemand berechnet hat.

## Generatorzusammenspiel und Umschaltverhalten

USV und Netzersatzanlage bilden ein System, und die Schnittstelle dazwischen ist die Stelle, an der vieles schiefgeht.

**Die vorgesehene Abfolge:** Netz fällt aus; die USV trägt die Last unterbrechungsfrei aus der Batterie; der Generator startet und stabilisiert sich; die Umschalteinrichtung legt die Versorgung um; der USV-Gleichrichter startet am Generator wieder an und beginnt zu laden.

**Die Mechanismen, die das brechen:**

- **Der Gleichrichter ist für den Generator eine Sprunglast und eine nichtlineare Last.** Ein nach stationärer Wirkleistung bemessener Generator kann den Bedarf des USV-Gleichrichters als Sprung womöglich nicht annehmen oder von dessen Oberschwingungsstrom Spannungsregelungsprobleme bekommen. Der **Gleichrichter-Sanftanlauf (Walk-in)** — eine kontrollierte Rampe des Eingangsbedarfs — existiert genau dafür, gehört aktiviert und in seiner Rampenzeit auf das Generatorvermögen abgestimmt.
- **Die Generatorfrequenz schwankt stärker als die Netzfrequenz.** Schwankt sie über das Synchronisierfenster des USV-Bypasses hinaus, **steht der statische Bypass während des gesamten Generatorbetriebs nicht zur Verfügung** — das heißt, in der Phase des höchsten Risikos lässt eine Überlast oder ein Wechselrichterfehler die Last fallen, statt umzuschalten. Das Fenster zu erweitern, soweit die angeschlossenen Geräte es vertragen, und die Frequenzstabilität des Generators gegen das USV-Fenster zu spezifizieren, sind beides Auslegungshandlungen.
- **Die Umschaltung selbst ist eine Unterbrechung**, die die USV überbrücken muss, und die Rückschaltung ans Netz eine zweite.
- **Die Batterie ist womöglich vor dem nächsten Ereignis nicht nachgeladen**, wenn das Ausfallprofil aus einer Folge von Unterbrechungen statt aus einem langen Ausfall besteht.

**Nichts davon ist aus Datenblättern nachweisbar.** Nachgewiesen wird es, indem die Anlage am Generator unter Last mit eingeschleifter USV betrieben und beobachtet wird, was die USV tut — eine Inbetriebnahmeprüfung, die einen Nachmittag kostet und häufiger als jede andere entfällt.

## Redundanz und die Eigenschaft, die sie nicht ist

| Anordnung | Schützt gegen | Schützt nicht gegen |
| --- | --- | --- |
| **Modulredundanz (N+1)** | Ausfall eines Leistungsmoduls | Gemeinsamen Batteriestrang, gemeinsamen statischen Schalter, gemeinsame Ausgangsstufe, gemeinsamen Bypass, gemeinsame Einspeisung |
| **Systemredundanz (parallele Einheiten)** | Ausfall einer kompletten USV | Eine gemeinsame Ausgangsverteilung oder einen gemeinsamen nachgelagerten Verteilpunkt |
| **Zweiwegversorgung (A und B)** | Ausfall eines ganzen Verteilwegs | Einfach eingespeiste Lasten, die nur einen Weg sehen |

**N+1 ist eine Aussage über Module, und die interessanten Ausfälle liegen meist nicht in den Modulen.** Ein Rahmen mit redundanten Modulen, aber einem Batteriestrang, einem statischen Bypass und einem Eingangsschalter hat von jedem dieser Teile genau eines, und die Redundanz adressiert keines davon.

**Zweiwegarchitekturen werden von den Lasten begrenzt.** Ein Server mit zwei Netzteilen profitiert; ein Switch, eine Steuerung oder ein Feldnetzteil mit einem Eingang nicht — es sei denn, ein statischer Umschalter an der Last wählt zwischen den beiden Wegen. Eine Bestandsaufnahme einfach eingespeister Geräte in einer Zweiweganlage ist eine kurze, billige und häufig alarmierende Übung.

**Wartbarkeit im Betrieb ist eine andere Eigenschaft als Fehlertoleranz.** Fehlertoleranz fragt: Übersteht die Anlage den Ausfall eines Bauteils? Wartbarkeit im Betrieb fragt: Lässt sich jedes Bauteil absichtlich zur Wartung außer Betrieb nehmen, ohne die Last fallen zu lassen? Eine Anlage kann fehlertolerant und nicht im Betrieb wartbar sein, und eine solche Anlage häuft still aufgeschobene Wartung an.

## Erdung an der Schnittstelle

Die allgemeinen Regeln gehören zum Erdungsbeitrag; zwei Punkte sind USV-spezifisch und häufig falsch.

**Ob der USV-Ausgang ein eigenständig gespeistes System ist, bestimmt, wo die Neutralleiter-Erde-Verbindung hergestellt wird.** Manche Konfigurationen führen den Neutralleiter der Quelle durch; andere errichten den Ausgang als eigenständig gespeistes System mit eigener Verbindung. Ein Fehler hier erzeugt entweder einen Ausgang ohne definierten Erdbezug oder eine zweite Neutralleiter-Erde-Verbindung mit Ausgleichsstrom im Schutzsystem — was, wie stets, als unerklärliches Störungsproblem und nicht als elektrische Meldung erscheint.

**Die Erdungsanordnung der Last darf sich beim Umschalten der USV nicht ändern.** Eine Last, die am Wechselrichter anders geerdet ist als am Bypass, hat einen Fehlerschutz, der vom internen Zustand der USV abhängt — nichts, das jemand absichtlich so aufschreiben würde.

## Überwachung: der wichtigste Zustand ist der am seltensten gemeldete

Erfassen Sie mindestens, in einem System, das ein Mensch tatsächlich beobachtet: Betriebsart (Wechselrichter, Batterie, statischer Bypass, Wartungsbypass), Batteriespannung und -strom, Batterietemperatur, Blockimpedanz wo verfügbar, Last je Phase, geschätzte Restautonomie und die Meldehistorie.

**„Auf Bypass“ ist der wichtigste Zustand und der am häufigsten nicht überwachte.** Eine USV auf statischem Bypass reicht rohen Netzstrom an die kritische Last durch. Sie schützt nichts. Sie hat keine Autonomie. Und von außerhalb des Raums sieht sie exakt wie eine gesunde Anlage aus. Ein Standort, der diesen Zustand nicht aus der Warte erkennen kann, weiß nicht, ob er derzeit eine USV hat.

**Ein in einer Rangierverteilung aufgelegter Meldekontakt ist keine Überwachung.** Der Nachweisweg muss bei einem Menschen enden oder bei einem System, das an einen eskaliert.

## Inbetriebnahme

- **Die tatsächliche Last messen** und je Phase mit der Auslegungsannahme vergleichen.
- **Das Wartungsbypass-Verfahren ausführen**, zu einem Zeitpunkt, an dem das sicher ist, und bestätigen, dass es wie geschrieben funktioniert — ein Verfahren ist nicht belegt, bevor jemand ihm gefolgt ist.
- **Eine Entladeprüfung bei Auslegungslast durchführen** und die erreichte Autonomie aufzeichnen; das wird die Bezugsgröße jeder künftigen Prüfung.
- **Eine Umschaltung auf statischen Bypass und zurück erzwingen** und die Last beobachten.
- **Den Standort am Generator unter Last mit eingeschleifter USV betreiben** und bestätigen, dass der Gleichrichter wieder anläuft, der Walk-in sich erwartungsgemäß verhält und der Bypass synchronisiert bleibt.
- **Den Meldeweg durchgängig nachweisen**, vom USV-Kontakt oder der Protokollschnittstelle bis zur Anzeige in der Warte.
- **Einbaudatum der Batterie und Ausgangswerte der Impedanz dokumentieren** — ein Verlauf, der drei Jahre nach dem Einbau beginnt, hat seinen nützlichsten Bezugspunkt verloren.

## Fehlermodi

**Kritische Last nach Schrank statt nach Signalweg definiert.** Die Steuerung überlebt, der Netzwerk-Switch nicht, die Anlage verliert die Sicht trotzdem.

**Kein Wartungsbypass.** Der Batteriewechsel verlangt einen Stillstand, also wird er aufgeschoben, also fallen die Batterien aus.

**Bypass-Einspeisung vom selben vorgelagerten Schalter wie der Gleichrichter.** Der „alternative“ Weg teilt sein Schicksal mit dem primären.

**USV monatelang auf statischem Bypass belassen.** Kein Schutz, keine Autonomie und kein Hinweis an einer Stelle, an die jemand schaut.

**Meldekontakt aufgelegt, aber nie abgebildet.** Der Nachweis existiert und erreicht niemanden.

**Autonomie nach Neukapazität bei Nenntemperatur bemessen.** Die Anforderung ist einen Bruchteil der Batterielebensdauer lang erfüllt.

**Autonomie nach der heutigen Last bemessen.** Die Reserve verschwindet mit dem Wachstum, und niemand rechnet nach.

**Batteriezustand aus der Erhaltungsspannung beurteilt.** Eine Aussage über das Ladegerät, gehalten für eine über die Kapazität.

**Entladeprüfung nie durchgeführt, weil sie stört.** Die Kapazität bleibt unbekannt, bis ein Ausfall sie misst.

**Ein schwacher Block im Strang als eine schlechte Batterie behandelt.** Er begrenzt die Autonomie des ganzen Strangs.

**Generator nicht mit eingeschleifter USV unter Last geprüft.** Sprunglast, Oberschwingungswechselwirkung und Bypass-Synchronisation allesamt ungeprüft.

**Bypass-Synchronisierfenster unverträglich mit der Frequenzstabilität des Generators.** Der statische Bypass fehlt genau dann, wenn die Anlage am stärksten exponiert ist.

**N+1-Module mit einem Batteriestrang, einem statischen Schalter und einem Eingangsschalter.** Redundanz für das Bauteil, das am wenigsten wahrscheinlich das Problem ist.

**Zweiwegverteilung, die einfach eingespeiste Geräte versorgt.** Zwei Wege, ein Eingang, kein Nutzen.

**Motor-, Heiz- oder Steckdosenstromkreise auf der kritischen Versorgung.** Der Einschaltstrom treibt die USV in den Bypass.

**Neutralleiter-Erde-Anordnung am Wechselrichter anders als am Bypass.** Fehlerschutz, der vom internen Zustand der USV abhängt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Eine Wasseraufbereitungsanlage übersteht Netzunterbrechungen seit Jahren ohne Vorkommnis. Bei einem gewöhnlichen Ausfall geht das Leitsystem verloren: Das Bedienpersonal verliert jede Sicht, eine automatische Sequenz bleibt auf halbem Weg stehen, und die Wiederherstellung dauert mehrere Stunden. Die USV wird untersucht und ist völlig in Ordnung — ihr Protokoll zeigt eine saubere Umschaltung auf Batterie und ein vollständiges Tragen des Ausfalls mit reichlich Reserve.

```text
Symptom:
Total loss of control-room visibility and a halted sequence during a mains
outage, despite a UPS that carried its load correctly throughout.

Evidence:
- the UPS event log records a clean transition to battery, no alarms, and
  substantial remaining autonomy at the end of the outage
- the PLC and the SCADA servers both remained powered and running; neither
  logged a power event
- the two network switches linking the field PLC panel to the server room
  are fed from a small distribution board that is not on the UPS
- those switches were originally fed from a UPS-backed socket in the server
  room and were moved during a cabinet rationalisation two years ago
- the change is recorded as a revision to a cabling drawing; there is no
  load classification schedule against which it could have been checked
- the UPS per-phase load reading fell after the move and was never queried
- separately: the UPS "on static bypass" signal is a volt-free contact
  terminated in a marshalling box, and it is not mapped to any input
- the site has no record of the UPS ever having been on bypass, and also no
  means of knowing whether it has

Reasoning:
Two independent findings, one active and one latent. The active one is an
architecture error rather than an equipment failure: the availability of a
control system is set by the least-backed element in its signal path, and a
network switch is part of that path. Because the site classifies loads by
cabinet rather than by function, the switches were moved as a cabling
decision, and nothing in the site's documentation was capable of flagging
that a critical path had been broken. The falling UPS load was the visible
symptom of the change and was read as good news.

The latent finding is more serious in the long run. The site cannot detect
the one state in which the UPS provides no protection at all. A UPS sitting
on static bypass looks healthy from every angle except its own front panel,
and this site has no path from that panel to a human being.

Next investigations:
- trace the full signal path from each critical controller to the control
  room and to any remote link, and list every powered element on it
- build a load classification schedule from that trace, and audit every
  UPS-fed and non-UPS-fed circuit against it
- measure the present per-phase load and recompute autonomy at end-of-life
  battery capacity and at the actual room ambient
- map the bypass and battery alarms into the control system and prove the
  path end to end
- plan a discharge test on the maintenance bypass and establish a baseline
```

**Die übertragbare Lehre lautet: Eine USV schützt Stromkreise, und eine Anlage hängt an Funktionen.** Nichts ist hier ausgefallen außer der Annahme, das sei dasselbe. Die Abhilfe ist keine größere USV, sondern ein Dokument — eine aus Signalwegen abgeleitete Lasteinstufungsliste — plus ein Meldeweg, der den Eigenzustand der Anlage denen sichtbar macht, die von ihr abhängen.

## Empfohlene Praxis

- Für Automatisierungslasten eine VFI-Anlage spezifizieren und ausdrücklich festhalten, dass die Anforderung dauerhafte Wechselrichterspeisung ist und nicht eine schnelle Umschaltung.
- Statischen Bypass, Wartungsbypass und Bypass-Quelle als drei getrennte Positionen behandeln und alle drei vor der Bestellung im Übersichtsschaltplan bestätigen.
- Den Bypass aus einem wirklich anderen vorgelagerten Weg speisen — oder ausdrücklich dokumentieren, dass er nicht unabhängig ist.
- Die Lasteinstufungsliste aus Signalwegen aufbauen, nicht aus Schränken, und jeden Netzwerkabschnitt, jede Serverabhängigkeit und jede Feldversorgung auf dem Weg aufnehmen.
- Motoren, Heizungen und Allzweck-Steckdosenkreise von der kritischen Versorgung fernhalten.
- Die Autonomie aus der Handlung ableiten, die der Ausfall verlangt — Überbrücken, Generatorbrücke, geordnetes Herunterfahren oder menschlicher Eingriff — und festhalten, welche es ist.
- Die Autonomie nach Kapazität am Lebensdauerende, tatsächlicher Raumtemperatur und einer Lastzahl bemessen, die Wachstum vorwegnimmt.
- Die Batteriechemie mit denen wählen, die sie warten werden, und die Raumbedingungen bereitstellen, die diese Chemie verlangt.
- Die Blockimpedanz konsistent im Verlauf führen und die Streuung über den Strang lesen, nicht den Mittelwert.
- Periodische Entladeprüfungen auf dem Wartungsbypass planen und durchführen und die Ergebnisse als Verlauf führen.
- In DC-Anlagen die Isolationsüberwachung als Schutzfunktion und den ersten Erdschluss als zu ortenden und zu behebenden Mangel behandeln.
- DC-Ladegeräte für die Dauerlast zuzüglich Batterienachladung bemessen.
- Den Generator mit eingeschleifter USV unter Last prüfen; den Gleichrichter-Walk-in aktivieren und abstimmen; die Bypass-Synchronisation im Generatorbetrieb nachweisen.
- Fehlertoleranz von Wartbarkeit im Betrieb unterscheiden und festhalten, welche die Auslegung liefert.
- Einfach eingespeiste Lasten in jeder Zweiweganlage erfassen.
- Bestätigen, dass die Erdungsanordnung der Last am Wechselrichter und am Bypass identisch ist.
- Den Zustand „auf Bypass“ in ein System melden, das ein Mensch beobachtet, und den Weg bei der Inbetriebnahme durchgängig nachweisen.

## Fazit

Eine USV ist ein Bauteil. Notstromversorgung ist eine Architektur, und diese Architektur wird durch drei Dokumente definiert, die den meisten Standorten fehlen: eine aus Signalwegen abgeleitete Lasteinstufungsliste, eine Autonomierechnung, die an eine benannte Anforderung und an die Kapazität am Lebensdauerende gebunden ist, und ein Wartungsweg, der Service ohne Anlagenstillstand erlaubt.

Alles Weitere folgt daraus. Batterien altern vorhersagbar und lassen sich im Verlauf führen; Generator und Gleichrichter wechselwirken auf eine Weise, die aus einem Nachmittag Prüfung vollständig erkennbar ist; Redundanz kauft genau das, was sie sagt, und nicht mehr. Die Fehlschläge sind nicht rätselhaft. Sie sind das angesammelte Ergebnis kleiner Entscheidungen — ein Switch, der an eine nähere Steckdose kam, eine Prüfung, die als störend aufgeschoben wurde, ein Meldekontakt, der in der Rangierverteilung blieb —, von denen keine im Moment ihres Treffens wie eine Entscheidung über die Notstromversorgung aussah.
