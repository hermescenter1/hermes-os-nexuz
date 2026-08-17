# Ursachenanalyse komplexer industrieller Ausfälle

## Zusammenfassung

**„Die Grundursache“ ist meist ein grammatischer Fehler.** Einfache Ausfälle haben eine; komplexe industrielle Ausfälle haben eine Ursachen*struktur* — eine unmittelbare Ursache, die nur deshalb zu einem Ausfall führen konnte, weil mehrere weitere Bedingungen im selben Moment zutrafen, von denen die meisten seit Jahren zutrafen.

Die Folge, diese Struktur in einen einzigen Satz zu pressen, ist vorhersehbar und teuer. Die Abhilfe entfernt ein Glied, die Struktur überlebt, und derselbe Ausfall kehrt in achtzehn Monaten in anderer Kleidung zurück — anderes Bauteil, andere Einheit, anders aussehendes Symptom, dieselbe zugrunde liegende Schwäche. Standorte, die das erleben, schließen daraus, Ursachenanalyse funktioniere nicht. Nicht funktioniert hat die Forderung nach einer einzigen Antwort.

Zwei weitere Aussagen prägen alles Folgende.

**Ursachenanalyse ist eine Beweisdisziplin, und Beweise verderben.** Die folgenreichsten Entscheidungen einer Untersuchung fallen in den ersten Stunden — meist von Menschen, die die Produktion wiederherstellen, bevor überhaupt jemand entschieden hat, dass untersucht wird.

**Und der analytische Fehlermodus ist zu frühes Aufhören.** Die erste plausible Erklärung ist der gefährlichste Moment einer Untersuchung, denn von da an wird jede Tatsache als Bestätigung gelesen.

Dieser Beitrag ist rückblickend: Ein Ausfall ist eingetreten, und die Frage lautet, warum — so, dass Wiederholung verhindert wird. Das vorausschauende Gegenstück — ein Symptom liegt vor, und die Frage lautet, was als Nächstes sicher zu tun ist — behandelt der Begleitbeitrag über nachweisgestützte Diagnostik und sichere Handlungsplanung. Verfahren der Live-Fehlersuche stehen in den Begleitbeiträgen zum Troubleshooting.

## Fünf Begriffe, die keine Synonyme sind

| Begriff | Definition | Erkennungstest |
| --- | --- | --- |
| **Unmittelbare Ursache** | Das Ereignis oder der Zustand, der den Ausfall direkt hervorbrachte | Wäre der Ausfall in diesem Moment eingetreten, wenn dies nicht geschehen wäre? |
| **Einflussfaktor** | Etwas, das den Ausfall wahrscheinlicher, schwerer oder schlechter erkennbar machte — allein aber nicht hinreichend war | Verringert sein Wegfall Wahrscheinlichkeit oder Schwere, ohne den Mechanismus zu verhindern? |
| **Grundursache** | Eine Ursache, deren Beseitigung diesen Ausfall — und meist eine Klasse von Ausfällen — unmöglich macht und die die Organisation tatsächlich beherrscht | Können wir sie ändern? Wird der Mechanismus dann unmöglich oder nur unwahrscheinlicher? |
| **Latente Bedingung** | Eine lange vor dem Ereignis vorhandene Schwäche, ruhend bis zur Aktivierung durch Umstände | Wie lange trifft das schon zu? Jahre heißt meist latent |
| **Folge** | Was der Ausfall bewirkt hat | Sie liegt hinter dem Ausfall und kann keine Ursache davon sein |

**Drei Unterscheidungen leisten die meiste Arbeit.**

**Eine Ursache ist nicht das Letzte, was angefasst wurde.** „Es fiel aus, nachdem wir X geändert haben“ ist eine Hypothese mit Zeitstempel und verdient Prüfung statt Übernahme. Reihenfolge ist keine Kausalität, und Industrieanlagen erzeugen Zufälle in hoher Rate.

