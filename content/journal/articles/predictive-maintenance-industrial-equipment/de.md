# Architektur der vorausschauenden Instandhaltung

## Zusammenfassung

Programme der vorausschauenden Instandhaltung scheitern selten aus technischen Gründen. Die Sensoren funktionieren, die Auswertung ist fachkundig, und die Degradation ist tatsächlich erkennbar. Was scheitert, ist die Architektur um die Erkennung herum.

Drei Aussagen ordnen diesen Beitrag.

**Die Instandhaltungsstrategie wird je Ausfallart gewählt, nicht je Anlage.** Eine einzelne Pumpe hat Ausfallarten, die Zustandsüberwachung rechtfertigen, Ausfallarten, die zeitbasiert billiger zu behandeln sind, Ausfallarten ohne jeden erkennbaren Vorläufer, und Ausfallarten, die konstruktiv beseitigt gehören. **Vorausschauende Instandhaltung ersetzt die vorbeugende nicht** — sie verdrängt den Teil, der Ausfallarten mit erkennbarer, langsam fortschreitender Degradation adressiert, und lässt den Rest genau dort, wo er war.

**Die Vorlaufzeit ist das Produkt.** Eine Erkennung, die zuverlässig, aber zwei Tage vor dem Ausfall eintrifft, hat in einem Betrieb mit zweiwöchigem Planungszyklus einen Alarm erzeugt und keine Vorhersage. Die nützliche Frage lautet nicht „können wir das erkennen?“, sondern „können wir es früh genug erkennen, um etwas anderes zu tun als zu reagieren?“

**Das Programm lebt von einem Glaubwürdigkeitsbudget.** Jede Meldung, die zu einer Inspektion ohne Befund führt, verbraucht davon. Ist es aufgebraucht, werden echte Erkennungen von denen abgewertet, die handeln müssten, und das Programm stirbt an Unglauben, lange bevor es jemand förmlich einstellt.

Dieser Beitrag behandelt die Strategiewahl je Ausfallart, wo Überwachungsaufwand hingehört, was jedes Verfahren sehen kann und was nicht, warum Datenqualität und Betriebskontext alles Nachgelagerte bestimmen, wie Basiswerte und Grenzwerte gesetzt gehören, und — im Zentrum — den Weg von der Erkennung bis zum abgeschlossenen Arbeitsauftrag mit rückgemeldetem Befund.

## Die Strategie wird je Ausfallart gewählt

| Strategie | Angemessen, wenn | Unangemessen, wenn |
| --- | --- | --- |
| **Betrieb bis zum Ausfall** | Folgen gering, Reparatur billig, Redundanz vorhanden oder keine Vorwarnung erreichbar | Der Ausfall hat Sicherheits-, Umwelt- oder große Produktionsfolgen |
| **Vorbeugend / zeit- oder zyklusbasiert** | Verschleiß ist alters- oder zyklusabhängig und vorhersagbar, der Eingriff billig, Erkennung unpraktikabel | Der Ausfall ist altersunabhängig zufällig — der Eingriff erhöht dann Risiko, ohne es zu senken |
| **Zustandsorientiert / vorausschauend** | Die Degradation ist erkennbar, entwickelt sich über ein nutzbares Intervall, und die Folgen rechtfertigen den Aufwand | Der Vorläufer ist nicht erkennbar oder entwickelt sich schneller, als die Organisation reagieren kann |
| **Konstruktiv beseitigen** | Derselbe Ausfall wiederholt sich und seine Ursache ist eine Auslegungs- oder Einsatzentscheidung | Der Ausfall ist einem unveränderlichen Prozess inhärent |

**Der Begriff, der das streng macht, ist das P-F-Intervall** — die Zeit zwischen dem Punkt, an dem ein sich anbahnender Ausfall erstmals erkennbar wird, und dem Punkt, an dem das Teil seine Funktion nicht mehr erfüllt. Zustandsüberwachung ist nur tragfähig, wenn zwei Bedingungen gelten:

- **Das Überwachungsintervall ist deutlich kürzer als das P-F-Intervall**, sodass der sich entwickelnde Zustand mindestens einmal, besser mehrfach, vor dem Funktionsausfall gesehen wird.
- **Das P-F-Intervall ist länger als die Reaktionszeit der Organisation** — erkennen, prüfen, diagnostizieren, planen, Teile beschaffen, Fenster terminieren, ausführen.

