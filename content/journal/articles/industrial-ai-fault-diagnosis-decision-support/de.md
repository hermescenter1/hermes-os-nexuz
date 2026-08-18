# Industrielle KI für Fehlerdiagnose und Entscheidungsunterstützung

## Zusammenfassung

Gelernte Modelle sind in der industriellen Diagnose wirklich nützlich, und der nützliche Teil ist schmaler und konkreter, als das Versprechen üblicherweise nahelegt. Drei Grenzen definieren das Gebiet, und alle drei gehören geklärt, bevor ein Modell in Betrieb geht.

**KI schlägt vor; deterministische Logik und Menschen entscheiden.** Sicherheitsgerichtete Funktionen und Schutzsysteme sind deterministisch, unabhängig nachgewiesen und prüfbar, und **keine gelernte Ausgabe löst sie aus.** Das ist keine Aussage über den heutigen Stand der Technik, die sich mit besseren Modellen ändert — es ist ein Auslegungsgrundsatz, denn eine Sicherheitsfunktion muss vorab beweisbar sein, und das Verhalten eines gelernten Modells bei einer nie gesehenen Eingabe ist vorab nicht beweisbar.

**Die Konfidenz eines Modells ist eine Aussage über das Modell, nicht über die Welt.** Ein Modell, das nach einem Anlagenzustand gefragt wird, der nichts in seinen Trainingsdaten ähnelt, liefert meist eine Antwort — und häufig eine zuversichtliche. Das ist der charakteristische Fehlermodus gelernter Systeme in der Industrie, und er bleibt unsichtbar, solange nicht etwas außerhalb des Modells prüft, ob die Frage überhaupt eine ist, die das Modell beantworten darf.

**Der Wert liegt im Nachweis, nicht im Urteil.** Ein System, das meldet „diese fünf Messstellen wichen in dieser Reihenfolge gemeinsam ab, anders als bei den vorangegangenen zweihundert Anläufen, und die nächstliegende historische Entsprechung ist dieses Datum“, hat etwas erzeugt, worauf eine Ingenieurin handeln und was eine Untersuchung prüfen kann. Ein System, das „Lagerschaden, 87 %“ meldet, hat etwas erzeugt, das man nur glauben oder nicht glauben kann.

Dieser Beitrag behandelt, wo gelernte Modelle deterministische Verfahren schlagen und wo nicht, was Industriedaten mit Modellen anstellen, warum Konfidenz und Beweishinlänglichkeit verschiedene Fragen sind, was Erklärbarkeit leisten muss, um nützlich zu sein, die geschichtete Architektur, die Sicherheit deterministisch hält, wie menschliche Prüfung echt statt zeremoniell wird, und die Governance, ohne die ein Modell zu einer undokumentierten Anlagenänderung wird.

Das Instandhaltungsprogramm, dem eine Diagnosefähigkeit dient, behandelt der Begleitbeitrag zur vorausschauenden Instandhaltung; die zugrunde liegende ingenieurtechnische Beweisführung — die gilt, ob ein Modell beteiligt ist oder nicht — der Begleitbeitrag zur nachweisgestützten Diagnostik.

## Wo ein gelerntes Modell hilft und wo nicht

| Aufgabe | Besserer Ansatz | Grund |
| --- | --- | --- |
| Grenzwertüberschreitung, Verriegelung, Schutz | **Deterministisch** | Vorab beweisbar, prüfbar, auditierbar, driftet nicht |
| Physikalisch bekannte Zusammenhänge — Massenbilanz, Wirkungsgrad, erwarteter Druckverlust | **Berechnung aus ersten Prinzipien** | Erklärbar, generalisiert über die beobachteten Daten hinaus, Annahmen sind einsehbar |
| Erkennen feiner multivariater Abweichung vom Normalbetrieb | **Gelerntes Modell** | Der Normalbereich ist hochdimensional und korreliert; niemand kann ihn aufschreiben |
| Einordnen eines Fehlers in bekannte Klassen aus etikettierter Historie | **Gelerntes Modell, wenn die Labels stimmen** | Labels sind die knappe Ressource, nicht der Algorithmus |
| Muster in einem großen Melde- und Ereigniskorpus finden | **Gelerntes Modell oder statistische Auswertung** | Das Volumen schlägt jede manuelle Durchsicht, und die Muster sind real |
| Relevante Historie, Dokumente und frühere Fälle auffinden | **Gelernte Suche** | Geringes Risiko: Die Ausgabe liest ein Mensch, der die Relevanz beurteilt |
| Diagnose eines wirklich neuartigen Ausfalls | **Keines von beiden** | Aus der Historie Gelerntes deckt keinen Mechanismus ab, der nie aufgetreten ist |

