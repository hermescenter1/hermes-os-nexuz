# Auswahl und Schutz industrieller Transformatoren

## Zusammenfassung

Ein Transformator gehört zu den wenigen Betriebsmitteln einer Industrieanlage, die einmal ausgewählt und dann über Jahrzehnte weitgehend unverändert betrieben werden. Diese Asymmetrie — Minuten der Spezifikation, Jahrzehnte der Folgen — ist der Grund, warum die Auswahlentscheidungen mehr Sorgfalt verdienen, als sie meist erhalten, und warum ein „eins zu eins“ auf Basis der Bemessungsleistung ersetzter Transformator zu den zuverlässigsten Wegen gehört, ein Problem einzuführen, das Jahre später auftritt.

Drei Gedanken ordnen diesen Beitrag.

**Die Bemessungsleistung ist eine thermische Aussage, keine Fähigkeit.** Ein für eine bestimmte Leistung bemessener Transformator ist unter festgelegten Bedingungen von Umgebungstemperatur, Kühlungsart und Kurvenform bemessen. Ändern Sie die Umgebung, behindern Sie die Kühlung, fügen Sie Oberschwingungslast hinzu oder prägen Sie einen zyklischen Betrieb auf, und die Zahl auf dem Schild beschreibt nicht mehr, was das Gerät leisten kann.

**Die Kurzschlussspannung ist die weitreichendste Zahl des Datenblatts.** Sie legt das Fehlerniveau fest, dem die nachgelagerte Schaltanlage standhalten muss, den Spannungsfall, den die Anlage erlebt, den Einbruch beim Anlauf eines großen Motors und die Frage, ob das Gerät mit einem anderen Last teilen kann. Sie wird routinemäßig als Herstellerdetail behandelt.

**Der Schutz ist gestaffelt, und welche Stufen physisch verfügbar sind, hängt vom Aufbau des Transformators ab.** Hier gehen Spezifikationen am häufigsten fehl: Gassammelschutz existiert nur bei bestimmten flüssigkeitsgefüllten Bauformen, und ihn pauschal zu fordern erzeugt entweder eine nicht erfüllbare Bestellung oder — schlimmer — eine Anlage, die glaubt, eine Schutzfunktion zu besitzen, die sie nicht hat.

**Sicherheitsgrenze.** Was folgt, ist Spezifikations- und Bewertungshilfe. Ein Transformator enthält gespeicherte Energie, hohe Fehlerenergie, heiße Oberflächen, Isolierflüssigkeit und bei manchen Bauformen Gas unter Druck. Jede unten erwähnte Tätigkeit, von der Flüssigkeitsprobenahme über die elektrische Prüfung bis zur inneren Besichtigung, unterliegt eigenen Freigabe-, Freischalt- und Qualifikationsanforderungen aus den geltenden Normen und den Verfahren des Betreibers, und keine davon darf außerhalb dieser erfolgen. Keine hier beschriebene Tätigkeit ist Arbeit an unter Spannung stehenden Betriebsmitteln.

## Kenngrößen, die in Wahrheit Auslegungsentscheidungen sind

**Bemessungsleistung und Belastungsprofil.** Die Bemessung unterstellt eine definierte Kühlungsart und eine definierte Umgebungstemperatur. Kühlungsarten werden durch Buchstabencodes ausgedrückt, die das innere Medium, dessen Umlauf, das äußere Medium und dessen Umlauf beschreiben — ein flüssigkeitsgefülltes Gerät mit natürlichem Flüssigkeits- und Luftumlauf verhält sich völlig anders als eines mit Lüftern, und die lüfterunterstützte Bemessung steht nur zur Verfügung, wenn die Lüfter laufen. **Ein zyklisches Lastprofil ist eine andere Frage als eine Spitzenlast**, denn die thermische Masse erlaubt es einem Transformator, seine Dauerleistung zeitlich begrenzt zu überschreiten und sich danach zu erholen; diese Fähigkeit ist real, sie wird durch Belastungsrichtlinien geregelt, und sie hängt von der vorangegangenen Last und der Umgebungstemperatur ab. Sie gehört ausgelegt, nicht unterstellt.

