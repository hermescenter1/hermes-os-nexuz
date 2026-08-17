# Segmentierung industrieller Ethernet-Netze und VLAN-Entwurf

## Zusammenfassung

Segmentierungsempfehlungen aus der Büro-IT lassen sich schlecht auf eine Anlage übertragen, und der Grund ist konkret statt kulturell: **ein erheblicher Teil industrieller Kommunikation wird nicht geroutet.** Geräteerkennung, Namensvergabe, Teile der Diagnose und mehrere Protokollmechanismen arbeiten ausschließlich auf Layer 2. Eine VLAN-Grenze im Büro ist eine Verwaltungslinie. In einer Anlage kann sie die Linie sein, ab der eine Steuerung ihre eigene Peripherie nicht mehr findet.

Diese eine Randbedingung ordnet den gesamten Entwurf neu. Der Routing-Rand muss *über* der Zelle liegen, die Broadcast-Domäne muss um das gezogen werden, was ohne Router miteinander sprechen muss, und die resultierenden VLANs erweisen sich vor allem anderen als Fehlerdomänen.

## Die ingenieurtechnische Aufgabe

Drei Eigenschaften industriellen Verkehrs bestimmen den Entwurf, und keine davon taucht in allgemeiner Netzwerkliteratur auf.

**Reine Layer-2-Mechanismen.** Erkennungs- und Identifikationsprotokolle, mit denen Feldgeräte gefunden, benannt und adressiert werden, arbeiten als Broadcast oder Multicast auf Layer 2 und passieren keinen Router. Alles, was darauf beruht — Inbetriebnahmewerkzeuge, Gerätetausch, Topologieerkennung — muss in derselben Broadcast-Domäne liegen wie die Geräte.

**Multicast als normaler Betriebsmodus.** Mehrere Industrieprotokolle verteilen zyklische Prozessdaten per Multicast statt per Unicast. In einem Switch ohne Multicast-Filterung wird dieser Verkehr auf jeden Port der VLAN geflutet — ein unbeteiligtes Gerät empfängt also Verkehr, den es nie angefordert hat, und muss ihn verwerfen. Auf einem kleinen eingebetteten Gerät ist dieses Verwerfen nicht kostenlos.

**Verfügbarkeit vor Vertraulichkeit.** Der Entwurfsdruck in einer Anlage wirkt entgegengesetzt zum Büro. Ein Segmentierungskonzept, das ein Gerät oder eine Regel zwischen eine Steuerung und ihre Peripherie stellt, hat eine Komponente hinzugefügt, deren Ausfall die Produktion stoppt. **Jede Routing-Grenze innerhalb der Steuerungsebene ist eine Verfügbarkeitsschuld und braucht einen stärkeren Grund als Ordentlichkeit.**

## Was in dieselbe VLAN gehört

Die nützliche Entwurfsfrage lautet nicht „wie viele VLANs brauchen wir“, sondern „was zwingt diese Geräte in dieselbe Broadcast-Domäne, und was trennt sie“. Vier Prüfungen, in dieser Reihenfolge:

1. **Müssen sie einander ohne Router erreichen?** Muss eine Steuerung ein Gerät über Layer-2-Mechanismen erkennen, benennen oder zyklisch mit ihm Daten austauschen, gehören sie zusammen. Diese eine Prüfung entscheidet den größten Teil der Topologie.
2. **Teilen sie eine Fehlerdomäne, die die Anlage ohnehin akzeptiert?** Geräte einer Maschine, die als Ganzes stillsteht, dürfen eine Broadcast-Domäne teilen; Geräte unabhängiger Prozessbereiche nicht — sonst überschreitet ein Sturm oder eine Fehlkonfiguration eine Grenze, die der Prozess gar nicht kennt.
3. **Teilen sie einen Verkehrscharakter?** Zyklische Peripherie, Leitebenenabfragen, Video und Dateitransfer verhalten sich verschieden. Einen Massentransfer mit zyklischer Regelung in einer Broadcast-Domäne zu mischen heißt, dessen Lastspitzen zum Problem der Steuerungsebene zu machen.
4. **Teilen sie einen Lebenszyklus?** Anlagenteile, die gemeinsam in Betrieb genommen, gepatcht und geändert werden, stören weniger, wenn sie gruppiert sind, als wenn eine Änderung in einem Bereich eine VLAN berührt, die drei Bereiche überspannt.