**Die daraus folgende Regel: Greifen Sie zum gelernten Modell, wenn der Zusammenhang real, aber nicht aufschreibbar ist.** Kann eine fachkundige Person die Regel benennen, dann schreiben Sie die Regel — sie wird genauer sein, dauerhaft auditierbar, und sie braucht kein Nachtraining, wenn sich die Anlage ändert. Gelernte Modelle verdienen ihren Platz dort, wo das Muster in den Daten existiert, sich aber nicht als überschaubare Menge von Bedingungen ausdrücken lässt.

**Und die letzte Zeile ist die ehrliche Grenze.** Ein aus Historie gebautes Modell kann keinen Ausfallmechanismus erkennen, der nie aufgetreten ist, und die schmerzhaftesten Ausfälle sind häufig die neuartigen. Ein Anomaliedetektor bemerkt vielleicht, dass *etwas* anders ist — das ist wertvoll — aber er kann nicht sagen, was, und er wird nicht besser sein als eine aufmerksame Fachkraft vor demselben Verlauf.

## Was Industriedaten mit Modellen anstellen

Die Schwierigkeiten hier sind nicht die aus dem Consumer-Maschinenlernen bekannten, und jede von ihnen hat produktive Systeme auf eine bestimmte Weise scheitern lassen.

**Labels sind knapp und unzuverlässig.** Ausfallereignisse sind in einem gut geführten Betrieb selten — das ist der Sinn der Sache —, die positive Klasse ist also klein. Schlimmer noch: Labels stammen meist aus Arbeitsaufträgen, die für Kostenzuordnung und Fortschrittsverfolgung geschrieben werden, nicht als Trainingsdaten. **Das erfasste Datum ist typischerweise das Reparaturdatum, nicht der Beginn**, ein darauf trainiertes Modell lernt also, den Instandhaltungsplan vorherzusagen statt den Ausfall.

**Klassenungleichgewicht macht Treffergenauigkeit zu einer sinnlosen Kennzahl.** Ein Modell, das immer „normal“ sagt, erzielt eine hervorragende Genauigkeit und erkennt nichts. Maßgeblich sind Erkennungsrate und Fehlalarmrate an einem gewählten Arbeitspunkt, und beide gehören gemeinsam genannt — einzeln sagt keine etwas aus.

**Nichtstationarität ist der Normalfall, und sie ist überwiegend gewollt.** Die Anlage ändert sich: Produktqualität, Einsatzstoff, Durchsatz, Jahreszeit, Überholung, Reglerneueinstellung, geänderte Betriebsanweisung. **Ein auf der Anlage des Vorjahres trainiertes Modell hat eine Konfiguration gelernt, über die der Standort inzwischen hinausgegangen ist.** In Consumer-Anwendungen ist Drift meist schleichend; in der Industrie sind die größten Driftereignisse technische Änderungen, absichtlich vorgenommen von Menschen, denen niemand gesagt hat, dass ein Modell vom alten Verhalten abhängt.

**Betriebskontext ist unerlässlich und meist nicht vorhanden.** Ohne Last, Rate, Produkt und Betriebsart lernt ein Modell Scheinkorrelationen und „erkennt“ danach zuverlässig den nächsten Produktwechsel. Es ist dieselbe Forderung, die der Zustandsüberwachungsbeitrag an die menschliche Auswertung stellt — und Modelle können ihr Fehlen schlechter kompensieren als Menschen.

**Sensorfehler sehen genau aus wie Prozessfehler.** Ein Modell, das auf einem Zeitraum mit einem unentdeckt driftenden Messumformer trainiert wurde, lernt die Drift als legitimes Verhalten und meldet anschließend den korrekt kalibrierten Ersatz als Anomalie.

**Die Datenaufbereitung verändert die Antwort still.** Zeitstempelversatz zwischen Quellen, Historian-Kompression und Totbänder sowie Resampling-Entscheidungen erzeugen oder zerstören Korrelationen. **Eine Korrelation, die erst nach dem Resampling erscheint, ist eine Eigenschaft des Resamplings.**

