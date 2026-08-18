# Industrielle Cybersicherheit für PLC- und SCADA-Umgebungen

## Zusammenfassung

Die meisten industriellen Sicherheitsprogramme werden danach bewertet, was sie installiert haben. Die bessere Frage ist, was sie vorführen könnten: *Listen Sie jedes Gerät in diesem Segment auf; zeigen Sie die letzte verifizierte Sicherung jener Steuerung; nennen Sie, wer heute Engineering-Zugriff hat; erklären Sie, was mit der Produktion geschieht, wenn wir diese Zone in den nächsten zehn Minuten isolieren.*

Programme, die diese vier Fragen beantworten können, sind in der Regel widerstandsfähig — unabhängig davon, welche Produkte beschafft wurden. Programme, die es nicht können, sind meist gut ausgestattet und ungeschützt, weil die Maßnahmen ohne das Wissen existieren, das ihre Nutzung voraussetzt.

Dieser Beitrag ist eine defensive Betrachtung. Er enthält keine offensiven Techniken und widmet Inventar und Wiederherstellung bewusst mehr Raum als Perimeter-Technik, weil dort die Ergebnisse tatsächlich entschieden werden.

## Die beiden Maßnahmen, die über das Ergebnis entscheiden

Zwei Fähigkeiten leisten für eine Anlage mehr als jede Einzeltechnologie, und beide sind unspektakulär.

**Ein Asset-Inventar, das wirklich stimmt.** Jede andere Maßnahme hängt davon ab. Segmentierung lässt sich nicht gegen ein unbekanntes Gerät verifizieren; Monitoring kann keinen unerwarteten Host melden, wenn der erwartete Satz nie aufgeschrieben wurde; Patchen lässt sich nicht für Geräte planen, von denen niemand weiß.

**Eine geübte Wiederherstellfähigkeit.** Wiederherstellung ist die einzige Maßnahme, die unabhängig vom Hergang wirkt — auch bei Ursachen, die gar keine Sicherheitsvorfälle sind. Ein Standort, der eine Steuerung und einen Leitebenenserver innerhalb einer vom Prozess verkraftbaren Zeit zurückbringt, hat die Folgen einer ganzen Ereignisklasse begrenzt.

Alles Weitere unterstützt eine dieser beiden Fähigkeiten oder senkt die Wahrscheinlichkeit, sie zu brauchen.

## Ein Inventar aufbauen, das stimmt

Ein aus Beschaffungsunterlagen und Projektdokumentation zusammengetragenes Inventar ist ein Ausgangspunkt und stets falsch. Geräte werden getauscht, Ersatzteile eingebaut, provisorische Geräte dauerhaft, und Dienstleister lassen Dinge zurück.

**Passive Erfassung ist in der OT die sichere Methode**, aus den Gründen, die der Begleitbeitrag zur sicheren PLC-SCADA-Kommunikation darlegt. Verkehr zu beobachten zeigt, was tatsächlich kommuniziert — und es zeigt es *im Verhalten*, was oft aussagekräftiger ist als die Selbstauskunft eines Geräts.

**Die passive Erfassung hat eine für ein Inventar wesentliche Grenze**: Sie findet nur, was spricht. Ein Ersatzumrichter im Schrank, eine über eine Saison abgeschaltete Steuerung, ein Gerät in einem nicht instrumentierten Segment — keines erscheint, und alle existieren. Das Inventar braucht deshalb eine zweite Quelle: Begehungen von Schränken und Räumen, abgeglichen gegen die erfasste Menge. Die Differenz beider Listen ist selbst der Befund.

**Was das Inventar je Asset festhalten muss**, denn jedes Feld wird von einer anderen Maßnahme genutzt:

| Feld | Welche Maßnahme es braucht |
| --- | --- |
| Ort, Funktion und bedienter Prozess | Konsequenzbewertung; Eindämmungsplanung |
| Zone und Netzadresse | Verifikation der Segmentierung |
| Hersteller, Modell, Firmware-Stand | Schwachstellenbewusstsein; Lebenszyklusplanung |
| Datum des Supportendes | Ersatzbudgetierung |
| Eigentümer — wer patcht, wer validiert | Änderungskontrolle |
| Ort der Sicherung und Datum der letzten *Verifikation* | Wiederherstellung |
| Zugriffsweg und Inhaber der Zugangsdaten | Least Privilege; Austrittsprozess |

**Zwei Felder verdienen Nachdruck, weil sie üblicherweise fehlen.** Das *Supportende* verwandelt ein künftiges Sicherheitsproblem in eine Budgetzeile mit Termin. Das *Datum der letzten Verifikation* — nicht „Datum der letzten Sicherung“ — ist der Unterschied zwischen Sicherungen haben und wiederherstellbar sein.

**Das Inventar ist ein lebendes Artefakt oder eine Fiktion.** Der praktische Mechanismus ist, es Teil der Änderungskontrolle zu machen: Kein Gerät wird ohne Inventareintrag in Betrieb genommen oder getauscht, und die periodische passive Erfassung existiert, um zu finden, was der Prozess verfehlt hat.

## Zonen, Least Privilege und was der Betrieb akzeptiert

Das Zonen-und-Conduit-Denken der IEC 62443 liefert die Struktur: Assets nach Konsequenz gruppieren, festlegen, was zwischen den Gruppen fließt, und die Richtlinie an der Grenze durchsetzen.

> Die Netzstruktur, die Zonen umsetzt, behandelt der Begleitbeitrag zur Segmentierung industrieller Ethernet-Netze, den konkreten PLC-SCADA-Pfad der Beitrag zu dessen Absicherung. Dieser Abschnitt behandelt die Programmebene: wie Zonen gewählt und Zugriffe darin geregelt werden.

**Zonen gehören nach Konsequenz gezogen, nicht nach Bequemlichkeit.** Assets, deren Kompromittierung oder Ausfall dieselbe betriebliche Folge hat, gehören zusammen; eine Grenze zwischen zwei Bereichen, die ohnehin immer gemeinsam stillstehen, bringt wenig und kostet Verfügbarkeit.

**Least Privilege hat in der OT eine Randbedingung, die die IT nicht kennt: Eine Zugriffsregelung, die während eines Ereignisses eine notwendige Handlung blockiert, wird umgangen — und die Umgehung wird dauerhaft.** Die Entwurfsantwort ist nicht, die Maßnahme zu schwächen, sondern den legitimen Weg schnell zu machen:

- **Persönliche Konten statt gemeinsamer.** Zuordenbarkeit ist die Eigenschaft, die jede andere Maßnahme prüfbar macht. Wo ein gemeinsames Konto existiert, „weil der Betrieb es braucht“, ist die ehrliche Abhilfe ein persönliches Konto mit sofortigem Zugriff — nicht ein geteiltes Passwort mit Richtlinienausnahme.
- **Rollen, die zur tatsächlichen Tätigkeit passen** — beobachten, bedienen, parametrieren, projektieren. Eine Rollenstruktur, die Bediener zwingt, Engineering-Rechte zu halten, hat Least Privilege abgeschafft und zugleich dokumentiert.
- **Ein definierter Notfallzugang** mit erhöhten Rechten, protokolliert und im Nachgang geprüft. Seine Existenz verhindert, dass das gemeinsame Administratorpasswort zum Notfallweg wird.
- **Ein Austrittsprozess, der die OT erreicht.** Zugangsdaten von Leitsystemen liegen häufig außerhalb des Unternehmens-Identitätsprozesses; ein Austritt, der den Unternehmenszugang entfernt, kann den Anlagenzugang unberührt lassen. Das ist einer der häufigsten Befunde jeder ehrlichen Prüfung.

