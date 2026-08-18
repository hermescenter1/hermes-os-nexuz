# Methodik der Fehlersuche in Industrienetzen

## Zusammenfassung

Die meisten Fehlersuchen in Industrienetzen scheitern aus demselben Grund: Sie beginnen mit einem Werkzeug statt mit einer Frage. Jemand öffnet ein Diagnoseprogramm, sieht einen Bildschirm voller Zähler und beginnt Theorien über Daten zu bilden, die noch mit keinem Symptom verknüpft sind.

Die Methode, die funktioniert, kehrt diese Reihenfolge um. Sie beginnt damit, das tatsächlich Beobachtete so genau aufzuschreiben, dass es falsch sein könnte, und nutzt anschließend den billigsten verfügbaren Beleg — fast immer **was gemeinsam ausgefallen ist** —, um den Suchraum zu halbieren, bevor irgendetwas gemessen wird. Die Werkzeuge kommen später, ausgewählt, weil eine bestimmte Frage sie braucht.

Dieser Beitrag ist protokollunabhängig. Er gilt, ob das Netz PROFINET, EtherNet/IP, Modbus TCP oder Leitebenenverkehr trägt, und er ist für die Ingenieurin oder den Ingenieur geschrieben, die als Zweite kommen — nachts, bei stehender Anlage.

## Schritt 0: Das Symptom definieren, bevor irgendetwas betrachtet wird

„Das Netz ist langsam“ ist kein Symptom; es ist eine Schlussfolgerung, die jemand anderes bereits gezogen hat. Ersetzen Sie sie durch eine Aussage, die sich widerlegen ließe.

Sechs Fragen erzeugen diese Aussage:

- **Was wird beobachtet, als Verhalten?** Eine an der Steuerung als gestört gemeldete Station, ein einfrierender Wert auf einem Bild, ein Chargenbericht mit fehlenden Zeilen — das sind verschiedene Fehler.
- **Wer beobachtet es?** Bediener, Steuerung, Historian und Engineering sehen verschiedene Ebenen. Ein Fehler, den nur eine dieser Instanzen sieht, ist bereits lokalisiert.
- **Wann?** Ein Zeitstempel — und ob sich die Ereignisse häufen: Schichtwechsel, ein bestimmtes Produkt, eine bestimmte Kranbewegung, eine Tageszeit.
- **Wie oft und wie lange?** Dauernd, periodisch oder ausgelöst. Sekunden oder Minuten.
- **Was ist nicht betroffen?** Diese Frage wird am häufigsten übersprungen und ist die wertvollste. Alles, was noch funktioniert, ist eine Grenze der Fehlerdomäne.
- **Was hat sich geändert?** Jede Änderung — ein getauschtes Gerät, ein Programmdownload, ein Firmware-Update, Kabelarbeiten, ein neuer Client, ein Parameter — ist ein Kandidat, und „es hat sich nichts geändert“ ist eine zu prüfende Behauptung, keine Tatsache.

**Das Ergebnis von Schritt 0 ist ein einziger Satz, der sagt, was ausfällt, was nicht, und unter welchen Bedingungen.** Ohne ihn ist alles Weitere nicht widerlegbar.

## Die Fehlerdomäne aufteilen

Die aussagekräftigste Messung in Industrienetzen kostet nichts und liegt vor, bevor ein Werkzeug geöffnet wird: **die Menge dessen, was gemeinsam ausfiel, verglichen mit der Menge dessen, was nicht ausfiel.**

| Beobachtung | Unmittelbare Folgerung |
| --- | --- |
| Ein Gerät offline, Nachbarn am selben Switch in Ordnung | Gerät, sein Port, sein Kabel — nicht die Infrastruktur |
| Alle Geräte eines Switches offline | Dieser Switch, seine Versorgung oder sein Uplink |
| Geräte mehrerer Switches gemeinsam offline | Ein gemeinsamer Uplink, Core-Switch oder gemeinsamer Pfad |
| Eine Zelle offline, andere Zellen in Ordnung | Die Verteilung dieser Zelle — VLAN, Switch oder Uplink |
| SCADA veraltet, Steuerung läuft normal mit gesunder Peripherie | Nur der Leitebenenpfad; die Steuerungsebene ist intakt |
| Alle Leitebenen-Clients veraltet, Steuerungen gesund | Leitebenenserver oder dessen Pfad, nicht das Feldnetz |
| Ein Protokoll gestört, ein anderes zwischen denselben Hosts in Ordnung | Nicht der physikalische Pfad; Anwendungs- oder Sitzungsproblem |

