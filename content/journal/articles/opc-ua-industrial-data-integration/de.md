# OPC-UA-Architektur für industrielle Datenintegration

## Zusammenfassung

OPC UA wird häufig aus dem falschen Grund eingeführt — als moderner Ersatztransport für ein Altprotokoll — und deshalb weit unter seinen Möglichkeiten genutzt. Sein eigentlicher Beitrag besteht nicht darin, Werte zwischen Systemen zu bewegen; das leisten viele Protokolle. Er besteht darin, dass Werte mit Struktur, Typ und Bedeutung ankommen, sodass ein Konsument selbst entdecken kann, was ein Gerät anbietet, statt es aus einer Taglist in einer Tabellenkalkulation außerhalb des Protokolls erfahren zu müssen.

Diese Fähigkeit kostet etwas. Ein Informationsmodell muss entworfen, eine Namespace-Strategie gewählt und eine zertifikatsbasierte Vertrauensbeziehung über die gesamte Lebensdauer der Anlage betrieben werden. Projekte, die den Transport übernehmen und die Modellierung überspringen, erhalten ein komplizierteres Protokoll ohne jeden Nutzen.

## Was OPC UA tatsächlich liefert

Drei Dinge, in absteigender ingenieurtechnischer Bedeutung:

**Ein Informationsmodell.** Ein Knoten im Adressraum ist nicht nur ein Wert; er hat einen Datentyp, eine technische Einheit, einen Browse-Namen, Referenzen auf andere Knoten und potenziell eine Typdefinition, die er mit jedem gleichartigen Gerät teilt. Eine als typisiertes Objekt veröffentlichte Pumpe ist selbstbeschreibend — `DB100.DBD24` ist es nicht.

**Einen Entdeckungsmechanismus.** Ein Client kann den Adressraum des Servers durchsuchen und erfahren, was existiert. Die Integration hängt nicht länger von einer gepflegten externen Taglist ab — genau dem Artefakt, das am ehesten veraltet ist.

**Ein Sicherheitsrahmenwerk.** Zertifikatsbasierte gegenseitige Authentifizierung, Signierung und Verschlüsselung sind Teil der Spezifikation und nicht nachträglich angefügt. Ob dieses Rahmenwerk richtig genutzt wird, ist eine Betriebsfrage, die weiter unten behandelt wird.

Der Transport selbst ist der uninteressanteste Teil, und ihn für den Kern der Sache zu halten, ist der häufigste Architekturfehler.

## Adressraum und Namespace-Strategie

Der Adressraum ist die Stelle, an der sich OPC UA entweder auszahlt oder zu einer teuren flachen Taglist wird.

**Der zu vermeidende Fehlermodus ist das Veröffentlichen der Programminterna.** Ganze Datenbausteine freizugeben ist einfach: alle Variablen erscheinen, die Integration läuft, das Projekt geht weiter. Geschehen ist dabei, dass die interne Programmstruktur zu einem externen Vertrag geworden ist. Eine Variable umzubenennen, eine Struktur umzusortieren oder einen Baustein zu überarbeiten bricht nun ein SCADA-System, eine MES-Anbindung oder einen Reporting-Job — und niemand merkt es, bevor die Überarbeitung ausgerollt ist.

**Die Alternative ist eine bewusst entworfene Schnittstellenschicht.** Eine kleine Zahl von Bausteinen existiert genau dafür, die veröffentlichte Oberfläche zu sein. Die interne Logik schreibt in sie; der Server gibt nur sie frei. Interne Überarbeitungen sind dann kostenlos, und der externe Vertrag ändert sich nur, wenn jemand entscheidet, dass er sich ändern soll.

**Die Namespace-Strategie** entscheidet darüber, ob Bezeichner Veränderungen überstehen. Einige Regeln, die sich bewähren:

- Hersteller- und Standard-Namespaces vom eigenen trennen. Werden sie vermischt, kann ein Firmware-Update mit den eigenen Bezeichnern kollidieren.
- Wo der Server es zulässt, stabile und aussagekräftige Bezeichner gegenüber automatisch erzeugten numerischen bevorzugen. Eine numerische Node-ID, die sich beim Neuübersetzen des Projekts ändert, ist kein Integrationsvertrag.
- Früh entscheiden, ob Clients über die Node-ID oder über den Browse-Pfad binden. Die Bindung über den Browse-Pfad ist lesbarer und fragiler; die Bindung über die Node-ID ist undurchsichtiger und stabiler. Was auch gewählt wird — es sollte gewählt und nicht später entdeckt werden.

