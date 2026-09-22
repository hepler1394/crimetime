# Supabase Auth email templates

These are the bodies pasted into Supabase Dashboard, Authentication, Emails. They are kept
here because a template that only exists in a dashboard is one accidental click from being
the default again, and nobody would notice until a member could not sign in.

`signin-code.html` is used for **both** of the templates that a six-digit sign-in can land
in, because a member cannot tell which one they got and should not have to:

- **Magic Link** - an address that already has an auth user.
- **Confirm signup** - an address signing in for the first time.

Subject for both: `Your CrimeTimeSnacks sign-in code`

The code is `{{ .Token }}`. Supabase's stock templates carry `{{ .ConfirmationURL }}` and no
token at all, which is why the first live test of the email path arrived as a link that the
six-digit form had no way to accept.

Verify a change by signing in at `/signin` with an address and reading what actually
arrives - the dashboard preview does not render the token.
