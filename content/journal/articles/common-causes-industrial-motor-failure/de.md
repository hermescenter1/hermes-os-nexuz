# Häufige Ursachen von Motorschäden in der Industrie

## Zusammenfassung

Ein Asynchronmotor ist eine einfache, robuste Maschine, die aus wenigen gut verstandenen Gründen ausfällt. Diese Gründe sind thermisch, mechanisch, elektrisch und umweltbedingt — und sie teilen eine Eigenschaft, die jede Instandhaltungsdiskussion prägt: **die Ursache liegt fast immer außerhalb des Motors.**

Ein überhitzender Motor leistet meist mehr, als seine Kühlung zulässt. Ein früh ausfallendes Lager reagiert meist auf Ausrichtung, Schmierpraxis, Riemenspannung oder einen elektrischen Pfad, den es nicht geben sollte. Eine ausgefallene Wicklung protokolliert in ihrem eigenen Brandbild meist ein Ereignis im Netz oder im Prozess.

> Der Begleitbeitrag zu Motorschutz und Fehlerdiagnose behandelt die andere Hälfte des Themas: was jede Schutzfunktion misst, was sie annehmen muss und wie sich eine Auslösung als Beleg lesen lässt. Dieser Beitrag behandelt die physikalischen Mechanismen und die dahinterliegenden Lebenszyklusentscheidungen.

**Sicherheitshinweis.** Schadensuntersuchungen erfordern Freischalten, Feststellen der Spannungsfreiheit und den Umgang mit Betriebsmitteln, die heiß sein, aus dem Zwischenkreis eines Umrichters gespeist sein oder auf Fernbefehl anlaufen können. Isolationsprüfungen setzen einen getrennten und entladenen Motor voraus. Alle diese Arbeiten sind befähigtem Personal nach den Verfahren des Standorts vorbehalten.

## Die Temperatur ist die maßgebliche Größe

Isolierung fällt nicht plötzlich aus; sie altert, und die Alterungsrate bestimmt die Temperatur.

**Die branchenübliche Faustregel besagt, dass sich die Isolationslebensdauer bei jeweils etwa 10 K dauerhafter Übertemperatur über der Bemessung ungefähr halbiert.** Es ist eine Näherung aus dem chemischen Alterungsverhalten, und ihr Wert liegt nicht in der genauen Zahl, sondern in der Form: **Übertemperatur kostet nicht proportional Lebensdauer, sondern exponentiell.** Ein Motor, der dauerhaft etwas über seiner Wärmeklasse läuft, fällt nicht nächste Woche aus; er fällt nach einem Bruchteil der Jahre aus, die er hätte halten sollen — und der Zusammenhang zur Ursache ist bis dahin verloren.

Alles in den beiden folgenden Abschnitten ist letztlich ein Mechanismus, der die Wicklungstemperatur anhebt.

## Elektrische Mechanismen

**Dauerüberlast.** Der offensichtliche Fall — und als Primärursache seltener als vermutet, weil der Schutz ihn meist erfasst. Die schädlichere Form ist die *grenzwertige* Überlast: eine Maschine, die jahrelang wenige Prozent über Bemessung und innerhalb der Schutztoleranz läuft und stetig altert.

**Spannungsunsymmetrie.** Ein unsymmetrisches Netz erzeugt ein Gegensystem, dessen Feld gegen den Rotor dreht und ihm mit nahezu doppelter Netzfrequenz erscheint, wo seine Impedanz klein ist. Eine kleine Spannungsunsymmetrie erzeugt daher eine deutlich größere Stromunsymmetrie und überproportionale Rotorerwärmung. Auf Lebenszyklusebene zählt, woher die Unsymmetrie stammt:

- Einphasige Verbraucher ungleich auf die drei Phasen verteilt.
- Ein defektes Element oder eine durchgebrannte Sicherung in einer Phase der Kompensationsanlage.
- Eine hochohmige Verbindung — ein korrodierter Kabelschuh, eine lose Klemme, ein teilweise ausgefallener Schützpol.
- Ungleiche Stufenstellungen paralleler Transformatoren.
- Unsymmetrie, die aus dem vorgelagerten Netz kommt.

**All das ist auffindbar und behebbar.** Unsymmetrie ist einer der wenigen Lebensdauerfaktoren, den eine Begehung der Schaltanlage dauerhaft beseitigen kann.