**Eine Grundursache muss in der Kontrolle der Organisation liegen.** „Lieferantenqualität“ und „Bedienfehler“ sind meist Umformulierungen der Frage. **„Menschliches Versagen“ als Grundursache ist ein Haltepunkt, kein Ergebnis** — die analytisch nützlichen Fragen lauten, was den Fehler wahrscheinlich machte (unklare Anweisung, schlechte Kennzeichnung, hohe Arbeitslast, eine Bedienoberfläche, die dazu einlädt) und was ihn folgenreich machte (keine unabhängige Prüfung, kein Schutz, kein Rückweg). Beides ist beherrschbar; „besser aufpassen“ nicht.

**Eine Folge im Feld „Grundursache“ ist ein häufiger und aufschlussreicher Mangel.** Ein Bericht, dessen Grundursache „Produktionsverlust“ lautet, hat das Ergebnis notiert und aufgehört.

## Die ersten Stunden entscheiden die Untersuchung

Beweise verderben auf sehr unterschiedlichen Zeitskalen, und die am schnellsten verderblichen sind oft die entscheidendsten.

| Beweis | Wie er verloren geht |
| --- | --- |
| **Flüchtige Maschinendaten** | Melde- und Ereignispuffer laufen um; Antriebs- und Relaisfehlerspeicher fassen wenige Einträge; hochauflösende Verläufe werden komprimiert oder verworfen |
| **Physischer Zustand** | Ventil- und Schalterstellungen werden bei der Wiederherstellung verändert; ausgefallene Teile werden gereinigt, zerlegt oder zurückgesandt; Trümmer werden entfernt |
| **Proben** | Schmierstoff, Prozessmedium und Rückstände sind mit dem Spülen verloren |
| **Konfigurationszustand** | Einstellungen werden bei der Behebung korrigiert, der Zustand vor dem Ausfall ist weg |
| **Menschliche Erinnerung** | Verfällt binnen Stunden und gleicht sich an, sobald Beteiligte miteinander sprechen |

**Der Konflikt mit der Produktionswiederherstellung ist real und gehört als legitim behandelt, nicht als Disziplinproblem.** Niemand wird eine Anlage einen Tag stillhalten, um einen Tatort zu bewahren. Die praktikable Antwort ist ein kurzes, vorab vereinbartes Protokoll, das Minuten kostet:

- **Vor jedem Anfassen fotografieren**, weit und dann nah, einschließlich der Stellungen örtlicher Schalter, Ventile und Anzeigen.
- **Flüchtige Speicher sichern** — Meldehistorie, Ereignisprotokoll, Steuerungsdiagnose, Antriebs- und Schutzrelaisspeicher — bevor irgendetwas zurückgesetzt oder spannungsfrei geschaltet wird.
- **Vor dem Spülen Proben nehmen**: Schmierstoff, Medium, Rückstand.
- **Das ausgefallene Teil eintüten und beschriften**, statt es sofort zur Gewährleistung zurückzusenden, und es nicht reinigen — die Oberfläche ist der Beweis.
- **Festhalten, wer anwesend war und was jede Person tat**, vor dem Schichtwechsel.
- **Den Betriebszustand notieren**: Rate, Produkt, Konfiguration, Versorgung, Umgebung.

**Dieses Protokoll wirkt nur, wenn es vor dem Ausfall existiert**, den zuerst Anwesenden bekannt ist und ausdrücklich autorisiert wurde, damit sein Befolgen nicht als Verzögerung gilt.

## Den Zeitstrahl vor der Theorie bauen

**Der Zeitstrahl ist das produktivste Arbeitsergebnis einer Untersuchung**, und er verdient seinen Platz zweifach: Er stellt die Reihenfolge fest und — wertvoller — er zeigt, welcher Beweis fehlt.

Lohnende Quellen: Melde- und Ereignisprotokolle, Historian-Verläufe in höchster verfügbarer Auflösung, Bedien- und Schichtübergabeprotokolle, Arbeitsaufträge und Freigaben, Änderungsnachweise, Steuerungs- und Antriebsfehlerspeicher, Schutzrelaisaufzeichnungen, Laborergebnisse sowie Zutritts- oder Anwesenheitsdaten.

**Die Zeitsynchronisation ist der Ermöglicher und der übliche Mangel.** Systeme mit minutenweise abweichenden Uhren erzeugen einen Zeitstrahl, der zuversichtlich und vollständig falsch ist, und der Fehler ist unsichtbar, weil jeder Eintrag präzise aussieht. **Den Versatz zwischen allen Quellen feststellen, bevor aus der Reihenfolge irgendetwas geschlossen wird.**

