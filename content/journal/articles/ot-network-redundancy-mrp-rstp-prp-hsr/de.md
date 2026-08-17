# OT-Netzredundanz: MRP, RSTP, PRP und HSR

## Zusammenfassung

Vier Redundanzmechanismen sind industriell gebräuchlich, und sie sind keine Varianten einer Idee. Zwei davon stellen sich *nach* einem Ausfall durch Rekonfiguration wieder her; zwei müssen sich nie wiederherstellen, weil nichts verloren ging. Dieser Unterschied ist kein Gradunterschied — er entscheidet, ob eine Anwendung überhaupt eine Kommunikationsunterbrechung sieht.

Die Auswahl ist deshalb kein Produktvergleich. Sie beginnt bei einer Zahl, die die Anlage bereits besitzt: **wie lange die Anwendung Kommunikation verlieren darf, bevor sie reagiert.** Alles Weitere — Topologie, Kosten, Geräteunterstützung, Inbetriebnahmeaufwand — liegt stromabwärts davon.

## Beim tolerierbaren Verlust beginnen

Die Redundanzanforderung lautet nicht „das Netz soll redundant sein“. Sie ist eine benannte Dauer, abgeleitet von den Verbrauchern des Verkehrs.

- **Ein Leitebenen-Client**, der Prozesswerte liest, kann eine merkliche Zeitspanne ohne Kommunikation auskommen und einfach veraltete Daten anzeigen. Seine Toleranz bestimmt das betriebliche Urteil.
- **Eine Steuerung, die mit dezentraler Peripherie spricht**, kann das nicht. Ihre Toleranz ist die konfigurierte Ansprechüberwachung — die Zahl versäumter Aktualisierungszyklen, nach der sie die Station als ausgefallen meldet und das Programm reagiert. Diese Zahl ist eine harte Grenze und oft deutlich kürzer als angenommen.
- **Schutz- und Verriegelungsfunktionen** tolerieren womöglich gar nichts; dann scheidet ein rekonfigurierendes Verfahren aus, gleichgültig wie schnell es ist.

**Der häufigste Redundanz-Entwurfsfehler folgt unmittelbar: Ist die Wiederherstellzeit des Netzes länger als die Ansprechüberwachung der Geräte, erzeugt jede Wiederherstellung eine Anlagenauslösung.** Der Ring heilt, die Stationen melden Ausfall, und das Programm führt seine Störlogik aus. Aus Sicht des Bedieners scheint die Redundanz die Ausfälle zu verursachen — was in einem engen Sinn zutrifft.

Der erste Engineering-Schritt lautet also: den tolerierbaren Verlust je Verkehrsklasse aufschreiben. Der Mechanismus wird anschließend passend dazu gewählt, mit Reserve.

## Rekonfigurierend gegenüber unterbrechungsfrei

| Eigenschaft | RSTP | MRP | PRP | HSR |
| --- | --- | --- | --- | --- |
| Prinzip | Blockiert redundante Wege, konvergiert neu | Ringmanager öffnet/schließt den Ring | Doppelte Telegramme über zwei unabhängige Netze | Doppelte Telegramme in beide Ringrichtungen |
| Verlust bei einem Einzelfehler | Ja, bis zur Konvergenz | Ja, bis zur Rekonfiguration | Keiner | Keiner |
| Charakter der Wiederherstellzeit | Topologieabhängig, nicht deterministisch | Begrenzt und je Implementierung spezifiziert | Entfällt — nichts wiederherzustellen | Entfällt |
| Topologie | Vermascht oder beliebig | Nur Ring | Zwei vollständige Parallelnetze | Ring |
| Geräteanforderung | Jeder Switch mit Unterstützung | Ringfähige Switches; ein Manager | Doppelt angebundene Knoten oder je Gerät eine RedBox | Jeder Knoten wirkt am Weiterleiten mit |
| Infrastrukturkosten | Am geringsten | Gering — eine zusätzliche Schließstrecke | Am höchsten — zwei vollständige Netze | Mittel — ein Ring, leistungsfähigere Knoten |
| Typische Eignung | Leitebene und IT-ähnlicher Verkehr | Zellen- und Anlagenringe | Nullverlust bei bestehender Sternverkabelung | Nullverlust in ringtauglicher Topologie |

