# German Knowledge Library — Technical Review Sheet (PHASE 87L.6D.1)

**Reviewer profile required:** native German-speaking industrial engineer
(automation / electrical / maintenance).

**Status: NOT REVIEWED.** Translation produced by Claude in PHASE 87L.6D.1.
No human technical review has taken place. Production deployment of the
German library must remain blocked until this sheet is signed off.

**Scope:** 30 article groups × 16 fields = 480 leaves. 475 translated,
5 intentionally identical (product names). Zero English carryover.

## How to review

For each article: read the English source field beside the German, then
confirm — (a) the engineering meaning is unchanged, (b) the safety
modality is not weakened (a prohibition is still a prohibition, a
requirement is still a requirement), (c) no number, unit, standard or
protocol name changed, (d) the German reads naturally to a practitioner.
Record findings in the **Reviewer comment** line and set **Status**.

## Safety-critical field index

Every `safetyNote` is safety-critical. The list below is the priority
queue for review — each one carries isolation, stored-energy, protective
device, interlock, pressure or arc-flash content.

1. `plcBasics.safetyNote` — PLC-Grundlagen
2. `ladder.safetyNote` — Kontaktplan (KOP)
3. `scadaTags.safetyNote` — SCADA-Tag-Architektur
4. `digitalInputs.safetyNote` — Digitale Eingänge
5. `analogInputs.safetyNote` — Analoge Eingänge
6. `sensors.safetyNote` — Industriesensoren
7. `vfd.safetyNote` — Frequenzumrichter (VFD) / Antriebe
8. `motors.safetyNote` — Elektromotoren
9. `alarms.safetyNote` — Alarmmanagement
10. `protocols.safetyNote` — Industrielle Protokolle
11. `opcua.safetyNote` — OPC UA
12. `modbusTcp.safetyNote` — Modbus TCP
13. `mqtt.safetyNote` — MQTT
14. `troubleshooting.safetyNote` — Fehlersuche in der Instandhaltung
15. `hmiDesign.safetyNote` — HMI-Bildgestaltung
16. `s71200.safetyNote` — Siemens S7-1200
17. `s71500.safetyNote` — Siemens S7-1500
18. `structuredText.safetyNote` — Strukturierter Text (SCL)
19. `historian.safetyNote` — Historian-Konzepte
20. `contactors.safetyNote` — Schütze
21. `mcc.safetyNote` — Motor Control Center (MCC)
22. `protection.safetyNote` — Elektrischer Schutz
23. `transmitters.safetyNote` — Messumformer
24. `s7comm.safetyNote` — Siemens-S7-Kommunikation
25. `segmentation.safetyNote` — Netzsegmentierung
26. `accessControl.safetyNote` — Zugriffssteuerung
27. `monitoring.safetyNote` — Sicherheitsüberwachung
28. `audit.safetyNote` — Audit & Protokollierung
29. `predictive.safetyNote` — Prädiktive Instandhaltung
30. `rca.safetyNote` — Grundursachenanalyse

---

## 1. `plcBasics` — PLC-Grundlagen

**EN title:** PLC Fundamentals
**DE title:** PLC-Grundlagen

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Never treat standard PLC logic as a safety function — emergency stops and guard circuits belong in certified safety relays or F-CPUs, hardwired per the machine's risk assessment.

> **DE:** Standard-PLC-Logik niemals als Sicherheitsfunktion behandeln — Not-Halt und Schutztürkreise gehören in zertifizierte Sicherheitsrelais oder F-CPUs, fest verdrahtet gemäß der Risikobeurteilung der Maschine.

**Technical tokens EN:** PLC
**Technical tokens DE:** PLC
**Numeric/unit tokens EN:** 80%
**Numeric/unit tokens DE:** 80 %

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Scan cycle, I/O image, and program organization of programmable logic controllers.
- DE: Zykluszeit, Prozessabbild und Programmorganisation speicherprogrammierbarer Steuerungen.

**`p1`**

- EN: A PLC executes a cyclic scan: read inputs, execute logic, write outputs — scan time sets the response latency.
- DE: Eine PLC führt einen zyklischen Scan aus: Eingänge lesen, Logik bearbeiten, Ausgänge schreiben — die Zykluszeit bestimmt die Reaktionslatenz.

**`p2`**

- EN: I/O process images decouple physical terminals from logic; forcing bypasses logic and must be strictly controlled.
- DE: Prozessabbilder entkoppeln physische Klemmen von der Logik; Forcen umgeht die Logik und muss streng kontrolliert werden.

**`p3`**

- EN: Organize programs into cyclic, startup, and interrupt blocks; keep safety logic separate from process logic.
- DE: Programme in zyklische, Anlauf- und Interrupt-Bausteine gliedern; Sicherheitslogik von Prozesslogik getrennt halten.

**`c1`**

- EN: Check the CPU diagnostic buffer for faults and scan-time overruns.
- DE: Den CPU-Diagnosepuffer auf Fehler und Zykluszeitüberschreitungen prüfen.

**`c2`**

- EN: Verify I/O addressing against the hardware configuration.
- DE: Die E/A-Adressierung gegen die Hardwarekonfiguration verifizieren.

**`overview`**

- EN: A programmable logic controller is the deterministic execution core of a machine or process cell: it reads field inputs, solves user logic, and drives outputs on a fixed, repeatable cycle measured in milliseconds.
- DE: Eine speicherprogrammierbare Steuerung ist der deterministische Ausführungskern einer Maschine oder Prozesszelle: Sie liest Feldeingänge, löst die Anwenderlogik und treibt Ausgänge in einem festen, wiederholbaren Zyklus im Millisekundenbereich.

**`purpose`**

- EN: Guarantees bounded reaction time and predictable behavior for discrete and hybrid control, where a PC operating system cannot.
- DE: Garantiert eine begrenzte Reaktionszeit und vorhersagbares Verhalten für diskrete und hybride Steuerung — dort, wo ein PC-Betriebssystem dies nicht kann.

**`how`**

- EN: Each scan copies physical inputs into the process image, executes the program against that frozen image, then writes the output image back to the terminals. Interrupt blocks preempt the cycle for time-critical events; the watchdog supervises total scan time.
- DE: Jeder Zyklus kopiert die physischen Eingänge in das Prozessabbild, bearbeitet das Programm gegen dieses eingefrorene Abbild und schreibt dann das Ausgangsabbild auf die Klemmen zurück. Interrupt-Bausteine unterbrechen den Zyklus für zeitkritische Ereignisse; der Watchdog überwacht die Gesamtzykluszeit.

**`faults`**

- EN: Scan-time overrun from unbounded loops or heavy communication; forced I/O left active after maintenance; logic acting on stale data when modules fail silently; battery/memory loss wiping retentive data on power cycle.
- DE: Zykluszeitüberschreitung durch unbegrenzte Schleifen oder hohe Kommunikationslast; nach der Instandhaltung aktiv gebliebene geforcte E/A; Logik, die auf veralteten Daten arbeitet, wenn Baugruppen still ausfallen; Batterie-/Speicherverlust, der remanente Daten beim Aus- und Einschalten löscht.

**`c3`**

- EN: Confirm retentive memory and clock backup health before any planned power-down.
- DE: Vor jedem geplanten Abschalten den Zustand des remanenten Speichers und der Uhrenpufferung bestätigen.

**`commissioning`**

- EN: Force each I/O point once against the loop drawing before logic test; record scan-time baseline at full load and alarm at 80% of watchdog.
- DE: Jeden E/A-Punkt vor dem Logiktest einmal gegen den Stromlaufplan forcen; die Zykluszeit-Baseline bei Volllast erfassen und bei 80 % des Watchdogs alarmieren.

**`concepts`**

- EN: Process image, scan cycle, organization blocks, retentive memory, watchdog, I/O addressing.
- DE: Prozessabbild, Zykluszeit, Organisationsbausteine, remanenter Speicher, Watchdog, E/A-Adressierung.

**`brainUse`**

- EN: Hermes Brain cites this library when a question involves scan behavior, CPU diagnostics, I/O addressing, or general controller fundamentals across any vendor.
- DE: Hermes Brain zitiert diese Bibliothek, wenn eine Frage Zyklusverhalten, CPU-Diagnose, E/A-Adressierung oder allgemeine Steuerungsgrundlagen herstellerübergreifend betrifft.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 2. `ladder` — Kontaktplan (KOP)

**EN title:** Ladder Logic
**DE title:** Kontaktplan (KOP)

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** A ladder interlock is an availability function, not a safety function — protective stops must remain hardwired or in certified safety logic regardless of program structure.

> **DE:** Eine Verriegelung im Kontaktplan ist eine Verfügbarkeitsfunktion, keine Sicherheitsfunktion — Schutzabschaltungen müssen unabhängig von der Programmstruktur fest verdrahtet oder in zertifizierter Sicherheitslogik ausgeführt bleiben.

**Technical tokens EN:** PLC
**Technical tokens DE:** PLC
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Contact and coil patterns: interlocks, latching, and edge detection.
- DE: Kontakt- und Spulenmuster: Verriegelungen, Selbsthaltung und Flankenerkennung.

**`p1`**

- EN: Seal-in circuits hold outputs after momentary commands; every stop condition must break the seal.
- DE: Selbsthalteschaltungen halten Ausgänge nach kurzzeitigen Befehlen; jede Stopp-Bedingung muss die Selbsthaltung auftrennen.

**`p2`**

- EN: Use rising/falling edge instructions for one-shot actions to avoid re-triggering every scan.
- DE: Für einmalige Aktionen steigende/fallende Flankenbefehle verwenden, damit sie nicht in jedem Zyklus erneut auslösen.

**`p3`**

- EN: Interlocks must be structured so no single rung can bypass a safety condition.
- DE: Verriegelungen müssen so aufgebaut sein, dass kein einzelner Strompfad eine Sicherheitsbedingung umgehen kann.

**`c1`**

- EN: Trace rung power flow online to find the blocking contact.
- DE: Den Stromfluss des Strompfads online verfolgen, um den blockierenden Kontakt zu finden.

**`c2`**

- EN: Search cross-references for double coil assignments.
- DE: Die Querverweisliste auf Doppelspulen-Zuweisungen durchsuchen.

**`overview`**

- EN: Ladder logic expresses control as power flow through contacts and coils — the lingua franca of discrete automation, readable by electricians and auditable rung by rung.
- DE: Der Kontaktplan stellt Steuerung als Stromfluss durch Kontakte und Spulen dar — die Verkehrssprache der diskreten Automatisierung, für Elektrofachkräfte lesbar und Strompfad für Strompfad prüfbar.

**`purpose`**

- EN: Interlocks, sequences, and motor control where visual traceability during live troubleshooting matters more than computational elegance.
- DE: Verriegelungen, Ablaufsteuerungen und Motorsteuerung, wo visuelle Nachvollziehbarkeit bei der Fehlersuche am laufenden System wichtiger ist als rechnerische Eleganz.

**`how`**

- EN: Each rung evaluates left-to-right per scan; seal-in branches latch outputs past momentary commands; edge instructions convert level signals to one-shot events; cross-references track every address.
- DE: Jeder Strompfad wird pro Zyklus von links nach rechts ausgewertet; Selbsthaltezweige halten Ausgänge über kurzzeitige Befehle hinaus; Flankenbefehle wandeln Pegelsignale in einmalige Ereignisse; Querverweise erfassen jede Adresse.

**`faults`**

- EN: Double coil assignments producing flicker; seal-ins that a stop condition fails to break; edge instructions duplicated so events fire twice; interlock bypass hidden in a parallel branch.
- DE: Doppelspulen-Zuweisungen, die Flackern erzeugen; Selbsthaltungen, die eine Stopp-Bedingung nicht auftrennt; doppelt vorhandene Flankenbefehle, sodass Ereignisse zweimal auslösen; eine in einem Parallelzweig verborgene Umgehung der Verriegelung.

**`c3`**

- EN: Audit every safety-relevant rung for parallel paths that could bypass the interlock condition.
- DE: Jeden sicherheitsrelevanten Strompfad auf Parallelpfade prüfen, die die Verriegelungsbedingung umgehen könnten.

**`commissioning`**

- EN: Walk each sequence step with the machine in manual, watching rung power flow online; archive a cross-reference listing with the as-commissioned program.
- DE: Jeden Ablaufschritt bei Maschine im Handbetrieb durchgehen und dabei den Stromfluss online beobachten; eine Querverweisliste zusammen mit dem Inbetriebnahmestand archivieren.

**`concepts`**

- EN: Contacts and coils, seal-in/latch, edge detection, cross-reference, interlocking, scan order.
- DE: Kontakte und Spulen, Selbsthaltung, Flankenerkennung, Querverweis, Verriegelung, Bearbeitungsreihenfolge.

**`brainUse`**

- EN: Cited when questions mention rungs, coils, latching behavior, outputs that stick or flicker, or interlock logic in any ladder-programmed PLC.
- DE: Wird zitiert, wenn Fragen Strompfade, Spulen, Selbsthalteverhalten, hängende oder flackernde Ausgänge oder Verriegelungslogik in einer beliebigen KOP-programmierten PLC nennen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 3. `scadaTags` — SCADA-Tag-Architektur

**EN title:** SCADA Tag Architecture
**DE title:** SCADA-Tag-Architektur

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Operator displays are informational — never route a protective action through SCADA tag writes; the controller must protect itself if the supervisory layer dies.

> **DE:** Bedienbilder sind informativ — eine Schutzfunktion niemals über SCADA-Tag-Schreibzugriffe führen; die Steuerung muss sich selbst schützen, wenn die Leitebene ausfällt.

**Technical tokens EN:** HMI, PLC, SCADA
**Technical tokens DE:** HMI, PLC, SCADA
**Numeric/unit tokens EN:** 1, 250, 5, 500 ms
**Numeric/unit tokens DE:** 1, 250, 5, 500 ms

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Tag naming, polling groups, and data quality in supervisory systems.
- DE: Tag-Benennung, Abfragegruppen und Datenqualität in Leitsystemen.

**`p1`**

- EN: Structured tag naming (Area_Equipment_Signal) makes alarms and trends scale cleanly.
- DE: Strukturierte Tag-Benennung (Bereich_Anlage_Signal) lässt Alarme und Trends sauber skalieren.

**`p2`**

- EN: Match polling groups to process dynamics — fast loops 250–500 ms, slow analogs 1–5 s.
- DE: Abfragegruppen an die Prozessdynamik anpassen — schnelle Regelkreise 250–500 ms, langsame Analogwerte 1–5 s.

**`p3`**

- EN: Propagate data-quality flags to displays; never show stale values as live.
- DE: Datenqualitäts-Kennzeichen bis zur Anzeige durchreichen; veraltete Werte niemals als aktuell darstellen.

**`c1`**

- EN: Verify tag address mapping against the PLC symbol table.
- DE: Die Tag-Adresszuordnung gegen die Symboltabelle der PLC verifizieren.

**`c2`**

- EN: Check communication driver statistics for timeouts and retries.
- DE: Die Statistik des Kommunikationstreibers auf Timeouts und Wiederholungen prüfen.

**`overview`**

- EN: The tag database is the supervisory system's model of the plant: every value displayed, trended, or alarmed traces back to a tag bound to a controller address through a polling group.
- DE: Die Tag-Datenbank ist das Anlagenmodell des Leitsystems: Jeder angezeigte, getrendete oder alarmierte Wert lässt sich über eine Abfragegruppe auf ein an eine Steuerungsadresse gebundenes Tag zurückführen.

**`purpose`**

- EN: Decouples HMI/SCADA applications from raw controller addressing and carries data-quality so operators never mistake stale values for live ones.
- DE: Entkoppelt HMI-/SCADA-Anwendungen von der rohen Steuerungsadressierung und führt die Datenqualität mit, damit Bedienpersonal veraltete Werte nie für aktuelle hält.

**`how`**

- EN: Drivers poll controllers in groups whose rates match process dynamics; tags scale raw values to engineering units; quality flags (good/uncertain/bad) propagate from driver to display and historian.
- DE: Treiber fragen Steuerungen in Gruppen ab, deren Raten der Prozessdynamik entsprechen; Tags skalieren Rohwerte in technische Einheiten; Qualitätskennzeichen (gut/unsicher/schlecht) werden vom Treiber bis zur Anzeige und zum Historian durchgereicht.

**`faults`**

- EN: Address mapping drift after PLC changes; one fast polling group starving the channel; quality flags ignored so frozen values look live; tag sprawl from copy-paste without a naming standard.
- DE: Abweichende Adresszuordnung nach PLC-Änderungen; eine schnelle Abfragegruppe, die den Kanal aushungert; ignorierte Qualitätskennzeichen, sodass eingefrorene Werte aktuell wirken; Tag-Wildwuchs durch Kopieren ohne Benennungsstandard.

**`c3`**

- EN: Cross-check a sample of tag addresses against the current PLC symbol table after every controller change.
- DE: Nach jeder Steuerungsänderung eine Stichprobe der Tag-Adressen gegen die aktuelle PLC-Symboltabelle gegenprüfen.

**`commissioning`**

- EN: Load-test polling at full tag count, verify failover behavior of redundant servers, and freeze the naming convention before bulk tag creation.
- DE: Die Abfrage bei voller Tag-Anzahl lasttesten, das Failover-Verhalten redundanter Server verifizieren und die Namenskonvention vor der Massenanlage von Tags einfrieren.

**`concepts`**

- EN: Polling groups, data quality, engineering-unit scaling, tag naming standards, driver diagnostics.
- DE: Abfragegruppen, Datenqualität, Skalierung in technische Einheiten, Tag-Namensstandards, Treiberdiagnose.

**`brainUse`**

- EN: Cited when questions involve stale or wrong SCADA values, tag mapping, polling load, or supervisory data quality.
- DE: Wird zitiert bei veralteten oder falschen SCADA-Werten, Tag-Zuordnung, Abfragelast oder Datenqualität auf der Leitebene.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 4. `digitalInputs` — Digitale Eingänge

**EN title:** Digital Inputs
**DE title:** Digitale Eingänge

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Protective stop signals must use safety-rated inputs with line monitoring, not standard DI channels, regardless of how clean the wiring looks.

> **DE:** Signale für Schutzabschaltungen müssen sicherheitsgerichtete Eingänge mit Leitungsüberwachung verwenden, keine Standard-DI-Kanäle — unabhängig davon, wie sauber die Verdrahtung wirkt.

**Technical tokens EN:** NPN, PNP, VFD
**Technical tokens DE:** NPN, PNP, VFD
**Numeric/unit tokens EN:** 10, 50 ms
**Numeric/unit tokens DE:** 10, 50 ms

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Sinking/sourcing, debounce, and contact wiring behavior.
- DE: Sinking/Sourcing, Entprellung und Verhalten der Kontaktverdrahtung.

**`p1`**

- EN: Match sensor output type (PNP/NPN) to the input card's sinking/sourcing configuration.
- DE: Den Ausgangstyp des Sensors (PNP/NPN) auf die Sinking-/Sourcing-Konfiguration der Eingangsbaugruppe abstimmen.

**`p2`**

- EN: Debounce mechanical contacts in logic (10–50 ms) to avoid false transitions.
- DE: Mechanische Kontakte in der Logik entprellen (10–50 ms), um Fehlflanken zu vermeiden.

**`p3`**