**Umgebung, Aufstellungshöhe und Gehäuse.** Bemessungen gelten für Bezugsbedingungen. Ein warmer Betriebsraum, ein Gehäuse, das die Luftströmung behindert, oder eine Aufstellung in Höhenlage — wo die geringere Luftdichte sowohl die Kühlung als auch die äußere Isolationsfestigkeit mindert — verlangen jeweils eine erneute Prüfung der Bemessung. **Die häufigste Ausprägung dieses Fehlers ist ein Transformator, der auf dem Prüffeld seine Spezifikation erfüllt und dann in einem Raum aufgestellt wird, der die Wärme nicht abführen kann.**

**Oberschwingungslast.** Oberschwingungsstrom erhöht die Verluste überproportional, ein Transformator für erheblich verzerrte Last muss also entsprechend spezifiziert werden. Mechanismus und Messung behandelt der Begleitbeitrag zur Netzqualität; die Folge für die Spezifikation ist, dass das Oberschwingungsspektrum in die Anfrage gehört und nicht in eine spätere Untersuchung.

**Übersetzungsverhältnis und Anzapfungen.** Anzapfungen ohne Lastumschaltung werden nur am freigeschalteten und spannungsfreien Transformator verstellt; sie werden einmal eingestellt, meist bei der Inbetriebnahme, und dann vergessen — was sie zu einer Inbetriebnahmeentscheidung macht, die dokumentiert gehört. Ein Laststufenschalter ist etwas anderes: Er bringt Spannungsregelung unter Last mit sich, und damit eine Mechanik, ein Regelkonzept, ein eigenes Instandhaltungsregime und einen eigenen Schutz.

**Schaltgruppe und Wicklungsanordnung.** Die Anordnung bestimmt die Phasenbeziehung zwischen den Wicklungen und den Weg, der dem Nullsystemstrom offensteht. Eine Dreieck-Stern-Anordnung ist in der Verteilung der industrielle Normalfall, weil die Dreieckwicklung Nullsystemstrom in sich kreisen lässt statt ihn weiterzugeben, und die Sternwicklung den Sternpunkt für die Erdung des Niederspannungssystems bereitstellt. **Dieser Sternpunkt ist eine Entscheidung der Systemerdung und kein Nebenmerkmal** — wie er geerdet wird, bestimmt den verfügbaren Erdschlussstrom und damit, was der Schutz überhaupt erkennen kann; entwickelt wird das im Begleitbeitrag zur Erdung.

**Kurzschlussspannung — der Zielkonflikt, klar benannt.** Eine niedrigere Kurzschlussspannung ergibt besseren Spannungshaltung und einen geringeren Einbruch beim Anlauf großer Motoren — und ein *höheres* Fehlerniveau auf der Unterspannungsseite. Eine höhere Kurzschlussspannung begrenzt den Durchgangsfehlerstrom, dem die nachgelagerte Schaltanlage standhalten muss, und ergibt schlechtere Spannungshaltung und tiefere Anlaufeinbrüche. Es gibt keine allgemein richtige Wahl; es gibt nur eine Wahl, die bewusst und im Hinblick auf die Bemessung der nachgelagerten Betriebsmittel und das Anlaufverhalten der Motoren getroffen wurde.

**Parallelbetrieb.** Zwei Transformatoren können nur parallel betrieben werden, wenn ihre Phasenverschiebung zueinander passt, ihre Übersetzungsverhältnisse übereinstimmen und ihre Kurzschlussspannungen nahe genug beieinanderliegen, damit die Lastaufteilung akzeptabel ist. **Eine Abweichung der Kurzschlussspannung verhindert den Parallelbetrieb nicht; sie erzeugt eine ungleiche Lastaufteilung**, sodass das Gerät mit der niedrigeren Kurzschlussspannung mehr als seinen Anteil übernimmt und seine thermische Grenze zuerst erreicht. Der Parallelbetrieb verändert außerdem das Fehlerniveau, was die Frage zur Bemessung der Schaltanlage zurückführt.