**Die entscheidende Zeile ist „Verlust bei einem Einzelfehler“.** Alles darüber ist die Frage, wie schnell der Dienst zurückkehrt; alles darunter die Frage, ob er überhaupt unterbrochen war.

## RSTP im industriellen Kontext

Rapid Spanning Tree ist die universelle Option: standardisiert, auf praktisch jedem Managed Switch verfügbar und für beliebige Topologien geeignet. Es blockiert redundante Pfade gegen Schleifen und konvergiert bei Ausfall einer Strecke neu.

Seine Grenze in der OT ist nicht die Geschwindigkeit, sondern der **Determinismus**. Die Konvergenz hängt davon ab, wo der Fehler auftrat, wie die Topologie geformt ist und wie viele Switches zwischen Fehler und Wurzel liegen. Ein Entwurf kann keine einzelne garantierte Zahl nennen, wie es ein Ringprotokoll kann, und eine über die Jahre gewachsene Topologie wird langsamer, ohne dass jemand eine Einstellung ändert.

Wo es gut passt:

- Leitebene und DMZ, wo der Verkehr eine Pause verträgt.
- Vermaschte Topologien, die sich nicht als Ring abbilden lassen.
- Multi-Hersteller-Umgebungen, in denen Interoperabilität schwerer wiegt als Determinismus.

Wo es schlecht passt: jedes Segment mit zyklischem Steuerungsverkehr und kurzer Ansprechüberwachung.

**Ein Konfigurationspunkt verdient Nachdruck, weil er reale Ausfälle erzeugt: Spanning Tree und ein Ringprotokoll dürfen nicht beide auf denselben Ports aktiv sein.** MRP verwaltet den Ring, indem es bewusst einen Port blockiert hält; eine Spanning-Tree-Instanz auf demselben Ring trifft ihre eigenen Entscheidungen darüber, welcher Port blockiert wird, und beide Mechanismen stören einander. Auf Ringports gehört Spanning Tree deaktiviert, und die Grenze zwischen Ring und einer Spanning-Tree-Domäne muss ausdrücklich definiert sein.

## MRP: begrenzte Ringwiederherstellung

Das Media Redundancy Protocol ist das Arbeitspferd industrieller Ringredundanz. Ein Switch übernimmt die Rolle des Media Redundancy Manager und hält den Ring logisch offen, indem er einen seiner Ringports blockiert; die übrigen Switches sind Clients, die schlicht weiterleiten. Der Manager überwacht den Ring mit Testtelegrammen und gibt bei einer Unterbrechung seinen Port frei, womit der Verkehrsweg wiederhergestellt ist.

Sein Vorteil gegenüber Spanning Tree ist, dass die Wiederherstellung **begrenzt und spezifiziert** ist statt emergent. Die Zahl ist eine Eigenschaft der Implementierung und der Ringgröße und wird je Gerät veröffentlicht — weshalb sie gelesen und nicht angenommen gehört.

Die Engineering-Regeln, die MRP zum korrekten Verhalten bringen:

- **Genau ein Manager.** Zwei Manager oder keiner ist eine Fehlkonfiguration, die sich womöglich erst beim ersten Fehler zeigt.
- **Die Wiederherstellzahl ist mit der kürzesten Ansprechüberwachung im Ring zu vergleichen**, mit Reserve, bevor der Entwurf akzeptiert wird. Beide Zahlen sind konfigurierbar; sie müssen einmal und von einer Person abgeglichen werden.
- **Stiche liegen nicht im Ring.** Ein als Abzweig an einem Ringswitch angeschlossenes Gerät verhält sich wie in einer Linientopologie, unabhängig davon, was der Ring tut. Das wird regelmäßig vergessen, wenn nach der Inbetriebnahme ein Gerät ergänzt wird.
- **Ein Gerät, das ausfällt und dabei auf beiden Ports weiterleitet**, ist nicht der Fehlermodus, den MRP adressiert. Ringredundanz deckt Wegverlust ab, nicht jeden Gerätefehler.