**Unterscheiden, was das System aufgezeichnet hat, von dem, was geschah.** Eine Erstmeldung ist das erste vom System verriegelte Ereignis, nicht notwendig das erste eingetretene — ein schnelleres Phänomen kann unter der Abtastrate gelegen haben, und eine unterdrückte Meldung hinterlässt gar nichts. Aufgezeichnete Abwesenheit ist keine Abwesenheit.

**Und gezielt danach suchen, was nicht geschah.** Eine erwartete Meldung, die nie kam, ein Schutz, der hätte ansprechen müssen und nicht ansprach, eine Verriegelung, die etwas zuließ, das sie hätte sperren müssen, eine Reserve, die nicht anlief — **Abwesenheiten sind Beweise und nur gegen eine Erwartung sichtbar**, weshalb der Zeitstrahl neben dem Geschehenen auch enthalten sollte, was die Auslegung vorsah.

## Die Beweishierarchie

1. **Physische Beweise** — das ausgefallene Bauteil, gemessene Stellungen, am Ort genommene Proben, maßliche und metallurgische Befunde.
2. **Aufgezeichnete Maschinendaten mit geprüften Zeitstempeln** — Verläufe, Ereignisprotokolle, Gerätefehlerspeicher.
3. **Zeitnahe schriftliche Aufzeichnungen** — Protokolle, Freigaben, Arbeitsaufträge, Änderungsnachweise.
4. **Dokumentation der Absicht** — Zeichnungen, Spezifikationen, Verfahren, Auslegungsgrundlage.
5. **Menschliche Erinnerung** — unverzichtbar für Richtung und Kontext, am schwächsten für Reihenfolge und Detail.

**Zwei Regeln folgen daraus, und beide werden häufig verletzt.**

**Dokumentation beschreibt Absicht; die Anlage beschreibt Wirklichkeit.** Widersprechen sie einander, hat die Anlage recht — und **der Widerspruch ist selbst ein Befund**, meist ein wichtigerer als der Anlass des Vergleichs. Ein As-built, das nicht zur Installation passt, ist eine latente Bedingung für jede künftige Untersuchung und jede künftige Änderung.

**Früh, getrennt und auf Beobachtung befragen, nicht auf Erklärung.** Fragen Sie, was jemand gesehen, gehört, gerochen und getan hat, in der Reihenfolge. Fragen Sie nicht nach der vermuteten Ursache, bevor die Beobachtungen aufgezeichnet sind, und lassen Sie Beteiligte das Ereignis nicht zuerst untereinander besprechen: **Gruppenerinnerung gleicht sich rasch zu einer gemeinsamen Erzählung an, die zuversichtlicher und ungenauer ist als die Einzelaussagen, die sie ersetzt.** Wer eine Theorie anbietet, ist kein Zeuge mehr, sondern Analyst, und seine Beobachtung ist davon kontaminiert.

## Ursachenstruktur, nicht Ursachenkette

Eine Kette impliziert einen einzigen Pfad. Reale Ausfälle sind Strukturen, und der Unterschied zählt, weil die Abhilfe der Form der Erklärung folgt.

**Jede Ursachenkandidatin auf Notwendigkeit und die Menge auf Hinlänglichkeit prüfen:**

- **Notwendig?** Wäre der Ausfall ohne dies eingetreten? Falls ja, ist es nicht notwendig — es kann dennoch Einflussfaktor sein.
- **Als Menge hinreichend?** Erzeugen die gefundenen Ursachen zusammen tatsächlich den Ausfall? Bleibt eine Lücke, ist die Erklärung unvollständig, wie überzeugend sie auch klingt.

**Eine hinreichende Erklärung mit unnötigen Bestandteilen ist überangepasst** — sie verallgemeinert nicht, und ihre Abhilfen adressieren Nebensächliches.

