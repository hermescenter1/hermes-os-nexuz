# IT/OT-Konvergenzarchitektur für moderne Fabriken

## Zusammenfassung

Konvergenzprogramme beginnen meist mit einer Liste dessen, was das Unternehmen gern sehen möchte, und enden mit einem Netzplan. Der ingenieurtechnische Schritt dazwischen — die Bilanz darüber, was jede neue Verbindung an Abhängigkeit kostet — wird am häufigsten übersprungen, und er entscheidet, ob am Ende eine gut instrumentierte Anlage steht oder eine Anlage, die stillsteht, wenn ein Server in einem Rechenzentrum neu startet.

Dieser Beitrag behandelt Konvergenz als genau diese Bilanz. Die leitende Frage lautet nicht „wie verbinden wir diese Systeme“, sondern **„wovon hängt die Anlage jetzt ab, wovon sie vorher nicht abhing — und ist das akzeptabel?“**

## Purdue als Denkwerkzeug, nicht als Konformitätsdiagramm

Das geschichtete Referenzmodell, das die meisten Anlagen geerbt haben, gilt entweder als Dogma oder als überholt. Beide Lesarten verschenken es.

**Wirklich nützlich bleibt** nicht die Zahl der Ebenen, sondern das darunterliegende Prinzip: *Abhängigkeit soll nach unten zeigen, und Konsequenz soll auf die Ebene begrenzt bleiben, auf der sie entsteht.* Ein Ausfall auf der Geschäftsebene darf die Produktion nicht stoppen. Ein Ausfall auf der Leitebene darf Sichtbarkeit kosten, nicht Steuerung. Ein Ausfall auf der Steuerungsebene ist der einzige, der eine Maschine anhalten darf.

**Wirklich geändert hat sich**, dass moderne Datenflüsse nicht brav durch jede Ebene ziehen. Ein Zustandsüberwachungssensor veröffentlicht womöglich direkt an einen Analysedienst; ein Edge-Gerät steht physisch in einer Zelle und logisch im Unternehmensnetz. Diese Fälle in ein Leiterdiagramm zu zwingen erzeugt entweder eine Fiktion auf dem Papier oder eine Architektur, die Sprünge um ihrer selbst willen hinzufügt.

**Die tragfähige Synthese lautet: die Abhängigkeitsregel behalten, das Topologiedogma verwerfen.** Jeder Fluss, so direkt er sei, ist akzeptabel, wenn er drei Fragen beantwortet: Was geschieht mit der Produktion, wenn er ausfällt? Was kann er beeinflussen? Wem gehört er? Ein Fluss, der Ebenen überspringt, dabei aber nur aufwärts, nur lesend und nicht blockierend ist, ist oft sicherer als einer, der das Diagramm einhält und Befehle trägt.

## Aufwärts und abwärts sind nicht symmetrisch

Die nützlichste Unterscheidung der Konvergenzarchitektur ist die Richtung, denn beide Richtungen haben grundverschiedene Risikoprofile.

| | Aufwärts (Anlage → Unternehmen) | Abwärts (Unternehmen → Anlage) |
| --- | --- | --- |
| Typische Nutzlast | Prozesswerte, Ereignisse, Stückzahlen, Qualitätsdaten | Aufträge, Rezepte, Pläne, Sollwerte, Befehle |
| Folge einer Verfälschung | Falscher Bericht, falsche Auswertung | Falsches Anlagenverhalten |
| Folge einer Nichtverfügbarkeit | Verlust von Sichtbarkeit | Möglicher Produktionsverlust |
| Kann nur lesend ausgeführt werden | Ja | Definitionsgemäß nein |
| Kann gepuffert und nachgeliefert werden | Ja | Nur mit definiertem lokalem Rückfall |
| Gerechtfertigter Prüfaufwand | Angemessen | Erheblich, je Fluss |

**Die daraus folgende Regel: Aufwärtsdaten dürfen unter einem Broker-Muster verhältnismäßig frei fließen; Abwärtsflüsse sind Ausnahmen, die einzeln begründet, geprüft und mit definiertem Verhalten bei Verlust ausgestattet werden.**

Der größte Teil des Geschäftsnutzens, den man der Konvergenz zuschreibt — Sichtbarkeit, Analytik, Berichte, Zustandsüberwachung, Energiemanagement — ist rein aufwärts gerichtet. Das früh zu erkennen hält die riskante Kategorie klein genug, um sie ordentlich auszulegen.

