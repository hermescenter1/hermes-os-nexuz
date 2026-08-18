# S7-1500: Architektur und Engineering-Praxis

## Zusammenfassung

Die S7-1500 wird häufig so projektiert, als wäre sie eine schnellere S7-300. Das ist sie nicht. Optimierter Bausteinzugriff, symbolische Adressierung, ein anderes Speichermodell, ein erweiterter Satz von Prioritätsklassen und ein integrierter OPC-UA-Server verändern, was gutes Engineering auf dieser Plattform bedeutet — und mehrere Gewohnheiten, die in der Vorgängergeneration richtig waren, schaden hier aktiv.

Dieser Beitrag behandelt die Architekturentscheidungen, die zu Beginn eines S7-1500-Projekts tatsächlich anstehen, und was jede kostet, wenn sie nicht bewusst, sondern per Voreinstellung getroffen wird.

## Warum das relevant ist

Migrierte Projekte schleppen typischerweise ein bestimmtes Muster mit: absolute Adressierung, nicht optimierte Datenbausteine, alles im OB 1 und eine Diagnose, die auf das beschränkt ist, was der Anwendungsprogrammierer selbst gebaut hat. Das läuft. Es verschenkt aber das meiste von dem, was die Plattform bietet — die integrierte Diagnose, die einen Fehler in Sekunden eingegrenzt hätte, die symbolische Ebene, die einen Hardwaretausch überstanden hätte, und den Speicherschutz, der einen Bereichsüberlauf zur Übersetzungszeit statt um drei Uhr morgens gefunden hätte.

Die Kosten sind bei der Inbetriebnahme unsichtbar. Sichtbar werden sie drei Jahre später, wenn jemand einen sporadischen Fehler in einem Programm suchen muss, das nichts über sich selbst mitteilen kann.

## Optimierter versus Standard-Bausteinzugriff

Das ist die erste und folgenreichste Entscheidung, und sie fällt je Baustein.

**Standardzugriff (nicht optimiert)** legt Daten auf feste Byte-Offsets, genau wie bei der S7-300. Jedes Element hat eine absolute Adresse, und Code kann sie darüber erreichen.

**Optimierter Zugriff** überlässt der Steuerung die Anordnung des Bausteininhalts; Elemente sind ausschließlich symbolisch erreichbar.

Die praktischen Folgen:

| Eigenschaft | Standardzugriff | Optimierter Zugriff |
| --- | --- | --- |
| Elementadressierung | Absoluter Offset oder Symbol | Nur Symbol |
| Speicherlayout | Fest, auf Bytegrenzen aufgefüllt | Von der Steuerung gewählt, gepackt |
| Wirkung eines eingefügten Elements | Nachfolgende Offsets verschieben sich | Keine Wirkung auf andere Elemente |
| Zugriffsleistung | Auf dieser Plattform langsamer | Schneller |
| Typsicherheit zur Übersetzungszeit | Schwächer | Stärker |

Die Migrationsfalle steht in der dritten Zeile. In einem Standardbaustein verschiebt eine in der Mitte eingefügte Variable die Offsets aller nachfolgenden. Jeder Code — jedes HMI-Tag, jedes Fremdsystem —, der diese Elemente absolut adressiert hat, liest nun stillschweigend falsche Daten, ohne jede Fehlermeldung. Optimierte Bausteine machen diesen Fehler unmöglich.

Die Engineering-Regel lautet: **optimierten Zugriff verwenden, sofern nicht etwas Externes wirklich ein festes Byte-Layout benötigt.** Die berechtigten Ausnahmen existieren, sind aber eng — bestimmte Kommunikationsmechanismen, die einen Baustein als rohe Bytefolge übertragen, und einige Fremdsysteme, die über Offsets adressieren. Diese Ausnahmen gehören identifiziert, dokumentiert und auf wenige, deutlich gekennzeichnete Schnittstellenbausteine begrenzt — sie dürfen nicht die Konvention des Gesamtprojekts bestimmen.

## Symbolische Adressierung ist nicht kosmetisch

Auf dieser Plattform sind Symbole der primäre Adressierungsmechanismus, nicht eine Anzeigebequemlichkeit. Code gegen `Conveyor_03.Drive.RunFeedback` bleibt korrekt, wenn sich die Hardwarekonfiguration ändert und die zugrundeliegende E/A-Adresse wandert. Code gegen `E 12.3` bleibt es nicht.

Das zählt genau bei den Ereignissen, bei denen Fehler teuer sind: eine Baugruppe im Rack ergänzen, eine dezentrale Peripheriestation tauschen, eine Steckplatznummerierung ändern. In einem symbolischen Projekt sind das Konfigurationsänderungen. In einem absolut adressierten Projekt sind es Code-Reviews von allem, was den betroffenen Adressbereich berührt hat.