**Fehlerbaumdenken ist begrifflich nützlich, ob eine Grafik entsteht oder nicht.** Rückwärts vom Spitzenereignis zu arbeiten und auf jeder Ebene zu fragen, ob die darunterliegenden Bedingungen als UND oder als ODER verknüpft sind, erzwingt eine Aussage, die eine Kette verdeckt: Mussten die Bedingungen zusammentreffen, oder konnte jede für sich den Ausfall erzeugen? **UND-Strukturen sind der Ort, an dem mehrursächliche Ausfälle leben, und genau das kann eine lineare Methode nicht abbilden.**

**Der gemeinsamen Ursache gebührt eine eigene Suche.** Wo Redundanz, Diversität oder unabhängige Barrieren gemeinsam versagten, gibt es ein geteiltes Element, und es stammt meist aus einer kurzen Liste: gemeinsame Versorgung, gemeinsame Kalibrierung oder Konfiguration, gemeinsamer Wartungseinsatz, gemeinsame Auslegungsannahme, gemeinsame Umgebung, gemeinsamer Monteur oder gemeinsame Ersatzteilcharge. **Zwei gemeinsam ausgefallene Dinge waren nicht unabhängig, was auch immer die Zeichnung sagt**, und dieses geteilte Element zu benennen ist oft das wertvollste Einzelergebnis einer Untersuchung.

**Latente Bedingungen findet man über zwei Fragen.** *Wie lange trifft das schon zu?* — was seit Jahren zutrifft, ist latent und hat gewartet statt verursacht. Und *was betrifft das noch?* — die Frage, die aus einem Vorfall einen systemischen Befund macht und am häufigsten ausgelassen wird, weil der Untersuchungsumfang als eine Maschine definiert war.

## Hypothesenprüfung

**Eine einzelne Hypothese ist keine Analyse.** Bilden Sie bewusst mehrere, auch solche, die niemand glaubt, denn der Wert einer unplausiblen Hypothese liegt in dem Beweis, den zu suchen sie erzwingt.

Zu jeder Hypothese zwei Dinge benennen:

- **Welcher Beweis läge vor, wenn sie zuträfe?** Dann nachsehen.
- **Welcher Beweis läge vor, wenn sie nicht zuträfe?** Das ist die stärkere und die unnatürlichere Frage. Widerlegende Nachweise unterscheiden zwischen Hypothesen; bestätigende meist nicht, weil mehrere Hypothesen dieselben bestätigenden Tatsachen vorhersagen.

**Widersprechende Nachweise sind das wertvollste Material in der Akte.** Eine Tatsache, die nicht passt, bedeutet eines von zwei Dingen: Die Tatsache ist falsch, und Sie müssen zeigen können, warum; oder die Hypothese ist falsch. **Eine unbequeme Tatsache ohne Nachweis wegzuerklären ist der häufigste analytische Fehler der industriellen Ursachenanalyse** und der Weg, auf dem Untersuchungen zuversichtlich zur falschen Antwort gelangen. Jeden Widerspruch ausdrücklich dokumentieren und angeben, wie er aufgelöst wurde. **Ein Bericht ohne widersprechende Nachweise ist ein Bericht, der aufgehört hat zu suchen.**

**Fehlende Nachweise gehören als fehlend dokumentiert**, samt ihrer Wirkung auf die Zuversicht. Drei Situationen werden routinemäßig vermischt und haben verschiedene Folgen:

- **Nie erhoben** — ein Prozessmangel, der sich für das nächste Mal beheben lässt.
- **Durch die Reaktion zerstört** — ein Grund, das Sicherungsprotokoll zu verbessern, und eine Grenze dessen, was diese Untersuchung schließen kann.
- **Existiert tatsächlich nicht** — die Anlage misst es nicht, was selbst ein Befund sein kann.

**„Wir konnten X nicht bestimmen“ ist ein legitimes Ergebnis.** Stillschweigend so weiterzuarbeiten, als sei X bekannt, ist es nicht, und ein Bericht, der seine Unsicherheiten nennt, ist nützlicher — und besser verteidigbar — als einer, der es nicht tut.

## Änderungshistorie und Betriebskontext

**„Was hat sich geändert?“ ist die ertragreichste Frage industrieller Ausfalluntersuchung**, und sie ist breit zu stellen: Hardware, Software, Firmware, Einstellungen und Parameter, Verfahren, Personal und Schichtmodelle, Lieferanten und Ersatzteile, Einsatzstoff und Produktqualität, Betriebsrate, Betriebsart und Umgebungsbedingungen.