**Phasenausfall.** Die Lebenszyklusfrage lautet hier nicht, ob der Schutz ihn erfasst, sondern was er der Maschine antut, solange er andauert: Die Wicklung, die den umverteilten Strom führt, erwärmt sich weit schneller als die übrigen, sodass der Schaden konzentriert statt allgemein ausfällt. Genau diese Asymmetrie macht den Phasenausfall im Brandbild nachträglich erkennbar, wie im Abschnitt zu den Belegen beschrieben — und deshalb kann eine Maschine, die ein kurzes Ereignis überstanden hat, dennoch nur in einer Phase Isolationslebensdauer verloren haben.

**Über- und Unterspannung.** Dauerhafte Überspannung erhöht Eisenverluste und Erwärmung; Unterspannung erhöht den Strom bei gleichem Lastmoment. Beides altert die Isolierung, und beides ist ein netzseitiger Befund, kein Motorfehler.

**Wiederholtes Anfahren.** Der Anlauf ist thermisch teuer, und die Wärme geht überwiegend in den Rotor. Wiederholte Anläufe summieren die Rotortemperatur schneller, als sie abgeführt wird, und bei größeren Maschinen belastet die entstehende Temperaturwechselbeanspruchung die Läuferstäbe und ihre Verbindungen. Ein Prozess, der auf eine Auslösung mit mehrfachem sofortigem Wiederanlauf reagiert, wendet eine Betriebsart an, für die die Maschine vermutlich nie spezifiziert wurde.

**Umrichterbedingte elektrische Belastung.** Ein umrichtergespeister Motor erwirbt drei zusätzliche Alterungsmechanismen: steilflankige Spannung, die die Beanspruchung auf die ersten Windungen konzentriert, Gleichtaktstrom, der sich einen Weg durch die Lager sucht, und eine Eigenkühlung, die mit der Drehzahl sinkt, während das Lastmoment es womöglich nicht tut. Jeder wird an anderer Stelle dieser Reihe für sich behandelt. Hierher gehört die Lebenszyklusbeobachtung: Alle drei folgen aus Entscheidungen bei der Umrichterspezifikation, und alle drei zeigen sich Jahre später im Gewand mangelhafter Motorqualität.

## Thermische und umweltbedingte Mechanismen

**Blockierte Kühlung ist der stille Killer.** Ein oberflächengekühlter Motor lebt davon, dass Luft über sein Rippengehäuse strömt. Zwischen den Rippen festgesetzter Prozessstaub, ein verschmutzter oder teilweise blockierter Kühlweg, eine beschädigte oder fehlende Lüfterhaube oder ein abgebrochenes Lüfterflügelstück verringern die Wärmeabfuhr, während die elektrische Belastung unverändert bleibt. Strombasierter Schutz sieht nichts, weil sich der Strom nicht geändert hat.

**Rezirkulation ist die subtilere Variante.** Ein Motor nahe einer Wand, in einer Ecke oder in einer nachträglich ergänzten Einhausung saugt womöglich die warme Luft an, die er gerade ausgestoßen hat. Der Motor ist sauber, der Lüfter intakt — und er läuft trotzdem heiß.

**Hohe Umgebungstemperatur.** Motoren auf heißen Maschinenbühnen, nahe Öfen, in unbelüfteten Gruben oder in Elektroräumen mit verschlechterter Kühlung beginnen jeden Wärmezyklus auf einem höheren Ausgangsniveau.

**Aufstellhöhe** verringert die Kühlluftdichte und verlangt Derating; wird ein Entwurf zwischen Standorten unterschiedlicher Höhe übertragen, wird das leicht übersehen.

**Feuchte und Kondensation.** Ein Motor, der in feuchter Umgebung lange stillsteht, atmet beim Abkühlen und zieht feuchte Luft ein, die im Inneren kondensiert. Stillstandsheizungen existieren genau dafür und werden häufig abgeklemmt vorgefunden. Der Schaden zeigt sich als sinkender Isolationswiderstand und schließlich als Ausfall kurz nach einem Wiederanlauf.

**Verschmutzung.** Leitfähiger Staub, Kohle, Metallpartikel, Ölnebel und Prozesschemikalien greifen die Isolierung an oder bilden Kriechwege. Reinigungsumgebungen bringen zusätzlich Wasser mit sich, das unter Druck an Dichtungen vorbeigetrieben wird.

## Mechanische Mechanismen

Lager machen einen großen Anteil der Ausfälle nach Stückzahl aus, und ihre Ursachen liegen fast vollständig in Instandhaltungs- und Montagepraxis.

**Die Schmierung ist der größte Einzelbeitrag, und Überschmierung ist mindestens so häufig wie Unterschmierung.** Überschüssiges Fett im Lagerraum walkt, statt zu schmieren; Walken erzeugt Wärme; Wärme baut das Fett ab; abgebautes Fett schmiert nicht mehr. Der Schaden sieht aus wie ein Schmierungsversagen — verursacht hat ihn *mehr* Schmierung.

