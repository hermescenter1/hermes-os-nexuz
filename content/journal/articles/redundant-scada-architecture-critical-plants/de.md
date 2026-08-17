# Redundante SCADA-Architekturen für kritische Anlagen

## Zusammenfassung

Redundanz wird meist als zu beschaffende Eigenschaft spezifiziert: Das System ist redundant, also ist es verfügbar. Diese Formulierung verdeckt das Engineering. Ein redundantes Paar beseitigt ein Fehlerbild — den Ausfall eines einzelnen Servers — und führt eine Reihe neuer ein, die ein Einzelsystem nicht haben kann: Uneinigkeit darüber, welcher Knoten primär ist, eine durch einen kurzen Aussetzer ausgelöste Umschaltung und ein Standby, der seit Monaten still defekt ist.

Dieser Beitrag handelt von diesen neuen Fehlerbildern und den Entwurfsentscheidungen, die sie eingrenzen.

## Warum das relevant ist

Die unbequeme Beobachtung zu redundanten Systemen: Ein nennenswerter Teil ihrer Ausfälle wird vom Redundanzmechanismus verursacht statt von ihm verhindert. Ein Einzelserver fällt auf eine Art aus. Ein Paar kann zusätzlich ausfallen, indem beide Knoten primär sein wollen, keiner es will, sie zwischen beiden pendeln oder auf ein Standby umgeschaltet wird, dessen Daten oder Projektierung abgedriftet sind.

Nichts davon spricht gegen Redundanz. Es spricht dafür, dass Redundanz ein Entwurf mit eigener Fehleranalyse ist und kein Häkchen — und dass die Frage „ist es redundant?" weit weniger nützlich ist als „was genau passiert, wenn der primäre Knoten stehenbleibt?"

> Der Redundanzumfang — welche Rollen überhaupt ein Paar rechtfertigen — wird im begleitenden Beitrag zur SCADA-Architektur behandelt. Dieser setzt die Entscheidung voraus und fragt, wie das Paar zu bauen ist, damit es sich richtig verhält.

## Active/Passive und Active/Active

| Eigenschaft | Active/Passive | Active/Active |
| --- | --- | --- |
| Datenkonsistenz | Einfacher: ein Schreiber zur Zeit | Schwieriger: gleichzeitige Schreiber brauchen Koordination |
| Sichtbarkeit der Umschaltung | Ein Übergang findet statt; Clients sehen ggf. eine Lücke | Kein Übergang für überlebende Clients |
| Standby-Erprobung | Standby ist untätig — Verfall unsichtbar | Beide Knoten sind fortlaufend erprobt |
| Kapazität | Die halbe Hardware trägt die Last | Last geteilt; ein Ausfall bedeutet reduzierte Kapazität |
| Fehlerfläche | Kleiner; weniger Koordinationspfade | Größer; Koordination ist selbst ein Fehlerbild |

Die klar zu benennende Abwägung: **Active/Passive ist einfacher zu durchdenken, verdeckt aber den Standby-Verfall, während Active/Active beide Knoten fortlaufend erprobt, dafür aber Koordination als neues Fehlerbild einführt.**

Das Problem des verdeckten Verfalls verdient Nachdruck. In einem Active/Passive-Paar tut der Standby monatelang nichts Beobachtbares. Sein Speicher kann voll, seine Lizenz abgelaufen, seine Projektierung veraltet, sein Netzpfad unterbrochen sein — und nichts davon wird sichtbar, bis er übernehmen soll. Deshalb zählt die periodische *geplante* Umschaltung mehr als jede Überwachung: Sie ist die einzige Prüfung, die den realen Pfad durchläuft.

**Kapazitätsehrlichkeit bei Active/Active:** Laufen beide Knoten routinemäßig hoch ausgelastet, ist der überlebende Knoten nach einem Ausfall überlastet, und die Architektur hat einen sauberen Ausfall gegen einen Ausfall mit reduzierter Leistung eingetauscht. Jeder Knoten muss die volle Last tragen können, sonst ist die Redundanz nur teilweise vorhanden und sollte so beschrieben werden.

## Heartbeat-Auslegung

Der Heartbeat ist die Art, wie jeder Knoten entscheidet, ob sein Partner lebt, und seine Auslegung bestimmt, ob sich das Paar bei Teilausfällen korrekt verhält.

