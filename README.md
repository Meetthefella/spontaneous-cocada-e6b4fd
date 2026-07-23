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


## Contact form setup and email notifications

The Contact form is registered with Netlify Forms under the name `contact` and redirects successful submissions to the branded `/thank-you.html` page.

After deployment:

1. In Netlify, open **Forms** and select **Enable form detection**.
2. Redeploy the site so Netlify scans the HTML form.
3. Go to **Configuration → Notifications → Form submission notifications**.
4. Add an email notification for `effortlessbeauty726@gmail.com`.

The destination email is configured in Netlify rather than exposed as a form action in the public HTML. Submissions also remain available in the Netlify dashboard.

## Private `/manage` editor — Treatments milestone

The first private editor is available at `/manage/`. It uses invite-only Netlify Identity and edits the Treatments collection.

### Required Netlify configuration

1. Enable **Netlify Identity** and keep registration set to **Invite only**.
2. Invite the authorised editor from the Netlify dashboard.
3. Add these environment variables under **Site configuration → Environment variables**:
   - `GITHUB_REPOSITORY`: `OWNER/REPOSITORY` (for example `yourname/beauty-business-platform`)
   - `GITHUB_BRANCH`: `main`
   - `GITHUB_CONTENT_TOKEN`: a fine-grained GitHub token with **Contents: Read and write** access to this repository only.
4. Redeploy after adding the variables.

The GitHub token is used only inside the protected Netlify Function. It is never sent to the browser.

### Editor workflow

`Edit → Preview website → Publish`

Preview is stored only in the editor's browser. Publish commits `content/treatments.json` to GitHub, which triggers the existing Netlify deployment.