**Die Argumentation ist stets dieselbe: Was gemeinsam ausfiel, teilt etwas — und die Architektur sagt Ihnen, was.** Deshalb ist eine dokumentierte Topologie ein Diagnosevorteil und kein Papierkram: In einem undokumentierten Netz trägt „diese sechs Geräte fielen aus“ fast keine Information, in einem dokumentierten benennt es womöglich unmittelbar die fehlerhafte Komponente.

**Die Unterscheidung Leitebene gegenüber Steuerung verdient besondere Betonung**, weil sie die größte verfügbare Reduktion des Suchraums in einer Anlage ist. Läuft die Steuerung, ist ihre zyklische Peripherie gesund und verhalten sich die Verriegelungen normal, dann funktioniert das Feldnetz, und das Problem liegt zwischen Steuerung und Leitebene. Damit ist die halbe Topologie erledigt, bevor ein einziges Kabel angefasst wurde.

## Wo anfangen

Das Schichtenmodell ist eine gute Karte und ein schlechter Weg. Bei Schicht 1 zu beginnen und aufzusteigen ist gründlich und langsam; bei der Anwendung zu beginnen ist schnell und meist falsch.

**Beginnen Sie auf der Ebene, auf die das Symptom deutet, und teilen Sie dann den Rest.** Praktische Auswahl:

- **Das Symptom betrifft mehrere Geräte mit gemeinsamer Infrastruktur** → mit Linkzustand und Portzählern am gemeinsamen Element beginnen.
- **Das Symptom betrifft nur ein Gerät** → am Port dieses Geräts beginnen: Linkzustand, Geschwindigkeit/Duplex, Fehlerzähler und die Eigendiagnose des Geräts.
- **Das Symptom lautet „erreichbar, aber keine Kommunikation“** → physikalische und Adressierungsebene funktionieren; bei Sitzungs-/Anwendungsebene, Verbindungsgrenzen oder Protokollparametrierung beginnen.
- **Das Symptom korreliert mit Anlagenaktivität** → auf der physikalischen Ebene beginnen, denn diese Korrelation ist charakteristisch für Einkopplung oder ein mechanisch belastetes Kabel.
- **Das Symptom trat nach einer Änderung auf** → bei der Änderung beginnen, unabhängig davon, was das Schichtenmodell nahelegt.

**Eine Anmerkung zu Ping.** Ein erfolgreicher Ping beweist, dass zwei Hosts in diesem Moment ein kleines Paket austauschen konnten. Er beweist nicht, dass zyklischer Austausch mit begrenzter Aktualisierungszeit funktioniert, und er beweist nicht, dass die Strecke sauber ist. Ein Gerät, das einwandfrei pingt und dabei seine zyklische Peripherie verliert, ist kein Widerspruch — es ist das erwartete Verhalten einer Strecke mit sporadischen Fehlern oder eines Geräts mit erschöpfter Verbindungsressource. **Ping taugt zum Bestätigen, nie zum Ausschließen.**

## Belegquellen und was jede unterscheidet

| Beleg | Herkunft | Was er unterscheidet |
| --- | --- | --- |
| Linkzustand und -historie | Switch-Port | Eine physikalisch flatternde Strecke gegenüber einer stabilen |
| Port-Fehler-/Discard-Zähler | Switch und Gerät | Ein degradierendes Kabel oder Steckverbinder gegenüber sauberem Pfad |
| Ausgehandelte Geschwindigkeit und Duplex | Switch-Port | Eine Fehlanpassung, die im Leerlauf läuft und unter Last versagt |
| Schnittstellenstatistik im Gerät | Steuerung oder Feldgerät | Ob das Gerät dieselben Fehler sieht wie der Switch |
| Diagnosepuffer der Steuerung | SPS | Stationsausfälle mit Zeitstempel aus Sicht der Steuerung |
| SCADA-Ereignis- und Meldeprotokoll | Leitebene | Was der Bediener sah und wann |
| Systemprotokoll des Switches | Switch | Topologieänderungen, Protokollereignisse, Versorgungs- und Modulfehler |
| Verkehrsrate je Port | Switch | Eine Flut, ein Sturm oder ein unerwarteter Sender |
| Redundanzstatus | Switch / Ringmanager | Ob ein redundanter Weg früher und still ausgefallen ist |
| Zustand der Zeitsynchronisation | Alle | Ob die drei Protokolle oben überhaupt korrelierbar sind |