Verwandte Schmierfehler:

- **Mischen unverträglicher Fette**, was zu Entmischung oder Verhärtung führen kann.
- **Falsche Fettspezifikation** für Temperatur, Drehzahl oder Last.
- **Verunreinigtes Fett**, eingebracht über schmutziges Gerät oder einen ungereinigten Schmiernippel.
- **Blockierte Abflusswege**, sodass Fett entlang der Welle in die Wicklung statt aus dem Ablauf gedrückt wird.

**Fehlausrichtung** belastet die Lager dauerhaft in einer Richtung, für die sie nicht gewählt wurden — und belastet auch die Lager der Arbeitsmaschine. Ihre Signatur ist gerichtet und mit Schwingungsmessung lange vor dem Ausfall erkennbar.

**Riemenspannung.** Übermäßiges Spannen gegen Schlupf ist eine verbreitete Feldreaktion und eine verbreitete Ursache vorzeitiger Lagerschäden auf der Antriebsseite.

**Axialschub** aus der Arbeitsmaschine — hydraulischer Schub einer Pumpe, Druck eines Ventilators oder eine Kupplung, die ohne Berücksichtigung der Wärmedehnung montiert wurde.

**Schwingungen aus der Arbeitsmaschine**, die die Motorlager als Last erfahren, für die sie nicht ausgelegt wurden.

**Stillstandsmarkierungen (False Brinelling)** an Maschinen, die stillstehen, während benachbarte Anlagen schwingen: Die Wälzkörper reiben an fester Position gegen die Laufbahn, ohne dass sich ein Schmierfilm aufbaut. Eine besondere Gefahr für Reserve- und Lagermotoren.

**Elektrische Lagererosion** an umrichtergespeisten Maschinen, mit dem typischen Riffelbild, das der Begleitbeitrag zu Oberschwingungen, EMV und Motorleitungen behandelt.

## Prozess- und lebenszyklusbedingte Ursachen

Manche Ausfälle werden dem Motor nur in dem Sinne zugeschrieben, dass die Folge dort sichtbar wurde.

- **Eine Prozessänderung** — dichteres Material, höherer Durchsatz, anderes Produkt — hebt das Lastmoment, und der korrekt ausgelegte Motor ist nun grenzwertig.
- **Verschlissene Arbeitsmaschinen** erhöhen den Momentbedarf allmählich: eine Pumpe mit vergrößerten Spalten, ein Förderer mit schwergängigen Rollen, ein verschmutzter Ventilator, ein Getriebe mit geschädigten Lagern.
- **Ein teilverstopftes System** erhöht die Last oder verschiebt bei Kreiselmaschinen den Betriebspunkt so, dass sich Last und Kühlung zugleich ändern.
- **Eine Regelungsphilosophie mit häufigem Start-Stopp**, wo der ursprüngliche Entwurf Dauerbetrieb annahm.
- **Ersatz durch einen nominell gleichwertigen Motor** anderer Baugröße, Effizienzklasse oder Kühlart, was das thermische Verhalten einer Maschine verändert, die alle für unverändert halten.

**Die Konsequenz für die Instandhaltung: Fällt ein Motor an derselben Position ein zweites Mal aus, muss die Untersuchung der Position gelten, nicht dem Motor.**

## Die ausgefallene Maschine lesen

Der defekte Motor trägt Belege dessen, was geschehen ist — und das meiste davon wird beim Ausbau und der Instandsetzung zerstört, wenn es niemand zuvor festhält.

| Beobachtung | Was sie nahelegt |
| --- | --- |
| Symmetrische Verfärbung oder Verbrennung über alle drei Phasen | Allgemeine thermische Alterung oder Überlast; Kühlung, Umgebung und Belastung prüfen |
| Eine Phase verbrannt, die beiden anderen vergleichsweise sauber | Phasenausfall im laufenden Betrieb |
| Schaden konzentriert an Wickelköpfen und ersten Windungen | Spannungsstoß- oder umrichterbedingte Steilflankenbelastung |
| Örtliche Verbrennung in einer Spule, übrige Wicklung intakt | Windungsschluss, oft mechanisch oder durch Verschmutzung ausgelöst |
| Schaden am Nutaustritt oder wo die Wicklung das Blechpaket verlässt | Mechanische Bewegung, Schwingung oder lose Verkeilung |
| Verfärbte Läuferstäbe, gerissene Verbindungen, Kurzschlussringschaden | Wiederholte oder lange Anläufe; trägheitsreicher Hochlauf |
| Fett im Lagerraum dunkel, verhärtet oder verkokt | Überschmierung und Walken oder falsche Spezifikation |
| Riffel- oder Waschbrettmuster auf der Laufbahn | Erosion durch Lagerströme |
| Laufbahnmarken in festem Abstand ohne Drehung | Stillstandsmarkierungen durch Schwingung |
| Gerichteter Lagerverschleiß, einseitig belastet | Fehlausrichtung oder überspannter Riemen |
| Wasser-, Produkt- oder Staubeintrag im Gehäuse | Abdichtung, Reinigungspraxis oder Schutzart |
| Rippen zugesetzt, Haube fehlt, Lüfter beschädigt | Kühlungsblockade — der Stromverlauf wird normal aussehen |