## Flüssigkeitsgefüllt und Trockentyp: ein echter Vergleich

Diese Wahl wird oft als Vorliebe dargestellt. Sie ist eine ingenieurtechnische Entscheidung, die von Brandrisiko, Aufstellungsort und Umgebung bestimmt wird.

| | **Flüssigkeitsgefüllt** | **Trockentyp (Gießharz oder imprägniert)** |
| --- | --- | --- |
| **Isolierung und Kühlung** | Isolierflüssigkeit plus Festisolierung; die Flüssigkeit überträgt auch Wärme | Luft plus Festisolierung; Wärme geht nur über Luft ab |
| **Brandverhalten** | Stark von der Flüssigkeit abhängig; Fluide unterscheiden sich deutlich im Brennpunkt, die Klassifizierung bildet das ab | Keine Isolierflüssigkeit, aber die Werkstoffe haben ein definiertes Brandverhalten, das zu spezifizieren ist |
| **Aufstellungsort** | Meist im Freien oder in einem eigenen Raum mit Auffangwanne und Brandabtrennung | Oft näher an der Last und innerhalb des Gebäudes möglich |
| **Kurzzeitige Überlast** | Erhebliche thermische Masse gibt nutzbare Kurzzeitreserve | Geringere thermische Masse; reagiert schneller auf Überlast und Umgebung |
| **Umgebungsempfindlichkeit** | Gegen Feuchte und Verschmutzung gekapselt | Empfindlich gegen Feuchte, Betauung, Staub und korrosive Atmosphären; braucht saubere Kühlluft |
| **Zustandsüberwachung** | Die Flüssigkeit selbst ist Diagnosemedium — gelöste Gase, Feuchte, Qualität | Keine Flüssigkeitsdiagnose; angewiesen auf Temperatur, Teilentladung und Inspektion |
| **Verfügbarer Schutz** | Gas-, Druck- und Flüssigkeitstemperaturgeräte, je nach Bauform | Wicklungstemperaturerfassung ist der primäre innere Schutz |
| **Routineinstandhaltung** | Probenahme und Flüssigkeitsqualität, Trockner wo vorhanden, Dichtungszustand | Reinigung, Belüftung, Kontrolle auf Oberflächenverschmutzung und Kriechspuren |

**Die entscheidende Asymmetrie ist die Überwachung.** Ein flüssigkeitsgefüllter Transformator führt sein eigenes Diagnosemedium mit sich: Anbahnende Fehler hinterlassen lange vor dem Ausfall Spuren in der Flüssigkeit. Ein Trockentransformator bietet nichts Gleichwertiges, was bedeutet, dass seine Temperaturüberwachung keine Bequemlichkeit, sondern das wesentliche Mittel ist, seinen Zustand zu kennen. **Einen Trockentransformator zu spezifizieren und dann sein Wicklungstemperaturgerät unkonfiguriert zu lassen, entfernt praktisch seine gesamte Zustandsinformation.**

**IEC 60076-11 definiert für Trockentransformatoren Klassifizierungsklassen für Umgebungsbedingungen, Klimabedingungen und Brandverhalten.** Das sind Spezifikationsgrößen, die für die Aufstellung gewählt werden, keine automatisch mitgelieferten Vorgaben — ein Trockentransformator für eine feuchte oder schmutzige Industrieumgebung muss dafür spezifiziert sein.

## Gestaffelter Schutz und was die Bauform zulässt

Transformatorschutz ist ein Satz einander überlappender Funktionen, von denen jede abdeckt, was die anderen nicht sehen.

**Überstrom- und Kurzschlussschutz** auf der Oberspannungsseite, oberhalb des zulässigen transienten Verhaltens des Transformators und unterhalb seiner Standfestigkeit eingestellt. **Die Komplikation ist der Einschaltstromstoß**: Das Zuschalten eines Transformators erzeugt einen hohen, versetzten, abklingenden Strom, dessen Höhe vom Punkt auf der Spannungskurve beim Schließen und vom Restfluss im Kern abhängt. Dieser Strom ist kein Fehler, und ein Schutz, der darauf auslöst, löst bei jedem Zuschalten aus. Unterschieden wird er vom Fehler durch sein charakteristisches Abklingen und durch seinen Oberschwingungsgehalt — der Einschaltstromstoß ist reich an zweiter Harmonischer, und die Stabilisierung über die zweite Harmonische ist das übliche Mittel, mit dem Differentialrelais eine Auslösung darauf vermeiden.

