# EduGrade Login/Register System

Dies ist ein einfaches Login/Register-System mit PHP und SQLite.

## Voraussetzungen

- PHP 7.0 oder höher
- SQLite-Erweiterung für PHP (normalerweise standardmäßig aktiviert)

## Installation

1. **Datenbank einrichten:**
   Führen Sie das Setup-Skript aus, um die SQLite-Datenbank zu erstellen:
   ```bash
   php setup_database.php
   ```
   
   Dies erstellt eine `users.db`-Datei im selben Verzeichnis.

2. **Webserver konfigurieren:**
   - Stellen Sie sicher, dass Ihr Webserver auf das Verzeichnis zeigt, in dem sich diese Dateien befinden.
   - Die Hauptdatei ist `login_register.php`.

## Dateien

- `login_register.php` - Hauptseite mit Login/Register-Formularen
- `dashboard.php` - Dashboard-Seite nach erfolgreicher Anmeldung
- `logout.php` - Logout-Skript
- `setup_database.php` - Skript zum Erstellen der SQLite-Datenbank
- `users.db` - SQLite-Datenbankdatei (wird automatisch erstellt)

## Sicherheit

- Passwörter werden mit `password_hash()` und `PASSWORD_BCRYPT` gehasht
- SQLite-Datenbank wird lokal gespeichert
- Session-basierte Authentifizierung

## Verwendung

1. Rufen Sie `login_register.php` in Ihrem Browser auf
2. Registrieren Sie einen neuen Benutzer oder loggen Sie sich ein
3. Nach erfolgreicher Anmeldung werden Sie zum Dashboard weitergeleitet
4. Klicken Sie auf "Logout", um sich abzumelden

## Hinweise

- Stellen Sie sicher, dass das Verzeichnis, in dem sich die `users.db`-Datei befindet, beschreibbar ist
- Für Produktionsumgebungen sollten Sie zusätzliche Sicherheitsmaßnahmen ergreifen
- Die SQLite-Datenbank ist für lokale Entwicklungszwecke geeignet