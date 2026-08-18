# Sichere PLC-SCADA-Kommunikation entwerfen

## Zusammenfassung

Die Verbindung zwischen einer Steuerung und ihrem Leitsystem wird üblicherweise als Linie im Netzplan gezeichnet und wie ein Kabel behandelt. Sie ist kein Kabel. Sie ist ein Pfad, über den Befehle Anlagenteile erreichen können, die sich bewegen, erhitzen, unter Druck stehen und rotieren — und die ingenieurtechnische Frage lautet nicht, ob die Verbindung verschlüsselt ist, sondern wer sie benutzen darf, in welcher Richtung, mit welcher Befugnis und was geschieht, wenn diese Annahme nicht mehr trägt.

Dieser Beitrag behandelt den defensiven Entwurf genau dieses Pfades. Er behandelt keine offensiven Techniken und stuft Verschlüsselung bewusst als eine Maßnahme unter mehreren ein, nicht als die Antwort.

## Warum das zählt

Die meisten heute im Einsatz befindlichen Steuerungsprotokolle wurden unter einer Annahme entworfen, die nicht mehr gilt: dass alles, was die Steuerung erreichen kann, auch befugt ist, ihr Anweisungen zu geben. Auf einem isolierten Bus war das vernünftig. In einem gerouteten Netz, das von einem Business-System, einer Fernwartungsverbindung oder dem Notebook eines Dienstleisters aus erreichbar ist, ist es ein Entwurfsfehler, den das Protokoll nicht beheben kann.

Die Folge: **für einen großen Teil des Anlagenbestands ist die Sicherheit des Pfades von der Steuerung zum Leitsystem eine Architekturfrage und keine Protokollfrage.** Wo das Protokoll Authentifizierung bietet, sollte sie genutzt werden. Wo nicht — und das ist häufig der Fall — tragen Netz, Firewall-Regelwerk und Zugriffsprozedur die gesamte Last und müssen entsprechend entworfen werden.

## Zonen, Conduits und Verbindungsrichtung

Das Zonen-und-Conduit-Modell aus IEC 62443 ist hier nicht als Compliance-Übung nützlich, sondern weil es zwei Fragen erzwingt, die sonst ungestellt bleiben: *was liegt innerhalb dieser Grenze* und *was genau darf sie überschreiten*.

Eine tragfähige Zonenstruktur für eine typische Anlage:

```text
Unternehmenszone     Business-Systeme, Reporting, ERP
        |
      Conduit  (Aufbau von der DMZ-Seite; das Unternehmensnetz erreicht OT nie)
        |
Industrielle DMZ     Datenbroker, aggregierender Server, Fernzugriffs-Gateway
        |
      Conduit  (streng aufgezählt: benannte Hosts, benannte Ports, eine Richtung)
        |
Leitebenenzone       SCADA-Server, Historian-Collector, Engineering-Station
        |
      Conduit  (nur Steuerungsprotokoll, von der Leitebene zur Steuerung)
        |
Steuerungszone       SPS, dezentrale Peripherie, Sicherheitssteuerungen
```

**Die Richtung des Verbindungsaufbaus ist die wertvollste Entwurfsentscheidung dieser Liste.** Eine Regel, die dem Leitsystemserver erlaubt, eine Verbindung *zur* Steuerung aufzubauen, unterscheidet sich grundlegend von einer Regel, die der Steuerung — oder irgendetwas anderem — erlaubt, eine Verbindung *aus* der Steuerungszone heraus aufzubauen. Daten können nach oben fließen, während Verbindungen ausschließlich nach unten oder von der DMZ nach innen aufgebaut werden; diese Asymmetrie beseitigt eine ganze Klasse von Exposition, ohne ein einziges Protokoll anzufassen.

Daraus folgt: **das Unternehmensnetz sollte die Steuerungszone nie direkt erreichen, auch nicht lesend.** Eine Reporting-Abfrage, die aus dem Büronetz bis in eine SPS läuft, hat einen Pfad geschaffen, der für diese Abfrage existiert — und für alles andere, das ihn findet. Der aggregierende Server in der DMZ existiert genau deshalb, damit dieser Pfad nicht nötig ist.

## Protokollwahl und die Realität der Altprotokolle

Protokolle fallen praktisch in drei Kategorien, und die Architektur unterscheidet sich je Kategorie.

