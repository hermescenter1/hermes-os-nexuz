# Motor Control Center für die Schwerindustrie auslegen

## Zusammenfassung

Ein MCC wird meist als Produkt beschafft und sollte als Systemschnittstelle ausgelegt werden. Nahezu jeder relevante Parameter wird außerhalb des Feldes bestimmt: Der Kurzschlussstrom kommt vom vorgelagerten Transformator und Netz, die Standzeit von der vorgelagerten Schutzeinrichtung, der Dauerstrom vom Prozess — und die wirksamen Bemessungswerte der Geräte von der Temperatur des Raums, in dem die Anlage steht.

Deshalb treten MCC-Probleme oft Jahre nach der Inbetriebnahme auf, ohne dass sich im Inneren etwas geändert hätte. Die Anlage blieb gleich; das System um sie herum nicht.

**Sicherheitshinweis.** Dieser Beitrag behandelt Entwurf und Inbetriebnahme. Arbeiten an oder in der Nähe spannungsführender Anlagen sind Sache qualifizierter Personen nach den Sicherheitsregeln des Standorts; nichts hier ist als Anleitung zum Arbeiten unter Spannung zu verstehen.

## Aufbau und die daraus folgenden Bemessungswerte

Die Struktur ist einfach — Einspeisung, Sammelschiene, Abgänge — und jedes Teil trägt einen Bemessungswert, der gegen die Installation begründet und nicht aus einem Katalog gewählt werden muss.

```text
      Upstream transformer / supply
                 |
        Incomer  |  protection, metering, isolation
                 |
   ==============|==============   main busbar
     |      |      |      |     |
    unit   unit   unit   unit  unit     withdrawable or fixed
     |      |      |      |     |
   motor  motor  feeder  VFD  heater
```

**Einspeisung.** Bemessen für den heutigen Höchstbedarf mit begründeter Reserve und so geschützt, dass ihre Abschaltzeit zu allem Nachgelagerten passt. Wo zwei Einspeisungen und eine Kupplung existieren, ist das Verriegelungskonzept Teil des Entwurfs: eine Anordnung, die das Parallelschalten zweier Quellen zulässt, obwohl das System nie dafür ausgelegt wurde, ist ein Fehler, der auf einen Schalthandlungsirrtum wartet.

**Sammelschiene.** Zwei verschiedene Kurzschlussbemessungswerte gelten und werden häufig vermengt:

| Bemessungswert | Was er darstellt | Wogegen er geprüft werden muss |
| --- | --- | --- |
| Kurzzeitstromfestigkeit | Der Effektivstrom, den die Schiene für eine genannte Dauer ohne unzulässigen Schaden führt | Der zu erwartende Kurzschlussstrom an den MCC-Klemmen **und** die Abschaltzeit des vorgelagerten Schutzes |
| Stoßstromfestigkeit | Der Momentanwert, den die Konstruktion mechanisch übersteht | Der zugehörige Stoßwert, abhängig vom X/R-Verhältnis des Kreises |

**Der übersehene Punkt: Eine Festigkeitsangabe ohne ihre Dauer ist bedeutungslos.** Eine für einen bestimmten Strom über eine Sekunde bemessene Anlage genügt in einem Netz nicht, in dem der vorgelagerte Schutz länger zum Abschalten braucht. Beide Hälften der Aussage gehören gemeinsam verifiziert, und beide sind Eigenschaften des Netzes und nicht des Schranks.

**Dauerstrom und Temperatur.** Der Strombemessungswert der Sammelschiene gilt für eine Bezugsumgebungstemperatur. In der Station eines Stahlwerks oder im Elektroraum eines Bergwerks, wo die Umgebungstemperatur deutlich darüber liegt, ist der nutzbare Wert kleiner — und ebenso die Werte aller darin verbauten Geräte. Derating ist keine Feinheit; es ist der Unterschied zwischen einem Entwurf, der trägt, und einem, der schnell altert und unvorhersehbar auslöst.

