---
name: apple-podcasts-fetch
description: >-
  Use when the user provides a podcasts.apple.com URL or asks to download, fetch, or
  extract an Apple Podcasts episode audio URL. Resolves episodes through the iTunes
  Lookup API and the podcast RSS enclosure without scraping the Apple web page.
---

# Apple Podcasts Episode Audio Fetch

Resolve a direct episode audio URL from an Apple Podcasts episode link. Apple’s page is
not the source of the media URL: use the iTunes API to identify the show and episode,
then use the show RSS feed to resolve its enclosure.

## OMP network rules

Use OMP-provided network capabilities only. Prefer `read` on the HTTPS iTunes API URLs
for JSON responses. For RSS/XML, use OMP `browser` (`browser.open`, then `tab.run`/`fetch`
and read the response text) so XML is preserved; `read` is acceptable when it returns
unmodified XML. Do not use Claude-only WebFetch metadata, Claude tool names, `curl`, or
shell scraping. Encode query values with URL APIs rather than string concatenation.

When a request fails, record the URL/stage and HTTP status (if available), then follow
the failure flow below. Never fabricate an audio URL.

## 1. Parse and validate the Apple URL

Accept an HTTPS URL whose host is `podcasts.apple.com` (optionally a region subdomain
is represented in the path). The usual form is:

```
https://podcasts.apple.com/{region}/podcast/{slug}/id{show_id}?i={track_id}
```

Use a URL parser, not a loose text split:

- Find the `/id<digits>` path segment and capture the digits as `show_id`.
- Read the `i` query parameter as `track_id`; require a non-empty numeric value.
- Preserve IDs as strings while comparing, so no precision is lost.

If the host, show ID, or episode `i` parameter is absent, stop and tell the user that
an episode-specific Apple Podcasts URL containing `?i=<track_id>` is required. Do not
silently treat a show URL as an episode. You may offer to resolve a recent episode only
if the user explicitly asks for episode selection.

## 2. Look up the show RSS feed

Request:

```
https://itunes.apple.com/lookup?id={show_id}
```

Parse JSON and require a successful response with a non-empty `results` array and a
string `results[0].feedUrl`. Keep `collectionName` for display when present. If the
request fails, JSON is invalid, the result is empty, or `feedUrl` is missing, report that
the iTunes show lookup could not identify an RSS feed and stop; do not attempt a guessed
feed URL.

## 3. Look up the episode GUID (and try the shortcut)

Request:

```
https://itunes.apple.com/lookup?id={show_id}&entity=podcastEpisode&limit=200
```

Find the result whose `trackId`, converted to a string, equals `track_id`. Do not use
array position: result 0 is commonly show metadata. Require a non-empty `episodeGuid`.
Keep `trackName`, `releaseDate`, and `episodeUrl` when present for the final response.

If there is no matching episode, explain that iTunes did not return this episode (the
API is limited and older episodes may be absent), and ask for a corrected URL or another
way to identify the episode. Do not claim that the episode does not exist globally.

If the matching result has an `episodeUrl`, it is a shortcut candidate. Validate it with
an OMP HTTP request and accept it only when it is an absolute HTTP(S) URL and the request
is successful (2xx/3xx, or another clearly successful media response). If it is missing,
malformed, blocked, or fails, continue to RSS; do not return a merely plausible URL.

If the episode lookup request fails or its JSON is invalid, report that episode lookup
failed and stop unless a valid shortcut result was already obtained (normally it will
not be).

## 4. Resolve the RSS enclosure by GUID

Fetch the exact `feedUrl` from step 2 with OMP network capabilities. Parse it as XML,
not as rendered HTML. Find an `<item>` whose `<guid>` text, after trimming whitespace,
equals the iTunes `episodeGuid` after the same normalization. Account for the normal
RSS namespace/prefix forms when selecting `item`, `guid`, and `enclosure`.

From the matching item, require `<enclosure url="...">` and an absolute HTTP(S) URL.
The enclosure URL is the authoritative fallback audio URL. Also extract `<title>` and
`<pubDate>` when available. If the GUID is present but enclosure is absent or malformed,
report that the RSS item has no usable audio enclosure. If no matching GUID exists,
report that the iTunes episode and RSS feed disagree; do not select an item by title,
date, or array position.

If RSS fetch, XML parsing, or the feed request fails, report the feed URL and failure
stage/status. If a previously validated `episodeUrl` exists, return it with an explicit
note that RSS verification failed; otherwise report that no reliable audio URL could be
resolved.

## 5. Response contract

On success, return the audio URL prominently and include the episode title/show title
when known, the source (`iTunes episodeUrl` or `RSS enclosure`), and the episode GUID.
Mention that the URL may expire or be protected by the publisher. Do not download the
media unless the user asks.

On any failure, state exactly which stage failed and the actionable next step:

- invalid/non-episode Apple URL → request a URL containing `?i=`;
- show lookup/RSS URL failure → retry later or provide a different Apple URL;
- episode absent from iTunes results → ask for corrected URL or episode selection;
- RSS unavailable/invalid or GUID/enclosure mismatch → return a validated iTunes
  shortcut only, otherwise say no reliable audio URL was found.

Never hide a failed source behind a guessed URL, Apple page scraping, title-only match,
or fabricated fallback.