**Differentialschutz** vergleicht bei größeren Einheiten den ein- und den austretenden Strom und spricht auf die Differenz an. Zwei Konfigurationsanforderungen sind die klassische Ursache für Fehlauslösung: Die Phasenverschiebung der Schaltgruppe muss kompensiert werden, und **der Nullsystemstrom muss aus der sternseitigen Messung entfernt werden**, weil ein äußerer Erdschluss sonst sternseitig Nullsystemstrom erzeugt, dem dreieckseitig nichts entspricht — was das Relais als Differenz liest. Ein Differentialschutz, der bei äußeren Erdschlüssen auslöst, hat fast immer eine dieser beiden Anforderungen verfehlt.

**Der Erdschlussdifferentialschutz (REF)** deckt die Sternwicklung mit hoher Empfindlichkeit ab, einschließlich Fehlern nahe dem Sternpunkt, für die ein Differentialschutz naturgemäß unempfindlich ist, weil der Fehler an den Klemmen wenig Strom erzeugt.

**Der thermische Schutz** ist die Stufe, die über die Lebensdauer entscheidet, nicht über das Überleben. Bei flüssigkeitsgefüllten Geräten ist das typischerweise eine Messung der oberen Flüssigkeitstemperatur zusammen mit einem Wicklungstemperaturabbild; bei Trockentransformatoren sind es in die Wicklungen eingebettete Temperatursensoren. In beiden Fällen sind Melde- und Auslösestufe Auslegungsentscheidungen, und beide müssen konfiguriert, geprüft und im Verlauf aufgezeichnet werden. **Ein eingebautes Temperaturgerät, dessen Kontakte nicht verdrahtet, nicht konfiguriert oder nicht aufgezeichnet werden, ist kein Schutz.**

**Gas- und Druckschutz — und seine Anwendbarkeit.** Hier behaupten Spezifikationen am häufigsten etwas, das nicht lieferbar ist.

- **Ein Buchholzrelais sitzt in der Rohrleitung zwischen Kessel und Ausdehnungsgefäß.** Es existiert daher nur an **flüssigkeitsgefüllten Transformatoren mit Ausdehnungsgefäß**. Es hat zwei verschiedene Funktionen: eine Gassammelfunktion, die auf langsam entstehendes Gas aus einem anbahnenden Fehler anspricht und üblicherweise zur Meldung genutzt wird, und eine Strömungsfunktion, die auf die rasche Flüssigkeitsbewegung bei einem schweren inneren Fehler anspricht und üblicherweise zur Auslösung genutzt wird.
- **Ein hermetisch geschlossener flüssigkeitsgefüllter Transformator hat kein Ausdehnungsgefäß und kann daher kein Buchholzrelais tragen.** Geschlossene Geräte werden stattdessen mit Einrichtungen geschützt, die für diese Bauform bestimmt sind — Druckentlastungseinrichtungen, Erkennung von plötzlichem Druckanstieg oder Gasdruck sowie kombinierte Geräte, die Gasansammlung, Kesseldruck und Flüssigkeitstemperatur gemeinsam erfassen.
- **Ein Trockentransformator hat keine Isolierflüssigkeit und daher keinerlei Gassammelschutz.** Sein innerer Schutz ist thermisch, gestützt auf Inspektion und, wo gerechtfertigt, Teilentladungsmessung.

**Die daraus folgende Regel ist einfach und wird häufig verletzt: Gasschutz nicht pauschal spezifizieren.** Erst die Bauform festlegen, dann die Geräte spezifizieren, die diese Bauform tragen kann. Eine Spezifikation, die Buchholzschutz für ein geschlossenes oder trockenes Gerät fordert, wird entweder bei der Bestellung zurückgewiesen — das gute Ergebnis — oder stillschweigend mit etwas anderem erfüllt, während die Schutzübersicht der Anlage weiterhin eine Funktion aufführt, die es nicht gibt.

