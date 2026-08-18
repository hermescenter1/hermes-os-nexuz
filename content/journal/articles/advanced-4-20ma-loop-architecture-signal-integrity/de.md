# Fortgeschrittene 4–20-mA-Kreise: Architektur, Trennung, Integrität

## Zusammenfassung

Der 4–20-mA-Kreis ist die erfolgreichste analoge Schnittstelle der Industriegeschichte, und sein Ruf der Einfachheit ist die Quelle der meisten Schwierigkeiten, die er verursacht. **Die Norm legt einen Strom fest, keinen Stromkreis.** Alles, was einen realen Kreis funktionieren — oder auf interessante Weise versagen — lässt, steckt in den fünf Fragen, die die Norm nicht beantwortet:

**Wer liefert die Kreisspannung?** **Wo liegt die einzige Verbindung des Kreises zum Bezugssystem?** **Was liegt sonst noch in Reihe, und was hat jedes dieser Geräte angenommen?** **Teilt sich ein digitales Protokoll dieselbe Doppelader, und lässt jedes Element im Pfad es durch?** **Wie misst der Eingang tatsächlich, und teilt er sich etwas mit seinen Nachbarn?**

Eine dieser Fragen offensichtlich falsch beantwortet, und der Kreis liest null — billig, sofort, in einer Stunde behoben. Eine subtil falsch beantwortet, und der Kreis funktioniert, liest plausibel und ist jahrelang um einige Prozent falsch, oder kommuniziert sporadisch, oder driftet mit dem Wetter, oder bewegt sich mit einer völlig anderen Prozessgröße.

Die Grundlagen, die Spannungsbudgetrechnung und die allgemeine Fehlersystematik stehen im Begleitbeitrag zu 4–20-mA-Stromkreisen. Die anlagenweiten Fragen — Signalkategorien, Trennung, Schirmkonzept und Trenngranularität — stehen im Begleitbeitrag zur messtechnischen Architektur. Dieser Beitrag ist der Kreis selbst, als Stromkreis betrachtet.

## Wer speist den Kreis: die Aktiv-Passiv-Matrix

Diese eine Frage erklärt mehr Inbetriebnahmefehlschläge am ersten Tag als jede andere, und der Wortschatz dazu ist zwischen Herstellern wirklich uneinheitlich.

**Die Definition, die sich nie ändert:** Ein **aktives** Gerät liefert die Spannung, die den Kreis treibt. Ein **passives** Gerät tut das nicht — es regelt den Strom (ein Messumformer) oder misst ihn (ein Empfänger), trägt aber keine Energie bei. **Jeder Kreis braucht genau ein aktives Gerät.**

**Auf der Feldseite** ist diese Unterscheidung nicht dieselbe wie Zweileiter/Vierleiter, und beides zu vermischen ist ein häufiger Fehler:

- Ein **Zweileiter-Messumformer** bezieht seine Versorgung aus dem Kreis und regelt den Kreisstrom. Er ist naturgemäß passiv: Er kann den Kreis nicht speisen, weil er *von ihm* gespeist wird.
- Ein **Vierleiter-Messumformer** hat eine eigene Versorgung, sein Stromausgang kann aber **entweder** aktiv sein (er treibt den Kreis) **oder** passiv (er regelt einen von anderer Stelle gelieferten Strom). Ein Vierleitergerät ist nicht automatisch eine aktive Quelle, und diese Annahme hat viele Inbetriebnahmetage verdorben.

**Auf der Systemseite** ist ein Eingangskanal aktiv, wenn er Kreisleistung bereitstellt und den zurückkehrenden Strom misst, und passiv, wenn er nur einen anderswo gelieferten Strom misst.

| | **Passiver Eingang** (nur messend) | **Aktiver Eingang** (speisend und messend) |
| --- | --- | --- |
| **Passiver Umformerausgang** | Nichts speist den Kreis — eine externe Versorgung ist nötig | Richtig; die übliche Zweileiteranordnung |
| **Aktiver Umformerausgang** | Richtig; der Umformer treibt den Kreis | **Zwei Quellen in Reihe — falsch** |

**Die Fehlerbilder sind eindeutig und lohnen es, sie sich einzuprägen:**

**Passiv auf passiv** ergibt null Strom. Alles wirkt tot, kein Gerät nimmt Schaden, und die natürliche Reaktion — erst der Umformer, dann das Kabel, dann die Baugruppe — findet nichts, weil nichts defekt ist. Der Kreis hat schlicht keine Quelle.

**Aktiv auf aktiv** schaltet zwei Quellen in Reihe in einen niederohmigen Kreis. Der Strom wird von der dominierenden Quelle bestimmt statt von der Messung; der Messwert liegt typischerweise am oberen Bereichsende fest oder ist unsinnig; und je nach Geräten übersteht einer der beiden Eingänge das womöglich nicht.