**Typdefinitionen sind der Mechanismus, der Skalierung beherrschbar macht.** Einen Pumpentyp zu modellieren und vierhundertmal zu instanziieren bedeutet, dass ein Konsument eine Integration schreibt und überall anwendet. Vierhundert Einzelpumpen zu modellieren bedeutet vierhundert Integrationen. Der Aufwandsunterschied entsteht beim Konsumenten — weshalb er für das Team, das die Serverseite baut, oft unsichtbar bleibt.

## Sessions, Subscriptions und Monitored Items

Die Laufzeitkonzepte sind wichtig, weil sie die Last bestimmen — und die Last ist der Punkt, an dem OPC-UA-Installationen am häufigsten enttäuschen.

```text
Client
  └── Session            (authentifiziert, zustandsbehaftet)
        └── Subscription (ein Veröffentlichungsrhythmus)
              └── Monitored Item  (ein überwachter Knoten)
                    ├── Sampling Interval
                    ├── Deadband
                    └── Queue Size
```

Vier Parameter bestimmen das Verkehrsprofil, und jeder davon bleibt routinemäßig auf dem Vorgabewert:

| Parameter | Bestimmt | Folge eines unbedachten Vorgabewerts |
| --- | --- | --- |
| Sampling Interval | Wie oft der Server den Knoten liest | Schneller als der Prozess braucht = vergeudete Serverlast |
| Publishing Interval | Wie oft der Server ein Paket sendet | Sehr kurze Intervalle erzeugen viele kleine Nachrichten |
| Deadband | Was als sendenswerte Änderung gilt | Deadband null auf einem verrauschten Analogwert flutet die Verbindung |
| Queue Size | Wie viele Änderungen je Item gepuffert werden | Größe 1 verwirft Zwischenänderungen stillschweigend |

Die Feinheit bei der Queue Size verdient eine ausdrückliche Erwähnung, weil sie eine Überraschung bei der Datenintegrität und nicht bei der Performance erzeugt: **bei einer Queue Size von eins werden Werte, die sich schneller als das Publishing Interval ändern, überschrieben, und der Client sieht nur den letzten.** Für einen Trend ist das meist akzeptabel; für eine Folge diskreter Zustände bedeutet es, dass Übergänge verloren gehen. Braucht ein Konsument jeden Zustandswechsel, muss die Queue für die schlechteste Änderungsrate innerhalb eines Publishing Intervals dimensioniert werden.

**Die Serverkapazität ist endlich und spezifiziert.** Wie viele Sessions, Subscriptions und Monitored Items ein in der Steuerung eingebetteter Server trägt, ist je Modell eine veröffentlichte Zahl. Eine Architektur, die SCADA, einen Historian-Collector, eine MES-Anbindung und zwei Engineering-Clients hinzufügt, hat jeder Steuerung fünf Sessions aufgebürdet. Ein Überschreiten der Kapazität erzeugt in der Entwurfsphase keinen klaren Fehler; es erzeugt nach der Inbetriebnahme abgewiesene Verbindungen und sporadische Störungen.

## Sicherheit in der Praxis

Die Spezifikation stellt ein starkes Sicherheitsrahmenwerk bereit. Das Versagen ist fast immer betrieblicher und nicht kryptografischer Natur.

**Der Sicherheitsmodus ist eine Entscheidung, keine Vorgabe.** None, Sign und Sign-and-Encrypt unterscheiden sich darin, was sie schützen. „None“ ist nur in einem wirklich isolierten Kontext angemessen, und die Inbetriebnahme-Abkürzung — auf None stellen, damit die Verbindung steht, mit der Absicht, es später zu ändern — ist der mit Abstand häufigste Weg, auf dem ein ungesicherter Endpunkt in den Produktivbetrieb gelangt.

**Zertifikatsvertrauen muss betreibbar sein.** Der Mechanismus verlangt, dass jede Seite dem Zertifikat der anderen vertraut. Die ingenieurtechnischen Fragen, die über das Überleben dieser Konstruktion entscheiden:

- Wer stellt Zertifikate aus, und gibt es einen definierten Prozess — oder erhält jedes Gerät ein selbstsigniertes Zertifikat, dem einmal von Hand vertraut und das nie wieder überprüft wird?
- Was geschieht beim Ablauf eines Zertifikats? Ein Ablaufdatum, das niemand verfolgt hat, ist ein Ausfall ohne erkennbare Ursache zu einem beliebigen Zeitpunkt.
- Wie lautet die Austauschprozedur beim Gerätetausch? Die Zertifikatsbehandlung gehört deshalb in die Inbetriebnahmeanweisung des Geräts, neben Adresse und Namensraum, und nicht in ein Sicherheitsdokument, das beim Tausch niemand öffnet.

Ein Vertrauensmodell, das nicht betreibbar ist, wird umgangen — meist durch Abschalten der Sicherheit — und ein umgangenes Modell leistet nichts.

**Benutzerauthentifizierung ist etwas anderes als Zertifikatsvertrauen.** Das Zertifikat authentifiziert die *Anwendung*; Benutzertoken authentifizieren die *Person oder den Dienst*. Beides ist wichtig, und beides zu vermengen führt in der Regel zu einem System, in dem sich alle Clients eine Identität teilen und Audit-Protokolle nichts zuordnen können.

**Schreibzugriff verdient eine andere Behandlung als Lesezugriff.** Ein Server, der nur veröffentlicht, hat eine grundlegend kleinere Konsequenzfläche als einer, der Schreibvorgänge annimmt. Wo Schreibzugriffe nötig sind, sollten sie aufgezählt und am Server eingeschränkt werden, statt sich auf die Disziplin der Clients zu verlassen. Das ist das Conduit-Denken aus IEC 62443, angewandt auf Protokollebene: der OPC-UA-Endpunkt ist ein Conduit aus der Kontrollzone heraus, und Conduits sind der Ort, an dem Richtlinien durchgesetzt werden.

## Wo OPC UA nicht die richtige Antwort ist

Eine ehrliche Architektur kennt ihre Grenzen.

**Harte Echtzeitregelung.** Standard-OPC-UA im Client/Server-Betrieb ersetzt keinen Feldbus für zyklischen Steuerungsverkehr. Der deterministische Austausch zwischen einer Steuerung und ihrer Peripherie gehört auf das Industrieprotokoll, das dafür entworfen wurde.

**Sehr hochfrequente Daten auf begrenzten Geräten.** Der Overhead je Item ist real. Ein Gerät, das Tausende schnell wechselnder Werte veröffentlicht, ist mit einem eigens gebauten Collector oft besser bedient — OPC UA transportiert dann das aggregierte oder kontextualisierte Ergebnis.

**Triviale Punkt-zu-Punkt-Integration.** Wenn ein System eine Handvoll Werte von einem Gerät über eine isolierte Verbindung benötigt, können Modellierung und Zertifikatslebenszyklus mehr kosten, als sie einbringen. Modbus TCP ist nicht veraltet, weil es OPC UA gibt; es ist einfacher, und Einfachheit ist eine legitime ingenieurtechnische Eigenschaft.

**Altgeräte ohne Server.** Diese benötigen ein Gateway, und dieses Gateway wird zu einer Architekturkomponente mit eigener Verfügbarkeit, eigener Sicherheit und eigenem Lebenszyklus — kein transparenter Adapter. Ein Gateway, das eine flache Registerkarte in einen flachen OPC-UA-Adressraum übersetzt, hat die Daten bewegt, ohne das Modell hinzuzufügen; das ist ein vertretbarer Zwischenschritt, sollte aber als solcher erkannt werden.

```text
Unternehmensebene / MES
       |
   OPC-UA-Client
       |
Industrielle DMZ  -- aggregierender OPC-UA-Server / Gateway
       |
   OT-Firewall
       |
OT-Zone -- SCADA, Historian-Collector
       |
In Steuerungen eingebettete OPC-UA-Server
       |
Feldbus (zyklischer Steuerungsverkehr — NICHT OPC UA)
       |
Dezentrale Peripherie / Feldgeräte
```

Der Punkt der Schichtung: OPC UA gehört an Integrationsgrenzen. Die darunterliegende zyklische Steuerungsebene bleibt auf dem Protokoll, das für Determinismus gebaut wurde.

## Fehlermodi

**Interna als Schnittstelle veröffentlicht.** Eine Überarbeitung bricht drei Konsumenten; niemand wusste, dass sie existieren.

**Session-Erschöpfung.** Jede Integration fügte einen Client hinzu; die spezifizierte Kapazität der Steuerung wurde nie geprüft; die Symptome erscheinen als sporadische Kommunikationsstörungen.

**Queue Size eins auf einer Zustandsvariablen.** Zwischenübergänge gehen stillschweigend verloren; eine Sequenz scheint Schritte zu überspringen.

