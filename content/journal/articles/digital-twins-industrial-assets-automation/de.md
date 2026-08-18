# Digitale Zwillinge für Industrieanlagen und Automatisierung

## Zusammenfassung

Der Begriff „digitaler Zwilling“ ist so weit gedehnt worden, dass er alles von einer dreidimensionalen Darstellung bis zu einem Dashboard mit Livewerten abdeckt — und diese Dehnung hat ihm seine technische Bedeutung gekostet. Sie zurückzugewinnen erfordert eine Unterscheidung und eine Behauptung.

**Die Unterscheidung ist der Datenfluss.** Ein **digitales Modell** hat keinen automatischen Datenaustausch mit der physischen Anlage — jemand aktualisiert es, wenn er daran denkt. Ein **digitaler Schatten** hat einen automatischen einseitigen Fluss von der physischen Anlage zur digitalen Abbildung, also ein Live-Dashboard auf einer Simulation. Ein **digitaler Zwilling** hat automatischen Fluss in beide Richtungen, die digitale Abbildung spiegelt die Anlage also nicht nur, sondern wirkt auch auf sie. **Das meiste, was digitaler Zwilling heißt, ist ein digitaler Schatten, und ein erheblicher Teil ist ein digitales Modell mit angehängter Livewertliste.** Das ist keine Wortklauberei: Die drei haben verschiedene Kosten, verschiedene Risiken und völlig verschiedene Governance-Anforderungen.

**Die Behauptung lautet, dass der Wert nie das Bild war.** Eine Visualisierung, die die Anlage spiegelt, ist beeindruckend und diagnostisch leer. **Das technische Erzeugnis eines Zwillings ist das Residuum — die Differenz zwischen dem, was das Modell vorhersagte, und dem, was die Anlage tat** — denn in dieser Differenz steckt jede Erkenntnis: Degradation, Verschmutzung, Leckage, Verschleiß, eine falsche Annahme oder ein driftendes Messgerät.

Und ein weiterer Gedanke trägt den größten praktischen Wert dieses Beitrags: **In einem physikbasierten Modell ist ein geschätzter Parameter ein physikalisch bedeutungsvoller Zustandsindikator.** Ein laufend aus Betriebsdaten geschätzter Verschmutzungswiderstand, isentroper Wirkungsgrad oder Durchflusskoeffizient ist kein Anomaliewert — er ist eine Zahl, die eine Fachkraft bereits zu deuten weiß, gegen die Auslegung vergleichen und auf einen Reinigungstermin hin verfolgen kann.

Dieser Beitrag behandelt die drei Definitionen und ihre jeweilige Berechtigung, physikbasiert gegenüber datengetrieben gegenüber hybrid, was Synchronisation tatsächlich verlangt, die Genauigkeitsgrenzen, die eine gute Visualisierung verdeckt, virtuelle Inbetriebnahme und was sie beweist und nicht beweist, die Integrationsgrenzen zu Automatisierungssystemen, und die Governance, ohne die ein Zwilling still von der Anlage abdriftet und weiter zuversichtliche Zahlen liefert.

Die Erwägungen zu gelernten Modellen — Konfidenz, Anwendbarkeit, Erklärbarkeit, Sicherheitsgrenzen — stehen im Begleitbeitrag zur industriellen KI und gelten uneingeschränkt für jede datengetriebene Komponente eines Zwillings.

## Modell, Schatten, Zwilling

| | **Digitales Modell** | **Digitaler Schatten** | **Digitaler Zwilling** |
| --- | --- | --- | --- |
| **Datenfluss** | Manuell, gelegentlich, beide Richtungen | Automatisch, physisch → digital | Automatisch, beide Richtungen |
| **Wofür geeignet** | Auslegungsstudien, Dimensionierung, Offline-Szenarien | Überwachung, Zustandsableitung, Residuenanalyse, Prognose | Regelkreisoptimierung, automatische Anpassung |
| **Divergenzrisiko** | Hoch und offensichtlich | Mittel und über Residuen erkennbar | Mittel und folgenreich, weil er handelt |
| **Governance-Last** | Gering | Mittel — er beeinflusst Entscheidungen | Hoch — er ist Teil des Betriebssystems der Anlage |