**Wo eine dieser Bedingungen verfehlt wird, sind mehr Sensoren nicht die Antwort.** Eine Ausfallart mit einem P-F-Intervall von Stunden lässt sich nicht mit einer Monatsroute beherrschen — und auch nicht mit Dauerüberwachung, wenn der Betrieb eine Woche zum Handeln braucht. Die richtige Reaktion ist eine andere Strategie: Redundanz, eine Schutzabschaltung, ein zeitbasierter Tausch oder eine Konstruktionsänderung.

**Und die Aussage, die klar ausgesprochen gehört, weil sie ständig überverkauft wird: Vorausschauende Instandhaltung beseitigt die vorbeugende nicht.** Gesetzliche Prüfungen bleiben. Ausfallarten ohne erkennbaren Vorläufer bleiben zeitbasiert. Eingriffe, die weniger kosten als die Überwachung, bleiben geplant. Schmierung, Reinigung und Kalibrierung bleiben. Ein reifes Programm hat *weniger* zeitbasierte Arbeit als ein unreifes und nie gar keine, und jeder Vorschlag, der anderes behauptet, beschreibt eine Teilmenge der Ausfallarten, als wäre sie die Gesamtheit.

## Kritikalität bestimmt, wohin der Aufwand geht

**Ein Programm, das alles überwacht, überwacht nichts gut.** Abdeckung kostet Hardware, Routenzeit, Auswertezeit und — am knappsten — Aufmerksamkeit.

Die Kritikalitätsbewertung verbindet die Ausfallfolge (Sicherheit, Umwelt, Produktionsverlust, Reparaturkosten, Ersatzteil-Lieferzeit) mit der Wahrscheinlichkeit und den vorhandenen Minderungen. **Redundanz und Ersatzteilverfügbarkeit gehören in die Bewertung**, denn eine doppelt ausgeführte Pumpe mit Ersatzteil im Lager hat eine ganz andere Ausfallfolge als eine Einstrangmaschine mit sechs Monaten Lieferzeit, selbst bei baugleichen Maschinen.

Das Ergebnis ist eine gestufte Abdeckungsentscheidung:

- **Dauerhaft instrumentierte Überwachung** für die wenigen Anlagen, deren Ausfall inakzeptabel ist oder deren P-F-Intervall kurz ist.
- **Periodische routenbasierte Überwachung** für die größere Population, wo das Intervall es erlaubt.
- **Überwachung über Prozessdaten** — mit ohnehin vorhandenen Messwerten — für alles, dessen Degradation sich als Wirkungsgrad, Temperaturanstieg, Durchsatzverlust oder Mehrverbrauch zeigt.
- **Keine Zustandsüberwachung** für Anlagen, bei denen Betrieb bis zum Ausfall oder Zeitbasis richtig ist — dokumentiert als Entscheidung, nicht als Auslassung.

**Die dritte Stufe ist die am wenigsten genutzte Ressource der meisten Betriebe.** Die Daten, die einen verschmutzten Wärmetauscher, eine verschleißende Pumpe, einen zugesetzten Filter oder einen nachlassenden Verdichter zeigen würden, werden meist bereits vom Leitsystem erfasst und im Historian gespeichert. Sie werden nicht ausgewertet, weil niemand die Frage besitzt.

## Was jedes Verfahren erkennt und was nicht

| Verfahren | Erkennt gut | Blind für | Charakter der Vorlaufzeit |
| --- | --- | --- | --- |
| **Schwingung** | Unwucht, Fluchtungsfehler, Lockerung, Lager- und Verzahnungsschäden, Resonanz | Fehler ohne mechanische Signatur; langsame thermische oder chemische Degradation | Lang bei Wälzlagerverschleiß; kurz bei manchen abrupten Mechanismen |
| **Temperatur und Thermografie** | Verschlechterte elektrische Verbindungen, Kühlungsverlust, Reibung, Blockade | Innere Zustände ohne Oberflächensignatur; alles bei geringer Last | Wechselnd; oft kurz, sobald sichtbar |
| **Motorstromanalyse** | Läufer- und manche Ständerzustände, lastseitige mechanische Probleme durch die Maschine hindurch, Netzzustände | Fehler, die den Strom nicht modulieren | Mittel; berührungslose Erfassung |
| **Schmierstoffanalyse** | Verschleißmetalle mit Bauteilzuordnung, Verunreinigung, Additivabbau, Wassereintrag | Plötzliche mechanische Ereignisse; alles außerhalb des Schmiersystems | Oft die längste von allen |
| **Ultraschall** | Druck- und Vakuumleckagen, frühe Lagerauffälligkeiten, elektrische Entladung | Grobe mechanische Zustände | Früh, verlangt aber disziplinierte Erfassung |
| **Prozessdaten** | Verschmutzung, Verengung, Wirkungsgradverlust, Kapazitätsrückgang, Mehrverbrauch je Einheit | Örtliche mechanische Fehler ohne Prozesswirkung | Meist lang; Daten meist bereits vorhanden |