## Innere Unterteilung und die Verfügbarkeitsentscheidung

Die Anlagennorm definiert Formen der inneren Unterteilung — Grade, in denen Sammelschienen, Funktionseinheiten und Anschlussräume durch Barrieren getrennt sind. Höhere Formen kosten mehr und erkaufen zweierlei: die Möglichkeit, an einer Einheit zu arbeiten, während benachbarte Teile unter Spannung bleiben, und die Eingrenzung, falls in einem Abteil etwas versagt.

**Die Frage lautet nicht „welche Form ist die beste“, sondern „was beabsichtigen wir zu tun, während das MCC unter Spannung steht?“**

- Wird jede Instandhaltung mit freigeschaltetem Abschnitt ausgeführt, kann eine niedrigere Form völlig angemessen sein, und das Geld ist anderswo besser aufgehoben.
- Verträgt der Prozess das Freischalten eines ganzen Abschnitts für den Tausch eines Abzweigs nicht, kauft die höhere Form Verfügbarkeit — und das ist eine Prozessentscheidung, keine elektrotechnische Vorliebe.

**Einschubtechnik gegenüber Festeinbau folgt derselben Logik.** Einschübe erlauben, eine Funktionseinheit ohne Freischalten der Sammelschiene zu entnehmen und zu ersetzen, was sowohl Stillstandszeit als auch die Zeit verringert, die jemand im Inneren einer Anlage verbringt. Festeinbauten sind günstiger und mechanisch einfacher und erfordern für die meisten Arbeiten das Freischalten des Abschnitts.

Zwei praktische Punkte entscheiden, ob Einschubtechnik ihr Versprechen einlöst:

- **Austauschbarkeit muss real sein.** Ein Ersatz-Einschub, der vor dem Einsetzen umkonfiguriert, umverdrahtet oder neu parametriert werden muss, hat den Verfügbarkeitsvorteil weitgehend eingebüßt. Die Vereinheitlichung der Einschubtypen über die Anlage hinweg macht eine Ersatzteilstrategie erst wirksam.
- **Disziplin und Verriegelung beim Einfahren.** Der Mechanismus muss das Ein- und Ausfahren unter Last verhindern und den Zugriff auf spannungsführende Teile sperren — und diese Verriegelungen sind eine Inbetriebnahmeprüfung, keine Annahme.

## Abgänge, Abzweige und Koordination

Jeder Abgang ist ein kleines Schutzkonzept: ein Kurzschlussschutzorgan, ein Schaltgerät und eine Überlastschutzfunktion.

**Die Koordinationsart ist eine ausdrückliche Wahl mit Folgen nach einem Fehler.** Die Gerätenormen unterscheiden auf Konzeptebene:

- **Koordinationsart 1** — nach einem Kurzschluss darf der Abzweig beschädigt sein; verlangt ist, dass der Fehler sicher eingegrenzt wird. Die Einheit wird vor der Wiederinbetriebnahme instand gesetzt oder ersetzt.
- **Koordinationsart 2** — nach einem Kurzschluss muss der Abzweig weiter betriebstauglich bleiben, wobei nur begrenztes Verschweißen der Kontakte zulässig ist.

Die Wahl ist nicht ästhetisch. **Art 2 kostet mehr und erkauft Wiederanlaufzeit**, was zählt, wo der Ausfall eines Abgangs die Produktion stoppt und die Ersatzteilstrategie das nicht abdeckt. Art 1 ist völlig vertretbar, wo eine Einheit schnell getauscht werden kann. Nicht vertretbar ist, erst nach einem Fehler herauszufinden, welche Art spezifiziert war.

**Die Selektivität zum vorgelagerten Gerät** entscheidet, ob ein Fehler in einem Abgang einen Motor oder das ganze MCC außer Betrieb nimmt. Sie gehört gegen die tatsächlichen Geräte und Einstellungen verifiziert und nicht aus Gerätegrößen angenommen.