**Zwei Punkte verdienen einen Kommentar.**

**Zähler sind nur gegen eine Baseline aussagekräftig.** Sie sind kumulativ, ein Wert ungleich null beweist also für sich nichts — er kann über drei Jahre entstanden sein. Ziehen Sie die Baseline ab, und der Zähler ist kein Summenwert mehr, sondern eine Änderung über ein bekanntes Intervall — die einzige Form, in der er überhaupt etwas unterscheidet. Fehlt eine Baseline, erzeugen Sie eine, indem Sie die Zähler zweimal in bekanntem Abstand lesen; die Differenz ist der Beleg.

**Zeitsynchronisation ist eine Voraussetzung, kein Detail.** Den Zeitstempel eines Stationsausfalls in der Steuerung mit einem Switch-Logeintrag und einer SCADA-Meldung zu korrelieren setzt voraus, dass alle drei Uhren übereinstimmen. Wo sie es nicht tun, lassen sich Abläufe nicht rekonstruieren, und die Untersuchung verkommt zur Erzählung.

## Sporadische Fehler

Sporadische Fehler unterlaufen die Standardmethode, weil der Fehler abwesend ist, wenn man hinsieht. Der produktive Schritt ist, die Frage von *„was ist kaputt“* auf **„was ist anders, wenn es auftritt“** umzustellen.

**Korrelieren statt inspizieren.** Eine Liste möglicher Bedingungen aufstellen und jede gegen die Ereigniszeiten prüfen: ein bestimmter anlaufender Antrieb, ein fahrender Kran, ein Schichtmuster, die Umgebungstemperatur, ein bestimmtes Rezept, eine Wartungstätigkeit, ein geplanter Sicherungs- oder Berichtslauf. Ein Fehler, der nur währenddessen auftritt, ist wirksamer lokalisiert, als es jede Punktmessung könnte.

**Instrumentieren, bevor gewartet wird.** Kontinuierliche Aufzeichnung von Portzählern, Linkzustand und Steuerungsdiagnose kostet wenig und verwandelt das nächste Auftreten in Daten. Punktprüfungen während eines vier Sekunden dauernden Fehlers werden nicht gelingen.

**Häufige sporadische Mechanismen und ihre Signaturen:**

- **Mechanisch belastetes Kabel** — Fehler korrelieren mit Bewegung; oft eine Richtung einer Energiekette, eine Kranposition, eine Maschinenachse.
- **Störeinkopplung** — Fehler korrelieren mit einem elektrischen Ereignis, meist einem anlaufenden Antrieb oder Heizer. Die Domäne ist die Kabeltrasse, nicht das Netz.
- **Thermisch** — korreliert mit Tageszeit oder Produktionsintensität; eine grenzwertige Verbindung oder ein überhitzendes Gerät.
- **Lastabhängig** — tritt bei Spitzendurchsatz auf und verschwindet im Leerlauf; Verdacht auf Duplex-Fehlanpassung, unterdimensionierten Uplink oder ein Gerät an seiner Verbindungsgrenze.
- **Redundanzereignisse** — kurze Ausfälle gleichzeitig mit einer Topologieänderung; das Netz erholt sich, und die Erholung ist länger als irgendeine Ansprechüberwachung.
- **Geplante Aktivität** — eine Sicherung, ein Bericht oder ein Chargentransfer, dessen Lastspitzen mit zyklischem Verkehr kollidieren.