**Die Wortschatzfalle verdient ausdrückliche Nennung.** Hersteller beschreiben diese Unterscheidung als aktiv/passiv, Quelle/Senke, eigenversorgt/kreisgespeist oder mit nur in ihrer eigenen Dokumentation definierten Begriffen, und die Zuordnungen sind zwischen Anbietern nicht einheitlich. **Bestimmen Sie die Anordnung aus dem Klemmenbild und dem Vorhandensein einer internen Versorgung, nie aus dem Wort im Datenblatt.** Zwei Minuten Blick auf die Zeichnung klären, was eine Stunde Diskussion nicht klärt.

**Die Polarität ist die andere Hälfte davon.** Der Kreis ist ein Gleichstromkreis und durchgehend gepolt. Ein vertauschter Anschluss ergibt meist null Strom, und manche Geräte haben Verpolschutz und andere nicht.

## Was sonst in Reihe liegt: Zusammenspiel mehrerer Geräte

Ein 4–20-mA-Kreis ist ein Reihenkreis, und das hat zwei Folgen, die in entgegengesetzte Richtungen ziehen.

**Der Strom ist überall im Kreis identisch.** Das ist die ganze Tugend der Norm: Ein Spannungsfall entlang des Kabels ändert die Messung nicht, und jedes Reihengerät sieht unabhängig von seiner Position denselben Strom. Deshalb hat die Schnittstelle fünfzig Jahre überlebt.

**Die Spannung an jeder Stelle ist es nicht.** Jedes Reihengerät liegt auf einem anderen Potential gegenüber der Kreisversorgung, das heißt, der Eigenbezug jedes Geräts verschiebt sich abhängig davon, was ihm vorgelagert ist. **Deshalb zählt die Position eines Geräts im Kreis, obwohl der Strom sich nicht ändert** — und deshalb verhält sich eine Anzeige mit geerdetem Gehäuse an einer Position anders als an einer anderen.

**Ein zusätzliches Gerät verbraucht Budget, das zur Entwurfszeit vergeben wurde**, was der Begleitbeitrag vollständig behandelt. Hier ist das *Zusammenspiel* zu ergänzen, nicht die Rechnung:

**Jedes zusätzliche Gerät ist ein möglicher zweiter Bezug.** Eine Tafelanzeige mit geerdetem Gehäuse, ein Schreiber mit geerdetem Eingang, ein Grenzwertschalter, dessen Bezug auf das Gehäuse gelegt ist — jedes davon kann eine Verbindung zwischen Kreis und Bezugssystem herstellen. Da dem Kreis genau eine solche Verbindung zusteht, kann ein zusätzliches Gerät still eine Regel verletzen, die die ursprüngliche Auslegung erfüllte.

**Jedes zusätzliche Gerät ist auch ein möglicher Kreisunterbrecher.** Ein Reihenelement, dessen Fehlerzustand offen ist, macht aus seinem eigenen Defekt einen Totalverlust der Messung. Manchmal ist genau das gewollt — eine ruhestromsichere Abschaltung — und manchmal eine Überraschung, besonders wenn das Gerät aus Bequemlichkeit hinzukam, etwa als Vor-Ort-Anzeige.

**Wenn mehr als ein System den Wert braucht, teilen statt verketten.** Ein Signaltrenner mit mehreren Ausgängen liefert dieselbe Messung als unabhängige Kreise an mehrere Empfänger, jeder mit eigenem Bezug und eigenem Budget. Empfänger in Reihe zu verketten bindet ihre Schicksale zusammen, stapelt ihre Bürden und multipliziert das Bezugsproblem mit der Zahl der Geräte. Der Trenner kostet in der Anschaffung mehr und über zwanzig Jahre erheblich weniger.

**Zwei Systeme dürfen niemals beide denselben Kreis treiben wollen.** Die Anordnung entsteht, wenn eine Messung mit einem zweiten Leitsystem „geteilt“ wird, indem dessen Eingang parallel statt in Reihe verdrahtet oder ein zweiter aktiver Eingang angeschlossen wird. Das Ergebnis ist keine geteilte Messung, sondern ein Streit zweier Quellen.

## Die Ein-Bezugs-Regel

**Ein 4–20-mA-Kreis sollte genau eine Verbindung zum Bezugssystem haben.** Weder null noch zwei.

**Null Verbindungen** lassen den Kreis erdfrei, sein Gleichtaktpotential gegenüber dem messenden Eingang ist damit undefiniert und kann dorthin driften, wohin die Kopplung es trägt — auch aus dem nutzbaren Gleichtaktbereich des Eingangs heraus, ab wo der Messwert nicht verrauscht, sondern ungültig ist.

**Zwei Verbindungen** sind schlimmer, weil sie einen echten Parallelkreis erzeugen. Der Kreisstrom kann nun auf zwei Wegen zurückkehren: über den vorgesehenen Rückleiter und über das Bezugssystem zwischen den beiden Verbindungspunkten. **Die Folge ist in erster Linie keine Störung, sondern ein Messfehler**, denn der Anteil des Stroms, der über den Bezugsweg zurückfließt, umgeht den Messwiderstand des Eingangs. Die Baugruppe misst weniger Strom, als der Umformer erzeugt, und der Messwert ist stabil, plausibel und zu niedrig.