## Die industrielle DMZ und das Broker-Muster

Die DMZ existiert, um einen Satz wahr zu machen: **kein Unternehmenssystem baut eine Verbindung in die Steuerungsumgebung auf.**

```text
Enterprise LAN
      |
   Firewall
      |
 Industrial DMZ   ──  data broker / replica historian / remote-access gateway
      |                        ^  (pull or push from OT side)
   OT Firewall                 |
      |                        |
 Supervisory zone  ── SCADA, authoritative historian
      |
 Control zone      ── controllers, I/O
```

Zwei Eigenschaften machen das wirksam, und beide werden in der Praxis häufig unterlaufen:

**Die Kopie liegt in der DMZ, das Original bleibt in der OT.** Der maßgebliche Historian steht innen; ein Replikat bedient Unternehmensanwender. Die Replikation ist einseitig und wird von der OT-Seite angestoßen. Ein Berichtswerkzeug, das den Anlagen-Historian direkt abfragt, hat die gesamte Struktur umgangen — und dass es nur liest, stellt sie nicht wieder her: Der Pfad existiert nun für alles, was ihn findet.

**Die DMZ ist eine Grenze, kein Abstellraum.** Jede zusätzlich dort betriebene Anwendung vergrößert die Fläche, der beide Seiten vertrauen müssen. Eine DMZ mit einem Broker, einem Replikat und einem kontrollierten Fernzugriffs-Gateway ist vertretbar; eine, die über fünf Jahre ein Dutzend Integrationsserver angesammelt hat, ist eine dritte Produktionsumgebung ohne Eigentümer.

**Eine nützliche Disziplin: Jede DMZ-Komponente sollte sich in einem Satz beschreiben lassen, der nennt, was sie enthält, wer hineinschreibt und wer daraus liest.** Was sich so nicht beschreiben lässt, ist nicht gut genug verstanden, um exponiert zu werden.

## MES-Anbindung: der legitime Abwärtsfall

Auftrags- und Rezeptdownload ist die Ausnahme, die ernsthaftes Engineering statt Vermeidung rechtfertigt. Sie ist echt abwärts gerichtet, echt wertvoll — und bringt die Abhängigkeit mit, auf die es am meisten ankommt.

Die Entwurfsfragen, die über ihre Sicherheit entscheiden:

- **Was tut die Anlage, wenn das MES nicht verfügbar ist?** Die Antwort muss ausdrücklich und getestet sein. Weiterfahren mit dem letzten bekannten Auftrag, Halten an einem definierten Punkt oder Fahren aus einem lokal gespeicherten Rezeptsatz sind alle vertretbar; die Antwort während eines Ausfalls herauszufinden ist es nicht.
- **Werden Daten auf Anlagenseite gepuffert?** Produktionsaufzeichnungen, die nicht gesendet werden können, sollten lokal auflaufen und bei Rückkehr der Verbindung übertragen werden — genau wie ein Historian-Collector es tut. Die Produktionsdaten einer Schicht wegen einer unterbrochenen Verbindung zu verlieren, ist ein vermeidbares Entwurfsergebnis.
- **Wird ein heruntergeladenes Rezept lokal validiert, bevor es wirkt?** Die Steuerung sollte keinen Wert außerhalb ihrer eigenen Auslegungsgrenzen akzeptieren, nur weil ein übergeordnetes System ihn geschickt hat. Die Bereichsprüfung am empfangenden Ende ist die letzte Verteidigung dagegen, dass ein Datenfehler oben zu einem Anlagenereignis unten wird.
- **Wer bestätigt den vollständigen Abschluss der Übertragung?** Ein teilweise übernommenes Rezept ist schlimmer als ein abgelehntes.

**Der allgemeine Grundsatz für jeden Abwärtsfluss: Die Anlage behält die Befugnis, abzulehnen.** Eine Steuerungsebene, die alles ausführt, was ankommt, hat ihre Sicherheits- und Qualitätsgrenzen an ein System übertragen, das einem anderen Verfügbarkeits- und Änderungsregime folgt.

## Der Abhängigkeitstest

Konvergenz verwandelt eine Anlage still von unabhängig in abhängig, und diese Umwandlung steht selten auf einer Zeichnung.

**Der Test ist einfach und gehört einmal gegen den Entwurf und einmal gegen die Installation gefahren:** *Die Unternehmensverbindung trennen — läuft die Produktion weiter?*