## Zugangsdaten, Firmware und der Lebenszyklus ohne Eigentümer

**Ein Gerätezugang ohne benannte Verantwortung ist keine Maßnahme, sondern ein Überbleibsel.** Die Frage auf Programmebene lautet nicht, wie stark das Geheimnis ist, sondern wer dafür einsteht und welche Ereignisse ihn zum Handeln verpflichten. Benennen Sie je Gerätefamilie eine verantwortliche Person und legen Sie die Auslöser fest, die einen Wechsel erzwingen: ein Austritt, das Ende eines Dienstleistereinsatzes, die Übergabe eines Feldes, ein Verdacht auf Offenlegung. Ohne diese Auslöser hat der Zugang überhaupt keinen Lebenszyklus, und seine Stärke ist gleichgültig, weil ihn nie etwas zur Änderung zwingt.

**Zertifikate, wo sie eingesetzt werden**, scheitern am Lebenszyklus und nicht an der Kryptografie — Ausstellung, Ablaufverfolgung und Gerätetausch. Ein nicht verfolgter Ablauf ist ein Ausfall zu beliebiger Zeit mit einer aus dem Symptom unsichtbaren Ursache.

**Firmware- und Softwarestände sind ein Sicherheitsdatensatz, nicht nur ein Instandhaltungsthema.** Zwei Disziplinen machen ihn nutzbar:

- **Wissen, was installiert ist** — eine Inventarfunktion und ohne sie unmöglich.
- **Wissen, wann der Support endet.** Das Supportende ist ein datiertes, vorhersehbares Ereignis. Eine Anlage mit zwanzig Steuerungen, deren Support im selben Jahr endet, hat ein Investitionsplanungsproblem, dessen Lösung drei Jahre früher weit billiger ist als in dem Monat, in dem es dringend wird.

**Patchen in der OT ist validiert, nicht schnell.** Das richtige Regime besteht aus definiertem Fenster, geprüfter Änderung, dokumentiertem Rückweg und verifiziertem Ergebnis. Der Fehler ist nicht die Langsamkeit; es ist das Asset, für das überhaupt kein Regime existiert, weil nie ein Eigentümer benannt wurde.

## Wechselmedien und mobile Ausrüstung

In Anlagen mit begrenzter Außenanbindung sind mobile Gegenstände der realistische Übertragungsweg, und die Maßnahmen sind eher organisatorisch als technisch.

- **Eine dedizierte Prüfstation**, über die Medien laufen, bevor sie in die Steuerungsumgebung gelangen.
- **Kontrollierte, ausgegebene Medien** für Engineering-Zwecke — keine privaten Geräte und nicht das, was gerade in einer Schublade lag.
- **Engineering-Notebooks, die keine Zonen überbrücken.** Ein Rechner, der erst im Firmennetz und dann im Steuerungsnetz hängt, hat zwei Umgebungen mit seinem eigenen Speicher verbunden. Dedizierte Rechner sind die übliche Antwort; wo das nicht praktikabel ist, gehört das Risiko in ein Register und nicht in eine Annahme.
- **Herstellerausrüstung standardmäßig als nicht vertrauenswürdig behandeln.** Das Notebook einer Servicekraft war in den Netzen anderer Standorte.

Nichts davon ist anspruchsvoll. Alles davon versagt still, wenn es keinen Prozess für den Dienstagnachmittag gibt, an dem ein Ersatzteil eintrifft und die Anlage wartet.

## Änderungskontrolle als Sicherheitsmaßnahme

Sicherheit ist eine Eigenschaft einer bekannten Konfiguration. Ist die Konfiguration unbekannt, hat das Monitoring keine Vergleichsbasis, passen Sicherungen womöglich nicht zum Laufenden, und eine unerklärte Änderung lässt sich nicht von einer unbefugten unterscheiden.

Was ein tragfähiger OT-Änderungsprozess festhält:

- Was geändert wurde, an welchem Asset, von wem, wann und warum.
- Den vorherigen Zustand in einer Form, die eine Rückkehr erlaubt.
- Die Verifikation, dass die Änderung das Beabsichtigte bewirkt hat.
- Die aktualisierte Sicherung, erstellt *nach* der Änderung statt davor.

**Der letzte Punkt verursacht reale Verluste.** Eine bei einer Anlagenverbesserung geänderte Steuerung, deren Sicherung vor der Änderung entstand, ist eine Steuerung, deren Sicherung sie in einen Zustand zurückversetzt, der nicht mehr zur Anlage passt. Die Wiederherstellung gelingt, und die Anlage läuft nicht.

**Der Konfigurationsvergleich ist die zugehörige aufdeckende Maßnahme.** Die laufende Konfiguration einer Steuerung periodisch mit ihrer freigegebenen Kopie zu vergleichen, findet sowohl unbefugte Änderungen als auch — weit häufiger — legitime Änderungen, die nie dokumentiert wurden. Beide Befunde sind wertvoll; der zweite hält die Basis richtig.

## Sicherung und Wiederherstellung: die selten geprüfte Fähigkeit

Wiederherstellung wirkt gegen jede Ursache. Sie ist auch die Fähigkeit, die im Moment des Gebrauchs am ehesten versagt.

**Was gesichert werden muss, ist umfangreicher als die meisten Anlagen annehmen:**

- Steuerungsprogramme **und** ihre Hardwarekonfiguration und Parameter.
- Engineering-Projekte samt der Werkzeugversion, die zum Öffnen nötig ist.
- SCADA-Anwendungen, Grafiken, Tag-Datenbanken, Meldekonfiguration und historische Archive.
- Konfigurationen der Netzgeräte — Switches, Firewalls, Gateways.
- Parametersätze von Antrieben und Messgeräten, die häufig vergessen und häufig nur durch erneute Inbetriebnahme wiederherstellbar sind.
- Die Dokumentation, die zur Nutzung all dessen nötig ist.

**Die Fragen, die aus Sicherungen Wiederherstellbarkeit machen:**

- **Kann jemand die Sicherung zurückspielen, der sie nicht erstellt hat**, anhand vorhandener Anweisungen?
- **Ist die Werkzeugversion noch verfügbar?** Eine Projektdatei, die eine Engineering-Suite verlangt, die niemand installieren kann, ist ein Archiv, keine Sicherung.
- **Wie lange dauert der vollständige Ablauf**, gemessen statt geschätzt, und wie verhält sich das zu dem, was die Produktion verkraftet?
- **Liegt mindestens eine Kopie offline und getrennt?** Eine vom geschützten System aus erreichbare Sicherung teilt dessen Schicksal.
- **Wann wurde zuletzt eine vollständige Wiederherstellung durchgeführt?** Eine nie zurückgespielte Sicherung ist eine ungeprüfte Annahme mit einem Dateinamen.

**Eine praktische, günstige Disziplin: pro Quartal ein Asset im Wechsel auf ein Ersatzgerät oder einen Prüfplatz zurückspielen.** Der erste Zyklus findet typischerweise fehlende Werkzeugversionen, unvollständige Parametersätze und undokumentierte Schritte — Befunde, die am Prüfplatz billig und während eines Ausfalls teuer sind.

## Monitoring: die Pflichten des Programms

> Welche Abweichungen in einem OT-Netz eine Meldung verdienen und warum passive Beobachtung dort dem aktiven Scannen vorzuziehen ist, behandelt der Begleitbeitrag zur sicheren PLC-SCADA-Kommunikation. Dieser Abschnitt behandelt nur, was ein Programm — im Unterschied zu einem einzelnen Conduit — gewährleisten muss.

Drei Pflichten liegen auf Programmebene und nicht bei einem einzelnen System:

**Abdeckung über die Asset-Klassen, bewusst entschieden.** Steuerungen, Switches, Umrichter, Schutzgeräte, Engineering-Stationen und die DMZ liefern je andere Belege, und ein Programm, das nur dort erfasst, wo die Anbindung einfach war, hat eine Monitoring-Karte mit Löchern, die es selbst nicht sieht. Die Abdeckungsliste gehört neben das Asset-Inventar, mit einem ausdrücklichen Eintrag für die Assets, die nichts liefern.

**Eine Aufbewahrungsdauer, abgeleitet aus der Entdeckungslatenz.** Die Frage lautet nicht „wie lange können wir Protokolle halten“, sondern „wie lange kann ein Vorfall hier unbemerkt bleiben“ — in der OT häufig länger als in der IT, weil das erste Symptom eine betriebliche Auffälligkeit sein kann und keine Meldung. Eine kürzere Aufbewahrung als diese Latenz garantiert, dass die Belege vor Beginn der Untersuchung verfallen sind.

**Verantwortung für die Reaktion zu jeder Betriebsstunde.** Ein Befund um drei Uhr nachts braucht jemanden, dessen Aufgabe es ist zu handeln — mit der Befugnis dazu. Wo diese Person nicht existiert, hat das Programm Erkennung ohne Reaktion beschafft, und richtig ist, das auszusprechen, statt das Werkzeug als Maßnahme zu zählen.

## Altanlagen und ehrliche Risikoübernahme

Jede Anlage enthält Ausrüstung, die sich nicht patchen, dieses Jahr nicht ersetzen und auf Geräteebene nicht absichern lässt. Wer diese Lage nicht ausspricht, plant für eine Anlage, die er nicht betreibt.

Die ingenieurtechnische Antwort sind kompensierende Maßnahmen plus eine dokumentierte Entscheidung:

- Die Ausrüstung auf ein Segment beschränken, dessen Teilnehmer aufgezählt sind und dessen Grenze nach benannten Hosts filtert.
- Dieses Segment enger überwachen, denn ohne Schutz auf Geräteebene ist Verhalten der einzig verbleibende Beleg.
- Unnötige Exposition entfernen — Dienste, Ports und Verbindungen, die nur existieren, weil sie Vorgabe waren.
- Das Restrisiko, die kompensierenden Maßnahmen und den Ersatzplan mit Datum dokumentieren.
- **Das Risiko von jemandem übernehmen lassen, der dazu befugt ist.** Eine Fachkraft, die ein Risiko dokumentiert, tut ihre Arbeit; eine Fachkraft, die es still trägt, übernimmt eine Entscheidung, die ihr nicht zustand.

## Vorfallseindämmung und Wiederanlaufplanung

> Den Zielkonflikt innerhalb einer Isolationsentscheidung — was die Produktion beim Trennen eines Segments verliert und warum Trennen nicht automatisch die sichere Wahl ist — analysiert der Begleitbeitrag zur sicheren PLC-SCADA-Kommunikation. Es folgt, was ein Programm dieser Analyse schuldet: die Personen, die Übung und den Ausstieg.

Eine Isolationsanalyse, die nur als Dokument existiert, ist keine Fähigkeit. Vier Programmpflichten machen eine daraus.

**Benannte Entscheidungsbefugnis, rund um die Uhr.** Isolation stoppt oder beschränkt die Produktion; sie ist damit eine Geschäftsentscheidung, die unter Zeitdruck von den gerade Anwesenden getroffen wird. Ist die Befugnis nicht vorab benannt, fällt die Entscheidung an die ranghöchste anwesende Person, der womöglich sowohl das betriebliche Bild als auch das Mandat fehlt. Der Plan sollte Rolle und Vertretung benennen — und wer zu informieren statt zu konsultieren ist.