**Das ist der entscheidende und unterschätzte Punkt dieses Beitrags.** Eine zweite Erde an einem Stromkreis meldet sich nicht zwangsläufig als Instabilität. Sehr oft meldet sie sich als Kalibrierabweichung, die jede Neukalibrierung überlebt — denn die nächste Kalibrierung stellt den Umformer schlicht so ein, dass er den anderswo hinfließenden Strom ausgleicht.

**Der einzige Punkt gehört meist ans empfangende Ende**, damit Messung und Bezug ein Potential teilen. Eine Barrierenanordnung kann etwas anderes verlangen; dann gilt deren Anforderung.

**Der zweite Bezug ist meist unbeabsichtigt, und die üblichen Verdächtigen sind wenige:**

- Ein Umformer, dessen Sensorkreis nicht vom Gehäuse getrennt ist und dessen Gehäuse metallisch mit geerdeter Prozessrohrleitung verbunden ist.
- Ein Schirm, der auf einer Kreisader statt auf einer eigenen Schirmschiene aufgelegt ist.
- Ein Überspannungsschutzgerät, dessen Erdanschluss konstruktionsbedingt eine Verbindung zum Bezugssystem ist.
- Feuchte in einem Feldverteiler, die einen ohmschen Pfad schafft, der weder offen noch kurzgeschlossen ist.
- Eine ergänzte Anzeige, ein Schreiber oder ein Grenzwertschalter wie oben beschrieben.

**Trennung ist die allgemeine Antwort.** Ein Schleifentrenner macht aus einem Kreis mit zwei Bezügen zwei Kreise mit je einem Bezug — deshalb werden Trenner weit häufiger gegen Erdungsprobleme als gegen Störungsprobleme eingebaut.

## Barrieren und Trenner als Schaltungselemente

Innerhalb des Kreises sind eine Barriere und ein Trenner völlig verschiedene Bauteile, und sie als austauschbare Sicherheitsgeräte zu behandeln übersieht alles, was elektrisch zählt.

**Eine Zener-Barriere ist ein passives Netzwerk in Reihe zum Kreis.** Elektrisch fügt sie Reihenwiderstand hinzu und lässt Spannung fallen, was unmittelbar aus dem Spannungsbudget kommt. Funktional ist sie zur Energiebegrenzung auf eine Verbindung zu einer definierten eigensicheren Erde angewiesen, das heißt: **Die Barriere bestimmt, wo der Bezug des Kreises liegt** — die Erdungsentscheidung trifft das Sicherheitsgerät, nicht der Planer.

**Ein galvanischer Trenner teilt den Kreis in zwei unabhängige Kreise.** Feld- und Systemseite haben je einen eigenen Bezug, was die Erdungsbindung vollständig aufhebt. Viele Trenner speisen zusätzlich die Feldseite und wirken als Speisetrenner.

**Und hier folgt die Konsequenz, die Menschen überrascht, und sie lohnt eine Regel.** **Der Einbau eines Trenners ändert, welche Seite des Kreises aktiv ist.** Ein nachgerüsteter Trenner gegen ein Erdungsproblem präsentiert der Systemseite typischerweise einen *aktiven* Ausgang. War dieser Systemeingang bereits aktiv — weil er zuvor direkt einen Zweileiter-Umformer speiste —, hat die Nachrüstung soeben einen Aktiv-auf-Aktiv-Kreis erzeugt. Die Messung war gestern in Ordnung, der Trenner wurde zur Verbesserung eingebaut, und heute liest der Kreis Vollausschlag.

**Die allgemeine Regel daraus: Jede Änderung an den Geräten eines Kreises ist eine Änderung der Kreisarchitektur**, und Aktiv-Passiv-Matrix, Bezugspunkt und Spannungsbudget müssen alle drei neu geprüft werden, nicht nur der Punkt, der die Änderung veranlasst hat.

## HART-Koexistenz: die Randbedingungen, die niemand vor der Inbetriebnahme liest

HART überlagert dem Kreisstrom ein frequenzumtastetes digitales Signal. Sein Mittelwert ist null, weshalb es die analoge Messung nicht stört — ein wirklich elegantes Stück Technik, das drei Randbedingungen verbirgt.

**Der Kreis braucht ausreichend Widerstand.** Das digitale Signal ist eine kleine Strommodulation und wird als *Spannung* erkannt, es braucht also einen Widerstand, an dem es entstehen kann. **Das ist die genau entgegengesetzte Richtung zum Gleichstrombudget**, das den Planer zur Minimierung des Widerstands drängt. Ein rein auf Spannungsreserve optimierter Kreis kann für zuverlässige HART-Kommunikation zu niederohmig sein, und der erforderliche Mindestwert ist eine Auslegungsgröße, kein Zufall.