**Ein weiterer Punkt zum Gas, der routinemäßig vergeudet wird: angesammeltes Gas ist ein Beweismittel.** Von einer Gassammeleinrichtung aufgefangenes Gas kann beprobt und analysiert werden und zeigt an, welche Art Fehler es erzeugt hat. Die Einrichtung zurückzusetzen und den Transformator ohne Probenahme wieder in Betrieb zu nehmen, verwirft die direkteste Diagnoseinformation, die dieses Ereignis je bieten wird.

**Sternpunkterdung und ihr eigener Schutz.** Wird der Sternpunkt über eine Impedanz geerdet, begrenzt diese den Erdschlussstrom — was meist die Absicht ist — und wird damit zu einem Bauteil, dessen Unversehrtheit zählt. **Ein Sternpunktwiderstand, der offen ausgefallen ist, ist im Normalbetrieb unsichtbar und macht das System im Augenblick des ersten Fehlers zu einem ungeerdeten**, seine Durchgängigkeit verdient daher Überwachung statt Annahme.

**Überspannungsschutz** an den Transformatorklemmen, wo die Exposition es rechtfertigt, abgestimmt auf die übrigen Überspannungsschutzmaßnahmen der Anlage.

## Zustandsüberwachung: was die jeweilige Bauform erlaubt

**Bei flüssigkeitsgefüllten Transformatoren ist die Analyse gelöster Gase die aussagekräftigste Routinediagnose, die es an einem elektrischen Betriebsmittel überhaupt gibt.** Verschiedene innere Fehlermechanismen — thermische Fehler unterschiedlicher Schwere, Teilentladung, Lichtbogen — erzeugen charakteristisch unterschiedliche Gemische gelöster Gase, und Auswertungsrahmen wie IEC 60599 setzen das beobachtete Gemisch zu einem wahrscheinlichen Mechanismus in Beziehung.

Drei praktische Punkte entscheiden, ob sich das lohnt:

- **Der Verlauf schlägt die Momentaufnahme.** Eine einzelne Probe ohne Vorgeschichte trägt schwache Schlüsse. Eine gleichmäßig entnommene Reihe trägt starke, weil die Änderungsrate diagnostischer ist als der Absolutwert.
- **Die Probenahmetechnik bestimmt die Ergebnisqualität.** Verunreinigung, Lufteintrag und wechselnde Entnahmestellen liefern Ergebnisse, die die Probenahme beschreiben und nicht den Transformator.
- **Das Stufenschalterabteil wird anders ausgewertet.** Ein Lastumschalter schaltet im Normalbetrieb mit Lichtbogen, Gas in seinem getrennten Abteil ist also zu erwarten und darf nicht an den Erwartungen des Hauptkessels gemessen werden. Beides zu verwechseln erzeugt entweder Fehlalarm oder falsche Beruhigung.

**Weitere Flüssigkeitsdiagnosen** betreffen das Isoliersystem statt aktiver Fehler: Feuchtegehalt, Durchschlagfestigkeit und Säurezahl beschreiben den Zustand der Flüssigkeit und mittelbar die Alterung der Festisolierung, und die Furananalyse dient als Indikator für den Papierabbau.

**Bei Trockentransformatoren ist das Bild schmaler und die Disziplin daher strenger.** Die Aufzeichnung der Wicklungstemperatur ist der wesentliche Indikator und nur dann nützlich, wenn sie aufgezeichnet und nicht bloß gemeldet wird. Teilentladungsmessung adressiert den Isolationszustand, wo die Anwendung es rechtfertigt. Die Sichtprüfung zählt mehr als bei einem gekapselten Gerät, weil Verschmutzung, Feuchte und Kriechspurbildung die bestimmenden Alterungsmechanismen sind — und weil man sie sieht.

