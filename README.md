# Effortless Beauty website

Static Netlify website with client-editable JSON content and a Decap CMS editor at `/admin/`.

## Project structure

- `index.html` — locked page structure
- `assets/css/` — locked styling
- `assets/js/` — content loading and website behaviour
- `assets/images/` — approved website artwork and CMS uploads
- `content/` — client-editable text, treatments, prices, hours and policies
- `admin/` — Decap CMS editor configuration

## Deploying

1. Push this folder to the repository's `main` branch.
2. Connect the GitHub repository to Netlify.
3. Keep Netlify's publish directory as `.`.
4. In Netlify, enable Identity.
5. Set Identity registration to **Invite only**.
6. Enable **Git Gateway**.
7. Invite the client's email address as an Identity user.
8. Open `https://YOUR-SITE.netlify.app/admin/` and log in.

The CMS uses an editorial workflow: edits become drafts first and can be previewed before publication.

## Safe editing boundary

The CMS edits content files only. Page layout, CSS, JavaScript and brand artwork are not exposed in the editor.


## Contact form email notifications

The Contact form is registered with Netlify Forms under the name `contact`. After the first deployment, configure an email notification in Netlify:

1. Open the site in Netlify.
2. Go to **Forms** and select the `contact` form.
3. Open **Form notifications** / **Notifications**.
4. Add an email notification for `effortlessbeauty726@gmail.com`.

The destination email is configured in Netlify rather than exposed as a form action in the public HTML.