**Und die Falle, die die Frage ruiniert: Das Fehlen eines Änderungsnachweises ist kein Nachweis, dass sich nichts geändert hat.** Undokumentierte Änderungen sind fast konstruktionsbedingt jene, die am ehesten Ausfälle verursachen — denn eine Änderung, die eine Prüfung durchlaufen hat, ist eine, über die jemand nachgedacht hat. Fragen Sie die Menschen, sehen Sie sich die physischen Spuren an, vergleichen Sie mit dem letzten bekannten Stand, und behandeln Sie „keine Änderungen dokumentiert“ als unbeantwortete Frage, nicht als Antwort.

**Der Betriebskontext erklärt, warum der Ausfall *jetzt* geschah.** Viele Mechanismen vollenden sich nur in einem Zustand, in dem die Anlage selten ist: ungewöhnliche Rate, Übergang, Anfahren, Ersatzstromversorgung, Wartungskonfiguration, anderes Produkt, extreme Umgebung. **Ein zufällig wirkender Ausfall ist oft einer, der einen seltenen Zustand voraussetzt**, und diesen Zustand zu benennen macht aus einem unerklärten Ereignis ein vorhersagbares.

## Warum Fünf Warum nicht genügt

**Fair gesagt: Fünf Warum ist ein wirklich nützliches Werkzeug.** Für einen einfachen Ausfall mit einem einzigen Ursachenpfad, besprochen von Leuten mit Systemkenntnis, strukturiert es ein Gespräch, das sonst abschweifen würde, und es ist weit besser als keine Methode.

**Seine Grenzen sind konkret und nennenswert, weil es routinemäßig weit darüber hinaus angewandt wird:**

- **Es unterstellt eine einzige Kette.** Zwei Bedingungen, die zusammentreffen mussten, kann es nicht abbilden — die Struktur der meisten komplexen Ausfälle.
- **Den Pfad wählt, wer antwortet.** Jedes „Warum“ hat mehrere wahre Antworten; die dokumentierte spiegelt Annahmen, Fachkenntnis und oft Interessen der Gruppe. Zwei fachkundige Teams gelangen vom selben Ausfall zu verschiedenen Wurzeln, und die Methode bietet kein Kriterium.
- **Sie enthält keinen Beweistest.** Jede plausible Antwort bringt die Kette weiter. Nichts verlangt einen Nachweis.
- **Sie endet willkürlich** — bei fünf, bei der ersten umsetzbaren Antwort oder bei „menschlichem Versagen“, dem häufigsten Haltepunkt, gerade weil er sich wie eine Erklärung anfühlt.

**Die Abhilfe ist Begrenzung statt Verzicht:** zur Richtungsfindung nutzen, für jeden Schritt Nachweise verlangen, Verzweigung zulassen, wo mehrere Antworten zutreffen, und bei erfüllter Notwendigkeits- und Hinlänglichkeitsprüfung enden statt bei einer Zahl.

## Abhilfen und Verifikation

**Abhilfen nach Wirksamkeit ordnen und ehrlich sagen, wo jede liegt:**

| Wirksamkeit | Art der Maßnahme | Beständigkeit |
| --- | --- | --- |
| Höchste | Gefahr beseitigen oder Mechanismus konstruktiv ausschließen | Dauerhaft; übersteht Personalwechsel |
| Hoch | Barriere, Verriegelung oder Schutzfunktion konstruieren | Beständig, wenn gewartet und geprüft |
| Mittel | Den sich entwickelnden Zustand erkennen und melden | Hängt davon ab, dass die Reaktion tatsächlich erfolgt |
| Niedriger | Verfahren, Checkliste, Arbeitsanweisung | Verfällt mit Fluktuation und Zeitdruck |
| Niedrigste | Schulung, Unterweisung, Sensibilisierung | Verfällt am schnellsten |

**Maßnahmen am unteren Ende werden überproportional häufig gewählt**, weil sie schnell und billig sind und in derselben Woche geschlossen werden können. Als Ergänzung sind sie legitim, als primäre Kontrolle unzuverlässig, und eine Maßnahmenliste, die nur aus Unterweisungen und Verfahrensupdates besteht, wird Wiederholung nicht verhindern.