**Und Leckage hat eine industriespezifische Form.** Die klassische Variante ist ein Merkmal, das dem Ergebnis nachgelagert ist; die industrielle Variante ist ein Signal, das sich nur deshalb änderte, weil Instandhaltung bereits terminiert war — ein zur Freischaltung gestelltes Ventil, eine gestartete Reserve, eine von einer aufmerksamen Bedienperson reduzierte Rate. Das Modell erzielt dann beeindruckende Ergebnisse, indem es lernt, dass Menschen Bescheid wussten.

## Konfidenz, Unsicherheit und Beweishinlänglichkeit

Das sind drei verschiedene Dinge, und die Unterscheidungen tragen die Sicherheitsargumentation.

**Ein Konfidenzwert ist eine Modellausgabe.** Ist er nicht ausdrücklich gegen Ergebnisse kalibriert, ist er keine Wahrscheinlichkeit der Richtigkeit — und die Kalibrierung selbst wird auf der Trainingsverteilung geschätzt, verfällt also genau dann, wenn die Eingabe sich von dieser Verteilung entfernt.

**Zwei Arten von Unsicherheit verhalten sich verschieden, und nur eine wird standardmäßig gut behandelt:**

- **Unsicherheit, weil die Daten verrauscht sind.** Bei gegebenem Messumfang nicht reduzierbar; mehr Daten helfen nicht. Modelle bilden das meist angemessen ab.
- **Unsicherheit, weil das Modell dies noch nie gesehen hat.** Das ist die gefährliche, denn ein außerhalb seines Trainingsbereichs extrapolierendes Modell ist nicht bloß unsicher — es ist häufig zuversichtlich und falsch, und nichts an seiner eigenen Ausgabe zeigt den Unterschied.

**Die architektonische Antwort ist eine Anwendbarkeitsprüfung als erstklassige Komponente**, ausgewertet *bevor* die Modellantwort genutzt wird: Ähnelt diese Eingabe dem Bereich, auf dem trainiert wurde? Ein Modell, das nach einem nie gesehenen Zustand gefragt wird, sollte „ich weiß es nicht“ antworten, und die meisten können das nicht — **also muss das „ich weiß es nicht“ um sie herum gebaut werden**, als ausdrückliche Prüfung auf Verteilungsfremdheit mit eigenem Schwellwert und eigenem Eskalationspfad.

**Beweishinlänglichkeit ist wiederum eine andere Frage, und sie betrifft das Modell gar nicht.** Sie fragt, ob überhaupt genug unabhängige, gültige Nachweise für einen Schluss vorliegen. Sind drei der fünf Signale, auf die eine Diagnose sich stützt, nicht verfügbar, auf Hand oder von zweifelhafter Gültigkeit, dann ist keine Konfidenzzahl aussagekräftig, wie auch immer trainiert wurde. **„Beweislage unzureichend“ muss ein erstklassiges Ergebnis sein** — eine eigene Ausgabe, kein niedriger Zahlenwert, denn ein niedriger Wert lädt dazu ein, auf die zweitwahrscheinlichste Option zu handeln.

Die drei Fragen, in der Reihenfolge, in der sie gestellt gehören:

```text
1. Is this input within the region the model can speak about?      (applicability)
2. Is there enough valid, independent evidence to conclude anything? (sufficiency)
3. What does the model conclude, and how confident is it?           (model output)

Notes and limits:
  - answering (3) without (1) is the characteristic failure of deployed
    industrial models: a confident answer about an unfamiliar state
  - (2) is a property of the plant and its instrumentation at this moment,
    not of the model; a healthy model on degraded data still cannot conclude
  - a "low confidence" output and an "insufficient evidence" output demand
    different responses, and collapsing them into one number removes the
    distinction the operator needs
```

## Erklärbarkeit, die tatsächlich brauchbar ist

Der Zweck der Erklärung im industriellen Umfeld ist praktisch, nicht philosophisch: **Eine Fachkraft muss entscheiden können, ob sie handelt, und eine Untersuchung muss die Entscheidung im Nachhinein prüfen können.**

**Was tatsächlich hilft:**