**Der größte industrielle Wert liegt in der mittleren Spalte, und das ist ein wirklich guter Ort.** Ein gut gepflegter digitaler Schatten, der laufend Prognose und Messung vergleicht, liefert Zustandsableitung, Softsensorik und Frühwarnung, ohne je in die Anlage zu schreiben — und trägt einen Bruchteil der Nachweislast von allem, was handelt.

**Die richtige Frage zu Projektbeginn lautet daher, welches der drei gebaut wird**, denn die Antwort bestimmt Prüfanforderungen, Sicherheitsgrenze, Änderungsmanagementpflichten und Kosten. Ein Projekt, das „digitaler Zwilling“ sagt und einen Schatten baut, hat meist das Richtige gebaut und falsch benannt; eines, das „digitaler Zwilling“ sagt und ein Modell mit Livewerten baut, hat ein Dashboard gebaut.

## Physikbasiert, datengetrieben und hybrid

| Ansatz | Stärke | Schwäche | Richtig, wenn |
| --- | --- | --- | --- |
| **Physikbasiert** | Erklärbar, extrapoliert über die Beobachtung hinaus, Parameter haben technische Bedeutung | Verlangt bekannte Physik und Aufbauaufwand; empfindlich gegen nicht modellierte Effekte | Die maßgebenden Beziehungen bekannt sind und zählen |
| **Datengetrieben** | Erfasst Verhalten, das niemand aufschreiben kann; schnell aufgebaut, wo Daten existieren | Extrapoliert nicht; Parameter ohne physikalische Bedeutung; braucht Nachtraining bei Anlagenänderung | Der Zusammenhang real, komplex und nicht ausdrückbar ist |
| **Hybrid** | Physik liefert die Struktur, Daten liefern die vorab unbekannten Parameter | Mehr Aufwand als beides einzeln; braucht beide Kompetenzen | Bei fast allen Anlagenzwillingen |

**Der hybride Fall verdient den Nachdruck, weil sich dort der diagnostische Wert konzentriert.** Nehmen Sie einen Wärmetauscher. Seine maßgebenden Beziehungen sind gut bekannt und aufschreibbar; nicht aufschreibbar ist der Verschmutzungswiderstand, der sich laufend ändert und diesem Apparat in diesem Betriebsfall eigen ist. **Schätzen Sie diesen Parameter online aus den Messwerten, und die Schätzung ist der Zustandsindikator** — mit Einheit, mit einem Auslegungswert zum Vergleich, mit einem physikalisch sinnvollen Verlauf und mit einer klaren betrieblichen Entscheidung daran.

**Das ist eine kategorial andere Ausgabe als ein Anomaliewert**, und der Unterschied zählt in der Praxis: Über einen Verschmutzungswiderstand lässt sich streiten. Man kann ihn gegen die letzte Reinigung, gegen die Auslegung, gegen den Schwesterapparat im selben Dienst halten. Ein Anomaliewert bietet nichts davon.

**Dasselbe Muster verallgemeinert sich.** Isentroper Verdichterwirkungsgrad, hydraulischer Pumpenwirkungsgrad, Ventildurchflusskoeffizient, Verlustkoeffizient eines Motors, Wärmedurchlasswiderstand einer Dämmung — jeweils ein Parameter mit technischer Bedeutung, aus Routinebetriebsdaten schätzbar und als Zustandsindikator verfolgbar.

**Und er trägt die Warnung, aus der das Szenario am Ende dieses Beitrags entsteht: Ein geschätzter Parameter absorbiert alles, was das Modell sonst nicht erklärt**, einschließlich Messfehler. Genau diese Eigenschaft macht ihn nützlich und genau sie macht ihn gefährlich.

## Was Synchronisation tatsächlich verlangt

„Mit der Anlage synchronisiert“ ist leicht gesagt und hat vier konkrete Anforderungen, die alle regelmäßig unterschätzt werden.

**Die richtigen Zustandsgrößen mit der richtigen Rate.** Das Aktualisierungsintervall muss kurz gegenüber der abgebildeten Dynamik sein. Ein Modell eines thermischen Prozesses mit minütlicher Aktualisierung kann genügen; dasselbe Intervall auf ein schnelles hydraulisches oder elektrisches Phänomen angewandt bildet nichts ab. **Die Anforderung setzt der Prozess, nicht die Bequemlichkeit der Datenkette.**