**Zwei strukturelle Punkte folgen aus dieser Tabelle.**

**Ein auf ein Verfahren gestütztes Programm hat die Ausfallabdeckung dieses Verfahrens.** Schwingungsüberwachung ist hervorragend und erkennt keine sich verschlechternde elektrische Klemmstelle, keinen verunreinigten Schmierstoff und keinen verschmutzten Wärmetauscher. Abdeckung ist eine Auslegungsentscheidung, und zu benennen, welche Ausfallarten *nicht* abgedeckt sind, ist so wichtig wie zu benennen, welche es sind.

**Die Thermografie verdient eine eigene Warnung, weil sie so verbreitet falsch angewandt wird.** Eine thermische Aufnahme erkennt eine Temperaturdifferenz, und die hängt von der Last ab. **Eine Aufnahme bei geringer Produktion findet weit weniger als dieselbe bei Volllast**, und ein sauberer Bericht von einem ruhigen Sonntagmorgen ist nahezu wertlos. Die Last zum Aufnahmezeitpunkt ist Teil des Ergebnisses.

## Datenqualität und Kontext

Alles Nachgelagerte hängt an diesem Abschnitt, und hier scheitern die meisten Programme still.

**Vergleichbarkeit ist das ganze Spiel.** Ein Verlauf ist ein Vergleich über die Zeit, und ein Vergleich ist nur gültig, wenn die Bedingungen dieselben waren. **Ein Messwert, der an anderer Stelle, mit anderer Ankopplung, bei anderer Drehzahl oder anderer Last aufgenommen wurde, ist mit seinem Vorgänger nicht vergleichbar** — und ihn so zu behandeln erzeugt sowohl Fehlalarme als auch übersehene Befunde.

Die konkreten Disziplinen:

- **Feste Messpunkte**, körperlich markiert, damit jedes Mal dieselbe Stelle genutzt wird.
- **Eine feste Ankopplungsart** — der Sensorbeitrag zeigt, dass die Ankopplung den nutzbaren Frequenzbereich bestimmt, ein Verlauf mit Wechsel von Schraube auf Magnet sind also zwei zusammengeklebte Verläufe.
- **Definierte Betriebsbedingungen für die Erfassung**: benannte Drehzahl, Last und Prozesszustand, mit dem Messwert dokumentiert.
- **Korrekte und synchronisierte Zeitstempel**, ohne die keine Korrelation mit Ereignissen, Prozessänderungen oder anderen Messungen möglich ist.
- **Angemessene Abtastung und ehrliche Speicherung.** Ein Historian mit aggressiver Kompression oder breitem Totband verwirft genau die kleinen frühen Änderungen, für deren Erkennung das Programm existiert. **Kompressionseinstellungen sind eine Datenqualitätsentscheidung, getroffen von dem, der den Historian konfiguriert hat — meist ohne zu wissen, wofür die Daten dienen würden.**

**Und das am häufigsten fehlende Element: der Betriebskontext.** Last, Drehzahl, Produktqualität, Umgebungstemperatur, Betriebsstunden und die jüngste Instandhaltungshistorie erlauben es, eine Signaländerung dem Betriebsmittel statt dem Betrieb zuzuordnen. **Ohne Kontext sind die meisten Anomalien von einer Produktionsänderung nicht zu unterscheiden**, und ein Programm ohne Kontext verbraucht sein Glaubwürdigkeitsbudget an Meldungen, die sich mit „wir haben letzten Dienstag das Produkt gewechselt“ erklären.