## PRP: keine Wiederherstellung, weil nichts verloren ging

Das Parallel Redundancy Protocol geht einen völlig anderen Weg. Ein Knoten sendet jedes Telegramm zweimal, über zwei vollständig unabhängige Netze. Der Empfänger nimmt die zuerst eintreffende Kopie und verwirft das Duplikat. Fällt ein Netz aus, kommt die andere Kopie weiterhin an — **es gibt keine Umschaltung, keine Rekonfiguration und keine Unterbrechung.**

Die Kosten sind ehrlich und erheblich:

- **Zwei vollständige Netze.** Getrennte Switches, getrennte Verkabelung, wo die Konsequenz es rechtfertigt auch getrennte Versorgung. Das zu halbieren — einen Switch teilen oder beide Wege durch denselben Kanal führen — führt einen gemeinsamen Fehler wieder ein und macht aus zwei Netzen ein teures.
- **Knotenunterstützung.** Geräte müssen doppelt angebunden und PRP-fähig sein. Einfach angebundene Geräte brauchen eine RedBox, und jede RedBox ist für das dahinterliegende Gerät selbst ein Single Point of Failure.

**Was PRP im Bestand attraktiv macht**, ist die fehlende Topologiebindung: Jedes der beiden Netze darf beliebig geformt sein. Wo eine bestehende sternverkabelte Anlage Nullverlust-Redundanz braucht, ist die Verdopplung des Netzes oft praktikabler, als alles auf Ringe umzubauen.

## HSR: unterbrechungsfrei ohne zweites Netz

High-availability Seamless Redundancy erreicht dasselbe verlustfreie Verhalten auf einem Ring. Jeder Knoten sendet ein Telegramm in beide Ringrichtungen und leitet Telegramme für seine Nachbarn weiter; das Ziel nimmt die erste Kopie und verwirft die zweite.

Der Tausch gegenüber PRP ist klar:

- **Ein Ring statt zweier Netze** — deutlich weniger Verkabelung und weniger Switches.
- **Aber jeder Knoten muss mitwirken.** Ein HSR-Ring besteht aus HSR-fähigen Knoten, die jeweils als Weiterleitungselement arbeiten. Ein Gerät ohne HSR-Unterstützung braucht zum Anschluss eine RedBox.
- **Der Ring trägt duplizierten Verkehr**, seine Kapazität ist also gegen die tatsächliche Last zu prüfen und nicht anzunehmen.
- **Ein spannungsloser Knoten leitet nicht mehr weiter** — für die Knoten dahinter, sofern die Implementierung keinen Bypass bietet. Das ist eine reale Verfügbarkeitsfrage und unterscheidet sich von PRP, wo ein ausgefallener Knoten nur sich selbst betrifft.

## Auswählen: eine ausdrückliche Methode

Die Technologien sind nicht austauschbar, und eine belastbare Auswahl folgt einer festen Reihenfolge.