**Beweissicherung als geübte Fähigkeit.** Eine Wiederherstellung zerstört meist genau den Zustand, der erklären würde, was geschehen ist. Jemand muss vorab wissen, was wie zu sichern ist — und diese Fähigkeit muss überleben, dass dieselben Personen zugleich die Produktion zurückholen. Praktisch heißt das: eine kurze, konkrete Liste statt der Anweisung, „Beweise zu sichern“.

**Definierte Kriterien für die Rückkehr zum Normalbetrieb.** Das Wiederverbinden ist die Entscheidung, die am ehesten von Erschöpfung getroffen wird. Festzuhalten, was gelten muss, bevor die Grenze wieder öffnet — was verifiziert wurde, was aus einer bekannt guten Quelle wiederhergestellt ist, wer es bestätigt —, verwandelt ein Urteil in Stunde zwanzig in eine in Stunde null vereinbarte Prüfliste.

**Übung, mit den Menschen, die tatsächlich da wären.** Eine Tischübung mit Betrieb, Engineering, IT und Management kostet wenige Stunden und findet verlässlich mindestens eine falsche Annahme — meist eine nicht dokumentierte Abhängigkeit, also genau den Befund, den das Lesen des Plans nicht hervorbringt.

**Und die Rückbindung an die Wiederherstellung.** Eindämmung kauft Zeit; Wiederherstellung beendet das Ereignis. Ein Programm, das sauber isolieren und nicht zurückholen kann, hat sich für den längeren Ausfall entschieden — weshalb beides gemeinsam geplant wird und die oben beschriebene vierteljährliche Rückspielübung Teil derselben Fähigkeit ist und keine getrennte Hausaufgabe.

## Fehlermodi

**Inventar einmal erstellt, nie gepflegt.** Jede andere Maßnahme wirkt auf eine Fiktion.

**Aktives Scannen in Steuerungssegmenten.** Das Sicherheitswerkzeug verursacht den Verfügbarkeitsvorfall.

**Gemeinsame Engineering-Zugangsdaten.** Keine Zuordenbarkeit; für Ausgeschiedene weiterhin gültig.

**Zugriffsregelung, die eine notwendige Handlung blockiert.** Sie wird umgangen, und die Umgehung wird zum Verfahren.

**Sicherungen erstellt, nie zurückgespielt.** Entdeckt im denkbar schlechtesten Moment.

**Sicherung ohne Werkzeugversion.** Die Projektdatei kann von niemandem geöffnet werden.

**Sicherung vor statt nach der Änderung.** Die Wiederherstellung bringt die Anlage in eine nicht mehr passende Konfiguration.

**Firmware-Supportende ungeplant.** Ein vorhersehbares, datiertes Problem wird zum Notfall.

**Altanlagenrisiko still von einer Fachkraft getragen.** Eine Managemententscheidung, die per Voreinstellung fiel.

**Eindämmungsplan nie geübt.** Die erste Probe ist der Vorfall.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

In der Konzern-IT eines Bergbaubetriebs kommt es zu einem Sicherheitsvorfall. Die Anweisung des Reaktionsteams ist unmittelbar und eindeutig: die operative Technik vom Unternehmensnetz isolieren, bis die Lage verstanden ist.

Die Isolation selbst ist unkompliziert — die Firewall-Regel existiert und wirkt wie entworfen. Was folgt, ist es nicht.

Binnen einer Stunde treten drei Folgen auf, die niemand dokumentiert hatte. Die Bedienstationen der Anlage authentifizieren gegen das Konzernverzeichnis; bestehende Sitzungen laufen weiter, aber niemand kann sich anmelden — und der Schichtwechsel ist in zwei Stunden. Die Produktionsberichterstattung, die die Erzverfolgung speist, puffert lokal, was genau wie vorgesehen funktioniert. Und die Instandhaltung stellt fest, dass die aktuellen Fassungen zweier Engineering-Projektdateien ausschließlich auf einer Konzern-Dateifreigabe liegen, sodass jede Steuerungsarbeit während der Isolation ohne das maßgebliche Projekt auskommen müsste.