Dieselbe Frage je Dienst:

| Dienst | Bei Nichtverfügbarkeit soll die Produktion… |
| --- | --- |
| Unternehmensnetz | weiterlaufen |
| MES | in definiertem eingeschränktem Modus weiterlaufen |
| Zentraler Identitätsdienst | weiterlaufen — siehe unten |
| Zeitquelle | weiterlaufen, mit protokollierter Einschränkung |
| Cloud-Analytik | weiterlaufen |
| DMZ-Datenbroker | weiterlaufen; nur Sichtbarkeit geht verloren |
| Standort-Historian | weiterlaufen; die Erfassung puffert lokal |

**Jede Zeile, deren ehrliche Antwort „steht still“ lautet, beschreibt eine Abhängigkeit, die der Prozess vorher nicht hatte — sie gehört entweder entfernt oder mit derselben Verfügbarkeitstechnik ausgestattet wie der Prozess selbst.**

**Identität verdient besondere Aufmerksamkeit**, weil sie die am häufigsten unbemerkt entstehende Abhängigkeit ist. Bedienstationen, SCADA-Server oder Engineering-Rechner an ein zentrales Unternehmensverzeichnis anzubinden ist administrativ attraktiv und schafft einen Pfad, auf dem ein Verzeichnisausfall — oder ein Netzproblem zwischen Standorten — zur Unmöglichkeit wird, sich in einer Leitwarte anzumelden. Wo zentrale Identität genutzt wird, brauchen OT-kritische Systeme eine lokale Authentifizierung, die funktioniert, wenn das Verzeichnis es nicht tut — und sie gehört getestet, nicht angenommen.

## Patch- und Verantwortungsgrenzen

Die meiste IT/OT-Reibung ist nicht technisch. Sie besteht aus zwei Teams mit unvereinbar richtigem Verhalten, die an einer undefinierten Grenze aufeinandertreffen.

- **Das richtige Verhalten der IT** ist zügiges Patchen, Standardisierung und die Bewertung eines ungepatchten Systems als Risiko.
- **Das richtige Verhalten der OT** ist der Erhalt einer validierten Konfiguration, Änderung nur im Fenster und die Bewertung einer unvalidierten Änderung als Risiko.

Keines ist falsch. Der Fehler ist das **Asset, von dem beide Teams glauben, das jeweils andere kümmere sich darum** — verlässlich ein Windows-basierter Leitebenenserver in einem Schrank, den die IT erreichen kann.

Was das auflöst:

- **Ein Anlagenverzeichnis mit benanntem Eigentümer je System**, einschließlich: wer patcht, in welchem Fenster, und wer danach validiert.
- **Ein ausdrückliches Patch-Regime je Zone**, nicht je Organisation. Der Unternehmenstakt endet an der DMZ; OT-Systeme werden nach validiertem Plan gepatcht.
- **Ein gemeinsames Verständnis, dass „unbetreut“ kein Zustand ist**, sondern eine nicht dokumentierte Entscheidung. Jedes System in der Anlage hat entweder einen Eigentümer oder ist ein Befund.

> Das anlagenweite Sicherheitsprogramm — Asset-Inventar, Monitoring, Sicherung und Wiederherstellung, Zugangsdaten-Lebenszyklus — behandelt der Begleitbeitrag zur industriellen Cybersicherheit. Dieser Abschnitt betrifft nur die Grenze, an der zwei Betriebsmodelle aufeinandertreffen.

## Edge- und Cloud-Platzierung

Platzierungsentscheidungen werden einfach, sobald die Frage nach Konsequenz statt nach Fähigkeit gestellt wird.

**Eine Berechnung gehört an den Edge, wenn** die von ihr getragene Entscheidung einen Verbindungsausfall überstehen muss, wenn das Datenvolumen im Verhältnis zum gewonnenen Wert groß ist oder wenn Latenz das Ergebnis beeinflusst. Lokale Zustandsüberwachung, lokale Aggregation und lokale Pufferung passen naturgemäß hierher.

**Eine Berechnung gehört zentral oder in die Cloud, wenn** sie über Standorte hinweg aggregiert, Elastizität braucht oder Entscheidungen speist, für deren Zeithorizont ein Verbindungsausfall belanglos ist. Flottenvergleich, langfristige Zuverlässigkeitsanalyse und Unternehmensberichte gehören hierher.

**Zwei häufig unterschätzte Einschränkungen:**

