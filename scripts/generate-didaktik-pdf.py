#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate an extended didactic PDF for Streets of Logic / SRL-Logbuch."""

from pathlib import Path
from fpdf import FPDF

OUT = Path(__file__).resolve().parents[1] / "docs" / "Streets-of-Logic-App-Didaktik.pdf"
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if not Path(FONT_BOLD).exists():
    FONT_BOLD = FONT


class Doc(FPDF):
    def __init__(self):
        super().__init__(format="A4", unit="mm")
        self.set_auto_page_break(auto=True, margin=20)
        self.add_font("Body", "", FONT)
        self.add_font("Body", "B", FONT_BOLD)
        self.set_margins(18, 18, 18)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Body", "", 8.5)
        self.set_text_color(100, 116, 139)
        self.cell(
            0,
            7,
            "Streets of Logic · SRL-Logbuch  ·  Ausführliche didaktische Beschreibung",
            align="L",
        )
        self.ln(3)
        self.set_draw_color(203, 213, 225)
        self.line(18, 12, 192, 12)
        self.ln(6)

    def footer(self):
        self.set_y(-14)
        self.set_font("Body", "", 8.5)
        self.set_text_color(148, 163, 184)
        self.cell(0, 8, f"Seite {self.page_no()}", align="C")

    def cover(self):
        self.add_page()
        self.ln(28)
        self.set_font("Body", "B", 11)
        self.set_text_color(14, 165, 233)
        self.cell(
            0,
            8,
            "STREETS OF LOGIC  ·  TEMPLE OF LOGIC 42",
            align="C",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        self.ln(6)
        self.set_font("Body", "B", 24)
        self.set_text_color(15, 23, 42)
        self.multi_cell(
            0,
            11,
            "App-Beschreibung &\nDidaktischer Kommentar",
            align="C",
        )
        self.ln(4)
        self.set_font("Body", "", 12)
        self.set_text_color(71, 85, 105)
        self.multi_cell(
            0,
            6.5,
            "Ausführliche Fassung mit Seitenbeschreibungen",
            align="C",
        )
        self.ln(4)
        self.set_draw_color(34, 211, 238)
        self.set_line_width(0.6)
        x = (210 - 42) / 2
        self.line(x, self.get_y(), x + 42, self.get_y())
        self.ln(10)
        self.set_font("Body", "", 12)
        self.set_text_color(51, 65, 85)
        self.multi_cell(
            0,
            6.5,
            "Digitale Lernplattform für selbstreguliertes Lernen\n"
            "in der Sekundarstufe I (Klassen 5–9+)\n\n"
            "Dieses Dokument beschreibt die App Seite für Seite:\n"
            "was Lernende und Lehrkräfte sehen und tun können,\n"
            "und wie die Funktionen didaktisch wirken.",
            align="C",
        )
        self.ln(22)
        self.set_font("Body", "", 10)
        self.set_text_color(100, 116, 139)
        self.cell(0, 6, "Stand: August 2026", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(
            0,
            6,
            "Zielgruppe: Lehrkräfte, Fachdidaktik, Schulleitung",
            align="C",
            new_x="LMARGIN",
            new_y="NEXT",
        )

    def h1(self, text):
        self.ln(3)
        if self.get_y() > 250:
            self.add_page()
        self.set_font("Body", "B", 15)
        self.set_text_color(15, 23, 42)
        self.multi_cell(0, 8, text)
        self.ln(1)
        self.set_draw_color(34, 211, 238)
        self.set_line_width(0.45)
        y = self.get_y()
        self.line(18, y, 72, y)
        self.ln(4)

    def h2(self, text):
        self.ln(2.5)
        if self.get_y() > 255:
            self.add_page()
        self.set_font("Body", "B", 12)
        self.set_text_color(30, 41, 59)
        self.multi_cell(0, 6.5, text)
        self.ln(1.2)

    def h3(self, text):
        self.ln(1.5)
        self.set_font("Body", "B", 10.5)
        self.set_text_color(51, 65, 85)
        self.multi_cell(0, 5.8, text)
        self.ln(0.8)

    def p(self, text):
        self.set_font("Body", "", 10)
        self.set_text_color(51, 65, 85)
        self.multi_cell(0, 5.4, text)
        self.ln(2)

    def bullet(self, text):
        self.set_font("Body", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(22)
        self.multi_cell(0, 5.2, f"•  {text}")
        self.ln(0.8)

    def callout(self, title, text):
        if self.get_y() > 245:
            self.add_page()
        start_y = self.get_y()
        self.set_xy(22, start_y + 2.5)
        self.set_font("Body", "B", 9.5)
        self.set_text_color(15, 23, 42)
        self.multi_cell(166, 5.2, title)
        self.set_x(22)
        self.set_font("Body", "", 9.5)
        self.set_text_color(51, 65, 85)
        self.multi_cell(166, 5.1, text)
        end_y = self.get_y() + 2.5
        self.set_draw_color(148, 163, 184)
        self.set_fill_color(248, 250, 252)
        self.rect(18, start_y, 174, end_y - start_y, style="D")
        self.set_y(end_y + 3)

    def screen(self, title, where, purpose, sees, does, didactic):
        """Reusable block for one app screen."""
        self.h2(title)
        self.set_font("Body", "", 9.5)
        self.set_text_color(100, 116, 139)
        self.multi_cell(0, 5, f"Ort in der App: {where}")
        self.ln(1.5)
        self.h3("Zweck")
        self.p(purpose)
        self.h3("Was man sieht")
        for line in sees:
            self.bullet(line)
        self.ln(1)
        self.h3("Was man tun kann")
        for line in does:
            self.bullet(line)
        self.ln(1)
        self.callout("Didaktische Einordnung", didactic)

    def write_body(self):
        self.add_page()

        # TOC-ish intro
        self.h1("1. Überblick: Was ist Streets of Logic?")
        self.p(
            "Streets of Logic (auch SRL-Logbuch / Temple of Logic 42) ist eine schulische "
            "Web-App für selbstreguliertes Lernen (SRL). Sie verbindet den klassischen "
            "Zyklus Planen – Überwachen – Reflektieren mit dem Stundenplan, fachlichen "
            "Zielen und einer XP-/Missions-Schicht. Zielgruppe sind vor allem Klassen 5–9+."
        )
        self.p(
            "Die App läuft als Progressive Web App (PWA) im Browser (Tablet/Smartphone/"
            "Laptop). Es gibt drei Rollen: Schüler/in, Lehrkraft (Admin) und Superadmin "
            "(Schulen/System)."
        )
        self.h3("Didaktische Leitidee")
        self.p(
            "Lernen wird nicht nur als Ergebnis (Note, Nachweis) sichtbar, sondern als "
            "Prozess: Vor der Stunde Ziele und Strategien klären (Forethought), während "
            "der Stunde den eigenen Stand prüfen (Performance/Monitoring), danach "
            "bewerten und den nächsten Schritt ableiten (Self-Reflection). Die App "
            "gibt dafür eine wiedererkennbare Oberfläche und kurze, kachelbasierte "
            "Entscheidungen – besonders geeignet für jüngere Lernende und knappe "
            "Unterrichtszeit."
        )
        self.h3("XP im Logbuch-Kern (Orientierung)")
        self.bullet("Tagesziel speichern: +2 XP")
        self.bullet("Zwischen-Check: +3 XP")
        self.bullet("Tagesabschluss: +3 XP")
        self.bullet("Wochenreflexion: +10 XP")
        self.p(
            "Weitere XP entstehen u. a. in der Zielsetzung und bei Gamification-"
            "Elementen (Missionen, Level). XP soll produktive Lernhandlungen belohnen, "
            "nicht bloßes Klicken."
        )

        self.h1("2. Navigation der Schüler-App")
        self.p(
            "Die Schüler-Oberfläche hat eine Primärnavigation (Heute, Woche, Ziele, "
            "Taktiken, Mehr) sowie Flow-Screens, die aus Mein Tag heraus geöffnet "
            "werden (Planen, Check, Abschluss). Unter „Mehr“ liegen Kontrollzentrum, "
            "Lernstand, Checks, Missionen, Belohnungen, Charakter und XP-Historie."
        )
        self.bullet("Heute → Mein Tag (Stundenplan des Tages)")
        self.bullet("Woche → Meine Woche inkl. Wochenreflexion")
        self.bullet("Ziele → Zielsetzung (Zielnote / Street Target)")
        self.bullet("Taktiken → Taktik-Deck (Strategiebibliothek)")
        self.bullet("Mehr → Hub und weitere Bereiche")
        self.p(
            "Oben erscheinen typischerweise Marke, XP/Level, Benachrichtigungen und "
            "Profil/Logout. Der Einstieg nach dem Login führt oft über das "
            "Kontrollzentrum (Hub)."
        )

        # ========== STUDENT SCREENS ==========
        self.h1("3. Schülerseiten im Detail")

        self.screen(
            "3.1 Kontrollzentrum (Hub)",
            "Mehr → Kontrollzentrum (auch über /student/status erreichbar)",
            "Zentraler Einstieg: Wo stehe ich? Was ist der nächste sinnvolle SRL-Schritt? "
            "Wie läuft mein Level/XP?",
            [
                "Begrüßung und klarer Call-to-Action zum nächsten Schritt "
                "(Tagesziel / Check / Abschluss)",
                "XP- und Levelanzeige mit Fortschrittsbalken",
                "Karten zu Tagesmission und täglichem Fokus (u. a. Streak-Hinweise)",
                "Große Kacheln zu Mein Tag, Woche, Zielsetzung, Lernstand, Taktik-Deck, Checks",
                "Kleinere Einstiege zu Missionen, Belohnungen, Charakter, XP-Historie",
                "Optional: Hinweis auf Start-Briefing",
            ],
            [
                "Mit einem Tippen in den nächsten offenen Lernschritt springen",
                "Gezielt Bereiche öffnen, ohne den Tagesflow zu verlieren",
            ],
            "Der Hub ist die metakognitive „Schaltzentrale“. Er entlastet die Frage "
            "„Was soll ich jetzt tun?“ und hält den SRL-Zyklus präsent, bevor oder "
            "zwischen den Fachstunden.",
        )

        self.screen(
            "3.2 Mein Tag",
            "Navigation: Heute",
            "Tagessteuerung entlang des Stundenplans: Pro Fachstunde den SRL-Zyklus "
            "starten, fortsetzen oder abschließen – plus Hausaufgaben-Organisation.",
            [
                "Tagesübersicht mit Wochentag, Fortschritt und Kennzahlen "
                "(z. B. Ziele gesetzt, XP heute)",
                "Bereich „Hausaufgaben für heute“: offene/erledigte Aufgaben, "
                "ggf. Überfällig-Hinweis",
                "Formular „Für morgen vormerken“: Fach-Chips, Feld „Für zu Hause“, "
                "optional „Im Unterricht erledigt“, Button „Hausaufgabe setzen“",
                "Stundenkarten: Fach, Zeit, Status (Offen / Begonnen / Erledigt), "
                "Mini-Fortschritt Plan→Check→Abschluss",
                "Kurzfassung von Ziel, Check und Reflexion, sofern vorhanden",
            ],
            [
                "Zwischen Schultagen blättern (Bearbeiten i. d. R. nur für heute)",
                "Tagesziel setzen, Zwischen-Check oder Tagesabschluss öffnen",
                "Vorhandene Einträge ansehen/bearbeiten (wenn erlaubt)",
                "Hausaufgaben setzen, abhaken (mit optionaler Notiz) oder löschen",
            ],
            "Mein Tag ist der praktische Anker: SRL wird nicht abstrakt „irgendwo“ "
            "gemacht, sondern an der konkreten Fachstunde. Die Hausaufgabenfunktion "
            "stärkt Ownership und die Brücke Unterricht → Haus, inklusive der Notiz "
            "zu bereits Erledigtem im Unterricht.",
        )

        self.screen(
            "3.3 Tagesziel setzen (Planen) · Phase 1 · +2 XP",
            "Von Mein Tag → Tagesziel / Planen",
            "Vor dem Lernen: Was will ich können, auf welchem Niveau, und wie gehe ich vor?",
            [
                "Hero mit Phase-Rail (1 Tagesziel · 2 Check · 3 Abschluss)",
                "Progressives Akkordeon – ein Schritt offen, fertige Schritte zugeklappt "
                "mit Kurzfassung",
                "Schritt 1 „Was will ich heute können?“: Fach, Nachweis/Checkpoint falls "
                "mehrere, Was-Ziel aus Levelplan, Levelkacheln Rookie/Operator/Street Legend, "
                "angezeigter Levelziel-Text, optional kurzer Detailtext",
                "Schritt 2 „Mein Weg zum Ziel“: Mehrfachauswahl-Kacheln für Starten, "
                "Arbeiten, Kontrollieren (je 1–3); optional Plan B",
                "Schritt 3 „Selbstcheck“: Sicherheit vorher (1–5), optional/überspringbar",
                "Unten dauerhaft: Live-Zusammenfassung „Meine Mission heute“ und Speichern",
            ],
            [
                "Ziele und Strategien wählen bzw. ändern",
                "Vorschlag aus früherer Reflexion übernehmen (wenn angeboten)",
                "Tagesziel bewusst speichern (nicht „nebenbei“)",
            ],
            "Das ist Forethought im Sinne der SRL-Forschung: Intentionalität statt "
            "„einfach anfangen“. Die Trennung Was-Ziel / Level / Wie-Weg macht "
            "Planung explizit. Plan B und Kontrollstrategien trainieren adaptive "
            "Regulation. Das Akkordeon reduziert kognitive Last – wichtig bei "
            "knappem Stundenbeginn.",
        )

        self.screen(
            "3.4 Zwischen-Check · Phase 2 · +3 XP",
            "Von Mein Tag → Zwischen-Check (nach gesetztem Tagesziel)",
            "Während des Lernens: Fortschritt und Verständnis prüfen und ggf. umsteuern.",
            [
                "Gleicher App-Look wie Planen: Hero, Phase-Rail, Akkordeon, "
                "Zusammenfassung unten",
                "Schritt 1: Meine Mission (read-only) mit Weiter-Button",
                "Schritt 2: „Bin ich auf dem richtigen Weg?“ "
                "(z. B. gut unterwegs / etwas ändern / hänge fest / Ziel geändert)",
                "Schritt 3: Kurzer Lern-Check – Verstehen und Vorankommen",
                "Schritt 4: Nächster Schritt "
                "(weiter wie geplant / Plan B / andere Strategie / Hilfe / Ziel anpassen / leichter starten)",
                "Bei Bedarf: Strategie-/Taktik-Modal („Passende Taktik finden“)",
                "Zusammenfassung „Mein Check“ + Speichern",
            ],
            [
                "Statusfragen beantworten und speichern",
                "Bei Feststecken eine Taktik auswählen",
                "Eintrag später ansehen/bearbeiten (wenn erlaubt)",
            ],
            "Klassisches Self-Monitoring: Der Check unterbricht den Autopilot mitten "
            "in der Stunde. Er fördert Frühwarnung bei Verständnis- oder "
            "Motivationsproblemen und koppelt Schwierigkeiten an Handlungsoptionen "
            "(Strategie, Hilfe, leichterer Einstieg) – nicht nur an Frustration.",
        )

        self.screen(
            "3.5 Tagesabschluss (Reflexion) · Phase 3 · +3 XP",
            "Von Mein Tag → Tagesabschluss",
            "Nach dem Lernen: bewerten, Ursachen klären, nächsten Schritt festlegen.",
            [
                "Akkordeon analog zu Plan/Check",
                "Schritt 1: Mission ansehen",
                "Schritt 2: Ziel erreicht? (Ja / Teilweise / Noch nicht / Ziel geändert)",
                "Schritt 3: Was hat geholfen? (Mehrfachauswahl, inkl. „Mein Weg zum Ziel“)",
                "Schritt 4: Was hat gestört? (Zeitfresser, optional; Stufen selten/manchmal/oft; überspringbar)",
                "Schritt 5: Nächste Mission + Sicherheit jetzt (1–5) + optionaler Vorsatz",
                "Zusammenfassung „Das nehme ich mit“ + Speichern",
            ],
            [
                "Reflexion ausfüllen und speichern",
                "Optional Störungen dokumentieren",
                "Vorsatz für das nächste Mal notieren",
            ],
            "Self-Reflection schließt den Zyklus und erzeugt Feedforward für die "
            "nächste Einheit. Die Trennung von Hilfen und Störungen schärft "
            "Attributionen: weg von globalem Selbsturteil, hin zu konkreten "
            "Verhaltens- und Strategiebezügen.",
        )

        self.screen(
            "3.6 Meine Woche · Wochenreflexion · +10 XP",
            "Navigation: Woche",
            "Vom Einzelschritt zur Meta-Ebene: Muster der Woche erkennen und die "
            "nächste Woche vorbereiten.",
            [
                "Wochennavigation und Kennzahlen (gesetzte/erreichte Ziele, XP der Woche)",
                "Fortschrittsdarstellung und ggf. Hausaufgabenquote",
                "Tag-Chips Mo–Fr und Zielkarten der Woche",
                "Wochenreflexions-Formular: Was gelernt? Was offen? Störungen "
                "(Häufigkeit), Strategie der Woche und ob sie geholfen hat, "
                "Plan für nächste Woche",
            ],
            [
                "Woche betrachten und Reflexion einmal abschließen",
                "Danach typischerweise Ansichtsmodus",
            ],
            "Wöchentliche Verdichtung trainiert Transfer und längerfristige "
            "Selbstregulation. Zeitfresser-Fragen adressieren Volition und "
            "Lernumwelt – Themen, die in der Einzeltstunde oft untergehen.",
        )

        self.screen(
            "3.7 Mein Lernstand (Levelplan)",
            "Mehr → Mein Lernstand / Levelstatus",
            "Selbsteinschätzung fachlicher Unterziele auf drei Niveaustufen – "
            "ohne Nachweis-Upload.",
            [
                "Fach-/Thema-Filter und Statusfilter (z. B. Alle / Offen / In Arbeit / Sicher)",
                "Übersicht/Dashboard zum eigenen Stand",
                "Matrix bzw. mobile Karten: Zieltexte mit Zellen Rookie / Operator / Street Legend",
                "Ggf. Materialien oder Übungslinks",
            ],
            [
                "Status pro Ziel/Stufe setzen und speichern",
                "Ziele finden, die als Tagesziel gewählt werden können",
            ],
            "Kompetenzbewusstsein ist die Grundlage guter Tagesziele. Die "
            "Dreistufung (Einstieg – Anwenden – Meistern/Erklären) macht "
            "Differenzierung und Wachstumssprache alltagsfähig. Wichtig: "
            "Selbsteinschätzung hier ≠ Beleg; Evidenz liegt woanders "
            "(Nachweise/Zielsetzung).",
        )

        self.screen(
            "3.8 Zielsetzung (Street Target)",
            "Navigation: Ziele",
            "Längerfristige Zielarbeit: Zielnote, Aufgabenpfad und Auswertung "
            "über den einzelnen Stundenzyklus hinaus.",
            [
                "Fachauswahl",
                "Darstellung Zielnote / erreichte Note und Profilringe "
                "(Rookie/Operator/Street Legend je nach Matrix)",
                "Nächster Schritt und Aufgabenvorschläge („Jetzt üben“)",
                "Nach Termin/Auswertung: Ergebnis, Grow/Glow/nächstes Ziel und XP",
                "Archiv früherer Arbeiten",
            ],
            [
                "Ziele setzen und Übungen angehen",
                "Ergebnisse und nächste Ziele nachverfolgen",
            ],
            "Hier wird SRL mit Leistungsziel und Zeitachse verknüpft. Das "
            "unterstützt Planung über Wochen hinweg und den Abgleich zwischen "
            "Absicht und Ergebnis – formativ und motivierend, wenn Feedback "
            "durch die Lehrkraft begleitet wird.",
        )

        self.screen(
            "3.9 Taktik-Deck",
            "Navigation: Taktiken",
            "Strategiebibliothek: Welche Lernstrategie hilft wann – und wie gehe ich vor?",
            [
                "Kategoriefilter und Strategiekarten (Name, Kurzinfo „Wann hilft’s?“)",
                "Detailansicht mit Schritten und Anwendungshinweisen",
                "Möglichkeit, Strategien als Plan B / Taktik zu merken bzw. im Check zu nutzen",
            ],
            [
                "Strategien durchstöbern und verstehen",
                "Passende Taktik für schwierige Momente wählen",
            ],
            "Strategiewissen ist eine eigene SRL-Komponente. Das Deck macht "
            "implizite „Tricks“ explizit und liefert Sprache für Gespräche "
            "zwischen Lehrkraft und Lernenden („Welche Taktik hast du genutzt?“).",
        )

        self.screen(
            "3.10 Meine Checks (Termine / Nachweise)",
            "Mehr → Meine Checks",
            "Zeitliche Orientierung: anstehende Tests, Klassenarbeiten und "
            "Nachweis-Termine im Blick behalten.",
            [
                "Filter und Hinweis auf den nächsten Check",
                "Kalender-/Listenansicht, bevorstehende und vergangene Termine",
                "Detailansicht einzelner Tage/Termine",
            ],
            [
                "Termine einsehen und in die eigene Planung einbeziehen",
                "Verbindung zu Tagesziel (Nachweis-Auswahl) und Zielsetzung",
            ],
            "Zeitliche Zielorientierung ist Teil erfolgreicher Selbstregulation. "
            "Sichtbare Termine machen Vorbereitung und passende Tagesziele "
            "wahrscheinlicher.",
        )

        self.h2("3.11 Missionen, Belohnungen, Charakter, XP-Historie")
        self.p(
            "Diese Bereiche bilden die Gamification-Hülle um den Logbuch-Kern:"
        )
        self.bullet(
            "Missionen: Aufgaben/Challenges mit XP und ggf. Beweis-Upload – "
            "zusätzliche Ziele außerhalb der Stundenphasen"
        )
        self.bullet(
            "Belohnungen: Bonuskarten, die gegen XP eingelöst werden können"
        )
        self.bullet(
            "Charakter: Identitäts-/Rollenrahmen; oft beim ersten Einstieg wählbar"
        )
        self.bullet(
            "XP-Historie: nachvollziehbare Liste der Buchungen; "
            "Benachrichtigungen für neue XP"
        )
        self.callout(
            "Didaktische Einordnung",
            "Extrinsische Anreize können Engagement in Klasse 5–9 stützen, "
            "wenn sie an sinnvolle Handlungen gekoppelt bleiben. Sie ersetzen "
            "kein fachliches Feedback und keine echten Reflexionsgespräche. "
            "Gut eingesetzt verstärken sie Routinen (Plan/Check/Reflect), "
            "schlecht eingesetzt fördern sie „XP farmen“.",
        )

        self.h2("3.12 Erst-Login")
        self.p(
            "Vor der eigentlichen App setzen Schülerinnen und Schüler nach dem "
            "ersten Login ein persönliches Passwort (Einmalpasswort → neues "
            "Passwort). Das ist ein Sicherheits-/Onboarding-Gate ohne "
            "Lerninhalt – didaktisch relevant nur als verlässlicher, einfacher "
            "Zugang."
        )

        # ========== TEACHER ==========
        self.h1("4. Lehrkräfteseiten im Detail")
        self.p(
            "Lehrkräfte arbeiten in der Admin-/Teacher-Oberfläche. Die "
            "Lernsteuerung sitzt vor allem in den Path-Tabs; zusätzliche "
            "Hash-Tabs verwalten Klassen, XP, Missionen und Spielsystem."
        )

        self.screen(
            "4.1 Klassenübersicht",
            "Teacher → Klassenübersicht / Dashboard",
            "Live-Überblick: Wer hat heute geplant, reflektiert, wie sicher "
            "fühlt sich wer – und was ist der nächste Schritt?",
            [
                "Klassenwahl und Tagesnavigation",
                "Stundenplan-Leiste des Tages",
                "Schülerliste/Tabelle mit Status zu Ziel, Erreichen, Reflexion, "
                "Selbstwirksamkeit, nächstem Schritt, Hinweisen",
            ],
            [
                "Tag und Klasse wechseln",
                "Einzelne Schülerinnen/Schüler öffnen (z. B. Wochenverlauf)",
                "Gesprächsanlässe erkennen statt nur „Kontrolle“ ausüben",
            ],
            "Formatives Monitoring auf Klassenebene. Die Übersicht ist dann "
            "didaktisch stark, wenn sie kurze Coaching-Impulse auslöst "
            "(„Wen spreche ich heute an?“) und nicht bloß Fehlersuche.",
        )

        self.screen(
            "4.2 Woche Klasse (Heatmap)",
            "Teacher → Woche Klasse",
            "Muster über die Woche: Beteiligung an Plan/Check/Reflect über Tage hinweg.",
            [
                "Heatmap Schüler × Wochentage mit Farbstufen",
                "Legende und Wochenwechsel",
            ],
            [
                "Wochenmuster lesen (wer fällt aus, wer ist stabil)",
                "Interventionen und Rituale anpassen",
            ],
            "Sichtbarkeit von Prozessqualität über Zeit. Hilft gegen den "
            "Bias, nur die „lauten“ oder „auffälligen“ Lernenden zu sehen.",
        )

        self.screen(
            "4.3 Stundenplan",
            "Teacher → Stundenplan",
            "Infrastruktur für Mein Tag: Welche Fächer liegen in welchen Zeitslots?",
            [
                "Wochentags-Raster mit bis zu sieben Zeitslots",
                "Fachwahl inkl. „Frei“ und nicht genutzten Slots, optional Raum",
            ],
            [
                "Stundenplan speichern; Änderungen wirken auf Schüler-Mein-Tag",
            ],
            "Ohne gepflegten Stundenplan bleibt die Schülerseite leer oder "
            "unvollständig. Organisatorische Genauigkeit ist hier "
            "didaktische Voraussetzung.",
        )

        self.screen(
            "4.4 Nachweise planen / Levelchecks",
            "Teacher → Nachweise / Levelchecks",
            "Summative oder halb-summative Anker setzen: Termine und Was-Ziele "
            "für Nachweise, an die Schülerplanung andocken kann.",
            [
                "Klassen-/Fachkontext",
                "Checkpoint mit Datum/Art und Auswahl von Was-Zielen",
                "Listen gespeicherter Nachweise",
            ],
            [
                "Nachweise anlegen, zuordnen, pflegen",
            ],
            "Verbindet den SRL-Alltag mit „echten“ schulischen Terminen. "
            "So wird Planung nicht nur Selbstgespräch, sondern Vorbereitung "
            "auf sichtbare Anforderungen.",
        )

        self.h2("4.5 Levelplan, Ziele-Kataloge, Termine")
        self.bullet(
            "Levelplan-Editor: Themen/Unterthemen, Stufen, Materialien – "
            "fachliche Zielstruktur für Lernstand und Tagesziele"
        )
        self.bullet(
            "Import-Funktionen für Levelplan-Inhalte (wenn genutzt)"
        )
        self.bullet(
            "Was-/Wie-Ziele: Kataloge, die Plan-Kacheln und Auswahloptionen speisen"
        )
        self.bullet(
            "Termine: Übersicht zu Nachweis-/Check-Terminen"
        )
        self.callout(
            "Didaktische Einordnung",
            "Die Qualität der App steht und fällt mit der Qualität der "
            "Zieltexte. Unklare, zu grobe oder zu viele Ziele überfordern. "
            "Gute Ziele sind beobachtbar, stufbar und unterrichtsnah.",
        )

        self.h2("4.6 Weitere Admin-Bereiche (kurz)")
        self.bullet("Klassen & Schüler verwalten")
        self.bullet("XP-Verwaltung und Klassen-Voting / Belohnungsrunden")
        self.bullet("Missionen, Bonuskarten, Charaktere, Levelsystem")
        self.bullet("Profil & Passwort")
        self.p(
            "Diese Bereiche steuern Motivation und Organisation. Didaktisch "
            "sollten sie den Logbuch-Kern stützen, nicht dominieren."
        )

        # ========== SYNTHESIS ==========
        self.h1("5. Wie die Seiten zusammenspielen")
        self.p(
            "Stundenplan (Lehrkraft) → Mein Tag (Schüler) → "
            "Planen (+2) → Zwischen-Check (+3) → Tagesabschluss (+3). "
            "Meine Woche verdichtet den Zyklus (+10). Levelplan/Lernstand "
            "und Zielsetzung liefern Ziele und längerfristige Richtung. "
            "Taktik-Deck und Lehrer-Nachweise stützen Strategien und Termine. "
            "Missionen/XP rahmen motivational."
        )
        self.p(
            "Theoretisch entspricht das dem SRL-Modell mit Forethought, "
            "Performance und Self-Reflection (u. a. Zimmerman), angereichert "
            "um formative Assessment-Ideen: Lernende erzeugen laufend "
            "prozessnahe Informationen – für sich und für die Lehrkraft."
        )

        self.h1("6. Stärken, Grenzen, Gelingensbedingungen")
        self.h2("Stärken")
        self.bullet("Prozesssichtbarkeit statt reiner Ergebnislogik")
        self.bullet("Scaffolding durch Akkordeon, Kacheln und vorgegebene Strategien")
        self.bullet("Fach- und Stundenplanbezug statt generischem Tagebuch")
        self.bullet("Adaptive Regulation (Plan B, Taktiken, Störungsreflexion)")
        self.bullet("Klassenmonitoring für gezielte Gespräche")
        self.h2("Grenzen & Risiken")
        self.bullet("Ohne Unterrichtsritual droht Zusatzaufgabe statt Lernhilfe")
        self.bullet("Vorgegebene Kacheln erleichtern Einstieg, begrenzen aber Tiefe")
        self.bullet("XP kann Reflexion entwerten, wenn nur auf Belohnung geblickt wird")
        self.bullet("Technik, Logins und Gerätezugang müssen schulisch geklärt sein")
        self.h2("Gelingensbedingungen")
        self.bullet(
            "Feste Kurzrituale: z. B. 2–3 Min. Planen am Anfang, Check in der Mitte, "
            "Abschluss am Ende"
        )
        self.bullet("Lehrkraft modelliert Sprache und Ernsthaftigkeit der Reflexion")
        self.bullet("Levelziele fachlich aktuell, verständlich und dosiert halten")
        self.bullet(
            "Klassenübersicht/Woche für Coaching nutzen – nicht nur zur Kontrolle"
        )
        self.bullet(
            "Gamification als Verstärker der Routinen, nicht als Ersatz für Feedback"
        )

        self.h1("7. Kurzfazit")
        self.p(
            "Streets of Logic operationalisiert selbstreguliertes Lernen als "
            "wiederkehrbare Unterrichtspraxis. Die einzelnen Seiten sind so "
            "gebaut, dass sie den Zyklus Planen – Überwachen – Reflektieren "
            "für Lernende handhabbar und für Lehrkräfte beobachtbar machen. "
            "Die App entfaltet ihre Wirkung, wenn sie als Gerüst für "
            "metakognitives Sprechen und fachliches Lernen dient – eingebettet "
            "in klare Rituale, gute Zielstrukturen und pädagogische Begleitung."
        )
        self.callout(
            "Praktischer Einstieg für Teams",
            "1) Stundenpläne und Levelziele pflegen. 2) Drei Minuten SRL-Ritual "
            "pro Stunde vereinbaren. 3) Eine Woche Klassenübersicht gemeinsam "
            "lesen. 4) Mit einer Klasse Feedback zur Sprache der Kacheln "
            "einholen und Ziele nachschärfen.",
        )

        self.ln(6)
        self.set_font("Body", "", 9)
        self.set_text_color(100, 116, 139)
        self.multi_cell(
            0,
            4.8,
            "Hinweis: Funktionsbeschreibungen entsprechen dem Stand der App "
            "(Schüler-Logbuch mit Plan/Check/Reflect, Woche, Lernstand, "
            "Zielsetzung, Taktiken, Checks, Gamification; Lehrkräfte-Tools "
            "für Klasse, Woche, Stundenplan, Nachweise und Kataloge). "
            "Theoretische Bezüge: SRL-Forschung (u. a. Zimmerman; Boekaerts) "
            "und formative Assessment-Praxis. UI-Bezeichnungen können in "
            "Updates leicht variieren.",
        )


def main():
    pdf = Doc()
    pdf.set_title(
        "Streets of Logic – Ausführliche App-Beschreibung & Didaktischer Kommentar"
    )
    pdf.set_author("Streets of Logic")
    pdf.cover()
    pdf.write_body()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    print(OUT)
    print("pages:", pdf.page_no())


if __name__ == "__main__":
    main()