**Auch Stammdaten sind ein Datenqualitätsproblem.** Messwerte an der falschen Anlage, doppelte Kennzeichnungen, getauschte Maschinen ohne Registeraktualisierung und bei einer Systemmigration umbenannte Punkte verfälschen Verläufe unsichtbar. Die verwirrendsten Datenprobleme eines Programms sind häufig Anlagenregisterprobleme.

## Basiswerte, Verläufe und Grenzwerte

**Ein Basiswert ist eine bewusste Messung eines bekannt guten Zustands unter definierten Bedingungen.** Er ist nicht „der erste Wert, den wir zufällig aufgenommen haben“, der eine bereits degradierte Maschine beschreiben kann — und eine im degradierten Zustand basisierte Maschine löst nie aus, weil ihre Degradation nun ihr Normalzustand ist.

Basiswerte nach Inbetriebnahme, nach Überholung und nach jeder Änderung an Maschine oder Aufstellung erheben und die Betriebsbedingungen mit dokumentieren.

**Der Verlauf schlägt den Absolutwert, und die Änderungsrate schlägt beides.** Eine Maschine, die stetig auf mittlerem Niveau liegt, ist meist weniger interessant als eine, die stetig von niedrigem Niveau steigt, und die Anstiegsrate macht aus einer Erkennung eine Vorlaufzeitabschätzung.

**Veröffentlichte Schwereklassifizierungen sind Populationsstatistik.** Schwingungszonen etwa klassifizieren Maschinen nach Bauart und Aufstellung und beschreiben, was für diese Population typisch ist. Sie sind eine nützliche Plausibilitätsprüfung und ein schlechter Ersatz für die Historie der Maschine selbst. **Eine Maschine kann innerhalb der veröffentlichten Zone liegen und sich relativ zu sich selbst deutlich verschlechtern.**

**Die Grenzwertsetzung ist eine betriebswirtschaftliche Entscheidung im technischen Gewand.** Jeder Grenzwert tauscht Fehlalarme gegen übersehene Befunde, und wo dieser Tausch liegen soll, hängt von der Ausfallfolge und den Kosten eines unnötigen Eingriffs ab:

| Grenzwertansatz | Stärke | Schwäche |
| --- | --- | --- |
| **Fester Pegel** | Transparent, prüfbar, leicht erklärbar | Falsch für untypische Maschinen; ignoriert die eigene Historie |
| **Statistisch aus der Historie** | Passt sich der Einzelmaschine an | Lernt den Zustand der Lernphase, einschließlich Degradation |
| **Adaptiv / laufend nachlernend** | Folgt legitimen Betriebsänderungen | Kann einen sich entwickelnden Fehler als normal nachlernen |
| **Änderungsrate** | Erkennt Entwicklungen früh, unabhängig vom Pegel | Empfindlich gegen Rauschen und Betriebstransienten |

**Anomalieerkennung erkennt Unterschied, nicht Fehler.** Eine Anomalie sagt, dass das aktuelle Verhalten dem gelernten unähnlich ist. Sie sagt nicht, was sich geändert hat, ob es zählt, oder ob die Ursache überhaupt beim Betriebsmittel liegt. **In einer realen Anlage sind die meisten Anomalien betrieblich**, und eine Anomalie in eine Fehlerdiagnose zu überführen verlangt Ingenieurwissen über Maschine und Kontext. Dieser Schritt ist nicht optional und vom auslösenden Detektor nicht automatisierbar.

## Von der Erkennung zur Entscheidung: der Ablauf, der tatsächlich scheitert

Hier sterben Programme, und das Versagen ist organisatorisch, nicht technisch.

**Die vollständige Kette:** Erkennung → Prüfung → Diagnose → Arbeitsdefinition → Planung → Teile → Terminierung → Ausführung → Verifikation → **Rückmeldung**.

**Die Bruchstellen:**