Keine dieser Folgen ist ein Fehler der Isolationsentscheidung, die richtig war. Es ist eine Anlage, die ihre Abhängigkeitsliste während eines Vorfalls entdeckt statt in einer Entwurfsprüfung.

Der Standort fährt zwei Tage erfolgreich im isolierten Zustand, weil die Regelung lokal blieb und die Bediener Sicht hatten. Die anschließende Abhilfe ist konkret und bescheiden: lokale Authentifizierung als Rückfall auf den Bedienstationen, eine maßgebliche OT-seitige Kopie der Engineering-Projekte mit definierter Synchronisationsrichtung und ein dokumentiertes Abhängigkeitsregister, das bei jeder neu vorgeschlagenen Integration geprüft wird.

**Die übertragbare Lehre: Der Eindämmungsplan war technisch solide und betrieblich ungeprüft. Jeder der drei Befunde hätte vorab Minuten gekostet und kostete während des Ereignisses Stunden — und überstanden wurden sie nur, weil die Regelung nie von der Unternehmensseite abhängig gemacht worden war.**

## Empfohlene Praxis

- Ein Asset-Inventar passiv aufbauen, Supportende und Datum der letzten Sicherungsverifikation erfassen und es über die Änderungskontrolle pflegen.
- Zonen nach betrieblicher Konsequenz ziehen; Richtlinien an Grenzen durchsetzen statt innerhalb von Zellen.
- Persönliche Konten mit aufgabengerechten Rollen nutzen, ergänzt um einen protokollierten Notfallzugang.
- Sicherstellen, dass der Austrittsprozess auch Leitsystem-Zugangsdaten erfasst.
- Firmware-Stände und Supportenden als Investitionsplanungsgröße führen.
- OT nach validiertem Plan mit dokumentiertem Rückweg patchen; jedem Asset einen Eigentümer zuweisen.
- Wechselmedien über ausgegebene Datenträger und eine Prüfstation kontrollieren; Engineering-Notebooks keine Zonen überbrücken lassen.
- Jede Änderung mit vorherigem Zustand, Verifikation und Sicherung nach der Änderung dokumentieren.
- Laufende Konfigurationen periodisch mit freigegebenen Kopien vergleichen.
- Programme, Projekte, Werkzeugversionen, Parametersätze und Netzkonfigurationen sichern; eine Kopie offline halten.
- Pro Quartal ein Asset im Wechsel zurückspielen und die Dauer des Gesamtablaufs messen.
- Protokolle von Geräten wegschreiben, ausreichend lange aufbewahren, Zeit synchronisieren und auf Abweichung vom dokumentierten Normal melden.
- Altanlagen eingrenzen, enger überwachen und ihr Restrisiko formal übernehmen lassen.
- Einen Eindämmungsplan schreiben, der je Isolationsfall den Verlust benennt, und ihn mit dem Betrieb üben.

## Fazit

Ein industrielles Sicherheitsprogramm wird im Ereignis beurteilt, und Ereignisse interessiert nicht, welche Produkte beschafft wurden. Sie prüfen, ob die Anlage weiß, was sie hat, ob Zugriffe zuordenbar und entziehbar sind, ob die Konfiguration in der Steuerung der abgelegten entspricht und ob der Standort das Nötige in einer Zeit zurückbringen kann, die die Produktion verkraftet.

Diese Fähigkeiten entstehen langsam und unspektakulär — ein durch Änderungskontrolle ehrlich gehaltenes Inventar, Zugangsdaten, die Personen gehören, Sicherungen, die tatsächlich zurückgespielt wurden, und ein Eindämmungsplan, den der Betrieb durchgegangen ist. Es sind zugleich die Fähigkeiten, die gegen Ursachen tragen, die niemand vorhergesehen hat — und das ist in diesem Feld die einzige realistische Entwurfsannahme.