**Der Kreis darf das digitale Signal nicht kurzschließen.** Zu hohe Kabelkapazität auf langer Strecke, ein zum „Beruhigen“ eines Messwerts über den Eingang gelegter Filterkondensator oder ein Reihengerät mit niedriger Impedanz bei den Signalisierungsfrequenzen dämpfen das digitale Signal, während der Gleichstrom unberührt bleibt. **Das erzeugt einen völlig schlüssigen Fehler, den man dennoch verblüffend findet: Die Messung ist perfekt und Kommunikation unmöglich.** Es sind zwei verschiedene Signale mit verschiedenen Anforderungen auf einer Doppelader.

**Nicht alles im Pfad lässt HART durch.** Barrieren, Trenner und manche Eingangsbaugruppen können für das digitale Signal transparent sein oder nicht, und das ist eine zu bestätigende Spezifikationsangabe, keine Annahme. Ein Kreis mit HART-Umformer und nicht transparentem Trenner hat HART-Geräte und kein HART.

**Zwei betriebliche Punkte vervollständigen das Bild.**

Ein Handbediengerät muss an einem Widerstand angeschlossen werden, nicht an einer niederohmigen Quelle — weshalb der Anschluss an einer Stelle des Kreises funktioniert und an einer anderen nicht, und weshalb das im Feld erhebliche Verwirrung stiftet.

Und **ein im Multidrop-Betrieb belassenes Gerät parkt seinen Analogausgang auf einem festen niedrigen Strom**, weil der Strom in dieser Betriebsart die Messung nicht mehr trägt. Der 4–20-mA-Wert eines solchen Geräts ist ein konstanter, plausibel wirkender niedriger Wert und überhaupt keine Messung. Ein versehentlich so konfiguriertes Gerät besteht jeden Verdrahtungstest und meldet einen stabilen Prozess, den es nicht gibt.

**Und schließlich ein Governance-Punkt.** HART trägt die Eigendiagnose des Geräts, seine Konfiguration, seine Kalibrierhistorie und oft eine Zusatzgröße. **Liest nichts in der Anlage irgendetwas davon, hat der Standort HART-Umformer gekauft und als analoge installiert** — eine legitime Entscheidung, die aber eine Entscheidung sein sollte und keine Entdeckung.

## Die Empfängerseite: Architektur des Analogeingangs

Der Eingang wandelt Strom über einen Messwiderstand in Spannung und digitalisiert das Ergebnis. Vier Eigenschaften dieser Anordnung bestimmen das Verhalten, und nur eine davon erscheint in den meisten Spezifikationen.

**Differentiell oder unsymmetrisch.** Ein Differenzeingang misst die Spannung zwischen zwei Klemmen und unterdrückt das Gemeinsame; ein unsymmetrischer Eingang misst gegen einen gemeinsamen Bezug. Das bestimmt unmittelbar das Gleichtaktverhalten des Kanals; die allgemeine Behandlung von Gleichtakt gehört zum Architekturbeitrag. Auf Kreisebene zählt: Ein unsymmetrischer Eingang legt die Last der Bezugsdisziplin vollständig auf die Feldverdrahtung.

**Ob Kanalrückleiter gemeinsam geführt sind.** Das verdient die größte Aufmerksamkeit, weil es eine Fehlerklasse erzeugt, die unmöglich wirkt. Auf vielen Eingangsbaugruppen sind Kanalrückleiter intern zusammengeführt oder teilen einen Rückleiter. Der Strom jedes Kanals fließt dann über diese gemeinsame Impedanz und erzeugt dort eine Spannung — **also wird der Messwert jedes Kanals vom Strom jedes anderen beeinflusst.** Das Symptom ist unverkennbar, sobald man danach sucht: **ein Messwert, der im Gleichklang mit einer völlig unabhängigen Prozessgröße wandert**, weil sich der Strom jenes anderen Kreises ändert. Wer dem noch nicht begegnet ist, tauscht den unschuldigen Umformer wiederholt.

**Bereich, Auflösung und Verhalten außerhalb des Bereichs.** Ob die Baugruppe Bereichsunter- und -überschreitung als eigene Zustände meldet oder schlicht an den Grenzen begrenzt, entscheidet, ob die im nächsten Abschnitt beschriebene Diagnoseinformation bis zum Leitsystem überlebt. Eine Baugruppe, die bei 4 mA begrenzt, zerstört den Unterschied zwischen „0 % des Bereichs“ und „Umformer meldet Fehler“.

**Abtastrate und Filterung.** Ein über ein langes Fenster gemittelter Kanal verbirgt Transienten, ein sporadischer Kontaktfehler erscheint als langsames Absacken statt als Sprung. Ein schnell und ungefiltert abgetasteter Kanal zeigt elektrische Störungen, die der Prozess nicht enthält. Beides sind Konfigurationsentscheidungen, beide ändern, was ein Diagnostiker sehen kann, und keine wird üblicherweise dokumentiert.

**Dezentrale E/A fügt ein weiteres Element hinzu.** Sitzt der Eingang in einem dezentralen Knoten, besteht das Bezugsverhältnis des Kreises zu diesem Knoten und nicht zur Warte, und die Versorgungs- und Erdungsanordnung des Knotens wird Teil der Kreisarchitektur. Ein Kreis, der die Ein-Bezugs-Regel gegenüber der Warte erfüllt, erfüllt sie gegenüber dem Knoten womöglich nicht.