- EN: Chattering inputs — rapid repeated transitions — usually indicate wiring or mechanical faults.
- DE: Prellende Eingänge — schnelle wiederholte Zustandswechsel — deuten meist auf Verdrahtungs- oder mechanische Fehler hin.

**`c1`**

- EN: Measure voltage at the input terminal against the module specification.
- DE: Die Spannung an der Eingangsklemme gegen die Baugruppenspezifikation messen.

**`c2`**

- EN: Compare the input status LED with the logic state to separate field from program issues.
- DE: Die Status-LED des Eingangs mit dem Logikzustand vergleichen, um Feld- von Programmproblemen zu trennen.

**`overview`**

- EN: Digital inputs carry binary field state into the controller; correctness depends on matching sensor output type, input wiring convention, and debounce handling.
- DE: Digitale Eingänge führen binäre Feldzustände in die Steuerung; die Korrektheit hängt vom Zusammenpassen des Sensorausgangstyps, der Eingangsverdrahtungskonvention und der Entprellung ab.

**`purpose`**

- EN: Deliver clean, debounced, correctly-referenced on/off signals so logic acts on real state changes rather than electrical noise.
- DE: Saubere, entprellte, korrekt bezogene Ein-/Aus-Signale liefern, damit die Logik auf reale Zustandswechsel und nicht auf elektrisches Rauschen reagiert.

**`how`**

- EN: PNP (sourcing) sensors feed sinking inputs and vice versa; the input threshold defines on/off voltage bands; mechanical contacts bounce for milliseconds and need logic or hardware debounce; status LEDs reflect terminal state.
- DE: PNP-Sensoren (sourcing) speisen sinkende Eingänge und umgekehrt; die Eingangsschwelle definiert die Ein-/Aus-Spannungsbänder; mechanische Kontakte prellen im Millisekundenbereich und benötigen Entprellung in Logik oder Hardware; Status-LEDs spiegeln den Klemmenzustand.

**`faults`**

- EN: PNP/NPN mismatch reading permanently off; chatter from unshielded runs beside VFD cables; bounce double-triggering counters; dry contacts wetted with the wrong common reference.
- DE: PNP/NPN-Fehlanpassung mit dauerhaft ausgelesenem Aus-Zustand; Prellen durch ungeschirmte Leitungen neben VFD-Kabeln; Kontaktprellen, das Zähler doppelt auslöst; potentialfreie Kontakte mit falscher Bezugsmasse beschaltet.

**`c3`**

- EN: Compare the input status LED against the logic state — disagreement isolates field wiring from program faults instantly.
- DE: Die Status-LED des Eingangs mit dem Logikzustand vergleichen — eine Abweichung trennt Feldverdrahtung und Programmfehler sofort.

**`commissioning`**

- EN: Exercise every input from its field device (not jumpers at the terminal) and verify debounce times against the fastest legitimate signal.
- DE: Jeden Eingang vom Feldgerät aus betätigen (nicht per Brücke an der Klemme) und die Entprellzeiten gegen das schnellste legitime Signal verifizieren.

**`concepts`**

- EN: Sinking/sourcing, input thresholds, debounce, signal isolation, LED-versus-logic diagnosis.
- DE: Sinking/Sourcing, Eingangsschwellen, Entprellung, Signaltrennung, LED-gegen-Logik-Diagnose.

**`brainUse`**

- EN: Cited for inputs reading wrong or chattering, sensor-to-card mismatches, and noise-induced false transitions.
- DE: Wird zitiert bei falsch lesenden oder prellenden Eingängen, Sensor-Baugruppen-Fehlanpassungen und rauschbedingten Fehlflanken.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 5. `analogInputs` — Analoge Eingänge

**EN title:** Analog Inputs
**DE title:** Analoge Eingänge

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Define and test the control response to bad-quality analog values — a loop frozen at last-good value can quietly drive a process into trouble.

> **DE:** Die Reaktion der Steuerung auf Analogwerte schlechter Qualität festlegen und testen — ein auf dem letzten gültigen Wert eingefrorener Regelkreis kann einen Prozess unbemerkt in eine kritische Lage führen.

**Technical tokens EN:** PLC, SCADA, VFD
**Technical tokens DE:** PLC, SCADA, VFD
**Numeric/unit tokens EN:** 2, 20 mA, 3.6 mA, 4
**Numeric/unit tokens DE:** 2, 20, 20 mA, 3,6 mA, 4

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: 4–20 mA loops, scaling, and signal integrity.
- DE: 4–20-mA-Kreise, Skalierung und Signalintegrität.

**`p1`**

- EN: The 4–20 mA live-zero enables broken-wire detection: below 3.6 mA means fault, not a low reading.
- DE: Der Live-Zero von 4–20 mA ermöglicht Drahtbrucherkennung: unter 3,6 mA bedeutet Fehler, nicht niedriger Messwert.

**`p2`**

- EN: Scale raw counts to engineering units in exactly one layer — PLC or SCADA, never both.
- DE: Rohwerte in genau einer Ebene in technische Einheiten skalieren — PLC oder SCADA, niemals beide.

**`p3`**

- EN: Use shielded twisted pair grounded at one end; route away from VFD output cables.
- DE: Geschirmte, verdrillte Leitungen einseitig erden und abseits von VFD-Ausgangskabeln verlegen.

**`c1`**

- EN: Inject a calibrated signal and verify the value through PLC and SCADA.
- DE: Ein kalibriertes Signal einspeisen und den Wert über PLC und SCADA verifizieren.

**`c2`**

- EN: Suspect ground loops when readings drift or oscillate.
- DE: Bei driftenden oder schwingenden Messwerten Erdschleifen in Betracht ziehen.

**`overview`**

- EN: Analog inputs digitize continuous process signals; the 4–20 mA current loop dominates because its live zero exposes broken wires and its current mode resists voltage drops.
- DE: Analoge Eingänge digitalisieren kontinuierliche Prozesssignale; der 4–20-mA-Stromkreis dominiert, weil sein Live-Zero Drahtbrüche aufdeckt und der Stromeinprägung Spannungsabfälle wenig anhaben.

**`purpose`**

- EN: Bring temperatures, pressures, levels, and flows into control with known accuracy, scaling, and fault detection.
- DE: Temperaturen, Drücke, Füllstände und Durchflüsse mit bekannter Genauigkeit, Skalierung und Fehlererkennung in die Steuerung bringen.

**`how`**

- EN: Transmitters regulate loop current proportional to the measured variable; the input card digitizes across its range; scaling to engineering units happens in exactly one defined layer; values below 3.6 mA signal faults, not low readings.
- DE: Messumformer regeln den Schleifenstrom proportional zur Messgröße; die Eingangsbaugruppe digitalisiert über ihren Bereich; die Skalierung in technische Einheiten erfolgt in genau einer definierten Ebene; Werte unter 3,6 mA signalisieren Fehler, keine niedrigen Messwerte.

**`faults`**

- EN: Double scaling in both PLC and SCADA; ground loops drifting readings; noise coupled from power cables; under-range fault currents displayed as plausible low values.
- DE: Doppelte Skalierung in PLC und SCADA; Erdschleifen, die Messwerte driften lassen; von Leistungskabeln eingekoppeltes Rauschen; Unterbereichs-Fehlerströme, die als plausible niedrige Werte angezeigt werden.

**`c3`**

- EN: Inject a calibrated mA signal at the field end and verify the displayed value end-to-end through PLC and SCADA.
- DE: Ein kalibriertes mA-Signal am Feldende einspeisen und den angezeigten Wert durchgängig über PLC und SCADA verifizieren.

**`commissioning`**

- EN: Document loop power architecture (2/4-wire), verify shield grounding at one end only, and record as-left calibration for every loop.
- DE: Die Speisungsarchitektur des Kreises (2-/4-Leiter) dokumentieren, die einseitige Schirmerdung verifizieren und für jeden Kreis den Kalibrierzustand bei Übergabe festhalten.

**`concepts`**

- EN: Live zero, loop powering, single-point scaling, shielding and ground loops, burnout detection.
- DE: Live-Zero, Schleifenspeisung, Skalierung an einer Stelle, Schirmung und Erdschleifen, Burnout-Erkennung.

**`brainUse`**

- EN: Cited for readings stuck at zero or drifting, scaling discrepancies between layers, and loop fault diagnosis.
- DE: Wird zitiert bei auf null hängenden oder driftenden Messwerten, Skalierungsabweichungen zwischen Ebenen und der Diagnose von Kreisfehlern.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 6. `sensors` — Industriesensoren

**EN title:** Industrial Sensors
**DE title:** Industriesensoren

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Measurements feeding protective decisions need defined failure behavior — know whether each sensor fails high, low, or frozen, and design the response.

> **DE:** Messwerte, die in Schutzentscheidungen eingehen, benötigen ein definiertes Fehlerverhalten — es muss bekannt sein, ob ein Sensor nach oben, nach unten oder eingefroren ausfällt, und die Reaktion ist entsprechend auszulegen.

**Technical tokens EN:** PT100
**Technical tokens DE:** PT100
**Numeric/unit tokens EN:** 600 °C
**Numeric/unit tokens DE:** 600 °C

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Proximity, temperature, pressure, and flow measurement behavior.
- DE: Verhalten von Näherungs-, Temperatur-, Druck- und Durchflussmessung.

**`p1`**

- EN: Inductive proximity sensors detect metals only; capacitive types detect non-metals but drift with humidity.
- DE: Induktive Näherungsschalter erfassen ausschließlich Metalle; kapazitive erfassen auch Nichtmetalle, driften jedoch mit der Luftfeuchte.

**`p2`**

- EN: RTDs (PT100) suit precision below ~600 °C; thermocouples suit high temperature and fast response.
- DE: Widerstandsthermometer (PT100) eignen sich für Präzision unterhalb ca. 600 °C; Thermoelemente für hohe Temperaturen und schnelles Ansprechen.

**`p3`**

- EN: Pressure and flow readings depend on correct process connections — trapped air or sediment biases them.
- DE: Druck- und Durchflussmesswerte hängen von korrekten Prozessanschlüssen ab — eingeschlossene Luft oder Ablagerungen verfälschen sie.

**`c1`**

- EN: Compare the sensor reading against a local gauge or portable reference.
- DE: Den Sensormesswert gegen ein örtliches Manometer oder eine tragbare Referenz vergleichen.

**`c2`**

- EN: Inspect sensing distance and target alignment after any mechanical work.
- DE: Nach jeder mechanischen Arbeit Schaltabstand und Zielausrichtung prüfen.

**`overview`**

- EN: Industrial sensors translate physical reality into signals; each technology — inductive, capacitive, RTD, thermocouple, pressure, flow — has characteristic blind spots and drift behavior.
- DE: Industriesensoren übersetzen physikalische Realität in Signale; jede Technologie — induktiv, kapazitiv, Widerstandsthermometer, Thermoelement, Druck, Durchfluss — hat charakteristische blinde Flecken und Driftverhalten.

**`purpose`**

- EN: Provide the measurements every control decision rests on, with accuracy and reliability matched to the process duty.
- DE: Die Messwerte liefern, auf denen jede Steuerungsentscheidung beruht, mit einer auf die Prozessbeanspruchung abgestimmten Genauigkeit und Zuverlässigkeit.

**`how`**

- EN: Proximity sensors detect via field disturbance within a rated sensing distance; RTDs vary resistance nearly linearly with temperature; thermocouples generate junction EMF needing cold-junction compensation; pressure and flow devices depend on correct process connections.
- DE: Näherungsschalter erfassen über eine Feldstörung innerhalb eines Nennschaltabstands; Widerstandsthermometer ändern ihren Widerstand nahezu linear mit der Temperatur; Thermoelemente erzeugen eine Thermospannung, die eine Vergleichsstellenkompensation benötigt; Druck- und Durchflussgeräte hängen von korrekten Prozessanschlüssen ab.

**`faults`**

- EN: Capacitive sensors drifting with humidity; misalignment after mechanical work; impulse-line plugging mimicking sensor failure; wrong-type extension cable corrupting thermocouple readings.
- DE: Kapazitive Sensoren, die mit der Luftfeuchte driften; Fehlausrichtung nach mechanischen Arbeiten; verstopfte Wirkdruckleitungen, die einen Sensorausfall vortäuschen; falsche Ausgleichsleitung, die Thermoelementwerte verfälscht.

**`c3`**

- EN: Compare the suspect reading against an independent local reference before condemning the instrument.
- DE: Den verdächtigen Messwert gegen eine unabhängige örtliche Referenz vergleichen, bevor das Messgerät verurteilt wird.

**`commissioning`**

- EN: Verify sensing distance and alignment in final mechanical position; document each instrument's range, tag, and as-found calibration.
- DE: Schaltabstand und Ausrichtung in der endgültigen mechanischen Lage verifizieren; für jedes Messgerät Messbereich, Kennzeichnung und den vorgefundenen Kalibrierzustand dokumentieren.

**`concepts`**

- EN: Sensing technologies, cold-junction compensation, impulse lines, calibration references, failure modes.
- DE: Sensortechnologien, Vergleichsstellenkompensation, Wirkdruckleitungen, Kalibrierreferenzen, Ausfallverhalten.

**`brainUse`**

- EN: Cited for implausible readings, sensor selection questions, drift, and field-device versus wiring fault isolation.
- DE: Wird zitiert bei unplausiblen Messwerten, Fragen zur Sensorauswahl, Drift und der Abgrenzung von Feldgeräte- gegenüber Verdrahtungsfehlern.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 7. `vfd` — Frequenzumrichter (VFD) / Antriebe

**EN title:** VFD / Drives
**DE title:** Frequenzumrichter (VFD) / Antriebe

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** DC bus capacitors hold lethal charge after power-off; respect the discharge time on the nameplate and prove dead before touching power terminals.

> **DE:** Die Kondensatoren des DC-Zwischenkreises führen nach dem Abschalten lebensgefährliche gespeicherte Energie; die auf dem Typenschild angegebene Entladezeit einhalten und vor dem Berühren der Leistungsklemmen die Spannungsfreiheit feststellen.

**Technical tokens EN:** PWM, V/Hz, VFD
**Technical tokens DE:** PWM, V/Hz, VFD
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Variable frequency drive parameters, faults, and motor protection.
- DE: Parameter, Störungen und Motorschutz von Frequenzumrichtern.

**`p1`**

- EN: Enter motor nameplate data (V/Hz, FLA) in drive parameters before first start.
- DE: Die Motor-Typenschilddaten (V/Hz, Bemessungsstrom) vor dem ersten Start in die Umrichterparameter eintragen.

**`p2`**

- EN: Overcurrent during acceleration usually means the ramp is too short or the load is abnormal — not a failed drive.
- DE: Überstrom beim Beschleunigen bedeutet meist eine zu kurze Rampe oder eine unnormale Last — nicht einen defekten Umrichter.

**`p3`**

- EN: Drive output cables emit high dv/dt noise — separate them from signal cabling and use screened cable.
- DE: Umrichter-Ausgangskabel erzeugen hohe dv/dt-Störungen — sie von Signalleitungen trennen und geschirmte Kabel verwenden.

**`c1`**

- EN: Read the drive fault history before resetting — the codes are the diagnosis.
- DE: Vor dem Quittieren die Störhistorie des Umrichters lesen — die Codes sind die Diagnose.

**`c2`**

- EN: Verify cooling: heatsink temperature and fan operation under load.
- DE: Die Kühlung prüfen: Kühlkörpertemperatur und Lüfterbetrieb unter Last.

**`overview`**

- EN: A variable frequency drive synthesizes adjustable voltage and frequency from rectified DC, controlling motor speed and torque — and introducing its own electrical environment of harmonics and dv/dt.
- DE: Ein Frequenzumrichter erzeugt aus gleichgerichteter Gleichspannung eine einstellbare Spannung und Frequenz, steuert damit Motordrehzahl und -moment — und bringt sein eigenes elektrisches Umfeld aus Oberschwingungen und dv/dt mit.

**`purpose`**

- EN: Match motor speed to process demand for energy savings and controllability, with built-in motor protection and diagnostics.
- DE: Die Motordrehzahl an den Prozessbedarf anpassen, für Energieeinsparung und Regelbarkeit, mit integriertem Motorschutz und Diagnose.

**`how`**

- EN: Rectifier charges the DC bus; the inverter's PWM switching synthesizes the output; V/Hz or vector control governs torque; fault registers log every trip with operating context.
- DE: Der Gleichrichter lädt den DC-Zwischenkreis; die PWM-Schaltung des Wechselrichters erzeugt die Ausgangsspannung; V/Hz- oder Vektorregelung bestimmt das Moment; Störregister protokollieren jede Auslösung mit Betriebskontext.

**`faults`**

- EN: Overcurrent at acceleration from ramps shorter than load inertia allows; overheating from clogged heatsinks; output earth faults from cable insulation damage; nuisance trips from supply dips sagging the DC bus.
- DE: Überstrom beim Beschleunigen durch Rampen, die kürzer sind als die Lastträgheit zulässt; Überhitzung durch zugesetzte Kühlkörper; ausgangsseitige Erdschlüsse durch beschädigte Kabelisolierung; Fehlauslösungen durch Netzeinbrüche, die den DC-Zwischenkreis absacken lassen.

**`c3`**

- EN: Read the complete fault history with timestamps before any reset — the sequence of codes is the diagnosis.
- DE: Vor jeder Quittierung die vollständige Störhistorie mit Zeitstempeln lesen — die Reihenfolge der Codes ist die Diagnose.

**`commissioning`**

- EN: Enter motor nameplate data exactly, run motor identification where supported, set ramps from real load inertia, and verify cooling at full load.
- DE: Die Motor-Typenschilddaten exakt eintragen, wo unterstützt die Motoridentifikation durchführen, Rampen aus der realen Lastträgheit einstellen und die Kühlung bei Volllast verifizieren.

**`concepts`**

- EN: PWM and dv/dt, DC bus, V/Hz vs vector control, ramp tuning, screened motor cables, harmonics.
- DE: PWM und dv/dt, DC-Zwischenkreis, V/Hz- gegenüber Vektorregelung, Rampenabstimmung, geschirmte Motorkabel, Oberschwingungen.

**`brainUse`**

- EN: Cited for drive trips and fault codes, acceleration problems, drive-related noise on signals, and motor-drive matching.
- DE: Wird zitiert bei Umrichterauslösungen und Störcodes, Beschleunigungsproblemen, umrichterbedingten Störungen auf Signalen und der Abstimmung von Motor und Antrieb.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 8. `motors` — Elektromotoren

**EN title:** Electric Motors
**DE title:** Elektromotoren

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Isolate and lock out before touching terminations; prove dead at the motor terminals, not just the starter — backfeeds and capacitors kill.

> **DE:** Vor dem Berühren von Anschlüssen freischalten und gegen Wiedereinschalten sichern; die Spannungsfreiheit an den Motorklemmen feststellen, nicht nur am Starter — Rückspeisungen und Kondensatoren sind lebensgefährlich.

**Technical tokens EN:** VFD
**Technical tokens DE:** VFD
**Numeric/unit tokens EN:** 1 MΩ, 10 °C, 5%
**Numeric/unit tokens DE:** 1 MΩ, 10 °C, 5 %

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Induction motor faults, insulation, and thermal behavior.
- DE: Fehler, Isolation und thermisches Verhalten von Asynchronmotoren.