| Kategorie | Beispiele | Sicherheitslage | Architektonische Antwort |
| --- | --- | --- | --- |
| Sicherheitsfähig | Protokolle mit eingebauter Authentifizierung und Verschlüsselung | Können eigenes Vertrauen tragen | Sicherheit aktivieren und betreiben; prüfen, dass sie wirklich aktiv ist |
| Zugriffsgeschützt | Protokolle mit Schutzstufen oder Passwortebenen in der Steuerung | Teilweise; schützt Konfiguration mehr als Daten | Jede angebotene Stufe nutzen; nicht als allein ausreichend betrachten |
| Nicht authentifizierte Altprotokolle | Ältere registerbasierte und feldbusgeprägte Protokolle | Konstruktionsbedingt keine | Nur kompensierende Maßnahmen: Segmentierung, Filterung, Monitoring |

**Die dritte Zeile ist der Ort, an dem die meisten realen Anlagen leben**, und etwas anderes zu behaupten führt zu schlechteren Ergebnissen als es anzunehmen. Ein Protokoll ohne Identitätsbegriff bekommt durch Richtlinien keine Identität. Möglich ist dagegen:

- Es auf ein Segment begrenzen, dessen Teilnehmer sämtlich bekannt und aufgezählt sind.
- An der Grenze so filtern, dass nur benannte Quell-Hosts es sprechen dürfen.
- Das Segment überwachen, denn ohne Authentifizierung ist Verhalten der einzige verbleibende Beweis.
- Jede Notwendigkeit, es über eine Grenze zu führen, als Ausnahme mit dokumentierter kompensierender Maßnahme behandeln, nicht als Normalfall.

**Ein Protokoll nicht allein nach Sicherheitsgesichtspunkten wählen.** Ein sicheres Protokoll, schlecht eingesetzt — von überall erreichbar, mit einer geteilten Identität — ist schwächer als ein nicht authentifiziertes Protokoll, das auf ein Segment beschränkt ist, das sonst niemand erreicht. Protokollfähigkeit und Architektur multiplizieren sich; sie ersetzen einander nicht.

## Trennung von Lesen und Schreiben

Die am wenigsten genutzte Maßnahme in diesem Feld ist zugleich die billigste: **die meisten Datenkonsumenten eines Leitsystems müssen nie schreiben, und die Architektur bildet das selten ab.**

Ein Historian-Collector liest. Ein Reporting-Konnektor liest. Ein Dashboard liest. Eine Stückzahlanbindung liest. Wenn all das über denselben Pfad und dieselben Zugangsdaten läuft wie die Systeme, die Sollwerte setzen, dann entspricht die Konsequenzfläche jedes einzelnen davon der Konsequenzfläche eines Befehlskanals.

Sie zu trennen ist überwiegend eine Entscheidung und keine Technikfrage:

- Nur-Lese-Konsumenten einen Pfad geben, der an der Grenze nur lesend ist — nicht bloß per Konvention im Client.
- Wo die Steuerung Schutzstufen kennt, für Nur-Lese-Konsumenten die Lesestufe verwenden statt der höchsten Stufe für alles.
- Die Befehlspfade aufzählen. Es sollten wenige sein, sie sollten benennbar sein, und jemand sollte ohne Nachschlagen sagen können, welches System in welche Steuerung schreiben darf.
- Den aggregierenden Server in der DMZ nur lesend halten. Er ist die exponierteste Komponente der Kette; er sollte auch diejenige sein, die nichts anweisen kann.

Der Nutzen zeigt sich im Vorfall und nicht im Normalbetrieb — weshalb der Punkt oft übersprungen wird: ein kompromittierter oder fehlerhafter Nur-Lese-Konsument ist ein Datenproblem, dasselbe Ereignis auf einem schreibfähigen Pfad ist ein Anlagenproblem.

## Engineering-Zugriff

Der Engineering-Zugriff ist der schwierigste Teil dieser Architektur, denn er ist der eine Pfad, der das Leitsystem verändern können muss — und er wird von Menschen unter Zeitdruck benutzt.

**Jump-Hosts sind die übliche Antwort und werden häufig durch die Art ihrer Nutzung entwertet.** Ein Jump-Host, den sich alle teilen, mit einem gemeinsamen lokalen Konto und ohne Sitzungsaufzeichnung, hat die Exposition verschoben statt verringert. Was einen wirksam macht:

- Persönliche Konten, damit eine Handlung einer Person zurechenbar ist.
- Die Engineering-Werkzeuge auf dem Jump-Host installiert, damit Notebooks die Steuerungszone nicht erreichen müssen.
- Sitzungsprotokollierung, die die Sitzung überdauert.
- Keine allgemeine Internet-Erreichbarkeit vom Host selbst.

**Mobile Engineering-Geräte sind selbst eine Grenzüberschreitung.** Ein Notebook, das montags im Firmennetz und dienstags im Steuerungsnetz hängt, hat zwei Zonen überbrückt — mit seinem eigenen Speicher als Conduit. Dedizierte, kontrollierte Engineering-Rechner sind die übliche Gegenmaßnahme; wo das nicht praktikabel ist, sollte das Risiko dokumentiert und nicht wegdiskutiert werden.

**Fernzugriff für Hersteller und Integratoren** verdient eine ausdrückliche Regelung, weil der Druck, ihn zu gewähren, mitten in einem Stillstand entsteht, wenn niemand über Architektur diskutieren möchte. Vorab und schriftlich zu klärende Eigenschaften:

- Der Zugang wird für ein definiertes Fenster freigeschaltet und danach deaktiviert — durch einen Mechanismus, nicht durch eine Absicht.
- Jemand vor Ort weiß, dass eine Sitzung aktiv ist.
- Die Sitzung erreicht einen definierten Host, nicht die Steuerungszone allgemein.
- Handlungen werden aufgezeichnet.

Der wiederkehrende Fehler ist nicht, dass es Fernzugriff gibt; es ist, dass er einmal für ein Inbetriebnahmeproblem freigeschaltet und nie wieder abgeschaltet wurde — und dass heute niemand sagen kann, wer ihn hat.

## Lebenszyklus von Zugangsdaten und Zertifikaten

Wo Mechanismen existieren, brauchen sie einen Verantwortlichen und einen Lebenszyklus, sonst verkommen sie zu Hindernissen, die umgangen werden.

**Schutzstufen und Passwörter der Steuerungen.** Bei der Inbetriebnahme gesetzt, danach in der Regel nie wieder betrachtet. Die praktischen Fragen: steht auf jeder Steuerung der Anlage dasselbe Passwort, kennen es ehemalige Mitarbeitende und frühere Dienstleister, und gibt es überhaupt eine Aufzeichnung darüber, wer es hat? Ein einziges geteiltes Geheimnis ohne Wechsel ist eine Maßnahme nur auf dem Papier.

**Zertifikate, wo das Protokoll sie nutzt.** Was scheitert, ist der Lebenszyklus und nicht die Kryptografie — Ausstellung, Ablaufverfolgung und Gerätetausch. Ein abgelaufenes Zertifikat erzeugt einen Ausfall zu einem beliebigen Zeitpunkt mit einer Ursache, die aus dem Symptom nicht sichtbar ist, und ein Ersatzgerät mit neuem Zertifikat verbindet sich nicht, bis ihm jemand vertraut. Jedes Vertrauensmodell ohne definierte Austauschprozedur wird beim ersten nächtlichen Gerätetausch umgangen.

**Dienstkonten.** Jede Anbindung sollte ein eigenes haben, mit genau den Rechten, die sie braucht. Ein gemeinsames Konto für vier Systeme bedeutet, dass kein Protokoll etwas zuordnen kann — und dass sein Entzug alle vier bricht.

## Monitoring und Protokollierung

Monitoring in der OT unterscheidet sich in einem wichtigen Punkt vom IT-Monitoring: **der Verkehr ist vorhersagbarer, was Abweichungen aussagekräftiger macht.**

Der Normalzustand eines Steuerungsnetzes besteht aus einer kleinen Menge von Hosts, die eine kleine Menge von Protokollen in wiederkehrendem Rhythmus austauschen. Im Rechenzentrum wäre das eine schwache Baseline, hier ist es eine starke. Abweichungen, die Aufmerksamkeit verdienen:

- Ein neues Gerät erscheint in einem Steuerungssegment.
- Ein Host spricht ein Protokoll, das er nie zuvor gesprochen hat.
- Ein Verbindungsversuch zu einer Steuerung von einer Adresse, die nicht auf der aufgezählten Liste steht.
- Schreibvorgänge von einer Quelle, die historisch nur gelesen hat.
- Aktivität von Engineering-Protokollen außerhalb eines Wartungsfensters.