- **Die Meldung hat keinen Eigentümer.** Sie erscheint auf einem Dashboard, das niemandes Aufgabe ist, und bleibt dort.
- **Es gibt keine Prüfstufe.** Meldungen gehen direkt in Arbeitsaufträge, Betriebsänderungen werden zu Inspektionen, und das Glaubwürdigkeitsbudget leert sich.
- **Es gibt keinen Weg ins Instandhaltungssystem.** Zustandswerkzeug und Instandhaltungssystem sprechen nicht miteinander, aus einer Erkennung wird eine E-Mail, und aus einer E-Mail nichts.
- **Der Arbeitsauftrag trägt keine Nachweise.** Die Fachkraft erhält „Lager prüfen“ ohne Verlauf, Diagnose oder erwarteten Befund und kann nichts bestätigen oder widerlegen.
- **Der Befund wird nie zurückgemeldet.** Die Arbeit ist getan, die Maschine läuft, und niemand hält fest, ob die Diagnose stimmte. **Das ist die schädlichste Auslassung**, denn es ist der einzige Mechanismus, über den Grenzwerte, Modelle und Verfahrenswahl besser werden. Ein Programm ohne Rückmeldung hat dauerhaft die Treffsicherheit seines ersten Tages.

**Zur Schnittstelle mit dem Instandhaltungssystem** braucht es zwei Richtungen, und die meisten Anbindungen liefern eine. Zustandsdaten müssen eine Arbeitsanforderung *mit angehängtem Nachweis* auslösen können. Und die Befunde des abgeschlossenen Auftrags — was gefunden, was getauscht, wie der Zustand tatsächlich war — müssen zum Zustandsdatensatz zurückkehren, damit die Erkennung bewertet werden kann. **Eine Anbindung, die nur Meldungen ins CMMS schiebt, automatisiert die einfache Hälfte.**

**Und die Vorlaufzeitrechnung, die entscheidet, ob sich das alles lohnt:**

```text
required_lead_time = validation + diagnosis + planning + parts + scheduling window

usable = ( P-F interval  >  required_lead_time )   AND
         ( monitoring interval  <  P-F interval, with margin )

Notes and limits:
  - P-F interval is a property of the failure mode and the detection technique
    together; the same failure has a different P-F interval when detected by
    oil analysis than by vibration
  - required_lead_time is a property of the ORGANISATION, and it is the part
    most often left unmeasured
  - if the inequality fails, adding sensors does not fix it; either detect
    earlier with a different technique, or change the maintenance strategy
  - parts lead time frequently dominates and is the cheapest term to reduce
```

## Das Glaubwürdigkeitsbudget

**Jedes Programm hat einen endlichen Vorrat an Vertrauen, und Fehlalarme verbrauchen ihn.**

Ein **Fehlalarm** — eine Meldung, deren Untersuchung nichts findet — kostet die Inspektion, die Störung und ein Stück Vertrauen. Ein **übersehener Befund** — ein Ausfall, den das Programm nicht erkannte — kostet den Ausfall selbst plus den weit schädlicheren Schluss, das Programm funktioniere nicht.

**Beide werden über den Grenzwert gegeneinander getauscht**, und der richtige Tausch unterscheidet sich nach Kritikalität. Eine Maschine, deren Ausfall die Anlage stoppt, rechtfertigt einen empfindlichen Grenzwert und die damit einhergehenden Fehlalarme. Eine Maschine mit Reserve und Ersatzteil nicht.

**Die Asymmetrie, die Programme still zerstört, lautet: Fehlalarme sind sichtbar, sofort und dem Programm zugeschrieben; übersehene Befunde sind bis zum Ausfall unsichtbar und werden Pech zugeschrieben.** Der organisatorische Druck wirkt daher nur in eine Richtung, Grenzwerte werden nach jeder ergebnislosen Inspektion angehoben, und das Programm driftet ins Schweigen. Niemand beschließt, die Erkennung einzustellen; es geschieht Grenzwertanpassung für Grenzwertanpassung.

**Die Gegenmaßnahmen sind unspektakulär und wirksam:**

- **Menschliche Prüfung vor dem Handeln.** Eine Fachkraft, die eine Meldung gegen den Betriebskontext prüft, entfernt die meisten betrieblich erklärbaren Fehlalarme in Minuten und zu sehr geringen Kosten. Das ist der Schritt mit der höchsten Rendite im gesamten Ablauf.
- **Beide Fehlerarten erfassen und veröffentlichen.** Ein Programm, das seine eigene Trefferquote nicht kennt, ist weder steuerbar noch verteidigbar und kann seine Grenzwerte nicht begründen.
- **Grenzwerte gegen die Aufzeichnung prüfen**, bewusst und periodisch, statt reaktiv nach jeder Peinlichkeit.
- **Berichten, was das Programm verhindert hat**, in den Begriffen des Betriebs — vermiedene Stillstände, vermiedene Folgeschäden, in geplante Arbeit umgewandelte Ausfälle. Ein Programm, das seinen Wert so nicht beschreiben kann, wird ungeachtet seiner technischen Güte irgendwann gestrichen.