**`p1`**

- EN: Winding insulation life roughly halves for every 10 °C above rated temperature.
- DE: Die Lebensdauer der Wicklungsisolation halbiert sich etwa je 10 °C oberhalb der Bemessungstemperatur.

**`p2`**

- EN: Phase current imbalance above ~5% indicates supply or winding asymmetry — investigate before failure.
- DE: Eine Phasenstrom-Unsymmetrie über ca. 5 % deutet auf Netz- oder Wicklungsasymmetrie hin — vor einem Ausfall untersuchen.

**`p3`**

- EN: Bearings cause most motor downtime; vibration signature changes precede seizure.
- DE: Lager verursachen den größten Teil der Motorstillstandszeit; Änderungen der Schwingungssignatur gehen dem Festfressen voraus.

**`c1`**

- EN: Measure insulation resistance to earth (≥1 MΩ minimum, temperature-corrected).
- DE: Den Isolationswiderstand gegen Erde messen (mindestens ≥1 MΩ, temperaturkorrigiert).

**`c2`**

- EN: Measure and compare phase currents under steady load.
- DE: Die Phasenströme unter stationärer Last messen und vergleichen.

**`overview`**

- EN: Three-phase induction motors are the workhorses of industry; their failures concentrate in bearings and winding insulation, both of which degrade measurably before they fail.
- DE: Dreiphasen-Asynchronmotoren sind die Arbeitspferde der Industrie; ihre Ausfälle konzentrieren sich auf Lager und Wicklungsisolation — beide verschlechtern sich messbar, bevor sie versagen.

**`purpose`**

- EN: Convert electrical power to mechanical work with predictable thermal and electrical behavior that protection and monitoring can supervise.
- DE: Elektrische Leistung in mechanische Arbeit umsetzen, mit vorhersagbarem thermischem und elektrischem Verhalten, das Schutz und Überwachung begleiten können.

**`how`**

- EN: Stator current creates a rotating field dragging the rotor at slip speed; losses heat the winding, and insulation life halves roughly per 10 °C above rated temperature; bearing condition shows in vibration signature.
- DE: Der Statorstrom erzeugt ein Drehfeld, das den Rotor mit Schlupfdrehzahl mitnimmt; Verluste erwärmen die Wicklung, und die Isolationslebensdauer halbiert sich etwa je 10 °C oberhalb der Bemessungstemperatur; der Lagerzustand zeigt sich in der Schwingungssignatur.

**`faults`**

- EN: Bearing wear from misalignment, contamination, or VFD shaft currents; phase imbalance heating one winding; insulation breakdown to earth; repeated starts overheating the rotor.
- DE: Lagerverschleiß durch Fluchtungsfehler, Verschmutzung oder VFD-bedingte Wellenströme; Phasenunsymmetrie, die eine Wicklung erwärmt; Isolationsdurchschlag gegen Erde; wiederholte Anläufe, die den Rotor überhitzen.

**`c3`**

- EN: Trend insulation resistance (temperature-corrected) over time — the slope matters more than any single reading.
- DE: Den Isolationswiderstand (temperaturkorrigiert) über die Zeit trenden — die Steigung ist aussagekräftiger als jeder Einzelwert.

**`commissioning`**

- EN: Record nameplate data, no-load and full-load current, vibration baseline, and insulation resistance as the reference fingerprint for all future diagnostics.
- DE: Typenschilddaten, Leerlauf- und Volllaststrom, Schwingungs-Baseline und Isolationswiderstand als Referenzsignatur für alle künftigen Diagnosen erfassen.

**`concepts`**

- EN: Slip, thermal class, phase imbalance, bearing signatures, megger testing, VFD shaft currents.
- DE: Schlupf, Wärmeklasse, Phasenunsymmetrie, Lagersignaturen, Isolationsmessung, VFD-bedingte Wellenströme.

**`brainUse`**

- EN: Cited for hot motors, current imbalance, bearing noise/vibration, insulation testing, and repeated overload trips.
- DE: Wird zitiert bei heißen Motoren, Stromunsymmetrie, Lagergeräuschen und -schwingungen, Isolationsprüfung und wiederholten Überlastauslösungen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 9. `alarms` — Alarmmanagement

**EN title:** Alarm Management
**DE title:** Alarmmanagement

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Alarm suppression and shelving need authorization and automatic return; a suppressed safety-relevant alarm that stays suppressed is a latent incident.

> **DE:** Alarmunterdrückung und -parkierung erfordern eine Autorisierung und eine automatische Rückkehr; ein unterdrückter sicherheitsrelevanter Alarm, der unterdrückt bleibt, ist ein latenter Vorfall.

**Technical tokens EN:** ISA-18.2
**Technical tokens DE:** ISA-18.2
**Numeric/unit tokens EN:** 10, 18.2
**Numeric/unit tokens DE:** 10, 18.2

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Alarm rationalization, priorities, and flood prevention.
- DE: Alarmrationalisierung, Prioritäten und Vermeidung von Alarmfluten.

**`p1`**

- EN: Every alarm must require an operator action; status information belongs on displays, not alarm lists.
- DE: Jeder Alarm muss eine Bedienhandlung erfordern; Statusinformationen gehören in Anzeigen, nicht in Alarmlisten.

**`p2`**

- EN: Apply deadband and on/off delays to suppress chattering alarms near thresholds.
- DE: Totband sowie Ein-/Ausschaltverzögerungen anwenden, um prellende Alarme nahe der Schwelle zu unterdrücken.

**`p3`**

- EN: Alarm floods (>10 per 10 min per operator) hide critical events — rationalize against ISA-18.2.
- DE: Alarmfluten (>10 je 10 min je Bedienperson) verdecken kritische Ereignisse — gegen ISA-18.2 rationalisieren.

**`c1`**

- EN: Review the most frequent alarms weekly; the top ten usually cause most of the load.
- DE: Die häufigsten Alarme wöchentlich auswerten; die zehn obersten verursachen meist den größten Teil der Last.

**`c2`**

- EN: Verify alarm priorities map to defined response times.
- DE: Verifizieren, dass die Alarmprioritäten auf definierte Reaktionszeiten abgebildet sind.

**`overview`**

- EN: Alarm management is the discipline of keeping the alarm list meaningful: every alarm demands an operator action, arrives at the right priority, and never drowns in a flood.
- DE: Alarmmanagement ist die Disziplin, die Alarmliste aussagekräftig zu halten: Jeder Alarm verlangt eine Bedienhandlung, kommt mit der richtigen Priorität an und geht nie in einer Flut unter.

**`purpose`**

- EN: Protect operator attention — the scarcest resource during an upset — per ISA-18.2 lifecycle practice.
- DE: Die Aufmerksamkeit des Bedienpersonals schützen — die knappste Ressource während einer Störung — gemäß der Lebenszyklus-Praxis nach ISA-18.2.

**`how`**

- EN: Rationalization assigns each alarm a cause, consequence, action, and priority tied to response time; deadbands and delays suppress chatter near thresholds; flood metrics (alarms per 10 minutes) gate acceptability.
- DE: Die Rationalisierung ordnet jedem Alarm Ursache, Auswirkung, Handlung und eine an die Reaktionszeit gekoppelte Priorität zu; Totbänder und Verzögerungen unterdrücken Prellen nahe der Schwelle; Flutkennzahlen (Alarme je 10 Minuten) begrenzen die Akzeptanz.

**`faults`**

- EN: Status points configured as alarms; chattering analog alarms at threshold boundaries; priority inflation making everything critical; standing alarms normalized and ignored.
- DE: Statuspunkte, die als Alarme konfiguriert sind; prellende Analogalarme an Schwellengrenzen; Prioritätsinflation, die alles kritisch macht; dauerhaft anstehende Alarme, die normalisiert und ignoriert werden.

**`c3`**

- EN: Pull the weekly top-10 most frequent alarms — they typically carry most of the load and the fastest wins.
- DE: Die wöchentlichen Top-10 der häufigsten Alarme ziehen — sie tragen typischerweise den größten Teil der Last und bieten die schnellsten Erfolge.

**`commissioning`**

- EN: Baseline alarm rates during normal operation before handover; an installation that floods on day one will be ignored by month one.
- DE: Die Alarmraten im Normalbetrieb vor der Übergabe als Baseline erfassen; eine Anlage, die am ersten Tag flutet, wird im ersten Monat ignoriert.

**`concepts`**

- EN: ISA-18.2, rationalization, deadband and delay, alarm flood, shelving, priority/response mapping.
- DE: ISA-18.2, Rationalisierung, Totband und Verzögerung, Alarmflut, Parkierung, Prioritäts-/Reaktionszuordnung.

**`brainUse`**

- EN: Cited when questions involve nuisance alarms, floods, chattering, prioritization, or operators ignoring the alarm list.
- DE: Wird zitiert bei Störalarmen, Alarmfluten, Prellen, Priorisierung oder wenn Bedienpersonal die Alarmliste ignoriert.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 10. `protocols` — Industrielle Protokolle

**EN title:** Industrial Protocols
**DE title:** Industrielle Protokolle

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Network failure behavior must be designed: every consumer of cyclic data needs a defined safe reaction to loss of communication.

> **DE:** Das Verhalten bei Netzwerkausfall muss ausgelegt werden: Jeder Verbraucher zyklischer Daten benötigt eine definierte sichere Reaktion auf Kommunikationsverlust.

**Technical tokens EN:** EtherCAT, MQTT, OPC UA, PROFINET
**Technical tokens DE:** EtherCAT, MQTT, OPC UA, PROFINET
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Fieldbus and industrial Ethernet selection and diagnostics.
- DE: Auswahl und Diagnose von Feldbussen und Industrial Ethernet.

**`p1`**

- EN: Cyclic real-time I/O (PROFINET, EtherCAT) and acyclic data (OPC UA, MQTT) solve different problems — don't mix roles.
- DE: Zyklischer Echtzeit-E/A-Austausch (PROFINET, EtherCAT) und azyklischer Datenverkehr (OPC UA, MQTT) lösen unterschiedliche Aufgaben — die Rollen nicht vermischen.

**`p2`**

- EN: Determinism comes from network design: managed switches, VLANs, and bounded traffic.
- DE: Determinismus entsteht durch Netzwerkdesign: gemanagte Switches, VLANs und begrenzte Last.

**`p3`**

- EN: Every protocol gateway adds latency and a failure point; document each conversion in the data path.
- DE: Jedes Protokoll-Gateway fügt Latenz und einen Fehlerpunkt hinzu; jede Umsetzung im Datenpfad dokumentieren.

**`c1`**

- EN: Capture traffic with a port mirror before blaming the protocol.
- DE: Den Verkehr über einen Port-Mirror aufzeichnen, bevor dem Protokoll die Schuld gegeben wird.

**`c2`**

- EN: Check device and connection counts against the master's documented limits.
- DE: Geräte- und Verbindungsanzahl gegen die dokumentierten Grenzen des Masters prüfen.

**`overview`**

- EN: Industrial protocols divide into cyclic real-time I/O exchange (PROFINET, EtherCAT) and acyclic data movement (OPC UA, MQTT); choosing and diagnosing them is network engineering with process consequences.
- DE: Industrielle Protokolle teilen sich in zyklischen Echtzeit-E/A-Austausch (PROFINET, EtherCAT) und azyklische Datenbewegung (OPC UA, MQTT); ihre Auswahl und Diagnose ist Netzwerktechnik mit prozesstechnischen Folgen.

**`purpose`**

- EN: Move the right data at the right determinism level, with diagnosability, across controllers, I/O, drives, and supervisory systems.
- DE: Die richtigen Daten mit dem richtigen Determinismusgrad und diagnosefähig zwischen Steuerungen, E/A, Antrieben und Leitsystemen bewegen.

**`how`**

- EN: Cyclic protocols reserve bandwidth and schedule frames for bounded update times; acyclic protocols trade determinism for flexibility and reach; gateways convert between them at the cost of latency and a failure point.
- DE: Zyklische Protokolle reservieren Bandbreite und planen Telegramme für begrenzte Aktualisierungszeiten; azyklische Protokolle tauschen Determinismus gegen Flexibilität und Reichweite; Gateways setzen zwischen ihnen um — zum Preis von Latenz und einem Fehlerpunkt.

**`faults`**

- EN: Determinism destroyed by unmanaged switches in real-time paths; device or connection counts exceeding master limits; gateway conversions silently dropping data quality; duplicate IP/device identity collisions.
- DE: Determinismus, der durch ungemanagte Switches im Echtzeitpfad zerstört wird; Geräte- oder Verbindungszahlen über den Grenzen des Masters; Gateway-Umsetzungen, die Datenqualität still verwerfen; Kollisionen durch doppelte IP- oder Geräteidentitäten.

**`c3`**

- EN: Capture traffic with a port mirror at the suspect segment before blaming any protocol stack.
- DE: Den Verkehr am verdächtigen Segment über einen Port-Mirror aufzeichnen, bevor irgendein Protokollstack beschuldigt wird.

**`commissioning`**

- EN: Document the full data path including every conversion, baseline cycle/update times, and load-test at full device count before production.
- DE: Den vollständigen Datenpfad einschließlich jeder Umsetzung dokumentieren, Zyklus-/Aktualisierungszeiten als Baseline erfassen und vor Produktionsstart bei voller Gerätezahl lasttesten.

**`concepts`**

- EN: Cyclic vs acyclic exchange, determinism, managed switching, gateways, network load budgeting.
- DE: Zyklischer gegenüber azyklischem Austausch, Determinismus, gemanagtes Switching, Gateways, Netzlastbudgetierung.

**`brainUse`**

- EN: Cited for protocol selection, intermittent communication faults, update-rate problems, and mixed-vendor network architecture.
- DE: Wird zitiert bei Protokollauswahl, sporadischen Kommunikationsfehlern, Aktualisierungsratenproblemen und herstellerübergreifender Netzarchitektur.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 11. `opcua` — OPC UA

**EN title:** OPC UA
**DE title:** OPC UA

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Treat OPC UA write access as a controlled capability: writable nodes exposed to broad networks are remote control of the plant.

> **DE:** OPC-UA-Schreibzugriff als kontrollierte Fähigkeit behandeln: Schreibbare Knoten, die breiten Netzen ausgesetzt sind, sind Fernsteuerung der Anlage.

**Technical tokens EN:** OPC UA, SCADA
**Technical tokens DE:** OPC UA, OPC-UA, SCADA
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Information modeling, sessions, and security in OPC UA.
- DE: Informationsmodellierung, Sitzungen und Sicherheit in OPC UA.

**`p1`**

- EN: OPC UA models data as a typed address space — browse it rather than hardcoding node IDs.
- DE: OPC UA modelliert Daten als typisierten Adressraum — diesen durchsuchen, statt Node-IDs fest zu codieren.

**`p2`**

- EN: Subscriptions with monitored items outperform polling at scale; tune sampling vs publishing intervals.
- DE: Subscriptions mit Monitored Items sind bei Skalierung leistungsfähiger als Polling; Sampling- gegenüber Publishing-Intervall abstimmen.

**`p3`**

- EN: Security policies and certificates are mandatory in production — anonymous/no-security is for labs only.
- DE: Sicherheitsrichtlinien und Zertifikate sind im Produktivbetrieb verpflichtend — anonym/ohne Sicherheit ist ausschließlich für Laborzwecke.

**`c1`**

- EN: Validate server certificate trust lists after any host change.
- DE: Die Vertrauenslisten der Serverzertifikate nach jeder Hoständerung validieren.

**`c2`**

- EN: Check session and subscription limits on the server before scaling clients.
- DE: Die Sitzungs- und Subscription-Grenzen des Servers prüfen, bevor Clients skaliert werden.

**`overview`**

- EN: OPC UA is the vendor-neutral information backbone of modern automation: a typed, browsable address space with built-in security, sessions, and subscriptions.
- DE: OPC UA ist das herstellerneutrale Informationsrückgrat moderner Automatisierung: ein typisierter, durchsuchbarer Adressraum mit integrierter Sicherheit, Sitzungen und Subscriptions.

**`purpose`**

- EN: Expose controller and server data with semantics — not just registers — to SCADA, MES, and analytics, securely and across platforms.
- DE: Steuerungs- und Serverdaten mit Semantik — nicht nur als Register — sicher und plattformübergreifend für SCADA, MES und Analytik bereitstellen.

**`how`**

- EN: Servers model data as nodes with types and references; clients browse rather than hardcode; subscriptions deliver monitored-item changes at negotiated sampling and publishing intervals; certificates authenticate both ends.
- DE: Server modellieren Daten als Knoten mit Typen und Referenzen; Clients durchsuchen den Adressraum, statt ihn fest zu codieren; Subscriptions liefern Änderungen von Monitored Items in ausgehandelten Sampling- und Publishing-Intervallen; Zertifikate authentifizieren beide Seiten.

**`faults`**

- EN: Trust-list breakage after hostname or certificate changes; session/subscription limits exhausted by scaling clients; anonymous no-security endpoints left enabled in production; address-space changes orphaning hardcoded node IDs.
- DE: Zerstörte Vertrauenslisten nach Hostnamen- oder Zertifikatsänderungen; erschöpfte Sitzungs-/Subscription-Grenzen beim Skalieren von Clients; im Produktivbetrieb aktiv gelassene anonyme Endpunkte ohne Sicherheit; Adressraumänderungen, die fest codierte Node-IDs verwaisen lassen.

**`c3`**

- EN: Browse the live address space to confirm node identity instead of trusting documentation that may have drifted.
- DE: Den aktiven Adressraum durchsuchen, um die Knotenidentität zu bestätigen, statt einer möglicherweise veralteten Dokumentation zu vertrauen.

**`commissioning`**

- EN: Establish certificate management ownership, set security policy to Sign&Encrypt, and load-test subscription volume before connecting production clients.
- DE: Die Verantwortung für das Zertifikatsmanagement festlegen, die Sicherheitsrichtlinie auf Sign&Encrypt setzen und das Subscription-Volumen lasttesten, bevor produktive Clients verbunden werden.

**`concepts`**

- EN: Address space and node model, subscriptions/monitored items, security policies, certificate trust, session limits.
- DE: Adressraum und Knotenmodell, Subscriptions/Monitored Items, Sicherheitsrichtlinien, Zertifikatsvertrauen, Sitzungsgrenzen.

**`brainUse`**

- EN: Cited for OPC UA connectivity failures, certificate trust problems, subscription performance, and secure data exposure design.
- DE: Wird zitiert bei OPC-UA-Verbindungsfehlern, Problemen mit dem Zertifikatsvertrauen, Subscription-Performance und der Auslegung sicherer Datenbereitstellung.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 12. `modbusTcp` — Modbus TCP

**EN title:** Modbus TCP
**DE title:** Modbus TCP

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Modbus has no authentication: anything on the network segment can write registers, so segmentation and write-filtering are the security model.

> **DE:** Modbus besitzt keine Authentifizierung: Alles im Netzsegment kann Register schreiben — Segmentierung und Schreibfilterung sind daher das Sicherheitsmodell.

**Technical tokens EN:** Modbus
**Technical tokens DE:** Modbus
**Numeric/unit tokens EN:** 0, 1, 3, 32, 4
**Numeric/unit tokens DE:** 0, 1, 3, 32, 4

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Register model, function codes, and polling behavior.
- DE: Registermodell, Funktionscodes und Abfrageverhalten.