## Das Speichermodell

Drei Bereiche verhalten sich unterschiedlich und werden regelmäßig verwechselt:

- **Arbeitsspeicher** hält das laufende Programm und die genutzten Datenbausteine. Er ist in den meisten Projekten die knappe Ressource und das, worauf sich die genannte Speichergröße der CPU bezieht.
- **Ladespeicher** — die Memory Card — hält das vollständige Projekt einschließlich alles zur Laufzeit nicht Benötigten. Er ist groß und selten die Grenze.
- **Remanenter Speicher** übersteht einen Spannungsausfall und ist eine echt knappe Ressource mit harter, CPU-spezifischer Obergrenze.

Bei der Remanenz geraten Projekte in Schwierigkeiten, denn in optimierten Bausteinen wird Remanenz **je Variable** eingestellt, nicht je Baustein. Diese Granularität ist eine echte Verbesserung — sie bedeutet aber, dass es die Voreinstellung „Baustein remanent setzen" nicht mehr gibt, und wer sie voraussetzt, bekommt Produktionszähler und Rezepturdaten, die beim nächsten Spannungsausfall stillschweigend zurückgesetzt werden.

Die Disziplin: Remanenz je Variable bewusst entscheiden und die Begründung dokumentieren. Zwei Kategorien brauchen sie wirklich — kumulierte Produktionsdaten, die nicht rekonstruierbar sind, und Zustände, die bestimmen, was eine Sequenz nach einem Wiederanlauf tut. Fast nichts sonst. Alles remanent zu setzen ist keine Vorsicht; es erschöpft eine hart begrenzte Ressource und erschwert das Auffinden der wirklich kritischen Werte.

## Organisationsbausteine und Prioritätsklassen

Die Steuerung führt mehrere Programmklassen aus, die sich nach Priorität gegenseitig unterbrechen. Die wichtigsten aus Sicht des Anwendungsengineerings:

```text
Anlauf-OB           laeuft einmal beim Uebergang nach RUN
Zyklisches Programm der Hauptzyklus, niedrigste Prioritaet
Weckalarm-OB        feste Zeitbasis, hoehere Prioritaet
Prozessalarm-OB     durch ein projektiertes Ereignis ausgeloest
Zeitfehler-OB       Zyklus hat seine Ueberwachungszeit ueberschritten
Diagnosealarm-OB    Baugruppen- oder Kanalfehler gemeldet
```

Zwei Engineering-Punkte wiegen schwerer als die Liste selbst.

**Erstens: Ein schneller Weckalarm ist nicht kostenlos.** Logik in einem 10-ms-Weckalarm läuft hundertmal pro Sekunde und unterbricht dafür das Hauptprogramm. Alles dort abzulegen, was diese Rate nicht wirklich braucht — der übliche Kandidat ist eine ganze Anlagensequenz statt der einen Regelkreisberechnung, die Determinismus benötigte —, verbraucht CPU-Leistung, die dem Hauptzyklus dann fehlt.

**Zweitens: Die Fehler-OBs sind nicht optional.** Fehlt ein Diagnosealarm-OB im Programm, lautet das Verhalten der Steuerung in dieser Fehlerklasse nicht „protokollieren und weiterlaufen". Die Konsequenzen eines fehlenden Fehler-OBs sind eine dokumentierte Eigenschaft der Plattform, und die Annahme eines gutartigen Standardverhaltens ist der Weg, auf dem ein gewöhnlicher Baugruppenfehler zum Steuerungsstopp wird. Jedes Projekt sollte die einschlägigen Fehler-OBs enthalten, selbst wenn ihr einziger Inhalt darin besteht, das Ereignis zu erfassen und einen Status zu setzen, den das HMI anzeigen kann.

## Integrierte Diagnose

Das ist die am häufigsten ungenutzte Fähigkeit der Plattform. Steuerung und Baugruppen erzeugen strukturierte Diagnoseinformationen — Baugruppen- und Kanalstatus sowie einen Diagnosepuffer mit Zeitstempeln —, die ohne jedes Zutun des Anwendungsprogrammierers verfügbar sind.

Die Ingenieursaufgabe ist nicht, das nachzubauen, sondern es **sichtbar zu machen**:

- Den Diagnosepuffer aus der Bedien- oder Instandhaltungsoberfläche lesbar machen, nicht nur vom Engineering-Laptop, für den jemand zur Anlage fahren muss.
- Jedes Gerät und jede Baugruppe an ihre Hardwarekennung binden und diesen Status dort lesen, wo die Prozesswerte verwendet werden. Die Plattform veröffentlicht ihn bereits; was in den meisten Projekten fehlt, ist der Schritt, ihn zu einem Gültigkeitsmerkmal am Wert zu machen, damit ein eingefrorener oder ersetzter Eingang als ungültig markiert und nicht als Messwert verbraucht wird.
- Jedem Anlagenobjekt ein Statuswort geben, das „läuft nicht, weil nicht angefordert", „läuft nicht, weil eine Freigabe fehlt" und „läuft nicht, weil gestört" unterscheidet. Diese drei sind aus einem einzelnen Bit nicht unterscheidbar, und sie auseinanderzuhalten ist der Großteil dessen, was eine Instandhaltungsfachkraft braucht.

## Der integrierte OPC-UA-Server

Die Steuerung kann unmittelbar als OPC-UA-Server arbeiten, was ein Gateway aus der Architektur entfernt. Vier Überlegungen:

**Eine Schnittstelle veröffentlichen, nicht das Programm.** Verlockend ist, ganze Datenbausteine freizugeben, weil es einfach ist. Die Folge: Interne Programmstruktur wird zum externen Vertrag, und jede Umstrukturierung bricht ein SCADA-System. Wenige Bausteine definieren, deren Zweck die externe Schnittstelle ist, diese veröffentlichen und alles Übrige privat halten.

**Lesen und Schreiben bewusst trennen.** Schreibzugriff einer Leitebene in eine Steuerung ist ein Steuerungspfad und verdient die entsprechende Prüfung. Sollwertverstellung ist oft legitim; Kommandohoheit meist nicht.

**Die Serverkapazität ist endlich.** Die Zahl der Sitzungen, Abonnements und überwachten Elemente, die eine CPU bedienen kann, ist begrenzt und je Typ spezifiziert. Eine Architektur, die unbegrenzte Clients unterstellt, entdeckt die Grenze unter Last.

**Sicherheit ist Projektierung, keine Voreinstellung.** Endpoint-Sicherheitsrichtlinie, Zertifikatsbehandlung und Benutzerauthentifizierung sind Entscheidungen. Ein Server, der auf einem anonymen, unverschlüsselten Endpoint verbleibt, weil das während der Inbetriebnahme am schnellsten zu einer Verbindung führte, ist ein wartender Prüfbefund — und das Zone-and-Conduit-Denken der IEC 62443 greift hier unmittelbar: Dieser Server ist ein Conduit aus der Steuerungszone heraus.

## Fehlerbilder

**Absolute Adressierung überlebt einen Hardwaretausch.** Eine Baugruppe wird durch einen anderen Typ ersetzt, Adressen verschieben sich, und Code, der rohe E/A adressiert, liest nun ein Nachbarsignal. Es wird kein Fehler gemeldet, denn aus Sicht der Steuerung ist nichts falsch.

**Eine Zykluszeitüberschreitung, die niemand kommen sah.** Logik wächst über aufeinanderfolgende Projekte; die Zyklusüberwachungszeit wurde nie neu betrachtet. Das erste Symptom ist ein Zeitfehler, und die Ursache verteilt sich dann über drei Jahre Ergänzungen.

**Remanenz angenommen statt projektiert.** Produktionszähler werden beim Spannungsausfall zurückgesetzt. Die Daten sind nicht wiederherstellbar, und der Mangel bestand seit der Inbetriebnahme.

**Eine dezentrale Station fällt aus, und die Logik merkt es nicht.** Eingänge frieren ein oder fallen je nach Parametrierung auf null, und eine Sequenz läuft mit Werten weiter, die keine Messwerte mehr sind. Das gefährlichste verbreitete Fehlerbild verteilter Peripherie — und das am günstigsten zu verhindernde.

## Diagnose: ein durchgerechnetes Beispiel

*Das Folgende ist ein illustratives ingenieurtechnisches Szenario.*

**Symptom:** Ein Antrieb läuft gelegentlich nicht an. Das Bedienpersonal meldet es als sporadisch; es lässt sich nicht auf Anforderung reproduzieren.

**Zu erhebende Belege, jeweils mit Zeitstempel:**

- der Diagnosepuffer der Steuerung um jedes Ereignis herum
- der Zustand des Startbefehls im Programm
- die Laufrückmeldung des Antriebs
- Stations- und Kanalstatus der Baugruppe, die die Rückmeldung führt
- die Portstatistik des Netzwerks für diese Station
- was sonst in der Anlage im selben Moment anlief