## Governance und Lebenszyklus

- **Eigentümerschaft.** Das Programm braucht einen Eigentümer, jede Meldung braucht einen Eigentümer, und die Regelung muss Personalwechsel überstehen. Programme hängen häufig vollständig an einer begeisterten Person und enden mit deren Weggang.
- **Kompetenz.** Technik ohne Auswertefähigkeit erzeugt Daten, die niemand in Entscheidungen überführt. Diese Fähigkeit aufzubauen oder einzukaufen ist Teil des Programms, kein Nachgedanke.
- **Konfigurationsmanagement der Überwachung selbst.** Ein geänderter Grenzwert, ein versetzter Sensor, ein neu skalierter Kanal, eine andere Ankopplung — jedes davon hebt die Vergleichbarkeit auf und gehört **als Ereignis in den Verlauf** dokumentiert, damit ein Sprung in den Daten richtig zugeordnet wird. Sonst wird eine Wartungsmaßnahme am Überwachungssystem zum scheinbaren Maschinenfehler.
- **Die Historie ist der Vermögenswert.** Jahre an Verlaufsdaten sind der aufgebaute Wert des Programms und gehen bei Systemmigrationen, Umbenennungen und Plattformwechseln routinemäßig verloren. Datenerhalt und -migration sind eine Governance-Pflicht, kein IT-Detail.
- **Periodische Überprüfung der Kritikalitätsbewertung.** Anlagen ändern ihre Kritikalität mit Prozessen, Redundanz und Produktionsplänen, und eine vor fünf Jahren getroffene Abdeckungsentscheidung kann heute auf die falschen Maschinen zeigen.

## Fehlermodi

**Strategie je Anlage statt je Ausfallart gewählt.** Manche Arten werden überwacht, andere bleiben still unabgedeckt, und niemand weiß welche.

**Vorausschauend als Ersatz für vorbeugend dargestellt.** Gesetzliche, zufallsbedingte und günstige Eingriffe werden still gestrichen.

**P-F-Intervall nie abgeschätzt.** Überwachung in einem Intervall, das die Entwicklung nicht sehen kann.

**Reaktionszeit der Organisation nie gemessen.** Erkennung erreicht, Handeln unmöglich.

**Alles instrumentiert.** Aufmerksamkeit so verteilt, dass nichts ordentlich ausgewertet wird.

**Prozessdaten ignoriert.** Die billigste Abdeckung im Betrieb, bereits erfasst, nie betrachtet.

**Thermografie bei geringer Last durchgeführt.** Ein sauberer Bericht ohne Aussage.

**Messpunkt, Ankopplung oder Betriebszustand zwischen Messungen verändert.** Zwei Verläufe zusammengeklebt und als einer gelesen.

**Basiswert an bereits degradierter Maschine erhoben.** Ihre Degradation wird dauerhaft ihr Normalzustand.

**Historian-Kompression verwirft frühe kleine Änderungen.** Das gesamte Signal des Programms durch eine Konfigurationseinstellung entfernt.

**Betriebskontext nicht mit dem Messwert dokumentiert.** Jede Anomalie ist von einer Produktionsänderung ununterscheidbar.

**Messwerte der falschen Anlage zugeordnet.** Verwirrende Daten, verursacht vom Anlagenregister.

**Veröffentlichte Schwerezonen als einziger Grenzwert genutzt.** Populationsstatistik statt der eigenen Historie.

**Adaptive Grenzwerte lernen einen sich entwickelnden Fehler als normal.** Der Detektor passt sich dem Ausfall an.

**Anomalie als Diagnose behandelt.** Unterschied als Fehler gemeldet und der Ingenieurschritt übersprungen.

**Meldungen ohne Eigentümer.** Ein Dashboard, für das niemand verantwortlich ist.