**Pfadunabhängigkeit ist die maßgebliche Eigenschaft.** Läuft der Heartbeat über denselben physischen Pfad wie der Datenverkehr, sieht ein Netzausfall genauso aus wie ein Partnerausfall — und beide Knoten schließen, der andere sei tot, während beide leben und mit ihren eigenen Clients verbunden sind. Das ist Split-Brain, verursacht durch die Heartbeat-Auslegung und nicht durch das Netz.

Die Abhilfe sind redundante, unabhängige Heartbeat-Pfade: typischerweise eine Direktverbindung zwischen den Knoten zusätzlich zum Netzweg, sodass der Verlust des einen nicht den Partnertod impliziert.

**Das Zeitverhalten muss mit dem Wiederherstellungsverhalten des Netzes abgeglichen werden.** Nutzt das Anlagennetz ein Ringprotokoll mit einer Rekonfigurationszeit und ist die Heartbeat-Zeitüberschreitung kürzer als diese, löst jede Ringwiederherstellung eine SCADA-Umschaltung aus. Das Paar schaltet bei genau den Ereignissen um, die das Netz absorbieren sollte. Die Zeitüberschreitung muss die Worst-Case-Netzwiederherstellung mit Reserve übersteigen — was verlangt, diese Zahl zu kennen statt sie anzunehmen.

**Ein Schiedsmechanismus löst den mehrdeutigen Fall.** Erreicht ein Knoten seinen Partner nicht, kann er „Partner tot" nicht von „ich bin isoliert" unterscheiden. Eine dritte Referenz — ein Witness, ein Quorum-Gerät oder eine gemeinsame Ressource, die nur ein Knoten halten kann — macht aus einer unbeantwortbaren Frage eine entscheidbare. Ohne sie verlässt sich der Entwurf darauf, dass der Heartbeat nie irrt.

## Split-Brain

Split-Brain ist der Fehler, bei dem beide Knoten gleichzeitig als primär handeln. Die Folgen unterscheiden sich je Rolle, und dieser Unterschied bestimmt, wie viel Aufwand die Vermeidung verdient.

Für eine **rein lesende Leitfunktion** sind zwei aktive Primärknoten weitgehend harmlos: Zwei Server fragen dieselben Steuerungen ab, was doppelte Last erzeugt, aber keine widersprüchliche Handlung.

Für alles, was **schreibt** — Sollwerte, Befehle, Ablaufsteuerung —, sind zwei Primärknoten eine echte Gefahr, denn zwei unabhängige Leitsysteme können derselben Anlage widersprüchliche Anweisungen geben.

Für den **Historian** erzeugt Split-Brain zwei divergierende Archive, beide unvollständig, ohne maßgebliche Aufzeichnung des Zeitraums.

Die ingenieurtechnische Folge: **Der Schreibpfad verdient stärkeren Split-Brain-Schutz als der Lesepfad.** Wo ein Leitsystem Kommandohoheit hat, lohnt ein ausdrücklicher Exklusivbesitz-Mechanismus — nur der Knoten mit dem Token darf schreiben — seine Komplexität. Wo nur gelesen wird, ist eine einfachere Lösung vertretbar.

## Client- und Steuerungs-Failover

Redundanz am Server nützt nichts, wenn die Clients nicht folgen.

**Bedienplätze müssen ohne Bedienhandlung umschalten.** Ein Client, der voraussetzt, dass jemand etwas bemerkt, versteht und manuell neu verbindet, hat die Wiederherstellungszeit von Millisekunden auf die Dauer verschoben, bis jemand merkt, dass etwas nicht stimmt — im Ereignisfall womöglich lange.

Drei spezifizierenswerte Eigenschaften:

- **Die Erkennungszeit des Clients**, getrennt von der Umschaltzeit des Servers. Die Gesamtwiederherstellung ist die Summe, nicht der größere Wert.
- **Was die Anzeige während der Lücke tut.** Werte müssen als veraltet oder nicht verfügbar erscheinen, nicht auf dem letzten Wert einfrieren. Eine eingefrorene Anzeige während einer Umschaltung ist von einem stabilen Prozess nicht unterscheidbar.
- **Ob der Bedienkontext erhalten bleibt.** Der Verlust des aktuellen Bildes, des Trendfensters und einer halb eingegebenen Eingabe macht aus einer technischen Umschaltung eine betriebliche Störung.

**Das steuerungsseitige Failover** trägt eine Randbedingung, die Projekte überrascht: Jeder Leitebenenknoten verbraucht Kommunikationsressourcen der Steuerung, und ein redundantes Paar kann sie gleichzeitig von beiden Knoten verbrauchen. War die Verbindungskapazität für einen Leitebenenverbraucher ausgelegt, erschöpft das Paar sie — und das Symptom erscheint als sporadischer Kommunikationsfehler, nicht als Redundanzproblem.