1. **Den tolerierbaren Verlust je Verkehrsklasse benennen**, aus Ansprechüberwachungen und Anwendungsanforderungen — nicht aus einer Vorliebe für „schnell“.
2. **Ist die Toleranz null, qualifizieren sich nur PRP und HSR.** Keine Parametrierung macht ein rekonfigurierendes Protokoll unterbrechungsfrei.
3. **Wird Nullverlust verlangt, entscheidet zwischen PRP und HSR die Topologie und der Gerätebestand**: bestehende Sternverkabelung und gemischte Geräte sprechen für PRP mit RedBoxen; ein natürlicher Ring fähiger Knoten für HSR.
4. **Ist eine begrenzte Unterbrechung akzeptabel, MRP auf Ringen einsetzen** und die veröffentlichte Wiederherstellzahl gegen die kürzeste Ansprechüberwachung prüfen.
5. **RSTP dort einsetzen, wo die Topologie beliebig ist und der Verkehr nicht-deterministische Konvergenz verträgt** — typischerweise ab der Leitebene aufwärts.
6. **Mechanismen nicht auf denselben Ports mischen.** Wo Domänen aufeinandertreffen, die Grenze ausdrücklich definieren.
7. **Interoperabilität prüfen, bevor man sich auf Multi-Hersteller-Ringe festlegt.** Ein standardisierter Mechanismus verlangt weiterhin passende Rollen, kompatible Zeitparameter und gegebenenfalls dieselbe unterstützte Wiederherstellklasse.

**Ein Entwurf, der nicht sagen kann, welcher dieser Schritte zu seiner Antwort führte, hat die Antwort meist aus einem früheren Projekt geerbt.**

## Der Fehler, den niemand sieht: stilles Ablaufen

Alle hier behandelten Verfahren teilen eine Eigenschaft, die Monitoring unverzichtbar macht.

**Ein redundantes System, das bereits einen Weg verloren hat, funktioniert einwandfrei.** Genau das ist der Zweck — und genau deshalb bleibt der Verlust unsichtbar. Ein Ring mit einer Unterbrechung ist eine Linie: voll funktionsfähig und einen Fehler vom Ausfall entfernt. Eine PRP-Installation mit ausgefallenem LAN B liefert jedes Telegramm über LAN A: voll funktionsfähig und nicht mehr redundant.

Die Folge ist deutlich: **ohne ausdrückliches Monitoring degradiert Redundanz still und wird erst durch den zweiten Fehler entdeckt — also durch genau den, für dessen Überstehen sie beschafft wurde.**

Was das Monitoring abdecken muss:

- **Ringintegrität und Managerzustand** bei MRP — ein offener Ring muss eine Meldung erzeugen, die den Betrieb erreicht, und nicht bloß ein Statusbit in einem Switch, den niemand liest.
- **LAN-bezogene Überwachung bei PRP** — der Mechanismus liefert genau deshalb Überwachungstelegramme und pfadbezogene Zähler, weil die Anwendungsebene es nicht merken kann. Verarbeitet sie niemand, ist die Redundanz unverifiziert.
- **Knotenbezogene HSR-Zähler** — ein Knoten, der in eine Richtung nicht mehr weiterleitet, ist ein teilweiser Ringausfall.
- **Meldungen, die handlungsfähig machen.** Eine Redundanzstörung, die nur in einem Netzmanagement-Werkzeug erscheint, das während der Produktion niemand betrachtet, ist nicht überwacht, sondern aufgezeichnet.

## Inbetriebnahme und Fehlerprüfung

Redundanz ist die eine Entwurfseigenschaft, die vollständig unbewiesen bleibt, bis man sie absichtlich bricht.

Eine aussagekräftige Prüfung bei der Übergabe:

- **Jeden Weg einzeln unterbrechen, unter Last**, nicht im ruhigen Netz. Die Wiederherstellung bestätigen und vor allem bestätigen, dass **keine Station während des Ereignisses eine Kommunikationsstörung gemeldet hat** — ein wiederhergestelltes Netz, das die Anlage ausgelöst hat, ist durchgefallen.
- **Messen, nicht annehmen.** Die veröffentlichte Zahl gilt für eine bestimmte Konfiguration; der installierte Ring kann größer sein.
- **In beide Richtungen und an mehreren Stellen prüfen.** Eine Unterbrechung neben dem Manager und eine auf der Gegenseite des Rings sind verschiedene Ereignisse.
- **Verifizieren, dass die Redundanz nach Behebung wirklich wieder besteht.** Ein geheilter Ring, dessen Manager im Störzustand blieb, ist für das nächste Ereignis nicht bereit.
- **Bestätigen, dass das Monitoring ausgelöst hat.** Erzeugte das Trennen einer Strecke keine für den Betrieb sichtbare Meldung, besteht das Problem des stillen Ablaufens bereits am ersten Tag.
- **Bei PRP ein LAN vollständig entfernen** und bestätigen, dass die Produktion ohne anwendungsseitige Wirkung weiterläuft — und dass die Überwachung es meldet.