**`p1`**

- EN: Modbus is register-based (4xxxx holding, 3xxxx input); off-by-one offsets are the most common mapping error.
- DE: Modbus ist registerbasiert (4xxxx Holding, 3xxxx Input); Off-by-one-Offsets sind der häufigste Zuordnungsfehler.

**`p2`**

- EN: It has no built-in security or data typing — compensate with segmentation and documented register maps.
- DE: Es besitzt weder integrierte Sicherheit noch Datentypisierung — durch Segmentierung und dokumentierte Registerlisten ausgleichen.

**`p3`**

- EN: Poll rate × register count must respect device processing limits; aggressive polling causes timeouts.
- DE: Abfragerate × Registeranzahl muss die Verarbeitungsgrenzen des Geräts respektieren; zu aggressives Abfragen verursacht Timeouts.

**`c1`**

- EN: Test reads with a Modbus client tool against the documented register map.
- DE: Lesezugriffe mit einem Modbus-Client-Werkzeug gegen die dokumentierte Registerliste testen.

**`c2`**

- EN: Check exception responses (illegal address/function) in the driver log.
- DE: Ausnahmeantworten (unzulässige Adresse/Funktion) im Treiberprotokoll prüfen.

**`overview`**

- EN: Modbus TCP wraps the venerable register-based protocol in Ethernet: simple, universal, and entirely without built-in security or data semantics.
- DE: Modbus TCP verpackt das altbewährte registerbasierte Protokoll in Ethernet: einfach, universell und gänzlich ohne integrierte Sicherheit oder Datensemantik.

**`purpose`**

- EN: Lowest-common-denominator integration with meters, drives, and legacy devices where simplicity beats sophistication.
- DE: Integration auf dem kleinsten gemeinsamen Nenner mit Zählern, Antrieben und Altgeräten, wo Einfachheit wichtiger ist als Funktionsumfang.

**`how`**

- EN: Clients read/write holding and input registers by address using function codes; data meaning lives only in the register map document; polling rate times register count consumes the device's processing budget.
- DE: Clients lesen und schreiben Holding- und Input-Register adressbasiert über Funktionscodes; die Bedeutung der Daten existiert ausschließlich im Registerlisten-Dokument; Abfragerate mal Registeranzahl verbraucht das Verarbeitungsbudget des Geräts.

**`faults`**

- EN: Off-by-one addressing from 0-based versus 1-based conventions; timeouts from aggressive polling; 32-bit values assembled with wrong word order; undocumented register maps drifting from reality.
- DE: Off-by-one-Adressierung durch 0- gegenüber 1-basierten Konventionen; Timeouts durch zu aggressives Abfragen; 32-Bit-Werte mit falscher Wortreihenfolge zusammengesetzt; undokumentierte Registerlisten, die von der Realität abweichen.

**`c3`**

- EN: Reproduce reads with an independent Modbus test client against the documented map before debugging application code.
- DE: Lesezugriffe mit einem unabhängigen Modbus-Testclient gegen die dokumentierte Liste nachstellen, bevor der Anwendungscode untersucht wird.

**`commissioning`**

- EN: Validate the register map end-to-end including word order and scaling, and record per-device polling budgets in the integration documentation.
- DE: Die Registerliste durchgängig einschließlich Wortreihenfolge und Skalierung validieren und die Abfragebudgets je Gerät in der Integrationsdokumentation festhalten.

**`concepts`**

- EN: Register model, function codes, addressing conventions, word order, polling budget, exception responses.
- DE: Registermodell, Funktionscodes, Adressierungskonventionen, Wortreihenfolge, Abfragebudget, Ausnahmeantworten.

**`brainUse`**

- EN: Cited for Modbus value mismatches, timeouts, register-map confusion, and integration of legacy field devices.
- DE: Wird zitiert bei abweichenden Modbus-Werten, Timeouts, Unklarheiten in Registerlisten und der Integration von Altgeräten im Feld.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 13. `mqtt` — MQTT

**EN title:** MQTT
**DE title:** MQTT

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** MQTT is telemetry, not control: never close protective loops over a broker, and never run unauthenticated brokers on OT segments.

> **DE:** MQTT ist Telemetrie, keine Steuerung: Schutzregelkreise niemals über einen Broker schließen und niemals unauthentifizierte Broker in OT-Segmenten betreiben.

**Technical tokens EN:** MQTT, QoS, TLS
**Technical tokens DE:** MQTT, QoS, TLS
**Numeric/unit tokens EN:** 1, 2
**Numeric/unit tokens DE:** 1, 2

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Pub/sub topics, QoS, and edge telemetry patterns.
- DE: Publish/Subscribe-Topics, QoS und Muster für Edge-Telemetrie.

**`p1`**

- EN: Topic hierarchies (site/area/device/signal) enable selective subscription — design them before deployment.
- DE: Topic-Hierarchien (Standort/Bereich/Gerät/Signal) ermöglichen selektives Abonnieren — sie vor der Inbetriebnahme entwerfen.

**`p2`**

- EN: QoS 1 can duplicate and QoS 2 costs throughput — choose per signal criticality.
- DE: QoS 1 kann duplizieren und QoS 2 kostet Durchsatz — je nach Signalkritikalität wählen.

**`p3`**

- EN: Retained messages and Last Will provide state recovery and device-loss detection.
- DE: Retained Messages und Last Will ermöglichen Zustandswiederherstellung und Erkennung von Geräteausfällen.

**`c1`**

- EN: Verify broker authentication and TLS — never run open brokers on OT networks.
- DE: Broker-Authentifizierung und TLS verifizieren — in OT-Netzen niemals offene Broker betreiben.

**`c2`**

- EN: Monitor client reconnect counts; flapping indicates network or keep-alive issues.
- DE: Die Anzahl der Client-Wiederverbindungen überwachen; häufiges Flattern deutet auf Netz- oder Keep-alive-Probleme hin.

**`overview`**

- EN: MQTT is publish/subscribe telemetry for the edge: lightweight clients push topic-organized data through a broker, decoupling producers from consumers.
- DE: MQTT ist Publish/Subscribe-Telemetrie für die Edge: leichtgewichtige Clients senden topic-organisierte Daten über einen Broker und entkoppeln damit Erzeuger von Verbrauchern.

**`purpose`**

- EN: Move sensor and edge data to platforms and dashboards efficiently over unreliable links, with state recovery via retained messages and Last Will.
- DE: Sensor- und Edge-Daten effizient über unzuverlässige Verbindungen zu Plattformen und Dashboards bewegen, mit Zustandswiederherstellung über Retained Messages und Last Will.

**`how`**

- EN: Clients connect to the broker with keep-alive supervision; topic hierarchies (site/area/device/signal) enable selective subscription; QoS levels trade delivery guarantees against throughput; retained messages give late subscribers current state.
- DE: Clients verbinden sich mit dem Broker unter Keep-alive-Überwachung; Topic-Hierarchien (Standort/Bereich/Gerät/Signal) ermöglichen selektives Abonnieren; QoS-Stufen wägen Zustellgarantien gegen Durchsatz ab; Retained Messages geben spät hinzukommenden Abonnenten den aktuellen Zustand.

**`faults`**

- EN: Keep-alive exceeding firewall NAT idle timeouts causing periodic drops; QoS 2 throttling throughput unnecessarily; topic sprawl without a designed hierarchy; open brokers on OT networks.
- DE: Keep-alive länger als das NAT-Idle-Timeout der Firewall, was periodische Abbrüche verursacht; QoS 2, das den Durchsatz unnötig drosselt; Topic-Wildwuchs ohne entworfene Hierarchie; offene Broker in OT-Netzen.

**`c3`**

- EN: Monitor client reconnect counts at the broker — connection flapping localizes network and keep-alive problems.
- DE: Die Anzahl der Client-Wiederverbindungen am Broker überwachen — Verbindungsflattern grenzt Netz- und Keep-alive-Probleme ein.

**`commissioning`**

- EN: Design the topic tree before deployment, enforce TLS and authentication, and verify Last Will behavior for every device class.
- DE: Den Topic-Baum vor der Inbetriebnahme entwerfen, TLS und Authentifizierung durchsetzen und das Last-Will-Verhalten für jede Geräteklasse verifizieren.

**`concepts`**

- EN: Pub/sub decoupling, topic design, QoS levels, retained messages and Last Will, broker security.
- DE: Publish/Subscribe-Entkopplung, Topic-Design, QoS-Stufen, Retained Messages und Last Will, Broker-Sicherheit.

**`brainUse`**

- EN: Cited for edge telemetry architecture, broker disconnect patterns, QoS selection, and IIoT data movement.
- DE: Wird zitiert bei Edge-Telemetrie-Architektur, Broker-Verbindungsabbrüchen, QoS-Auswahl und IIoT-Datenbewegung.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 14. `troubleshooting` — Fehlersuche in der Instandhaltung

**EN title:** Maintenance Troubleshooting
**DE title:** Fehlersuche in der Instandhaltung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Diagnostic interventions on live equipment follow the same isolation and permit discipline as repairs — troubleshooting urgency does not suspend LOTO.

> **DE:** Diagnosetätigkeiten an unter Spannung stehenden Anlagen unterliegen derselben Freischalt- und Erlaubnisdisziplin wie Reparaturen — die Dringlichkeit der Fehlersuche setzt LOTO nicht außer Kraft.

**Technical tokens EN:** LOTO
**Technical tokens DE:** LOTO
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Systematic fault isolation: symptom, cause, verification.
- DE: Systematische Fehlereingrenzung: Symptom, Ursache, Verifizierung.

**`p1`**

- EN: Change one variable at a time and record the result; parallel changes destroy diagnostic information.
- DE: Immer nur eine Größe verändern und das Ergebnis festhalten; parallele Änderungen zerstören die diagnostische Information.

**`p2`**

- EN: Half-split the signal chain (field device → wiring → I/O → logic → display) to isolate the failing layer.
- DE: Die Signalkette (Feldgerät → Verdrahtung → E/A → Logik → Anzeige) halbierend eingrenzen, um die fehlerhafte Ebene zu isolieren.

**`p3`**

- EN: Intermittent faults correlate with conditions — log time, temperature, vibration, and operating state.
- DE: Sporadische Fehler korrelieren mit Bedingungen — Zeit, Temperatur, Schwingung und Betriebszustand protokollieren.

**`c1`**

- EN: Reproduce the fault under controlled conditions before replacing parts.
- DE: Den Fehler unter kontrollierten Bedingungen reproduzieren, bevor Teile getauscht werden.

**`c2`**

- EN: After repair, confirm the original symptom is gone and no new alarms appeared.
- DE: Nach der Reparatur bestätigen, dass das ursprüngliche Symptom verschwunden ist und keine neuen Alarme aufgetreten sind.

**`overview`**

- EN: Systematic troubleshooting is a discipline of isolation: half-split the chain, change one variable, verify with evidence — the opposite of parts-swapping by intuition.
- DE: Systematische Fehlersuche ist eine Disziplin der Eingrenzung: die Kette halbieren, jeweils eine Größe verändern, mit Evidenz verifizieren — das Gegenteil vom intuitiven Teiletausch.

**`purpose`**

- EN: Reach the failing layer in minimum steps while preserving the diagnostic information that hasty changes destroy.
- DE: Die fehlerhafte Ebene in möglichst wenigen Schritten erreichen und dabei die diagnostische Information bewahren, die vorschnelle Änderungen zerstören.

**`how`**

- EN: The signal chain (field device → wiring → I/O → logic → display) is bisected by tests at its midpoints; one-variable-at-a-time changes keep cause and effect attributable; intermittents are correlated with logged conditions.
- DE: Die Signalkette (Feldgerät → Verdrahtung → E/A → Logik → Anzeige) wird durch Messungen an ihren Mittelpunkten halbiert; Änderungen an jeweils nur einer Größe halten Ursache und Wirkung zuordenbar; sporadische Fehler werden mit protokollierten Bedingungen korreliert.

**`faults`**

- EN: Multiple simultaneous changes erasing causality; reproducible faults 'fixed' without identified cause and returning; intermittents chased without condition logging; the same failure recurring because nothing was recorded last time.
- DE: Mehrere gleichzeitige Änderungen, die die Kausalität auslöschen; reproduzierbare Fehler, die ohne identifizierte Ursache „behoben“ werden und wiederkehren; sporadische Fehler, die ohne Bedingungsprotokoll verfolgt werden; derselbe Ausfall, der wiederkehrt, weil beim letzten Mal nichts festgehalten wurde.

**`c3`**

- EN: Before replacing any component, reproduce the fault once under controlled conditions and record exactly what produces it.
- DE: Vor dem Austausch einer Komponente den Fehler einmal unter kontrollierten Bedingungen reproduzieren und exakt festhalten, wodurch er entsteht.

**`commissioning`**

- EN: Institutionalize the discipline: fault logs with conditions, post-repair verification of the original symptom, and a searchable history of what was concluded.
- DE: Die Disziplin institutionalisieren: Fehlerprotokolle mit Bedingungen, Verifizierung des ursprünglichen Symptoms nach der Reparatur und eine durchsuchbare Historie der gezogenen Schlüsse.

**`concepts`**

- EN: Half-split isolation, one-variable discipline, condition correlation, evidence preservation, verification of repair.
- DE: Halbierende Eingrenzung, Ein-Größen-Disziplin, Bedingungskorrelation, Evidenzsicherung, Verifizierung der Reparatur.

**`brainUse`**

- EN: Cited as the methodological backbone whenever a question describes a fault without a clear domain signature — and alongside domain libraries when it has one.
- DE: Wird als methodisches Rückgrat zitiert, wenn eine Frage einen Fehler ohne klare Domänensignatur beschreibt — und ergänzend zu den Fachbibliotheken, wenn sie eine hat.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 15. `hmiDesign` — HMI-Bildgestaltung

**EN title:** HMI Screen Design
**DE title:** HMI-Bildgestaltung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Critical alarms and safety status must remain visible from every screen level; a maximized trend window must never hide an active critical alarm banner.

> **DE:** Kritische Alarme und der Sicherheitsstatus müssen auf jeder Bildebene sichtbar bleiben; ein maximiertes Trendfenster darf niemals ein aktives kritisches Alarmbanner verdecken.

**Technical tokens EN:** HMI, ISA-101
**Technical tokens DE:** HMI, ISA-101
**Numeric/unit tokens EN:** 1, 101, 2, 3, 4
**Numeric/unit tokens DE:** 1, 101, 2, 3, 4

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Operator display hierarchy, alarm visibility, and bilingual layouts.
- DE: Bildhierarchie, Alarmsichtbarkeit und zweisprachige Layouts für Bedienpersonal.

**`p1`**

- EN: Follow the overview → unit → detail → diagnostic hierarchy (ISA-101) for predictable navigation.
- DE: Der Hierarchie Übersicht → Anlagenteil → Detail → Diagnose (ISA-101) folgen, um vorhersagbare Navigation zu erreichen.

**`p2`**

- EN: Reserve saturated colors for abnormal states; grey normal operation makes alarms stand out.
- DE: Gesättigte Farben abnormalen Zuständen vorbehalten; ein grauer Normalbetrieb lässt Alarme hervortreten.

**`p3`**

- EN: For RTL languages, mirror navigation and reading order but keep trend time axes left-to-right.
- DE: Bei RTL-Sprachen Navigation und Leserichtung spiegeln, die Zeitachse von Trends jedoch von links nach rechts belassen.

**`c1`**

- EN: Confirm every alarm shown is acknowledgeable from the screen where it appears.
- DE: Bestätigen, dass jeder angezeigte Alarm von dem Bild aus quittierbar ist, auf dem er erscheint.

**`c2`**

- EN: Test screens at panel resolution and real viewing distance.
- DE: Bilder in Panel-Auflösung und bei realem Betrachtungsabstand prüfen.

**`overview`**

- EN: HMI design determines whether an operator perceives plant state in one glance or hunts through screens during an upset — display hierarchy, color discipline, and alarm presentation are operational safety factors.
- DE: Die HMI-Gestaltung entscheidet, ob Bedienpersonal den Anlagenzustand auf einen Blick erfasst oder während einer Störung durch Bilder sucht — Bildhierarchie, Farbdisziplin und Alarmdarstellung sind betriebliche Sicherheitsfaktoren.

**`purpose`**

- EN: Give operators situation awareness and unambiguous abnormal-state cues, following ISA-101 display hierarchy practice.
- DE: Bedienpersonal Lagebewusstsein und eindeutige Hinweise auf abnormale Zustände geben, gemäß der Bildhierarchie-Praxis nach ISA-101.

**`how`**

- EN: Level-1 overviews show health of everything; level-2 unit screens support operation; level-3/4 detail and diagnostics support intervention. Grey-scale normal operation reserves saturated color for abnormal states.
- DE: Level-1-Übersichten zeigen den Zustand des Ganzen; Level-2-Anlagenbilder unterstützen die Bedienung; Level-3/4-Detail- und Diagnosebilder unterstützen den Eingriff. Ein graustufiger Normalbetrieb behält gesättigte Farben abnormalen Zuständen vor.

**`faults`**

- EN: Rainbow screens where everything competes for attention; alarms visible on screens where they cannot be acknowledged; navigation depth hiding critical detail; RTL layouts with broken trend time axes.
- DE: Bunte Bilder, in denen alles um Aufmerksamkeit konkurriert; Alarme, die auf Bildern sichtbar sind, von denen aus sie nicht quittiert werden können; Navigationstiefe, die kritische Details verbirgt; RTL-Layouts mit fehlerhaften Zeitachsen in Trends.

**`c3`**

- EN: Time a cold operator finding the cause of a simulated upset — more than two navigations means the hierarchy is wrong.
- DE: Messen, wie lange eine unvorbereitete Bedienperson braucht, um die Ursache einer simulierten Störung zu finden — mehr als zwei Navigationsschritte bedeuten eine falsche Hierarchie.

**`commissioning`**

- EN: Validate screens at panel resolution and arm's-length viewing distance, in both languages, with operators who will actually run the plant.
- DE: Bilder in Panel-Auflösung und bei Armlängen-Betrachtungsabstand validieren, in beiden Sprachen und mit dem Bedienpersonal, das die Anlage tatsächlich fahren wird.

**`concepts`**

- EN: ISA-101 hierarchy, alarm salience, color discipline, faceplates, bilingual/RTL layout.
- DE: ISA-101-Hierarchie, Alarmsalienz, Farbdisziplin, Faceplates, zweisprachiges/RTL-Layout.

**`brainUse`**

- EN: Cited for operator-display questions: confusing screens, alarm visibility, navigation structure, and bilingual HMI layout.
- DE: Wird zitiert bei Fragen zu Bedienbildern: unübersichtliche Bilder, Alarmsichtbarkeit, Navigationsstruktur und zweisprachiges HMI-Layout.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 16. `s71200` — Siemens S7-1200

**EN title:** Siemens S7-1200
**DE title:** Siemens S7-1200

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** The standard 1200 line is not a safety controller; use 1200F variants with certified F-blocks for safety functions, validated with the safety signature.

> **DE:** Die Standard-1200-Reihe ist keine Sicherheitssteuerung; für Sicherheitsfunktionen 1200F-Varianten mit zertifizierten F-Bausteinen einsetzen und über die Sicherheitssignatur validieren.