**Deadband null auf verrauschten Analogwerten.** Die Verbindung trägt Sensorrauschen mit voller Abtastrate.

**Sicherheit während der Inbetriebnahme auf None.** Nie geändert, weil sichtbar nichts von der Änderung abhing.

**Zertifikatsablauf.** Ein Ausfall zu einem beliebigen künftigen Datum, mit einer Ursache, die aus dem Symptom nicht ersichtlich ist.

**Gateway als transparent behandelt.** Verfügbarkeit, Patchstand und Fehlerverhalten wurden nie betrachtet, und es wird zum Single Point of Failure für sämtliche Unternehmensdaten.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Ein Fertigungsstandort ergänzt eine MES-Anbindung an fünf bestehende Produktionszellen über OPC UA. Der Integrationstest besteht. Zwei Wochen nach der Inbetriebnahme melden Bediener sporadische SCADA-Datenausfälle an zwei Zellen, am stärksten beim Schichtwechsel.

Der Befund: Die betroffenen Steuerungen zeigen die Session-Zahl an ihrer spezifizierten Grenze. Der MES-Konnektor öffnet je Zelle eine Session, der Historian-Collector ebenfalls, und das Engineering-Notebook öffnet eine, sobald es angeschlossen ist. Beim Schichtwechsel verbindet sich ein weiterer Engineering-Client — und je nach Serververhalten wird die älteste oder die neueste Session abgewiesen.

Nichts ist defekt. Die Architektur hat Konsumenten hinzugefügt, ohne sie gegen eine veröffentlichte Kapazitätszahl zu zählen, und der Fehler trat erst zutage, als ein vorübergehender sechster Konsument auftauchte.

Die Abhilfe ist architektonisch statt korrektiv: die unternehmensseitigen Konsumenten hinter einem einzigen, in der DMZ stehenden Server bündeln, der je Steuerung eine Session hält und viele Clients bedient, statt jeden Konsumenten direkt mit der Steuerungsebene zu verbinden. Dieses Muster erfüllt nebenbei auch die Zonengrenze — weshalb es sich lohnt, es zu übernehmen, bevor die Kapazität dazu zwingt.

## Empfohlene Praxis

- Ein Informationsmodell entwerfen; Programminterna nicht als Schnittstelle veröffentlichen.
- Die veröffentlichte Oberfläche auf Bausteine beschränken, die dafür existieren, veröffentlicht zu werden.
- Typen modellieren und instanziieren, damit Konsumenten eine Integration schreiben statt vieler.
- Den eigenen Namespace von Hersteller- und Standard-Namespaces trennen.
- Die Bindung über Node-ID oder Browse-Pfad bewusst wählen und dokumentieren.
- Sampling Interval, Publishing Interval, Deadband und Queue Size je Item am tatsächlichen Bedarf ausrichten.
- Queues dort für die schlechteste Änderungsrate dimensionieren, wo jeder Übergang zählt.
- Jede Session vor der Inbetriebnahme gegen die veröffentlichte Serverkapazität zählen.
- Den Sicherheitsmodus ausdrücklich festlegen und ein Inbetriebnahme-„None“ nie im Produktivbetrieb belassen.
- Zertifikatsausstellung, Ablaufverfolgung und Gerätetauschprozeduren vor dem Go-live definieren.
- Unternehmensseitige Konsumenten an einem DMZ-Server bündeln, statt sie an die Steuerungsebene anzuschließen.

## Fazit

OPC UA lohnt den Aufwand, der in die Modellierung fließt, und kostet mehr als es einbringt, wenn es allein als Transport genutzt wird. Die Entscheidungen darüber, welches der beiden Ergebnisse eintritt, fallen früh: ob es eine entworfene Schnittstelle gibt oder ein offengelegtes Programm, ob Typen existieren, ob der Namespace stabil ist und ob das Zertifikatsmodell etwas ist, das eine Betriebsmannschaft tatsächlich führen kann.

Der ehrliche Schlusspunkt ist der, den Anbieter selten machen: OPC UA ist die richtige Antwort an Integrationsgrenzen und die falsche für zyklische Regelung. Eine Architektur, die diese Unterscheidung respektiert, erhält eine durchsuchbare, typisierte und abgesicherte Integrationsschicht, die sauber auf einer deterministischen Steuerungsebene aufsitzt — und beide tun genau die Arbeit, für die sie entworfen wurden.
