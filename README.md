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


## Authentication testing

Netlify invitation and password-recovery links may land on the site root with a URL fragment. The homepage forwards those tokens to `/manage/`, and the manager keeps the token intact until Netlify Identity completes the password flow.

The current patch-test rule shown on the public site is a minimum of **48 hours** before Microblading for new clients.

## Treatments Checkpoint 3.3 — Draft persistence

The Treatments editor now protects a separate local draft for every treatment.

- Changes autosave on the current device while typing.
- Drafts survive refresh, browser close, phone lock and reopening the manager.
- Reopening a treatment with a draft offers **Continue editing**, **Discard draft**, or **Not now**.
- Treatment lists show the saved-draft age.
- Preview uses the current draft and never alters the public website.
- Leaving the editor offers to keep or discard the saved work.
- The Aftercare link field has been removed until the Aftercare milestone defines whether treatment-specific linking is needed.
- Publishing and Netlify Blobs remain deliberately out of scope for this checkpoint.

### Checkpoint 3.3 leave-editor persistence fix

The treatment summary and treatment list now read the latest locally saved unpublished record. Leaving the editor therefore shows the saved changes immediately instead of temporarily displaying the original baseline values.

## Checkpoint 3.4 — Treatments publishing

The Treatments editor now publishes through the authenticated `/.netlify/functions/treatments` endpoint into the site-wide `effortless-beauty-content` Netlify Blob store.

- `GET` is public and supplies the live Treatments content.
- `PUT` requires a valid Netlify Identity session and validates the entire Treatments document before writing.
- The public site falls back to `content/treatments.json` until the first successful publish or whenever the Blob endpoint is unavailable.
- Local unpublished changes remain protected until publishing succeeds.
- Legacy Decap CMS `/admin` files and the old GitHub-writing function have been removed.

## Checkpoint 3.5 — Treatments polish and security

- Public treatment cards separate price and treatment time with a centred dot (`Price · Duration`).
- The Website Manager locks after 15 minutes without interaction.
- Current treatment changes are autosaved before the lock appears.
- **Continue securely** returns the user to the branded sign-in form.
- Successful re-authentication restores the same manager view, treatment, and editor step.
- Publish checks the Identity session before sending content to the protected Netlify Function.
- Netlify Identity remains responsible for full session expiry.
- Legacy `/admin` and GitHub-writing publication artefacts have been removed.


## Checkpoint 4.1 — Homepage browser

- The Homepage dashboard card is now active.
- The manager provides four read-only Homepage sections: Hero, Introduction, Why Choose Us, and Feature Cards.
- Each section opens a clear summary of the current approved homepage content.
- Navigation follows the same mobile-first, one-thing-at-a-time pattern as Treatments.
- Editing, drafts, preview, publishing, Blobs, and public-site changes remain outside this checkpoint.
- Existing authentication, inactivity locking, Treatments editing, preview, publishing, and security behaviour are preserved.


## Checkpoint 4.2 — Homepage editor engine

- Each Homepage section now opens a one-section-at-a-time editor.
- Hero, Introduction, Why Choose Us and all three Feature Cards can be updated in a private working session.
- Required fields are validated before Done or Preview.
- A private preview clearly states that the live website has not changed.
- Checkpoint 4.2 originally kept changes in the open session; Checkpoint 4.3 now supersedes this with authenticated online draft saving. Live publishing remains reserved for Checkpoint 4.4.
- Treatments editing, publishing, authentication and inactivity-lock restoration remain unchanged.

## Website Manager — Homepage Checkpoint 4.3

Homepage editing now uses an authenticated Netlify Blobs draft:

- Every Homepage edit autosaves securely online.
- The same unpublished draft is restored after signing in on another device.
- The inactivity lock saves pending Homepage changes before locking.
- Discarding one section restores its approved content and updates the online draft.
- Preview remains private.
- The public homepage and `content/homepage.json` are unchanged; live Homepage publishing remains Checkpoint 4.4.

The draft endpoint is `/.netlify/functions/homepage-draft`. Both reading and writing require an authenticated Netlify Identity user.