**Die Abzweigtechnik** — Direktanlauf, Stern-Dreieck, Sanftanlauf, Umrichter — folgt aus Last und Netz, und jede stellt andere Anforderungen an das MCC: Bauraum, Verlustleistung, Kabeltyp und -länge sowie Steuerschnittstellen.

> Die Umrichterauswahl selbst sowie die harmonischen und EMV-Folgen von Umrichtern in einer MCC-Anlage behandeln die Begleitbeiträge zur VFD-Auswahl und zu Oberschwingungen, EMV und Motorleitungen.

## Steuerspannung und Verhalten nach Spannungswiederkehr

Die Steuerspannungsversorgung ist ein kleiner Teil der Stückliste und ein großer Teil des Anlagenverhaltens.

**Was ausdrücklich entschieden gehört:**

- **Quelle und Schutz.** Eine eigene, abgesicherte Versorgung, bei der der Ausfall eines Steuerkreises die anderen nicht mitnimmt.
- **Was beim Verlust der Steuerspannung geschieht.** Schütze fallen ab, die Anlage steht. Das ist meist richtig und sollte gewollt sein.
- **Was bei ihrer Rückkehr geschieht.** Das ist der sicherheitsrelevante Punkt. **Motoren dürfen nach Spannungswiederkehr nicht selbsttätig anlaufen, sofern der Prozess nicht ausdrücklich dafür ausgelegt und bewertet wurde.** Der unerwartete Anlauf drehender Maschinen ist ein klassischer Schädigungsmechanismus, besonders wenn Instandhaltungspersonal in der Nähe von Anlagenteilen ist, die aus ihnen unbekannten Gründen stehen. Die Unterspannungs- oder Wiederanlaufsperre, die das verhindert, ist eine Entwurfsanforderung und keine Option, und ihr Verhalten gehört bei der Inbetriebnahme verifiziert.
- **Vor-Ort-Bedienung und Sperrung.** Vor-Ort-Stationen müssen die Steuerung übernehmen und einen Fernstart verhindern können. Ein Vor-Ort/Fern-Wahlschalter, der dem Leitsystem lediglich eine Information gibt, ist keine Trennmaßnahme und darf nicht als solche gelten.
- **Not-Halt-Architektur.** Kategorie, Verdrahtung und Rücksetzverhalten gehören zum Maschinensicherheitskonzept und müssen über die Anlage hinweg einheitlich sein.

## Kommunizierende Abzweige: Information ohne Abhängigkeit

Moderne Abzweige und Schutzgeräte kommunizieren, und der Nutzen ist real: weniger Steuerverdrahtung, Fernauslesen von thermischem Abbild und Auslöseursache, Betriebsstunden, Anlaufzähler und Stromprofile als Grundlage für Zustandsüberwachung.

**Die Entwurfsregel, die daraus einen Vorteil statt einer Last macht: Das MCC muss ohne das Kommunikationsnetz korrekt arbeiten.** Schutz, Auslösung und Vor-Ort-Bedienung sind fest verdrahtete Funktionen; das Netz trägt Information und unkritische Befehle. Eine Architektur, in der ein Motor nicht startet, weil ein Netz ausgefallen ist, hat ein Informationssystem in eine Produktionsabhängigkeit verwandelt.

Zwei weitere Punkte:

- **Auslöseursache und thermisches Abbild sind echte Diagnosedaten** — sie trennen Überlast von Kurzschluss und Erdschluss, ohne dass jemand ein Abteil öffnet, und machen aus „es hat wieder ausgelöst“ einen Beleg.
- **Der Kommunikationsweg ist ein OT-Netz mit denselben Anforderungen wie jedes andere**, einschließlich Segmentierung und Zugriffskontrolle. Ein von überall erreichbares MCC-Netz ist eine unnötige Exposition.

## Thermischer Entwurf und Umgebung