**Ein Edge-Gerät ist eine neue Asset-Klasse innerhalb der OT-Zone.** Es hat Firmware, Zugangsdaten, Patch-Bedarf und einen Lebenszyklus — und es wird häufig von denjenigen beschafft, die die Analytik wollten, nicht vom Team, dem die Zone gehört. Eigentum, Patchregime und Netzplatzierung gehören vor der Inbetriebnahme geklärt, nicht danach.

**Cloud-Platzierung muss berücksichtigen, was den Standort gar nicht verlassen sollte.** Rezepte, Durchsatzzahlen, Qualitätsdaten und Prozessparameter können geschäftlich sensibel sein; wohin Daten fließen und zu welchen Bedingungen, ist eine Governance-Frage, die Ingenieurinnen und Ingenieure aufwerfen sollten, auch wenn sie sie nicht entscheiden.

## Governance, die die erste dringende Anfrage übersteht

Architektur erodiert Ausnahme für Ausnahme, und jede Erosion ist im Moment ihres Entstehens begründet.

Drei Artefakte leisten den größten Teil der Arbeit:

- **Ein Flussregister.** Jede Überschreitung der Unternehmens-/OT-Grenze: Quelle, Ziel, Richtung, Protokoll, Zweck, Eigentümer und Verhalten bei Verlust. Eine Grenze, deren Flüsse sich nicht auflisten lassen, ist nicht kontrolliert, was auch immer in der Firewall steht.
- **Ein Genehmigungsweg mit fachlicher Prüfung**, damit „wir brauchen das bis Freitag“ eine geprüfte Ausnahme erzeugt und keine ungeprüfte Regel.
- **Ein Überprüfungszyklus mit Entfernungsbefugnis.** Regeln sammeln sich an; nichts entfernt sie, wenn niemand dafür verantwortlich ist. Ein Fluss, dessen Eigentümer das Unternehmen verlassen hat und an dessen Zweck sich niemand erinnert, gehört geschlossen — und der einzige sichere Weg, solche zu finden, ist regelmäßiges Nachsehen.

**Sicherheitsfunktionen stehen außerhalb all dessen.** Nichts in einer Konvergenzarchitektur darf die Funktion einer Sicherheitseinrichtung oder ihre Fähigkeit, einen sicheren Zustand zu erreichen, jenseits einer konvergierten Verbindung platzieren. Diese Grenze ist keine Governance-Frage, sondern eine Entwurfsvorgabe.

## Fehlermodi

**Unternehmenssysteme greifen direkt in die OT.** Heute nur lesend, für immer ein Pfad.

**Eine DMZ, die Anwendungen angesammelt hat.** Eine dritte Produktionsumgebung ohne Eigentümer.

**MES-Abhängigkeit ohne definierten Notbetrieb.** Ein Unternehmensausfall wird zum Produktionsstopp.

**Keine lokale Pufferung der Produktionsdaten.** Ein Verbindungsausfall verliert die Daten einer Schicht endgültig.

**Heruntergeladene Werte ohne lokale Bereichsprüfung übernommen.** Ein Datenfehler oben wird zum Anlagenereignis.

**Zentrale Identität ohne lokalen Rückfall.** Ein Verzeichnisproblem sperrt Bediener aus der Leitwarte aus.

**Ein Asset, das jedes Team beim anderen vermutet.** Es wird von niemandem gepatcht — oder während der Produktion.

**Edge-Geräte ohne geklärtes Eigentum.** Firmware und Zugangsdaten altern in der OT-Zone ohne Verantwortliche.

**Ausnahmen ohne Ablaufdatum.** Die Grenze lässt jedes Jahr mehr zu, und über das Warum ist immer weniger bekannt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein petrochemischer Standort führt Auftrags- und Rezeptdownload aus einem Konzern-MES an seine Mischanlagen ein und ersetzt damit eine manuelle Eingabe. Die Integration ist gründlich: validiert, getestet, dokumentiert. Der Produktionsnutzen ist real — weniger Eingabefehler, bessere Rückverfolgbarkeit, schnellere Umstellungen.

Neun Monate später verursacht eine Konzern-Netzänderung eine längere Unterbrechung zwischen Standort und zentralem Rechenzentrum. Das MES ist mehrere Stunden nicht erreichbar.