**Konsistente Initialisierung.** Ein dynamisches Modell muss in einem physikalisch konsistenten Zustand starten. Eine Initialisierung aus einer Momentaufnahme mit leicht verschiedenen Zeitpunkten oder inkonsistenten Werten erzeugt ein Modell, das mit einem von niemandem aufgeprägten Übergang beginnt — der anschließend als Residuum gedeutet wird.

**Zeitliche Ausrichtung über Quellen hinweg.** Dieselbe Disziplin, die der Beitrag zur Ausfalluntersuchung für Zeitstrahlen verlangt, gilt hier fortlaufend: Messwerte mit unterschiedlichen Latenzen und Zeitstempeln werden gegen einen Modellzustand gehalten, und jede Fehlausrichtung erscheint als Residuum.

**Periodische Neuverankerung für Prognoseläufe.** Ein schneller als Echtzeit laufendes Modell sammelt Fehler aus den eigenen Näherungen. **Es muss in einem definierten Intervall aus Messwerten neu initialisiert werden, oder sein Prognosehorizont muss so kurz sein, dass der angesammelte Fehler vertretbar bleibt** — und was davon gilt, ist eine ausdrückliche Auslegungsentscheidung mit genanntem Horizont, nichts, das man im Betrieb entdeckt.

## Datentreue und die Scheingenauigkeit

**Ein Zwilling kann nur so gut sein wie das, was man ihm gibt, und eine gute Visualisierung verdeckt das.** Das ist die spezifische Gefahr dieser Darstellungsform: eine glatt gerenderte Abbildung mit Werten auf drei Nachkommastellen, gebaut auf einer Messung, deren Unsicherheit ein Prozent beträgt und deren Kalibrierung vor zwei Jahren zuletzt geprüft wurde.

**Nicht gemessene Zustände müssen geschätzt oder angenommen werden**, und jede Annahme wird zu einer stillen Abhängigkeit, genau wie die konfigurierten Konstanten im Beitrag zur Sensorauswahl. Umgebungsbedingungen, Zusammensetzungen, ungemessene Ströme und Stoffwerte sind die üblichen Kandidaten. **Die Annahmen eines Zwillings gehören aufgelistet, verantwortet und überprüft**, denn eine Prozessänderung entwertet sie, ohne das Modell zu berühren.

**Das Residuum ist nur so vertrauenswürdig wie das Messgerät.** Driftet eine Messung, bewegt sich das Residuum, und das Modell schreibt die Bewegung dem Mechanismus zu, den es enthält. Deshalb hebt ein Zwilling den Bedarf an Messgerätepflege nicht auf — **er erhöht ihn**, denn der Zwilling verwandelt nun Messfehler in scheinbare Prozessbefunde.

**Und benennen Sie die Unsicherheit.** Ein Residuum kleiner als die Messunsicherheit ist kein Befund. Ein Zwilling, der Differenzen meldet, ohne zu sagen, welche Differenz signifikant ist, lädt dazu ein, Rauschen zu verfolgen.

## Anwendungen, die ihre Kosten verdienen

**Die virtuelle Inbetriebnahme** ist die reifste und am besten begründbare Anwendung. Steuerungslogik wird gegen eine simulierte Anlage geprüft, bevor die physische existiert, und findet Ablauffehler, Verriegelungsfehler, Meldefluten und Betriebsartübergangsfehler in einer Phase, in der sie billig sind. **Die ehrliche Grenze lautet, dass sie die Logik gegen das Modell prüft, nicht gegen die Wirklichkeit** — und in der Lücke dazwischen leben die verbleibenden Fehler. Das Verhalten der Feldgeräte ist die übliche Lücke: Ventilstellzeiten, Sensorfilterung und -ansprechen, Totzeit, Antriebsrampen und die physischen Verzögerungen, die nur an realer Ausrüstung auftreten. **Virtuelle Inbetriebnahme verringert den Aufwand vor Ort; sie ersetzt ihn nicht**, und sie als Ersatz zu behandeln erzeugt ein zuversichtliches Team vor einer nicht modellierten Wirklichkeit.

**Bedienertraining** an einem synchronisierten Modell, besonders für Störfälle, die sich in der realen Anlage nicht herbeiführen lassen.