## Der Stromwert ist ein Nachweis

Das am wenigsten genutzte Diagnosemittel der Messtechnik ist die Zahl selbst. Ein 4–20-mA-Kreis meldet seinen eigenen Zustand, sofern die Empfangskette die Unterscheidung erhält.

| Beobachteter Strom | Mögliche Mechanismen | Unterscheidender Test |
| --- | --- | --- |
| **Null** | Unterbrechung, keine Kreisversorgung, Verpolung, passiv auf passiv | Kreisspannung an den Feldklemmen messen; bekannte Quelle im Rangierverteiler einspeisen |
| **Unterhalb des Messbereichs** | Umformer meldet absichtlich einen Fehler (Fail-Low-Konvention) | Gerätediagnose digital lesen; der Umformer kennt den Grund |
| **Oberhalb des Messbereichs** | Umformer meldet Fehler (Fail-High) oder Sensorüberlauf | Ebenso — das Gerät unterscheidet beides |
| **Am unteren Bereichsende** | Ein echter 0-%-Messwert | Mit einer unabhängigen Prozessanzeige vergleichen |
| **Stabil, unplausibel und konstant** | Multidrop-Parkwert, falsche Skalierung, gesättigter oder verstopfter Sensor | Konfiguration lesen; Wirkdruckleitung oder Sensor prüfen |
| **Liest zu niedrig, stabil, überlebt Neukalibrierung** | Zweiter Bezug leitet einen Stromanteil ab | Reihenmessung am Feldende mit dem Wert der Baugruppe vergleichen |
| **Bewegt sich mit einer fremden Prozessgröße** | Gemeinsamer Rückleiter der Baugruppe; Übersprechen | Mit dem Strom des anderen Kreises korrelieren; Rückleiterarchitektur prüfen |
| **Driftet mit Temperatur, Wetter oder Tageszeit** | Isolationsableitung, Betauungspfad, thermischer Effekt an einer Verbindung | Isolationswiderstand über einen Zeitraum; Umgebungsbedingung provozieren |
| **Richtiger Wert, keine digitale Kommunikation** | Kreiswiderstand zu klein, Kapazität zu hoch, nicht transparentes Gerät im Pfad | Kreiswiderstand messen; Pfadinhalt prüfen |

**Die wichtigste und am häufigsten zerstörte Unterscheidung ist die zwischen Null und Fail-Low.** Null Strom heißt: Der Kreis ist unterbrochen oder unversorgt — ein Verdrahtungsproblem, das der Umformer nicht melden kann, weil er nicht beteiligt ist. Ein absichtlich unterhalb des Messbereichs liegender Strom heißt: Der Umformer lebt, kommuniziert und sagt Ihnen, dass er ein Problem hat. **Konventionen wie NAMUR NE 43 existieren genau, um diese Unterscheidung maschinenlesbar zu machen**, und ein Betrieb, der seine Eingänge auf Begrenzen konfiguriert oder beide Zustände auf dieselbe Meldung abbildet, hat das Nützlichste weggeworfen, was der Kreis sagen kann.

**Eine Folge für die Auslegung:** Die Fehlerrichtung ist eine Konfigurationsentscheidung mit Prozessfolge. Ein auf Fail-High konfigurierter Umformer an einem Kreis, der ein Regelventil führt, erzeugt eine andere Anlagenreaktion als einer auf Fail-Low, und diese Entscheidung gehört zur Verfahrenstechnik, nicht zu demjenigen, der zuletzt das Gerät getauscht hat.

## Sporadische Fehler: unterscheiden durch Provokation

Sporadische Kreisfehler werden nicht durch Besichtigung diagnostiziert, sondern durch Aufzeichnung und Provokation. Die allgemeine nachweisgestützte Methode steht in den Troubleshooting-Beiträgen; was folgt, ist kreisspezifisch.

**Den Strom aufzeichnen, nicht ablesen.** Ein Momentanwert sagt Ihnen, dass der Kreis gerade in Ordnung ist — genau das, was alle schon wussten. Eine durchgehende Aufzeichnung — ein datenloggendes Messgerät in Reihe, ein Zangenschreiber oder der Historian des Leitsystems mit ausreichender Abtastrate — macht aus einem sporadischen Ereignis einen Kurvenverlauf mit Form und Zeitstempel. Schon die Form ist oft diagnostisch: ein Sprung auf null ist eine Unterbrechung; ein Absacken ist ein steigender Widerstand; eine Spitze ist Einkopplung.

**Unterscheidend provozieren.** Jede Provokation grenzt eine andere Stelle ein, und genau das macht die Methode schnell:

- **Das Kabel an der Verschraubung und an jeder Klemmstelle bewegen**: Ein Fehler, der dem Bewegen folgt, ist mechanisch und genau dort.
- **Den Umformer leicht anklopfen oder in Schwingung versetzen**: Ein folgender Fehler sitzt im Gerät oder an seiner Klemmleiste.
- **Den Feldverteiler erwärmen oder abkühlen**: Ein temperaturabhängiger Fehler ist ein Ableit- oder Betauungspfad oder eine thermische Verbindungsstelle.
- **Den vermuteten Störer betreiben**: Ein Fehler, der einem Antrieb oder Schütz folgt, ist Einkopplung und gehört zur Trennungs- und Schirmdiskussion, nicht zum Kreis.
- **Das Gehäuse befeuchten**, wo sicher und angemessen: Ein nur bei Nässe existierender Isolationspfad wird an einem trockenen Nachmittag nicht gefunden.

**Mit Trennklemmen halbieren.** Eine bekannte, stabile Stromquelle im Rangierverteiler anstelle der Feldverdrahtung einspeisen. Verschwindet der Fehler, liegt er feldseitig. Bleibt er, liegt er systemseitig — Eingangsbaugruppe, Konfiguration oder Skalierung. Dieser eine Test halbiert das Problem in fünf Minuten und ist der Grund, warum Trennklemmen zu spezifizieren sind, wie im Architekturbeitrag beschrieben.

**Isolationswiderstand über einen Zeitraum messen, nicht als Momentwert.** Eine Einzelmessung bei Trockenheit belegt sehr wenig über einen Kreis, der nach Regen auffällig wird. Der nützliche Nachweis ist der Verlauf und die Korrelation mit den Bedingungen.

**Die Eigendiagnosehistorie des Umformers digital lesen**, wo das Gerät sie führt. Geräteseitige Ereignisse tragen den Zeitstempel des Geräts und können einen Sensorfehler, eine Versorgungsauslenkung oder einen Selbsttestfehler zeigen, der eintrat, während niemand auf den Kreis sah.

**Und dem Reihentausch widerstehen.** Erst den Umformer, dann das Kabel, dann die Baugruppe zu tauschen ist eine Strategie, die irgendwann Erfolg hat, nichts lehrt und eine Behebung nicht von einem Zufall unterscheiden kann — besonders bei einem sporadischen Fehler, dessen einwöchige Abwesenheit kein Beleg ist.

## Die Kette in Betrieb nehmen

- **Die Aktiv-Passiv-Anordnung jedes Geräts im Kreis aus den Klemmenbildern bestätigen**, bevor irgendetwas eingeschaltet wird.
- **Den Bezugspunkt prüfen** und bestätigen, dass es genau einen gibt — einschließlich jeder Überspannungsschutz-, Anzeige- oder Barrierenerde.
- **Den Gesamtkreiswiderstand messen** und gegen das zulässige Maximum des Spannungsbudgets und, wo HART genutzt wird, gegen das für Kommunikation erforderliche Minimum prüfen.
- **Den digitalen Pfad bestätigen**, indem von der Systemseite aus mit dem Feldgerät kommuniziert wird, nicht nur am Umformer.
- **Die Fehlerrichtung prüfen** und bestätigen, dass der Eingang Bereichsunter- und -überschreitung als eigene Zustände meldet statt zu begrenzen.
- **Auf gemeinsame Rückleiter prüfen** und, wo vorhanden, das Kanalübersprechen prüfen, indem ein Kreis bewegt und die Nachbarn beobachtet werden.
- **Die ganze Kette in technischen Einheiten** an mehreren Punkten über den Bereich, einschließlich der Extreme, nachweisen und das Vorzeichen bestätigen.
- **Kreiswiderstand, Isolationswiderstand und den gemessenen Strom an jedem Prüfpunkt dokumentieren** als Inbetriebnahme-Basis. Jede spätere Diagnose vergleicht gegen diese Zahlen, und existieren sie nicht, vergleicht sie gegen Erinnerung.

## Fehlermodi

**Passiver Umformer auf passivem Eingang.** Null Strom, nichts defekt, eine Folge unnötiger Tauschaktionen.

**Aktiver Ausgang auf aktivem Eingang.** Zwei Quellen in Reihe; Messwerte am Anschlag oder unsinnig, mögliche Schäden — meist erreicht über die Annahme, ein Vierleitergerät sei eine aktive Quelle, oder über Vertrauen in den Herstellerwortschatz statt in das Klemmenbild.

**Zweiter Bezug am Kreis.** Ein stabil zu niedriger Wert, der Neukalibrierungen überlebt, weil ein Stromanteil den Messwiderstand umgeht — und jede Nachkalibrierung entfernt das Symptom und bewahrt den Mangel.

**Null Bezüge am Kreis.** Undefinierter Gleichtakt; Messwerte gültig, bis sie es plötzlich nicht mehr sind.

**Trenner nachgerüstet ohne Neuprüfung der Aktiv-Passiv-Matrix.** Ein gestern funktionierender Kreis liest heute Vollausschlag.

**Erdungsanforderung der Barriere nicht als Bezugsentscheidung des Kreises erkannt.** Zwei Bezüge, festgelegt durch das Sicherheitsgerät.

**Empfänger in Reihe verkettet statt getrennt gespeist.** Gestapelte Bürde, gemeinsames Schicksal und ein Bezugsproblem je Gerät.