Die Mischanlagen stehen still. Nicht wegen einer Störung und nicht, weil es jemand so wollte: Die Integration wurde unter der Annahme entworfen, dass das MES verfügbar ist, und der Pfad „kein Auftrag empfangen“ führt in einen Haltezustand. Ein lokaler Rezeptcache wurde nicht umgesetzt, weil das MES als maßgebliche Quelle galt und eine lokale Kopie als Risiko für die Datenintegrität erschien. Beide Entscheidungen waren für sich vertretbar.

Der nachträglich geprüfte Befund ist unangenehm: Die Produktionsfähigkeit der Anlage war an eine Konzern-WAN-Strecke übertragen worden, und niemand hatte das aufgeschrieben. Die ursprüngliche Risikobetrachtung deckte Datenintegrität und Cybersicherheit gründlich ab und enthielt keine Verfügbarkeitszeile für „MES nicht erreichbar“.

Die Abhilfe besteht nicht darin, die Integration aufzugeben. Sie besteht darin, einen eingeschränkten Betriebsmodus zu definieren und umzusetzen: ein lokal gehaltener Satz validierter Rezepte für die laufenden Produkte, ein ausdrücklich bedienerfreigegebener Weg, mit dem letzten bekannten Auftrag weiterzufahren, und lokale Pufferung der Produktionsaufzeichnungen zur späteren Übertragung. Damit ist die Abhängigkeit begrenzt — Sichtbarkeit und Rückverfolgbarkeit leiden während eines Ausfalls, die Produktion steht nicht still.

**Der übertragbare Punkt ist genau der, für den es den Abhängigkeitstest gibt: Eine Integration, die den Normalbetrieb verbessert, kann still einen neuen Weg schaffen, auf dem die Anlage stillsteht — und diese Möglichkeit gehört in die Entwurfsprüfung und nicht in den Störungsbericht.**

## Empfohlene Praxis

- Das Abhängigkeitsprinzip des Schichtenmodells behalten; das Topologiedogma verwerfen.
- Jeden Fluss als aufwärts oder abwärts klassifizieren und abwärts als begründungspflichtige Ausnahme behandeln.
- Sicherstellen, dass kein Unternehmenssystem eine Verbindung in die Steuerungsumgebung aufbaut; einen DMZ-Broker mit einseitiger Replikation von der OT-Seite verwenden.
- Den maßgeblichen Historian in der OT halten und Unternehmensanwender aus einem Replikat bedienen.
- Beschränken, was in der DMZ betrieben wird; jede Komponente in einem Satz beschreiben, der Inhalt, Schreiber und Leser nennt.
- Das Anlagenverhalten bei Nichtverfügbarkeit von MES, Identität, Zeitquelle und Cloud-Diensten definieren und testen.
- Produktionsaufzeichnungen lokal puffern und bei Rückkehr der Verbindung übertragen.
- Heruntergeladene Werte in der empfangenden Steuerung bereichsprüfen; die Anlage behält die Ablehnungsbefugnis.
- Für OT-kritische Systeme mit zentraler Identität eine lokale Authentifizierung als Rückfall vorsehen.
- Ein Anlagenverzeichnis mit benanntem Eigentümer und Patch-Regime je System führen; „unbetreut“ als Befund behandeln.
- Eigentum, Patchregime und Platzierung von Edge-Geräten vor der Inbetriebnahme klären.
- Ein Flussregister mit dokumentiertem Verhalten bei Verlust führen und mit Entfernungsbefugnis überprüfen.
- Sicherheitsfunktionen vollständig außerhalb konvergierter Abhängigkeiten halten.

## Fazit

Konvergenz ist keine Frage des Ob; dieser Streit ist entschieden, und der Nutzen ist real. Sie ist eine Frage der Bilanz — für jede Verbindung zu wissen, was an Sichtbarkeit gewonnen und was an Abhängigkeit erworben wurde.

Die Architektur, die trägt, ist unspektakulär: Daten fließen über einen Broker nach oben, Steuerung fließt nur dort nach unten, wo es begründet und begrenzt ist, die Anlage behält einen definierten Weg zu arbeiten, wenn alles über ihr nicht verfügbar ist, und jeder Fluss hat einen Eigentümer, der erklären könnte, warum es ihn gibt. Die Alternative ist kein gescheitertes Projekt. Sie ist eine Anlage, die hervorragend läuft — bis etwas in einem Rechenzentrum es nicht tut, und alle eine Abhängigkeit entdecken, die auf keiner Zeichnung stand.