**Für beide Bauformen** sind die Verbindungen an Durchführungen und Klemmen ein von dem Transformator selbst getrenntes Thema: Eine sich verschlechternde Verbindungsstelle erzeugt Wärme an der Verbindung, nicht in der Wicklung, und sie wird durch Prüfung dieser Verbindung gefunden, nicht durch irgendein Gerät, das den inneren Zustand des Transformators misst.

## Aufstellung, Umgebung und die langsamen Ausfälle

**Kühlung ist ein System, kein Bauteil.** Bei einem Trockentransformator heißt das Raumlüftung, ungehinderte Luftströmung, saubere Ansaugöffnungen und eine Umgebungstemperatur, die die Spezifikation tatsächlich unterstellt hat. Bei einem flüssigkeitsgefüllten Gerät heißt es Radiatorflächen, Lüfterbetrieb wo vorhanden und Freiraum. **Die Kühlung wird durch alltägliche Ordnungsentscheidungen verschlechtert** — ein Lager, das an das Transformatorgehäuse gebaut wurde, eine zugestellte Lüftungsöffnung, ein Raum, dessen Abluftventilator vor Monaten ausfiel — und keines davon erscheint in einer elektrotechnischen Dokumentation.

**Flüssigkeitsauffang und Brandabtrennung** gehören bei flüssigkeitsgefüllten Geräten zur Aufstellungsplanung, und die Anforderungen hängen von der Flüssigkeit, dem Ort und den geltenden Regeln ab.

**Laständerungen.** Anlagen wachsen. Antriebe kommen hinzu, Prozesse werden erweitert, und der für die ursprüngliche Last gewählte Transformator soll etwas anderes mit anderer Höhe und anderer Kurvenform speisen. **Die Eignung des Transformators ist deshalb kein dauerhafter Befund**, und ein Betrieb, der erhebliche Stromrichterlast hinzufügt, ohne den Transformator erneut zu betrachten, hat eine Entscheidung getroffen, ohne es zu merken.

## Fehlermodi

**Eins zu eins nur nach kVA ersetzt.** Andere Kurzschlussspannung, also anderes nachgelagertes Fehlerniveau und andere Spannungshaltung.

**Kurzschlussspannung vom Lieferanten gewählt.** Das Fehlerniveau, dem die Schaltanlage standhalten muss, wurde per Voreinstellung festgelegt.

**Trockentransformator in einem Raum aufgestellt, der für das thermische Verhalten des ersetzten Öltransformators ausgelegt war.** Läuft vom ersten Tag an heiß.

**Umgebungstemperatur und Lüftung nicht gegen die Bemessungsbedingungen geprüft.** Ein konformer Transformator in einem nicht konformen Raum.

**Oberschwingungslast in der Anfrage nicht genannt.** Zusätzliche Verluste, für die nie spezifiziert wurde.

**Anzapfungen nie eingestellt oder nie dokumentiert.** Falsche Spannung in der ganzen Anlage und kein Nachweis der gewählten Stellung.

**Buchholzschutz für einen geschlossenen oder trockenen Transformator gefordert.** Entweder eine zurückgewiesene Bestellung oder eine Schutzübersicht mit einer Funktion, die es nicht gibt.

**Gassammeleinrichtung ohne Gasprobe zurückgesetzt.** Das beste verfügbare Beweismittel verworfen.

**Differentialschutz ohne Schaltgruppenkompensation oder Nullsystemunterdrückung.** Löst bei äußeren Erdschlüssen aus.

**Schutz unterhalb des Einschaltstromstoßes eingestellt.** Löst beim Zuschalten aus und wird dann so weit unempfindlich gemacht, bis er nicht mehr schützt.

**Wicklungstemperaturgerät eingebaut, aber nicht verdrahtet, konfiguriert oder aufgezeichnet.** Kein thermischer Schutz — und bei einem Trockentransformator überhaupt keine Zustandsinformation.

**Sternpunktimpedanz nicht überwacht.** Ein offen ausgefallener Widerstand, entdeckt durch den ersten Erdschluss.