**Der allgemeine Grundsatz: ein sporadischer Fehler mit wiederholbarem Auslöser ist nicht sporadisch — er ist ein Fehler, dessen Charakterisierung Sie noch nicht abgeschlossen haben.**

## Verlust, Jitter und Fehler, die keine Netzfehler sind

Industrielle Verkehrsklassen versagen unterschiedlich, und sie zu vermengen kostet Zeit.

**Zyklischer Steuerungsverkehr** reagiert empfindlich auf *begrenzte Verzögerung und Jitter*. Seltenen Verlust verträgt er meist — dafür ist die Reserve der Ansprechüberwachung da —, systematische Schwankung nicht. Ein Netz, das irgendwann alles zustellt, kann dennoch ungeeignet sein.

**TCP-basierter Leitebenen- und Dateiverkehr** reagiert empfindlich auf *Verlust*, den er durch Neuübertragung verdeckt. Genau dieses Verdecken ist der Grund, weshalb eine degradierende Strecke auf Anwendungsebene unsichtbar bleibt, bis sie gravierend ist.

**Die diagnostische Folge:** Fällt zyklische Peripherie aus, während Dateitransfers auf demselben Pfad gelingen, suchen Sie nach Jitter, Lastspitzen und Priorisierung statt nach einer defekten Strecke. Sind Dateitransfers langsam, während die zyklische Peripherie gesund ist, suchen Sie nach Verlust und Neuübertragung.

**Und eine Kategorie, die Netzwerkfachleuten wiederholt Zeit kostet:** Symptome, die wie Netzfehler aussehen und keine sind.

- Eine Steuerung mit gewachsener Zykluszeit veröffentlicht Daten später, ganz ohne Zutun des Netzes.
- Ein Leitebenen-Client, der schneller abfragt, als er verarbeiten kann, erzeugt einen Rückstau, der sich als Latenz zeigt.
- Ein Gerät an seiner Verbindungs- oder Sitzungsgrenze weist neue Clients ab und bedient bestehende einwandfrei.
- Eine falsch parametrierte Aktualisierungszeit oder Ansprechüberwachung erzeugt Stationsausfälle in einem Netz, das sich exakt entwurfsgemäß verhält.

**In jedem Fall funktioniert das Netz und die Konfiguration nicht.** Die Unterscheidung erfolgt wie immer: Was ist sonst betroffen, und zeigen die Belege auf Netzebene überhaupt etwas Auffälliges? Ein Netzfehler, der jeden Zähler sauber und jede Strecke stabil lässt, verdient Skepsis.

## Paketaufzeichnung: wo sie hingehört

Aufzeichnung ist mächtig, wird häufig falsch eingesetzt und braucht in einem Steuerungsnetz ausdrückliche Sicherheitsgrenzen.

**Wann sie ihren Platz verdient:** wenn die Frage *Inhalt oder Reihenfolge* betrifft und nicht Erreichbarkeit — welcher Host initiierte, was ein Gerät antwortete, ob eine Anfrage abgelehnt oder ignoriert wurde, ob das Verkehrsmuster zur Konfiguration passt.

**Wann sie in die Irre führt:**

- **Aufzeichnung an der falschen Stelle.** Eine Aufzeichnung auf der Leitebene sagt nichts über ein Feldsegment. Sie muss dort erfolgen, wo der fragliche Verkehr tatsächlich läuft.
- **Grenzen des Mirror-Ports.** Ein Mirror-Port kann von dem Verkehr, den er kopiert, überfordert sein; Telegramme, die der Analysator nie sieht, wirken wie Telegramme, die es nie gab. Wo die Belege vollständig sein müssen, zählt der Messpunkt.
- **Menge mit Erkenntnis verwechseln.** Eine große Aufzeichnung ohne formulierte Frage ist Datenmaterial, kein Beleg.

**Sicherheitsgrenzen, die in einem laufenden Steuerungsnetz nicht verhandelbar sind:**