- **Welche Signale beitrugen, und in welcher zeitlichen Reihenfolge.** Reihenfolge ist diagnostisch, eine statische Wichtigkeitsliste nicht.
- **Was vom Normalzustand abweicht, in technischen Einheiten.** Nicht „Anomaliewert 4,2“, sondern „die Austrittstemperatur liegt über dem Band, das diese Maschine bei dieser Last seit zwei Jahren einnimmt“.
- **Welchen historischen Episoden dies ähnelt**, mit Datum, damit nachgelesen werden kann, was damals geschah.
- **Was den Schluss ändern würde** — die Frage, die aus einer Ausgabe einen Untersuchungsplan macht.

**Und die Warnung, die zählt: Eine Erklärung ist keine Begründung.** Ein Modell kann für einen falschen Schluss eine plausibel wirkende Zuschreibung erzeugen, und Zuschreibungsverfahren haben eigene Annahmen und Fehlermodi. **Die Erklärung muss gegen Physik und Prozesswissen prüfbar sein**, und der praktische Test ist einfach: **Kann eine fachkundige Person den Befund aus den gelieferten Nachweisen bestätigen oder widerlegen, ohne das Modell erneut laufen zu lassen?** Wenn nicht, hat das System ein Urteil im Gewand einer Erklärung erzeugt.

## Deterministische Randbedingungen und sichere Entscheidungsgrenzen

Dieser Abschnitt entscheidet, ob eine Einführung sicher ist, und er ist architektonisch, nicht algorithmisch.

**Schichten Sie das System und benennen Sie ausdrücklich, welche Schicht welche ist:**

| Schicht | Charakter | Verhältnis zur KI-Schicht |
| --- | --- | --- |
| **Sicherheitsgerichtete Funktionen, Schutz** | Deterministisch, unabhängig nachgewiesen, prüfbar, ruhestromsicher | Vollständig unabhängig; von der KI-Schicht weder beeinflusst noch für sie erreichbar |
| **Basisautomatisierung und Verriegelungen** | Deterministisch, konstruiert, auditierbar | Darf informiert werden; erhält ohne deterministisches Tor keine Befehle |
| **Beratende und diagnostische Schicht** | Gelernte Modelle, Analytik, Entscheidungsunterstützung | Verbraucht Daten, erzeugt Nachweise und Empfehlungen |

**Die Richtungsregel:** Information fließt frei von der Automatisierung nach oben; **Befehle fließen nicht nach unten ohne ein deterministisches Tor, und alles Folgenreiche bekommt zusätzlich einen Menschen.**

**Technische Randbedingungen wirken als harte Filter auf alles, was die KI-Schicht vorschlägt.** Gradientenbegrenzungen, Freigaben, Verriegelungen und Betriebsbereiche weisen eine ungültige Empfehlung ohne Diskussion zurück. **Eine Empfehlung, die eine Freigabe verletzt, ist keine schwierige Ermessensfrage; sie wird von der Freigabe zurückgewiesen** — und dass sie überhaupt entstand, ist ein Befund über das Modell.

**Die ruhestromsichere Grenze hat einen einfachen Test.** Wird die KI-Schicht nicht verfügbar, langsam oder falsch, muss die Anlage genau so weiterlaufen, wie sie es ohne sie täte. **Verschlechtert der Verlust des Modells die Regelung, ist das Modell Teil der Regelung geworden** — und muss dann deren Anforderungen an Determinismus, Prüfung, Verfügbarkeit und Änderungsmanagement erfüllen, was die meisten gelernten Modelle nicht können.

**Eskalation ist ein entworfenes Verhalten, kein Notbehelf.** Scheitert die Anwendbarkeitsprüfung, ist die Beweislage unzureichend oder ist die Konfidenz in folgenreichem Kontext gering, so ist die richtige Ausgabe eine Eskalation an einen Menschen *mit angehängtem Nachweis* — nie eine stille Auswahl der wahrscheinlichsten Option.

**Und das Spektrum von beratend bis autonom gehört bewusst und schrittweise durchschritten:**

- Beratend gegenüber einer Fachkraft, offline. Geringste Nachweislast; der Mensch hat Zeit und Kontext.
- Beratend gegenüber der Bedienung in Echtzeit, mit empfohlener Handlung. Jetzt steht der Mensch unter Zeitdruck, die Darstellung der Nachweise wird damit sicherheitsrelevant.
- Automatische Handlung innerhalb eines begrenzten, umkehrbaren Bereichs mit deterministischen Grenzen. Verlangt nachgewiesene Leistung, begrenzte Folgen und einen geprüften Rückfall.
- Sicherheitsfunktionen. **Nein.**