**Kein Weg von der Erkennung ins Instandhaltungssystem.** Aus einer Erkennung wird eine E-Mail.

**Arbeitsauftrag ohne Nachweise ausgelöst.** Die Fachkraft kann die Diagnose weder bestätigen noch widerlegen.

**Befunde nie zurückgemeldet.** Die Treffsicherheit des Programms bleibt auf dem Stand des ersten Tages.

**Grenzwerte reaktiv nach jeder ergebnislosen Inspektion angehoben.** Drift ins Schweigen, eine Anpassung nach der anderen.

**Trefferquote nie gemessen.** Ein Programm, das bei der Budgetprüfung nicht zu verteidigen ist.

**Verlaufshistorie bei einer Systemmigration verloren.** Jahre aufgebauten Werts zerstört von einem Projekt, das nicht wusste, was es transportierte.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Standort betreibt seit sechs Jahren ein routenbasiertes Schwingungsprogramm. In dieser Zeit hat es nachweislich keinen einzigen Ausfall verhindert, mehrere erhebliche Maschinenausfälle traten ohne Vorwarnung auf, und das Programm steht nun zur Einstellung an. Die Messtechnik ist einwandfrei und die auswertende Person fachkundig.

```text
Symptom:
A six-year vibration monitoring programme with no demonstrable prevented
failures and several undetected machine failures, despite sound hardware and
a competent analyst.

Evidence:
- route readings have been taken by several different technicians over the
  years, with no photographic record of measurement points
- some machines have permanent studs, others are measured with a magnet, and
  a few points have changed method partway through the history
- no operating condition is recorded with the readings; machines are measured
  at whatever load they happen to be running
- three of the failed machines are variable-speed and were measured at
  different speeds on different visits
- the baseline for two machines was established after they had already been
  in service for several years
- alarm thresholds were raised twice, in both cases following an inspection
  that found nothing
- the historian holding the trend data applies a deadband that suppresses
  small changes
- one genuine early detection exists in the record: an alert was raised, an
  email was sent, and no work order was ever created — the machine failed
  eleven weeks later
- no record exists of any completed work order's findings being compared with
  the diagnosis that prompted it
- the site's average time from work request to scheduled execution is longer
  than the P-F interval assumed by the monitoring interval for several of the
  covered failure modes

Reasoning:
The programme has four independent defects and none of them is the technology.

The data was never comparable. Different technicians, different mounting
methods, unrecorded and varying load and speed, and a deadband suppressing
small changes together mean that a trend on this site is not a measurement of
machine condition over time — it is a mixture of machine condition,
acquisition method and operating point. Two of the baselines describe already
degraded machines, so those machines could not trigger against themselves.

The workflow had no route to action. The one detection the programme
genuinely achieved died between an email and a work order, which is the most
informative single fact in the record: the detection capability existed and
the organisation could not convert it.

The thresholds were managed reactively. Both increases followed unproductive
inspections, which is the asymmetry that pushes every unmanaged programme
toward silence.

And there is no feedback loop at all, so none of these defects could have been
discovered by the programme itself. Six years of operation produced no learning
because nothing was ever scored.

Next investigations:
- audit the acquisition standard: fix and photograph measurement points,
  standardise mounting, and define the operating condition required for a
  valid reading
- re-baseline every covered machine under defined conditions and record the
  conditions
- review the historian's compression and deadband settings against what the
  programme needs to see
- measure the organisation's actual detection-to-execution time and compare it
  against the P-F interval for each covered failure mode
- define an alert owner, a validation step and a route into the work
  management system that carries the evidence
- introduce outcome recording so every alert is eventually scored as
  confirmed, not confirmed, or not investigated
- re-examine coverage: identify which failure modes on critical assets are not
  addressed by vibration at all
```

**Die übertragbare Lehre lautet: Die technische Erkennung dieses Programms funktionierte, und alles darum herum nicht.** Es fand einen echten sich entwickelnden Ausfall elf Wochen im Voraus — eine wirklich brauchbare Vorlaufzeit — und die Organisation hatte keinen Mechanismus, danach zu handeln. Bessere Sensoren hätten nichts geändert. Die Abhilfen sind ein Erfassungsstandard, ein definierter Ablauf mit Eigentümer und die Befunddokumentation — nichts davon braucht neue Hardware.

## Empfohlene Praxis