**Bewertung vor einer Änderung.** Eine geplante Betriebsänderung, eine neue Sollwertstrategie oder eine geänderte Ablaufsteuerung vor der Umsetzung gegen das Modell fahren — mit ausdrücklich benannten Genauigkeitsgrenzen im Ergebnis.

**Zustandsableitung und Softsensorik**, wie oben beschrieben: schätzen, was nicht direkt messbar ist, weil kein Gerät existiert oder weil es in diesem Dienst unzuverlässig ist.

**Leistungsvergleich.** Den Apparat gegen sich selbst über die Zeit, gegen die Auslegung und gegen Schwesterapparate im selben Dienst halten — Letzteres ist ungewöhnlich aufschlussreich, weil es viele gemeinsame Annahmen auf einmal kontrolliert.

## Integration mit SPS und SCADA

**Die Grenzdisziplin ist dieselbe wie im Beitrag zur industriellen KI, und aus denselben Gründen.**

- **Im Produktivbetrieb liest ein Schatten und schreibt nicht.** Das ist die Vorgabe, und davon abzuweichen macht aus dem Projekt etwas mit deutlich größerer Nachweislast.
- **Jeder Schreibpfad wird ausdrücklich entworfen, deterministisch torgesichert und begründet.** Ein Zwilling, der Sollwerte verstellt, wirkt an der Regelung mit, und die technischen Randbedingungen der Anlage — Freigaben, Verriegelungen, Gradientengrenzen, Betriebsbereiche — gelten für seine Ausgabe wie für alles andere.
- **Sicherheitsfunktionen bleiben deterministisch und unabhängig.** Ein Zwilling wirkt daran nicht mit.
- **Verfügbarkeitsanforderungen folgen dem Zweck.** Ein Schatten, der eine wöchentliche Reinigungsentscheidung stützt, darf einen Tag ausfallen. Alles, wovon der Betrieb abhängt, erbt die Verfügbarkeitsanforderungen der Anlage.

**Für die virtuelle Inbetriebnahme im Besonderen** erfolgt die Kopplung entweder als Software-in-the-Loop (Steuerungscode gegen eine Simulation) oder als Hardware-in-the-Loop (die reale Steuerung an einer simulierten Anlage). Hardware-in-the-Loop prüft mehr vom realen System, einschließlich Zykluszeitverhalten und Kommunikation, und ist entsprechend nützlicher. **Die wesentliche Regel in beiden Fällen: Die Simulationsumgebung darf keine Abhängigkeit des Produktivsystems werden**, und der Übergang von simulierter zu realer E/A muss ein bewusster, geprüfter, dokumentierter Schritt sein und kein Konfigurationsschalter, den jemand falsch setzen kann.

## Modelldrift, Lebenszyklus und Governance

**Ein Zwilling driftet standardmäßig von seiner Anlage weg.** Die Anlage wird laufend geändert, umgewidmet, nachgerüstet, neu instrumentiert und neu eingestellt. Der Zwilling wird aktualisiert, wenn jemand daran denkt. **Die Divergenz ist still, denn ein abgedrifteter Zwilling läuft weiter, sieht weiter richtig aus und liefert weiter plausible Zahlen** — und seine Ausgaben bleiben durchweg zuversichtlich.

**Die wichtigste Governance-Aussage lautet daher: Der Zwilling gehört in das Änderungsmanagement der Anlage.** Eine Änderung, die die Anlage betrifft, muss eine Überprüfung des Zwillings auslösen, und diese Überprüfung ist als erledigt oder ausdrücklich zurückgestellt zu dokumentieren. Ein Zwilling außerhalb des Änderungsmanagements wird binnen weniger Jahre zu einem zuversichtlichen Lügner.

**Die unterstützenden Praktiken:**

- **Ein benannter Eigentümer** je Zwilling, verantwortlich für die erneute Validierung.
- **Definierte Revalidierungsauslöser**: bauliche Änderung, Umwidmung, Messgerätetausch oder Nachkalibrierung, Reglerneueinstellung, Produkt- oder Einsatzstoffwechsel — und eine periodische Überprüfung unabhängig davon.
- **Versionierung von Modell, Parametern, Annahmen und Datenzuordnung**, mit der Fähigkeit anzugeben, welche Version eine bestimmte historische Ausgabe erzeugt hat — dieselbe Reproduzierbarkeitsanforderung wie bei gelernten Modellen.
- **Ein dokumentiertes Annahmenverzeichnis**, mit denselben Auslösern überprüft.
- **Validierungsnachweise**: Wie gut trifft das Modell die Anlage, über welchen Betriebsbereich, mit welcher Unsicherheit? **Einmal bei der Übergabe genannt und nie wieder betrachtet ist keine Validierung** — es ist eine Momentaufnahme einer verfallenden Beziehung.
- **Ein Rückzugsplan.** Zwillinge überleben ihre Nützlichkeit, und einer, der nicht mehr gepflegt, aber weiterhin angezeigt wird, ist schlechter als keiner.