**Technical tokens EN:** OB1, PROFINET, S7-1200, TIA Portal
**Technical tokens DE:** OB1, PROFINET, S7-1200, TIA Portal, TIA-Portal
**Numeric/unit tokens EN:** 1200, 1217, 150 KB, 3, 8
**Numeric/unit tokens DE:** 1200, 1217, 150 KB, 3, 8

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Compact controller: onboard I/O, signal boards, and sizing limits.
- DE: Kompaktsteuerung: Onboard-E/A, Signalboards und Ausbaugrenzen.

**`p1`**

- EN: The S7-1200 targets compact machines: onboard I/O plus up to 8 signal modules and 3 communication modules.
- DE: Die S7-1200 zielt auf kompakte Maschinen: Onboard-E/A plus bis zu 8 Signalbaugruppen und 3 Kommunikationsbaugruppen.

**`p2`**

- EN: Work memory is the binding constraint (max ~150 KB on the 1217C) — check load before adding libraries.
- DE: Der Arbeitsspeicher ist die bindende Grenze (max. ca. 150 KB bei der 1217C) — die Auslastung vor dem Einbinden von Bibliotheken prüfen.

**`p3`**

- EN: Onboard PROFINET supports PUT/GET only if explicitly enabled under CPU protection settings.
- DE: Das Onboard-PROFINET unterstützt PUT/GET nur, wenn es in den CPU-Schutzeinstellungen ausdrücklich freigegeben ist.

**`c1`**

- EN: Check memory utilization in TIA Portal online diagnostics before expanding the program.
- DE: Die Speicherauslastung in der TIA-Portal-Online-Diagnose prüfen, bevor das Programm erweitert wird.

**`c2`**

- EN: Verify signal board/module count against the CPU's expansion limit.
- DE: Die Anzahl der Signalboards/-baugruppen gegen die Ausbaugrenze der CPU verifizieren.

**`overview`**

- EN: The S7-1200 is Siemens' compact controller line for machine-level automation: onboard I/O, integrated PROFINET, signal-board expansion, engineered in TIA Portal.
- DE: Die S7-1200 ist die kompakte Steuerungsreihe von Siemens für die Maschinenebene: Onboard-E/A, integriertes PROFINET, Erweiterung über Signalboards, projektiert im TIA Portal.

**`purpose`**

- EN: Cost-efficient control of small machines and skids where panel space and budget rule out modular CPUs.
- DE: Kosteneffiziente Steuerung kleiner Maschinen und Skids, wo Schaltschrankplatz und Budget modulare CPUs ausschließen.

**`how`**

- EN: A 1200 CPU runs OB1 cyclically with optional cyclic-interrupt and hardware-interrupt OBs; up to 8 signal modules and 3 communication modules extend onboard I/O; optimized data blocks store symbolically.
- DE: Eine 1200-CPU bearbeitet OB1 zyklisch, optional ergänzt um Weckalarm- und Prozessalarm-OBs; bis zu 8 Signalbaugruppen und 3 Kommunikationsbaugruppen erweitern die Onboard-E/A; optimierte Datenbausteine speichern symbolisch.

**`faults`**

- EN: Work-memory exhaustion as programs grow; BF LED after device-name/IP loss on CPU swap; disabled PUT/GET blocking legacy partners; signal-board limits exceeded in retrofit projects.
- DE: Erschöpfter Arbeitsspeicher mit wachsendem Programm; BF-LED nach Verlust von Gerätename/IP beim CPU-Tausch; deaktiviertes PUT/GET, das Altpartner blockiert; überschrittene Signalboard-Grenzen in Nachrüstprojekten.

**`c3`**

- EN: Verify firmware version compatibility between the CPU, signal boards, and TIA project before download.
- DE: Vor dem Laden die Firmware-Kompatibilität zwischen CPU, Signalboards und TIA-Projekt verifizieren.

**`commissioning`**

- EN: Assign PROFINET device names from the topology view, archive the project with the hardware fingerprint, and record memory utilization as the acceptance baseline.
- DE: PROFINET-Gerätenamen aus der Topologiesicht vergeben, das Projekt mit dem Hardware-Fingerabdruck archivieren und die Speicherauslastung als Abnahme-Baseline festhalten.

**`concepts`**

- EN: TIA Portal, PROFINET device naming, optimized DB access, signal boards, OB structure.
- DE: TIA Portal, PROFINET-Gerätebenennung, optimierter DB-Zugriff, Signalboards, OB-Struktur.

**`brainUse`**

- EN: Cited when questions name the S7-1200, compact Siemens CPUs, TIA configuration limits, or PROFINET device identity problems.
- DE: Wird zitiert, wenn Fragen die S7-1200, kompakte Siemens-CPUs, TIA-Projektierungsgrenzen oder Probleme mit der PROFINET-Geräteidentität nennen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 17. `s71500` — Siemens S7-1500

**EN title:** Siemens S7-1500
**DE title:** Siemens S7-1500

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Any change touching F-modules or F-blocks requires recompiling the safety program and revalidating its signature with documented sign-off.

> **DE:** Jede Änderung, die F-Baugruppen oder F-Bausteine berührt, erfordert ein erneutes Übersetzen des Sicherheitsprogramms und eine erneute Validierung seiner Signatur mit dokumentierter Freigabe.

**Technical tokens EN:** ET 200MP, IRT, PROFINET, S7-1500, TIA Portal
**Technical tokens DE:** ET 200MP, ET-200MP, IRT, PROFINET, S7-1500, TIA Portal
**Numeric/unit tokens EN:** 1200, 1500, 200
**Numeric/unit tokens DE:** 1200, 1500, 200

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Modular high-end controller: performance, diagnostics, and fail-safe options.
- DE: Modulare High-End-Steuerung: Leistung, Diagnose und fehlersichere Optionen.

**`p1`**

- EN: The S7-1500 adds display-based diagnostics, faster backplane, and far larger work memory than the 1200 line.
- DE: Die S7-1500 ergänzt displaybasierte Diagnose, einen schnelleren Rückwandbus und weit größeren Arbeitsspeicher gegenüber der 1200-Reihe.

**`p2`**

- EN: F-CPUs run safety and standard logic side by side; safety signature changes require revalidation.
- DE: F-CPUs führen Sicherheits- und Standardlogik nebeneinander aus; Änderungen der Sicherheitssignatur erfordern eine erneute Validierung.

**`p3`**

- EN: Distributed I/O over ET 200MP/SP with PROFINET IRT gives deterministic cycle times for motion.
- DE: Dezentrale Peripherie über ET 200MP/SP mit PROFINET IRT liefert deterministische Zykluszeiten für Motion.

**`c1`**

- EN: Read the CPU display or web server diagnostics for module-level fault detail.
- DE: Das CPU-Display oder die Webserver-Diagnose für Fehlerdetails auf Baugruppenebene auslesen.

**`c2`**

- EN: After hardware changes, recompile and check the safety program signature if F-modules exist.
- DE: Nach Hardwareänderungen neu übersetzen und bei vorhandenen F-Baugruppen die Signatur des Sicherheitsprogramms prüfen.

**`overview`**

- EN: The S7-1500 is Siemens' high-end modular controller family: fast backplane, display-based diagnostics, large work memory, fail-safe variants, and deterministic distributed I/O via PROFINET IRT.
- DE: Die S7-1500 ist die modulare High-End-Steuerungsfamilie von Siemens: schneller Rückwandbus, displaybasierte Diagnose, großer Arbeitsspeicher, fehlersichere Varianten und deterministische dezentrale Peripherie über PROFINET IRT.

**`purpose`**

- EN: Plant-level and high-performance machine control where cycle time, diagnostics depth, and safety integration drive the architecture.
- DE: Anlagenweite und leistungsintensive Maschinensteuerung, bei der Zykluszeit, Diagnosetiefe und Sicherheitsintegration die Architektur bestimmen.

**`how`**

- EN: Program structure mirrors the 1200 (OBs/FBs/FCs/DBs) at higher performance; ET 200MP/SP racks distribute I/O; F-CPUs execute safety and standard logic side by side under a signed safety program.
- DE: Die Programmstruktur entspricht der 1200 (OBs/FBs/FCs/DBs) bei höherer Leistung; ET-200MP/SP-Racks verteilen die E/A; F-CPUs führen Sicherheits- und Standardlogik nebeneinander unter einem signierten Sicherheitsprogramm aus.

**`faults`**

- EN: Safety-signature mismatch after module replacement; IRT determinism lost through unmanaged switches; diagnostic interrupts flooding from a failing module; web-server left enabled with default access in production.
- DE: Abweichende Sicherheitssignatur nach Baugruppentausch; verlorener IRT-Determinismus durch ungemanagte Switches; Diagnosealarme, die von einer ausfallenden Baugruppe fluten; im Produktivbetrieb mit Standardzugang aktiv gelassener Webserver.

**`c3`**

- EN: Read module-level fault detail from the CPU display or web diagnostics before swapping hardware.
- DE: Fehlerdetails auf Baugruppenebene aus dem CPU-Display oder der Webdiagnose auslesen, bevor Hardware getauscht wird.

**`commissioning`**

- EN: Verify IRT topology against plan, set diagnostics-interrupt policies per module, and harden the web server (HTTPS, user accounts) before handover.
- DE: Die IRT-Topologie gegen die Planung verifizieren, Diagnosealarm-Richtlinien je Baugruppe festlegen und den Webserver vor der Übergabe härten (HTTPS, Benutzerkonten).

**`concepts`**

- EN: ET 200 distributed I/O, PROFINET IRT, fail-safe (F) program, diagnostic buffer, TIA Portal.
- DE: ET-200-Dezentralperipherie, PROFINET IRT, fehlersicheres (F-)Programm, Diagnosepuffer, TIA Portal.

**`brainUse`**

- EN: Cited for S7-1500 questions: fail-safe behavior, scan/cycle performance, distributed I/O, and deep Siemens diagnostics.
- DE: Wird zitiert bei Fragen zur S7-1500: fehlersicheres Verhalten, Zyklusleistung, dezentrale Peripherie und tiefe Siemens-Diagnose.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 18. `structuredText` — Strukturierter Text (SCL)

**EN title:** Structured Text (SCL)
**DE title:** Strukturierter Text (SCL)

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Keep ST computation out of safety paths unless written in certified F-blocks; complex code in protective logic defeats validation.

> **DE:** ST-Berechnungen aus Sicherheitspfaden heraushalten, sofern sie nicht in zertifizierten F-Bausteinen geschrieben sind; komplexer Code in Schutzlogik unterläuft die Validierung.

**Technical tokens EN:** IEC 61131-3, PLC, SCL
**Technical tokens DE:** IEC 61131-3, PLC, SCL
**Numeric/unit tokens EN:** 3, 61131
**Numeric/unit tokens DE:** 3, 61131

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: High-level PLC language: control flow, data handling, and pitfalls.
- DE: Hochsprache für PLC: Ablaufsteuerung, Datenverarbeitung und Fallstricke.

**`p1`**

- EN: SCL suits calculations, data handling, and state machines; ladder remains clearer for discrete interlocks.
- DE: SCL eignet sich für Berechnungen, Datenverarbeitung und Zustandsautomaten; der Kontaktplan bleibt für diskrete Verriegelungen anschaulicher.

**`p2`**

- EN: CASE-based state machines with named constants are auditable; nested IF chains are not.
- DE: CASE-basierte Zustandsautomaten mit benannten Konstanten sind prüfbar; verschachtelte IF-Ketten sind es nicht.

**`p3`**

- EN: Loops run within one scan — an unbounded WHILE can exceed cycle time and trip the watchdog.
- DE: Schleifen laufen innerhalb eines Zyklus — eine unbegrenzte WHILE-Schleife kann die Zykluszeit überschreiten und den Watchdog auslösen.

**`c1`**

- EN: Check cycle-time load after adding loops or heavy string/array operations.
- DE: Die Zykluszeitbelastung prüfen, nachdem Schleifen oder aufwendige String-/Array-Operationen ergänzt wurden.

**`c2`**

- EN: Review implicit type conversions — mixed INT/REAL math silently truncates.
- DE: Implizite Typumwandlungen überprüfen — gemischte INT/REAL-Arithmetik schneidet stillschweigend ab.

**`overview`**

- EN: Structured Text (SCL in Siemens dialect) is the IEC 61131-3 high-level language: typed variables, control flow, and arithmetic for the logic that ladder handles poorly.
- DE: Strukturierter Text (im Siemens-Dialekt SCL) ist die Hochsprache nach IEC 61131-3: typisierte Variablen, Ablaufsteuerung und Arithmetik für die Logik, die der Kontaktplan schlecht abbildet.

**`purpose`**

- EN: Recipe handling, calculations, data structures, and state machines — implemented compactly and reviewably as code.
- DE: Rezeptverwaltung, Berechnungen, Datenstrukturen und Zustandsautomaten — kompakt und überprüfbar als Code umgesetzt.

**`how`**

- EN: ST compiles into the same block model as ladder; CASE statements over named state constants build auditable state machines; loops execute fully within one scan, charging their cost to cycle time.
- DE: ST wird in dasselbe Bausteinmodell wie der Kontaktplan übersetzt; CASE-Anweisungen über benannte Zustandskonstanten bilden prüfbare Zustandsautomaten; Schleifen werden vollständig innerhalb eines Zyklus ausgeführt und belasten damit die Zykluszeit.

**`faults`**

- EN: Unbounded WHILE loops tripping the watchdog; implicit INT/REAL conversions truncating silently; deeply nested IF chains hiding dead branches; array indices unchecked at runtime boundaries.
- DE: Unbegrenzte WHILE-Schleifen, die den Watchdog auslösen; implizite INT/REAL-Umwandlungen, die stillschweigend abschneiden; tief verschachtelte IF-Ketten, die tote Zweige verbergen; zur Laufzeit ungeprüfte Array-Indizes an den Bereichsgrenzen.

**`c3`**

- EN: Step through CASE state transitions online and confirm every state has a defined exit path.
- DE: Die CASE-Zustandsübergänge online durchgehen und bestätigen, dass jeder Zustand einen definierten Ausgang besitzt.

**`commissioning`**

- EN: Measure cycle-time impact of each heavy ST block under worst-case data; enable range checks during commissioning runs even if disabled later for performance.
- DE: Die Zykluszeitwirkung jedes aufwendigen ST-Bausteins unter ungünstigsten Daten messen; Bereichsprüfungen während der Inbetriebnahmeläufe aktivieren, auch wenn sie später aus Leistungsgründen deaktiviert werden.

**`concepts`**

- EN: IEC 61131-3, state machines, CASE/IF control flow, data types and conversion, cycle-time budget.
- DE: IEC 61131-3, Zustandsautomaten, CASE-/IF-Ablaufsteuerung, Datentypen und Umwandlung, Zykluszeitbudget.

**`brainUse`**

- EN: Cited for SCL/ST questions: loops affecting scan time, type-conversion surprises, and state-machine design in code.
- DE: Wird zitiert bei SCL-/ST-Fragen: Schleifen mit Auswirkung auf die Zykluszeit, überraschende Typumwandlungen und Zustandsautomaten-Entwurf im Code.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 19. `historian` — Historian-Konzepte

**EN title:** Historian Concepts
**DE title:** Historian-Konzepte

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Incident investigations need raw, time-synchronized data — verify NTP discipline across sources before you ever need to reconstruct an event.

> **DE:** Untersuchungen von Vorfällen benötigen rohe, zeitsynchrone Daten — die NTP-Disziplin über alle Quellen verifizieren, bevor ein Ereignis rekonstruiert werden muss.

**Technical tokens EN:** NTP
**Technical tokens DE:** NTP
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Time-series storage: compression, retention, and retrieval for process data.
- DE: Zeitreihenspeicherung: Komprimierung, Aufbewahrung und Abruf von Prozessdaten.

**`p1`**

- EN: Deadband (swinging-door) compression stores only significant changes — set it per signal dynamics, not globally.
- DE: Die Totband-Komprimierung (Swinging Door) speichert nur signifikante Änderungen — sie je Signaldynamik einstellen, nicht global.

**`p2`**

- EN: Resolution and retention trade off: raw short-term, aggregated long-term tiers keep storage bounded.
- DE: Auflösung und Aufbewahrung stehen im Zielkonflikt: kurzfristig Rohdaten, langfristig aggregierte Stufen halten den Speicherbedarf begrenzt.

**`p3`**

- EN: Interpolated reads differ from raw reads — trending tools must state which they return.
- DE: Interpolierte Abfragen unterscheiden sich von Rohabfragen — Trendwerkzeuge müssen angeben, was sie zurückliefern.

**`c1`**

- EN: Compare a raw value against the historian value to validate compression settings.
- DE: Einen Rohwert gegen den Historian-Wert vergleichen, um die Komprimierungseinstellungen zu validieren.

**`c2`**

- EN: Check archive backlog/queue size — growth means the store can't keep up with ingest.
- DE: Den Archiv-Rückstand bzw. die Warteschlangengröße prüfen — Wachstum bedeutet, dass der Speicher der Aufnahme nicht folgen kann.

**`overview`**

- EN: A historian is the plant's time-series memory: long-horizon storage of process values, tuned by compression and retention so years of data stay queryable.
- DE: Ein Historian ist das Zeitreihengedächtnis der Anlage: Langzeitspeicherung von Prozesswerten, über Komprimierung und Aufbewahrung so abgestimmt, dass Jahre an Daten abfragbar bleiben.

**`purpose`**

- EN: Trend analysis, incident reconstruction, regulatory evidence, and the raw material for predictive analytics.
- DE: Trendanalyse, Rekonstruktion von Vorfällen, regulatorische Nachweise und die Rohbasis für prädiktive Analytik.

**`how`**

- EN: Swinging-door (deadband) compression stores only significant changes per signal; tiered retention keeps raw data short-term and aggregates long-term; interpolated reads reconstruct values between stored points.
- DE: Die Swinging-Door-Komprimierung (Totband) speichert je Signal nur signifikante Änderungen; gestufte Aufbewahrung hält Rohdaten kurzfristig und Aggregate langfristig; interpolierte Abfragen rekonstruieren Werte zwischen gespeicherten Punkten.

**`faults`**

- EN: Global compression settings flattening fast dynamics; archive queues backing up when ingest outruns storage; clock skew between sources corrupting event sequence; interpolated reads mistaken for raw evidence.
- DE: Globale Komprimierungseinstellungen, die schnelle Dynamiken glätten; Archiv-Warteschlangen, die sich stauen, wenn die Aufnahme den Speicher überholt; Uhrenversatz zwischen Quellen, der die Ereignisreihenfolge verfälscht; interpolierte Abfragen, die für Rohnachweise gehalten werden.

**`c3`**

- EN: Compare a live value against its historian readback to confirm compression is not erasing the dynamics you care about.
- DE: Einen Live-Wert gegen seinen Historian-Rückgabewert vergleichen, um zu bestätigen, dass die Komprimierung die relevante Dynamik nicht auslöscht.

**`commissioning`**

- EN: Set compression per signal class, size storage from measured ingest, and test a restore from archive before declaring the system production-ready.
- DE: Die Komprimierung je Signalklasse einstellen, den Speicher aus der gemessenen Aufnahmerate dimensionieren und eine Rücksicherung aus dem Archiv testen, bevor das System als produktionsbereit erklärt wird.