## Menschliche Prüfung, die keine Inszenierung ist

**Ein Mensch, der eine Empfehlung freigibt, die er nicht bewerten kann, ist keine Kontrolle; er ist eine Haftungsverlagerung.** Sinnvolle Prüfung verlangt dreierlei, und Organisationen liefern routinemäßig nur das Erste: **die Nachweise**, **die Zeit** und **die Stellung, ohne beruflichen Nachteil zu widersprechen.**

**Automatisierungsbias ist der Mechanismus, der das aushöhlt.** Menschen akzeptieren Empfehlungen von Systemen, die meistens recht haben, und die Akzeptanzrate steigt mit dem Ruf des Systems — die menschliche Prüfung schwächt sich also genau dann ab, wenn die verbleibenden Fehler seltener, seltsamer und folgenreicher werden. **Ein System, das in 95 % der Fälle recht hat, wird geprüft; eines mit 99,5 % wird geglaubt, und seine Fehler kommen ungeprüft durch.**

**Die Gegenmaßnahmen sind konkret:**

- **Nachweise zeigen, keine Urteile.** Ein Urteil lädt zur Annahme ein; Nachweise laden zur Beurteilung ein.
- **Widerspruch billig und dokumentiert machen**, mit erfasstem Grund. Ein dokumentiertes Übersteuern ist Datenmaterial; ein stilles ist nichts.
- **Angenommene Empfehlungen prüfen, nicht nur abgelehnte.** Der Fehlermodus ist unkritische Annahme, und Stichproben allein unter den Ablehnungen können ihn nicht finden.
- **Die Übersteuerungsrate messen und eine Rate nahe null als Warnung lesen.** Weit wahrscheinlicher zeigt sie, dass die Prüfung nicht mehr wirkt, als dass das Modell perfekt geworden ist.

## Modell-Governance und Lebenszyklus

**Reproduzierbarkeit ist die Anforderung, auf der alles andere ruht.** Hat das System zu einer später untersuchten Entscheidung beigetragen, müssen Sie rekonstruieren können, was es sagte und warum. Das heißt: Modell, Trainingsdaten, Merkmalsdefinitionen, Schwellwerte und Konfiguration gemeinsam versionieren und angeben können, welche Version an welchem Tag aktiv war. **Ein System, dessen frühere Ausgaben nicht rekonstruierbar sind, kann an einer Vorfalluntersuchung nicht teilnehmen** — und es wird irgendwann in eine verwickelt sein.

**Nachtraining ist eine Änderung an einem Anlagensystem.** Es gehört ins Änderungsmanagement, ist zu dokumentieren und gegen einen zurückgehaltenen Testdatensatz zu validieren, der nicht zum Training genutzt wurde. **Ein Modell, das sich still selbst nachtrainiert, ist eine undokumentierte Änderung**, und dass die Entwickler es so vorsahen, macht sie nicht dokumentiert.

**Überwachen Sie im Betrieb drei Dinge**, in steigender Bedeutung:

- **Drift der Eingangsverteilung** — ist die Anlage noch die Anlage, auf der trainiert wurde?
- **Drift der Ausgangsverteilung** — ändert sich das Verhalten des Modells?
- **Ergebnisverfolgung gegen die Wirklichkeit** — hatte es recht? Nur diese Größe zählt wirklich, und sie verlangt die Rückkopplung aus dem Beitrag zur vorausschauenden Instandhaltung: jede Meldung wird am Ende als bestätigt, nicht bestätigt oder nicht untersucht bewertet.

**Immer und wiederholt gegen den einfachen Ansatz benchmarken.** Ein gelerntes Modell, dem sich kein Vorsprung gegenüber der ersetzten Grenzwertregel oder Physikrechnung nachweisen lässt, gehört zurückgezogen, und dieser Vergleich gehört periodisch wiederholt statt einmal bei der Beschaffung. Komplexität, die sich nicht rechnet, ist eine Last mit Wartungskosten.

**Planen Sie die Außerbetriebnahme.** Modelle verfallen, wenn sich die Anlage ändert, Produktfamilien auslaufen und die Person weiterzieht, die das Feature-Engineering verstand. Ein Rückzugsplan gehört zur Einführung, nicht zum Eingeständnis eines Scheiterns.

## Einführungsarchitektur

Kurz halten und ausdrücklich entscheiden:

- **Wo die Inferenz läuft.** Am Rand: geringe Latenz, funktioniert bei ausgefallener Verbindung, begrenzte Rechenleistung, aufwendigere Aktualisierung. Zentral: leichter zu verwalten und zu aktualisieren, abhängig von der Verbindung, zusätzliche Latenz. Die Wahl folgt daraus, was beim Verbindungsausfall geschehen soll.
- **Der Datenpfad und seine Fehlermodi.** Was passiert, wenn eine Messstelle nicht mehr aktualisiert, ein Zeitstempel falsch ist, der Historian zurückhängt? **Ein Modell mit veralteten Daten erzeugt zuversichtliche Aussagen über die Vergangenheit** — die Erkennung von Veralterung gehört in den Datenpfad, nicht ins Modell.
- **Eine standardmäßig lesende Grenze zu den Automatisierungssystemen**, mit jedem schreibenden Pfad ausdrücklich entworfen, torgesichert und begründet.
- **Sicherheit** folgt der OT-Sicherheitsarchitektur der Anlage und der Segmentierung aus den Begleitbeiträgen; eine Analyseplattform ist ein neues System mit neuer Konnektivität und unterliegt derselben Zonen- und Conduit-Disziplin wie alles andere.

## Fehlermodi

**Ein gelerntes Modell eingesetzt, wo eine Regel möglich gewesen wäre.** Ungenauer, schlechter auditierbar und nun nachtrainingspflichtig.

**Labels aus Arbeitsauftragsdaten übernommen.** Das Modell lernt den Instandhaltungsplan.

**Treffergenauigkeit als Kennzahl auf unausgewogenen Daten.** Ein Modell, das nichts erkennt, schneidet gut ab.

**Kein Betriebskontext unter den Merkmalen.** Scheinkorrelationen und zuverlässige Erkennung von Produktwechseln.

**Auf einem Zeitraum mit unentdecktem Sensorfehler trainiert.** Der Fehler wird als normal gelernt und der korrekte Ersatz gemeldet.

**Leckage aus Signalen, die sich änderten, weil Menschen es bereits bemerkt hatten.** Beeindruckende Ergebnisse, die den Betrieb nicht überstehen.

**Konfidenz als Wahrscheinlichkeit der Richtigkeit behandelt.** Kalibrierung unterstellt und genau dann verfallen, wenn es zählt.

**Keine Anwendbarkeits- oder Verteilungsfremdheitsprüfung.** Zuversichtliche Antworten über nie gesehene Zustände — der charakteristische industrielle Fehlschlag.

**„Beweislage unzureichend“ in einen niedrigen Konfidenzwert gefaltet.** Die Bedienung handelt auf die zweitwahrscheinlichste Option.

**Urteile statt Nachweisen dargestellt.** Nichts lässt sich bestätigen, widerlegen oder prüfen.

**Zuschreibung als Begründung akzeptiert.** Eine plausible Erklärung für einen falschen Schluss.

**Ein Empfehlungspfad in die Automatisierung ohne deterministisches Tor.** Die Sicherheitsargumentation ist nun das Modellverhalten.

**Anlagenverhalten verschlechtert sich bei nicht verfügbarem Modell.** Das Modell ist Teil der Regelung geworden, ohne deren Anforderungen zu erfüllen.

**Stille Auswahl der wahrscheinlichsten Option unter Unsicherheit.** Die Eskalation, die hätte erfolgen müssen, erfolgte nicht.

**Menschliche Freigabe ohne Nachweise, Zeit oder Widerspruchsstellung.** Eine Haftungsverlagerung, als Kontrolle dargestellt.

**Übersteuerungsrate nahe null, als Erfolg gelesen.** Die Prüfung wirkt nicht mehr.

**Modell ohne Änderungsmanagement nachtrainiert.** Eine undokumentierte Änderung an einem Anlagensystem.

**Frühere Ausgaben nicht reproduzierbar.** Das System kann an der Untersuchung, in die es verwickelt ist, nicht teilnehmen.

**Nie gegen die deterministische Alternative gebenchmarkt.** Komplexität ohne nachgewiesenen Nutzen und mit dauerhaften Wartungskosten.