Wärme ist der am häufigsten unterschätzte Parameter und derjenige, der die verwirrendsten Symptome erzeugt.

**Alles im Inneren verlustet.** Sammelschienen, Schalter, Schütze, Umrichter, Steuertransformatoren und — in modernen Anlagen erheblich — Frequenzumrichter, die einen spürbaren Anteil ihrer Leistung in Wärme umsetzen. Das Gehäuse muss diese Wärme bei der ungünstigsten Umgebungstemperatur abführen, nicht bei der mittleren.

**Die Umgebungstemperatur ist eine Standorteigenschaft und ändert sich.** Ein Raum, dessen Lüftung für den ursprünglichen Bestand ausgelegt war und dem später Geräte hinzugefügt wurden, oder ein degradiertes Kühlgerät hebt die Innentemperatur jedes Geräts. Die Folgen zeigen sich als:

- Überlastrelais, die früher ansprechen als erwartet, weil ihre Kennlinie temperaturbeeinflusst ist.
- Verkürzte Lebensdauer von Schützen, Elektronik und Isolierstoffen, die Jahre später als unerklärte Häufung von Ausfällen erscheint.
- Auslösungen ohne Anlass, gehäuft nach Tageszeit oder Jahreszeit statt nach Maschine.

**Die Umgebung jenseits der Temperatur** prägt die Spezifikation: leitfähiger Staub im Bergbau, korrosive Atmosphären in der Petrochemie, Feuchte und Kondensation in unbeheizten Gebäuden, Vibration in Fördertechnikbauten. Schutzarten, Filter, Innenheizung gegen Kondensation und Dichtungspflege gehören zum Entwurf — und alle degradieren, wenn sie niemandem gehören.

## Störlichtbogenrisiko, auf der hier sinnvollen Ebene

Die Gefährdung durch einen inneren Störlichtbogen ist ernst, und ihre Minderung ist eine Spezialaufgabe. Auf der Ebene der MCC-Entwurfsentscheidungen zählen drei Grundsätze, und keiner davon beinhaltet Arbeiten unter Spannung:

- **Exposition verringern.** Einschubtechnik, Fernbedienung des Einfahrens, wo verfügbar, und ein Entwurf, der die meisten Instandhaltungsarbeiten am freigeschalteten Abschnitt erlaubt, verkürzen die Zeit vor einer spannungsführenden Anlage.
- **Abschaltzeit verkürzen.** Die freigesetzte Energie hängt davon ab, wie lange der Fehler besteht. Schutzeinstellungen und, wo eingesetzt, Störlichtbogenerkennung verringern die Folgen.
- **Für Eingrenzung auslegen.** Anlagen können hinsichtlich ihres Verhaltens bei einem inneren Störlichtbogen klassifiziert werden; wo diese Klassifizierung verlangt ist, ist sie eine Beschaffungsvorgabe und nichts, was sich später ergänzen lässt.

Alles Weitere gehört zu den Elektrosicherheitsregeln des Standorts, seinen Gefährdungsbeurteilungen und seinem qualifizierten Personal.

## Inbetriebnahme

Bei der Inbetriebnahme wird aus einem dokumentierten Entwurf eine verifizierte Anlage, und die wichtigsten Prüfungen sind jene, die sich später nicht nachholen lassen.