**`concepts`**

- EN: Time-series compression, retention tiers, interpolation vs raw reads, NTP synchronization, trend retrieval.
- DE: Zeitreihenkomprimierung, Aufbewahrungsstufen, interpolierte gegenüber rohen Abfragen, NTP-Synchronisation, Trendabruf.

**`brainUse`**

- EN: Cited for questions about trends, missing or flattened history, archive growth, and time-series evidence quality.
- DE: Wird zitiert bei Fragen zu Trends, fehlender oder geglätteter Historie, Archivwachstum und der Qualität von Zeitreihennachweisen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 20. `contactors` — Schütze

**EN title:** Contactors
**DE title:** Schütze

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** A welded contactor means the load may be live with the control circuit off — always verify isolation at the load side before work.

> **DE:** Ein verschweißtes Schütz bedeutet, dass die Last trotz abgeschaltetem Steuerstromkreis unter Spannung stehen kann — vor Arbeiten stets die Freischaltung an der Lastseite feststellen.

**Technical tokens EN:** AC-1, AC-3, PLC
**Technical tokens DE:** AC-1, AC-3, PLC
**Numeric/unit tokens EN:** 1, 3, 85%
**Numeric/unit tokens DE:** 1, 3, 85 %

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Coil control, contact wear, and switching behavior.
- DE: Spulenansteuerung, Kontaktverschleiß und Schaltverhalten.

**`p1`**

- EN: Coil voltage sag below ~85% of rated causes chatter — chatter welds main contacts.
- DE: Ein Absinken der Spulenspannung unter ca. 85 % des Bemessungswerts verursacht Rattern — Rattern verschweißt die Hauptkontakte.

**`p2`**

- EN: Size by utilization category (AC-3 for motors); AC-1 ratings overstate motor-switching capacity.
- DE: Nach Gebrauchskategorie auslegen (AC-3 für Motoren); AC-1-Angaben überzeichnen die Motorschaltfähigkeit.

**`p3`**

- EN: Auxiliary contacts mirror state for logic — a welded main with open auxiliary misleads the PLC.
- DE: Hilfskontakte spiegeln den Zustand für die Logik — ein verschweißter Hauptkontakt mit offenem Hilfskontakt täuscht die PLC.

**`c1`**

- EN: Measure coil voltage at pull-in under load, not just at rest.
- DE: Die Spulenspannung beim Anzug unter Last messen, nicht nur im Ruhezustand.

**`c2`**

- EN: Inspect main contacts for pitting/welding after any chatter event.
- DE: Die Hauptkontakte nach jedem Ratterereignis auf Abbrand und Verschweißung prüfen.

**`overview`**

- EN: Contactors switch motor and load power under control-circuit command; their failure modes — chatter, contact welding, coil burnout — sit at the junction of electrical and control faults.
- DE: Schütze schalten Motor- und Lastströme auf Befehl des Steuerstromkreises; ihre Ausfallarten — Rattern, Kontaktverschweißung, Spulendurchbrand — liegen an der Schnittstelle elektrischer und steuerungstechnischer Fehler.

**`purpose`**

- EN: Provide remote, rated, repeatable switching with mirror auxiliary contacts that let logic verify the real power state.
- DE: Ferngesteuertes, bemessenes und wiederholbares Schalten bereitstellen, mit spiegelnden Hilfskontakten, über die die Logik den tatsächlichen Leistungszustand verifizieren kann.

**`how`**

- EN: Coil energization pulls the armature, closing main contacts sized by utilization category (AC-3 for motors); auxiliary contacts mirror state to the PLC; the coil drops out below the holding-voltage threshold.
- DE: Das Bestromen der Spule zieht den Anker an und schließt die nach Gebrauchskategorie ausgelegten Hauptkontakte (AC-3 für Motoren); Hilfskontakte spiegeln den Zustand zur PLC; die Spule fällt unterhalb der Halteschwelle ab.

**`faults`**

- EN: Chatter from coil voltage sag (below ~85% rated) welding main contacts; welded mains with open auxiliaries deceiving the logic; undersized AC-1 selections failing on motor duty; coil burnout from sustained undervoltage.
- DE: Rattern durch Absinken der Spulenspannung (unter ca. 85 % des Bemessungswerts), das Hauptkontakte verschweißt; verschweißte Hauptkontakte mit offenen Hilfskontakten, die die Logik täuschen; unterdimensionierte AC-1-Auswahl, die im Motorbetrieb versagt; Spulendurchbrand durch anhaltende Unterspannung.

**`c3`**

- EN: Verify the mirror relationship: command off, then prove all three phases actually opened at the load terminals.
- DE: Die Spiegelbeziehung verifizieren: Aus-Befehl geben und anschließend nachweisen, dass alle drei Phasen an den Lastklemmen tatsächlich geöffnet haben.

**`commissioning`**

- EN: Measure coil voltage at pull-in under real inrush conditions; confirm utilization category against the actual load, not the catalog default.
- DE: Die Spulenspannung beim Anzug unter realen Einschaltstrombedingungen messen; die Gebrauchskategorie gegen die tatsächliche Last prüfen, nicht gegen den Katalogstandard.

**`concepts`**

- EN: Utilization categories (AC-1/AC-3), coil holding voltage, mirror contacts, contact welding, control-circuit design.
- DE: Gebrauchskategorien (AC-1/AC-3), Spulenhaltespannung, Spiegelkontakte, Kontaktverschweißung, Steuerstromkreisauslegung.

**`brainUse`**

- EN: Cited for chattering or humming starters, loads that won't drop out, and discrepancies between commanded and actual power state.
- DE: Wird zitiert bei ratternden oder brummenden Startern, Lasten, die nicht abfallen, und Abweichungen zwischen befohlenem und tatsächlichem Leistungszustand.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 21. `mcc` — Motor Control Center (MCC)

**EN title:** Motor Control Centers
**DE title:** Motor Control Center (MCC)

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Racking buckets under load risks arc flash; follow the lineup's interlock discipline and the site's PPE category without exception.

> **DE:** Das Ziehen von Einschüben unter Last birgt Störlichtbogengefahr; die Verriegelungsdisziplin der Anlage und die PSA-Kategorie des Standorts sind ausnahmslos einzuhalten.

**Technical tokens EN:** MCC
**Technical tokens DE:** MCC
**Numeric/unit tokens EN:** 1, 2
**Numeric/unit tokens DE:** 1, 2

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: MCC structure: buckets, busbars, coordination, and maintenance.
- DE: MCC-Aufbau: Einschübe, Sammelschienen, Selektivität und Instandhaltung.

**`p1`**

- EN: Each bucket combines disconnect, protection, and starter — interlocks must prevent racking under load.
- DE: Jeder Einschub vereint Trenner, Schutz und Starter — Verriegelungen müssen das Ziehen unter Last verhindern.

**`p2`**

- EN: Busbar joints are the thermal weak point; torque per schedule and thermo-scan under load.
- DE: Sammelschienenverbindungen sind der thermische Schwachpunkt; nach Drehmomentplan anziehen und unter Last thermografieren.

**`p3`**

- EN: Type 2 coordination keeps the starter serviceable after a short circuit; Type 1 only protects people.
- DE: Selektivität Typ 2 hält den Starter nach einem Kurzschluss weiterverwendbar; Typ 1 schützt nur Personen.

**`c1`**

- EN: Thermal-image bucket stabs and bus joints at representative load.
- DE: Einschubkontakte und Schienenverbindungen bei repräsentativer Last thermografieren.

**`c2`**

- EN: Verify protection settings against the motor list after any swap.
- DE: Die Schutzeinstellungen nach jedem Tausch gegen die Motorliste verifizieren.

**`overview`**

- EN: A motor control center concentrates starters, protection, and distribution in withdrawable buckets on a common busbar — the electrical room's interface to every driven load.
- DE: Ein Motor Control Center bündelt Starter, Schutz und Verteilung in ziehbaren Einschüben an einer gemeinsamen Sammelschiene — die Schnittstelle des Elektroraums zu jedem angetriebenen Verbraucher.

**`purpose`**

- EN: Standardize motor power, protection, and isolation per load, with maintainability through bucket withdrawal and type-2 coordination.
- DE: Motorleistung, Schutz und Freischaltung je Verbraucher standardisieren, mit Instandhaltbarkeit durch Einschubentnahme und Selektivität nach Typ 2.

**`how`**

- EN: Vertical bus feeds bucket stabs; each bucket combines disconnect, short-circuit protection, contactor, and overload; interlocks prevent racking under load; bus joints carry the thermal budget of the lineup.
- DE: Die Vertikalschiene speist die Einschubkontakte; jeder Einschub vereint Trenner, Kurzschlussschutz, Schütz und Überlastrelais; Verriegelungen verhindern das Ziehen unter Last; die Schienenverbindungen tragen das thermische Budget der Anlage.

**`faults`**

- EN: Hot bus joints from lost torque; stab contact erosion from repeated racking; coordination type 1 leaving starters destroyed after faults; moisture and dust tracking across insulation in harsh rooms.
- DE: Heiße Schienenverbindungen durch nachlassendes Anzugsmoment; Erosion der Einschubkontakte durch wiederholtes Ziehen; Selektivität Typ 1, die Starter nach Fehlern zerstört zurücklässt; Feuchtigkeit und Staub, die Kriechwege über die Isolation bilden.

**`c3`**

- EN: Thermo-scan bus joints and bucket stabs at representative load — hotspots announce themselves long before failure.
- DE: Schienenverbindungen und Einschubkontakte bei repräsentativer Last thermografieren — Hotspots kündigen sich lange vor dem Ausfall an.

**`commissioning`**

- EN: Torque bus joints to schedule with witness marks, verify protection settings against the motor list, and record baseline thermography.
- DE: Schienenverbindungen nach Drehmomentplan mit Markierung anziehen, Schutzeinstellungen gegen die Motorliste verifizieren und eine Thermografie-Baseline erfassen.

**`concepts`**

- EN: Type-2 coordination, bucket/stab design, busbar thermal management, arc-flash categories, overload classes.
- DE: Selektivität Typ 2, Einschub-/Kontaktaufbau, thermisches Management der Sammelschiene, Störlichtbogenkategorien, Überlastklassen.

**`brainUse`**

- EN: Cited for MCC heating, starter coordination after faults, racking issues, and lineup-level protection questions.
- DE: Wird zitiert bei MCC-Erwärmung, Starter-Selektivität nach Fehlern, Problemen beim Ziehen von Einschüben und Schutzfragen auf Anlagenebene.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 22. `protection` — Elektrischer Schutz

**EN title:** Electrical Protection
**DE title:** Elektrischer Schutz

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Protection settings changes require the coordination study, not field intuition; an upstream device set blind can turn a feeder fault into a plant outage or worse.

> **DE:** Änderungen an Schutzeinstellungen erfordern die Selektivitätsstudie, nicht Erfahrungswerte vor Ort; ein blind eingestelltes vorgelagertes Gerät kann aus einem Abgangsfehler einen Anlagenausfall oder Schlimmeres machen.

**Technical tokens EN:** —
**Technical tokens DE:** —
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Overload, short-circuit, and earth-fault protection coordination.
- DE: Selektivität von Überlast-, Kurzschluss- und Erdschlussschutz.

**`p1`**

- EN: Overload relays protect thermally (I²t); magnetic/instantaneous elements clear short circuits — both are needed.
- DE: Überlastrelais schützen thermisch (I²t); magnetische bzw. unverzögerte Auslöser klären Kurzschlüsse — beide werden benötigt.

**`p2`**

- EN: Selectivity: downstream devices must clear faults before upstream ones — verify with coordination curves.
- DE: Selektivität: Nachgelagerte Geräte müssen Fehler vor vorgelagerten klären — mit Selektivitätskennlinien verifizieren.

**`p3`**

- EN: Repeated nuisance trips are data, not annoyance: log current at trip before raising any setting.
- DE: Wiederholte Fehlauslösungen sind Daten, kein Ärgernis: den Strom bei Auslösung protokollieren, bevor eine Einstellung erhöht wird.

**`c1`**

- EN: Compare relay settings against the motor FLA and the coordination study.
- DE: Die Relaiseinstellungen gegen den Motorbemessungsstrom und die Selektivitätsstudie vergleichen.

**`c2`**

- EN: Test earth-fault function with primary or secondary injection, not just the test button.
- DE: Die Erdschlussfunktion mit Primär- oder Sekundäreinspeisung prüfen, nicht nur über die Prüftaste.

**`overview`**

- EN: Electrical protection layers thermal overload, short-circuit, and earth-fault functions so faults clear fast, selectively, and as close to their origin as possible.
- DE: Der elektrische Schutz staffelt thermischen Überlast-, Kurzschluss- und Erdschlussschutz, damit Fehler schnell, selektiv und möglichst nah an ihrem Ursprung geklärt werden.

**`purpose`**

- EN: Protect conductors, machines, and people while keeping healthy circuits running — selectivity is the difference between tripping one feeder and blacking out the plant.
- DE: Leiter, Maschinen und Personen schützen und zugleich gesunde Stromkreise weiterbetreiben — Selektivität ist der Unterschied zwischen dem Auslösen eines Abgangs und einem Anlagenausfall.

**`how`**

- EN: Overload elements model heating (I²t) and trip on sustained overcurrent; magnetic/instantaneous elements clear short circuits in cycles; coordination studies stack time-current curves so downstream clears before upstream.
- DE: Überlastglieder bilden die Erwärmung ab (I²t) und lösen bei anhaltendem Überstrom aus; magnetische bzw. unverzögerte Glieder klären Kurzschlüsse innerhalb weniger Perioden; Selektivitätsstudien staffeln Strom-Zeit-Kennlinien so, dass nachgelagert vor vorgelagert klärt.

**`faults`**

- EN: Settings raised to silence nuisance trips without diagnosis; selectivity broken by replacement devices with different curves; earth-fault elements never primary-injection tested; bypassed protection left bypassed.
- DE: Einstellungen, die ohne Diagnose erhöht werden, um Fehlauslösungen zum Schweigen zu bringen; durch Ersatzgeräte mit abweichenden Kennlinien zerstörte Selektivität; niemals primäreingespeiste Erdschlussglieder; überbrückter Schutz, der überbrückt bleibt.

**`c3`**

- EN: Log actual current at every trip event before considering any settings change — trips are measurements.
- DE: Bei jedem Auslöseereignis den tatsächlichen Strom protokollieren, bevor eine Einstellungsänderung erwogen wird — Auslösungen sind Messwerte.

**`commissioning`**

- EN: Primary or secondary injection-test each protective function, verify against the coordination study, and seal settings with documented values.
- DE: Jede Schutzfunktion per Primär- oder Sekundäreinspeisung prüfen, gegen die Selektivitätsstudie verifizieren und die Einstellungen mit dokumentierten Werten plombieren.

**`concepts`**

- EN: Time-current curves, selectivity/coordination, I²t thermal modeling, earth-fault protection, injection testing.
- DE: Strom-Zeit-Kennlinien, Selektivität, I²t-Wärmemodell, Erdschlussschutz, Einspeiseprüfung.

**`brainUse`**

- EN: Cited for repeated trips, nuisance overloads, coordination failures, and any question about why protection operated.
- DE: Wird zitiert bei wiederholten Auslösungen, Überlast-Fehlauslösungen, Selektivitätsversagen und jeder Frage danach, warum ein Schutz angesprochen hat.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 23. `transmitters` — Messumformer

**EN title:** Transmitters
**DE title:** Messumformer

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Isolate and depressurize impulse lines before opening connections; trapped process pressure at a manifold is a routine injury source.

> **DE:** Wirkdruckleitungen vor dem Öffnen von Verbindungen freischalten und drucklos machen; eingeschlossener Prozessdruck an einem Ventilblock ist eine regelmäßige Verletzungsursache.

**Technical tokens EN:** HART
**Technical tokens DE:** HART
**Numeric/unit tokens EN:** 20 mA, 3, 4, 5
**Numeric/unit tokens DE:** 20, 20 mA, 3, 4, 5

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Process transmitters: calibration, ranging, and HART diagnostics.
- DE: Prozessmessumformer: Kalibrierung, Bereichseinstellung und HART-Diagnose.

**`p1`**

- EN: Zero and span define the 4–20 mA mapping; re-ranging without recalibration shifts error across the range.
- DE: Nullpunkt und Spanne definieren die 4–20-mA-Abbildung; eine Bereichsänderung ohne Neukalibrierung verschiebt den Fehler über den Bereich.

**`p2`**

- EN: HART carries digital diagnostics over the same loop — device status flags precede visible drift.
- DE: HART überträgt digitale Diagnose über denselben Kreis — Gerätestatus-Kennzeichen gehen sichtbarer Drift voraus.

**`p3`**

- EN: Impulse-line problems (plugging, condensate, trapped gas) imitate sensor failure — check the line before the device.
- DE: Probleme der Wirkdruckleitung (Verstopfung, Kondensat, eingeschlossenes Gas) täuschen einen Sensorausfall vor — die Leitung vor dem Gerät prüfen.

**`c1`**

- EN: Perform a 3- or 5-point calibration check against a reference standard.
- DE: Eine 3- oder 5-Punkt-Kalibrierprüfung gegen ein Referenznormal durchführen.

**`c2`**

- EN: Read HART device status for active diagnostic flags before replacing.
- DE: Vor einem Austausch den HART-Gerätestatus auf aktive Diagnosekennzeichen auslesen.

**`overview`**

- EN: Process transmitters package sensor, conditioning, and communication into field devices whose calibration, ranging, and diagnostics determine measurement trust.
- DE: Prozessmessumformer vereinen Sensor, Signalaufbereitung und Kommunikation in Feldgeräten, deren Kalibrierung, Bereichseinstellung und Diagnose die Vertrauenswürdigkeit der Messung bestimmen.

**`purpose`**

- EN: Deliver accurate, rangeable, diagnosable measurements with digital status that warns before readings visibly fail.
- DE: Genaue, bereichseinstellbare und diagnosefähige Messwerte mit digitalem Status liefern, der warnt, bevor die Anzeige sichtbar versagt.

**`how`**

- EN: Zero and span map the measured range onto 4–20 mA; HART superimposes digital communication on the same loop, exposing device status and configuration; impulse lines couple the process to the sensing element.
- DE: Nullpunkt und Spanne bilden den Messbereich auf 4–20 mA ab; HART überlagert dem Kreis eine digitale Kommunikation und legt Gerätestatus und Parametrierung offen; Wirkdruckleitungen koppeln den Prozess an das Messelement.

**`faults`**

- EN: Re-ranging without recalibration shifting error across the span; plugged or gas-locked impulse lines imitating sensor failure; ignored HART diagnostic flags; zero drift from installation orientation changes.
- DE: Bereichsänderung ohne Neukalibrierung, die den Fehler über die Spanne verschiebt; verstopfte oder gasgefüllte Wirkdruckleitungen, die einen Sensorausfall vortäuschen; ignorierte HART-Diagnosekennzeichen; Nullpunktdrift durch geänderte Einbaulage.

**`c3`**

- EN: Read HART device status before replacing anything — the transmitter usually knows what is wrong with it.
- DE: Vor jedem Austausch den HART-Gerätestatus auslesen — der Messumformer weiß meist selbst, was ihm fehlt.