**Zwei Systeme als Quellen an einem Kreis.** Keine geteilte Messung.

**Aus Bequemlichkeit ergänztes Reihengerät mit offenem Fehlerzustand.** Eine Vor-Ort-Anzeige, die die Messung entfernen kann.

**Kreiswiderstand minimiert und dann HART erwartet.** Das digitale Signal hat nichts, woran es entstehen kann — ebenso ein über den Eingang gelegter Filterkondensator oder ein nicht transparentes Gerät im Pfad.

**Gerät im Multidrop-Betrieb belassen.** Ein stabiler, plausibler, konstanter Wert, der keine Messung ist.

**HART-Geräte installiert und ihre Diagnose nie gelesen.** Bezahlt, nicht genutzt.

**Eingangsbaugruppe mit gemeinsamem Rückleiter und Übersprechen.** Ein Messwert, der einem fremden Prozess folgt; der unschuldige Umformer wird getauscht.

**Eingang auf Begrenzen an den Bereichsgrenzen konfiguriert.** Der Unterschied zwischen 0 % und Gerätefehler wird zerstört, bevor er das Leitsystem erreicht.

**Sporadischer Fehler durch Reihentausch verfolgt.** Irgendwann erfolgreich, nie erklärt und von Zufall nicht unterscheidbar.

**Kreisschaltbild nach Änderung nicht nachgeführt.** Die Architektur existiert nur in der Zeichnung, und die Zeichnung ist falsch.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Füllstandsmessumformer liest durchgehend um einen kleinen, betrieblich aber bedeutsamen Betrag zu niedrig. Das Gerät wird nachkalibriert; der Wert stimmt eine Weile und driftet dann wieder nach unten. Im selben Zeitraum fällt auf, dass eine Druckmessung auf dem Nachbarkanal derselben Eingangsbaugruppe sich leicht bewegt, sobald sich der Füllstand im ersten Behälter ändert — eine Korrelation, die niemand erklären kann, da die beiden Prozesse nicht verbunden sind.

```text
Symptom:
One 4-20 mA loop reads persistently low and returns to reading low after
recalibration; a second loop on the same input module tracks the first loop's
process variable despite no process connection between them.

Evidence:
- a series measurement of the current at the field terminals of the level
  transmitter reads higher than the value the input module reports
- the discrepancy is proportional: larger at 20 mA than at 4 mA
- the level transmitter is a two-wire device whose sensor circuit is not
  isolated from its housing, and the housing is clamped to earthed process
  pipework at the vessel
- the input module's common is bonded to the cabinet reference
- the loop therefore has two connections to the reference system
- the input module's channel returns share a common internal node
- the second loop's apparent variation is small and correlates with the
  first loop's current, not with its own process
- insulation resistance of the field cable is good; the cable is not
  implicated
- both recalibrations adjusted the transmitter upward

Reasoning:
One root cause with two visible effects. The loop has two references — the
non-isolated transmitter earthed at the vessel, and the input module's common
bonded in the cabinet — so the reference system is in parallel with the loop's
return conductor. A share of the loop current therefore returns through the
earthing path and never passes through the module's sense resistor. The module
measures less current than the transmitter is producing, so the reading is low;
and because the diverted share is proportional to the loop current, the error
scales with the measurement, which is exactly what the field comparison shows.

Recalibration removed the symptom without touching the mechanism. Each
adjustment made the transmitter produce more current so that the reduced share
arriving at the module read correctly — which also increased the current
flowing through the earth path, and left the loop one step further from its
design condition.

The second effect follows from the input module's architecture. The current
returning through the reference path re-enters the module at its common, which
is shared with the neighbouring channel's return. The shared impedance turns
that current into a small voltage that offsets the neighbour's reading, so the
pressure channel appears to follow the level process. The pressure transmitter
is entirely healthy.

Next investigations:
- compare series-measured current against reported current on every loop in
  this module to find any others with a diverted return
- identify every connection between each loop and the reference system,
  including transmitter housings, surge devices, indicators and shield bars
- confirm the input module's return architecture from its documentation
- evaluate restoring a single reference per loop, either by isolating the
  transmitter's sensor circuit from its housing or by fitting a loop isolator,
  and re-check the active/passive arrangement afterwards
- reverse the compensating calibration adjustments once the reference is
  corrected, and re-establish a calibration baseline
```

**Zwei übertragbare Lehren.** Erstens: **Ein zweiter Bezug an einem Stromkreis erzeugt einen Messfehler, nicht zwangsläufig eine Störung** — deshalb überlebt er jede Prüfung, die nach Instabilität sucht, und deshalb scheint Neukalibrieren zu wirken. Zweitens: **Der unterscheidende Nachweis war ein Vergleich, keine Messung** — der Strom am Feldende und der von der Baugruppe gemeldete Strom müssen identisch sein, und dass sie es nicht waren, ist eine vollständige Diagnose einer ganzen Fehlerklasse, gewinnbar in zehn Minuten mit einem Messgerät.

## Empfohlene Praxis

