# PROFINET-Netzentwurf für große Industrieanlagen

## Zusammenfassung

PROFINET zum Laufen zu bringen ist einfach; es wartbar zu machen ist schwierig. Ein ohne Topologieplan zusammengesetztes Netz besteht die Inbetriebnahme, läuft ein Jahr und erzeugt dann eine Klasse sporadischer Störungen, die niemand lokalisieren kann — weil der Entwurf nie festgelegt hat, zu welchem Segment ein Symptom gehört.

Die Entscheidungen, die darüber bestimmen, fallen früh und sehen nach Netzwerktechnik aus: Topologie, Aktualisierungszeiten, Namensgebung, Medienwahl. Sie wirken jedoch wie Verfügbarkeitstechnik, denn in einem Anlagennetz lautet die Frage nie „wie viel Durchsatz“. Sie lautet: *was steht still, wenn diese Verbindung ausfällt, und wie schnell kann das jemand feststellen.*

## Topologie ist eine Entscheidung über Fehlerdomänen

Die meisten PROFINET-Geräte enthalten einen Zwei-Port-Switch, was das Durchschleifen physikalisch trivial und architektonisch folgenreich macht.

| Topologie | Verhalten bei einer Unterbrechung | Verkabelungsaufwand | Typische Eignung |
| --- | --- | --- | --- |
| Linie | Alles hinter der Unterbrechung fällt aus | Am geringsten | Kurze Ketten, bei denen die ganze Kette eine Prozesseinheit ist |
| Stern | Nur der betroffene Zweig fällt aus | Höher; Einzelstrecken zum Schrank | Verteilte Zellen mit eigenständiger Konsequenz |
| Ring (MRP) | Automatische Wiederherstellung nach Rekonfiguration | Linienaufwand plus Schließstrecke | Linien, deren Ausfall die Produktion stoppt |

**Die daraus folgende Entwurfsregel: Die Länge einer Linie ist die Größe ihrer Fehlerdomäne.** Eine Kette aus fünfzehn Geräten bedeutet, dass ein beschädigtes Kabel oder ein defekter Geräteport fünfzehn Stationen entfernen kann. Das kann vollkommen akzeptabel sein, wenn alle fünfzehn zu einer Maschine gehören, die als Ganzes stillsteht — und inakzeptabel, wenn sie sich über drei unabhängige Prozessbereiche erstrecken.

Die Frage für jede Kette lautet daher nicht „wie lang darf diese Linie sein?“, sondern **„welche Geräte gehören in dieselbe Fehlerdomäne, und tun diese das?“** Ketten, die einer Kabeltrasse statt einer Prozessgrenze folgen, sind der häufigste strukturelle Mangel in installierten PROFINET-Netzen.

**Jedes Gerät in einer Linie fügt Weiterleitungsverzögerung hinzu.** In einem gut entworfenen Netz ist der Effekt moderat, aber er summiert sich und wechselwirkt am Ende einer langen Kette mit der Wahl der Aktualisierungszeit. Lange Linien mit schnellen Aktualisierungszeiten sind die Kombination, die Grenzverhalten erzeugt — bei der Inbetriebnahme funktionsfähig, unter Last oder Temperatur nicht mehr.

## MRP und die Grenzen der Ringredundanz

Das Media Redundancy Protocol macht aus einem Ring ein Netz, das eine Unterbrechung übersteht. Es ist wertvoll und wird häufig missverstanden.

**Was MRP leistet:** Ein Gerät übernimmt die Rolle des Ringmanagers und hält den Ring logisch offen, damit keine Schleife entsteht. Bei einer Unterbrechung schließt es den Pfad, und der Verkehr läuft nach einem durch die Konfiguration bestimmten Rekonfigurationsintervall weiter.

**Was MRP nicht leistet:**

- Es schützt nicht gegen ein Gerät, das so ausfällt, dass beide Ports weiter weiterleiten. Ringredundanz adressiert Verbindungsverlust, nicht jeden Gerätefehler.
- Es übersteht keine zwei Unterbrechungen. Ein Ring mit einem unbemerkten Fehler ist eine Linie, und der zweite Fehler legt das Netz still — weshalb ein nicht überwachter Ring eine Redundanz ist, die stillschweigend abläuft.
- Es hilft Geräten nicht, die als Stich vom Ring abgehen. Diese Geräte liegen unabhängig vom Ring in einer Linientopologie.