- **Nur passive Beobachtung.** Aufzeichnen; nicht einspeisen, wiedergeben oder scannen. Für IT-Netze gebaute aktive Werkzeuge können Geräte stören, die nie zum Abtasten ausgelegt waren, und ein Verfügbarkeitsvorfall durch ein Diagnosewerkzeug kostet mehr, als der Befund wert war.
- **Vor dem Anschluss an ein Steuerungssegment abstimmen**, auch bei einem Notebook. Ein unerwartetes Gerät in einer Steuerungs-VLAN ist selbst eine Änderung.
- **Aufgezeichnete Prozessdaten als Anlageninformation behandeln.** Sie können betriebliche Details enthalten, die den Standort nicht verlassen sollten.

## Strukturierte Eskalation

Eskalation scheitert, wenn sie ein Symptom statt eines Zustands übergibt. Die nächste Person beginnt die Methode von vorn, und die Anlage bezahlt dieselbe Arbeit zweimal.

**Eine empfangenswerte Übergabe nennt:**

1. Das Symptom in der widerlegbaren Form aus Schritt 0 — was ausfällt, was nicht, unter welchen Bedingungen.
2. Die derzeit eingegrenzte Fehlerdomäne und die Beobachtung, die sie eingegrenzt hat.
3. Die erhobenen Belege mit Zeiten und die Baseline, gegen die verglichen wurde.
4. Was ausgeschlossen wurde **und durch welchen Beleg** — „wir haben das Kabel getauscht und es fällt weiterhin aus“ ist ein Ausschluss; „wir glauben, es liegt nicht am Kabel“ nicht.
5. Was bisher geändert wurde, in Reihenfolge. Das wiegt schwer: Eine während der Fehlersuche undokumentierte Änderung ist das Rätsel von morgen.
6. Das aktuelle Produktionsrisiko und ob die Anlage mit verminderter Redundanz oder einer Behelfslösung läuft.

**Behelfslösungen brauchen einen Verantwortlichen und ein Datum.** Ein um zwei Uhr nachts über einen Gehweg verlegtes Patchkabel ist eine legitime Notmaßnahme und eine illegitime Dauerinstallation — der Unterschied besteht allein darin, ob es jemand aufgeschrieben hat.

## Fehlermodi der Methode selbst

**Mit einem Werkzeug beginnen.** Zähler werden betrachtet, bevor jemand sagen kann, was normal wäre.

**Mehreres gleichzeitig ändern.** Der Fehler verschwindet, niemand weiß warum; in einem Monat ist er zurück.

**Hardwaretausch als Diagnose.** Das exponierteste Gerät auf einem degradierten Segment wird wiederholt getauscht, während der eigentliche Fehler bleibt.

**„Es hat sich nichts geändert“ akzeptieren.** Änderungsaufzeichnungen sind überall lückenhaft; die Frage lautet, was sich geändert hat, nicht ob.

**Keine Baseline.** Jede Zählerablesung ist uninterpretierbar.

**Nicht synchronisierte Uhren.** Drei nicht korrelierbare Protokolle werden zu drei Meinungen.

**Bei der ersten plausiblen Ursache stehen bleiben.** Ein gefundener Fehler ist nicht zwingend der Fehler; er erklärt das Symptom nur, wenn die Zeitachse passt.

**Die Lösung nicht dokumentieren.** Derselbe Fehler wird beim nächsten Mal von jemand anderem von vorn diagnostiziert.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Fertigungsstandort meldet, dass die SCADA-Anzeige einer Verpackungslinie mehrmals pro Schicht für etwa dreißig Sekunden veraltete Werte zeigt. Die Bediener haben sich arrangiert. Die Instandhaltung hat über drei Monate einen Switch und zwei Patchkabel getauscht — ohne Wirkung.

Schritt 0 erzeugt den Satz, der alles neu ordnet: *Leitebenenwerte einer Linie frieren mehrmals pro Schicht für rund dreißig Sekunden ein, während die Linie normal weiterläuft und keine Steuerung einen Stationsausfall meldet.*

Der letzte Teilsatz ist die ganze Diagnose im Umriss. **Meldete keine Steuerung einen Stationsausfall, hat das Feldnetz seine zyklischen Daten durchgehend geliefert.** Der Steuerungspfad war nie beteiligt, und drei Monate Arbeit an Switches und Kabeln entfielen auf eine Domäne, die die Belege bereits ausgeschlossen hatten.