## Synchronisation und Divergenz

Der Standby ist nur nützlich, wenn sein Zustand dem des primären Knotens nahe genug ist, um sinnvoll zu übernehmen. Drei Kategorien driften unterschiedlich:

**Projektierung** — Bilder, Tag-Datenbank, Alarmeinstellungen. Divergenz hier ist die schädlichste und die unsichtbarste: Ein Standby mit vorjähriger Projektierung übernimmt und stellt eine Anlage dar, die es nicht mehr gibt. Projektierung gehört über einen Mechanismus auf beide Knoten ausgebracht, und Gleichheit gehört geprüft statt angenommen.

**Echtzeitzustand** — aktuelle Werte, Alarmzustände, Quittierstatus. Ein gewisser Verlust ist meist hinnehmbar; entscheidend ist, dass das Verhalten definiert ist. Überstehen unquittierte Alarme keine Umschaltung, erhält das Bedienpersonal bereits bearbeitete Alarme erneut — verkraftbar, aber es muss bekannt sein.

**Historische Daten** — über Store-and-Forward im Collector abgedeckt, nicht über Serverpaarung; siehe den Historian-Beitrag.

Die praktische Prüfung: **Lässt sich jetzt zeigen, dass die Projektierung des Standby der des primären Knotens entspricht, ohne manuellen Vergleich?** Wenn nein, trägt das Paar ein unverfolgtes Divergenzrisiko, wie gesund sein Heartbeat auch aussieht.

## Wiederherstellungsziele

Wo Wiederherstellungsziele verwendet werden, verdienen zwei präzise Formulierung, weil sie häufig vermengt werden:

- **Wiederherstellungszeit** — wie lange, bis die Leitfunktion wieder da ist. Für ein SCADA-Paar: Umschaltzeit plus Client-Wiederverbindungszeit.
- **Wiederherstellungspunkt** — wie viel Daten verloren gehen dürfen. Für Leitebenendaten meist durch den Collector-Puffer begrenzt, nicht durch das Serverpaar.

Die ehrliche Einordnung für eine Leitebene: **Keines der beiden Ziele beschreibt Anlagensicherheit**, denn die Steuerung bleibt durchgehend in den SPSen. Sie beschreiben, wie lange die Anlage ohne Sicht läuft und wie viel Historie fehlt — beides reale Kosten, aber nicht dieselbe Kategorie wie ein Ausfall der Steuerungsebene.

## Instandhaltung unter Redundanz

Ein echter Vorteil von Redundanz ist, einen Knoten zu patchen, zu aktualisieren oder neu zu starten, während der andere die Last trägt. Das setzt zwei Disziplinen voraus:

**Ein definiertes Verfahren mit Prüfschritt in jeder Phase** — Standby herausnehmen, bearbeiten, prüfen, zurücknehmen, bewusst umschalten, prüfen, dann den anderen Knoten bearbeiten. Wird die bewusste Umschaltung übersprungen, hat der aktualisierte Knoten bis zum Ernstfall nie Last getragen.

**Bewusstsein für Versionsversatz.** Zwei Knoten während eines Aktualisierungsfensters auf verschiedenen Ständen zu betreiben ist normal; sie unbefristet so zu betreiben, weil die zweite Aktualisierung verschoben wurde, ist ein still wachsendes Divergenzrisiko.

## Fehlerbilder

**Split-Brain durch gemeinsamen Heartbeat-Pfad.** Netzfehler wird als Partnertod gelesen; beide Knoten werden primär.

**Umschaltung auf einen Aussetzer.** Heartbeat-Zeitüberschreitung kürzer als die Netzwiederherstellung; das Paar schaltet bei jeder Ringrekonfiguration um.

**Verfallener Standby.** Volle Platte, abgelaufene Lizenz, veraltete Projektierung oder unterbrochener Netzpfad — entdeckt im Moment des Bedarfs.

**Clients, die nicht folgen.** Die Serverumschaltung gelingt in Millisekunden; die Bedienplätze verbinden sich in Minuten von Hand.

**Eingefrorene Anzeigen während der Umschaltung.** Werte halten ihren letzten Stand; ein stabiler Prozess ist nicht von einem getrennten zu unterscheiden.

**Erschöpfte Steuerungsverbindungen.** Beide Knoten verbinden sich; Kapazität für einen ausgelegt; sporadische Fehler werden dem Netz angelastet.