Eine Struktur, die aus diesen Prüfungen für eine typische Anlage folgt:

```text
Enterprise LAN
      |
   Firewall
      |
 Industrial DMZ        (data broker, remote-access gateway)
      |
   OT Firewall
      |
+---------------------------+
| Supervisory VLAN          |  SCADA, historian collector
+---------------------------+
      |
 Core OT switching  ── Management VLAN (switch/infrastructure only)
   /        |        \
Cell A     Cell B     Utilities        <- one VLAN per cell,
VLAN       VLAN       VLAN                controller + its I/O together
```

**Die wichtige Eigenschaft dieses Bildes ist, wo die Routing-Grenze nicht liegt.** Nicht zwischen einer Steuerung und ihrer dezentralen Peripherie, und nicht zwischen einer Steuerung und dem Engineering-Werkzeug, das sie erkennen muss. Sie liegt zwischen den Zellen und der Leitebene, wo der überschreitende Verkehr konstruktionsbedingt ohnehin IP-routbar ist.

## Layer 2 gegenüber Layer 3 im OT-Kontext

| Eigenschaft | Layer-2-Trennung (VLAN) | Layer-3-Trennung (geroutet) |
| --- | --- | --- |
| Begrenzt Broadcast/Multicast | Ja | Ja |
| Lässt Layer-2-Erkennung durch | Ja, innerhalb der VLAN | Nein |
| Natürlicher Ort für eine Richtlinienregel | Nein | Ja |
| Fügt ein ausfallfähiges Gerät hinzu | Nein | Ja |
| Erhöht die Diagnosekomplexität | Mäßig | Erheblich |
| Geeignet innerhalb einer Steuerungszelle | Ja | Selten |
| Geeignet zwischen Zelle und Leitebene | — | Ja |

Die mitzunehmende Überlegung: **VLANs begrenzen Fehler; Routing-Grenzen setzen Richtlinien durch.** Das erste innerhalb der Steuerungsebene großzügig einsetzen, das zweite bewusst an deren Rändern.

**Übersegmentierung ist ein realer und kein theoretischer Fehlermodus.** Jeder Routing-Sprung zwischen einer Steuerung und etwas, wovon sie abhängt, ist eine Regel, die falsch sein kann, ein Gerät, das ausfallen kann, und ein Schritt, den eine Fachkraft um drei Uhr nachts verstehen muss. Ein Anlagennetz mit mehr Grenzen, als der Prozess unabhängige Bereiche hat, hat Richtliniengranularität mit Verfügbarkeit bezahlt — meist ohne dass jemand diesen Tausch ausgesprochen hätte.

## Multicast- und Broadcast-Eindämmung

Dies ist der OT-spezifischste Teil des Entwurfs und derjenige, der am häufigsten übersprungen wird.

**Multicast-Filterung muss konfiguriert werden und braucht einen Querier.** Switches unterdrücken überflüssiges Multicast-Fluten, indem sie lernen, welche Ports interessierte Empfänger haben — dieses Lernen beruht jedoch auf periodischen Abfragen. Im Büro liefert sie der Router. In einer isolierten Steuerungs-VLAN gibt es womöglich gar keinen Router — wird also kein Switch ausdrücklich als Querier konfiguriert, aktiviert sich die Filterung entweder nie oder sie altert aus, und der Verkehr flutet wieder überall hin.

Der daraus entstehende Fehler ist charakteristisch und erkennenswert: **eine Zelle, die monatelang lief, zeigt plötzlich Kommunikationsstörungen, nachdem an anderer Stelle derselben VLAN unbeteiligte Geräte ergänzt wurden** — weil der zusätzliche Multicast nun zu Geräten geflutet wird, die weder Interesse daran noch viel Kapazität zum Verwerfen haben.

**Broadcast-Eindämmung ist das, was eine VLAN zur Fehlerdomäne macht.** Ein Gerät mit defekter Netzwerkschnittstelle kann dauerhaft Broadcast senden; ein fehlkonfiguriertes Werkzeug ebenso. Innerhalb einer VLAN ist alles betroffen. Jenseits der VLAN-Grenze nichts. Broadcast-Domänen auf die unabhängigen Bereiche der Anlage zuzuschneiden heißt, dass der Wirkradius eines unvorhersehbaren Ereignisses einem Bereich entspricht, ohne den die Anlage nachweislich fahren kann.