**Die Wechselwirkung mit der Aktualisierungszeit ist die Randbedingung, die übersehen wird.** Übersteigt das Rekonfigurationsintervall die Ansprechüberwachungszeit der IO-Geräte, erzeugt jede Ringwiederherstellung einen Stationsausfall und — je nach Programm — einen Anlagenstopp. Der Ring erholt sich, und die Anlage löst trotzdem aus. Aktualisierungszeit, Ansprechüberwachung und Ringrekonfiguration müssen als eine Rechnung abgestimmt werden, statt von drei verschiedenen Personen eingestellt zu werden.

## RT, IRT und die Wahl der Aktualisierungszeit

**RT deckt die weit überwiegende Mehrheit der industriellen Peripherie ab.** Echtzeitrahmen sind priorisierter Ethernet-Verkehr, den industrielles Standard-Switching bewältigt; für Ventile, Antriebe bei üblichen Regelraten, Sensorik und dezentrale Peripherie ist das vollständig ausreichend.

**IRT existiert für Anwendungen, bei denen das Timing des Telegramms selbst Teil der Regelung ist.** Isochrone Bewegung, koordinierte Achsen und Messungen, die in einem definierten Verhältnis zum Regelzyklus abgetastet werden müssen. IRT verlangt Hardwareunterstützung entlang des gesamten Pfades und eine geplante Topologie, weil der Ablaufplan Sendezeitfenster reserviert.

**Die Entwurfsfolge ist schlicht und wird oft ignoriert: IRT schränkt die Topologie ein.** Ein Netz, das später auf einem Teilpfad IRT benötigen könnte, lässt sich nicht als ungeplante Kette aus zufällig verfügbarer Hardware bauen. Das zur Entwurfszeit zu entscheiden kostet nichts; es beim Maschinenumbau zu entdecken kostet eine Neuverkabelung.

**Die Aktualisierungszeit soll gewählt und nicht minimiert werden.** Der Reflex, an jedem Gerät den schnellsten verfügbaren Wert einzustellen, ist eine Lastentscheidung per Vorgabe und verbraucht Steuerungs- und Netzressourcen ohne Nutzen an einem Ventil, das in einer Sekunde schaltet.

Praktische Auswahllogik:

- Die Aktualisierungszeit auf den physikalischen Prozess abstimmen, dem das Gerät dient, nicht auf das, was die Hardware zulässt.
- Im Blick behalten: Die Aktualisierungszeit ist das, was das Netz liefert; das Programm läuft weiterhin im Zyklus der Steuerung. Daten, die schneller eintreffen, als das Programm sie liest, ändern nichts.
- Die Ansprechüberwachung — die Zahl akzeptierter Aktualisierungszyklen ohne IO-Daten — hoch genug setzen, um die erwarteten Transienten des Netzes einschließlich der Ringrekonfiguration zu überstehen, und niedrig genug, damit ein echter Verlust rechtzeitig erkannt wird.

**Die Konfiguration der Ansprechüberwachung ist eine sicherheitsrelevante Verfügbarkeitsentscheidung im Gewand eines Kommunikationsparameters.** Zu kurz, und normale Netzereignisse setzen die Anlage still; zu lang, und ein echter Kommunikationsverlust bleibt unbemerkt, während das Programm auf veralteten Prozessdaten arbeitet.

## Gerätenamen und IP-Strategie

PROFINET identifiziert IO-Geräte über den Namen, und die Steuerung vergibt die Adressierung beim Anlauf auf dieser Grundlage. Das hat eine große betriebliche Folge.

**Der Gerätetausch ohne Engineering-Werkzeug hängt an Namensgebung und projektierter Topologie.** Ist die Topologie projektiert und sind die Nachbarschaftsbeziehungen bekannt, lässt sich ein Ersatzgerät über seine Position identifizieren und erhält den richtigen Namen automatisch. Wo die Topologie nicht projektiert ist, verlangt ein Gerätetausch jemanden mit Programmiergerät, Projekt und dem Wissen, beides zu bedienen — zu welcher Stunde der Ausfall auch eintritt.

Diese eine Eigenschaft rechtfertigt den größten Teil der Namensdisziplin:

- **Ein Namensschema, das Ort und Funktion kodiert**, damit ein Name für eine Instandhaltungsfachkraft aussagekräftig ist, die das Projekt nie gesehen hat.
- **Namen, die zum Anlagenkennzeichnungssystem passen**, nicht zur Reihenfolge der Inbetriebnahme.
- **Eine gepflegte Topologieprojektierung, die Anlagenänderungen mitgeht.** Eine Topologieprojektierung, die nicht mehr der Wirklichkeit entspricht, ist kein Instandhaltungsvorteil mehr, sondern eine Quelle falscher Diagnosemeldungen.

**Die IP-Strategie** sollte berücksichtigen, dass das IO-Netz eine Broadcast-Domäne mit eigenem Erkennungsverkehr ist. Praktische Punkte:

- Das IO-Subnetz getrennt von Leitebenen- und Unternehmensadressierung halten, mit einem dokumentierten Plan statt eines gewachsenen Bereichs.
- Blöcke je Bereich oder Zelle reservieren, damit eine Adresse einen Ort anzeigt.
- Beachten, dass die Geräteerkennung ein Layer-2-Mechanismus ist und keinen Router passiert. Alles, was darauf beruht — Inbetriebnahmewerkzeuge, Namensvergabe, Teile der Diagnose — muss im selben Segment liegen wie die Geräte.

## Medien, EMV und Schrankbau

Die physikalische Ebene erzeugt die am schwersten diagnostizierbaren Fehler, weil sie ihrer Natur nach sporadisch sind und mit Dingen korrelieren, die niemand aufzeichnet.

**Die Kabelauswahl** sollte den industriellen Kabeltypen für Umgebung und Bewegungsprofil folgen: feste Verlegung, gelegentliche Bewegung und dauerhafte Bewegung sind verschiedene Spezifikationen, und der Ausfall eines außerhalb seiner Auslegung eingesetzten Kabels zeigt sich Monate später als sporadischer Verbindungsverlust.

**Die Kupfer-Segmentlänge folgt der Ethernet-Standardgrenze von 100 m**, und diese Grenze setzt voraus, dass Kabel, Steckverbinder und Installation sämtlich korrekt sind. Im industriellen Umfeld ist die praktische Reserve kleiner, als die Zahl nahelegt.

**Lichtwellenleiter ist für drei konkrete Bedingungen die richtige Wahl**, und es lohnt, sie zu benennen, weil LWL oft entweder über- oder unterverwendet wird:

- Strecken jenseits der Kupfergrenze.
- Übergänge zwischen Gebäuden oder Bereichen mit unterschiedlichen Erdungssystemen, wo eine Kupferverbindung Potentialdifferenz führen würde.
- Trassen durch Umgebungen mit starker elektrischer Störbeeinflussung, in denen Schirmung allein keine belastbare Antwort ist.

**Der Potentialausgleich ist der am häufigsten fehlende Punkt.** Ein geschirmtes Netzwerkkabel zwischen zwei Schränken mit Potentialdifferenz führt Strom über seinen Schirm, und die entstehende Störung zeigt sich als sporadische Kommunikationsfehler, die keine Netzwerkanalyse erklären wird. Ein ausreichend dimensionierter Potentialausgleichsleiter entlang derselben Trasse beseitigt den Mechanismus.

**Die Ausführung im Schrank** zählt auf Weisen, die trivial wirken und es nicht sind: getrennte Verlegung von Netzwerk- gegenüber Motor- und Antriebsleitungen, Einhaltung des Biegeradius, Zugentlastung, damit kein Steckverbinder das Kabelgewicht trägt, und eine Schirmauflage nach Vorgabe statt nach Bequemlichkeit. Jeder dieser Punkte erzeugt einen Fehler, der sich als Netzwerkproblem zeigt und keines ist.

## Diagnose, die ein Segment benennt

Der Zweck der Netzdiagnose ist nicht, zu wissen, dass die Kommunikation ausgefallen ist. Das weiß bereits jeder. Er besteht darin, *welches Segment* und idealerweise *welchen Port* zu benennen, ohne die Anlage abzulaufen.

Beweisquellen, die von Anfang an eingeplant gehören:

| Beweis | Was er unterscheidet |
| --- | --- |
| Port-Fehler- und Discard-Zähler an Switches und Geräten | Eine degradierende physikalische Verbindung gegenüber einer sauberen |
| Welche Stationen gemeinsam ausgefallen sind | Ein gemeinsames Segment gegenüber unabhängigen Gerätefehlern |
| Projektierte gegenüber tatsächlicher Topologie (Nachbarschaftserkennung) | Ein an den falschen Port gestecktes Kabel gegenüber einem echten Ausfall |
| Diagnosemeldungen aus dem Gerät selbst | Modul- oder Kanalfehler gegenüber Netzwerkfehler |
| Korrelation mit Anlagenereignissen | Kommunikationsfehler, die mit dem Anlauf eines Antriebs zusammenfallen |

**Die wertvollste Einzelmaßnahme ist, die Fehlerzähler aufzunehmen, solange die Anlage als in Ordnung gilt.** Zähler sind kumulativ; ohne Referenz kann jemand, der einen Wert ungleich null sieht, nicht sagen, ob er sich über drei Jahre oder über drei Minuten aufgebaut hat. Mit einer Baseline wird derselbe Wert zu einer Rate, und eine Rate ist eine Diagnose.

**Zwei Symptommuster, die man kennen sollte:**

- **Mehrere Stationen fallen gleichzeitig aus** — das deutet auf ihr gemeinsames Segment hin: den Switch, den Uplink oder das Kabel, von dem alle abhängen, und nicht auf die Stationen.
- **Eine Station fällt sporadisch unter einer wiederholbaren Anlagenbedingung aus** — das deutet auf Einkopplung auf der physikalischen Ebene hin, und die Bedingung selbst ist der stärkste Hinweis: ein anlaufender Antrieb, ein fahrender Kran, eine erreichte Temperatur.

## Fehlermodi

**Eine Kette, die Prozessgrenzen überspannt.** Ein Kabelfehler stoppt drei unabhängige Bereiche.

**Ein Ring mit unbemerkter Unterbrechung.** Die Redundanz ist irgendwann abgelaufen; der zweite Fehler nimmt alles mit.

**Ringrekonfiguration länger als die Ansprechüberwachung.** Das Netz erholt sich; die Anlage löst trotzdem aus.

**Überall die schnellste Aktualisierungszeit als Vorgabe.** Steuerungs- und Netzlast für Geräte, die davon nichts haben.

**Ansprechüberwachung auf einem Wert, den niemand berechnet hat.** Entweder Stationsstörungen ohne Anlass oder unentdeckter Datenverlust.

**Topologie nicht projektiert.** Der Gerätetausch verlangt nachts eine Ingenieurin oder einen Ingenieur mit dem Projekt.

**Namen in Inbetriebnahmereihenfolge vergeben.** Niemand kann eine Diagnosemeldung einem physikalischen Ort zuordnen.

**Kein Potentialausgleich zwischen Schränken.** Schirmstrom erzeugt sporadische Fehler, die Netzwerkwerkzeuge nicht erklären.

**Fehlerzähler nie als Baseline erfasst.** Jeder Wert ist uninterpretierbar.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Eine Verpackungshalle meldet gelegentliche gleichzeitige Ausfälle von sechs IO-Stationen. Die Störung verschwindet binnen Sekunden und hinterlässt keine offensichtliche Spur. Seit Monaten wird sie „Netzstörungen“ zugeschrieben.

Der Befund ändert das Bild. Die sechs Stationen sind nicht so über die Halle verteilt, wie die Layoutzeichnungen nahelegen; sie bilden eine einzige Kette, verkabelt in der Reihenfolge, in der die Schaltschränke aufgestellt wurden. Die erste Station dieser Kette steht in einem Schrank neben einem großen Antrieb. Die Port-Fehlerzähler am vorgelagerten Port dieser Station sind ungleich null und steigen, nachdem sie eine Woche lang beobachtet wurden, deutlich an — während jeder andere Port in der Halle unverändert bleibt.

Nichts an dieser Diagnose erforderte einen Protokollanalysator. Erforderlich war das Wissen, dass die sechs Stationen ein Segment teilen und dass ein Port Fehler ansammelt, während andere es nicht tun. Die Kettenstruktur — auf der Layoutzeichnung unsichtbar, in der Topologie sichtbar — verwandelte „sechs zufällige Stationen“ in „ein Segment“.