**Schlussfolgerung:** War der Befehl TRUE und die Rückmeldung folgte nie, liegt der Fehler hinter dem Befehl. Zeigte der Stationsstatus einen kurzen Ausfall zeitgleich mit jedem Ereignis, ist der Kommunikationspfad die Ursache, nicht der Antrieb. Zeigt die Portstatistik vor jedem Ereignis steigende Fehlerzähler am selben Port, ist der Fehler physikalisch — ein Stecker oder eine Leitung — und ein Antriebstausch hätte nichts verändert.

Das funktioniert, weil die Plattform all das bereits aufgezeichnet hatte. Den Unterschied machte das Sichtbarmachen von Stationsstatus und Puffer, nicht das Schreiben cleveren Diagnosecodes.

## Häufige Engineering-Fehler

- **S7-300-Gewohnheiten unverändert übernehmen** — absolute Adressierung, überall nicht optimierte Bausteine, alle Logik im zyklischen Programm.
- **Interne Datenbausteine über OPC UA veröffentlichen** und damit Programminterna zum externen Vertrag machen.
- **Fehler-OBs weglassen** und ein gutartiges Standardverhalten unterstellen, das die Plattform nicht zusagt.
- **Alles remanent setzen** und damit eine hart begrenzte Ressource erschöpfen.
- **Den Weckalarm als allgemeine „schnelle" Task verwenden** statt für die Logik, die Determinismus wirklich braucht.
- **Mit hoher CPU-Last übergeben**, ohne Reserve für die Diagnose und Behelfslogik, die die Inbetriebnahme selbst benötigt.

## Sicherheitstechnische Hinweise

Sicherheitsgerichtete Logik gehört in eine F-CPU-Domäne und wird nach den für die Anlage geltenden Normen zur funktionalen Sicherheit projektiert — IEC 61508 als generische Grundlage, IEC 61511 in der Prozessindustrie und die Maschinensicherheitsnormen im Maschinenbau. Der architektonische Punkt ist der Umfang: Die Integrität einer Sicherheitsfunktion ist eine Eigenschaft ihrer gesamten Kette; wird sie über ein Netz verteilt, wird dieses Netz Teil des zu Bewertenden.

Standard- und Sicherheitsprogramm sind auf dieser Plattform konstruktiv getrennt, und diese Trennung ist keine Formalie — sie ist die Unabhängigkeit, auf der die Risikominderung beruht. Die hier beschriebenen Engineering-Handlungen tragen ihre eigene Gefährdung: Ein Download, ein Betriebsartwechsel oder ein gesetzter Force wirkt auf eine möglicherweise laufende Anlage, unterliegt also dem Änderungs- und Freigaberegime des Standorts und nicht der Bequemlichkeit der Engineering-Sitzung.

## Empfohlene Vorgehensweise

- Standardmäßig optimierten Bausteinzugriff verwenden; Standardzugriff auf dokumentierte Schnittstellenbausteine begrenzen.
- Durchgängig symbolisch adressieren; absolute E/A-Adressierung als begründungspflichtige Ausnahme behandeln.
- Remanenz je Variable bewusst festlegen und die Begründung dokumentieren.
- Die einschlägigen Fehler-OBs in jedem Projekt vorsehen.
- Geräte- und Modulstatus an die Hardwarekennung binden und damit die Gültigkeit genau der Prozesswerte kennzeichnen, zu denen er gehört.
- Den Diagnosepuffer über die Bedienoberfläche zugänglich machen, damit seine Einträge auch ohne Engineering-Laptop vor Ort erhalten bleiben.
- Weckalarme für Logik reservieren, die eine feste Zeitbasis wirklich braucht.
- Eine bewusst entworfene OPC-UA-Schnittstelle veröffentlichen und Endpoint-Sicherheit explizit projektieren.
- Die Zykluszeit unter realistischer Last messen und echte Reserve belassen.

## Fazit

Der Unterschied zwischen einem S7-1500-Projekt, das gut altert, und einem, das unwartbar wird, liegt nicht in der Qualität der einzelnen Netzwerke oder Routinen. Er liegt in einer Handvoll Architekturentscheidungen zu Projektbeginn: symbolisch und optimiert als Standard, Remanenz gewählt statt unterstellt, Fehlerbehandlung vorhanden statt erhofft, Diagnose sichtbar gemacht statt nachgebaut, und eine externe Schnittstelle, die entworfen und nicht bloß freigegeben wurde.

Keine dieser Entscheidungen ist zu Projektbeginn teuer. Alle sind teuer nachzurüsten — und die Mechanismen liefert die Plattform bereits. Das Engineering besteht darin, sie zu nutzen.