**Transformatoren mit abweichender Kurzschlussspannung parallel betrieben.** Ungleiche Lastaufteilung; ein Gerät erreicht seine thermische Grenze, das andere bleibt ungenutzt.

**Gasanalyse einmal durchgeführt, Jahre auseinander, mit uneinheitlicher Probenahme.** Eine Zahl ohne Verlauf und ein Verlauf ohne Gültigkeit.

**Gas des Stufenschalterabteils an den Erwartungen des Hauptkessels gemessen.** Fehlalarm oder falsche Beruhigung.

**Anlagenlast seit der Auswahl erheblich gewachsen, Transformator nie neu bewertet.** Eine Spezifikation, die eine Anlage beschreibt, die es nicht mehr gibt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Trockentransformator, der einen Produktionsbereich speist, fällt nach wenigen Betriebsjahren aus — weit vor jeder vernünftigen Erwartung. Er ersetzte ein flüssigkeitsgefülltes Gerät gleicher Bemessungsleistung, wurde im selben Stationsraum aufgestellt, und der Austausch wurde damit begründet, dass die Bemessungswerte übereinstimmten. Nach dem Ausfall fragt die Instandhaltungsauswertung, warum das Gasrelais nicht gewarnt habe.

```text
Symptom:
Premature failure of a dry-type transformer, no prior alarm, replaced a
liquid-immersed unit of identical nameplate rating in the same room.

Evidence:
- there is no gas relay: the unit is dry-type and contains no insulating
  liquid, so no gas-accumulation protection can exist on it
- the winding temperature sensors are installed and terminated, but their
  outputs were never wired into the control system and no temperature has
  ever been recorded
- the room's mechanical ventilation was specified for the previous unit and
  one extract fan has been out of service for an extended period
- pallets and stores have been placed against the transformer enclosure,
  restricting the airflow path
- the room ambient measured during production is well above the reference
  ambient assumed by the transformer specification
- several converter-fed drives were added to the area after the transformer
  was ordered; the harmonic spectrum was not stated in the enquiry
- the failure signature is consistent with prolonged thermal ageing rather
  than an electrical fault event

Reasoning:
Three compounding causes, none of which is a defect in the transformer. The
replacement was justified on nameplate power alone, but a dry-type unit has
far less thermal mass than the liquid-immersed unit it replaced and relies
entirely on air to remove heat — so identical ratings did not mean identical
behaviour in that room. The room then delivered less cooling than the
specification assumed, through degraded ventilation, obstruction and elevated
ambient. And the load acquired harmonic content that was never declared, which
adds loss beyond the sinusoidal assumption. Any one of these would have been
survivable; together they produced continuous operation above the thermal
design point. The absence of warning is not a protection failure in the
conventional sense: the only device capable of giving that warning was the
winding temperature sensing, and it was never connected. The expectation of a
gas relay reveals the underlying error — the protection philosophy was carried
over from the previous unit along with the rating.

Next investigations:
- record the actual room ambient and airflow across a full production cycle
- measure the harmonic spectrum at the transformer secondary under
  representative load
- reconstruct the loading profile, including the added converter load
- restore the ventilation and remove the obstructions before any replacement
  is energised
- specify the replacement against the measured ambient, the measured harmonic
  content and the actual loading profile, and wire, configure and trend its
  winding temperature devices before it is put into service
```

**Die übertragbare Lehre hat zwei Teile.** Eine Bemessungsleistung ist eine thermische Aussage unter Bedingungen, und dieselbe Zahl über zwei verschiedene Bauformen hinweg gleichzusetzen, gleicht fast nichts an. Und welchen Schutz ein Transformator tragen kann, entscheidet sein Aufbau — ein Trockentransformator wird nie Gasschutz haben, weshalb seine Temperaturüberwachung seine gesamte Frühwarnung ist; sie unangeschlossen zu lassen, ist kein vergessener Anschluss, sondern die Beseitigung des einzigen Zustandsindikators des Geräts.

## Empfohlene Praxis