## Was ein Zwilling nicht kann

Die Grenzen klar zu benennen verhindert die meisten Enttäuschungen:

- **Er kann keine Phänomene abbilden, die weder in seinen Gleichungen noch in seinen Trainingsdaten stecken.** Ein Modell ohne einen Mechanismus schreibt dessen Wirkungen etwas zu, das es enthält.
- **Er kann keinen neuartigen Ausfall vorhersagen**, aus demselben Grund wie ein gelerntes Modell.
- **Er ersetzt keine Messung.** Ein Softsensor ist eine Ableitung aus anderen Messungen plus Annahmen und verfällt, sobald sich eines davon ändert.
- **Er kann sich nicht selbst validieren.** Übereinstimmung zwischen Modell und Anlage beweist die Passung im beobachteten Bereich; über den nicht beobachteten sagt sie nichts — und dort liegen die interessanten Fragen.
- **Er kann eine unbeobachtbare Größe nicht beobachtbar machen**, wenn nichts im Messsatz auf sie reagiert. Erzeugen zwei verschiedene physikalische Zustände identische Messwerte, kann kein Modell sie trennen.

## Fehlermodi

**Ein digitales Modell mit Livewerten, als Zwilling bezeichnet.** Andere Nachweislast, andere Kosten, andere Erwartungen.

**Visualisierung als Lieferergebnis behandelt.** Das Residuum — die eigentliche technische Ausgabe — wird nie berechnet oder gezeigt.

**Aktualisierungsrate von der Datenkette statt von der Prozessdynamik bestimmt.** Ein Modell, das über das schnelle Verhalten, das es zu zeigen scheint, nichts aussagt.

**Dynamisches Modell aus einer inkonsistenten Momentaufnahme initialisiert.** Ein von niemandem aufgeprägter Übergang, als Residuum gelesen.

**Prognoseläufe nie an Messwerten neu verankert.** Angesammelter Näherungsfehler, als Vorhersage präsentiert.

**Genauigkeit weit jenseits der zugrunde liegenden Messunsicherheit angezeigt.** Man jagt Differenzen unterhalb des Rauschens.

**Annahmen undokumentiert und ohne Verantwortliche.** Eine Prozessänderung entwertet das Modell, ohne es zu berühren.

**Messgerätedrift von einem geschätzten Parameter absorbiert.** Der Zwilling meldet einen Prozessbefund, der ein Kalibrierfehler ist.

**Signifikanz des Residuums nie benannt.** Kein Weg, Befund von Rauschen zu unterscheiden.

**Virtuelle Inbetriebnahme als Ersatz der Vor-Ort-Inbetriebnahme behandelt.** Ein zuversichtliches Team trifft auf nicht modelliertes Feldgeräteverhalten.

**Simulationsumgebung als Abhängigkeit des Produktivsystems belassen.** Ein Prüfwerkzeug im Betriebspfad.

**Schreibpfad ohne deterministisches Tor ergänzt.** Der Zwilling ist nun Teil der Regelung, ohne deren Anforderungen.

**Zwilling außerhalb des Änderungsmanagements.** Stille Divergenz, zuversichtliche Ausgabe.

**Validierung einmal bei der Übergabe durchgeführt.** Momentaufnahme einer verfallenden Beziehung.

**Kein Eigentümer.** Der Zwilling wird gepflegt, solange sich jemand dafür interessiert.

**Zwilling genutzt, um Zustände zu trennen, die die Messungen nicht trennen können.** Kein Modell kann das, und die Ausgabe ist beliebig.