**Veraltete Daten unbemerkt verarbeitet.** Zuversichtliche Aussagen über die Vergangenheit.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Anomaliedetektor wird an einem Verdichterstrang eingeführt, trainiert auf einem Jahr historischen Betriebs. Acht Monate lang arbeitet er gut: wenige Meldungen, von denen die meisten etwas entsprechen, das eine Fachkraft als ungewöhnlich bestätigt. Dann wechselt der Betrieb den Einsatzstoff, und das System erzeugt eine anhaltende Meldeflut. Das Team hebt den Anomalieschwellwert an, um wieder brauchbares Verhalten herzustellen. Drei Monate später erleidet der Strang einen erheblichen Ausfall, den das System nicht gemeldet hatte.

```text
Symptom:
An anomaly detector that performed well for eight months, produced a burst of
alerts after a feedstock change, was desensitised in response, and then failed
to flag a genuine failure three months later.

Evidence:
- the training data covers one year of operation on the previous feedstock
  only
- the model's inputs are process and vibration signals; feedstock grade,
  throughput and operating mode are not among its inputs
- there is no out-of-distribution or applicability check: the model produces
  an anomaly score for any input it is given
- during the alert burst the model's scores were high and its internal
  confidence was high
- the threshold was raised once, immediately after the burst, with no
  recorded analysis and no test against historical failures
- the model was retrained once during the eight months; no record identifies
  the training data, the version or the date, and the earlier version cannot
  be reconstructed
- at the time of the missed failure, the operating state was still outside
  the range represented in any available training data
- no outcome tracking exists: none of the earlier alerts was ever scored as
  confirmed or not confirmed
- the deterministic protection on the train operated correctly and limited
  the damage

Reasoning:
Three architectural omissions, one organisational reflex, and no learning
loop.

The model had no operating context in its inputs, so it learned the previous
feedstock's behaviour as the definition of normal. When the feedstock changed,
the plant moved to a legitimately different operating region, and every point
in that region was correctly identified as unlike the training data — which
the system could only express as "anomaly", because it had no vocabulary for
"unfamiliar". The burst of alerts was, in a narrow sense, the model working
exactly as built and being asked a question it was not equipped to answer.

The absence of an applicability check is what made this dangerous rather than
merely noisy. With such a check the system would have reported that the input
had left the region it can speak about, which is an accurate and actionable
statement. Without it, the only available output was a confident anomaly score,
and the only available remedy appeared to be desensitisation.

Raising the threshold then silenced the symptom without addressing the cause,
and it did so at exactly the moment the model's coverage of the new operating
region was weakest. The missed failure occurred while the input was still
outside anything the model had been trained on, so the model was never capable
of detecting it — and nobody knew that, because nothing in the architecture
reported the model's own coverage.

Finally, no outcome tracking existed. None of the eight months of alerts had
been scored, so there was no evidence base from which the threshold change
could have been evaluated, and no way to notice that the model's useful
performance had ended.

Next investigations:
- determine the operating regions represented in the training data and compare
  them with the regions the plant has actually occupied since deployment
- add operating context — feedstock, throughput, mode — as model inputs, and
  re-establish what "normal" means per context
- implement an applicability check that reports "outside trained region" as a
  distinct output with its own escalation, separate from "anomalous"
- reconstruct which model version was live at each point, and record the gap
  as a governance finding
- introduce outcome scoring for every alert and re-derive the threshold from
  evidence rather than from the desire for silence
- benchmark the model against the deterministic limits already present on the
  train, since those operated correctly throughout
```

**Drei übertragbare Lehren.** Erstens: **Ein Modell, das nicht sagen kann „das habe ich noch nie gesehen“, sagt stattdessen etwas anderes** — und das andere wird zuversichtlich sein. Zweitens: **Die Schwellwerterhöhung war derselbe organisatorische Reflex, der Zustandsüberwachungsprogramme still tötet** — sie brachte eine unbequeme Ausgabe ohne Nachweis zum Schweigen —, hier aber traf sie ein System, dessen Abdeckung tatsächlich weggefallen war, und machte aus einer beherrschbaren Lage eine blinde. Drittens: **Der deterministische Schutz tat seine Arbeit.** Diese Schicht war unabhängig, prüfbar und von allem darüber unbeeinflusst — genau deshalb verläuft die Grenze dort, wo sie verläuft.

## Empfohlene Praxis