**Flapping.** Wiederholte Umschaltung zwischen den Knoten, weil die Auslösebedingung grenzwertig ist und keine Dämpfung existiert.

## Ein repräsentatives Szenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Das redundante SCADA-Paar eines Wasserversorgers schaltet etwa zweimal monatlich um. Jedes Ereignis ist kurz, das Bedienpersonal bemerkt es kaum, und das Paar erholt sich sauber — es wird als „Redundanz funktioniert wie vorgesehen" vermerkt.

Die Belege sagen etwas anderes. Die Umschaltungen korrelieren mit Netzereignissen auf dem Anlagenring, der nach Leitungsstörungen durch laufende Tiefbauarbeiten rekonfiguriert. Der Heartbeat läuft über denselben Ring, und seine Zeitüberschreitung ist kürzer als dessen Rekonfigurationszeit.

Jede Ringwiederherstellung — ein Ereignis, das das Netz transparent absorbieren soll — wird vom SCADA-Paar als Partnertod gedeutet. Das Paar zeigt keine Robustheit; es erzeugt vermeidbare Übergänge, jeder eine kleine betriebliche Störung und jeder eine Gelegenheit für ein schlechteres Ergebnis, falls er mit einem echten Fehler zusammenfällt.

Die Abhilfe ist kein besserer Ring. Es ist ein unabhängiger Heartbeat-Pfad und eine aus der gemessenen Worst-Case-Netzwiederherstellung abgeleitete Zeitüberschreitung — eine Projektierungsentscheidung, keine Hardwarefrage.

## Prüfung

Die wertvollste Praxis im Redundanz-Engineering ist zugleich die am seltensten ausgeführte: **planmäßig, unter kontrollierten Bedingungen bewusst umschalten und protokollieren, was geschah.**

Was eine aussagekräftige Prüfung abdeckt:

- Umschaltung unter Last, nicht auf einem ruhigen System.
- Clientverhalten währenddessen und danach — einschließlich, ob Anzeigen veraltete Daten zeigten statt einzufrieren.
- Fähigkeit des Standby, die volle Last zu tragen, nicht bloß zu starten.
- Projektierungsgleichheit, vorher und nachher geprüft.
- Die Gegenrichtung, denn das Zurückschalten ist ein eigener, oft weniger geübter Pfad.
- Wiedereingliederung des ausgefallenen Knotens als Standby, ohne den neuen primären zu stören.

Ein Paar, dessen Umschaltung seit der Inbetriebnahme nicht geübt wurde, hat genau im entscheidenden Moment einen ungeprüften Wiederherstellungspfad. Das ist keine Redundanz, sondern deren Erwartung.

## Empfohlene Vorgehensweise

- Active/Passive gegen Active/Active nach Datenkonsistenz und Kapazität entscheiden und benennen, welche Fehlerbilder jede Variante mitbringt.
- Dem Heartbeat mindestens einen vom Datennetz unabhängigen Pfad geben.
- Die Heartbeat-Zeitüberschreitung mit Reserve über die gemessene Worst-Case-Netzwiederherstellung legen.
- Einen Schiedsmechanismus vorsehen, damit ein isolierter Knoten den Partner nicht für tot hält.
- Den Schreibpfad stärker gegen Split-Brain schützen als den Lesepfad.
- Die Erkennungszeit der Clients spezifizieren und verlangen, dass Anzeigen Veraltung zeigen statt einzufrieren.
- Beide Knoten gegen die Kommunikationskapazität der Steuerung zählen.
- Projektierung über einen Mechanismus auf beide Knoten ausbringen und Gleichheit maschinell prüfen.
- Planmäßig, unter Last und in beiden Richtungen bewusst umschalten und Ergebnisse dokumentieren.

## Fazit

Redundanz ist nicht Verfügbarkeit. Sie ist ein Tausch: ein Fehlerbild weniger, mehrere neue dazu — und nur dann ein Nettogewinn, wenn die neuen konstruktiv eingegrenzt sind.

Diese Eingrenzung ist unspektakulär: ein unabhängiger Heartbeat-Pfad, eine aus Messung abgeleitete Zeitüberschreitung, ein Schiedsmechanismus, über einen Mechanismus ausgebrachte Projektierung und eine Umschaltung, die oft genug geübt wird, um eine Fähigkeit statt einer Überzeugung zu sein. Ein Paar mit diesen Eigenschaften verbessert die Verfügbarkeit tatsächlich. Eines ohne sie hat einem System, das zuvor nur auf eine Art ausfiel, Koordinationskomplexität hinzugefügt.