**Passive Beobachtung ist in Steuerungssegmenten dem aktiven Scannen vorzuziehen.** Für IT-Netze gebaute Scanwerkzeuge können Geräte stören, die nie dafür ausgelegt waren, gescannt zu werden — und ein Verfügbarkeitsvorfall, den ein Sicherheitswerkzeug verursacht hat, schadet dem Sicherheitsprogramm mehr, als der Befund wert war.

**Protokolle müssen das Gerät verlassen.** Logs von Steuerungen und Switches sind klein, zirkulär und beim Ausschalten verloren. Wenn die Aufzeichnung eines Ereignisses zählt, muss sie anderswo liegen, bevor das Ereignis untersucht wird — also bevor es eintritt.

**Zeitsynchronisation ist eine Sicherheitsanforderung, nicht nur eine Frage der Datenqualität.** Ein SCADA-Log, ein Firewall-Log und ein Steuerungsereignis über drei nicht übereinstimmende Uhren zu korrelieren macht aus einer Untersuchung Raterei.

## Vorfallseindämmung

Der letzte Teil des Entwurfs ist der am häufigsten fehlende: was zu tun ist, wenn etwas nicht stimmt — entschieden, bevor etwas nicht stimmt.

Der Zielkonflikt ist real und sollte offen benannt werden: **die schnellste Eindämmungsmaßnahme — trennen — kann zugleich die schädlichste verfügbare sein**, denn ein mitten im Prozess entferntes Leitsystem lässt Bediener womöglich ohne Sicht auf eine laufende Anlage zurück. Die Regelung läuft in den Steuerungen meist weiter, aber Blindbetrieb ist eine eigene Gefährdung.

Was ein tragfähiger Eindämmungsplan vorab festlegt:

- Welche Segmente sich ohne Produktionsstopp isolieren lassen und welche nicht.
- Was Bediener in jedem Isolationsfall verlieren und ob die Anlage so fahrbar ist.
- Wer um drei Uhr nachts die Entscheidungsbefugnis hat.
- Wie die Anlage in einen sicheren Zustand kommt, falls die Leitebene entfernt werden muss.
- Welche Beweise vor einer Wiederherstellung zu sichern sind, denn eine Wiederherstellung zerstört sie meist.

Ein Eindämmungsplan, der nie mit dem Betrieb durchgesprochen wurde, ist ein Dokument und keine Fähigkeit.

## Fehlermodi

**Flaches Netz mit Firewall nur am Perimeter.** Alles innerhalb des Perimeters erreicht die Steuerungen; die Grenze schützt gegen außen und sonst nichts.

**Any-Any-Regeln aus der Inbetriebnahme.** Geschrieben, damit die Anlage läuft, nie eingeengt, Jahre später noch vorhanden.

**Lesezugriffe aus dem Unternehmensnetz bis in die Steuerungszone.** Eine Reporting-Anforderung schuf einen Pfad, der den Bericht überlebte.

**Ein geteiltes Engineering-Passwort.** Keine Zuordnung möglich; für Ausgeschiedene weiterhin gültig.

**Fernzugriff aktiv geblieben.** Für einen Vorfall geöffnet, nie geschlossen, keine aktuelle Aufzeichnung der Berechtigten.

**Nur-Lese-Konsumenten auf schreibfähigen Pfaden.** Jede Anbindung trägt die Konsequenz eines Befehlskanals.

**Logs, die das Gerät nie verlassen haben.** Die Untersuchung beginnt, nachdem der Ringpuffer umgelaufen ist.

**Kein Eindämmungsplan.** Die Isolationsentscheidung fällt unter Druck, ohne zu wissen, was die Bediener verlieren.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Eine Anlage untersucht unerklärte Sollwertänderungen an einer Verpackungslinie. Bediener melden Werte, die von den eingestellten abweichen; es gibt keine Meldung, und das SCADA-Ereignisprotokoll zeigt die Änderungen ohne Quelle.

Der Befund entsteht so: Die Steuerungen der Linie liegen in einem Segment, das aus dem allgemeinen Engineering-VLAN des Standorts erreichbar ist. Ein Altprotokoll ohne Authentifizierung transportiert die Sollwertschreibvorgänge. Drei Systeme können schreiben: SCADA, ein altes Testwerkzeug, das auf einem Engineering-PC installiert geblieben ist, und ein tabellenkalkulationsgestütztes Produktionswerkzeug, das vor Jahren von einem inzwischen ausgeschiedenen Ingenieur gebaut wurde. Alle drei nutzen denselben Pfad, und das Protokoll trägt keine Identität — das SCADA-Log verzeichnet also die Änderung, aber nicht ihren Ursprung.