- Die Aktiv-Passiv-Anordnung jedes Geräts aus Klemmenbildern bestimmen, nie allein aus Herstellerwortschatz.
- Bedenken, dass ein Vierleiter-Umformer einen passiven Ausgang haben kann, und prüfen, welchen er hat.
- Jeden Kreis mit genau einer Verbindung zum Bezugssystem auslegen, deren Ort dokumentieren und auf unbeabsichtigte Ergänzungen prüfen.
- Wenn ein Messwert dauerhaft zu niedrig ist und Nachkalibrierung immer wieder nötig wird, vor jeder Verstellung den in Reihe am Feldende gemessenen Strom mit dem gemeldeten Wert vergleichen.
- Jede Geräteänderung im Kreis als Architekturänderung behandeln und aktive Seite, Bezugspunkt und Spannungsbudget gemeinsam neu prüfen.
- Damit rechnen, dass ein nachgerüsteter Trenner die aktive Seite ändert, und die Anordnung des Systemeingangs vor dem Einbau prüfen.
- Anerkennen, dass die Erdungsanforderung einer Zener-Barriere eine Entscheidung über den Bezug des Kreises ist; ein galvanischer Trenner hebt diese Bindung auf.
- Signale für mehrere Empfänger trennen statt in Reihe verketten.
- Vor jedem zusätzlichen Reihengerät dessen Fehlerzustand prüfen — ein offener Fehlerzustand macht aus einem Gerätefehler eine verlorene Messung.
- Wo HART genutzt wird, den Kreiswiderstand gegen das Spannungsmaximum und das Kommunikationsminimum auslegen und jedes Gerät im Pfad auf Transparenz prüfen.
- Nie einen Filterkondensator über einen Eingang eines HART-Kreises legen, ohne die Wirkung auf die Kommunikation zu prüfen.
- Bei der Inbetriebnahme die Gerätekonfiguration prüfen, insbesondere dass kein Gerät im Multidrop-Betrieb verblieben ist.
- Entscheiden, ob die Anlage HART-Diagnose nutzt; falls nicht, das als Entscheidung dokumentieren.
- Prüfen, ob die Eingangsbaugruppe Kanalrückleiter teilt, und wenn ein Messwert einer fremden Prozessgröße folgt, die Baugruppe vor dem Umformer verdächtigen.
- Eingänge so konfigurieren, dass Bereichsunter- und -überschreitung eigene Zustände melden, und den Unterschied zwischen unterbrochenem Kreis und meldendem Umformer erhalten.
- Die Fehlerrichtung als Prozessentscheidung festlegen, nicht als Gerätevoreinstellung.
- Sporadische Fehler durch Aufzeichnung und unterscheidende Provokation diagnostizieren und vor jedem Tausch mit einer eingespeisten Quelle halbieren.
- Kreiswiderstand, Isolationswiderstand und gemessene Ströme bei der Inbetriebnahme als Basis dokumentieren und das Kreisschaltbild über jede Änderung aktuell halten — die Architektur eines Kreises ist im Feld unsichtbar und lebt nur in der Zeichnung.
- Gegen Nachweise kalibrieren statt allein gegen einen Plan: Ein Umformer, der dauerhaft dieselbe Korrekturrichtung braucht, beschreibt den Kreis, nicht sich selbst.
- Feldverteiler als Maßnahme der Kreisintegrität auf Feuchte prüfen und gespeicherte Gerätediagnosen regelmäßig auslesen, wo HART-Geräte vorhanden sind — eine nicht abgerufene Fehlerhistorie ist ein Nachweis mit Verfallsdatum.

## Fazit

Der 4–20-mA-Kreis verdient seine Langlebigkeit ehrlich: ein gegen Spannungsfall immunes Signal, ein Zweileitergerät, das sich selbst versorgt, eine im Signalbereich eingebaute Fehleranzeige und eine digitale Schicht, die sich die Ader teilt, ohne den Analogwert zu stören. Nichts davon ist Zufall, und alles davon funktioniert weiterhin.

Was die Norm nicht tut, ist den Stromkreis auszulegen. Sie entscheidet nicht, wer die Energie liefert, wo der Bezug liegt, was den Reihenpfad sonst noch teilt, ob die digitale Schicht die Strecke übersteht und wie die Empfängerseite misst. Das sind ingenieurtechnische Entscheidungen, sie werden einmal getroffen und danach von allen geerbt, die den Kreis anfassen, und sie sind im Feld unsichtbar — ein Kreis mit zwei Bezügen und einer mit einem sehen auf der Kabelpritsche gleich aus.

Die praktische Folge ist, dass fortgeschrittene Kreisdiagnose überwiegend Architekturarchäologie ist: herauszufinden, was der Stromkreis tatsächlich ist, statt was die Zeichnung behauptet. Ein Betrieb, der die aktive Seite, den Bezugspunkt und die Reiheninhalte jedes Kreises dokumentiert — und alle drei bei jeder Geräteänderung neu prüft — verbringt seine Zeit stattdessen mit Messproblemen. Alle anderen verbringen sie damit, gesunde Messumformer zu tauschen.