- **Schutzeinstellungen gegen die Studie.** Jede Einstellung dokumentiert und mit der Selektivitätsstudie verglichen, die sie begründet. Eine erstellte und nie angewandte Studie ist ein Dokument, kein Schutzkonzept.
- **Prüfung der Schutzfunktionen durch Einspeisung**, um das Ansprechen gemäß Einstellung zu bestätigen, durch qualifiziertes Personal nach den Verfahren des Standorts.
- **Verriegelungsnachweis** — Tür-, Einfahr-, Einspeise-/Kupplungs- sowie Vor-Ort/Fern-Verriegelung. Jede durch den Versuch der unzulässigen Handlung unter sicheren Bedingungen nachgewiesen, nicht durch Lesen des Plans.
- **Wiederanlaufsperre verifiziert** durch Wegnahme und Wiederkehr der Steuerspannung bei sicherem Anlagenzustand.
- **Drehfeld und Drehrichtung** für jeden Antrieb bestätigt, wo praktikabel vor der mechanischen Kupplung.
- **Thermografie unter Last** nach ausreichender Laufzeit, um lose Verbindungen und Hotspots zu finden, solange sie auffindbar sind.
- **Bestandsdokumentation**: Übersichtsschaltplan, Abzweigliste, Protokoll der Schutzeinstellungen, Kabelliste und die Verriegelungsphilosophie in einer Form, die im Nachtdienst nutzbar ist.

## Fehlermodi

**Festigkeit ohne ihre Dauer geprüft.** Die Anlage ist nominell ausreichend und tatsächlich unterschützt.

**Kurzschlussstrom vorgelagert verändert.** Ein Transformatortausch oder eine Netzumschaltung hebt den zu erwartenden Kurzschlussstrom über den Anlagenwert; im MCC hat sich nichts geändert.

**Umgebungstemperatur über der Bezugstemperatur.** Jedes Gerät ist praktisch derated und nirgends auf dem Papier.

**Koordinationsart nicht spezifiziert.** Nach einem Fehler weiß niemand, ob der Abzweig wieder betriebstauglich ist.

**Selektivität aus Gerätegrößen angenommen.** Ein Abgangsfehler löst die Einspeisung aus und legt die ganze Anlage still.

**Selbsttätiger Wiederanlauf nach Spannungswiederkehr.** Drehende Maschinen laufen an, während Menschen daneben stehen.

**Vor-Ort/Fern-Wahlschalter, der nur informiert.** Als Trennmaßnahme behandelt; er ist keine.

**Steuerung über das Kommunikationsnetz.** Ein Netzfehler wird zur Unfähigkeit, Motoren zu starten.

**Nicht austauschbare Ersatz-Einschübe.** Einschubtechnik beschafft, Verfügbarkeitsvorteil nicht realisiert.

**Filter und Heizungen ungewartet.** Staub und Kondensation wirken langsam und werden als Bauteilqualität diagnostiziert.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Das Förderband-MCC eines Bergwerks erzeugt an mehreren Antrieben Überlastauslösungen. Die Auslösungen häufen sich nachmittags und betreffen an verschiedenen Tagen verschiedene Bänder. Die Instandhaltung tauscht zwei Überlastrelais und prüft die Motoren, die normalen Isolationswiderstand und keine mechanischen Auffälligkeiten zeigen.

Der Befund, der die Sache neu rahmt, entsteht aus drei Beobachtungen zusammen:

- Die Auslösungen betreffen **mehrere unverwandte Abgänge**, was auf etwas Gemeinsames deutet und nicht auf die Motoren.
- Die **gemessenen Motorströme im Auslösemoment liegen im normalen Betriebsband**, das bei der Inbetriebnahme dokumentiert wurde — die Relais lösen bei einer Last aus, die die Motoren immer getragen haben.
- Die Auslösungen **korrelieren mit der Tageszeit**, häufen sich in der heißesten Nachmittagsphase und fehlen nachts.

Einzeln ließe sich jede dieser Beobachtungen abtun. Zusammen benennen sie einen gemeinsamen Einfluss mit Tagesrhythmus — und in einem Elektroraum heißt das Temperatur.

Die Messung im Raum bestätigt es: Die Innentemperatur des MCC liegt deutlich über der, für die Anlage und Geräte spezifiziert wurden. Ein Lüftungsgerät ist ausgefallen, und vor achtzehn Monaten wurden zwei Frequenzumrichter ergänzt, ohne die Wärmelast neu zu berechnen. Die Überlastrelais sind nicht defekt; sie schützen nach einer Kennlinie, die von der Temperatur beeinflusst wird, in der sie sitzen — und die Motoren laufen mit einer Last, die der Auslöseschwelle nun näher liegt als früher.