**`commissioning`**

- EN: Perform a documented 3- or 5-point calibration against a reference standard, and record range, damping, and fail-direction settings.
- DE: Eine dokumentierte 3- oder 5-Punkt-Kalibrierung gegen ein Referenznormal durchführen und Messbereich, Dämpfung sowie Fehlerrichtung festhalten.

**`concepts`**

- EN: Zero/span, HART diagnostics, impulse-line practice, calibration standards, damping and fail direction.
- DE: Nullpunkt/Spanne, HART-Diagnose, Wirkdruckleitungspraxis, Kalibriernormale, Dämpfung und Fehlerrichtung.

**`brainUse`**

- EN: Cited for transmitter drift, suspicious readings after maintenance, calibration questions, and smart-device diagnostics.
- DE: Wird zitiert bei Messumformerdrift, verdächtigen Messwerten nach Instandhaltung, Kalibrierfragen und Diagnose intelligenter Feldgeräte.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 24. `s7comm` — Siemens-S7-Kommunikation

**EN title:** Siemens S7 Communication
**DE title:** Siemens-S7-Kommunikation

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Enabled PUT/GET is unauthenticated memory access to the CPU — pair it with strict network segmentation and treat it as a controlled interface.

> **DE:** Freigegebenes PUT/GET ist unauthentifizierter Speicherzugriff auf die CPU — es ist mit strikter Netzsegmentierung zu koppeln und als kontrollierte Schnittstelle zu behandeln.

**Technical tokens EN:** HMI
**Technical tokens DE:** HMI
**Numeric/unit tokens EN:** 102
**Numeric/unit tokens DE:** 102

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: PUT/GET, ISO-on-TCP (port 102), and data exchange between Siemens CPUs.
- DE: PUT/GET, ISO-on-TCP (Port 102) und Datenaustausch zwischen Siemens-CPUs.

**`p1`**

- EN: S7 communication runs over ISO-on-TCP, port 102; firewalls between cells must pass it explicitly.
- DE: Die S7-Kommunikation läuft über ISO-on-TCP, Port 102; Firewalls zwischen Zellen müssen ihn ausdrücklich durchlassen.

**`p2`**

- EN: PUT/GET must be enabled in the partner CPU's protection settings — modern firmware disables it by default.
- DE: PUT/GET muss in den Schutzeinstellungen der Partner-CPU freigegeben sein — moderne Firmware deaktiviert es standardmäßig.

**`p3`**

- EN: Absolute-address access requires non-optimized DBs on the served side; optimized blocks break legacy clients.
- DE: Zugriff über absolute Adressen erfordert nicht optimierte DBs auf der bereitstellenden Seite; optimierte Bausteine brechen Altclients.

**`c1`**

- EN: Test reachability of port 102 from the client segment before debugging program logic.
- DE: Die Erreichbarkeit von Port 102 aus dem Client-Segment testen, bevor die Programmlogik untersucht wird.

**`c2`**

- EN: Confirm the target DB is non-optimized and PUT/GET is permitted on the partner CPU.
- DE: Bestätigen, dass der Ziel-DB nicht optimiert und PUT/GET auf der Partner-CPU zugelassen ist.

**`overview`**

- EN: S7 communication is Siemens' native CPU-to-CPU and engineering protocol over ISO-on-TCP (port 102), powering PUT/GET data exchange and TIA connectivity.
- DE: Die S7-Kommunikation ist das native CPU-zu-CPU- und Engineering-Protokoll von Siemens über ISO-on-TCP (Port 102) und trägt den PUT/GET-Datenaustausch sowie die TIA-Anbindung.

**`purpose`**

- EN: Direct data exchange between Siemens controllers and access for engineering and HMI systems without intermediate servers.
- DE: Direkter Datenaustausch zwischen Siemens-Steuerungen sowie Zugang für Engineering- und HMI-Systeme ohne zwischengeschaltete Server.

**`how`**

- EN: PUT/GET reads and writes partner data blocks by absolute address over established connections; the served CPU must explicitly permit partner access; non-optimized DBs provide the stable absolute layout legacy clients require.
- DE: PUT/GET liest und schreibt Datenbausteine des Partners über absolute Adressen auf aufgebauten Verbindungen; die bereitstellende CPU muss den Partnerzugriff ausdrücklich zulassen; nicht optimierte DBs liefern das stabile absolute Layout, das Altclients benötigen.

**`faults`**

- EN: PUT/GET disabled by default on modern firmware blocking legacy partners; firewalls silently dropping port 102 between cells; optimized DBs breaking absolute-address clients; connection-resource exhaustion on busy CPUs.
- DE: Standardmäßig deaktiviertes PUT/GET auf moderner Firmware, das Altpartner blockiert; Firewalls, die Port 102 zwischen Zellen still verwerfen; optimierte DBs, die Clients mit absoluter Adressierung brechen; erschöpfte Verbindungsressourcen auf ausgelasteten CPUs.

**`c3`**

- EN: Test TCP reachability of port 102 from the client segment before touching any program logic.
- DE: Die TCP-Erreichbarkeit von Port 102 aus dem Client-Segment testen, bevor irgendeine Programmlogik angefasst wird.

**`commissioning`**

- EN: Document every S7 connection (partners, DBs, direction), verify firewall rules pass port 102 where required and block it everywhere else.
- DE: Jede S7-Verbindung dokumentieren (Partner, DBs, Richtung) und verifizieren, dass Firewall-Regeln Port 102 dort durchlassen, wo er benötigt wird, und ihn überall sonst sperren.

**`concepts`**

- EN: ISO-on-TCP, PUT/GET access control, optimized vs non-optimized DBs, connection resources, cell firewalls.
- DE: ISO-on-TCP, PUT/GET-Zugriffssteuerung, optimierte gegenüber nicht optimierten DBs, Verbindungsressourcen, Zellen-Firewalls.

**`brainUse`**

- EN: Cited for Siemens CPU-to-CPU data exchange failures, PUT/GET permission issues, and port-102 connectivity through firewalls.
- DE: Wird zitiert bei fehlgeschlagenem CPU-zu-CPU-Datenaustausch bei Siemens, PUT/GET-Berechtigungsproblemen und Port-102-Konnektivität durch Firewalls.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 25. `segmentation` — Netzsegmentierung

**EN title:** Network Segmentation
**DE title:** Netzsegmentierung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Segmentation changes can sever control traffic — stage and test conduit policy changes against an inventory of legitimate flows before enforcement.

> **DE:** Änderungen an der Segmentierung können Steuerungsverkehr abschneiden — Conduit-Richtlinienänderungen vor der Durchsetzung schrittweise einführen und gegen eine Bestandsaufnahme der legitimen Flüsse testen.

**Technical tokens EN:** DMZ, IEC 62443, VLAN
**Technical tokens DE:** DMZ, IEC 62443, IEC-62443, VLAN
**Numeric/unit tokens EN:** 62443
**Numeric/unit tokens DE:** 62443

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Zones, conduits, and DMZ design per IEC 62443.
- DE: Zonen, Conduits und DMZ-Auslegung nach IEC 62443.

**`p1`**

- EN: Group assets into zones by criticality; conduits between zones carry only documented, necessary flows.
- DE: Assets nach Kritikalität in Zonen gruppieren; Conduits zwischen Zonen führen ausschließlich dokumentierte, notwendige Datenflüsse.

**`p2`**

- EN: An OT DMZ brokers all IT/OT exchange — no direct path from enterprise (or internet) to controllers.
- DE: Eine OT-DMZ vermittelt den gesamten IT-/OT-Austausch — kein direkter Pfad vom Unternehmensnetz (oder Internet) zu Steuerungen.

**`p3`**

- EN: Flat networks turn one compromised laptop into plant-wide reach; VLANs without ACLs are labels, not segmentation.
- DE: Flache Netze machen aus einem kompromittierten Laptop eine anlagenweite Reichweite; VLANs ohne ACLs sind Etiketten, keine Segmentierung.

**`c1`**

- EN: Review inter-zone firewall rules for any 'any-any' entries.
- DE: Die Firewall-Regeln zwischen Zonen auf „any-any“-Einträge durchsehen.

**`c2`**

- EN: Trace one data flow end-to-end and confirm every hop is documented.
- DE: Einen Datenfluss durchgängig verfolgen und bestätigen, dass jeder Übergang dokumentiert ist.

**`overview`**

- EN: Network segmentation is the structural defense of OT: zones group assets by criticality, conduits carry only documented flows, and a DMZ brokers all exchange with IT.
- DE: Netzsegmentierung ist die strukturelle Verteidigung der OT: Zonen gruppieren Assets nach Kritikalität, Conduits führen ausschließlich dokumentierte Flüsse, und eine DMZ vermittelt jeden Austausch mit der IT.

**`purpose`**

- EN: Contain compromise — a flat network turns one infected laptop into plant-wide reach; zones turn it into a contained event.
- DE: Kompromittierung eingrenzen — ein flaches Netz macht aus einem infizierten Laptop eine anlagenweite Reichweite; Zonen machen daraus ein eingegrenztes Ereignis.

**`how`**

- EN: IEC 62443 zones-and-conduits modeling assigns assets to security zones; firewalls enforce conduit policy between them; the industrial DMZ terminates all IT-originated sessions so nothing reaches controllers directly.
- DE: Die Zonen-und-Conduits-Modellierung nach IEC 62443 ordnet Assets Sicherheitszonen zu; Firewalls setzen die Conduit-Richtlinie zwischen ihnen durch; die industrielle DMZ terminiert alle von der IT ausgehenden Sitzungen, sodass nichts direkt zu Steuerungen gelangt.

**`faults`**

- EN: VLANs without enforced ACLs mistaken for segmentation; any-any firewall rules accumulated over years; vendor remote links bypassing the DMZ; undocumented flows breaking when policy finally tightens.
- DE: VLANs ohne durchgesetzte ACLs, die für Segmentierung gehalten werden; über Jahre angesammelte Any-any-Firewall-Regeln; Hersteller-Fernzugänge, die die DMZ umgehen; undokumentierte Flüsse, die brechen, sobald die Richtlinie endlich verschärft wird.

**`c3`**

- EN: Trace one production data flow end-to-end and verify every hop appears in the conduit documentation.
- DE: Einen produktiven Datenfluss durchgängig verfolgen und verifizieren, dass jeder Übergang in der Conduit-Dokumentation erscheint.

**`commissioning`**

- EN: Build the asset inventory first, model zones from it, implement deny-by-default conduits, and schedule periodic rule reviews as an operational duty.
- DE: Zuerst die Asset-Bestandsaufnahme aufbauen, daraus Zonen modellieren, Conduits mit Deny-by-default umsetzen und regelmäßige Regelprüfungen als betriebliche Pflicht einplanen.

**`concepts`**

- EN: IEC 62443 zones/conduits, industrial DMZ, deny-by-default policy, flow documentation, VLAN vs true segmentation.
- DE: IEC-62443-Zonen/Conduits, industrielle DMZ, Deny-by-default-Richtlinie, Flussdokumentation, VLAN gegenüber echter Segmentierung.

**`brainUse`**

- EN: Cited for OT network architecture, firewall policy between cells, DMZ design, and containment of network-borne threats.
- DE: Wird zitiert bei OT-Netzarchitektur, Firewall-Richtlinien zwischen Zellen, DMZ-Auslegung und Eindämmung netzbasierter Bedrohungen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 26. `accessControl` — Zugriffssteuerung

**EN title:** Access Control
**DE title:** Zugriffssteuerung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Emergency access procedures must be designed in advance; improvised break-glass during an incident becomes the permanent backdoor.

> **DE:** Notfallzugriffsverfahren müssen im Voraus ausgelegt werden; ein während eines Vorfalls improvisierter Break-glass-Zugang wird zur dauerhaften Hintertür.

**Technical tokens EN:** MFA
**Technical tokens DE:** MFA
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Identity, remote access, and least privilege in OT.
- DE: Identität, Fernzugriff und Least Privilege in der OT.

**`p1`**

- EN: Remote access goes through a jump host with MFA and session recording — vendor VPN boxes bypass all three.
- DE: Fernzugriff erfolgt über einen Jump-Host mit MFA und Sitzungsaufzeichnung — Hersteller-VPN-Boxen umgehen alle drei.

**`p2`**

- EN: Shared accounts destroy accountability; engineering and operator roles need separate identities and rights.
- DE: Gemeinsam genutzte Konten zerstören die Zuordenbarkeit; Engineering- und Bedienrollen benötigen getrennte Identitäten und Rechte.

**`p3`**

- EN: Default and vendor passwords on controllers and HMIs are the most common real-world entry point.
- DE: Standard- und Herstellerpasswörter auf Steuerungen und HMIs sind der in der Praxis häufigste Einstiegspunkt.

**`c1`**

- EN: Audit who currently holds remote access and when each account was last used.
- DE: Prüfen, wer derzeit Fernzugriff besitzt und wann jedes Konto zuletzt genutzt wurde.

**`c2`**

- EN: Verify default credentials are changed on every reachable device.
- DE: Verifizieren, dass auf jedem erreichbaren Gerät die Standardzugangsdaten geändert wurden.

**`overview`**

- EN: Access control in OT governs who can touch controllers, HMIs, and engineering tools — identity, least privilege, and supervised remote access.
- DE: Zugriffssteuerung in der OT regelt, wer Steuerungen, HMIs und Engineering-Werkzeuge anfassen darf — Identität, minimale Rechte und beaufsichtigter Fernzugriff.

**`purpose`**

- EN: Make every privileged action attributable and every remote session supervised, because unattributed access is unauditable risk.
- DE: Jede privilegierte Handlung zuordenbar und jede Fernsitzung beaufsichtigt machen, denn nicht zuordenbarer Zugriff ist nicht auditierbares Risiko.

**`how`**

- EN: Jump hosts concentrate remote access behind MFA and session recording; role separation distinguishes operator from engineering rights; credential hygiene eliminates the default passwords that remain the commonest entry point.
- DE: Jump-Hosts bündeln den Fernzugriff hinter MFA und Sitzungsaufzeichnung; die Rollentrennung unterscheidet Bedien- von Engineering-Rechten; Zugangsdatenhygiene beseitigt die Standardpasswörter, die weiterhin der häufigste Einstiegspunkt sind.

**`faults`**

- EN: Vendor VPN appliances bypassing the jump-host path; shared engineering accounts destroying attribution; default credentials on controllers and panels; dormant accounts of departed staff retaining access.
- DE: Hersteller-VPN-Appliances, die den Jump-Host-Pfad umgehen; gemeinsam genutzte Engineering-Konten, die die Zuordenbarkeit zerstören; Standardzugangsdaten auf Steuerungen und Bedientafeln; ruhende Konten ausgeschiedener Mitarbeitender, die den Zugriff behalten.

**`c3`**

- EN: Audit current remote-access holders and last-use dates — dormant privileged access is the easiest finding with the highest payoff.
- DE: Die aktuellen Inhaber von Fernzugriffen und deren letzte Nutzung prüfen — ruhender privilegierter Zugriff ist der einfachste Fund mit dem höchsten Nutzen.

**`commissioning`**

- EN: Enumerate every reachable device, change every default credential, and document the approved remote-access path before connecting anything to wider networks.
- DE: Jedes erreichbare Gerät erfassen, jede Standardzugangsdaten ändern und den freigegebenen Fernzugriffspfad dokumentieren, bevor irgendetwas mit weiteren Netzen verbunden wird.

**`concepts`**

- EN: Jump hosts and MFA, session recording, role separation, credential hygiene, break-glass procedures.
- DE: Jump-Hosts und MFA, Sitzungsaufzeichnung, Rollentrennung, Zugangsdatenhygiene, Break-glass-Verfahren.

**`brainUse`**

- EN: Cited for remote-access architecture, unauthorized-access concerns, account and credential policy in OT environments.
- DE: Wird zitiert bei Fernzugriffsarchitektur, Sorgen um unbefugten Zugriff sowie Konten- und Zugangsdatenrichtlinien in OT-Umgebungen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 27. `monitoring` — Sicherheitsüberwachung

**EN title:** Security Monitoring
**DE title:** Sicherheitsüberwachung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Use passive collection in OT — active scanning has bricked PLCs and instruments; anything active needs explicit engineering approval and a maintenance window.

> **DE:** In der OT ausschließlich passive Erfassung verwenden — aktives Scannen hat bereits PLCs und Messgeräte unbrauchbar gemacht; alles Aktive benötigt eine ausdrückliche technische Freigabe und ein Wartungsfenster.

**Technical tokens EN:** —
**Technical tokens DE:** —
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Detection of anomalies and intrusions on OT networks.
- DE: Erkennung von Anomalien und Eindringversuchen in OT-Netzen.

**`p1`**

- EN: Passive monitoring via SPAN/TAP observes industrial protocols without touching fragile devices.
- DE: Passive Überwachung über SPAN/TAP beobachtet Industrieprotokolle, ohne empfindliche Geräte zu berühren.

**`p2`**

- EN: OT traffic is highly regular — new device, new connection, or new function code is a strong signal.
- DE: OT-Verkehr ist hochgradig regelmäßig — ein neues Gerät, eine neue Verbindung oder ein neuer Funktionscode ist ein starkes Signal.

**`p3`**

- EN: Detection without a response plan is noise: every alert class needs a defined owner and action.
- DE: Erkennung ohne Reaktionsplan ist Rauschen: Jede Alarmklasse benötigt einen definierten Verantwortlichen und eine Handlung.

**`c1`**

- EN: Verify monitoring sees traffic from every zone, not just the IT boundary.
- DE: Verifizieren, dass die Überwachung Verkehr aus jeder Zone sieht, nicht nur an der IT-Grenze.

**`c2`**

- EN: Review recent new-device and new-connection alerts against the asset inventory.
- DE: Aktuelle Meldungen zu neuen Geräten und Verbindungen gegen die Asset-Bestandsaufnahme prüfen.

**`overview`**

- EN: Security monitoring for OT observes the network's habits — and OT habits are so regular that novelty itself is a high-quality signal.
- DE: Sicherheitsüberwachung für OT beobachtet die Gewohnheiten des Netzes — und OT-Gewohnheiten sind so regelmäßig, dass Neuartigkeit selbst ein hochwertiges Signal ist.

**`purpose`**

- EN: Detect intrusions and anomalies early, from passive observation that cannot disturb fragile industrial devices.
- DE: Eindringversuche und Anomalien früh erkennen, aus passiver Beobachtung, die empfindliche Industriegeräte nicht stören kann.

**`how`**

- EN: SPAN/TAP mirrors feed passive analyzers that parse industrial protocols; baselines of devices, connections, and function codes define normal; new device, new flow, or new command type raises events tied to response runbooks.
- DE: SPAN-/TAP-Spiegelungen speisen passive Analysatoren, die Industrieprotokolle auswerten; Baselines aus Geräten, Verbindungen und Funktionscodes definieren das Normale; ein neues Gerät, ein neuer Fluss oder ein neuer Befehlstyp erzeugt Ereignisse, die an Reaktions-Runbooks gekoppelt sind.

**`faults`**

