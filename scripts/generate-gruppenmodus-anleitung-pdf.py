#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lehrer-Anleitung: Gruppenmodus einrichten und nutzen (PDF)."""

from pathlib import Path
from fpdf import FPDF

OUT = (
    Path(__file__).resolve().parents[1]
    / "docs"
    / "Streets-of-Logic-Gruppenmodus-Anleitung.pdf"
)
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if not Path(FONT_BOLD).exists():
    FONT_BOLD = FONT


class Doc(FPDF):
    def __init__(self):
        super().__init__(format="A4", unit="mm")
        self.set_auto_page_break(auto=True, margin=18)
        self.add_font("Body", "", FONT)
        self.add_font("Body", "B", FONT_BOLD)
        self.set_margins(18, 16, 18)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Body", "", 8.5)
        self.set_text_color(100, 116, 139)
        self.cell(
            0,
            6,
            "Streets of Logic  ·  Gruppenmodus – Anleitung für Lehrkräfte",
            align="L",
        )
        self.ln(2)
        self.set_draw_color(203, 213, 225)
        self.line(18, 11, 192, 11)
        self.ln(5)

    def footer(self):
        self.set_y(-12)
        self.set_font("Body", "", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 6, f"Seite {self.page_no()}", align="C")

    def cover(self):
        self.add_page()
        self.ln(22)
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
        self.ln(8)
        self.set_font("Body", "B", 22)
        self.set_text_color(15, 23, 42)
        self.multi_cell(0, 10, "Gruppenmodus", align="C")
        self.ln(1)
        self.set_font("Body", "B", 14)
        self.set_text_color(51, 65, 85)
        self.multi_cell(
            0,
            7,
            "Anleitung für Lehrkräfte\nEinrichten · Begleiten · Reflektieren",
            align="C",
        )
        self.ln(6)
        self.set_draw_color(34, 211, 238)
        self.set_line_width(0.6)
        x = (210 - 42) / 2
        self.line(x, self.get_y(), x + 42, self.get_y())
        self.ln(10)
        self.set_font("Body", "", 11)
        self.set_text_color(51, 65, 85)
        self.multi_cell(
            0,
            6,
            "Der Gruppenmodus unterstützt Labor- und Projektarbeit an einem gemeinsamen "
            "Gerät (z. B. iPad): Rollen, gemeinsame und persönliche Ziele, Zwischencheck "
            "und Abschlussreflexion – fachbezogen und pro Klasse einstellbar.",
            align="C",
        )
        self.ln(14)
        self.set_font("Body", "", 10)
        self.set_text_color(100, 116, 139)
        self.cell(0, 6, "Stand: September 2026", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(
            0,
            6,
            "Zielgruppe: Fachlehrkräfte · Klassenleitung · Fachschaft",
            align="C",
            new_x="LMARGIN",
            new_y="NEXT",
        )

    def h1(self, text):
        self.ln(2)
        if self.get_y() > 248:
            self.add_page()
        self.set_font("Body", "B", 14)
        self.set_text_color(15, 23, 42)
        self.multi_cell(0, 7.5, text)
        self.ln(0.5)
        self.set_draw_color(34, 211, 238)
        self.set_line_width(0.4)
        y = self.get_y()
        self.line(18, y, 70, y)
        self.ln(3)

    def h2(self, text):
        self.ln(1.5)
        if self.get_y() > 255:
            self.add_page()
        self.set_font("Body", "B", 11.5)
        self.set_text_color(30, 41, 59)
        self.multi_cell(0, 6.2, text)
        self.ln(1)

    def p(self, text):
        self.set_font("Body", "", 10)
        self.set_text_color(51, 65, 85)
        self.multi_cell(0, 5.3, text)
        self.ln(1.6)

    def bullet(self, text):
        self.set_font("Body", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(22)
        self.multi_cell(0, 5.1, f"•  {text}")
        self.ln(0.5)

    def numbered(self, n, text):
        self.set_font("Body", "", 10)
        self.set_text_color(51, 65, 85)
        self.set_x(22)
        self.multi_cell(0, 5.1, f"{n}.  {text}")
        self.ln(0.5)

    def callout(self, title, text):
        if self.get_y() > 240:
            self.add_page()
        start_y = self.get_y()
        self.set_xy(22, start_y + 2.5)
        self.set_font("Body", "B", 9.5)
        self.set_text_color(15, 23, 42)
        self.multi_cell(166, 5.1, title)
        self.set_x(22)
        self.set_font("Body", "", 9.5)
        self.set_text_color(51, 65, 85)
        self.multi_cell(166, 5.0, text)
        end_y = self.get_y() + 2.2
        self.set_draw_color(148, 163, 184)
        self.set_fill_color(248, 250, 252)
        self.rect(18, start_y, 174, end_y - start_y, style="D")
        self.set_y(end_y + 2.5)

    def write_body(self):
        self.add_page()

        self.h1("1. Wofür ist der Gruppenmodus?")
        self.p(
            "Viele Labor- und Projektstunden laufen an einem gemeinsamen Gerät. "
            "Der Gruppenmodus ersetzt dann den individuellen Tageszyklus "
            "(Planen – Check – Abschluss) durch einen gemeinsamen Ablauf:"
        )
        self.bullet("Thema und Gruppenmitglieder wählen")
        self.bullet("Rollen verteilen (z. B. Versuch, Protokoll, Ergebnis, Produkt)")
        self.bullet("Gemeinsames Vorhaben und persönliche Was-/Wie-Ziele setzen")
        self.bullet("Während der Arbeit Ergebnisse notieren")
        self.bullet("Optional: Zwischencheck und Abschlussreflexion – Person für Person")
        self.p(
            "Didaktisch bleibt SRL erhalten: Ziele klären, Fortschritt überwachen, "
            "am Ende reflektieren – aber als Gruppe, mit klaren Rollen."
        )
        self.callout(
            "Gerätekonzept",
            "Eine Gruppe arbeitet an einem iPad (oder Laptop). Bei persönlichen Schritten "
            "reicht die App das Gerät weiter: „Gib das iPad jetzt an …“ / „Ich bin … – weiter“.",
        )

        self.h1("2. Schnellstart in 5 Schritten")
        self.numbered(
            1,
            "Levelplan für das Fach vorbereiten (Themen + Unterthemen), "
            "damit Gruppen ein Thema und ein gemeinsames Ziel wählen können.",
        )
        self.numbered(
            2,
            "Als Lehrkraft öffnen: Überblick & Lernsteuerung → Gruppenmodus / Rollen "
            "(Adresse: /teacher/gruppenmodus).",
        )
        self.numbered(
            3,
            "Oben Klasse und Fach wählen. Unter „Einstellungen“ den Schalter "
            "„Gruppenmodus aktivieren …“ einschalten und speichern.",
        )
        self.numbered(
            4,
            "Unter „Rollen und Rollenziele“ prüfen: In Physik liegen Standardrollen bereit; "
            "in anderen Fächern Rollen anlegen, importieren oder aus einem Fach kopieren.",
        )
        self.numbered(
            5,
            "In der Stunde starten die Schüler über Mein Tag (Fachblock) oder über "
            "„Gruppenarbeit“ im Schüler-Menü.",
        )

        self.h1("3. Einstellungen einrichten")
        self.p(
            "Einstellungen gelten immer für die Kombination Klasse × Fach. "
            "Wechseln Sie oben Klasse und Fach, bevor Sie speichern."
        )
        self.h2("Wichtigste Schalter")
        self.bullet(
            "Gruppenmodus aktivieren – ohne diesen Schalter sehen Schüler das Fach nicht."
        )
        self.bullet("Min./Max. Gruppengröße (Standard oft 2–4, höchstens 8).")
        self.bullet("Mehrfachrollen erlauben – sinnvoll, wenn weniger Personen als Rollen.")
        self.bullet("Gemeinsames Vorhaben – Gruppenziel aus dem Levelplan-Thema.")
        self.bullet("Persönliche Was- und Wie-Ziele – Ziele pro Rolle (je bis zu 3).")
        self.bullet("Zwischencheck / Abschlussreflexion – optional einschalten.")
        self.bullet(
            "Freie Was-/Wie-Ziele – Freitext erlauben oder Start ohne Levelplan-Thema."
        )
        self.p("Zum Schluss immer auf „Einstellungen speichern“ tippen.")
        self.callout(
            "Tipp",
            "Wenn noch kein Levelplan für das Fach da ist: „Freie Was-Ziele erlauben“ "
            "einschalten, sonst kommen die Gruppen beim Themen-Schritt nicht weiter.",
        )

        self.h1("4. Rollen und Rollenziele")
        self.p(
            "Rollen beschreiben die Aufgabe in der Gruppe. "
            "Was-Ziele sagen, was jemand in der Rolle tut; "
            "Wie-Ziele, wie die Arbeit gelingen soll."
        )
        self.h2("Physik – Standardrollen")
        self.bullet("Versuch – Versuche vorbereiten und sicher durchführen")
        self.bullet("Protokoll – Aufbau, Beobachtungen und Ergebnisse festhalten")
        self.bullet("Ergebnis – Zusammenhänge erklären und begründen")
        self.bullet("Produkt – Modell oder Produkt planen, bauen, prüfen")
        self.p(
            "Diese Rollen erscheinen automatisch, wenn für Physik noch keine Rollen "
            "angelegt sind. Andere Fächer starten leer und brauchen Ihre Vorlage."
        )
        self.h2("Rollen pflegen")
        self.bullet("Rolle hinzufügen, bearbeiten, duplizieren, aktivieren/deaktivieren")
        self.bullet("Pro Rolle Was- und Wie-Ziele hinzufügen oder löschen")
        self.bullet("Inaktive Rollen erscheinen bei den Schülern nicht")
        self.h2("Import und Kopie")
        self.bullet(
            "„Rollen und Rollenziele importieren“ – Textvorlage (; getrennt), prüfen, "
            "dann sicher hinzufügen oder aktualisieren"
        )
        self.bullet("„Vorlage aus anderem Fach übernehmen“ – bestehende Rollen kopieren")
        self.p(
            "Hinweis in der App: Persönliche Was-/Wie-Ziele gehören zur Rolle; "
            "das gemeinsame Ziel kommt aus dem Levelplan."
        )

        self.h1("5. Was Schüler in der Stunde tun")
        self.h2("Einstieg")
        self.bullet("Mein Tag: Im freigeschalteten Fach erscheint „Gruppenarbeit starten“.")
        self.bullet("Oder Menü „Gruppenarbeit“ → Fach wählen → neue Laborarbeit starten.")
        self.bullet("Offene Gruppen können fortgesetzt oder (bei Bedarf) gelöscht werden.")

        self.h2("Einrichtung (Assistent)")
        self.numbered(1, "Thema aus dem Levelplan wählen (oder ohne Raster, falls erlaubt).")
        self.numbered(2, "Wer arbeitet zusammen? (Min.–Max. Personen)")
        self.numbered(3, "Rollen verteilen – Vorschlag möglich; alle aktiven Rollen müssen vergeben sein.")
        self.numbered(4, "Gemeinsames Vorhaben festlegen.")
        self.numbered(
            5,
            "Jede Person setzt nacheinander Was- und Wie-Ziele (Gerät weitergeben).",
        )
        self.p("Dann: Übersicht prüfen und „Laborarbeit starten“.")

        self.h2("Während der Arbeit")
        self.bullet("Gruppenübersicht zeigt, was noch fehlt (Ziele / Check / Abschluss).")
        self.bullet("Kurze Ergebnisse oder Beobachtungen notieren und speichern.")
        self.bullet("Optional „Zwischencheck starten“ bzw. „Abschlussrunde starten“.")

        self.h2("Zwischencheck (wenn aktiv)")
        self.p(
            "Kurz und kartenbasiert: Bin ich auf dem Weg? Komme ich voran? "
            "Muss ich etwas ändern? Bei Bedarf Schwerpunkte und eine Lernstrategie wählen."
        )

        self.h2("Abschluss (wenn aktiv)")
        self.p(
            "Mission auf einen Blick, dann: Ziel erreicht? Woran erkenne ich das? "
            "Was hat geholfen? Weiter am Ziel oder neues Ziel? Optional kurzer Gruppenaustausch. "
            "Wenn alle fertig sind, ist die Session abgeschlossen."
        )

        self.h1("6. Begleitung als Lehrkraft")
        self.p(
            "Unter „Offene Gruppen“ sehen Sie laufende Sessions mit Status und Fortschritt "
            "(Ziele · Check · Reflexion)."
        )
        self.bullet("Stunde beenden – Session abschließen")
        self.bullet("Wieder öffnen – bei Bedarf erneut freigeben")
        self.bullet("Gruppe löschen – z. B. Fehleinträge oder Geistergruppen entfernen")
        self.callout(
            "Typische Status",
            "Einrichtung → In Arbeit → Zwischencheck → Abschluss → Abgeschlossen",
        )

        self.h1("7. Checkliste vor der Stunde")
        self.numbered(1, "Levelplan-Themen für das Fach vorhanden?")
        self.numbered(2, "Klasse und Fach im Gruppenmodus gewählt?")
        self.numbered(3, "Gruppenmodus aktiviert und gespeichert?")
        self.numbered(4, "Rollen und Ziele geprüft (Physik-Defaults oder eigene Vorlage)?")
        self.numbered(5, "Gruppengröße und optionale Checks passend zur Stunde?")
        self.numbered(6, "Geräte geladen – ein Gerät pro Gruppe?")
        self.numbered(7, "Schüler kennen den Einstieg über Mein Tag oder „Gruppenarbeit“?")

        self.h1("8. Häufige Fragen")
        self.h2("Schüler sehen das Fach nicht")
        self.p(
            "Gruppenmodus für diese Klasse und dieses Fach aktivieren und speichern. "
            "Danach Seite neu laden."
        )
        self.h2("„Für dieses Fach gibt es noch keinen Levelplan“")
        self.p(
            "Themen im Levelplan anlegen – oder unter Einstellungen freie Was-Ziele erlauben."
        )
        self.h2("Rollen lassen sich nicht bestätigen")
        self.p(
            "Alle aktiven Rollen müssen vergeben sein. Bei wenigen Personen Mehrfachrollen "
            "erlauben oder Rollen deaktivieren."
        )
        self.h2("Gruppe hängt in der Einrichtung")
        self.p(
            "Unter „Offene Gruppen“ Status prüfen; ggf. Gruppe löschen und neu starten."
        )

        self.h1("9. Kurzüberblick Didaktik")
        self.bullet("Klarheit: Jede Person hat Rolle und Ziele.")
        self.bullet("Verantwortung: Beiträge sind sichtbar und werden weitergegeben.")
        self.bullet("Überwachen: Zwischencheck ohne langen Freitext.")
        self.bullet("Reflektieren: Abschluss verbindet Ergebnis, Lernen und nächsten Schritt.")
        self.bullet(
            "Fachbezug: Rollen und Ziele kommen aus Ihrer Vorlage – Physik startet mit Labor-Defaults."
        )
        self.ln(4)
        self.set_font("Body", "", 9.5)
        self.set_text_color(100, 116, 139)
        self.multi_cell(
            0,
            5,
            "Weitere Funktionen der App (Tagesziel, Levelplan, XP) sind in der "
            "allgemeinen App-Didaktik beschrieben. Diese Anleitung bezieht sich "
            "nur auf den Gruppenmodus.",
        )


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = Doc()
    pdf.cover()
    pdf.write_body()
    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
