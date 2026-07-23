# Effortless Beauty — Golden Master v1 with Treatments Manager

The public site remains the approved Golden Master. The private `/manage/` area edits only treatment content.

## Architecture

- **GitHub:** website code, layout, styling and approved artwork
- **Netlify:** hosting, Functions, Identity and Forms
- **Netlify Blobs:** published treatment content
- **`/manage/`:** invite-only treatment editor

No GitHub write token or content-publishing environment variables are required.

## Treatments workflow

1. Log in at `/manage/` with an invited Netlify Identity account.
2. Add, edit, hide or reorder treatments.
3. Select **Preview website**.
4. Select **Publish website** only after checking the preview.
5. The function writes `treatments` to the site-wide `effortless-beauty-content` Blob store.
6. The live website reads that content immediately, with `content/treatments.json` retained as the Golden Master fallback until the first publish.

## Netlify setup

1. Deploy the repository normally.
2. Keep Netlify Identity enabled.
3. Set registration to **Invite only**.
4. Invite authorised editor accounts.
5. No Git Gateway and no GitHub personal access token are needed.
6. Netlify installs `@netlify/blobs` and `@netlify/identity` from `package.json` during deployment.

## Contact form

The Contact form is registered as `contact` and redirects to `/thank-you.html`.

1. Enable **Form detection**.
2. Redeploy.
3. Add a form-submission email notification to `effortlessbeauty726@gmail.com`.
4. Use the subject `New Enquiry - Effortless Beauty`.

## Safety boundary

The client can change treatment content only. HTML structure, CSS, JavaScript, branding and artwork are not editable through `/manage/`.

## `/manage` authentication milestone

The private `/manage/` route currently contains authentication only:

- invited-user password creation through Netlify Identity
- sign in
- password recovery
- authentication success screen
- sign out

Default Netlify invitation and recovery links may land on the site root. The homepage immediately forwards recognised Identity tokens to `/manage/` while preserving the secure URL fragment.

Registration must remain **Invite only** in Netlify. No editing dashboard or content tools are included in this milestone.