**Die gemessenen Zahlen in der Übergabedokumentation festhalten.** Jede spätere Änderung an Ringgröße oder Ansprechüberwachung muss gegen diese Basis erneut geprüft werden.

## Instandhaltung unter Redundanz

Ein legitimer, selten realisierter Vorteil: Ein redundantes Netz lässt sich Weg für Weg instand halten.

- Bei PRP kann ein ganzes Netz für Switch-Tausch oder Firmware-Update stillgelegt werden, während die Produktion über das andere läuft. Das ist das stärkste betriebliche Argument für die Kosten.
- Bei MRP ist das bewusste Öffnen des Rings für Wartungsarbeiten eine kontrollierte Fassung des Fehlerfalls; es gehört geplant und angekündigt statt entdeckt.
- In beiden Fällen **läuft die Anlage währenddessen ohne Redundanz**, und dieses Fenster sollte kurz, bekannt und außerhalb risikoreicher Betriebszustände liegen.

## Fehlermodi

**Wiederherstellzeit länger als die Ansprechüberwachung.** Die Rekonfiguration bleibt innerhalb der Protokollzusage und dennoch außerhalb dessen, was der Antrieb zulässt — beide Zahlen stimmen, und nur eine davon stand im Lastenheft.

**Zwei Ringmanager oder keiner.** Konfigurationsfehler, unsichtbar bis zum ersten echten Fehler.

**Spanning Tree auf Ringports aktiv gelassen.** Zwei Mechanismen entscheiden unabhängig, welcher Port blockiert wird.

**Eine unbemerkte Unterbrechung.** Der Ring ist seit Monaten eine Linie; der nächste Fehler ist ein Ausfall.

**PRP mit ausgefallenem LAN und ohne Auswertung der Überwachung.** Die Redundanz ist still abgelaufen; die Investition wurde bezahlt und der Nutzen verloren.

**Beide PRP-Wege in einem Kanal, an einem Switch oder an einer Versorgung.** Ein physikalisches Ereignis nimmt beide Netze mit.

**Nach der Inbetriebnahme als Stich ergänzte Geräte.** Sie liegen außerhalb der Redundanz, die die Dokumentation ihnen zuschreibt.

**Redundanz nie unter Last getestet.** Die eine Eigenschaft, die sich nicht aus der Konfiguration ableiten lässt, wurde nie verifiziert.

**HSR-Ringkapazität angenommen statt gerechnet.** Der duplizierte Verkehr übersteigt in der Spitze, was der Ring tragen kann.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Das Stationsleitnetz eines Verteilnetz-Umspannwerks ist als MRP-Ring aufgebaut, der Feldgeräte mit einem Stationsgateway verbindet. Der Entwurf ist solide, und der Ring wird erfolgreich in Betrieb genommen.

Zwei Jahre später, nach einer Erweiterung, erleben die Bediener kurze Ausfälle der Stationsdaten, sobald Wartungsarbeiten eine bestimmte Kabeltrasse berühren. Die Ereignisse sind kurz, das System erholt sich jedes Mal, und sie werden als Netzstörungen protokolliert.

Die Belege ergeben ein anderes Bild. Erstens hat die Erweiterung vier Geräte in den Ring gebracht, und die gemessene Wiederherstellzeit ist mit der Ringgröße gewachsen — die bei der ursprünglichen Inbetriebnahme verifizierte Zahl gilt nicht mehr. Zweitens, und gewichtiger, wurden zwei der neuen Geräte als Stich an einem Ringswitch angeschlossen statt in den Ring eingebunden; diese beiden sind von der Redundanz gar nicht erfasst, und die „kurzen Ausfälle“ sind für sie keine kurzen Wiederherstellungen, sondern echte Ausfälle für die Dauer der Störung.

