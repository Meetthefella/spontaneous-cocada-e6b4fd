Effortless Beauty — Editable Content Foundation

This version separates client-editable website content from the locked page design.

Editable files:
- content/site.json
- content/homepage.json
- content/treatments.json
- content/aftercare.json
- content/booking.json
- content/contact.json
- content/privacy.json

The website reads these files automatically. Layout, colours, artwork, responsive styling and navigation remain controlled by index.html and style.css.

Current client-editable examples:
- Treatment names, descriptions, prices and active/hidden state
- Homepage wording and feature text
- Aftercare stage wording
- Booking opening days and appointment times
- Contact details and opening hours
- Privacy and policy copy

Deployment:
1. Commit all files to the Git repository.
2. Connect the repository to Netlify, or deploy the folder manually.
3. Netlify publish directory remains the repository root.

Next phase:
Add a Decap CMS /admin interface so the client edits friendly forms rather than JSON files.