**Jede Maßnahme muss die Ursache benennen, die sie adressiert.** Eine Liste ohne Bezug zur Ursachenstruktur ist eine Aufgabenliste, die zufällig nach einem Ausfall entstand. **Maßnahmen gegen Einflussfaktoren lohnen sich** — sie senken Wahrscheinlichkeit oder Schwere — müssen aber als solche gekennzeichnet sein, damit niemand den Mechanismus für beseitigt hält, der nur unwahrscheinlicher wurde.

**Der Geltungsumfang ist die Frage, die aus einer Reparatur eine Vorbeugung macht.** Wo sonst besteht diese latente Bedingung? Welche anderen Maschinen wurden in jenem Projekt umgewidmet? Welche anderen Kreise nutzen jene konfigurierte Konstante? Welche anderen Verfahren haben dieselbe Lücke? **Diese Frage wird häufiger ausgelassen als jede andere, weil der Untersuchungsumfang eine Anlage war** — und dort liegt der meiste Wert einer Ursachenanalyse.

**Die Verifikation ist vorab zu definieren.** Zu jeder Maßnahme: welcher Nachweis zeigt die Wirkung, wer prüft, zu welchem Datum. **Eine unverifizierte Abhilfe ist eine Absicht.** Und wiederholt sich derselbe Ausfall nach umgesetzten und verifizierten Maßnahmen, ist das kein Grund, die Maßnahmen zu wiederholen — es ist der Nachweis, dass die Analyse falsch war, und die Untersuchung gehört als Analysefehler wiedereröffnet, nicht als neuer Vorfall.

## Fehlermodi der Untersuchung

**Eine einzige Ursache, vom Berichtsformular verlangt.** Die Struktur wird flachgedrückt, damit sie passt.

**Die erste plausible Erklärung übernommen.** Alles Weitere wird als Bestätigung gelesen.

**Folge als Grundursache dokumentiert.** Das Ergebnis notiert, der Mechanismus ungeprüft.

**„Menschliches Versagen“ als Endantwort.** Ein Haltepunkt, der eine Person statt einer Bedingung benennt.

**Eine Ursache außerhalb der Kontrolle der Organisation.** Vielleicht wahr und nicht umsetzbar.

**Beweise bei der Wiederherstellung zerstört, weil kein Protokoll existierte.** Der entscheidende Nachweis in der ersten Stunde verloren, von Leuten, die ihre Arbeit taten.

**Zeitstrahl aus unsynchronisierten Quellen gebaut.** Zuversichtlich und falsch.

**Aufgezeichnete Abwesenheit als Abwesenheit behandelt.** Eine unterdrückte Meldung als Nichtereignis gelesen.

**Zeugen gemeinsam und spät befragt.** Eine gemeinsame Erzählung, zuversichtlicher und ungenauer als das, was sie ersetzte.

**Dokumentation über die Anlage gestellt.** Der Zeichnung geglaubt, die Installation nicht geprüft.

**Widersprechende Nachweise ohne Nachweis wegerklärt.** Der häufigste Weg zu einer zuversichtlich falschen Antwort.

**Fehlende Nachweise nicht als fehlend dokumentiert.** Zuversicht behauptet, wo keine begründet ist.

**„Keine Änderungen dokumentiert“ als „nichts geändert“ akzeptiert.** Die undokumentierten sind die interessanten.

**Redundante Ausfälle getrennt analysiert.** Das geteilte Element — der eigentliche Befund — nie benannt.

**Geltungsumfang nie gefragt.** Eine Maschine repariert, drei weitere warten noch.

**Abhilfen aus Unterweisungen und Verfahrensupdates.** Die am schnellsten verfallenden Kontrollen als primäre Antwort.

**Kein Verifikationsdatum.** Maßnahmen mit der Umsetzung geschlossen statt mit der Wirkung.