**Was vor dem Zerlegen zu dokumentieren ist:**

- Welches Lager ausgefallen ist — Antriebs- oder Nichtantriebsseite. Allein das trennt mehrere Mechanismen.
- Fotos der Wicklung und beider Lagerräume vor der Reinigung.
- Auslöseaufzeichnung des Schutzes und die Ströme im Auslösemoment, falls ausgelöst wurde.
- Betriebsstunden, Anlaufzähler und jede jüngste Änderung an Prozess, Steuerung oder Instandhaltung.
- Umgebungsbedingungen und Zustand des Kühlwegs *im Vorfundzustand*.
- Isolationswiderstand vor jeder Reinigung oder Trocknung, mit Temperaturangabe.

**Ein instandgesetzter Motor ohne Aufzeichnung ist ein Ausfall, der sich wiederholt**, weil nichts gelernt wurde und die vorgelagerte Ursache weiter besteht.

## Instandhaltung, die die Lebensdauer wirklich verlängert

Die wirksamsten Maßnahmen sind unspektakulär und günstig.

- **Den Kühlweg frei halten.** Rippen reinigen sowie Lüfter und Haube prüfen ist an staubigen Standorten die wertvollste Routineaufgabe und adressiert einen Mechanismus, den der Schutz nicht sieht.
- **Nach Spezifikation schmieren — Menge und Intervall — und Überschmierung als Fehler behandeln.** Wo automatische Schmiergeräte eingesetzt werden, deren Abgaberate verifizieren statt annehmen.
- **Sauber ausrichten und nach der Wärmedehnung nachprüfen**, Riemen nach Vorgabe spannen statt nach Gefühl.
- **Schwingungen trenden**, wo die Konsequenz es rechtfertigt; Lagerschädigung ist lange erkennbar, bevor sie elektrisch sichtbar wird.
- **Temperaturkorrigierten Isolationswiderstand trenden** und die Maschine mit ihrer eigenen Historie vergleichen statt mit einem Absolutwert.
- **Stillstandsheizungen funktionsfähig halten** und nach Arbeiten verifizieren — sie werden häufig abgeklemmt vorgefunden.
- **Die Schaltanlage periodisch auf Unsymmetrie prüfen**; eine netzseitige Korrektur mit anlagenweitem Nutzen.
- **Anläufe zählen**, wo der Prozess Wiederanläufe begünstigt, und das zulässige Regime im Schutz durchsetzen.
- **Ersatzmotoren korrekt lagern** — trocken, mit periodisch gedrehter Welle, fern schwingender Anlagen.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Stahlwalzwerk verzeichnet zunehmende Motorlagerschäden an einer Linie. Über achtzehn Monate fallen fünf Motoren ähnlicher Größe mit Schäden am nichtantriebsseitigen Lager aus. Die Motoren werden instandgesetzt, die Lager in gleicher Spezifikation ersetzt — die Ausfälle gehen weiter.

```text
Symptom:
Repeated non-drive-end bearing failures on multiple motors of one line.

Evidence:
- failures began roughly a year after a revised lubrication programme
  increased greasing frequency on this line
- motors on an adjacent line, not included in the revised programme,
  show no change in failure rate
- recovered grease is darkened and hardened, and the bearing cavities
  are full rather than partially filled
- bearing temperatures, where recorded, ran above their previous values
  before each failure
- alignment records are within tolerance and unchanged
- vibration spectra show bearing deterioration developing over weeks,
  not a sudden mechanical event
- motor currents are normal throughout, and no protection operated
  until the bearing seized

Reasoning:
The failures correlate with a maintenance change rather than with a
process or electrical change, and the adjacent line acts as a control
group. Excess grease in the cavity churns instead of lubricating, which
raises temperature, which degrades the grease, which removes the
lubricating film. The evidence — full cavities, degraded grease, rising
temperature, gradual vibration development — matches that mechanism and
does not match misalignment, electrical erosion or contamination.

Next investigations:
- manufacturer's grease quantity and interval for these bearing sizes
- actual delivered quantity per event, including automatic lubricators
- whether grease relief paths are clear
- whether the grease specification was also changed
- bearing temperature trending as a routine measurement on this line
```