Im ursprünglichen Entwurf war nichts falsch konfiguriert. Der Fehler bestand darin, dass eine Erweiterung sowohl die Wiederherstellzeit als auch die Redundanzabdeckung verändert hat und beides nicht neu verifiziert wurde — weil die Erweiterung als Hinzufügen von Geräten behandelt wurde und nicht als Änderung eines Redundanzentwurfs.

Die Abhilfe ist strukturell: die beiden Stichgeräte in den Ring holen oder ihren dokumentiert nicht-redundanten Status akzeptieren, die Wiederherstellzeit für den vergrößerten Ring neu messen und gegen die kürzeste Ansprechüberwachung des Segments prüfen. Die allgemeine Regel verdient eine klare Formulierung: **jede Änderung der Knotenzahl in einer redundanten Topologie ist eine Änderung ihrer Wiederherstellzeit und damit eine Änderung des Entwurfs.**

## Empfohlene Praxis

- Den tolerierbaren Verlust je Verkehrsklasse aus Ansprechüberwachungen und Anwendungsanforderungen ableiten, bevor ein Mechanismus bewertet wird.
- Ist die Verlusttoleranz null, die Auswahl auf PRP oder HSR beschränken; nicht versuchen, ein rekonfigurierendes Protokoll unterbrechungsfrei zu parametrieren.
- PRP wählen, wo die Topologie beliebig oder der Gerätebestand gemischt ist; HSR, wo ein Ring fähiger Knoten naheliegt.
- MRP für Steuerungsringe einsetzen und die veröffentlichte Wiederherstellzahl mit Reserve gegen die kürzeste Ansprechüberwachung prüfen.
- RSTP auf Ebenen beschränken, deren Verkehr nicht-deterministische Konvergenz verträgt.
- Spanning Tree und Ringprotokoll nie auf denselben Ports betreiben; Domänengrenzen ausdrücklich festlegen.
- Die beiden PRP-Netze wirklich unabhängig halten — getrennte Switches, getrennte Trassen, wo begründet getrennte Versorgung.
- Ringintegrität, Managerzustand und pfadbezogene Überwachung mit Meldungen überwachen, die den Betrieb erreichen.
- Bei der Übergabe jeden Weg bewusst unter Last unterbrechen und bestätigen, dass keine Station eine Störung gemeldet hat.
- Gemessene Wiederherstellzeiten dokumentieren; nach jeder Topologieänderung erneut verifizieren.
- Ergänzte Geräte als Änderung des Redundanzentwurfs behandeln, nicht als Anschlussaufgabe.
- Wartungsfenster in dem Bewusstsein planen, dass die Anlage währenddessen ungeschützt ist.

## Fazit

Die vier Mechanismen beantworten verschiedene Fragen. RSTP fragt, wie man eine beliebige Topologie übersteht; MRP, wie ein Ring innerhalb einer genannten Schranke wieder verfügbar wird; PRP und HSR fragen, wie sich eine Wiederherstellung ganz vermeiden lässt. Sie als austauschbare Produkte unterschiedlicher Preisklassen zu behandeln, erzeugt Entwürfe, die eine Spezifikation erfüllen, die niemand geschrieben hat.

Die Disziplin, die die Wahl belastbar macht, ist unspektakulär: den tolerierbaren Verlust benennen, den passenden Mechanismus wählen, die Zahl durch Unterbrechen verifizieren und den bereits ausgefallenen Weg überwachen. Das Letzte wiegt am schwersten, denn Redundanz ist der einzige Teil eines Netzes, der bis zu dem Moment einwandfrei funktioniert, in dem er gebraucht wird — und seit Monaten nicht mehr da ist.
