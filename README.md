# AgendaBb — versione con database

Agenda settimanale con autenticazione e sync cloud via Supabase.

## Come pubblicare

1. Crea un nuovo repository GitHub (es. `agendabb-db`)
2. Carica tutti i file di questa cartella
3. Su Vercel → "Add New Project" → collega il nuovo repo → Deploy

## File
- `index.html` — UI + stili
- `app.js` — logica principale
- `supabase.js` — client Supabase (contiene URL e chiave pubblica)
- `manifest.json` — PWA
- `icon-192.png` / `icon-512.png` — icone

## Funzionalità
- Login / Registrazione con email
- Dati sincronizzati nel cloud (Supabase)
- Cache locale per uso offline
- Export / Import JSON come backup
- Pallino colorato in alto: grigio=offline, giallo=sync, verde=ok, rosso=errore