Die Korrektur besteht darin, zu Menge und Intervall des Herstellers zurückzukehren, die Abflusswege zu prüfen und die Lagertemperatur als überwachte Größe zu führen. Die weitergehende Lehre ist unangenehm und gehört ausgesprochen: **Die Ausfälle wurden durch eine Instandhaltungsverbesserung verursacht, und diese Verbesserung erfolgte in gutem Glauben durch Menschen, die genau diesen Schadensmechanismus verhindern wollten.** Erst der Vergleich mit der unveränderten Linie machte die Ursache sichtbar.

## Fehlermodi der Untersuchung selbst

**Motor getauscht, Ursache nicht gesucht.** Der zweite Ausfall kommt planmäßig.

**Maschine vor der Fotodokumentation gereinigt.** Das Brandbild — der aussagekräftigste Beleg — ist verloren.

**Isolationsprüfung nach dem Trocknen.** Der Messwert beschreibt die Werkstatt, nicht den Schaden.

**Nur der Motor untersucht.** Arbeitsmaschine, Netz und Kühlweg sind die üblichen Fundorte der Ursache.

**Lagerschaden der Lagerqualität zugeschrieben.** Mehrfachausfälle an derselben Position sind ein Entwurfs- oder Praxisbefund, kein Lieferantenbefund.

**Auslösedaten vor der Aufzeichnung zurückgesetzt.** Die elektrische Vorgeschichte fehlt.

**Keine Vergleichsgruppe betrachtet.** Gleichartige Maschinen gleicher Betriebsart sind das billigste verfügbare Experiment.

## Empfohlene Praxis

- Die Temperatur als primäre Lebensdauergröße behandeln und im Blick behalten, dass Übertemperatur exponentiell statt proportional kostet.
- Netzunsymmetrie an der Schaltanlage erfassen und beheben; eine dauerhafte, anlagenweite Verbesserung.
- Kühlwege routinemäßig prüfen und freihalten; strombasierter Schutz erkennt ihre Blockade nicht.
- Rezirkulation prüfen, wo Motoren in Ecken, Gruben oder nachträglichen Einhausungen stehen.
- Nach Herstellermenge und -intervall schmieren, die Abgabe automatischer Schmiergeräte verifizieren und Abflusswege frei halten.
- Nach Vorgabe ausrichten, nach Wärmedehnung nachprüfen und Riemen nach Vorgabe statt nach Gefühl spannen.
- Stillstandsheizungen funktionsfähig halten und nach Arbeiten verifizieren.
- Schwingung und temperaturkorrigierten Isolationswiderstand gegen die eigene Historie jeder Maschine trenden.
- Anläufe als überwachte Größe zählen und eine Maschine, deren Wiederanlaufhistorie das Herstellerregime übersteigt, als Betriebs- und nicht als Motorproblem behandeln.
- Die Historie der Position dokumentieren, nicht nur die des Motors; ein zweiter Ausfall an derselben Position ist eine Untersuchung der Position.
- Die ausgefallene Maschine vor Reinigung und Zerlegung fotografieren und dokumentieren, einschließlich des betroffenen Lagers.
- Ersatzmotoren korrekt lagern und die Welle periodisch drehen, fern von Schwingungsquellen.

## Fazit

Motoren fallen aus einer kurzen Liste von Gründen aus, und nahezu jeder davon ist die Folge einer anderswo getroffenen Entscheidung: wie die Maschine gekühlt wird, wie symmetrisch das Netz ist, wie geschmiert und ausgerichtet wird, wie oft der Prozess sie wieder anfährt und ob die angetriebene Ausrüstung still schwergängiger geworden ist.

Deshalb ist die nützlichste diagnostische Gewohnheit dieses Felds, einen Motorschaden so lange nicht als Motorproblem zu behandeln, bis die Belege es sagen. Die ausgefallene Maschine erzählt sehr viel — Brandbild, Lager, Fett, Zustand der Rippen —, sofern jemand hinsieht, bevor gereinigt wird, und sofern die Untersuchung bis zur Position reicht, statt bei der Teilenummer aufzuhören.