**Wiederholung als neuer Vorfall behandelt.** Der Nachweis, dass die Analyse falsch war, verworfen.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Eine große rotierende Maschine fällt katastrophal aus. Der unmittelbare Befund ist ein zerstörtes Lager. Die Erstuntersuchung schließt auf mangelhafte Lagerqualität, der Lieferant wird gewechselt, die Maßnahme geschlossen. Elf Monate später fällt eine ähnliche Maschine im selben Bereich auf dieselbe Weise aus.

```text
Symptom:
Repeat catastrophic bearing failure on similar machines eleven months apart,
after an initial investigation concluded "bearing quality" and changed
supplier.

Evidence:
- the second failed bearing shows damage consistent with lubricant
  starvation; the first bearing was cleaned before examination and its
  surface evidence was lost
- no lubricant sample was taken from the first machine before it was flushed
  during restoration; the site had no evidence-preservation protocol
- the greasing route covering both machines was rationalised three years ago,
  moving these machines from a weekly to a monthly interval as part of a
  route-efficiency project
- both machines were re-rated to a higher operating speed two years ago
  during a debottlenecking project
- the debottlenecking project's change documentation covers process
  parameters and electrical ratings; it contains no reference to maintenance
  plans, and the maintenance system was not consulted
- the lubrication interval in the maintenance plan has never been revised
  since original commissioning
- the site's management-of-change procedure applies to process and
  engineering changes; changes to maintenance plans are handled separately by
  the planning function with no cross-reference in either direction
- three further machines were re-rated in the same project
- the first investigation is documented as a single-cause finding with one
  corrective action

Reasoning:
The immediate cause of the second failure is bearing degradation by lubricant
starvation. That is the mechanism, and it is not the answer.

Two contributing factors made starvation possible. The greasing interval was
extended during a route rationalisation that optimised route efficiency
without reference to individual machine duty. And the machines were later
re-rated to a higher speed, which changes the lubrication demand, without any
review of the maintenance plan. Either change alone might have been tolerable;
together they moved the machines outside the regime the plan was written for.
This is an AND structure, and it is exactly what the first investigation's
single-cause conclusion could not represent.

The latent condition is organisational and long-standing: the site's
management-of-change process has no link between a change in equipment duty
and the maintenance plan for that equipment. That condition had been true for
years, affected every asset on the site, and is the cause that is both
correctable and general.

The bearing supplier was a plausible immediate answer supported by no evidence
— the surface evidence had already been destroyed and no lubricant sample
existed. The absence of a preservation protocol therefore did more than lose
one investigation; it made the wrong conclusion the only available one, and
bought eleven months of false confidence.

Next investigations:
- confirm the starvation mechanism metallurgically on the second bearing and
  sample the lubricant from the remaining machines now, before any further
  intervention
- reconstruct the lubrication requirement at the re-rated duty and compare it
  against the current plan
- establish the extent of condition: review the three other machines re-rated
  in the same project, and then every asset whose duty has changed since its
  maintenance plan was written
- test whether the management-of-change gap has produced other unreviewed
  maintenance plans, in which case the finding is broader than lubrication
- review the route rationalisation project for other intervals extended
  without duty review
- write and authorise an evidence-preservation protocol, since its absence is
  itself a contributing factor to the eleven-month delay
```

**Drei übertragbare Lehren.** Erstens: **Die unmittelbare Ursache ist der Mechanismus, nicht die Antwort** — Mangelschmierung erklärt, wie das Lager starb, und nichts darüber, warum die Anlage es zuließ. Zweitens: **Die latente Bedingung war die allgemeine** — ein fehlendes Bindeglied zwischen Betriebsänderung und Instandhaltungsplan, seit Jahren wahr, jede Anlage betreffend und korrigierbar; das macht sie zur Grundursache statt einer der beiden Einzeländerungen. Drittens: **Das Fehlen eines Beweisprotokolls schwächte die Erstuntersuchung nicht nur, es bestimmte ihr Ergebnis**, denn mit gereinigter Oberfläche und ohne Schmierstoffprobe war „Lagerqualität“ die einzige Hypothese, die sich nicht prüfen ließ — und daher die einzige, die überlebte.

## Empfohlene Praxis