**Storm Control ist eine Milderung, kein Entwurf.** Eine Ratenbegrenzung für Broadcast auf Access-Ports fängt ein defektes Gerät ab. Sie macht eine überdimensionierte Broadcast-Domäne nicht akzeptabel.

## Trunks, Access-Ports und die Details, die zubeißen

**Feldgeräte gehören an Access-Ports, untagged.** Die meisten Industriegeräte haben eine Schnittstelle ohne VLAN-Bewusstsein. Eines an einen Trunk zu hängen oder von ihm Tag-Interpretation zu erwarten, erzeugt ein Gerät, das im Netz erscheint und nicht kommuniziert.

**Trunks tragen nur die VLANs, die sie tragen müssen.** Ein Trunk, der per Vorgabe alles trägt, dehnt jede Broadcast-Domäne über jede Strecke aus und hebt die beabsichtigte Segmentierung still wieder auf. Die Trunk-Liste zu beschneiden ist bei der Inbetriebnahme eine Fünf-Minuten-Aufgabe und danach eine forensische Übung.

**Die untagged VLAN auf einem Trunk verdient eine ausdrückliche Entscheidung.** Sie auf der Switch-Vorgabe zu belassen bedeutet, dass jede Portfehlkonfiguration Verkehr in eine VLAN legt, die niemand geplant hat — und Verkehr der Default-VLAN wird am wenigsten überwacht.

**Portbeschreibungen sind Diagnoseinfrastruktur.** Ein Switch, dessen Ports mit Gerät und Ort beschriftet sind, verwandelt „Port 14 ist down“ in „die dezentrale Peripherie des Palettierers ist down“. Ohne sie beginnt jeder Vorfall mit Kabelverfolgung.

## Die Management-VLAN

Infrastrukturmanagement gehört in eine eigene VLAN, und die Begründung ist Verfügbarkeit und keine Sicherheitspose.

**Ein Managementpfad, der das Schicksal des Fehlers teilt, den er melden soll, ist kein Managementpfad.** Ist die Managementschnittstelle eines Switches nur über denselben Uplink erreichbar, der gerade ausgefallen ist, wird der Switch genau dann unerreichbar, wenn seine Zähler und Protokolle die benötigten Belege enthalten. Wo die Konsequenz es rechtfertigt, zahlt sich ein Out-of-Band-Weg zur Kerninfrastruktur beim ersten Einsatz aus.

Weitere ausdrücklich zu entscheidende Punkte:

- Managementschnittstellen sollten aus Zellen-VLANs nicht erreichbar sein. Ein Feldgerät hat keinen Grund, mit der Managementebene eines Switches zu sprechen.
- Zeitsynchronisation, Protokollierung und Monitoring sollten die Management-VLAN über einen definierten Weg erreichen, denn ein Netzereignis mit einem Anlagenereignis zu korrelieren setzt konsistente Zeitstempel voraus.
- Engineering-Arbeitsplätze brauchen einen kontrollierten Weg zu den Zellen. Dieser Weg ist eine bewusste Ausnahme und sollte als solche dokumentiert sein — nicht ein Nebenprodukt eines flachen Adressplans.

> Vertrauensgrenzen, Firewall-Regelwerk und die Steuerung des Engineering-Zugriffs behandelt der Begleitbeitrag zur sicheren PLC-SCADA-Kommunikation. Dieser Beitrag behandelt die Netzstruktur, auf die jene Maßnahmen angewendet werden; die beiden Entscheidungen hängen zusammen, werden aber getrennt getroffen.

## Diagnose

Segmentierung verändert die Bedeutung von Symptomen, und ein segmentiertes Netz ist auf eine Weise diagnostizierbar, wie es ein flaches nicht ist — sofern der Entwurf dokumentiert ist.

| Symptom | Beleg | Wahrscheinliche Domäne |
| --- | --- | --- |
| Gerät per IP erreichbar, Engineering-Werkzeug findet es nicht | Werkzeug liegt in einem anderen Subnetz | Eine Routing-Grenze blockiert einen reinen Layer-2-Mechanismus |
| Die Geräte einer Zelle fallen gemeinsam aus | Sie teilen VLAN und Uplink | Verteilebene, nicht die Geräte |
| Geräte mehrerer Zellen fallen gemeinsam aus | Die Zellen teilen Trunk oder Core-Switch | Core oder Trunk, nicht die Zellen |
| Eine Zelle degradiert nach Arbeiten anderswo | Beide Bereiche teilen eine Broadcast-Domäne | Segmentierungsgrenze falsch gezogen |
| Multicast-basierte Peripherie sporadisch, Unicast in Ordnung | Fluten auf unbeteiligten Ports sichtbar | Multicast-Filterung inaktiv; kein Querier |
| Switch während eines Vorfalls unerreichbar | Management teilt den ausgefallenen Uplink | Entwurf des Managementpfads |
| Gerät läuft an einem Port, am anderen nicht | Port-VLAN-Zuordnung abweichend | Access-Port-Konfiguration |