Als Quelle erweist sich das Werkzeug: Es schreibt turnusmäßig einen Rezeptwert, mit einer veralteten Konfiguration.

Nichts davon war ein Angriff. Aber genau die Eigenschaften, die ein harmloses Werkzeug unerklärte Änderungen erzeugen ließen — keine Identität, keine Quellbeschränkung, keine Lese-Schreib-Trennung, keine Zuordenbarkeit — sind dieselben, die einen echten Vorfall schwer erkennbar und noch schwerer eingrenzbar machen würden. Die Untersuchung war erfolgreich, weil jemand das Muster erkannt hat, nicht weil die Architektur Beweise erzeugt hätte.

Die Abhilfe ist strukturell: jeden Host aufzählen, der in diesem Segment schreiben darf, an der Grenze auf diese Liste filtern, Nur-Lese-Konsumenten einen Nur-Lese-Pfad geben und Schreibvorgänge mit ihrer Quelle aufzeichnen. Das vergessene Werkzeug ist dann entweder ein befugter, dokumentierter Schreiber — oder es kann gar nicht mehr schreiben.

## Hinweise zur Inbetriebnahme

Sicherheitsentscheidungen aus der Inbetriebnahme werden meist dauerhaft, weil die Abkürzung keine sichtbare Folge und kein Ablaufdatum hat.

- Jede temporäre Regel mit Verantwortlichem und Entfernungsdatum erfassen; die Liste vor der Übergabe durchgehen.
- Prüfen, dass die Sicherheitskonfiguration, die aktiv sein soll, tatsächlich aktiv ist — konfiguriert und wirksam sind zwei verschiedene Zustände.
- Standardzugangsdaten ändern und festhalten, wo jedes davon nun liegt.
- Eine Baseline des normalen Verkehrs aufnehmen, solange die Anlage als in Ordnung gilt. Das ist die Referenz, die jede spätere Untersuchung braucht — und diejenige, an die niemand denkt.
- Das Firewall-Regelwerk mit einer erklärten Absicht je Regel übergeben. Eine Regel, deren Zweck niemand erinnert, wird nie sicher entfernt werden.

## Empfohlene Praxis

- Zonen definieren und aufzählen, was jeden Conduit überschreitet; nicht aufgezählten Verkehr als verboten behandeln.
- Die Richtung des Verbindungsaufbaus bewusst festlegen; dem Unternehmensnetz nie direkten Zugriff auf die Steuerungszone geben.
- Die Architektur an der Protokollfähigkeit ausrichten und akzeptieren, dass nicht authentifizierte Altprotokolle kompensierende Maßnahmen brauchen und keinen Optimismus.
- Lesen und Schreiben an der Grenze trennen, nicht per Konvention im Client.
- Den aggregierenden DMZ-Server nur lesend halten.
- Engineering-Zugriff über persönlich zuordenbare Jump-Hosts mit Sitzungsprotokollierung führen.
- Hersteller-Fernzugriff mechanisch für ein definiertes Fenster freischalten und sicherstellen, dass die Betriebsmannschaft von einer laufenden Sitzung weiß.
- Jeder Anbindung ein eigenes Dienstkonto mit minimalen Rechten geben.
- Normalverkehr als Baseline erfassen, passiv überwachen und Logs vom Gerät wegschreiben.
- Die Zeit über Steuerungs-, Leit- und Sicherheitssysteme hinweg synchronisieren.
- Den Eindämmungsplan mit dem Betrieb abstimmen, einschließlich dessen, was in jedem Isolationsfall verloren geht.

## Fazit

Die Sicherheit des Pfades von der Steuerung zum Leitsystem entscheidet sich weit stärker über die Architektur als über das Protokoll. Verbindungsrichtung, ein aufgezählter Conduit, die Trennung von Lesen und Schreiben und ein zuordenbarer Engineering-Zugriff leisten für eine Anlage mehr als jede einzelne kryptografische Maßnahme — und sie wirken auf dem Bestand, der sich nicht austauschen lässt.

Die ehrliche Position zu Altprotokollen sei wiederholt: Sie werden nicht sicher werden, und der Entwurf muss tragen, ohne dass sie es sind. Das ist erreichbar — aber nur, wenn Grenze, Zugriffsprozedur und Monitoring mit derselben Ernsthaftigkeit ausgelegt werden, die man sonst der Steuerungslogik selbst vorbehält.
