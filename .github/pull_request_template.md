## What this changes

<!-- One or two lines. -->

## If this adds or edits a manifest artifact

Every artifact must carry an `evidence` URL pointing at the provider's own
page. A fact without a source is not merged, no matter how obviously true it
looks. This is the whole trust model.

- [ ] Every artifact has an `evidence` URL on the provider's own domain
- [ ] I opened that URL and it states what the artifact claims
- [ ] Dates are the provider's published dates, not estimates
- [ ] Ran `python3 scanner/build_feed.py` so the feed matches the manifests

## If this changes matching or fixing behaviour

- [ ] `node test/run.mjs` passes
- [ ] I added the case that made me change it

Precision is the product: a scanner that is wrong three times out of four gets
muted, then deleted. New matching behaviour needs a regression test showing the
false positive it prevents.