**Die Argumentation ist überall dieselbe: Was gemeinsam ausfällt, teilt etwas — und der Segmentierungsentwurf sagt Ihnen, was das ist.** In einem flachen Netz tragen gleichzeitige Ausfälle fast keine Information; in einem segmentierten benennen sie die Ebene.

## Dokumentation, die den Entwurf überleben lässt

Ein VLAN-Entwurf, der nur in Switch-Konfigurationen existiert, ist ein Entwurf, den die nächste Erweiterung aufhebt.

Der minimale Artefaktsatz und was jedes verhindert:

- **VLAN-Register** — ID, Name, Zweck, Subnetz, versorgte Bereiche. Verhindert, dass dieselbe ID auf verschiedenen Switches zwei Bedeutungen bekommt.
- **Freigegebene Flüsse je Routing-Grenze** — was passiert, in welche Richtung, und warum. Verhindert Regeln, die niemand zu entfernen wagt, weil niemand ihren Zweck kennt.
- **Physisch-logische Zuordnung** — welcher Switch, welcher Port, welches Gerät, welche VLAN. Verhindert, dass jeder Vorfall mit Kabelverfolgung beginnt.
- **Trunk-VLAN-Listen** — was jede Inter-Switch-Strecke tragen darf. Verhindert, dass sich die Segmentierung still auflöst.
- **Ein Adressplan mit Reserve.** Pro Bereich reservierte Blöcke bedeuten, dass eine Erweiterung keine Neuadressierung erzwingt — und eine Neuadressierung erzwingt Änderungen in jeder Steuerungskonfiguration, die eine IP referenziert.

## Fehlermodi

**Routing-Grenze innerhalb einer Zelle.** Erkennung und Gerätetausch funktionieren nicht mehr; das Werkzeug, das bei der Inbetriebnahme lief, läuft in der Anlage nicht.

**Eine flache Steuerungs-VLAN über den Standort.** Eine defekte Schnittstelle betrifft jeden Bereich; nichts lokalisiert sich.

**Trunks, die per Vorgabe alle VLANs tragen.** Der Entwurf ist als segmentiert dokumentiert und verhält sich flach.

**Multicast-Filterung ohne Querier.** Die Filterung altert aus, der Verkehr flutet wieder, die Symptome erscheinen Monate später.

**Management-VLAN abhängig vom Produktions-Uplink.** Der Switch ist genau dann unerreichbar, wenn er die Belege enthält.

**VLAN-IDs mit unterschiedlicher Bedeutung auf verschiedenen Switches.** Ein Trunk dazwischen verschmilzt zwei unverwandte Domänen.

**Kein Adressierungsspielraum.** Eine Erweiterung erzwingt Neuadressierung, und die berührt Steuerungskonfigurationen.

**Undokumentierte Ausnahmeregeln.** Über Jahre angesammelt, nie entfernt — bis die Grenze mehr zulässt als das flache Netz, das sie ersetzt hat.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Der Materialflussbereich eines Stahlwerks wird um zwei neue Förderzellen erweitert. Der Netzentwurf legt jede Zelle in die bestehende standortweite Steuerungs-VLAN, so wie es auch die ursprünglichen Zellen sind. Die Erweiterung wird erfolgreich in Betrieb genommen.

Drei Wochen später zeigt eine der *ursprünglichen* Zellen bei bestimmten Produktionsabläufen sporadische Kommunikationsstörungen der Peripherie. An dieser Zelle wurde nichts geändert. Geräte, Verkabelung und Steuerung werden geprüft und teilweise getauscht; die Störungen bleiben.

Der Befund, der das Problem neu rahmt: Die Störungen korrelieren zeitlich mit dem Hochgeschwindigkeits-Transferablauf der neuen Zellen, und die Switch-Statistik zeigt erhebliche Multicast-Last an Ports der ursprünglichen Zelle — an Ports, deren Geräte an diesem Verkehr kein Interesse haben. Die Multicast-Filterung ist auf den Switches aktiviert, aber nirgends in der VLAN ist ein Querier konfiguriert, und es gibt darin auch keinen Router, der die Rolle übernähme. Der Filterzustand altert aus, und die Switches fallen auf Fluten zurück.