Die Abhilfen sind gewöhnlich: Lüftung instand setzen und pflegen, die Wärmelast einschließlich der ergänzten Umrichter neu rechnen und die reduzierten Bemessungswerte von Anlage und Geräten gegen die tatsächliche ungünstigste Umgebungstemperatur verifizieren.

**Der übertragbare Punkt ist der, den die Belege unausweichlich machten: Im MCC hatte sich nichts geändert, und der Fehler lag in keinem der getauschten Bauteile. Der geänderte Parameter — die Raumtemperatur — war eine Entwurfsvorgabe, die beim Ergänzen von Geräten niemand nachgeprüft hat.**

## Empfohlene Praxis

- Kurzschlussfestigkeit als Paar verifizieren — Strom *und* Dauer — gegen den zu erwartenden Kurzschlussstrom und die vorgelagerte Abschaltzeit.
- Die Bemessungswerte der Anlage bei jeder vorgelagerten Änderung erneut verifizieren; der MCC-Wert ist mit dem Kauf fixiert, der Netzkurzschlussstrom nicht.
- Anlage und Geräte auf die tatsächliche ungünstigste Umgebungstemperatur derating, künftige Geräte eingeschlossen.
- Die Form der inneren Unterteilung aus dem ableiten, was die Instandhaltung unter Spannung tun will, und diese Absicht dokumentieren.
- Einschubtypen vereinheitlichen, damit Ersatzteile wirklich austauschbar sind — oder akzeptieren, dass der Verfügbarkeitsvorteil ausbleibt.
- Die Koordinationsart je Abgang ausdrücklich festlegen, ausgehend von Wiederanlaufzeit und Ersatzteilstrategie.
- Selektivität gegen reale Geräte und Einstellungen verifizieren, nicht gegen Gerätegrößen.
- Wiederanlaufsperre auslegen und verifizieren; nie einen unerwarteten Anlauf drehender Maschinen nach Spannungswiederkehr zulassen.
- Sicherstellen, dass die Vor-Ort-Bedienung einen Fernstart verhindern kann, und einen Wahlschalter nicht als Trennung behandeln.
- Schutz, Auslösung und Vor-Ort-Bedienung fest verdrahtet halten; Kommunikation nur für Information und unkritische Befehle nutzen.
- Das MCC-Kommunikationsnetz als OT-Netz behandeln, segmentiert und zugriffsgeregelt.
- Wärmelast, Lüftung und Filterpflege in Entwurf und Instandhaltungsplan aufnehmen, mit Verantwortlichem.
- Verriegelungen und Wiederanlaufsperre bei der Inbetriebnahme durch den Versuch der unzulässigen Handlung unter sicheren Bedingungen nachweisen.
- Einstellungen, Bestandspläne und Verriegelungsphilosophie in nachtdiensttauglicher Form dokumentieren.

## Fazit

Ein MCC ist der Punkt, an dem elektrisches System, Prozess und Instandhaltungsstrategie zusammentreffen, und seine folgenreichsten Parameter bestimmen alle drei — nicht die Anlage selbst. Kurzschlussstrom und Abschaltzeit kommen aus dem Netz. Dauerstrom und Derating kommen aus dem Raum. Unterteilungsform und Einschubtechnik kommen daraus, was die Anlage bei spannungsführender Sammelschiene tun will. Die Koordinationsart kommt daraus, wie schnell ein Abgang wieder verfügbar sein muss.

So ausgelegt ist ein MCC ein robustes, langlebiges Betriebsmittel, das vorhersehbar versagt und schnell instand gesetzt wird. Als Katalogposition gegen eine Lastliste beschafft, wird es am Tag der Einschaltung einwandfrei arbeiten — und allmählich unpassend zu einem System werden, das sich um es herum weiter verändert.