Als physikalische Ursache erweist sich ein Netzwerkkabel, das im gemeinsamen Kanal neben Motorleitungen verlegt wurde, in einer Kette, deren erstes Glied den Verkehr aller sechs Stationen trägt. Diese eine Strecke neu zu verlegen beseitigt das Symptom.

Die Entwurfslehre ist die strukturelle: Die Kette wurde entlang einer Kabeltrasse statt einer Prozessgrenze gebaut, sodass eine einzelne physikalische Exposition sechs Stationen betraf, die funktional nichts miteinander zu tun hatten. Eine Sternverteilung aus einem Schrank-Switch hätte denselben physikalischen Fehler zu einem Ein-Stations-Ereignis gemacht und die Diagnose am ersten Tag offensichtlich.

## Inbetriebnahme und Wartbarkeit

Bei der Inbetriebnahme wird ein Netz entweder dokumentiert oder rätselhaft, und der Unterschied besteht weitgehend aus wenigen bewussten Schritten.

- **Gerätenamen vor der Verkabelung vergeben**, nach dem Anlagenkennzeichnungssystem, und die physische Beschriftung dazu passend ausführen.
- **Die Topologie projektieren**, damit die Nachbarschaftserkennung sowohl für den Gerätetausch als auch für die Diagnose zur Verfügung steht.
- **Den Ist-Zustand gegen den Entwurf prüfen** — während der Montage verlängerte Ketten sind normal; die undokumentierten verursachen später Ärger.
- **Baseline-Fehlerzähler aufnehmen**, an jedem Port, bei normal laufender Anlage.
- **Die spezifizierte Redundanz testen**: den Ring bewusst auftrennen, die Wiederherstellung bestätigen und bestätigen, dass während der Rekonfiguration keine Station einen Ausfall gemeldet hat. Ein nie getesteter Ring ist ein Ring, dessen Rekonfigurationszeit nie mit der Ansprechüberwachung verglichen wurde.
- **Ein Topologiediagramm übergeben, das der Installation entspricht**, denn jede künftige Diagnose beginnt mit der Frage, welche Geräte ein Segment teilen.

## Empfohlene Praxis

- Die Topologie um Fehlerdomänen herum entwerfen, nicht um Kabeltrassen.
- Ketten innerhalb einer Prozessgrenze halten; Sternverteilung nutzen, wo Konsequenzen unabhängig sind.
- MRP einsetzen, wo der Ausfall der Linie zählt, die Ringintegrität überwachen und einen offenen Ring als aktive Störung behandeln.
- Ringrekonfigurationszeit, Aktualisierungszeit und Ansprechüberwachung als eine Rechnung abstimmen.
- Aktualisierungszeiten passend zum Prozess wählen; nicht per Vorgabe minimieren.
- Früh entscheiden, ob ein Pfad IRT benötigen könnte, denn das schränkt Topologie und Hardware ein.
- Geräte nach Ort und Funktion benennen, passend zum Anlagenkennzeichnungssystem.
- Die Topologie projektieren und pflegen, damit der Gerätetausch kein Engineering-Werkzeug braucht.
- Das IO-Subnetz getrennt halten und bedenken, dass die Geräteerkennung keinen Router passiert.
- Den Kabeltyp nach Bewegungsprofil wählen; LWL für Distanz, Gebäudeübergänge und starke Störbeeinflussung.
- Potentialausgleich entlang der Kabeltrassen zwischen Schränken ausführen.
- Port-Fehlerzähler bei der Inbetriebnahme als Baseline erfassen und als Raten lesen.
- Die Ringwiederherstellung vor der Übergabe testen und das Ergebnis dokumentieren.

## Fazit

Ein PROFINET-Netz, das läuft, ist nicht dasselbe wie eines, das sich instand halten lässt. Der Unterschied entsteht aus Entscheidungen, die unsichtbar bleiben, solange alles funktioniert: ob eine Kette einer Fehlerdomäne entspricht, ob die Topologie projektiert ist, ob Namen einer Fachkraft etwas sagen, ob die Ansprechüberwachung berechnet oder geerbt wurde und ob jemand festgehalten hat, wie die Fehlerzähler aussahen, als die Anlage gesund war.

Nichts davon ist zur Entwurfszeit teuer. Alles davon ist teuer nachzurüsten, und die Rechnung wird in der Regel während einer Störung beglichen, nachts, von jemandem, der am Entwurf nicht beteiligt war.