- Die Regel schreiben, wo sie schreibbar ist; gelernte Modelle für Zusammenhänge reservieren, die real, aber nicht ausdrückbar sind.
- Die Schichtgrenze ausdrücklich ziehen und dokumentieren: Sicherheit und Schutz sind deterministisch und unabhängig, und keine gelernte Ausgabe löst sie aus.
- Information frei von der Automatisierung nach oben fließen lassen und Befehle nie nach unten ohne deterministisches Tor und, bei folgenreichen Handlungen, einen Menschen.
- Technische Randbedingungen — Freigaben, Verriegelungen, Gradientengrenzen, Betriebsbereiche — als harte Filter auf jeden Vorschlag der Analyseschicht anwenden.
- Die ruhestromsichere Grenze prüfen: bestätigen, dass die Anlage bei fehlendem Modell identisch arbeitet, und jede Verschlechterung als Beleg dafür werten, dass das Modell Teil der Regelung geworden ist.
- Betriebskontext in die Modelleingänge aufnehmen und „normal“ je Kontext definieren statt global.
- Labels als knappe Ressource behandeln: prüfen, was die erfassten Daten wirklich bedeuten, und nie auf Reparaturdaten trainieren, als wären es Beginndaten.
- Erkennungsrate und Fehlalarmrate gemeinsam an einem benannten Arbeitspunkt nennen; nie Treffergenauigkeit auf unausgewogenen Daten.
- Eine Anwendbarkeits- oder Verteilungsfremdheitsprüfung als erstklassige Komponente bauen, ausgewertet vor der Nutzung der Modellantwort.
- „Beweislage unzureichend“ als eigene Ausgabe mit eigener Eskalation führen, getrennt von geringer Konfidenz.
- Nachweise in technischen Einheiten darstellen — welche Signale, in welcher Reihenfolge, abweichend wovon, und was den Schluss ändern würde — statt Punktwerte und Urteile.
- Verlangen, dass eine fachkundige Person einen Befund aus den gelieferten Nachweisen ohne erneuten Modelllauf bestätigen oder widerlegen kann.
- Der menschlichen Prüfung Nachweise, Zeit und die berufliche Stellung zum Widerspruch geben und Übersteuerungen mit Grund dokumentieren.
- Angenommene wie abgelehnte Empfehlungen prüfen und eine Übersteuerungsrate nahe null als Warnung behandeln.
- Modell, Daten, Merkmale, Schwellwerte und Konfiguration gemeinsam versionieren und jede frühere Ausgabe rekonstruieren können.
- Nachtraining durch das Änderungsmanagement führen, gegen zurückgehaltene Daten validieren und jede Version mit ihren Einsatzzeiträumen dokumentieren.
- Eingangsdrift, Ausgangsdrift und vor allem Ergebnisse gegen die Wirklichkeit überwachen, mit letztlicher Bewertung jeder Meldung.
- Veraltete Daten in der Kette erkennen, statt sich darauf zu verlassen, dass das Modell es bemerkt.
- Bei der Einführung und danach periodisch gegen die deterministische Alternative benchmarken und Modelle ohne nachweisbaren Vorteil zurückziehen.
- Die Außerbetriebnahme als Teil der Einführung planen.

## Fazit

Die ingenieurtechnische Frage lautet nicht, ob gelernte Modelle in der industriellen Diagnose nützlich sind. Das sind sie, in einer klar umrissenen Menge von Aufgaben, in denen das Muster real und nicht aufschreibbar ist — und sie werden für Meldekorpus-Auswertung und Historienrecherche unterausgenutzt, während sie für Probleme überausgenutzt werden, die ein Grenzwert löste.

Die ingenieurtechnische Frage lautet, was das System tut, wenn es außerhalb seiner Kompetenz ist — und diese Frage beantwortet die Architektur, nicht die Modellgüte. Eine Einführung, die die Anwendbarkeit prüft, bevor sie antwortet, die unzureichende Beweislage als eigenes Ergebnis meldet, die Nachweise liefert, die ein Mensch prüfen kann, die eskaliert statt zu raten, die jede Sicherheitsfunktion deterministisch und unabhängig hält und die rekonstruieren kann, was sie im vergangenen März sagte, ist ein System, mit dem man jahrelang arbeiten kann.

Eine Einführung ohne diese Eigenschaften erzeugt unbegrenzt zuversichtliche Antworten, auch über Zustände, von denen sie nichts weiß — und ihre gefährlichste Phase beginnt unmittelbar, nachdem alle gelernt haben, ihr zu vertrauen.