- Die Bemessung als bedingt behandeln: Umgebungstemperatur, Gehäuse, Aufstellungshöhe, zyklischen Betrieb und Oberschwingungsgehalt in der Anfrage angeben und gegen den Aufstellungsort erneut prüfen.
- Die Kurzschlussspannung bewusst gegen die Bemessung der nachgelagerten Schaltanlage und das Motoranlaufverhalten wählen, statt eine Vorgabe zu übernehmen.
- Schaltgruppe und Sternpunkterdung als Systementscheidungen festlegen, denn sie bestimmen, was der Erdschlussschutz erkennen kann.
- Wo Geräte parallel betrieben werden sollen, Phasenverschiebung, Übersetzungsverhältnis und Kurzschlussspannungsverträglichkeit prüfen und das resultierende Fehlerniveau bewerten.
- Zwischen flüssigkeitsgefüllt und trocken nach Brandrisiko, Ort, Umgebung und Überwachungsbedarf entscheiden — nicht nach Preis allein und nie mit der Annahme, gleiche kVA bedeuteten Gleichwertigkeit.
- Umgebungs-, Klima- und Brandverhaltensklasse eines Trockentransformators für die tatsächlichen Aufstellungsbedingungen spezifizieren.
- Vor der Spezifikation von Gasschutz die Bauform klären: Geräte mit Ausdehnungsgefäß können ein Buchholzrelais tragen, geschlossene Geräte nutzen Druck- und kombinierte Gas-Druck-Temperatur-Einrichtungen, Trockentransformatoren haben überhaupt keinen Gasschutz.
- Wo eine Gassammeleinrichtung angesprochen hat, das Gas vor dem Zurücksetzen beproben und analysieren.
- Den Überstromschutz oberhalb des Einschaltstromstoßes einstellen und in Differentialschutzsystemen auf die Stabilisierung über die zweite Harmonische setzen statt auf Unempfindlichkeit.
- Schaltgruppenkompensation und Nullsystemunterdrückung in jedem Differentialschutz prüfen und gegen einen äußeren Erdschlusszustand testen.
- Erdschlussdifferentialschutz für die Sternwicklung vorsehen, wo Empfindlichkeit nahe dem Sternpunkt zählt.
- Wicklungstemperaturgeräte verdrahten, konfigurieren, prüfen und aufzeichnen — bei einem Trockentransformator sind sie die einzige verfügbare Zustandsinformation.
- Die Unversehrtheit einer Sternpunktimpedanz überwachen statt sie anzunehmen.
- Ein Programm zur Analyse gelöster Gase mit einheitlicher Probenahme und Verlaufsbetrachtung einrichten und das Stufenschalterabteil getrennt vom Hauptkessel auswerten.
- Die Kühlung als gewartetes System behandeln: Lüftung, saubere Ansaugöffnungen, freier Abstand und eine geprüfte Raumtemperatur.
- Den Transformator neu bewerten, sobald die Anlagenlast wächst oder erheblichen Stromrichteranteil bekommt, denn die Spezifikation beschrieb die Anlage, wie sie war.

## Fazit

Transformatoren fallen langsam und aus unspektakulären Gründen aus. Nur sehr wenige der Ausfälle im Industriebetrieb haben ihren Ursprung in der elektrischen Auslegung des Transformators; die meisten haben ihren Ursprung in einer Spezifikation, die Bedingungen beschrieb, die die Aufstellung nicht bereitstellte, in einem aus Gewohnheit statt aus der vorliegenden Bauform zusammengestellten Schutzkonzept, oder in Zustandsinformation, die verfügbar war und nie erhoben wurde.

Spezifizieren Sie gegen gemessene statt angenommene Bedingungen. Entscheiden Sie die Kurzschlussspannung, statt sie zu erben. Klären Sie, was die Bauform physisch tragen kann, bevor Sie die Schutzübersicht schreiben. Und schließen Sie die vorhandenen Geräte an und zeichnen Sie sie auf — an vielen Einheiten ist der Unterschied zwischen einem geplanten Austausch und einem ungeplanten Ausfall ein Temperatursignal, das eingebaut, aufgelegt und kein einziges Mal angesehen wurde.
