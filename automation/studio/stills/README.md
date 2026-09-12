# Case stills

One folder per case, holding the photographs a post is allowed to use, and a
`sources.json` recording where each came from and under what rights. Same shape
as `../footage/`, for the same reason: a post that puts a real photograph of a
real person in front of an audience has to be able to say where it got it.

    stills/<case-slug>/sources.json
    stills/<case-slug>/<file>.jpg

`sources.json`:

    { "stills": [ { "file": "four-victims.jpg",
                    "credit": "Instagram / @kayleegoncalves",
                    "rights": "family-released via broadcast",
                    "note": "What it shows, and anything a viewer should know." } ] }

`credit` is rendered on the card by the `quote` slide. Fill it in every time: a
centre crop usually removes a broadcaster's burned-in credit, so the card has to
carry it instead. `rights` is for the person deciding whether to post, not for
the render: "agency" and "public record" are the safe lane, anything family or
outlet owned needs a judgement call before it goes out.