Den Rest aufteilen: Das Einfrieren betrifft alle Werte einer Steuerung, nicht einzelne Tags, und nur diese Linie; die Werte anderer Linien aktualisieren in derselben SCADA-Sitzung normal. Die Domäne ist nun der Pfad oder die Sitzung zwischen dieser Steuerung und dem Leitebenenserver.

Der abschließende Beleg: Die Verbindungsressource der Steuerung ist während der Einfrierphasen vollständig belegt. Ein im Vorquartal installiertes Berichtswerkzeug öffnet turnusmäßig eine Verbindung zu derselben Steuerung und schließt sie nicht sauber; jeder Lauf hinterlässt eine Belegung, bis der Pool erschöpft ist und der Leitebenen-Client abgewiesen wird. Die Einfrierphasen enden, wenn die alten Verbindungen ablaufen — daher die gleichbleibenden dreißig Sekunden.

Nichts war defekt. Die Abhilfe ist eine Parameteränderung im Berichtswerkzeug und, strukturell, dessen Umstellung auf das Lesen vom Leitebenenserver statt auf einen eigenen Pfad zur Steuerung.

**Die übertragbare Lehre: Die Beobachtung „keine Steuerung meldete einen Stationsausfall“ lag am ersten Tag vor, kostete nichts und hätte das gesamte Feldnetz ausgeschlossen, bevor der erste Switch getauscht wurde.**

## Empfohlene Praxis

- Das Symptom als widerlegbaren Satz formulieren, bevor ein Werkzeug geöffnet wird; das *nicht* Betroffene einschließen.
- Zuerst klären, ob die Steuerungsebene überhaupt beteiligt ist; eine gesunde Steuerung mit gesunder Peripherie schließt den Großteil der Anlage aus.
- Nach gemeinsamem Ausfall aufteilen und mit der dokumentierten Topologie benennen, was die Betroffenen teilen.
- Auf der Ebene beginnen, auf die das Symptom deutet, nicht ritualhaft auf Schicht 1.
- Zähler als Raten gegen eine Baseline lesen; fehlt sie, mit zwei Ablesungen eine erzeugen.
- Die Zeit über Steuerungen, Switches, SCADA und Sicherheitssysteme synchron halten, damit Protokolle korrelierbar sind.
- Bei sporadischen Fehlern mit Anlagenereignissen korrelieren und dauerhaft instrumentieren statt während des Fehlers zu inspizieren.
- Jitter-empfindlichen zyklischen Verkehr von verlustempfindlichem TCP-Verkehr trennen; sie versagen verschieden und deuten anderswohin.
- Konfiguration verdächtigen — Zykluszeit, Aktualisierungszeit, Ansprechüberwachung, Verbindungsgrenzen —, wenn jede Netzmessung sauber ist.
- Passiv aufzeichnen, an der richtigen Stelle, mit formulierter Frage; in einem laufenden Steuerungsnetz nie einspeisen oder scannen.
- Immer nur eine Sache ändern und es dokumentieren, auch Änderungen ohne Wirkung.
- Einen Zustand eskalieren, kein Symptom: eingegrenzte Domäne, Belege, Ausschlüsse mit Begründung und jede vorgenommene Änderung.
- Die Lösung dort dokumentieren, wo die nächste Person sie findet.

## Fazit

Fehlersuche in Industrienetzen ist keine Frage von mehr Kommandokenntnis. Sie ist eine Frage der Reihenfolge: den billigsten, unterscheidungsstärksten Beleg zuerst zu nutzen — und in einer Anlage ist das fast immer das Muster dessen, was gemeinsam ausfiel, gelesen gegen eine Topologie, die sich jemand zu dokumentieren die Mühe gemacht hat.

Der Rest folgt aus Disziplin statt aus Spezialwissen: ein Symptom, das präzise genug ist, um falsch sein zu können; Zähler als Raten; übereinstimmende Uhren; eine Änderung nach der anderen; und eine Übergabe, die einen Zustand trägt statt einer Klage. Konsequent angewandt macht das aus den meisten Netzfehlern eine kurze, begrenzte Untersuchung — und verhindert die teure Alternative, Hardware zu tauschen, bis das Symptom woanders auftaucht.