- Ein kurzes Beweissicherungsprotokoll schreiben und autorisieren, bevor es gebraucht wird, und dafür sorgen, dass die zuerst Anwesenden es kennen und befolgen dürfen.
- Fotografieren, flüchtige Speicher sichern, Proben nehmen, das ausgefallene Teil eintüten und den Betriebszustand dokumentieren — in den ersten Minuten, nicht nach einer Untersuchungsentscheidung.
- Den Zeitstrahl vor der Theorie bauen und Uhrenversätze zwischen allen Quellen feststellen, bevor aus der Reihenfolge geschlossen wird.
- In den Zeitstrahl aufnehmen, was laut Auslegung hätte geschehen sollen, damit Abwesenheiten sichtbar werden.
- Früh, getrennt und auf Beobachtung befragen, nicht auf Erklärung.
- Einen Widerspruch zwischen Dokumentation und Anlage als Befund behandeln, nicht als Ärgernis.
- Die fünf Begriffe präzise verwenden und nie eine Folge oder einen unbeeinflussbaren externen Faktor ins Feld Grundursache setzen.
- „Menschliches Versagen“ als Endantwort ablehnen und stattdessen fragen, was den Fehler wahrscheinlich und was ihn folgenreich machte.
- Jede Ursachenkandidatin auf Notwendigkeit und die Menge auf Hinlänglichkeit prüfen und ausdrücklich sagen, ob Bedingungen zusammentreffen mussten.
- Immer gezielt nach dem geteilten Element suchen, wenn vermeintlich Unabhängiges gemeinsam ausfiel.
- Fragen, wie lange jede Bedingung schon zutrifft und was sie sonst noch betrifft.
- Mehrere Hypothesen bilden und zu jeder widerlegende Nachweise suchen.
- Jeden Widerspruch dokumentieren und seine Auflösung angeben; fehlende Nachweise als fehlend dokumentieren und nie erhoben von zerstört von nicht existent unterscheiden.
- In allen Dimensionen fragen, was sich geändert hat, und „keine Änderungen dokumentiert“ als offene Frage behandeln.
- Den Betriebszustand benennen, den der Ausfall voraussetzte, denn er erklärt das Jetzt.
- Fünf Warum begrenzen: Nachweise je Schritt, Verzweigung bei mehreren wahren Antworten, Ende bei Hinlänglichkeit statt bei einer Zahl.
- Abhilfen nach Wirksamkeit ordnen, Maßnahmen gegen Einflussfaktoren als solche kennzeichnen und Unterweisungen nicht zur primären Kontrolle machen.
- Die Frage nach dem Geltungsumfang in jeder Untersuchung stellen und über die ausgefallene Anlage hinaus fassen.
- Zu jeder Maßnahme Verifikationsnachweis, Verantwortliche und Datum festlegen und Maßnahmen anhand nachgewiesener Wirkung schließen.
- Eine Wiederholung nach verifizierten Maßnahmen als Nachweis einer falschen Analyse behandeln und sie als solche wiedereröffnen.

## Fazit

Zweck einer Untersuchung ist nicht, einen Ausfall zu erklären, sondern den nächsten zu verhindern. Das sind verschiedene Ziele, und der Unterschied zeigt sich in der Form der Antwort. Eine Erklärung kann befriedigend, einsätzig und teilbar sein. Eine Vorbeugung muss eine von der Organisation beherrschte Bedingung benennen, zeigen, dass ihre Beseitigung den Mechanismus unmöglich macht, und hinterher prüfen, dass sie es tat.

Die Disziplinen, die dorthin führen, sind einzeln unspektakulär: Beweise in der ersten Stunde sichern, den Zeitstrahl vor der Theorie bauen, Beweise ehrlich einordnen, nach den Bedingungen suchen, die zusammentreffen mussten, statt nach einem Kettenglied, aktiv nach der Tatsache fahnden, die nicht passt, und fragen, wo die Schwäche sonst noch besteht. Schwer macht sie, dass jede in dem Moment etwas kostet, in dem man sie braucht — Zeit, während die Produktion steht, Bequemlichkeit, während eine befriedigende Erklärung bereitliegt, Umfang, während die Untersuchung angeblich eine Maschine betrifft.

Die Ausfälle, die wiederkehren, sind fast immer die, bei denen diese Kosten vermieden wurden.