- EN: Monitoring only the IT boundary while intra-OT traffic goes unseen; alert classes without owners decaying into noise; baselines never updated after legitimate plant changes; active scanning crashing sensitive devices.
- DE: Überwachung ausschließlich an der IT-Grenze, während der Verkehr innerhalb der OT ungesehen bleibt; Alarmklassen ohne Verantwortliche, die zu Rauschen verkommen; Baselines, die nach legitimen Anlagenänderungen nie aktualisiert werden; aktives Scannen, das empfindliche Geräte zum Absturz bringt.

**`c3`**

- EN: Verify sensor coverage actually includes every zone's traffic, not merely the convenient core switch.
- DE: Verifizieren, dass die Sensorabdeckung tatsächlich den Verkehr jeder Zone einschließt und nicht bloß den bequemen Kern-Switch.

**`commissioning`**

- EN: Establish the traffic baseline during known-normal operation, assign an owner and action to every alert class, and rehearse the response path.
- DE: Die Verkehrs-Baseline im bekannt normalen Betrieb erfassen, jeder Alarmklasse einen Verantwortlichen und eine Handlung zuweisen und den Reaktionspfad üben.

**`concepts`**

- EN: Passive SPAN/TAP collection, behavioral baselining, industrial protocol parsing, alert ownership, anomaly types.
- DE: Passive SPAN-/TAP-Erfassung, Verhaltens-Baselining, Auswertung von Industrieprotokollen, Alarmverantwortung, Anomalietypen.

**`brainUse`**

- EN: Cited for unknown devices on OT networks, intrusion detection design, anomaly triage, and monitoring coverage questions.
- DE: Wird zitiert bei unbekannten Geräten in OT-Netzen, Auslegung der Angriffserkennung, Anomalie-Triage und Fragen zur Überwachungsabdeckung.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 28. `audit` — Audit & Protokollierung

**EN title:** Audit & Logging
**DE title:** Audit & Protokollierung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Audit trails around safety-system changes are themselves safety records — protect their integrity and retention accordingly.

> **DE:** Audit-Trails rund um Änderungen an Sicherheitssystemen sind selbst Sicherheitsaufzeichnungen — ihre Integrität und Aufbewahrung sind entsprechend zu schützen.

**Technical tokens EN:** HMI, NTP
**Technical tokens DE:** NTP
**Numeric/unit tokens EN:** —
**Numeric/unit tokens DE:** —

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Audit trails, log collection, and compliance evidence in OT.
- DE: Audit-Trails, Log-Sammlung und Compliance-Nachweise in der OT.

**`p1`**

- EN: Controller and HMI events (downloads, forces, parameter changes) are the audit trail of record — collect them centrally.
- DE: Ereignisse von Steuerungen und HMIs (Ladevorgänge, Forcen, Parameteränderungen) sind der maßgebliche Audit-Trail — sie zentral sammeln.

**`p2`**

- EN: Clock sync (NTP) across devices is a precondition: unsynchronized logs cannot reconstruct an incident.
- DE: Uhrensynchronisation (NTP) über alle Geräte ist Voraussetzung: Unsynchronisierte Protokolle können einen Vorfall nicht rekonstruieren.

**`p3`**

- EN: Logs prove both compliance and innocence — retention must match regulatory and forensic needs.
- DE: Protokolle belegen sowohl Konformität als auch Unschuld — die Aufbewahrung muss regulatorischen und forensischen Anforderungen entsprechen.

**`c1`**

- EN: Confirm program downloads and forces appear in the central log with correct timestamps.
- DE: Bestätigen, dass Programm-Ladevorgänge und Forcen mit korrekten Zeitstempeln im zentralen Protokoll erscheinen.

**`c2`**

- EN: Check time synchronization across PLCs, HMIs, and servers.
- DE: Die Zeitsynchronisation über PLCs, HMIs und Server prüfen.

**`overview`**

- EN: Audit and logging build the evidentiary record of OT: who downloaded what to which controller, when forces were set, and whether time across systems can support reconstruction.
- DE: Audit und Protokollierung bilden den Nachweisbestand der OT: wer was auf welche Steuerung geladen hat, wann Forcen gesetzt wurden und ob die Zeit über die Systeme hinweg eine Rekonstruktion trägt.

**`purpose`**

- EN: Prove compliance, enable forensics, and — equally — prove innocence when something breaks after a change window.
- DE: Konformität belegen, Forensik ermöglichen und — ebenso wichtig — Unschuld belegen, wenn nach einem Änderungsfenster etwas ausfällt.

**`how`**

- EN: Controller and HMI events (downloads, forces, parameter changes, logons) flow to central collection; NTP discipline makes timestamps comparable; retention policy balances forensic depth against storage.
- DE: Ereignisse von Steuerungen und HMIs (Ladevorgänge, Forcen, Parameteränderungen, Anmeldungen) fließen in eine zentrale Sammlung; NTP-Disziplin macht Zeitstempel vergleichbar; die Aufbewahrungsrichtlinie wägt forensische Tiefe gegen Speicherbedarf ab.

**`faults`**

- EN: Logs scattered on local devices and lost with them; clock drift making sequence reconstruction impossible; retention too short for slow-burn incidents; nobody assigned to actually review anything.
- DE: Protokolle, die verstreut auf lokalen Geräten liegen und mit ihnen verloren gehen; Uhrendrift, die eine Rekonstruktion der Reihenfolge unmöglich macht; zu kurze Aufbewahrung für langsam eskalierende Vorfälle; niemand, der tatsächlich mit der Durchsicht beauftragt ist.

**`c3`**

- EN: Perform a test download and force, then confirm both appear centrally with correct timestamps and attribution.
- DE: Einen Testladevorgang und ein Testforcen durchführen und anschließend bestätigen, dass beide zentral mit korrekten Zeitstempeln und Zuordnung erscheinen.

**`commissioning`**

- EN: Stand up NTP first, then central collection, then verify the event chain end-to-end before declaring the audit capability operational.
- DE: Zuerst NTP aufsetzen, dann die zentrale Sammlung, dann die Ereigniskette durchgängig verifizieren, bevor die Auditfähigkeit als betriebsbereit erklärt wird.

**`concepts`**

- EN: Central log collection, NTP discipline, change attribution, retention policy, review ownership.
- DE: Zentrale Log-Sammlung, NTP-Disziplin, Änderungszuordnung, Aufbewahrungsrichtlinie, Verantwortung für die Durchsicht.

**`brainUse`**

- EN: Cited for change-tracking requirements, post-incident reconstruction, compliance evidence, and logging architecture.
- DE: Wird zitiert bei Anforderungen an die Änderungsverfolgung, Rekonstruktion nach Vorfällen, Compliance-Nachweisen und Protokollierungsarchitektur.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 29. `predictive` — Prädiktive Instandhaltung

**EN title:** Predictive Maintenance
**DE title:** Prädiktive Instandhaltung

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Condition data collection on running machines follows guarding and access rules; permanently mounted sensors exist so people don't lean into rotating equipment with magnets.

> **DE:** Die Erfassung von Zustandsdaten an laufenden Maschinen unterliegt den Schutz- und Zugangsregeln; fest montierte Sensoren existieren, damit niemand sich mit Magneten in rotierende Anlagenteile lehnen muss.

**Technical tokens EN:** —
**Technical tokens DE:** —
**Numeric/unit tokens EN:** 1, 2
**Numeric/unit tokens DE:** 1, 2

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Condition monitoring: vibration, thermal, and trend-based intervention.
- DE: Zustandsüberwachung: Schwingung, Thermografie und trendbasierter Eingriff.

**`p1`**

- EN: Predictive maintenance triggers on measured condition (vibration, temperature, current signature), not calendar time.
- DE: Prädiktive Instandhaltung löst auf gemessenen Zustand aus (Schwingung, Temperatur, Stromsignatur), nicht auf Kalenderzeit.

**`p2`**

- EN: Vibration analysis localizes faults: bearing frequencies, imbalance (1×), misalignment (2×) each have signatures.
- DE: Die Schwingungsanalyse lokalisiert Fehler: Lagerfrequenzen, Unwucht (1×) und Fluchtungsfehler (2×) haben jeweils eigene Signaturen.

**`p3`**

- EN: The value is lead time — alerts must arrive early enough to plan, order parts, and schedule.
- DE: Der Wert liegt in der Vorlaufzeit — Meldungen müssen früh genug eintreffen, um zu planen, Teile zu bestellen und zu terminieren.

**`c1`**

- EN: Compare current vibration spectra against the machine's baseline, not absolute limits alone.
- DE: Aktuelle Schwingungsspektren gegen die Baseline der Maschine vergleichen, nicht nur gegen absolute Grenzwerte.

**`c2`**

- EN: Verify alert thresholds produced actionable lead time in past events.
- DE: Verifizieren, dass die Meldeschwellen bei vergangenen Ereignissen nutzbare Vorlaufzeit erzeugt haben.

**`overview`**

- EN: Predictive maintenance intervenes on measured condition — vibration spectra, thermal images, current signatures — instead of calendar guesswork or run-to-failure.
- DE: Prädiktive Instandhaltung greift auf Basis des gemessenen Zustands ein — Schwingungsspektren, Wärmebilder, Stromsignaturen — statt auf kalendarische Annahmen oder Betrieb bis zum Ausfall.

**`purpose`**

- EN: Buy lead time: detect degradation early enough to plan, order parts, and schedule, converting breakdowns into planned work.
- DE: Vorlaufzeit gewinnen: Degradation früh genug erkennen, um zu planen, Teile zu bestellen und zu terminieren, und damit Ausfälle in geplante Arbeit überführen.

**`how`**

- EN: Baselines per machine define normal; vibration analysis localizes faults by frequency signature (1× imbalance, 2× misalignment, bearing tones); trends against the machine's own baseline beat absolute limits; alerts map to planning horizons.
- DE: Baselines je Maschine definieren das Normale; die Schwingungsanalyse lokalisiert Fehler über Frequenzsignaturen (1× Unwucht, 2× Fluchtungsfehler, Lagertöne); Trends gegen die eigene Baseline der Maschine sind aussagekräftiger als absolute Grenzwerte; Meldungen werden auf Planungshorizonte abgebildet.

**`faults`**

- EN: Absolute thresholds ignoring machine individuality; alerts arriving too late to plan; baselines never re-taken after overhauls; condition data collected and never reviewed.
- DE: Absolute Schwellen, die die Individualität der Maschine ignorieren; Meldungen, die zu spät für eine Planung eintreffen; Baselines, die nach Überholungen nie neu erfasst werden; Zustandsdaten, die erhoben und nie ausgewertet werden.

**`c3`**

- EN: Check whether past alerts actually delivered usable lead time — a predictive program is measured by planning horizon, not alarm count.
- DE: Prüfen, ob vergangene Meldungen tatsächlich nutzbare Vorlaufzeit geliefert haben — ein prädiktives Programm misst sich am Planungshorizont, nicht an der Alarmanzahl.

**`commissioning`**

- EN: Baseline every covered machine in known-good state, define alert-to-action workflows, and integrate findings into the planning system from day one.
- DE: Jede erfasste Maschine im bekannt guten Zustand als Baseline aufnehmen, Abläufe von der Meldung zur Handlung festlegen und die Erkenntnisse ab dem ersten Tag in die Planung einbinden.

**`concepts`**

- EN: Vibration signatures, baselining, P-F interval, condition indicators, alert-to-work-order flow.
- DE: Schwingungssignaturen, Baselining, P-F-Intervall, Zustandsindikatoren, Ablauf von der Meldung zum Arbeitsauftrag.

**`brainUse`**

- EN: Cited for early-warning questions, vibration or thermal anomalies, and building condition-based strategies for critical assets.
- DE: Wird zitiert bei Fragen zur Früherkennung, Schwingungs- oder Thermoanomalien und dem Aufbau zustandsbasierter Strategien für kritische Anlagen.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## 30. `rca` — Grundursachenanalyse

**EN title:** Root Cause Analysis
**DE title:** Grundursachenanalyse

### ⚠ Safety note (SAFETY-CRITICAL — review first)

> **EN:** Incident scenes involving injury or near-miss have preservation and reporting obligations that precede any engineering analysis — secure first, analyze second.

> **DE:** Ereignisorte mit Verletzungen oder Beinaheunfällen unterliegen Sicherungs- und Meldepflichten, die jeder technischen Analyse vorausgehen — zuerst sichern, dann analysieren.

**Technical tokens EN:** —
**Technical tokens DE:** —
**Numeric/unit tokens EN:** 5
**Numeric/unit tokens DE:** 5

<details><summary>Remaining 14 fields (EN → DE)</summary>

**`summary`**

- EN: Structured methods: 5 Whys, fishbone, and evidence preservation.
- DE: Strukturierte Methoden: 5 Warum, Ishikawa-Diagramm und Evidenzsicherung.

**`p1`**

- EN: RCA targets the systemic cause; replacing the failed part treats a symptom and schedules a repeat.
- DE: Die Grundursachenanalyse zielt auf die systemische Ursache; der Austausch des ausgefallenen Teils behandelt ein Symptom und terminiert die Wiederholung.

**`p2`**

- EN: 5 Whys works when each answer is verified with evidence — unverified chains produce confident fiction.
- DE: 5 Warum funktioniert, wenn jede Antwort mit Evidenz verifiziert wird — unverifizierte Ketten erzeugen selbstbewusste Fiktion.

**`p3`**

- EN: Preserve evidence before cleanup: photos, parameter dumps, alarm history, and the failed component itself.
- DE: Evidenz vor dem Aufräumen sichern: Fotos, Parameterauszüge, Alarmhistorie und das ausgefallene Bauteil selbst.

**`c1`**

- EN: Check whether the same failure mode occurred before and what was concluded then.
- DE: Prüfen, ob dieselbe Ausfallart bereits früher aufgetreten ist und was damals geschlussfolgert wurde.

**`c2`**

- EN: Validate the proposed root cause by demonstrating it reproduces (or fully explains) the failure.
- DE: Die vorgeschlagene Grundursache validieren, indem nachgewiesen wird, dass sie den Ausfall reproduziert oder vollständig erklärt.

**`overview`**

- EN: Root cause analysis pursues the systemic cause behind a failure — the conditions that made it possible — rather than the broken part that made it visible.
- DE: Die Grundursachenanalyse verfolgt die systemische Ursache hinter einem Ausfall — die Bedingungen, die ihn ermöglicht haben — statt des defekten Teils, das ihn sichtbar gemacht hat.

**`purpose`**

- EN: Prevent recurrence: replacing the failed component without RCA simply schedules the same failure.
- DE: Wiederholung verhindern: Der Austausch des ausgefallenen Bauteils ohne Grundursachenanalyse terminiert lediglich denselben Ausfall erneut.

**`how`**

- EN: Evidence is preserved before cleanup (photos, parameter dumps, alarm history, the component itself); 5-Whys chains advance only on verified answers; fishbone categories ensure systemic factors get examined; the proposed cause must reproduce or fully explain the event.
- DE: Evidenz wird vor dem Aufräumen gesichert (Fotos, Parameterauszüge, Alarmhistorie, das Bauteil selbst); 5-Warum-Ketten schreiten nur über verifizierte Antworten voran; Ishikawa-Kategorien stellen sicher, dass systemische Faktoren untersucht werden; die vorgeschlagene Ursache muss das Ereignis reproduzieren oder vollständig erklären.

**`faults`**

- EN: Unverified why-chains producing confident fiction; evidence destroyed by eager cleanup; analysis stopping at the first human error found; corrective actions never tracked to completion.
- DE: Unverifizierte Warum-Ketten, die selbstbewusste Fiktion erzeugen; Evidenz, die durch eifriges Aufräumen zerstört wird; Analysen, die beim ersten gefundenen menschlichen Fehler stehen bleiben; Korrekturmaßnahmen, deren Umsetzung nie nachverfolgt wird.

**`c3`**

- EN: Search the failure history first — if this mode occurred before, the prior conclusion is your most important piece of evidence.
- DE: Zuerst die Ausfallhistorie durchsuchen — falls diese Ausfallart bereits auftrat, ist die damalige Schlussfolgerung Ihr wichtigstes Beweisstück.

**`commissioning`**

- EN: Make RCA a standing process: trigger criteria, evidence kit, template, and corrective-action tracking owned by someone with authority to close loops.
- DE: Die Grundursachenanalyse als stehenden Prozess verankern: Auslösekriterien, Evidenzkoffer, Vorlage und Nachverfolgung der Korrekturmaßnahmen, verantwortet von einer Person mit Abschlussbefugnis.

**`concepts`**

- EN: Evidence preservation, verified 5-Whys, fishbone analysis, failure history, corrective-action tracking.
- DE: Evidenzsicherung, verifizierte 5 Warum, Ishikawa-Analyse, Ausfallhistorie, Nachverfolgung von Korrekturmaßnahmen.

**`brainUse`**

- EN: Cited for repeated failures, post-incident investigation structure, and converting a fixed symptom into a prevented recurrence.
- DE: Wird zitiert bei wiederholten Ausfällen, der Struktur von Untersuchungen nach Vorfällen und der Überführung eines behobenen Symptoms in eine verhinderte Wiederholung.

</details>

**Terminology decisions to confirm:** _(pre-filled where notable)_

**Reviewer comment:** _______________________________________________

**Status:** ☐ approved  ☐ approved with edits  ☐ rejected

---

## Global terminology decisions applied

- **Lockout/Tagout** → Lockout/Tagout (LOTO) — acronym preserved
- **Prove absence of voltage** → Spannungsfreiheit feststellen
- **Stored energy / DC bus** → gespeicherte Energie / DC-Zwischenkreis
- **Safety relay / F-CPU** → Sicherheitsrelais / F-CPU (preserved)
- **Safety interlock / bypass** → Verriegelung / Überbrückung
- **Motor terminal / control cabinet** → Motorklemme / Schaltschrank
- **Variable-frequency drive** → Frequenzumrichter (VFD acronym kept where EN uses it)
- **Ground fault / short circuit** → Erdschluss / Kurzschluss
- **Overcurrent / overvoltage / undervoltage** → Überstrom / Überspannung / Unterspannung
- **Insulation resistance** → Isolationswiderstand
- **Commissioning / troubleshooting** → Inbetriebnahme / Fehlersuche
- **Root cause / corrective action** → Grundursache / Korrekturmaßnahme
- **Maintenance** → Instandhaltung (never a blanket 'Wartung')
- **V/Hz control** → V/Hz-Regelung — source notation kept for intra-article consistency
- **Ladder logic** → Kontaktplan (KOP)
- **Rung** → Strompfad
- **Interlock (generic, in EN source)** → Verriegelung

## Known open questions for the reviewer

1. `vfd.how` / `vfd.concepts` keep the source notation **V/Hz**. German
   drive documentation commonly writes **U/f**. Confirm the house style.
2. `ladder.name` is rendered **Kontaktplan (KOP)** — confirm KOP is the
   preferred abbreviation for your audience.
3. The English source contains **no** "qualified personnel" clause in
   this namespace; none was added (adding one would introduce a safety
   requirement the source never made). Confirm this is acceptable, or
   raise it as an English-source gap to fix in EN + FA + DE together.
4. `mcc.safetyNote` uses **PSA-Kategorie** for "PPE category".

## Sign-off

- Reviewer name: ______________________  Date: ____________
- Overall status: ☐ approved for publication  ☐ changes required
- German library may be indexed publicly only after approval.