**Veralteter Zwilling weiterhin angezeigt.** Schlechter als keiner, weil man ihm glaubt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein hybrider digitaler Schatten eines Wärmetauschers dient seit zwei Jahren der Reinigungsplanung. Er schätzt den Verschmutzungswiderstand laufend aus Durchfluss- und Temperaturmessungen und hat einen glatten, physikalisch sinnvollen Verlauf erzeugt, der bei jeder Reinigung zum gefundenen Zustand passte. Nach einem Anlagenstillstand sieht der Verlauf weiterhin glatt und sinnvoll aus, und die nächste Reinigung wird danach geplant. Beim Öffnen ist die Verschmutzung erheblich stärker, als das Modell meldete.

```text
Symptom:
A heat exchanger fouling model that tracked reality well for two years began
under-reporting fouling after an outage, with no visible break in the trend.

Evidence:
- the fouling resistance is estimated from measured inlet and outlet
  temperatures and flows, with the exchanger geometry and duty as fixed model
  inputs
- during the outage, a thermowell on one of the temperature measurements was
  replaced; the replacement has a shorter insertion length than the original
- the temperature measured through the replacement reads slightly low, in a
  manner consistent with a stem conduction error
- there is no step in the fouling trend at the date of the outage; the curve
  is smooth throughout
- the model's residual — the difference between predicted and measured outlet
  temperature — is small throughout and shows no deterioration
- the twin's assumption register does not exist; the instrument configuration
  it depends on is not recorded as a model dependency
- the site's management-of-change process covered the thermowell replacement
  as a maintenance task; nothing in it referenced the model
- a sister exchanger in the same service, whose instrumentation was not
  touched, shows a fouling trajectory that has diverged from this one since
  the outage
- no revalidation of the model was performed after the outage

Reasoning:
The mechanism is a property of parameter estimation rather than a defect in
the model's physics. The estimator has one free parameter — the fouling
resistance — and it adjusts that parameter until the model's predicted outlet
temperature matches the measured one. When the measurement began reading
slightly low, the estimator did the only thing available to it: it moved the
fouling resistance to whatever value reproduced the new measurement. The
residual therefore stayed small, which is exactly why nothing looked wrong.

This is the general hazard of an estimated physical parameter: it absorbs
everything the model does not otherwise explain, including instrument error.
The property that makes the parameter a useful condition indicator — that it
collects the unmodelled difference between prediction and reality — is the
same property that makes it silently wrong when the measurement is the thing
that changed.

Three governance gaps allowed it to persist. The model's dependency on a
specific instrument installation was never recorded, so the thermowell
replacement was not visible as a change affecting the model. The twin was
outside management of change, so nothing triggered a revalidation. And no
validation had been repeated since handover, so the only check on the model's
continued accuracy was the residual — which, by the mechanism above, could not
detect this class of error.

The sister exchanger's divergence is the discriminating evidence and was
available throughout: two units in the same service, one with modified
instrumentation, whose trends separated at the outage date.

Next investigations:
- verify the replacement thermowell's immersion depth against the requirement
  and quantify the temperature offset
- re-estimate the fouling history from the outage date using a corrected
  temperature, and compare against the condition found at opening
- build and own an assumption and dependency register for the model,
  including every instrument it relies on and its configuration
- add model revalidation to the triggers in management of change, so that
  instrument replacement, re-rating and retuning all prompt a review
- establish a periodic validation against independent evidence — the
  condition found at cleaning, and the sister unit — rather than relying on
  the residual alone
- review every other estimated-parameter model on the site for the same
  exposure
```

**Drei übertragbare Lehren.** Erstens: **Ein kleines Residuum belegt nicht, dass das Modell recht hat**; es belegt, dass der Schätzer einen passenden Parameterwert gefunden hat — und mit genug Freiheit findet er immer einen. Zweitens: **Ein geschätzter physikalischer Parameter absorbiert Messfehler ununterscheidbar von Prozessveränderung**, ein solcher Zwilling erhöht also die Bedeutung der Messgeräteintegrität, statt sie zu senken. Drittens: **Die Abhängigkeit des Zwillings von einer bestimmten Messgeräteinstallation war eine echte technische Abhängigkeit, die in keinem Dokument auftauchte** — und dieses Fehlen erlaubte es einer Routinewartung, ein Modell zu entwerten, auf das sich alle verließen.

## Empfohlene Praxis

