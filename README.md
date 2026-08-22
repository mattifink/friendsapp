# Zeit?

Eine minimale Web-App: Ein Tap sagt deinen Freunden, ob du gerade Zeit hast — plus eine
Zeile, was du machst und wo. Läuft im Browser auf iPhone, Android, Mac, Windows und lässt
sich als App auf den Homescreen legen (PWA).

* Kein Account, kein Passwort: Wer den geheimen Gruppen-Link hat, ist dabei.
* Live: Änderungen erscheinen bei allen sofort.
* Der Code ist reines HTML/CSS/JS — kein Build, kein npm.

## Einrichten (einmalig, ca. 10 Minuten)

**1. Supabase-Projekt anlegen**
Auf [supabase.com](https://supabase.com) kostenlos registrieren und ein neues Projekt
erstellen (Region Frankfurt ist für Deutschland die schnellste).

**2. Datenbank aufsetzen**
Im Projekt links auf *SQL Editor* → *New query*, den Inhalt von
[`supabase/schema.sql`](supabase/schema.sql) einfügen und ausführen.

**3. Zugangsdaten eintragen**
Im Projekt unter *Project Settings → API* findest du die *Project URL* und den
*anon public* Key. Beides in [`config.js`](config.js) eintragen.
Der anon-Key ist ausdrücklich für den Browser gedacht und darf öffentlich sein.

**4. Hochladen**
Den Ordner irgendwo als statische Seite veröffentlichen — z. B. bei
[Netlify Drop](https://app.netlify.com/drop) einfach hineinziehen, oder Vercel,
Cloudflare Pages, GitHub Pages. Es sind nur statische Dateien, ein Server ist nicht nötig.

**5. Gruppe starten**
Seite öffnen → *Neue Gruppe starten* → *Link teilen*. Dieser Link ist der Schlüssel zur
Gruppe: Jeder, der ihn öffnet, trägt seinen Namen ein und ist drin.

## Lokal ausprobieren

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

## Auf den Homescreen legen

* **iPhone:** in Safari öffnen → Teilen-Symbol → *Zum Home-Bildschirm*.
* **Android:** in Chrome öffnen → Menü → *App installieren*.
* **Desktop:** in Chrome/Edge das Installieren-Symbol in der Adresszeile.

## Gut zu wissen

* **Der Link ist der Schlüssel:** 16 Zufallszeichen, praktisch nicht erratbar. Er steht
  hinter `#` und wird deshalb nie an den Server der Hosting-Seite übertragen.
* **Wer den Link hat, sieht die Gruppe** — mehr aber auch nicht: Fremde Einträge ändern
  oder löschen kann niemand, dafür braucht es das private Secret des jeweiligen Geräts.
  Für Sensibleres bräuchte es trotzdem echte Logins.
* **Veraltete Einträge:** Nach 8 Stunden ohne Änderung wird ein Eintrag ausgegraut, damit
  niemand auf ein „Hab Zeit“ von gestern hereinfällt.
* **Aufräumen:** Unten in `schema.sql` steht ein fertiges Statement, um Einträge älter als
  14 Tage zu löschen.

## Darf das Repo öffentlich sein?

Ja. Der `anon public` Key in `config.js` ist dafür gemacht, öffentlich zu sein — er steckt
ohnehin in der ausgelieferten JavaScript-Datei und lässt sich von jedem Besucher der
Website auslesen. Ein privates Repo würde daran nichts ändern.

Was den Key harmlos macht, sind die Regeln in der Datenbank:

* Auf die Tabelle selbst hat von außen **niemand** Zugriff (RLS an, keine Policy, keine Rechte).
* Erlaubt sind nur drei Funktionen, und jede verlangt die geheime Gruppen-ID aus dem Link.
  Ohne Link ist mit dem Key nichts zu holen — auch keine Liste aller Gruppen.
* Schreiben und Löschen gehen nur mit dem privaten Secret, das beim ersten Öffnen im
  Browser erzeugt wird und diesen nie verlässt.

**Was niemals ins Repo darf:** der `service_role` Key aus den Supabase-Einstellungen. Der
hebelt alle Regeln aus. In diesem Projekt wird er nirgends gebraucht.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Aufbau der Oberfläche |
| `app.js` | Gesamte Logik (Gruppe, Status, Live-Updates) |
| `styles.css` | Gestaltung, hell und dunkel |
| `config.js` | Deine Supabase-Zugangsdaten |
| `supabase/schema.sql` | Tabelle, Zugriffsregeln, Live-Updates |
| `sw.js`, `manifest.webmanifest` | Homescreen-Installation, Offline-Hülle |