- Die Instandhaltungsstrategie je Ausfallart wählen, nicht je Anlage, und dokumentieren, welche Arten abgedeckt sind und welche bewusst nicht.
- Ausdrücklich festhalten, dass vorausschauende Arbeit einen Teil des vorbeugenden Programms verdrängt statt es zu ersetzen, und gesetzliche, zufallsbedingte und günstige Eingriffe auf ihrer bisherigen Grundlage belassen.
- Das P-F-Intervall je überwachter Ausfallart abschätzen und das Überwachungsintervall deutlich kürzer setzen.
- **Die eigene Reaktionszeit der Organisation messen** — Prüfung, Diagnose, Planung, Teile, Terminierung — und vor der Festlegung auf ein Verfahren mit dem P-F-Intervall vergleichen.
- Die Abdeckung aus einer Kritikalitätsbewertung ableiten, die Redundanz und Ersatzteil-Lieferzeit einschließt, und sie periodisch überprüfen.
- Vorhandene Prozessdaten als Abdeckungsstufe nutzen, bevor neue Messtechnik beschafft wird.
- Das Verfahren auf die Ausfallarten abstimmen und benennen, welche Arten unabgedeckt bleiben.
- Thermografisch unter repräsentativer Last aufnehmen und die Last mit dem Ergebnis dokumentieren.
- Messpunkte körperlich festlegen, die Ankopplung standardisieren und die Betriebsbedingung zu jeder Messung dokumentieren.
- Basiswerte bewusst an bekannt guten Maschinen nach Inbetriebnahme oder Überholung erheben, mit dokumentierten Bedingungen.
- Kompression, Totband und Aggregation des Historians gegen den tatsächlichen Auswertebedarf prüfen.
- Den Betriebskontext zu jedem Messwert dokumentieren, denn ohne ihn ist eine Anomalie nicht zuzuordnen.
- Grenzwerte als ausdrücklichen, nach Kritikalität differenzierten Tausch zwischen Fehlalarm und übersehenem Befund setzen und gegen die Aufzeichnung prüfen, nicht nach jeder Peinlichkeit.
- Eine Anomalie als Hinweis auf eine Veränderung behandeln und vor der Arbeitsauslösung eine Ingenieurdiagnose verlangen.
- Jeder Meldung einen Eigentümer und eine Prüfstufe geben, bevor sie zum Arbeitsauftrag wird.
- Einen Weg ins Instandhaltungssystem schaffen, der den Nachweis mitführt, und einen Rückweg, der die Befunde zurückbringt.
- Jede Meldung als bestätigt, nicht bestätigt oder nicht untersucht bewerten und die Trefferquote veröffentlichen.
- Änderungen am Überwachungssystem als Ereignisse im Verlauf dokumentieren, damit Konfigurationsänderungen nie als Maschinenfehler gelesen werden.
- Die Verlaufshistorie über Migrationen hinweg schützen; sie ist der aufgebaute Wert des Programms.
- Die Ergebnisse in den Begriffen des Betriebs berichten — vermiedene Stillstände, vermiedene Folgeschäden, in geplante Arbeit umgewandelte Ausfälle.

## Fazit

Zustandsüberwachung ist eine reife und wirksame Ingenieurdisziplin, und der Grund, aus dem so viele Programme enttäuschen, hat mit dieser Disziplin fast nichts zu tun. Er liegt in einer auf der falschen Ebene gewählten Strategie, in Daten, die nie vergleichbar waren, in einer Vorlaufzeit, die niemand gegen eine ebenfalls ungemessene organisatorische Reaktionszeit gehalten hat, und vor allem im fehlenden Weg von einer Erkennung zu einem abgeschlossenen Auftrag mit dokumentiertem Befund.

Die Technik ist der billige Teil. Das Programm ist der Teil, der einen Eigentümer, einen Erfassungsstandard, eine ausdrückliche Grenzwertpolitik, einen Ablauf mit Anbindung an die Instandhaltung und eine Rückmeldeschleife braucht, damit das Programm lernt, was es richtig erkannt hat. Baut man diese, liefert bescheidene Messtechnik über Jahrzehnte echten Nutzen. Lässt man sie aus, erzeugen die besten verfügbaren Sensoren sechs Jahre Verläufe, auf die niemand handeln konnte.