- Zu Beginn entscheiden und dokumentieren, ob ein digitales Modell, ein digitaler Schatten oder ein digitaler Zwilling entsteht, und Prüf-, Sicherheits- und Änderungsmanagementpflichten entsprechend bemessen.
- Das Residuum zum Lieferergebnis machen und daneben angeben, welches Residuum angesichts der Messunsicherheit signifikant ist.
- Für Anlagenzwillinge hybride Modelle bevorzugen: Physik für die Struktur, geschätzte Parameter für das vorab Unbekannte.
- Geschätzte Parameter wählen, die technische Bedeutung, Einheit und einen Auslegungswert zum Vergleich haben.
- Bedenken, dass ein geschätzter Parameter alles Unerklärte absorbiert, einschließlich Messfehler, und eine unabhängige Prüfung dafür vorsehen.
- Die Aktualisierungsrate aus der Prozessdynamik ableiten, nicht aus der Datenkette.
- Dynamische Modelle aus einem konsistenten Zustand initialisieren und Zeitstempel über Quellen hinweg ausrichten.
- Prognoseläufe in einem definierten Intervall an Messwerten neu verankern oder den Prognosehorizont ausdrücklich begrenzen.
- Ein Annahmen- und Abhängigkeitsverzeichnis führen, einschließlich jedes Messgeräts, auf das sich das Modell stützt, samt Konfiguration.
- Den validierten Betriebsbereich und die Unsicherheit des Modells angeben und die Validierung wiederholen, statt die Übergabe als endgültig zu betrachten.
- Gegen unabhängige Nachweise validieren — den bei einem Eingriff gefundenen Zustand, einen Schwesterapparat, eine Offline-Messung — nicht allein gegen das Residuum.
- Virtuelle Inbetriebnahme für Logik, Abläufe, Verriegelungen und Meldungen nutzen und ausdrücklich festhalten, dass Feldgeräteverhalten vor Ort noch nachzuweisen ist.
- Die Simulationsumgebung aus dem produktiven Abhängigkeitspfad heraushalten und den Übergang von simulierter zu realer E/A als geprüften, dokumentierten Schritt gestalten.
- Produktive Schatten lesend halten; jeden Schreibpfad entwerfen, torsichern und begründen und die technischen Randbedingungen der Anlage auf die Ausgabe anwenden.
- Sicherheitsfunktionen deterministisch und unabhängig vom Zwilling halten.
- Den Zwilling in das Änderungsmanagement aufnehmen, mit benannten Revalidierungsauslösern: Änderung, Umwidmung, Messgerätetausch oder Nachkalibrierung, Neueinstellung, Einsatzstoff- oder Produktwechsel und periodische Überprüfung.
- Modell, Parameter, Annahmen und Datenzuordnung gemeinsam versionieren und jede historische Ausgabe rekonstruieren können.
- Jedem Zwilling einen Eigentümer und einen Rückzugsplan geben und nicht mehr gepflegte Zwillinge zurückziehen, statt sie weiter anzuzeigen.

## Fazit

Ein digitaler Zwilling ist kein Bild einer Anlage und kein Dashboard. Er ist ein Modell, das neben einer Anlage läuft, von ihr gespeist wird und an der Differenz zwischen seiner Prognose und dem Verhalten der Anlage gemessen wird. Alles Wertvolle folgt aus dieser Differenz: Zustandsableitung, Softsensorik, Frühwarnung und — im hybriden Fall — ein physikalisch bedeutungsvoller Zustandsparameter, den eine Fachkraft ohne anwesende Datenwissenschaft deuten kann.

Die nötige Disziplin ist unspektakulär und überwiegend organisatorisch. Sagen Sie, welches der drei Dinge Sie bauen. Berechnen und zeigen Sie das Residuum und seine Signifikanz. Schreiben Sie auf, was das Modell annimmt und wovon es abhängt, einschließlich der Messgeräte. Validieren Sie mehr als einmal. Und nehmen Sie das Ganze ins Änderungsmanagement auf, denn die Anlage wird sich weiter ändern und der Zwilling folgt nicht von allein.

Tun Sie das, und ein bescheidenes Modell verdient jahrelang seine Kosten. Lassen Sie es aus, und Sie bauen etwas, das zunehmend beeindruckend aussieht und still, ohne jeden sichtbaren Ausfall, immer weniger stimmt.