Die Geräte der ursprünglichen Zelle liefen zuvor mit ausreichender Reserve; der zusätzlich geflutete Verkehr hat sie aufgebraucht.

Zwei Korrekturen bieten sich an, und beide lohnen. Die unmittelbare ist, einen Querier zu konfigurieren, damit die Filterung aktiv bleibt. Die strukturelle lautet, dass die beiden neuen Zellen nie eine Broadcast-Domäne mit den ursprünglichen hätten teilen dürfen: getrennte Zellen-VLANs hätten den Verkehr unabhängig vom Filterzustand eingegrenzt und die Symptome der ursprünglichen Zelle unmöglich gemacht.

**Die allgemeine Lehre ist die, die sich in der OT-Segmentierung wiederholt: ein Entwurf, der darauf beruht, dass eine Protokollfunktion konfiguriert bleibt, ist schwächer als ein Entwurf, dessen Struktur den Fehler ausschließt.**

## Inbetriebnahme und Änderungskontrolle

- Die VLAN-Zuordnung je Port vor dem Einschalten gegen den Entwurf prüfen, nicht erst nach einer Störung.
- Bestätigen, dass die Multicast-Filterung aktiv ist *und* dass ein stabiler Querier existiert; nach jedem Tausch eines Core-Switches erneut prüfen.
- Trunk-VLAN-Listen ausdrücklich beschneiden; keine Vorgaben übernehmen.
- Den Managementpfad mit bewusst getrenntem Produktions-Uplink testen.
- Das VLAN-Register und die physisch-logische Zuordnung im Ist-Zustand zur Übergabe erfassen; ein nie abgeglichenes Soll-Dokument ist schlimmer als keines, weil ihm vertraut wird.
- Jede neue Routing-Grenze innerhalb der Steuerungsebene als begründungspflichtige Entwurfsänderung behandeln, nicht als Konfigurationsaufgabe.

## Empfohlene Praxis

- Broadcast-Domänen um das ziehen, was ohne Router kommunizieren muss, und sie anschließend gegen die unabhängigen Bereiche der Anlage prüfen.
- Den Routing-Rand über der Zelle halten; nie eine Grenze zwischen Steuerung und Peripherie oder Engineering-Werkzeug legen.
- Eine VLAN je Zelle verwenden, damit ein Broadcast-Fehler einem Bereich entspricht, ohne den die Anlage fahren kann.
- Multicast-Filterung und einen ausdrücklichen Querier konfigurieren und deren Fortbestand verifizieren.
- Feldgeräte an untagged Access-Ports legen; Trunks auf die notwendigen VLANs beschneiden.
- Die untagged VLAN auf Trunks ausdrücklich festlegen statt eine Vorgabe zu erben.
- Dem Infrastrukturmanagement eine eigene VLAN und einen Pfad geben, der den Ausfall des Produktions-Uplinks übersteht.
- Jeden Port mit Gerät und Ort beschriften.
- VLAN-Register, Flussliste je Grenze und einen Adressplan mit Reserve pflegen.
- Segmentierung ablehnen, die der Prozess nicht rechtfertigt — jede Routing-Grenze ist ein Verfügbarkeitspreis.

## Fazit

Industrielle Segmentierung ist eine andere Disziplin als ihr Büro-Pendant, weil der Verkehr anderen Regeln folgt. Protokolle, die nicht routen, bestimmen, wo Broadcast-Domänen liegen müssen; zyklischer und Multicast-Verkehr bestimmt, wie groß sie sein dürfen; und die unabhängigen Bereiche der Anlage bestimmen, wo die Grenzen hingehören.

Sind diese drei richtig gesetzt, wird die VLAN-Struktur zum Diagnosevorteil: Was gemeinsam ausfällt, benennt die Ebene, und die Segmentierung selbst hält einen lokalen Fehler lokal. Sind sie falsch gesetzt — eine Routing-Grenze in der Zelle, eine flache Domäne über den Standort oder eine still ausalternde Multicast-Filterung —, liefert das Netz das Schlechteste beider Welten: die Betriebskomplexität eines segmentierten Entwurfs mit dem Fehlerverhalten eines flachen.
